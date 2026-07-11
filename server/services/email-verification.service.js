const { env } = require('../config/env');
const { transaction, get, run } = require('./db.service');
const { getFutureDate, hashToken } = require('./token.service');

class EmailVerificationError extends Error {
  constructor(message, code = 'INVALID_VERIFICATION_TOKEN') {
    super(message);
    this.name = 'EmailVerificationError';
    this.code = code;
  }
}

async function verifyEmailAndActivateTrial(rawToken) {
  if (!rawToken) {
    throw new EmailVerificationError('Verification token is required', 'VERIFICATION_TOKEN_REQUIRED');
  }

  const now = new Date().toISOString();

  return transaction(async () => {
    const verification = await get(
      `SELECT evt.*, t.status AS tenant_status
       FROM email_verification_tokens evt
       JOIN users u
         ON u.id = evt.user_id
        AND u.tenant_id = evt.tenant_id
        AND u.deleted_at IS NULL
       JOIN tenants t
         ON t.id = evt.tenant_id
        AND t.deleted_at IS NULL
       WHERE evt.token_hash = ?
       AND evt.used_at IS NULL
       AND evt.expires_at > ?`,
      [hashToken(rawToken), now]
    );

    if (!verification) {
      throw new EmailVerificationError('Invalid or expired verification token');
    }

    await run(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?`,
      [verification.user_id, verification.tenant_id]
    );

    await run(
      `UPDATE email_verification_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND used_at IS NULL`,
      [verification.id]
    );

    const isPendingTrial = String(verification.tenant_status || '').toLowerCase() === 'pending_verification';
    if (!isPendingTrial) {
      return { trialActivated: false };
    }

    const trialEndsAt = getFutureDate({ days: env.TRIAL_DAYS });

    await run(
      `UPDATE tenants
       SET status = 'trialing',
           subscriptionStatus = 'trialing',
           subscriptionPlan = 'trial',
           plan = 'trial',
           updatedAt = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND deleted_at IS NULL
       AND LOWER(status) = 'pending_verification'`,
      [verification.tenant_id]
    );

    await run(
      `UPDATE tenant_subscriptions
       SET status = 'trialing',
           trial_started_at = COALESCE(trial_started_at, CURRENT_TIMESTAMP),
           trial_ends_at = COALESCE(trial_ends_at, ?),
           current_period_start = COALESCE(current_period_start, CURRENT_TIMESTAMP),
           current_period_end = COALESCE(current_period_end, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND LOWER(status) = 'pending_verification'`,
      [trialEndsAt, trialEndsAt, verification.tenant_id]
    );

    return { trialActivated: true };
  });
}

module.exports = {
  EmailVerificationError,
  verifyEmailAndActivateTrial,
};
