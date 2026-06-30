const crypto = require('crypto');
const { env } = require('../config/env');
const { normalizeIndianPhone, whatsappConfig, isWhatsAppConfigured } = require('./whatsapp.service');

async function sendOfficialTemplate({ to, templateName, languageCode, variables }) {
  const phone = normalizeIndianPhone(to);
  if (!phone) return { ok: false, status: 'FAILED', errorCode: 'MISSING_PHONE', errorMessage: 'Recipient phone is missing' };
  const config = whatsappConfig();
  if (!isWhatsAppConfigured() && env.NODE_ENV !== 'production') {
    return {
      ok: true,
      status: 'SENT',
      provider: 'WHATSAPP_CLOUD_API_LOCAL',
      providerMessageId: `wamid.local.${crypto.randomUUID()}`,
      skipped: true,
      payload: { to: phone, templateName, languageCode, variables },
    };
  }
  if (!isWhatsAppConfigured()) return { ok: false, status: 'FAILED', errorCode: 'NOT_CONFIGURED', errorMessage: 'WhatsApp Cloud API is not configured' };
  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [{
        type: 'body',
        parameters: variables.map((value) => ({ type: 'text', text: String(value) })),
      }],
    },
  };
  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 'FAILED', errorCode: body.error?.code || String(response.status), errorMessage: body.error?.message || response.statusText, response: body };
  return { ok: true, status: 'SENT', provider: 'WHATSAPP_CLOUD_API', providerMessageId: body.messages?.[0]?.id || null, response: body };
}

async function submitTemplate({ template }) {
  if (!isWhatsAppConfigured() && env.NODE_ENV !== 'production') {
    return { ok: true, status: 'SUBMITTED', providerTemplateId: `local-template-${template.id}`, local: true };
  }
  return { ok: false, status: 'FAILED', errorMessage: 'Provider template submission requires WABA management credentials, not only a phone-number token' };
}

async function getTemplateStatus({ template }) {
  if (!isWhatsAppConfigured() && env.NODE_ENV !== 'production') {
    return { ok: true, status: template.status === 'SUBMITTED' ? 'APPROVED' : template.status, local: true };
  }
  return { ok: true, status: template.status };
}

module.exports = {
  getTemplateStatus,
  sendOfficialTemplate,
  submitTemplate,
};
