const { env } = require('../config/env');

function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

function whatsappConfig() {
  return {
    token: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: env.WHATSAPP_API_VERSION,
  };
}

function isWhatsAppConfigured() {
  const config = whatsappConfig();
  return Boolean(config.token && config.phoneNumberId);
}

async function sendWhatsAppText(to, message) {
  const config = whatsappConfig();
  const phone = normalizeIndianPhone(to);

  if (!phone) return { ok: false, status: 'Missing Phone', provider: 'whatsapp_cloud', error: 'Missing parent phone' };
  if (!isWhatsAppConfigured() && env.NODE_ENV !== 'production') {
    console.log('WhatsApp skipped in development:', { to: phone, message });
    return { ok: true, status: 'Skipped', provider: 'whatsapp_cloud', skipped: true };
  }
  if (!isWhatsAppConfigured()) return { ok: false, status: 'Not Configured', provider: 'whatsapp_cloud' };

  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: 'Failed', provider: 'whatsapp_cloud', error: body.error?.message || response.statusText, response: body };
  }

  return { ok: true, status: 'Sent', provider: 'whatsapp_cloud', response: body };
}

module.exports = {
  normalizeIndianPhone,
  whatsappConfig,
  isWhatsAppConfigured,
  sendWhatsAppText,
};
