const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { run, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { publicUser } = require('../utils/request');
const { env } = require('../config/env');

const router = express.Router();

router.post('/register', async (req, res) => {
  if (!env.ALLOW_REGISTRATION) return res.status(403).json({ error: 'Registration is disabled' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (existing) return res.status(400).json({ error: 'User already exists' });

  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const hashed = await bcrypt.hash(password, 10);
  await run(`INSERT INTO users (username, password, role, tenant_id) VALUES (?, ?, ?, ?)`, [username, hashed, 'user', tenant?.id || null]);

  return res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = await get(
    `SELECT users.*, tenants.name AS tenantName, tenants.subscriptionPlan, tenants.subscriptionStatus, tenants.status AS tenantStatus
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.username = ?`,
    [username]
  );
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.tenantStatus && user.tenantStatus !== 'Active') return res.status(403).json({ error: 'Tenant is inactive' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, tenant_id: user.tenant_id || user.tenantId || null },
    env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({ token, user: publicUser(user) });
});

router.post('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields' });
  if (newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });

  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.user.id]);

  return res.json({ ok: true });
});

module.exports = router;
