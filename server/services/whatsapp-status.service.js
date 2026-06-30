const { run, get } = require('./db.service');
const { updateCommunicationByProviderMessageId } = require('./communication-timeline.service');
const { createAuditLog } = require('./auditLog.service');

const STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 90,
  REPLIED: 100,
};

function normalizeWhatsAppStatus(status) {
  const normalized = String(status || '').toUpperCase();
  return Object.prototype.hasOwnProperty.call(STATUS_RANK, normalized) ? normalized : null;
}

function providerTime(timestamp) {
  if (!timestamp) return new Date().toISOString();
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) return new Date(numeric * 1000).toISOString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function updateOutboundStatus({ providerMessageId, providerStatus, timestamp, payload }) {
  const status = normalizeWhatsAppStatus(providerStatus);
  if (!status || status === 'REPLIED') return { matched: false, ignored: true };
  const message = await get(`SELECT * FROM whatsapp_template_messages WHERE provider_message_id = ?`, [providerMessageId]);
  if (!message) return { matched: false, ignored: true };
  const currentRank = Number(message.status_rank || STATUS_RANK[message.status] || 0);
  const nextRank = STATUS_RANK[status];
  const eventAt = providerTime(timestamp);
  const errors = payload.errors || [];
  const errorCode = errors[0]?.code ? String(errors[0].code) : null;
  const errorMessage = errors[0]?.title || errors[0]?.message || errors[0]?.error_data?.details || null;
  const shouldAdvance = nextRank >= currentRank;
  const effectiveStatus = shouldAdvance ? status : message.status;
  const effectiveRank = shouldAdvance ? nextRank : currentRank;
  await run(
    `UPDATE whatsapp_template_messages SET status = ?, status_rank = ?,
     sent_at = CASE WHEN ? = 'SENT' THEN COALESCE(sent_at, ?) ELSE sent_at END,
     delivered_at = CASE WHEN ? IN ('DELIVERED', 'READ') THEN COALESCE(delivered_at, ?) ELSE delivered_at END,
     read_at = CASE WHEN ? = 'READ' THEN COALESCE(read_at, ?) ELSE read_at END,
     failed_at = CASE WHEN ? = 'FAILED' THEN COALESCE(failed_at, ?) ELSE failed_at END,
     error_code = CASE WHEN ? = 'FAILED' THEN ? ELSE error_code END,
     error_message = CASE WHEN ? = 'FAILED' THEN ? ELSE error_message END,
     provider_error_details = CASE WHEN ? = 'FAILED' THEN ? ELSE provider_error_details END,
     last_webhook_payload = ?, last_status_at = ?,
     webhook_event_count = COALESCE(webhook_event_count, 0) + 1,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [effectiveStatus, effectiveRank, status, eventAt, status, eventAt, status, eventAt,
      status, eventAt, status, errorCode, status, errorMessage, status,
      JSON.stringify(errors), JSON.stringify(payload), eventAt, message.id]
  );
  await updateCommunicationByProviderMessageId(providerMessageId, {
    status: effectiveStatus,
    statusRank: effectiveRank,
    sentAt: status === 'SENT' ? eventAt : null,
    deliveredAt: ['DELIVERED', 'READ'].includes(status) ? eventAt : null,
    readAt: status === 'READ' ? eventAt : null,
    failedAt: status === 'FAILED' ? eventAt : null,
    errorCode,
    errorMessage,
  });
  await createAuditLog({
    tenantId: message.tenant_id,
    branchId: message.branch_id,
    actorUserId: null,
    action: `WHATSAPP_STATUS_${status}`,
    entityType: 'whatsapp_template_message',
    entityId: message.id,
    oldValues: { status: message.status, statusRank: currentRank },
    newValues: { status: effectiveStatus, statusRank: effectiveRank, providerMessageId },
  });
  return { matched: true, message, status: effectiveStatus };
}

async function markOutboundReplied({ message, repliedAt, payload }) {
  if (!message) return;
  await run(
    `UPDATE whatsapp_template_messages SET status = 'REPLIED', status_rank = 100,
     replied_at = COALESCE(replied_at, ?), last_webhook_payload = ?,
     last_status_at = ?, webhook_event_count = COALESCE(webhook_event_count, 0) + 1,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [repliedAt, JSON.stringify(payload), repliedAt, message.id]
  );
  await updateCommunicationByProviderMessageId(message.provider_message_id, {
    status: 'REPLIED',
    statusRank: 100,
    repliedAt,
  });
  await createAuditLog({
    tenantId: message.tenant_id,
    branchId: message.branch_id,
    actorUserId: null,
    action: 'WHATSAPP_PARENT_REPLIED',
    entityType: 'whatsapp_template_message',
    entityId: message.id,
    oldValues: { status: message.status },
    newValues: { status: 'REPLIED', repliedAt },
  });
}

module.exports = {
  STATUS_RANK,
  markOutboundReplied,
  normalizeWhatsAppStatus,
  providerTime,
  updateOutboundStatus,
};
