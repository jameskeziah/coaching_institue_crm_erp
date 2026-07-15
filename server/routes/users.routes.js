const express = require('express');
const { run, all, get, transaction } = require('../services/db.service');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { requireVerifiedEmail } = require('../middleware/verified-email');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { publicUser, userRoles } = require('../utils/request');
const { hashPassword, validatePasswordStrength } = require('../services/password.service');
const { createAuditLog } = require('../services/auditLog.service');

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

router.post('/', authMiddleware, requireTenant, requireVerifiedEmail, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
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
  if (role === ROLES.OWNER) return res.status(400).json({ error: 'Owner creation requires the dedicated owner recovery or transfer workflow' });

  const tenantId = req.user.tenant_id || req.user.tenantId;
  try {
    const hashed = await hashPassword(password);
    const user = await transaction(async () => {
      const existing = await get(`SELECT id FROM users WHERE username = ? OR LOWER(email) = ?`, [username, email]);
      if (existing) throw Object.assign(new Error('User already exists'), { status: 409 });

      const result = await run(
        `INSERT INTO users
          (username, name, email, password, password_hash, role, tenant_id, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [username, name, email, hashed, hashed, role, tenantId || null, req.user.id || null]
      );
      const createdUser = await get(
        `SELECT users.id, users.username, users.name, users.email, users.role, users.tenant_id, users.email_verified_at,
                tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
         FROM users
         LEFT JOIN tenants ON tenants.id = users.tenant_id
         WHERE users.id = ?`,
        [result.lastID]
      );

      await createAuditLog({
        tenantId, actorUserId: req.user.id, action: 'USER_CREATED', entityType: 'user', entityId: result.lastID,
        newValues: { role: createdUser.role, email: createdUser.email, active: true },
      });
      return createdUser;
    });

    return res.json(publicUser(user));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (/UNIQUE|constraint/i.test(error.message || '')) return res.status(409).json({ error: 'User already exists' });
    return res.status(500).json({ error: 'Failed to create user' });
  }
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

  if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(id) === String(req.user.id)) return res.status(400).json({ error: 'You cannot change your own role' });

  try {
    const user = await transaction(async () => {
      const existing = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [id, tenantId]);
      if (!existing) throw Object.assign(new Error('User not found'), { status: 404 });

      if (existing.role === ROLES.OWNER && role !== ROLES.OWNER) {
        const ownerCount = await get(
          `SELECT COUNT(*) AS count
           FROM users
           WHERE tenant_id = ?
             AND role = ?
             AND deleted_at IS NULL`,
          [tenantId, ROLES.OWNER]
        );
        if (Number(ownerCount?.count || 0) <= 1) {
          throw Object.assign(new Error('Cannot remove the last owner'), { status: 400 });
        }
      }

      await run(
        `UPDATE users
         SET role = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [role, id, tenantId]
      );
      const updatedUser = await get(
        `SELECT users.id, users.username, users.name, users.email, users.role, users.tenant_id, users.email_verified_at,
                tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
         FROM users
         LEFT JOIN tenants ON tenants.id = users.tenant_id
         WHERE users.id = ? AND users.tenant_id = ? AND users.deleted_at IS NULL`,
        [id, tenantId]
      );
      if (!updatedUser) throw Object.assign(new Error('User not found'), { status: 404 });

      await createAuditLog({
        tenantId, actorUserId: req.user.id, action: 'USER_ROLE_CHANGED', entityType: 'user', entityId: id,
        oldValues: { role: existing.role }, newValues: { role: updatedUser.role },
      });
      return updatedUser;
    });

    return res.json(publicUser(user));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update user role' });
  }
}

router.patch('/:id/role', authMiddleware, requireTenant, requireVerifiedEmail, requireAnyRole(ROLE_GROUPS.MANAGEMENT), updateUserRole);
router.put('/:id/role', authMiddleware, requireTenant, requireVerifiedEmail, requireAnyRole(ROLE_GROUPS.MANAGEMENT), updateUserRole);

module.exports = router;
