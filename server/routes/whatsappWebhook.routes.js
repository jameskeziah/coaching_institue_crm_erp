const crypto = require('crypto');
const express = require('express');

const { env } = require('../config/env');
const { processWebhookPayload } = require('../services/whatsapp-webhook.service');

const router = express.Router();

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validSignature(rawBody, signature) {
  if (!env.WHATSAPP_APP_SECRET) return env.NODE_ENV !== 'production';
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  return safeEqual(expected, signature);
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && challenge && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && safeEqual(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!validSignature(rawBody, req.headers['x-hub-signature-256'])) return res.status(401).json({ error: 'Invalid WhatsApp webhook signature' });
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ error: 'Invalid WhatsApp webhook payload' });
  }
  // Acknowledge after durable, idempotent processing. The handler performs no
  // provider calls, keeping processing bounded and retry-safe.
  try {
    const result = await processWebhookPayload(payload);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    return res.status(200).json({ received: true, processingError: error.message });
  }
});

module.exports = router;
