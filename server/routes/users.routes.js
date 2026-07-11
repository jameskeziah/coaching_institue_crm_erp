const express = require('express');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { requireVerifiedEmail } = require('../middleware/verified-email');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { publicUser, userRoles } = require('../utils/request');
const { hashPassword, validatePasswordStrength } = require('../services/password.service');

const router = express.Router();

router.get('/counsellors', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.user.tenantId;
    const counsellors = await all(
      `SELECT id, name, username, email, role, is_active
       FROM users
       WHERE tenant_id = ?
       AND is_active = 1
       AND deleted_at IS NULL
       AND role IN (?, ?, ?, ?)
       ORDER BY COALESCE(name, username, email) ASC`,
      [tenantId, ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.COUNSELLOR]
    );

    return res.json({
      data: counsellors.map((user) => ({
        id: user.id,
        fullName: user.name || user.username || user.email,
        email: user.email || user.username,
        role: user.role,
        isActive: Boolean(user.is_active),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load counsellors', error: 'Failed to load counsellors' });
  }
});

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const users = await all(
    `SELECT users.id, users.username, users.name, users.email, users.role, users.tenant_id, users.email_verified_at,
            tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.tenant_id = ?
     AND users.deleted_at IS NULL
     ORDER BY COALESCE(users.name, users.username)`,
    [req.user.tenant_id || req.user.tenantId]
  );

  res.json(users.map(publicUser));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const email = String(req.body.email || req.body.username || '').trim().toLowerCase();
  const username = String(req.body.username || email).trim();
  const name = String(req.body.name || username).trim();
  const { password, role = 'user' } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: 'Missing email/username or password' });
  try {
    validatePasswordStrength(password);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!userRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role === ROLES.OWNER && req.user.role !== ROLES.OWNER) {
    return res.status(403).json({ error: 'Only an owner can create another owner' });
  }

  const existing = await get(`SELECT * FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL`, [username, email]);
  if (existing) return res.status(400).json({ error: 'User already exists' });

  const hashed = await hashPassword(password);
  const tenantId = req.user.tenant_id || req.user.tenantId;
  const result = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [username, name, email, hashed, hashed, role, tenantId || null, req.user.id || null]
  );
  const user = await get(
    `SELECT users.id, users.username, users.name, users.email, users.role, users.tenant_id, users.email_verified_at,
            tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = ?`,
    [result.lastID]
  );

  res.json(publicUser(user));
});

async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body;
  const tenantId = req.user.tenant_id || req.user.tenantId;

  const allowedRoles = [
    ROLES.DIRECTOR,
    ROLES.ADMIN,
    ROLES.ACCOUNTANT,
    ROLES.COUNSELLOR,
    ROLES.TEACHER,
    ROLES.USER,
  ];

  if (req.user.role === ROLES.OWNER) allowedRoles.unshift(ROLES.OWNER);

  if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(id) === String(req.user.id)) return res.status(400).json({ error: 'You cannot change your own role' });

  const existing = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [id, tenantId]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (existing.role === ROLES.OWNER && role !== ROLES.OWNER) {
    const ownerCount = await get(
      `SELECT COUNT(*) AS count
       FROM users
       WHERE tenant_id = ? AND role = ? AND deleted_at IS NULL`,
      [tenantId, ROLES.OWNER]
    );
    if (Number(ownerCount?.count || 0) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last owner' });
    }
  }

  await run(
    `UPDATE users
     SET role = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [role, id, tenantId]
  );
  const user = await get(
    `SELECT users.id, users.username, users.name, users.email, users.role, users.tenant_id, users.email_verified_at,
            tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = ? AND users.tenant_id = ? AND users.deleted_at IS NULL`,
    [id, tenantId]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json(publicUser(user));
}

router.patch('/:id/role', authMiddleware, requireTenant, requireVerifiedEmail, requireAnyRole(ROLE_GROUPS.MANAGEMENT), updateUserRole);
router.put('/:id/role', authMiddleware, requireTenant, requireVerifiedEmail, requireAnyRole(ROLE_GROUPS.MANAGEMENT), updateUserRole);

module.exports = router;
