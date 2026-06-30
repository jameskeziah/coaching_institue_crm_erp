const crypto = require('crypto');
const { run, get } = require('./db.service');
const { createAuditLog } = require('./auditLog.service');
const { updateOutboundStatus } = require('./whatsapp-status.service');
const { processInboundMessage } = require('./whatsapp-inbound.service');

function eventKey(parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part || '')).join('|')).digest('hex');
}

async function storeEvent(data) {
  const existing = await get(`SELECT * FROM whatsapp_webhook_events WHERE idempotency_key = ?`, [data.idempotencyKey]);
  if (existing) return { event: existing, duplicate: true };
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO whatsapp_webhook_events
      (id, tenant_id, idempotency_key, event_type, provider_message_id,
       provider_inbound_message_id, provider_phone_number_id, recipient_phone,
       sender_phone, status, provider_timestamp, payload, processing_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP)`,
    [id, data.tenantId || null, data.idempotencyKey, data.eventType,
      data.providerMessageId || null, data.providerInboundMessageId || null,
      data.providerPhoneNumberId || null, data.recipientPhone || null,
      data.senderPhone || null, data.status || null, data.providerTimestamp || null,
      JSON.stringify(data.payload)]
  );
  return { event: await get(`SELECT * FROM whatsapp_webhook_events WHERE id = ?`, [id]), duplicate: false };
}

async function finishEvent(id, status, tenantId = null, errorMessage = null) {
  await run(
    `UPDATE whatsapp_webhook_events SET tenant_id = COALESCE(?, tenant_id),
     processing_status = ?, error_message = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [tenantId, status, errorMessage, id]
  );
}

async function processWebhookPayload(payload) {
  let processed = 0;
  let duplicates = 0;
  const changes = payload?.entry?.flatMap((entry) => entry.changes || []) || [];
  if (!changes.length && (payload?.statuses || payload?.messages)) {
    changes.push({ value: { statuses: payload.statuses || [], messages: payload.messages || [], metadata: payload.metadata || {} } });
  }
  for (const change of changes) {
    const value = change.value || {};
    const phoneNumberId = value.metadata?.phone_number_id || null;
    for (const status of value.statuses || []) {
      const key = eventKey(['status', status.id, status.status, status.timestamp]);
      const stored = await storeEvent({
        idempotencyKey: key,
        eventType: 'MESSAGE_STATUS',
        providerMessageId: status.id,
        providerPhoneNumberId: phoneNumberId,
        recipientPhone: status.recipient_id,
        status: status.status,
        providerTimestamp: status.timestamp,
        payload: status,
      });
      if (stored.duplicate) { duplicates += 1; continue; }
      try {
        const result = await updateOutboundStatus({
          providerMessageId: status.id,
          providerStatus: status.status,
          timestamp: status.timestamp,
          payload: status,
        });
        await finishEvent(stored.event.id, result.matched ? 'PROCESSED' : 'IGNORED', result.message?.tenant_id);
        if (result.message?.tenant_id) {
          await createAuditLog({ tenantId: result.message.tenant_id, actorUserId: null, action: 'WHATSAPP_WEBHOOK_RECEIVED', entityType: 'whatsapp_webhook_event', entityId: stored.event.id, newValues: { eventType: 'MESSAGE_STATUS', providerMessageId: status.id, status: status.status } });
        }
        processed += 1;
      } catch (error) {
        await finishEvent(stored.event.id, 'FAILED', null, error.message);
        await createAuditLog({ tenantId: 'system', actorUserId: null, action: 'WHATSAPP_WEBHOOK_PROCESSING_FAILED', entityType: 'whatsapp_webhook_event', entityId: stored.event.id, newValues: { error: error.message } });
      }
    }
    for (const message of value.messages || []) {
      const key = eventKey(['inbound', message.id]);
      const stored = await storeEvent({
        idempotencyKey: key,
        eventType: 'INBOUND_MESSAGE',
        providerInboundMessageId: message.id,
        providerPhoneNumberId: phoneNumberId,
        senderPhone: message.from,
        providerTimestamp: message.timestamp,
        payload: message,
      });
      if (stored.duplicate) { duplicates += 1; continue; }
      try {
        const result = await processInboundMessage({ message, metadata: value.metadata });
        await finishEvent(stored.event.id, 'PROCESSED', result.identity.tenantId || result.outbound?.tenant_id);
        if (result.identity.tenantId || result.outbound?.tenant_id) {
          await createAuditLog({ tenantId: result.identity.tenantId || result.outbound.tenant_id, actorUserId: null, action: 'WHATSAPP_WEBHOOK_RECEIVED', entityType: 'whatsapp_webhook_event', entityId: stored.event.id, newValues: { eventType: 'INBOUND_MESSAGE', providerInboundMessageId: message.id } });
        }
        processed += 1;
      } catch (error) {
        await finishEvent(stored.event.id, 'FAILED', null, error.message);
      }
    }
  }
  return { processed, duplicates };
}

async function reprocessWebhookEvent(event) {
  const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
  if (event.event_type === 'MESSAGE_STATUS') {
    const result = await updateOutboundStatus({ providerMessageId: event.provider_message_id, providerStatus: event.status, timestamp: event.provider_timestamp, payload });
    await finishEvent(event.id, result.matched ? 'PROCESSED' : 'IGNORED', result.message?.tenant_id);
    return result;
  }
  if (event.event_type === 'INBOUND_MESSAGE') {
    const result = await processInboundMessage({ message: payload, metadata: { phone_number_id: event.provider_phone_number_id } });
    await finishEvent(event.id, 'PROCESSED', result.identity.tenantId || result.outbound?.tenant_id);
    return result;
  }
  await finishEvent(event.id, 'IGNORED');
  return { ignored: true };
}

module.exports = { eventKey, processWebhookPayload, reprocessWebhookEvent };
