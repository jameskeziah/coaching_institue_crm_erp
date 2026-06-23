const Razorpay = require('razorpay');
const { env } = require('../config/env');

let razorpay = null;

function getRazorpayClient() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Razorpay credentials are required in production');
    }

    console.warn('Razorpay client not configured in development');
    return null;
  }

  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpay;
}

module.exports = {
  getRazorpayClient,
};
