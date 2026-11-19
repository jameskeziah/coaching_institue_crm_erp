const express = require('express');
const { run, get, transaction } = require('../services/db.service');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { publicUser } = require('../utils/request');
const { env } = require('../config/env');
const {
  generateRawToken,
  hashToken,
  generateId,
  createAccessToken,
  getFutureDate,
} = require('../services/token.service');
const {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} = require('../services/password.service');
const {
  isMailDeliveryError,
} = require('../services/mail.service');
const {
  createEmailOutboxRecord,
  processEmailOutboxRecord,
} = require('../services/email-outbox.service');
const { createAuditLog } = require('../services/auditLog.service');

const router = express.Router();
const ACCESS_ENABLED_STATUSES = new Set(['active', 'trialing']);
const VERIFICATION_EMAIL_TYPES = ['owner_email_verification', 'user_email_verification'];
const RESEND_COOLDOWN_MS = 60_000;
const RESEND_RATE_WINDOW_MS = 15 * 60_000;
const MAX_USER_RESENDS_PER_WINDOW = 5;
const MAX_IP_RESENDS_PER_WINDOW = 20;
const MAX_PENDING_VERIFICATION_OUTBOX = 3;
const GENERIC_INVITE_ROLES = new Set(['admin', 'accountant', 'counsellor', 'teacher', 'user']);
const resendUserBuckets = new Map();
const resendIpBuckets = new Map();

class InvalidVerificationTokenError extends Error {
  constructor(message = 'Invalid or expired verification token') {
    super(message);
    this.name = 'InvalidVerificationTokenError';
  }
}

class EmailAlreadyVerifiedResult extends Error {
  constructor() {
    super('Email is already verified');
    this.name = 'EmailAlreadyVerifiedResult';
  }
}

class ResendRateLimitError extends Error {
  constructor(message = 'Please wait before requesting another verification email') {
    super(message);
    this.name = 'ResendRateLimitError';
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isAccessEnabledStatus(value) {
  return ACCESS_ENABLED_STATUSES.has(normalizeStatus(value));
}

function hasSubscriptionAccess(row) {
  const value = row?.subscription_access_enabled ?? row?.subscriptionAccessEnabled;
  if (value !== undefined && value !== null) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
  }

  return isAccessEnabledStatus(row?.subscription_status || row?.subscriptionStatus);
}

function isTenantAccessEnabled(row) {
  return isAccessEnabledStatus(row?.tenant_status || row?.tenantStatus)
    && hasSubscriptionAccess(row);
}

function changedOne(result) {
  return Number(result?.changes ?? result?.rowCount ?? 0) === 1;
}

function addDaysIso(startIso, days) {
  const date = new Date(startIso);
  date.setDate(date.getDate() + Number(days || 14));
  return date.toISOString();
}

function toSqlTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function pruneBucket(bucket, now = Date.now()) {
  while (bucket.length > 0 && now - bucket[0] > RESEND_RATE_WINDOW_MS) bucket.shift();
}

function recordRateLimitAttempt(map, key, limit) {
  if (!key) return;
  const now = Date.now();
  const bucket = map.get(key) || [];
  pruneBucket(bucket, now);
  if (bucket.length >= limit) {
    throw new ResendRateLimitError();
  }
  bucket.push(now);
  map.set(key, bucket);
}

function requestIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

function userPasswordHash(user) {
  return user?.password_hash || user?.password;
}

function authUser(user) {
  const tenantId = user.tenant_id || user.tenantId || null;
  const tenantName = user.tenantName || user.tenant_name || null;
  const subscriptionPlan = user.subscriptionPlan || user.subscription_plan || null;
  const subscriptionStatus = user.subscriptionStatus
    || user.subscription_status
    || user.tenant_subscription_status
    || null;
  return {
    ...publicUser(user),
    email: user.email || user.username || null,
    name: user.name || user.username || null,
    tenant_id: tenantId,
    tenantId,
    tenantName,
    subscriptionPlan,
    subscriptionStatus,
    tenantStatus: user.tenantStatus || user.tenant_status || null,
    emailVerifiedAt: user.email_verified_at || user.emailVerifiedAt || null,
  };
}

async function createVerificationToken(user) {
  const rawToken = generateRawToken();
  const tokenId = generateId('evt');
  const tenantStatus = normalizeStatus(user.tenantStatus || user.tenant_status);
  const type = user.role === 'owner' && tenantStatus === 'pending_verification'
    ? 'owner_email_verification'
    : 'user_email_verification';

  await run(
    `INSERT INTO email_verification_tokens
      (id, user_id, tenant_id, token_hash, expires_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
    [
      tokenId,
      user.id,
      user.tenant_id || user.tenantId,
      hashToken(rawToken),
      getFutureDate({ hours: env.EMAIL_VERIFICATION_TOKEN_HOURS }),
    ]
  );

  const outboxId = await createEmailOutboxRecord({
    tenantId: user.tenant_id || user.tenantId,
    userId: user.id,
    tokenId,
    type,
    recipient: user.email,
    payload: { token: rawToken },
  });

  return { id: tokenId, outboxId };
}

async function queueVerificationResend(user, { ip } = {}) {
  recordRateLimitAttempt(resendUserBuckets, String(user.id), MAX_USER_RESENDS_PER_WINDOW);
  recordRateLimitAttempt(resendIpBuckets, String(ip || 'unknown'), MAX_IP_RESENDS_PER_WINDOW);

  const cooldownCutoff = toSqlTimestamp(new Date(Date.now() - RESEND_COOLDOWN_MS));
  const recentQueued = await get(
    `SELECT id
     FROM email_outbox
     WHERE user_id = ?
       AND tenant_id = ?
       AND type IN (?, ?)
       AND status IN ('pending', 'retry', 'processing')
       AND REPLACE(created_at, 'T', ' ') >= ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      user.id,
      user.tenant_id || user.tenantId,
      VERIFICATION_EMAIL_TYPES[0],
      VERIFICATION_EMAIL_TYPES[1],
      cooldownCutoff,
    ]
  );

