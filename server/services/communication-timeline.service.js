const crypto = require('crypto');
const { run, get } = require('./db.service');

async function createCommunicationEvent({
  tenantId,
  studentId = null,
  guardianId = null,
  leadId = null,
  admissionId = null,
  branchId = null,
  channel = 'WHATSAPP',
  direction = 'OUTBOUND',
  eventType,
  subject = null,
  message = null,
  status = 'SENT',
  provider = 'WHATSAPP_CLOUD_API',
  providerMessageId = null,
  sentByUserId = null,
  assignedToUserId = null,
  relatedEntityType = null,
  relatedEntityId = null,
  sentAt = null,
  loggedAt = null,
  errorCode = null,
  errorMessage = null,
  metadata = {},
}) {
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO communication_events
      (id, tenant_id, student_id, guardian_id, lead_id, admission_id, channel,
       direction, event_type, subject, message, status, provider,
       provider_message_id, sent_by_user_id, sent_at, metadata, branch_id,
       assigned_to_user_id, related_entity_type, related_entity_id, logged_at,
       error_code, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, String(tenantId), studentId ? String(studentId) : null, guardianId, leadId, admissionId,
      channel, direction, eventType, subject, message, status, provider,
      providerMessageId, sentByUserId, sentAt, JSON.stringify(metadata || {}), branchId,
      assignedToUserId, relatedEntityType, relatedEntityId, loggedAt || sentAt || new Date().toISOString(),
      errorCode, errorMessage]
  );
  return get(`SELECT * FROM communication_events WHERE id = ?`, [id]);
}

async function updateCommunicationByProviderMessageId(providerMessageId, update) {
  if (!providerMessageId) return;
  const ranks = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 90, REPLIED: 100 };
  const current = await get(`SELECT * FROM communication_events WHERE provider_message_id = ?`, [providerMessageId]);
  if (!current) return;
  const currentRank = ranks[current.status] || 0;
  const nextRank = update.statusRank ?? ranks[update.status] ?? currentRank;
  const status = nextRank >= currentRank ? update.status : current.status;
  await run(
    `UPDATE communication_events SET status = ?, sent_at = COALESCE(sent_at, ?),
     delivered_at = COALESCE(delivered_at, ?), read_at = COALESCE(read_at, ?),
     failed_at = COALESCE(failed_at, ?), replied_at = COALESCE(replied_at, ?),
     error_code = COALESCE(?, error_code), error_message = COALESCE(?, error_message),
     updated_at = CURRENT_TIMESTAMP WHERE provider_message_id = ?`,
    [status, update.sentAt || null, update.deliveredAt || null, update.readAt || null,
      update.failedAt || null, update.repliedAt || null, update.errorCode || null,
      update.errorMessage || null, providerMessageId]
  );
}

module.exports = {
  createCommunicationEvent,
  updateCommunicationByProviderMessageId,
};
