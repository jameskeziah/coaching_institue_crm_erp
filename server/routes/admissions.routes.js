const express = require('express');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId, requireFields } = require('../utils/request');

const router = express.Router();

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  const rows = await all(`SELECT * FROM admissions WHERE tenant_id = ? ORDER BY id DESC`, [currentTenantId(req)]);
  res.json(rows.map((row) => ({ ...row, data: row.data ? JSON.parse(row.data) : null })));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const result = await run(
    `INSERT INTO admissions (tenant_id, name, program, status, source, data) VALUES (?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), name, program, status, source, JSON.stringify(data || {})]
  );

  res.json({ id: result.lastID });
});

router.put('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  const { id } = req.params;
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const existing = await get(`SELECT * FROM admissions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Admission not found' });

  await run(
    `UPDATE admissions SET name = ?, program = ?, status = ?, source = ?, data = ? WHERE id = ? AND tenant_id = ?`,
    [name, program, status, source, JSON.stringify(data || {}), id, currentTenantId(req)]
  );

  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM admissions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  res.json({ ok: true });
});

module.exports = router;
