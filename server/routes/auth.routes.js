const express = require('express');
const { run, get } = require('../db');
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
  sendPasswordResetEmail,
  sendVerificationEmail,
} = require('../services/mail.service');

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function userPasswordHash(user) {
  return user?.password_hash || user?.password;
}

function authUser(user) {
  return {
    ...publicUser(user),
    email: user.email || user.username || null,
    name: user.name || user.username || null,
    tenantId: user.tenant_id || user.tenantId || null,
    emailVerifiedAt: user.email_verified_at || user.emailVerifiedAt || null,
  };
}

async function createVerificationToken(user) {
  const rawToken = generateRawToken();
  await run(
    `INSERT INTO email_verification_tokens
      (id, user_id, tenant_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      generateId('evt'),
      user.id,
      user.tenant_id || user.tenantId,
      hashToken(rawToken),
      getFutureDate({ hours: env.EMAIL_VERIFICATION_TOKEN_HOURS }),
    ]
  );
  return rawToken;
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
    const result = await run(
      `INSERT INTO users
        (username, name, email, password, password_hash, role, tenant_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [username, name, email, passwordHash, passwordHash, 'user', tenant?.id || null]
    );

    const user = await get(`SELECT * FROM users WHERE id = ?`, [result.lastID]);
    const verificationToken = await createVerificationToken(user);
    await sendVerificationEmail({ email: user.email, token: verificationToken });

    return res.status(201).json({
      ok: true,
      message: 'Registration successful. Please verify your email.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const login = normalizeEmail(req.body.email || req.body.username);
    const { password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await get(
      `SELECT users.*, tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus, tenants.status AS tenantStatus
       FROM users
       LEFT JOIN tenants ON tenants.id = users.tenant_id
       WHERE (LOWER(users.email) = ? OR LOWER(users.username) = ?)
       AND users.deleted_at IS NULL`,
      [login, login]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_active === 0) return res.status(403).json({ error: 'User is inactive' });
    if (user.tenantStatus && user.tenantStatus !== 'Active') return res.status(403).json({ error: 'Tenant is inactive' });

    const match = await verifyPassword(password, userPasswordHash(user));
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

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
      `SELECT s.*, u.username, u.name, u.email, u.role, u.email_verified_at, u.is_active
       FROM user_sessions s
       JOIN users u
         ON u.id = s.user_id
        AND u.tenant_id = s.tenant_id
       WHERE s.refresh_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND u.deleted_at IS NULL`,
      [hashToken(refreshToken), new Date().toISOString()]
    );

    if (!session || session.is_active === 0) {
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
      const rawToken = generateRawToken();
      await run(
        `INSERT INTO password_reset_tokens
          (id, user_id, tenant_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          generateId('prt'),
          user.id,
          user.tenant_id,
          hashToken(rawToken),
          getFutureDate({ minutes: env.RESET_PASSWORD_TOKEN_MINUTES }),
        ]
      );

      await sendPasswordResetEmail({
        email: user.email,
        token: rawToken,
      });
    }

    return res.json({
      message: 'If this email exists, a reset link has been sent.',
    });
  } catch (error) {
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
    const verificationToken = await get(
      `SELECT *
       FROM email_verification_tokens
       WHERE token_hash = ?
       AND used_at IS NULL
       AND expires_at > ?`,
      [hashToken(token), new Date().toISOString()]
    );

    if (!verificationToken) {
      return res.status(400).json({
        message: 'Invalid or expired verification token',
      });
    }

    await run(
      `UPDATE users
       SET email_verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?`,
      [verificationToken.user_id, verificationToken.tenant_id]
    );

    await run(
      `UPDATE email_verification_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [verificationToken.id]
    );

    return res.json({
      message: 'Email verified successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to verify email',
    });
  }
});

router.post('/resend-verification', authMiddleware, requireTenant, async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.user.id, req.user.tenantId]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email_verified_at) return res.json({ message: 'Email is already verified' });

    const token = await createVerificationToken(user);
    await sendVerificationEmail({ email: user.email, token });

    return res.json({ message: 'Verification email sent' });
  } catch (error) {
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
