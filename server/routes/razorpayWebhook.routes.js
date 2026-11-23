const crypto = require('crypto');
const express = require('express');

const { env } = require('../config/env');
const { run, get } = require('../services/db.service');
const { getTenantFeeSettings } = require('../services/tenantFeeSettings.service');
const { recordFeePayment } = require('../services/feeLedger.service');

const router = express.Router();

function safeEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function entityFromPayload(payload) {
  return payload?.payload?.payment_link?.entity
    || payload?.payload?.payment?.entity
    || payload?.payload?.refund?.entity
    || {};
}

async function resolveTenantId(payload) {
  const paymentLink = payload?.payload?.payment_link?.entity;
  const payment = payload?.payload?.payment?.entity;
  const refund = payload?.payload?.refund?.entity;
  const entities = [paymentLink, payment, refund].filter(Boolean);
  const tenantNotes = entities.flatMap((entity) => [entity.notes?.tenantId, entity.notes?.tenant_id]).filter((value) => value !== undefined && value !== null && value !== '');
  const linkIds = new Set([
    paymentLink?.id, payment?.payment_link_id,
    ...entities.map((entity) => entity.notes?.paymentLinkId),
  ].filter(Boolean));
  const owners = new Set();
  const addOwner = (row) => {
    const owner = row?.tenant_id ?? row?.tenantId;
    if (owner !== undefined && owner !== null && owner !== '') owners.add(String(owner));
  };

  // Tenant notes are supplied by a provider account. Only existing local
  // payment records may select the credentials used to authorize a mutation.
  for (const paymentLinkId of linkIds) {
    const link = await get(
      `SELECT tenant_id FROM fee_payment_links WHERE razorpay_payment_link_id = ?`,
      [paymentLinkId]
    );
    addOwner(link);
  }

  const paymentIds = new Set([refund?.payment_id, payment?.id].filter(Boolean));
  for (const paymentId of paymentIds) {
    const localPayment = await get(
      `SELECT tenant_id FROM fee_payments WHERE razorpay_payment_id = ?`,
      [paymentId]
    );
    addOwner(localPayment);
  }
  const tenantId = [...owners][0] || null;
  if (owners.size > 1 || (tenantId && tenantNotes.some((note) => String(note) !== tenantId))) {
    throw Object.assign(new Error('Invalid webhook'), { status: 400 });
  }
  return tenantId;
}

async function webhookSecretFor(payload) {
  const tenantId = await resolveTenantId(payload);
  if (tenantId) {
    // Authorization must not create or modify another institution's settings.
    const settings = await getTenantFeeSettings(tenantId, { includeSecrets: true, createIfMissing: false });
    if (settings?.razorpayWebhookSecret) {
      return { secret: settings.razorpayWebhookSecret, tenantId };
    }
  }
  return { secret: env.RAZORPAY_WEBHOOK_SECRET, tenantId };
}

async function processPaymentLinkPaid(payload, tenantId) {
  const paymentLink = payload.payload.payment_link.entity;
  const payment = payload.payload.payment?.entity;
  const localLink = await get(
    `SELECT *
     FROM fee_payment_links
     WHERE razorpay_payment_link_id = ? AND CAST(tenant_id AS TEXT) = ?`,
    [paymentLink.id, tenantId]
  );
  if (!localLink) return;

  const studentFeePlanId = localLink.student_fee_plan_id ?? localLink.studentFeePlanId;
  const studentFeeInstallmentId = localLink.student_fee_installment_id ?? localLink.studentFeeInstallmentId;
  await recordFeePayment({
    tenantId,
    studentFeePlanId,
    studentFeeInstallmentId,
    amount: Number(localLink.amount),
    paymentMode: 'RAZORPAY',
    razorpayPaymentId: payment?.id || null,
    razorpayPaymentLinkId: paymentLink.id,
  });
  await run(
    `UPDATE fee_payment_links
     SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND CAST(tenant_id AS TEXT) = ?`,
    [localLink.id, tenantId]
  );
}

async function processPaymentStatus(payload, status, tenantId) {
  const payment = payload.payload.payment.entity;
  const paymentLinkId = payment.payment_link_id || payment.notes?.paymentLinkId;
  if (!paymentLinkId) return;
  await run(
    `UPDATE fee_payment_links
     SET status = ?,
         paid_at = CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_payment_link_id = ? AND CAST(tenant_id AS TEXT) = ?`,
    [status, status, paymentLinkId, tenantId]
  );
}

async function processRefund(payload, tenantId) {
  const refund = payload.payload.refund.entity;
  await run(
    `UPDATE fee_payments
     SET refund_status = 'PROCESSED',
         refunded_amount = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_payment_id = ? AND CAST(tenant_id AS TEXT) = ?`,
    [Math.round(Number(refund.amount || 0) / 100), refund.payment_id, tenantId]
  );
}

router.post('/', express.raw({ type: 'application/json', limit: env.JSON_BODY_LIMIT }), async (req, res) => {
  let localEventId = null;
  try {
    const payload = JSON.parse(req.body.toString('utf8'));
    const { secret, tenantId } = await webhookSecretFor(payload);
    if (!secret) return res.status(500).json({ error: 'Webhook secret missing' });

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');
    if (!safeEqual(expectedSignature, req.headers['x-razorpay-signature'])) {
      return res.status(400).json({ error: 'Invalid webhook' });
    }
    if (!tenantId) return res.json({ message: 'Webhook ignored: no registered target' });

    const eventType = payload.event;
    const entity = entityFromPayload(payload);
    const providerEventId = req.headers['x-razorpay-event-id']
      || `${eventType}:${entity.id || crypto.createHash('sha256').update(req.body).digest('hex')}`;
    const eventId = `${tenantId}:${providerEventId}`;
    const existing = await get(
      `SELECT id, processed FROM razorpay_webhook_events WHERE event_id = ?`,
      [eventId]
    );
    if (existing?.processed) return res.json({ message: 'Webhook already processed' });
    if (existing) {
      localEventId = existing.id;
    } else {
      localEventId = crypto.randomUUID();
      await run(
        `INSERT INTO razorpay_webhook_events
          (id, event_id, event_type, razorpay_entity_id, payload, processed, created_at)
         VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
        [localEventId, eventId, eventType, entity.id || null, JSON.stringify(payload)]
      );
    }

    if (eventType === 'payment_link.paid') await processPaymentLinkPaid(payload, tenantId);
    else if (eventType === 'payment.captured') await processPaymentStatus(payload, 'PAID', tenantId);
    else if (eventType === 'payment.failed') await processPaymentStatus(payload, 'FAILED', tenantId);
    else if (eventType === 'refund.processed') await processRefund(payload, tenantId);

    await run(
      `UPDATE razorpay_webhook_events
       SET processed = 1, processing_error = NULL, processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [localEventId]
    );
    res.json({ message: 'Webhook processed' });
  } catch (error) {
    if (error.status === 400 || error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid webhook' });
    }
    if (localEventId) {
      await run(
        `UPDATE razorpay_webhook_events SET processing_error = ? WHERE id = ?`,
        [String(error.message || error), localEventId]
      ).catch(() => {});
    }
    console.error('Razorpay webhook failed', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
