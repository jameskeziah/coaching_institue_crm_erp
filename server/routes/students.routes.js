const express = require('express');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId, requireFields } = require('../utils/request');

const router = express.Router();

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const rows = await all(`SELECT * FROM students WHERE tenant_id = ? ORDER BY id DESC`, [currentTenantId(req)]);
  res.json(rows.map((row) => ({ ...row, data: row.data ? JSON.parse(row.data) : null })));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const result = await run(
    `INSERT INTO students (tenant_id, name, grade, batch, attendance, data) VALUES (?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), name, grade, batch, attendance, JSON.stringify(data || {})]
  );

  res.json({ id: result.lastID });
});

router.put('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });

  await run(
    `UPDATE students SET name = ?, grade = ?, batch = ?, attendance = ?, data = ? WHERE id = ? AND tenant_id = ?`,
    [name, grade, batch, attendance, JSON.stringify(data || {}), id, currentTenantId(req)]
  );

  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });

  const plans = await all(`SELECT id FROM fee_plans WHERE student_id = ?`, [id]);
  for (const plan of plans) {
    await run(`DELETE FROM fee_components WHERE fee_plan_id = ?`, [plan.id]);
    await run(`DELETE FROM fee_installments WHERE fee_plan_id = ?`, [plan.id]);
    const payments = await all(`SELECT id FROM fee_payments WHERE fee_plan_id = ?`, [plan.id]);
    for (const payment of payments) {
      await run(`DELETE FROM fee_receipts WHERE payment_id = ?`, [payment.id]);
    }
  }

  await run(`DELETE FROM fee_payments WHERE student_id = ?`, [id]);
  await run(`DELETE FROM fee_plans WHERE student_id = ?`, [id]);
  await run(`DELETE FROM parent_alert_logs WHERE student_id = ?`, [id]);
  await run(`DELETE FROM parent_call_logs WHERE student_id = ?`, [id]);
  await run(`DELETE FROM attendance_correction_requests WHERE student_id = ?`, [id]);
  await run(`DELETE FROM attendance_records WHERE student_id = ?`, [id]);
  await run(`DELETE FROM follow_up_tasks WHERE student_id = ?`, [id]);
  await run(`DELETE FROM student_history WHERE student_id = ?`, [id]);
  await run(`DELETE FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);

  res.json({ ok: true });
});

router.get('/:id/history', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT id FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const rows = await all(`SELECT * FROM student_history WHERE student_id = ? ORDER BY eventDate DESC, id DESC`, [id]);
  res.json(rows);
});

router.post('/:id/history', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const { type, title, detail, eventDate } = req.body;
  const validationError = requireFields(req.body, ['type', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });

  const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const result = await run(
    `INSERT INTO student_history (student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, title, detail, eventDate || new Date().toISOString(), new Date().toISOString()]
  );

  res.json(await get(`SELECT * FROM student_history WHERE id = ?`, [result.lastID]));
});

module.exports = router;