  if (recentQueued) {
    return {
      outboxId: recentQueued.id,
      deduplicated: true,
      deliveryStatus: 'queued',
    };
  }

  const pendingCount = await get(
    `SELECT COUNT(*) AS count
     FROM email_outbox
     WHERE user_id = ?
       AND tenant_id = ?
       AND type IN (?, ?)
       AND status IN ('pending', 'retry', 'processing')`,
    [
      user.id,
      user.tenant_id || user.tenantId,
      VERIFICATION_EMAIL_TYPES[0],
      VERIFICATION_EMAIL_TYPES[1],
    ]
  );

  if (Number(pendingCount?.count || 0) >= MAX_PENDING_VERIFICATION_OUTBOX) {
    throw new ResendRateLimitError('Too many verification emails are already queued');
  }

  const token = await transaction(async () => createVerificationToken(user));
  return {
    tokenId: token.id,
    outboxId: token.outboxId,
    deduplicated: false,
    deliveryStatus: 'queued',
  };
}

function genericPasswordResetResponse(res) {
  return res.json({
    message: 'If this email exists, a reset link has been sent.',
  });
}

async function sendVerificationTokenEmail({ token }) {
  return processEmailOutboxRecord(token.outboxId);
}

async function createPasswordResetToken(user) {
  await run(
    `UPDATE password_reset_tokens
     SET revoked_at = CURRENT_TIMESTAMP,
         revoke_reason = 'superseded'
     WHERE user_id = ?
       AND tenant_id = ?
       AND used_at IS NULL
       AND revoked_at IS NULL`,
    [user.id, user.tenant_id]
  );

  const rawToken = generateRawToken();
  const tokenId = generateId('prt');

  await run(
    `INSERT INTO password_reset_tokens
      (id, user_id, tenant_id, token_hash, expires_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
    [
      tokenId,
      user.id,
      user.tenant_id,
      hashToken(rawToken),
      getFutureDate({ minutes: env.RESET_PASSWORD_TOKEN_MINUTES }),
    ]
  );

  const outboxId = await createEmailOutboxRecord({
    tenantId: user.tenant_id,
    userId: user.id,
    tokenId,
    type: 'password_reset',
    recipient: user.email,
    payload: { token: rawToken },
  });

  return { tokenId, outboxId };
}

async function sendPasswordResetTokenEmail({ outboxId }) {
  return processEmailOutboxRecord(outboxId);
}

async function createSession(req, user) {
  const refreshToken = generateRawToken();
  const sessionId = generateId('ses');

  await run(
    `INSERT INTO user_sessions
      (id, user_id, tenant_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      user.id,
      user.tenant_id || user.tenantId,
      hashToken(refreshToken),
      req.headers['user-agent'] || null,
      req.ip || null,
      getFutureDate({ days: env.REFRESH_TOKEN_DAYS }),
    ]
  );

  return {
    accessToken: createAccessToken(user, sessionId),
    refreshToken,
  };
}

