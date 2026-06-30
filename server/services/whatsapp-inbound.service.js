const { all, get } = require('./db.service');
const { normalizeIndianPhone } = require('./whatsapp.service');
const { createCommunicationEvent } = require('./communication-timeline.service');
const { markOutboundReplied, providerTime } = require('./whatsapp-status.service');

function inboundText(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || message.button?.payload || '';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  return `[${message.type || 'unknown'} message]`;
}

async function matchOutbound({ contextMessageId, senderPhone }) {
  if (contextMessageId) {
    const exact = await get(`SELECT * FROM whatsapp_template_messages WHERE provider_message_id = ?`, [contextMessageId]);
    if (exact) return exact;
  }
  const phone = normalizeIndianPhone(senderPhone);
  if (!phone) return null;
  return get(
    `SELECT * FROM whatsapp_template_messages
     WHERE recipient_phone = ? AND status IN ('SENT', 'DELIVERED', 'READ')
       AND COALESCE(sent_at, created_at) >= ?
     ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 1`,
    [phone, new Date(Date.now() - 7 * 86400000).toISOString()]
  );
}

async function resolveInboundIdentity({ senderPhone, outbound }) {
  if (outbound) return {
    tenantId: outbound.tenant_id,
    studentId: outbound.student_id,
    guardianId: outbound.guardian_id,
    leadId: outbound.lead_id,
    admissionId: outbound.admission_id,
  };
  const phone = normalizeIndianPhone(senderPhone);
  const guardians = await all(`SELECT * FROM student_guardians`);
  const guardian = guardians.find((row) => normalizeIndianPhone(row.phone) === phone || normalizeIndianPhone(row.alternate_phone) === phone);
  if (guardian) return { tenantId: guardian.tenant_id, studentId: guardian.student_id, guardianId: guardian.id };
  const students = await all(`SELECT * FROM students WHERE parent_phone IS NOT NULL`);
  const student = students.find((row) => normalizeIndianPhone(row.parent_phone) === phone);
  if (student) return { tenantId: student.tenant_id, studentId: student.id };
  return {};
}

async function processInboundMessage({ message, metadata }) {
  const senderPhone = message.from;
  const contextMessageId = message.context?.id || null;
  const outbound = await matchOutbound({ contextMessageId, senderPhone });
  const identity = await resolveInboundIdentity({ senderPhone, outbound });
  const repliedAt = providerTime(message.timestamp);
  if (!identity.tenantId && !outbound?.tenant_id) {
    return { communication: null, outbound: null, identity: {}, unmatched: true };
  }
  const communication = await createCommunicationEvent({
    tenantId: identity.tenantId || outbound.tenant_id,
    studentId: identity.studentId,
    guardianId: identity.guardianId,
    leadId: identity.leadId,
    admissionId: identity.admissionId,
    direction: 'INBOUND',
    eventType: 'PARENT_REPLY',
    subject: 'WhatsApp reply',
    message: inboundText(message),
    status: 'RECEIVED',
    provider: 'WHATSAPP_CLOUD_API',
    providerMessageId: message.id,
    sentAt: repliedAt,
    metadata: {
      inboundType: message.type,
      contextMessageId,
      senderPhone,
      providerPhoneNumberId: metadata?.phone_number_id,
      matchedOutboundMessageId: outbound?.id || null,
      unmatched: !outbound && !identity.tenantId,
    },
  });
  if (outbound) await markOutboundReplied({ message: outbound, repliedAt, payload: message });
  return { communication, outbound, identity };
}

module.exports = { processInboundMessage };
