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
  const entity = entityFromPayload(payload);
  const noteTenantId = entity.notes?.tenantId || entity.notes?.tenant_id;
  if (noteTenantId) return noteTenantId;

  const paymentLinkId = payload?.payload?.payment_link?.entity?.id
    || payload?.payload?.payment?.entity?.payment_link_id
    || entity.notes?.paymentLinkId;
  if (paymentLinkId) {
    const link = await get(
      `SELECT tenant_id FROM fee_payment_links WHERE razorpay_payment_link_id = ?`,
      [paymentLinkId]
    );
    if (link) return link.tenant_id ?? link.tenantId;
  }

  const paymentId = payload?.payload?.refund?.entity?.payment_id
    || payload?.payload?.payment?.entity?.id;
  if (paymentId) {
    const payment = await get(
      `SELECT tenant_id FROM fee_payments WHERE razorpay_payment_id = ?`,
      [paymentId]
    );
    if (payment) return payment.tenant_id ?? payment.tenantId;
  }
  return null;
}

async function webhookSecretFor(payload) {
  const tenantId = await resolveTenantId(payload);
  if (tenantId) {
    const settings = await getTenantFeeSettings(tenantId, { includeSecrets: true });
    if (settings.razorpayWebhookSecret) {
      return { secret: settings.razorpayWebhookSecret, tenantId };
    }
  }
  return { secret: env.RAZORPAY_WEBHOOK_SECRET, tenantId };
}

async function processPaymentLinkPaid(payload) {
  const paymentLink = payload.payload.payment_link.entity;
  const payment = payload.payload.payment?.entity;
  const localLink = await get(
    `SELECT *
     FROM fee_payment_links
     WHERE razorpay_payment_link_id = ?`,
    [paymentLink.id]
  );
  if (!localLink) return;

  const tenantId = localLink.tenant_id ?? localLink.tenantId;
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
     WHERE id = ?`,
    [localLink.id]
  );
}

async function processPaymentStatus(payload, status) {
  const payment = payload.payload.payment.entity;
  const paymentLinkId = payment.payment_link_id || payment.notes?.paymentLinkId;
  if (!paymentLinkId) return;
  await run(
    `UPDATE fee_payment_links
     SET status = ?,
         paid_at = CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_payment_link_id = ?`,
    [status, status, paymentLinkId]
  );
}

async function processRefund(payload) {
  const refund = payload.payload.refund.entity;
  await run(
    `UPDATE fee_payments
     SET refund_status = 'PROCESSED',
         refunded_amount = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_payment_id = ?`,
    [Math.round(Number(refund.amount || 0) / 100), refund.payment_id]
  );
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let localEventId = null;
  try {
    const payload = JSON.parse(req.body.toString('utf8'));
    const { secret } = await webhookSecretFor(payload);
    if (!secret) return res.status(500).json({ error: 'Webhook secret missing' });

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');
    if (!safeEqual(expectedSignature, req.headers['x-razorpay-signature'])) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const eventType = payload.event;
    const entity = entityFromPayload(payload);
    const eventId = req.headers['x-razorpay-event-id']
      || `${eventType}:${entity.id || crypto.createHash('sha256').update(req.body).digest('hex')}`;
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

    if (eventType === 'payment_link.paid') await processPaymentLinkPaid(payload);
    else if (eventType === 'payment.captured') await processPaymentStatus(payload, 'PAID');
    else if (eventType === 'payment.failed') await processPaymentStatus(payload, 'FAILED');
    else if (eventType === 'refund.processed') await processRefund(payload);

    await run(
      `UPDATE razorpay_webhook_events
       SET processed = 1, processing_error = NULL, processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [localEventId]
    );
    res.json({ message: 'Webhook processed' });
  } catch (error) {
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
