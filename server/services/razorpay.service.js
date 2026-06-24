const Razorpay = require('razorpay');
const { env } = require('../config/env');
const { getTenantFeeSettings } = require('./tenantFeeSettings.service');

let razorpay = null;

function createRazorpayClient({ keyId, keySecret }) {
  if (!keyId || !keySecret) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Razorpay credentials are required in production');
    }

    console.warn('Razorpay client not configured in development');
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function getRazorpayClient() {
  if (!razorpay) {
    razorpay = createRazorpayClient({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpay;
}

async function getTenantRazorpayClient(tenantId) {
  const settings = await getTenantFeeSettings(tenantId, { includeSecrets: true });
  if (settings.razorpayEnabled && settings.razorpayKeyId && settings.razorpayKeySecret) {
    return createRazorpayClient({
      keyId: settings.razorpayKeyId,
      keySecret: settings.razorpayKeySecret,
    });
  }

  if (!razorpay) {
    razorpay = createRazorpayClient({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpay;
}

module.exports = {
  createRazorpayClient,
  getRazorpayClient,
  getTenantRazorpayClient,
};