router.post('/register', async (req, res) => {
  try {
    if (!env.ALLOW_REGISTRATION) return res.status(403).json({ error: 'Registration is disabled' });

    const email = normalizeEmail(req.body.email || req.body.username);
    const username = String(req.body.username || email).trim();
    const name = String(req.body.name || username).trim();
    const { password } = req.body;

    if (!email || !username || !password) return res.status(400).json({ error: 'Missing credentials' });

    try {
      validatePasswordStrength(password);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const existing = await get(
      `SELECT * FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL`,
      [username, email]
    );
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
    const passwordHash = await hashPassword(password);
    const { user, verificationToken } = await transaction(async () => {
      const result = await run(
        `INSERT INTO users
          (username, name, email, password, password_hash, role, tenant_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [username, name, email, passwordHash, passwordHash, 'user', tenant?.id || null]
      );

      const createdUser = await get(`SELECT * FROM users WHERE id = ?`, [result.lastID]);
      const token = await createVerificationToken(createdUser);
      return { user: createdUser, verificationToken: token };
    });

    await sendVerificationTokenEmail({ token: verificationToken });

    return res.status(201).json({
      ok: true,
      message: 'Registration successful. Please verify your email.',
    });
  } catch (error) {
    if (isMailDeliveryError(error)) {
      return res.status(503).json({
        message:
          'Registration was created, but the verification email could not be delivered. Please try resending verification.',
        code: error.code,
      });
    }

    return res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const login = normalizeEmail(req.body.email || req.body.username);
    const { password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await get(
      `SELECT users.*,
              tenants.name AS tenant_name,
              tenants.subscriptionPlan AS subscription_plan,
              tenants.subscriptionStatus AS tenant_subscription_status,
              tenants.status AS tenant_status,
              EXISTS (
                SELECT 1
                FROM tenant_subscriptions
                WHERE tenant_subscriptions.tenant_id = tenants.id
                  AND tenant_subscriptions.deleted_at IS NULL
                  AND LOWER(tenant_subscriptions.status) IN ('active', 'trialing')
              ) AS subscription_access_enabled
       FROM users
       LEFT JOIN tenants ON tenants.id = users.tenant_id
       WHERE (LOWER(users.email) = ? OR LOWER(users.username) = ?)
       AND users.deleted_at IS NULL`,
      [login, login]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await verifyPassword(password, userPasswordHash(user));
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_active === 0) return res.status(403).json({ error: 'User is inactive' });

    if (
      user.role === 'owner' &&
      !user.email_verified_at &&
      normalizeStatus(user.tenant_status || user.tenantStatus) === 'pending_verification'
    ) {
      return res.status(403).json({
        message: 'Please verify the owner email before signing in.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      });
    }

    if (!isTenantAccessEnabled(user)) {
      return res.status(403).json({
        error: 'Tenant is inactive',
        code: 'TENANT_ACCESS_DISABLED',
      });
    }

    const session = await createSession(req, user);
    await run(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    return res.json({
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: authUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to log in' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      message: 'Refresh token required',
      code: 'REFRESH_TOKEN_REQUIRED',
    });
  }

  try {
    const session = await get(
      `SELECT s.*,
              u.username,
              u.name,
              u.email,
              u.role,
              u.email_verified_at,
              u.is_active,
              tenants.status AS tenant_status,
              tenants.subscriptionStatus AS tenant_subscription_status,
              EXISTS (
                SELECT 1
                FROM tenant_subscriptions
                WHERE tenant_subscriptions.tenant_id = tenants.id
                  AND tenant_subscriptions.deleted_at IS NULL
                  AND LOWER(tenant_subscriptions.status) IN ('active', 'trialing')
              ) AS subscription_access_enabled
       FROM user_sessions s
       JOIN users u
         ON u.id = s.user_id
        AND u.tenant_id = s.tenant_id
       JOIN tenants
         ON tenants.id = s.tenant_id
        AND tenants.deleted_at IS NULL
       WHERE s.refresh_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND u.deleted_at IS NULL`,
      [hashToken(refreshToken), new Date().toISOString()]
    );

    if (
      !session ||
      session.is_active === 0 ||
      !session.email_verified_at ||
      !isTenantAccessEnabled(session)
    ) {
      return res.status(401).json({
        message: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    const accessToken = createAccessToken(
      {
        id: session.user_id,
        username: session.username,
        email: session.email,
        role: session.role,
        tenant_id: session.tenant_id,
        email_verified_at: session.email_verified_at,
      },
      session.id
    );

    return res.json({ accessToken, token: accessToken });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to refresh session' });
  }
});

router.post('/logout', authMiddleware, requireTenant, async (req, res) => {
  if (!req.user.sessionId) {
    return res.json({ message: 'Logged out' });
  }

  await run(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     AND user_id = ?
     AND tenant_id = ?`,
    [req.user.sessionId, req.user.id, req.user.tenantId]
  );

  return res.json({ message: 'Logged out successfully' });
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({
      message: 'Email is required',
    });
  }

  try {
    const user = await get(
      `SELECT *
       FROM users
       WHERE LOWER(email) = ?
       AND deleted_at IS NULL`,
      [email]
    );

    if (user) {
      const resetToken = await transaction(async () => createPasswordResetToken(user));
      await sendPasswordResetTokenEmail({ outboxId: resetToken.outboxId });
    }

    return genericPasswordResetResponse(res);
  } catch (error) {
    if (isMailDeliveryError(error)) {
      console.warn('Password reset email delivery failed', {
        code: error.code,
      });
      return genericPasswordResetResponse(res);
    }

    return res.status(500).json({
      message: 'Failed to process request',
    });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      message: 'Token and new password are required',
    });
  }

  try {
    validatePasswordStrength(newPassword);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  try {
    const resetToken = await get(
      `SELECT *
       FROM password_reset_tokens
       WHERE token_hash = ?
       AND used_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > ?`,
      [hashToken(token), new Date().toISOString()]
    );

    if (!resetToken) {
      return res.status(400).json({
        message: 'Invalid or expired reset token',
      });
    }

    const passwordHash = await hashPassword(newPassword);

    await run(
      `UPDATE users
       SET password = ?,
           password_hash = ?,
           password_changed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?`,
      [passwordHash, passwordHash, resetToken.user_id, resetToken.tenant_id]
    );

    await run(
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resetToken.id]
    );

    await run(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
       AND tenant_id = ?
       AND revoked_at IS NULL`,
      [resetToken.user_id, resetToken.tenant_id]
    );

    return res.json({
      message: 'Password reset successfully. Please log in again.',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to reset password',
    });
  }
});

router.post('/verify-email', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      message: 'Verification token is required',
    });
  }

  try {
    const tokenHash = hashToken(token);
    const trialStartedAt = new Date().toISOString();
    const trialEndsAt = addDaysIso(trialStartedAt, env.TRIAL_DAYS || 14);

    const outcome = await transaction(async () => {
      const verificationToken = await get(
        `SELECT tokens.*,
                users.role,
                users.email_verified_at,
                tenants.status AS tenant_status,
                tenants.subscriptionStatus AS tenant_subscription_status
         FROM email_verification_tokens tokens
         JOIN users
           ON users.id = tokens.user_id
          AND users.tenant_id = tokens.tenant_id
          AND users.deleted_at IS NULL
         JOIN tenants
           ON tenants.id = tokens.tenant_id
          AND tenants.deleted_at IS NULL
         WHERE tokens.token_hash = ?`,
        [tokenHash]
      );

      if (!verificationToken) {
        throw new InvalidVerificationTokenError();
      }

      if (verificationToken.email_verified_at) {
        return { alreadyVerified: true };
      }

      if (
        verificationToken.used_at ||
        verificationToken.superseded_at ||
        verificationToken.revoked_at ||
        new Date(verificationToken.expires_at).getTime() <= Date.now()
      ) {
        throw new InvalidVerificationTokenError();
      }

      const claimed = await run(
        `UPDATE email_verification_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND used_at IS NULL
           AND superseded_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [verificationToken.id, trialStartedAt]
      );

      if (!changedOne(claimed)) {
        const verifiedUser = await get(
          `SELECT email_verified_at
           FROM users
           WHERE id = ?
             AND tenant_id = ?
             AND deleted_at IS NULL`,
          [verificationToken.user_id, verificationToken.tenant_id]
        );
        if (verifiedUser?.email_verified_at || verifiedUser?.emailVerifiedAt) {
          return { alreadyVerified: true };
        }
        throw new InvalidVerificationTokenError('Verification token has already been used or expired');
      }

      const userUpdate = await run(
        `UPDATE users
         SET email_verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND tenant_id = ?
           AND deleted_at IS NULL`,
        [verificationToken.user_id, verificationToken.tenant_id]
      );

      if (!changedOne(userUpdate)) {
        throw new Error('Failed to verify user email');
      }

      await run(
        `UPDATE email_verification_tokens
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
             revoke_reason = COALESCE(revoke_reason, 'verified_with_other_token'),
             revocation_reason = COALESCE(revocation_reason, 'verified_with_other_token')
         WHERE user_id = ?
           AND tenant_id = ?
           AND id != ?
           AND used_at IS NULL
           AND revoked_at IS NULL`,
        [verificationToken.user_id, verificationToken.tenant_id, verificationToken.id]
      );

      await run(
        `UPDATE email_outbox
         SET status = 'cancelled',
             payload = NULL,
             locked_at = NULL,
             locked_by = NULL,
             last_error_code = 'USER_ALREADY_VERIFIED',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND tenant_id = ?
           AND type IN (?, ?)
           AND token_id != ?
           AND status IN ('pending', 'retry')`,
        [
          verificationToken.user_id,
          verificationToken.tenant_id,
          VERIFICATION_EMAIL_TYPES[0],
          VERIFICATION_EMAIL_TYPES[1],
          verificationToken.id,
        ]
      );

      const activatesPendingOwner =
        verificationToken.role === 'owner' &&
        normalizeStatus(verificationToken.tenant_status) === 'pending_verification';

      if (!activatesPendingOwner) {
        return { verified: true };
      }

      const tenantUpdate = await run(
        `UPDATE tenants
         SET status = 'trialing',
             subscriptionStatus = 'trialing',
             updatedAt = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND status = 'pending_verification'
           AND deleted_at IS NULL`,
        [verificationToken.tenant_id]
      );

      if (!changedOne(tenantUpdate)) {
        throw new Error('Failed to activate pending tenant');
      }

      const subscriptionUpdate = await run(
        `UPDATE tenant_subscriptions
         SET status = 'trialing',
             trial_started_at = ?,
             trial_ends_at = ?,
             current_period_start = ?,
             current_period_end = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ?
           AND status = 'pending_verification'
           AND deleted_at IS NULL`,
        [
          trialStartedAt,
          trialEndsAt,
          trialStartedAt,
          trialEndsAt,
          verificationToken.tenant_id,
        ]
      );

      if (!changedOne(subscriptionUpdate)) {
        throw new Error('Failed to activate pending subscription');
      }

      return { verified: true };
    });

    if (outcome?.alreadyVerified) {
      return res.json({
        message: 'Email is already verified',
      });
    }

    return res.json({
      message: 'Email verified successfully',
    });
  } catch (error) {
    if (error instanceof EmailAlreadyVerifiedResult) {
      return res.json({
        message: 'Email is already verified',
      });
    }

    if (error instanceof InvalidVerificationTokenError) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to verify email',
    });
  }
});

