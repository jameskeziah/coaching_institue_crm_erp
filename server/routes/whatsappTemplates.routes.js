const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');
const { submitTemplate, getTemplateStatus } = require('../services/whatsapp-provider.service');
const { reprocessWebhookEvent } = require('../services/whatsapp-webhook.service');
const {
  createTemplate,
  getTemplate,
  listTemplates,
  previewOfficialTemplate,
  sendTemplateMessage,
  serialize,
  updateTemplate,
} = require('../services/whatsapp-template.service');

const router = express.Router();
const VIEW_ROLES = ROLE_GROUPS.STAFF;
const SEND_ROLES = [ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.COUNSELLOR, ROLES.TEACHER];

function tenantId(req) { return req.user.tenantId || req.user.tenant_id; }
function camel(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}

router.get('/whatsapp/templates/official', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  res.json({ data: await listTemplates(tenantId(req)) });
});

router.post('/whatsapp/templates/official', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  try {
    const created = await createTemplate({ tenantId: tenantId(req), userId: req.user.id, payload: req.body });
    await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_CREATED', entityType: 'whatsapp_official_template', entityId: created.id, newValues: serialize(created) });
    res.status(201).json({ data: serialize(created) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/whatsapp/templates/official/sync', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const templates = await all(`SELECT * FROM whatsapp_official_templates WHERE tenant_id = ? AND status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED')`, [String(tenantId(req))]);
  const results = [];
  for (const template of templates) {
    const provider = await getTemplateStatus({ template });
    if (provider.status && provider.status !== template.status) {
      await run(
        `UPDATE whatsapp_official_templates SET status = ?, rejection_reason = ?,
         last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [provider.status, provider.rejectionReason || null, template.id]
      );
    } else {
      await run(`UPDATE whatsapp_official_templates SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?`, [template.id]);
    }
    results.push({ id: template.id, templateKey: template.template_key, status: provider.status });
  }
  await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_SYNCED', entityType: 'whatsapp_official_template', entityId: 'bulk-sync', newValues: { count: results.length } });
  res.json({ data: results });
});

router.get('/whatsapp/templates/official/:id', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const template = await getTemplate(tenantId(req), req.params.id);
  if (!template) return res.status(404).json({ error: 'Official template not found' });
  const sends = await all(`SELECT * FROM whatsapp_template_messages WHERE tenant_id = ? AND template_id = ? ORDER BY created_at DESC LIMIT 100`, [String(tenantId(req)), template.id]);
  res.json({ data: { ...serialize(template), sends: sends.map(camel) } });
});

router.patch('/whatsapp/templates/official/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  try {
    const old = await getTemplate(tenantId(req), req.params.id);
    const updated = await updateTemplate({ tenantId: tenantId(req), id: req.params.id, payload: req.body });
    await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_UPDATED', entityType: 'whatsapp_official_template', entityId: updated.id, oldValues: serialize(old), newValues: serialize(updated) });
    res.json({ data: serialize(updated) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/whatsapp/templates/official/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const template = await getTemplate(tenantId(req), req.params.id);
  if (!template) return res.status(404).json({ error: 'Official template not found' });
  await run(`UPDATE whatsapp_official_templates SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [template.id]);
  await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_ARCHIVED', entityType: 'whatsapp_official_template', entityId: template.id, oldValues: serialize(template), newValues: { status: 'ARCHIVED' } });
  res.json({ ok: true });
});

router.post('/whatsapp/templates/official/:id/submit', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const template = await getTemplate(tenantId(req), req.params.id);
  if (!template) return res.status(404).json({ error: 'Official template not found' });
  if (!template.provider_template_name) return res.status(400).json({ error: 'providerTemplateName is required before submit' });
  const provider = await submitTemplate({ template });
  if (!provider.ok) return res.status(400).json({ error: provider.errorMessage || 'Provider submit failed' });
  await run(
    `UPDATE whatsapp_official_templates SET status = 'SUBMITTED', provider_template_id = COALESCE(?, provider_template_id),
     last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [provider.providerTemplateId || null, template.id]
  );
  await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_SUBMITTED', entityType: 'whatsapp_official_template', entityId: template.id, oldValues: { status: template.status }, newValues: { status: 'SUBMITTED' } });
  res.json({ data: serialize(await getTemplate(tenantId(req), template.id)), provider });
});

router.get('/whatsapp/templates/official/:id/provider-status', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const template = await getTemplate(tenantId(req), req.params.id);
  if (!template) return res.status(404).json({ error: 'Official template not found' });
  res.json({ data: await getTemplateStatus({ template }) });
});

