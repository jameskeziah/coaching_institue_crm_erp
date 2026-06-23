const express = require('express');
const bcrypt = require('bcryptjs');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { publicUser, userRoles } = require('../utils/request');

const router = express.Router();

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const users = await all(
    `SELECT users.id, users.username, users.role, users.tenant_id, tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.tenant_id = ?
     ORDER BY users.username`,
    [req.user.tenant_id || req.user.tenantId]
  );

  res.json(users.map(publicUser));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (!userRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (existing) return res.status(400).json({ error: 'User already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const tenantId = req.user.tenant_id || req.user.tenantId;
  const result = await run(`INSERT INTO users (username, password, role, tenant_id) VALUES (?, ?, ?, ?)`, [username, hashed, role, tenantId || null]);
  const user = await get(
    `SELECT users.id, users.username, users.role, users.tenant_id, tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = ?`,
    [result.lastID]
  );

  res.json(publicUser(user));
});

router.put('/:id/role', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!userRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const tenantId = req.user.tenant_id || req.user.tenantId;
  const existing = await get(`SELECT * FROM users WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await run(`UPDATE users SET role = ? WHERE id = ? AND tenant_id = ?`, [role, id, tenantId]);
  const user = await get(
    `SELECT users.id, users.username, users.role, users.tenant_id, tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = ? AND users.tenant_id = ?`,
    [id, tenantId]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json(publicUser(user));
});

module.exports = router;