router.post('/resend-verification-request', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const tenantSlug = req.body.tenantSlug ? String(req.body.tenantSlug).trim().toLowerCase() : null;
  const response = {
    message: 'If a pending verification exists, a verification email will be queued.',
  };

  if (!email) {
    return res.json(response);
  }

  try {
    const user = await get(
      `SELECT users.*,
              tenants.status AS tenant_status,
              tenants.subscriptionStatus AS tenant_subscription_status
       FROM users
       JOIN tenants ON tenants.id = users.tenant_id
       WHERE LOWER(users.email) = ?
         AND users.email_verified_at IS NULL
         AND users.deleted_at IS NULL
         AND tenants.deleted_at IS NULL
         AND LOWER(COALESCE(tenants.status, '')) IN ('pending_verification', 'trialing', 'active')
         AND (? IS NULL OR LOWER(tenants.slug) = ?)
       ORDER BY CASE
         WHEN users.role = 'owner' AND LOWER(COALESCE(tenants.status, '')) = 'pending_verification' THEN 0
         ELSE 1
       END`,
      [email, tenantSlug, tenantSlug]
    );

    if (!user) return res.json(response);

    await queueVerificationResend(user, { ip: requestIp(req) }).catch((error) => {
      if (error instanceof ResendRateLimitError) return null;
      throw error;
    });

    return res.json(response);
  } catch (error) {
    return res.json(response);
  }
});

