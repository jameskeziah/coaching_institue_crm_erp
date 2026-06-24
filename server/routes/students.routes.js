const express = require('express');
const crypto = require('crypto');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId, requireFields } = require('../utils/request');

const router = express.Router();

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const rows = await all(
    `SELECT s.*, br.name AS branchName, c.name AS courseName, b.name AS batchName
     FROM students s
     LEFT JOIN branches br ON br.id = s.branch_id AND br.tenant_id = s.tenant_id
     LEFT JOIN courses c ON c.id = s.primary_course_id AND c.tenant_id = s.tenant_id
     LEFT JOIN batches b ON b.id = s.primary_batch_id AND b.tenant_id = s.tenant_id
     WHERE s.tenant_id = ? ORDER BY s.id DESC`,
    [currentTenantId(req)]
  );
  res.json(rows.map((row) => ({
    ...row,
    name: row.student_name || row.name,
    grade: row.class_level || row.grade,
    batch: row.batchName || row.batch,
    data: row.data ? JSON.parse(row.data) : null,
  })));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { name, grade, batch, attendance, data, branchId, primaryCourseId, primaryBatchId } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const tenantId = currentTenantId(req);
  let branch = null;
  let course = null;
  let batchRow = null;
  if (branchId || primaryCourseId || primaryBatchId) {
    if (!branchId || !primaryCourseId || !primaryBatchId) {
      return res.status(400).json({ error: 'branchId, primaryCourseId, and primaryBatchId are required together' });
    }
    [branch, course, batchRow] = await Promise.all([
      get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [branchId, tenantId]),
      get(`SELECT * FROM courses WHERE id = ? AND tenant_id = ?`, [primaryCourseId, tenantId]),
      get(`SELECT * FROM batches WHERE id = ? AND tenant_id = ?`, [primaryBatchId, tenantId]),
    ]);
    if (!branch || !course || !batchRow
      || String(batchRow.branch_id) !== String(branch.id)
      || String(batchRow.course_id) !== String(course.id)) {
      return res.status(400).json({ error: 'Branch, course, and batch selection is invalid' });
    }
  }

  const result = await run(
    `INSERT INTO students
      (tenant_id, name, grade, batch, attendance, data, branch_id, primary_course_id,
       primary_batch_id, student_name, parent_name, parent_phone, class_level, school_name,
       admission_id, converted_from_lead_id, status, legacy_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      tenantId,
      name,
      grade || course?.class_level || null,
      batchRow?.name || batch || null,
      attendance,
      JSON.stringify(data || {}),
      branch?.id || null,
      course?.id || null,
      batchRow?.id || null,
      name,
      req.body.parentName || data?.parentName || data?.fatherName || null,
      req.body.parentPhone || data?.primaryPhone || data?.whatsapp || null,
      req.body.classLevel || grade || course?.class_level || null,
      req.body.schoolName || data?.school || null,
      req.body.admissionId || null,
      req.body.convertedFromLeadId || null,
      req.body.status || data?.status || 'ACTIVE',
      JSON.stringify(data || {}),
    ]
  );
  if (batchRow) {
    await run(
      `INSERT INTO batch_students
        (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), tenantId, batchRow.id, String(result.lastID), req.body.joinedAt || new Date().toISOString().slice(0, 10)]
    );
  }

  res.json({ id: result.lastID });
});

router.put('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const { name, grade, batch, attendance, data, branchId, primaryCourseId, primaryBatchId } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });

  const tenantId = currentTenantId(req);
  let branch = null;
  let course = null;
  let batchRow = null;
  if (branchId || primaryCourseId || primaryBatchId) {
    [branch, course, batchRow] = await Promise.all([
      get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [branchId, tenantId]),
      get(`SELECT * FROM courses WHERE id = ? AND tenant_id = ?`, [primaryCourseId, tenantId]),
      get(`SELECT * FROM batches WHERE id = ? AND tenant_id = ?`, [primaryBatchId, tenantId]),
    ]);
    if (!branch || !course || !batchRow
      || String(batchRow.branch_id) !== String(branch.id)
      || String(batchRow.course_id) !== String(course.id)) {
      return res.status(400).json({ error: 'Branch, course, and batch selection is invalid' });
    }
  }
  await run(
    `UPDATE students SET name = ?, grade = ?, batch = ?, attendance = ?, data = ?,
     branch_id = COALESCE(?, branch_id), primary_course_id = COALESCE(?, primary_course_id),
     primary_batch_id = COALESCE(?, primary_batch_id), student_name = ?, parent_name = ?,
     parent_phone = ?, class_level = ?, school_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [
      name,
      grade || course?.class_level || existing.grade,
      batchRow?.name || batch || existing.batch,
      attendance,
      JSON.stringify(data || {}),
      branch?.id || null,
      course?.id || null,
      batchRow?.id || null,
      name,
      req.body.parentName || data?.parentName || data?.fatherName || existing.parent_name,
      req.body.parentPhone || data?.primaryPhone || data?.whatsapp || existing.parent_phone,
      req.body.classLevel || grade || course?.class_level || existing.class_level,
      req.body.schoolName || data?.school || existing.school_name,
      req.body.status || data?.status || existing.status || 'ACTIVE',
      id,
      tenantId,
    ]
  );
  if (batchRow && String(existing.primary_batch_id || '') !== String(batchRow.id)) {
    await run(
      `UPDATE batch_students SET status = 'TRANSFERRED', left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND student_id = ? AND status = 'ACTIVE'`,
      [tenantId, String(id)]
    );
    await run(
      `INSERT INTO batch_students
        (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), tenantId, batchRow.id, String(id), req.body.joinedAt || new Date().toISOString().slice(0, 10)]
    );
  }

  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  const discountHistory = await get(
    `SELECT id FROM discount_requests WHERE student_id = ? AND tenant_id = ? LIMIT 1`,
    [String(id), currentTenantId(req)]
  );
  if (discountHistory) {
    return res.status(409).json({ error: 'Students with discount audit history cannot be deleted' });
  }

  const tenantId = currentTenantId(req);
  const plans = await all(`SELECT id FROM fee_plans WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  for (const plan of plans) {
    await run(`DELETE FROM fee_components WHERE fee_plan_id = ?`, [plan.id]);
    await run(`DELETE FROM fee_installments WHERE fee_plan_id = ?`, [plan.id]);
  }

  const studentPayments = await all(
    `SELECT id FROM fee_payments WHERE student_id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  for (const payment of studentPayments) {
    await run(`DELETE FROM fee_receipts WHERE payment_id = ?`, [payment.id]);
  }

  const hardenedPlans = await all(
    `SELECT id FROM student_fee_plans WHERE student_id = ? AND tenant_id = ?`,
    [String(id), tenantId]
  );
  for (const plan of hardenedPlans) {
    await run(`DELETE FROM fee_payment_links WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
    await run(`DELETE FROM fee_discount_requests WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
    await run(`DELETE FROM student_fee_installments WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
  }

  await run(`DELETE FROM fee_payments WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM student_fee_plans WHERE student_id = ? AND tenant_id = ?`, [String(id), tenantId]);
  await run(`DELETE FROM fee_plans WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
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
