const express = require('express');
const { env } = require('../config/env');
const { get, run } = require('../services/db.service');
const {
  generateId,
  generateRawToken,
  getFutureDate,
  hashToken,
} = require('../services/token.service');
const { sendVerificationEmail } = require('../services/mail.service');
const {
  EmailVerificationError,
  verifyEmailAndActivateTrial,
} = require('../services/email-verification.service');

const router = express.Router();

router.post('/verify-email', async (req, res) => {
  try {
    const result = await verifyEmailAndActivateTrial(req.body?.token);
    return res.json({
      message: result.trialActivated
        ? 'Email verified successfully. Your trial is now active.'
        : 'Email verified successfully.',
      trialActivated: result.trialActivated,
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
    return res.status(500).json({ message: 'Failed to verify email' });
  }
});

router.post('/resend-trial-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const genericResponse = {
    message: 'If a pending trial exists for this email, a verification link has been sent.',
  };

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const user = await get(
      `SELECT u.id, u.email, u.tenant_id
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
       WHERE LOWER(u.email) = ?
       AND u.role = 'owner'
       AND u.email_verified_at IS NULL
       AND u.deleted_at IS NULL
       AND LOWER(t.status) = 'pending_verification'`,
      [email]
    );

    if (!user) return res.json(genericResponse);

    const rawToken = generateRawToken();
    await run(
      `UPDATE email_verification_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND tenant_id = ? AND used_at IS NULL`,
      [user.id, user.tenant_id]
    );
    await run(
      `INSERT INTO email_verification_tokens
        (id, user_id, tenant_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        generateId('evt'),
        user.id,
        user.tenant_id,
        hashToken(rawToken),
        getFutureDate({ hours: env.EMAIL_VERIFICATION_TOKEN_HOURS }),
      ]
    );
    await sendVerificationEmail({ email: user.email, token: rawToken });
    return res.json(genericResponse);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to resend verification email' });
  }
});

module.exports = router;
