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

const router = express.Router();
const ACCESS_ENABLED_STATUSES = new Set(['active', 'trialing']);

class InvalidVerificationTokenError extends Error {
  constructor(message = 'Invalid or expired verification token') {
    super(message);
    this.name = 'InvalidVerificationTokenError';
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
    `UPDATE email_verification_tokens
     SET revoked_at = CURRENT_TIMESTAMP,
         revoke_reason = 'superseded'
     WHERE user_id = ?
       AND tenant_id = ?
       AND used_at IS NULL
       AND revoked_at IS NULL`,
    [user.id, user.tenant_id || user.tenantId]
  );

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

    await transaction(async () => {
      const verificationToken = await get(
        `SELECT id
         FROM email_verification_tokens
         WHERE token_hash = ?
           AND used_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [tokenHash, trialStartedAt]
      );

      if (!verificationToken) {
        throw new InvalidVerificationTokenError();
      }

      const claimed = await run(
        `UPDATE email_verification_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND used_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?`,
        [verificationToken.id, trialStartedAt]
      );

      if (!changedOne(claimed)) {
        throw new InvalidVerificationTokenError('Verification token has already been used or expired');
      }

      const detail = await get(
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
         WHERE tokens.id = ?`,
        [verificationToken.id]
      );

      if (!detail) {
        throw new InvalidVerificationTokenError();
      }

      const userUpdate = await run(
        `UPDATE users
         SET email_verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND tenant_id = ?
           AND deleted_at IS NULL`,
        [detail.user_id, detail.tenant_id]
      );

      if (!changedOne(userUpdate)) {
        throw new Error('Failed to verify user email');
      }

      const activatesPendingOwner =
        detail.role === 'owner' &&
        normalizeStatus(detail.tenant_status) === 'pending_verification';

      if (!activatesPendingOwner) {
        return;
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
        [detail.tenant_id]
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
          detail.tenant_id,
        ]
      );

      if (!changedOne(subscriptionUpdate)) {
        throw new Error('Failed to activate pending subscription');
      }
    });

    return res.json({
      message: 'Email verified successfully',
    });
  } catch (error) {
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

    const token = await transaction(async () => createVerificationToken(user));
    await sendVerificationTokenEmail({ token }).catch((error) => {
      if (isMailDeliveryError(error)) {
        console.warn('Public verification resend delivery failed', { code: error.code });
        return;
      }
      throw error;
    });

    return res.json(response);
  } catch (error) {
    return res.json(response);
  }
});

router.post('/resend-verification', authMiddleware, requireTenant, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.user.id, req.user.tenantId]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email_verified_at) return res.json({ message: 'Email is already verified' });

    const token = await transaction(async () => createVerificationToken(user));
    await sendVerificationTokenEmail({ token });

    return res.json({ message: 'Verification email sent' });
  } catch (error) {
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
    const invite = await get(
      `SELECT *
       FROM user_invites
       WHERE token_hash = ?
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > ?`,
      [hashToken(token), new Date().toISOString()]
    );

    if (!invite) {
      return res.status(400).json({
        message: 'Invalid or expired invite',
      });
    }

    const existing = await get(
      `SELECT * FROM users WHERE tenant_id = ? AND LOWER(email) = ? AND deleted_at IS NULL`,
      [invite.tenant_id, normalizeEmail(invite.email)]
    );
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const passwordHash = await hashPassword(password);
    await run(
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
         created_by,
         created_at,
         updated_at,
         deleted_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [
        normalizeEmail(invite.email),
        invite.tenant_id,
        String(name).trim(),
        normalizeEmail(invite.email),
        passwordHash,
        passwordHash,
        invite.role,
        invite.invited_by,
      ]
    );

    await run(
      `UPDATE user_invites
       SET accepted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [invite.id]
    );

    return res.status(201).json({
      message: 'Invite accepted successfully. You can now log in.',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to accept invite',
    });
  }
});

router.post('/bootstrap-tenant-admin', async (req, res) => {
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