router.post('/whatsapp/templates/preview', authMiddleware, requireTenant, requireAnyRole(SEND_ROLES), async (req, res) => {
  try { res.json({ data: await previewOfficialTemplate({ tenantId: tenantId(req), request: req.body }) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/whatsapp/templates/send', authMiddleware, requireTenant, requireAnyRole(SEND_ROLES), async (req, res) => {
  try {
    const result = await sendTemplateMessage({ tenantId: tenantId(req), branchId: req.body.branchId || null, userId: req.user.id, request: req.body });
    res.status(201).json({ data: result });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/whatsapp/templates/send-bulk', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  try {
    const settings = await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId(req))]);
    if (!settings || Number(settings.allow_bulk_send) !== 1) throw new Error('Bulk template sending is disabled');
    if (Number(settings.require_manual_approval_before_bulk_send) === 1 && req.body.approved !== true) throw new Error('Bulk send requires explicit manual approval');
    const requests = Array.isArray(req.body.requests) ? req.body.requests : [];
    const results = [];
    for (const request of requests) {
      try { results.push({ ok: true, data: await sendTemplateMessage({ tenantId: tenantId(req), branchId: request.branchId || null, userId: req.user.id, request }) }); }
      catch (error) { results.push({ ok: false, error: error.message, request }); }
    }
    res.json({ data: results });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/whatsapp/template-settings', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  res.json({ data: camel(await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId(req))])) });
});

router.put('/whatsapp/template-settings', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const old = await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId(req))]);
  const bool = (key, fallback) => req.body[key] === undefined ? Number(fallback) : req.body[key] ? 1 : 0;
  await run(
    `UPDATE whatsapp_template_settings SET attendance_absent_enabled = ?, fee_due_enabled = ?,
     fee_overdue_enabled = ?, payment_receipt_enabled = ?, test_result_enabled = ?,
     weekly_report_enabled = ?, admission_followup_enabled = ?, default_language_code = ?,
     send_to_primary_guardian_only = ?, allow_bulk_send = ?,
     require_manual_approval_before_bulk_send = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ?`,
    [bool('attendanceAbsentEnabled', old.attendance_absent_enabled), bool('feeDueEnabled', old.fee_due_enabled),
      bool('feeOverdueEnabled', old.fee_overdue_enabled), bool('paymentReceiptEnabled', old.payment_receipt_enabled),
      bool('testResultEnabled', old.test_result_enabled), bool('weeklyReportEnabled', old.weekly_report_enabled),
      bool('admissionFollowupEnabled', old.admission_followup_enabled), req.body.defaultLanguageCode || old.default_language_code,
      bool('sendToPrimaryGuardianOnly', old.send_to_primary_guardian_only), bool('allowBulkSend', old.allow_bulk_send),
      bool('requireManualApprovalBeforeBulkSend', old.require_manual_approval_before_bulk_send), String(tenantId(req))]
  );
  const updated = await get(`SELECT * FROM whatsapp_template_settings WHERE tenant_id = ?`, [String(tenantId(req))]);
  await createAuditLog({ tenantId: tenantId(req), actorUserId: req.user.id, action: 'WHATSAPP_TEMPLATE_SETTINGS_UPDATED', entityType: 'whatsapp_template_settings', entityId: updated.id, oldValues: camel(old), newValues: camel(updated) });
  res.json({ data: camel(updated) });
});

