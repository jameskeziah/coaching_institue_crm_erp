const crypto = require('crypto');
const { run, get, all } = require('./db.service');
const { OFFICIAL_TEMPLATE_KEYS, TEMPLATE_CATEGORIES, TEMPLATE_STATUSES } = require('../config/whatsapp-template.constants');
const { resolveTemplateVariables } = require('./template-variable-resolver.service');
const { sendOfficialTemplate } = require('./whatsapp-provider.service');
const { createCommunicationEvent } = require('./communication-timeline.service');
const { createAuditLog } = require('./auditLog.service');

function json(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function serialize(row) {
  if (!row) return row;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateKey: row.template_key,
    providerTemplateName: row.provider_template_name,
    providerTemplateId: row.provider_template_id,
    languageCode: row.language_code,
    category: row.category,
    status: row.status,
    headerType: row.header_type,
    headerText: row.header_text,
    bodyText: row.body_text,
    footerText: row.footer_text,
    buttonConfig: json(row.button_config, []),
    variableSchema: json(row.variable_schema, []),
    sampleValues: json(row.sample_values, {}),
    rejectionReason: row.rejection_reason,
    lastSyncedAt: row.last_synced_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function placeholderCount(body) {
  const positions = [...String(body || '').matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return positions.length ? Math.max(...positions) : 0;
}

function communicationEventType(templateKey) {
  return {
    attendance_absent: 'ATTENDANCE_ABSENT',
    fee_due: 'FEE_DUE_REMINDER',
    fee_overdue: 'FEE_OVERDUE_REMINDER',
    payment_receipt: 'PAYMENT_RECEIPT_SENT',
    test_result: 'TEST_RESULT_SENT',
    weekly_report: 'WEEKLY_REPORT_SENT',
    admission_followup: 'ADMISSION_FOLLOWUP',
  }[templateKey] || String(templateKey || 'WHATSAPP_MESSAGE').toUpperCase();
}

function validateTemplate(payload, existing = null) {
  const templateKey = String(payload.templateKey ?? existing?.template_key ?? '').toLowerCase();
  const languageCode = String(payload.languageCode ?? existing?.language_code ?? '').trim();
  const category = String(payload.category ?? existing?.category ?? '').toUpperCase();
  const bodyText = String(payload.bodyText ?? existing?.body_text ?? '').trim();
  const schema = payload.variableSchema ?? json(existing?.variable_schema, []);
  if (!OFFICIAL_TEMPLATE_KEYS.includes(templateKey)) throw new Error('Invalid official template key');
  if (!languageCode) throw new Error('languageCode is required');
  if (!TEMPLATE_CATEGORIES.includes(category)) throw new Error('Invalid template category');
  if (!bodyText) throw new Error('bodyText is required');
  if (!Array.isArray(schema)) throw new Error('variableSchema must be an array');
  if (placeholderCount(bodyText) !== schema.length) throw new Error('variableSchema must match body placeholder count');
  schema.forEach((variable, index) => {
    if (Number(variable.position) !== index + 1 || !variable.name || !variable.source) throw new Error('Variables must have sequential positions, name, and source');
  });
  return { templateKey, languageCode, category, bodyText, schema };
}

async function listTemplates(tenantId) {
  return (await all(`SELECT * FROM whatsapp_official_templates WHERE tenant_id = ? ORDER BY template_key, language_code`, [String(tenantId)])).map(serialize);
}

async function getTemplate(tenantId, idOrKey, languageCode = null) {
  const params = [String(tenantId), idOrKey, idOrKey];
  let sql = `SELECT * FROM whatsapp_official_templates WHERE tenant_id = ? AND (id = ? OR template_key = ?)`;
  if (languageCode) { sql += ' AND language_code = ?'; params.push(languageCode); }
  sql += ' ORDER BY updated_at DESC LIMIT 1';
  return get(sql, params);
}

async function createTemplate({ tenantId, userId, payload }) {
  const normalized = validateTemplate(payload);
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO whatsapp_official_templates
      (id, tenant_id, template_key, provider_template_name, provider_template_id,
       language_code, category, status, header_type, header_text, body_text,
       footer_text, button_config, variable_schema, sample_values, created_by_user_id,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'LOCAL_DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, String(tenantId), normalized.templateKey, payload.providerTemplateName || normalized.templateKey,
      payload.providerTemplateId || null, normalized.languageCode, normalized.category,
      payload.headerType || null, payload.headerText || null, normalized.bodyText,
      payload.footerText || null, JSON.stringify(payload.buttonConfig || []),
      JSON.stringify(normalized.schema), JSON.stringify(payload.sampleValues || {}), userId]
  );
  return getTemplate(tenantId, id);
}

async function updateTemplate({ tenantId, id, payload }) {
  const existing = await getTemplate(tenantId, id);
  if (!existing) throw new Error('Official template not found');
  if (existing.status === 'APPROVED') throw new Error('Approved templates cannot be edited directly');
  const normalized = validateTemplate(payload, existing);
  const status = String(payload.status || existing.status).toUpperCase();
  if (!TEMPLATE_STATUSES.includes(status)) throw new Error('Invalid template status');
  if (status === 'REJECTED' && !payload.rejectionReason && !existing.rejection_reason) throw new Error('Rejected template requires rejectionReason');
  await run(
    `UPDATE whatsapp_official_templates SET template_key = ?, provider_template_name = ?,
     provider_template_id = ?, language_code = ?, category = ?, status = ?,
     header_type = ?, header_text = ?, body_text = ?, footer_text = ?,
     button_config = ?, variable_schema = ?, sample_values = ?, rejection_reason = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [normalized.templateKey, payload.providerTemplateName ?? existing.provider_template_name,
      payload.providerTemplateId ?? existing.provider_template_id, normalized.languageCode,
      normalized.category, status, payload.headerType ?? existing.header_type,
      payload.headerText ?? existing.header_text, normalized.bodyText,
      payload.footerText ?? existing.footer_text,
      JSON.stringify(payload.buttonConfig ?? json(existing.button_config, [])),
      JSON.stringify(normalized.schema), JSON.stringify(payload.sampleValues ?? json(existing.sample_values, {})),
      payload.rejectionReason ?? existing.rejection_reason, existing.id, String(tenantId)]
  );
  return getTemplate(tenantId, existing.id);
}

async function previewOfficialTemplate({ tenantId, request }) {
  const settings = await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId)]);
  const language = request.languageCode || settings?.default_language_code || 'en';
  const template = await getTemplate(tenantId, request.templateId || request.templateKey, language);
  if (!template) throw new Error('Official template not found');
  const resolution = await resolveTemplateVariables({ tenantId, template, request });
  return { template: serialize(template), ...resolution };
}

async function sendTemplateMessage({ tenantId, branchId = null, userId, request }) {
  const preview = await previewOfficialTemplate({ tenantId, request });
  const template = preview.template;
  if (template.status !== 'APPROVED') throw new Error('Only approved official templates can be sent');
  if (preview.missing.length) throw new Error(`Missing required variables: ${preview.missing.map((item) => item.name).join(', ')}`);
  if (!preview.recipientPhone) throw new Error('Guardian or recipient phone is missing');
  const settings = await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId)]);
  const enabledColumn = `${template.templateKey}_enabled`;
  if (settings && Number(settings[enabledColumn]) !== 1) throw new Error(`${template.templateKey} is disabled for this tenant`);
  const messageId = crypto.randomUUID();
  await run(
    `INSERT INTO whatsapp_template_messages
      (id, tenant_id, branch_id, template_id, template_key, provider_template_name,
       language_code, student_id, guardian_id, lead_id, admission_id, fee_invoice_id,
       fee_installment_id, attendance_session_id, test_id, recipient_phone,
       resolved_variables, rendered_preview, status, sent_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [messageId, String(tenantId), branchId, template.id, template.templateKey,
      template.providerTemplateName, template.languageCode, request.studentId || null,
      preview.guardianId, request.leadId || null, request.admissionId || null,
      request.feeInvoiceId || null, request.feeInstallmentId || null,
      request.attendanceSessionId || null, request.testId || request.testResultId || null,
      preview.recipientPhone, JSON.stringify(preview.resolved), preview.preview, userId]
  );
  const provider = await sendOfficialTemplate({
    to: preview.recipientPhone,
    templateName: template.providerTemplateName,
    languageCode: template.languageCode,
    variables: preview.resolved.map((item) => item.value),
  });
  const now = new Date().toISOString();
  await run(
    `UPDATE whatsapp_template_messages SET provider_message_id = ?, status = ?,
     status_rank = ?, last_status_at = ?,
     error_code = ?, error_message = ?, sent_at = ?, failed_at = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [provider.providerMessageId || null, provider.ok ? 'SENT' : 'FAILED',
      provider.ok ? 1 : 90, now,
      provider.errorCode || null, provider.errorMessage || null,
      provider.ok ? now : null, provider.ok ? null : now, messageId]
  );
  const communication = await createCommunicationEvent({
    tenantId,
    branchId,
    studentId: request.studentId,
    guardianId: preview.guardianId,
    leadId: request.leadId,
    admissionId: request.admissionId,
    eventType: communicationEventType(template.templateKey),
    subject: template.templateKey,
    message: preview.preview,
    status: provider.ok ? 'SENT' : 'FAILED',
    provider: provider.provider || 'WHATSAPP_CLOUD_API',
    providerMessageId: provider.providerMessageId,
    sentByUserId: userId,
    sentAt: provider.ok ? now : null,
    loggedAt: now,
    errorCode: provider.errorCode || null,
    errorMessage: provider.errorMessage || null,
    relatedEntityType: request.attendanceSessionId ? 'ATTENDANCE_SESSION'
      : request.feeInstallmentId ? 'FEE_INSTALLMENT'
        : request.feeInvoiceId ? 'FEE_INVOICE'
          : (request.testId || request.testResultId) ? 'TEST_RESULT'
            : request.admissionId ? 'ADMISSION' : null,
    relatedEntityId: request.attendanceSessionId || request.feeInstallmentId || request.feeInvoiceId
      || request.testId || request.testResultId || request.admissionId || null,
    metadata: {
      templateMessageId: messageId,
      templateKey: template.templateKey,
      attendanceSessionId: request.attendanceSessionId,
      feeInstallmentId: request.feeInstallmentId,
      testResultId: request.testResultId,
    },
  });
  await createAuditLog({
    tenantId,
    branchId,
    actorUserId: userId,
    action: provider.ok ? 'WHATSAPP_TEMPLATE_SENT' : 'WHATSAPP_TEMPLATE_FAILED',
    entityType: 'whatsapp_template_message',
    entityId: messageId,
    newValues: { templateKey: template.templateKey, status: provider.ok ? 'SENT' : 'FAILED', providerMessageId: provider.providerMessageId },
  });
  return { messageId, communicationId: communication.id, provider, preview };
}

module.exports = {
  createTemplate,
  getTemplate,
  listTemplates,
  previewOfficialTemplate,
  sendTemplateMessage,
  serialize,
  updateTemplate,
  validateTemplate,
};