router.post('/resend-verification', authMiddleware, requireTenant, async (req, res) => {
  try {
    const user = await get(
      `SELECT users.*,
              tenants.status AS tenant_status,
              tenants.subscriptionStatus AS tenant_subscription_status
       FROM users
       JOIN tenants ON tenants.id = users.tenant_id
       WHERE users.id = ?
         AND users.tenant_id = ?
         AND users.deleted_at IS NULL
         AND tenants.deleted_at IS NULL`,
      [req.user.id, req.user.tenantId]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email_verified_at) return res.json({ message: 'Email is already verified' });

    const queued = await queueVerificationResend(user, { ip: requestIp(req) });

    return res.json({
      message: 'Verification email queued',
      deliveryStatus: queued.deliveryStatus,
      deduplicated: queued.deduplicated,
    });
  } catch (error) {
    if (error instanceof ResendRateLimitError) {
      return res.status(429).json({
        message: error.message,
        code: 'VERIFICATION_RESEND_RATE_LIMITED',
      });
    }

    if (isMailDeliveryError(error)) {
      return res.status(503).json({
        message:
          'The verification email could not be delivered. Please try again later.',
        code: error.code,
      });
    }

    return res.status(500).json({ message: 'Failed to resend verification email' });
  }
});

router.post('/accept-invite', async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    return res.status(400).json({
      message: 'Token, name, and password are required',
    });
  }

  try {
    validatePasswordStrength(password);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  try {
    await transaction(async () => {
      const now = new Date().toISOString();
      const invite = await get(
        `SELECT *
         FROM user_invites
         WHERE token_hash = ?
           AND accepted_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [hashToken(token), now]
      );
      if (!invite) throw Object.assign(new Error('Invalid or expired invite'), { status: 400 });
      if (!GENERIC_INVITE_ROLES.has(invite.role)) {
        throw Object.assign(new Error('This invite role requires a dedicated access workflow'), { status: 409 });
      }

      const email = normalizeEmail(invite.email);
      const existing = await get(
        `SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?`,
        [email, email]
      );
      if (existing) throw Object.assign(new Error('User already exists'), { status: 409 });

      const claimed = await run(
        `UPDATE user_invites
         SET accepted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND accepted_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [invite.id, now]
      );
      if (!changedOne(claimed)) throw Object.assign(new Error('Invite was already used or revoked'), { status: 409 });

      const passwordHash = await hashPassword(password);
      const createdUser = await run(
        `INSERT INTO users
         (username, tenant_id, name, email, password, password_hash, role, email_verified_at,
          is_active, created_by, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
        [email, invite.tenant_id, String(name).trim(), email, passwordHash, passwordHash, invite.role, invite.invited_by]
      );

      await createAuditLog({
        tenantId: invite.tenant_id,
        actorUserId: createdUser.lastID,
        action: 'USER_INVITE_ACCEPTED',
        entityType: 'user',
        entityId: createdUser.lastID,
        newValues: { role: invite.role, emailVerified: true, active: true },
        metadata: { inviteId: invite.id, invitedBy: invite.invited_by },
      });
    });

    return res.status(201).json({ message: 'Invite accepted successfully. You can now log in.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (/UNIQUE|constraint/i.test(error.message || '')) return res.status(409).json({ message: 'User already exists' });
    return res.status(500).json({ message: 'Failed to accept invite' });
  }
});

router.post('/accept-owner-recovery', async (req, res) => {
  const { token, name, password } = req.body;
  if (!token || !String(name || '').trim() || !password) return res.status(400).json({ message: 'Token, name, and password are required' });
  try {
    validatePasswordStrength(password);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    await transaction(async () => {
      const recovery = await get(
        `SELECT recovery.*
         FROM tenant_owner_recovery_requests recovery
         JOIN platform_admins admin
           ON admin.id = recovery.platform_admin_id
          AND admin.is_active = 1
          AND admin.deleted_at IS NULL
         WHERE recovery.token_hash = ?
           AND recovery.accepted_at IS NULL
           AND recovery.revoked_at IS NULL
           AND recovery.expires_at > ?`,
        [hashToken(token), new Date().toISOString()]
      );
      if (!recovery) throw Object.assign(new Error('Invalid or expired owner recovery link'), { status: 400 });
      const tenant = await get(`SELECT id FROM tenants WHERE id = ? AND deleted_at IS NULL`, [recovery.tenant_id]);
      if (!tenant) throw Object.assign(new Error('Institute is no longer available'), { status: 409 });
      const owner = await get(`SELECT id FROM users WHERE tenant_id = ? AND role = 'owner' AND deleted_at IS NULL`, [recovery.tenant_id]);
      if (owner) throw Object.assign(new Error('Institute owner has already been established'), { status: 409 });
      const email = normalizeEmail(recovery.email);
      const existingUser = await get(`SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?`, [email, email]);
      if (existingUser) throw Object.assign(new Error('The invited email already belongs to a user'), { status: 409 });

      const claimed = await run(
        `UPDATE tenant_owner_recovery_requests SET accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
        [recovery.id]
      );
      if (Number(claimed.changes ?? claimed.rowCount ?? 0) !== 1) throw Object.assign(new Error('Owner recovery link was already used'), { status: 409 });
      const passwordHash = await hashPassword(password);
      const result = await run(
        `INSERT INTO users
          (username, tenant_id, name, email, password, password_hash, role, email_verified_at,
           is_active, created_by, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
        [email, recovery.tenant_id, String(name).trim(), email, passwordHash, passwordHash]
      );
      await run(
        `UPDATE email_outbox SET status = 'cancelled', payload = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE owner_recovery_request_id IN (
           SELECT id FROM tenant_owner_recovery_requests WHERE tenant_id = ? AND id != ? AND accepted_at IS NULL AND revoked_at IS NULL
         ) AND status IN ('pending', 'retry', 'processing')`,
        [recovery.tenant_id, recovery.id]
      );
      await run(`UPDATE tenant_owner_recovery_requests SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id != ? AND accepted_at IS NULL AND revoked_at IS NULL`, [recovery.tenant_id, recovery.id]);
      await createAuditLog({
        tenantId: recovery.tenant_id, actorUserId: result.lastID, action: 'TENANT_OWNER_RECOVERY_ACCEPTED',
        entityType: 'user', entityId: result.lastID,
        newValues: { role: 'owner', emailVerified: true, active: true },
        metadata: { recoveryRequestId: recovery.id, ipAddress: req.ip || null, userAgent: req.headers['user-agent'] || null },
      });
      await run(
        `INSERT INTO platform_audit_logs
          (id, platform_admin_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at)
         VALUES (?, ?, 'TENANT_OWNER_RECOVERY_ACCEPTED', 'tenant', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          generateId('pal'),
          recovery.platform_admin_id,
          String(recovery.tenant_id),
          JSON.stringify({ recoveryRequestId: recovery.id, ownerUserId: result.lastID }),
          req.ip || null,
          req.headers['user-agent'] || null,
        ]
      );
    });
    return res.status(201).json({ message: 'Owner recovery completed. Institute access follows its current status.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (/UNIQUE|constraint/i.test(error.message || '')) return res.status(409).json({ message: 'Institute owner has already been established' });
    return res.status(500).json({ message: 'Failed to complete owner recovery' });
  }
});

router.post('/bootstrap-tenant-admin', async (req, res) => {
  if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
    return res.status(404).json({ message: 'Not found' });
  }
  const {
    bootstrapSecret,
    tenantId,
    name,
    email,
    password,
  } = req.body;

  if (!env.TENANT_BOOTSTRAP_SECRET || !bootstrapSecret || bootstrapSecret !== env.TENANT_BOOTSTRAP_SECRET) {
    return res.status(403).json({
      message: 'Invalid bootstrap secret',
    });
  }

  if (!tenantId || !name || !email || !password) {
    return res.status(400).json({
      message: 'Tenant ID, name, email, and password are required',
    });
  }

  try {
    validatePasswordStrength(password);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  try {
    const row = await get(
      `SELECT COUNT(*) as count
       FROM users
       WHERE tenant_id = ?
       AND role IN ('owner', 'director', 'admin')
       AND deleted_at IS NULL`,
      [tenantId]
    );

    if (Number(row?.count || 0) > 0) {
      return res.status(400).json({
        message: 'Tenant already has an admin user',
      });
    }

    const passwordHash = await hashPassword(password);
    const result = await run(
      `INSERT INTO users
       (
         username,
         tenant_id,
         name,
         email,
         password,
         password_hash,
         role,
         email_verified_at,
         is_active,
         created_at,
         updated_at,
         deleted_at
       )
       VALUES (?, ?, ?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [normalizeEmail(email), tenantId, String(name).trim(), normalizeEmail(email), passwordHash, passwordHash]
    );

    await run(`UPDATE users SET created_by = ? WHERE id = ?`, [result.lastID, result.lastID]);

    return res.status(201).json({
      message: 'Tenant owner created successfully',
      userId: result.lastID,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to create tenant admin',
    });
  }
});

router.post('/change-password', authMiddleware, requireTenant, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields' });

  try {
    validatePasswordStrength(newPassword);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const user = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.user.id, req.user.tenantId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await verifyPassword(currentPassword, userPasswordHash(user));
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await hashPassword(newPassword);
  await run(
    `UPDATE users
     SET password = ?,
         password_hash = ?,
         password_changed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     AND tenant_id = ?`,
    [passwordHash, passwordHash, req.user.id, req.user.tenantId]
  );

  await run(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?
     AND tenant_id = ?
     AND id != ?
     AND revoked_at IS NULL`,
    [req.user.id, req.user.tenantId, req.user.sessionId || '']
  );

  return res.json({ ok: true });
});

module.exports = router;