router.get('/whatsapp/messages', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const conditions = ['m.tenant_id = ?'];
  const params = [String(tenantId(req))];
  for (const [key, column] of [['templateKey', 'm.template_key'], ['status', 'm.status'], ['branchId', 'm.branch_id']]) {
    if (req.query[key]) { conditions.push(`${column} = ?`); params.push(req.query[key]); }
  }
  if (req.query.dateFrom) { conditions.push('m.created_at >= ?'); params.push(req.query.dateFrom); }
  if (req.query.dateTo) { conditions.push('m.created_at <= ?'); params.push(`${req.query.dateTo}T23:59:59.999Z`); }
  if (req.query.failedOnly === 'true') conditions.push(`m.status = 'FAILED'`);
  if (req.query.repliedOnly === 'true') conditions.push(`m.status = 'REPLIED'`);
  if (req.query.unreadUnreplied === 'true') conditions.push(`m.status IN ('QUEUED', 'SENT', 'DELIVERED')`);
  const rows = await all(
    `SELECT m.*, COALESCE(s.display_name, s.student_name, s.name) AS student_name,
       COALESCE(a.student_name, a.name) AS lead_name
     FROM whatsapp_template_messages m
     LEFT JOIN students s ON CAST(s.id AS TEXT) = CAST(m.student_id AS TEXT)
       AND CAST(s.tenant_id AS TEXT) = CAST(m.tenant_id AS TEXT)
     LEFT JOIN admissions a ON CAST(a.id AS TEXT) = CAST(COALESCE(m.admission_id, m.lead_id) AS TEXT)
       AND CAST(a.tenant_id AS TEXT) = CAST(m.tenant_id AS TEXT)
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.created_at DESC LIMIT 500`,
    params
  );
  res.json({ data: rows.map(camel) });
});

router.get('/whatsapp/messages/:id', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const message = await get(`SELECT * FROM whatsapp_template_messages WHERE id = ? AND tenant_id = ?`, [req.params.id, String(tenantId(req))]);
  if (!message) return res.status(404).json({ error: 'WhatsApp message not found' });
  res.json({ data: camel(message) });
});

router.get('/whatsapp/messages/:id/events', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const message = await get(`SELECT * FROM whatsapp_template_messages WHERE id = ? AND tenant_id = ?`, [req.params.id, String(tenantId(req))]);
  if (!message) return res.status(404).json({ error: 'WhatsApp message not found' });
  const events = await all(
    `SELECT * FROM whatsapp_webhook_events
     WHERE provider_message_id = ? OR payload LIKE ?
     ORDER BY created_at ASC`,
    [message.provider_message_id, `%${message.provider_message_id || message.id}%`]
  );
  res.json({ data: events.map(camel) });
});

router.get('/students/:id/whatsapp-timeline', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const student = await get(`SELECT id FROM students WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rows = await all(
    `SELECT * FROM communication_events WHERE tenant_id = ? AND student_id = ?
       AND channel = 'WHATSAPP' ORDER BY COALESCE(sent_at, created_at) DESC`,
    [String(tenantId(req)), String(req.params.id)]
  );
  res.json({ data: rows.map(camel) });
});

router.get('/leads/:id/whatsapp-timeline', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const lead = await get(`SELECT id FROM admissions WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const rows = await all(
    `SELECT * FROM communication_events WHERE tenant_id = ?
       AND (lead_id = ? OR admission_id = ?) AND channel = 'WHATSAPP'
       ORDER BY COALESCE(sent_at, created_at) DESC`,
    [String(tenantId(req)), String(req.params.id), String(req.params.id)]
  );
  res.json({ data: rows.map(camel) });
});

router.get('/whatsapp/webhook-events', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const conditions = ['(tenant_id = ? OR tenant_id IS NULL)'];
  const params = [String(tenantId(req))];
  if (req.query.processingStatus) { conditions.push('processing_status = ?'); params.push(req.query.processingStatus); }
  if (req.query.eventType) { conditions.push('event_type = ?'); params.push(req.query.eventType); }
  const rows = await all(`SELECT * FROM whatsapp_webhook_events WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`, params);
  res.json({ data: rows.map(camel) });
});

router.post('/whatsapp/webhook-events/:id/reprocess', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const event = await get(`SELECT * FROM whatsapp_webhook_events WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`, [req.params.id, String(tenantId(req))]);
  if (!event) return res.status(404).json({ error: 'Webhook event not found' });
  try {
    const result = await reprocessWebhookEvent(event);
    res.json({ data: result });
  } catch (error) {
    await run(`UPDATE whatsapp_webhook_events SET processing_status = 'FAILED', error_message = ? WHERE id = ?`, [error.message, event.id]);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
