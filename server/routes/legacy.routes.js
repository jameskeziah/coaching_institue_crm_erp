const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { run, all, get } = require('../db');
const { env } = require('../config/env');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');

const SECRET = env.JWT_SECRET;
const ALLOW_REGISTRATION = env.ALLOW_REGISTRATION;

const router = express.Router();

router.get('/api', (req, res) => {
  res.json({
    ok: true,
    service: 'ProTrack Institute OS API',
    endpoints: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/config',
      '/api/tenant/current',
      '/api/users',
      '/api/teachers',
      '/api/teacher-work-controls',
      '/api/teacher-management-actions',
      '/api/teacher-reviews',
      '/api/students',
      '/api/follow-ups',
      '/api/fees/summary',
      '/api/fee-structures',
      '/api/fee-plans',
      '/api/fee-payments',
      '/api/vendors',
      '/api/expenses',
      '/api/recurring-expenses',
      '/api/petty-cash',
      '/api/expense-reports',
      '/api/attendance/sessions',
      '/api/attendance/dashboard',
      '/api/attendance/reports',
      '/api/attendance/parent-alert-logs',
      '/api/attendance/parent-call-logs',
      '/api/staff-attendance/today',
      '/api/automation/attendance',
      '/api/automation/fees',
      '/api/automation/follow-ups',
      '/api/whatsapp/status',
      '/api/whatsapp/test',
      '/api/message-templates',
      '/api/parent-portal/lookup',
      '/api/ai-lab/dashboard',
      '/api/ai-lab/courses',
      '/api/ai-lab/students',
      '/api/ai-lab/attendance',
      '/api/ai-lab/devices',
      '/api/ai-lab/projects',
      '/api/ai-lab/assignments',
      '/api/ai-lab/feedback',
      '/api/ai-lab/portfolios',
      '/api/ai-lab/certificates',
      '/api/academic/dashboard',
      '/api/academic/syllabus',
      '/api/academic/calendar',
      '/api/academic/timetable',
      '/api/academic/lecture-plans',
      '/api/academic/delivery-logs',
      '/api/academic/homework',
      '/api/academic/tests',
      '/api/academic/test-results',
      '/api/academic/doubt-sessions',
      '/api/academic/revision-plans',
      '/api/academic/remedial-actions',
      '/api/test-performance/dashboard',
      '/api/test-performance/tests',
      '/api/test-performance/results',
      '/api/test-performance/question-analysis',
      '/api/test-performance/parent-reports',
      '/api/test-performance/teacher-impact',
      '/api/test-performance/remedial-students',
      '/api/test-performance/omr-uploads',
      '/api/leave-requests',
      '/api/students/:id/history',
      '/api/admissions',
      '/api/ontology/entities',
      '/api/ontology/relations',
      '/api/ontology/classifications',
    ],
  });
});

router.get('/api/config', (req, res) => {
  res.json({
    allowRegistration: ALLOW_REGISTRATION,
  });
});

async function ensure() {
  await migrate();
}

const userRoles = ROLE_GROUPS.ALL_AUTHENTICATED;

function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length) {
    return `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`;
  }
  return null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tenant_id: user.tenant_id || user.tenantId || null,
    tenantName: user.tenantName || null,
    subscriptionPlan: user.subscriptionPlan || null,
    subscriptionStatus: user.subscriptionStatus || null,
  };
}

function currentTenantId(req) {
  return req.user?.tenant_id || req.user?.tenantId || null;
}

// Auth: Register
router.post('/api/auth/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) return res.status(403).json({ error: 'Registration is disabled' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const existing = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (existing) return res.status(400).json({ error: 'User already exists' });
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const hashed = await bcrypt.hash(password, 10);
  await run(`INSERT INTO users (username, password, role, tenant_id) VALUES (?, ?, ?, ?)`, [username, hashed, 'user', tenant?.id || null]);
  res.json({ ok: true });
});

// Auth: Login
router.post('/api/auth/login', async (req, res) => {
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
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, tenant_id: user.tenant_id || user.tenantId || null }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: publicUser(user) });
});

router.get('/api/tenant/current', authMiddleware, requireTenant, async (req, res) => {
  const tenantId = req.user.tenant_id || req.user.tenantId;
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  const tenant = await get(`SELECT id, name, slug, subscriptionPlan, subscriptionStatus, billingEmail, status, createdAt, updatedAt FROM tenants WHERE id = ?`, [tenantId]);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json(tenant);
});

router.post('/api/auth/change-password', authMiddleware, requireTenant, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields' });
  if (newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });

  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.user.id]);
  res.json({ ok: true });
});

router.get('/api/users', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
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

router.post('/api/users', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
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

router.put('/api/users/:id/role', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
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

// Teachers CRUD
router.get('/api/teachers', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM teachers WHERE tenant_id = ? ORDER BY id DESC`, [currentTenantId(req)]);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

router.post('/api/teachers', authMiddleware, requireTenant, async (req, res) => {
  const { name, subject, month, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO teachers (tenant_id, name, subject, month, data, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`, [currentTenantId(req), name, subject, month, JSON.stringify(data || {}), now]);
  res.json({ id: result.lastID });
});

router.put('/api/teachers/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { name, subject, month, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM teachers WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Teacher not found' });
  const now = new Date().toISOString();
  await run(`UPDATE teachers SET name = ?, subject = ?, month = ?, data = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`, [name, subject, month, JSON.stringify(data || {}), now, id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.delete('/api/teachers/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const existing = await get(`SELECT * FROM teachers WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Teacher not found' });
  await run(`DELETE FROM staff_attendance_records WHERE staff_id = ?`, [id]);
  await run(`DELETE FROM leave_requests WHERE staff_id = ?`, [id]);
  await run(`DELETE FROM teacher_work_controls WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teacher_management_actions WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teacher_reviews WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teachers WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.get('/api/teacher-work-controls', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT teacher_work_controls.*, teachers.name AS teacherName, teachers.subject AS teacherSubject
     FROM teacher_work_controls
     INNER JOIN teachers ON teachers.id = teacher_work_controls.teacher_id
     ORDER BY teacher_work_controls.updatedAt DESC, teacher_work_controls.id DESC`
  );
  res.json(rows);
});

router.get('/api/teachers/:id/work-controls', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_work_controls WHERE teacher_id = ? ORDER BY updatedAt DESC, id DESC`, [req.params.id]);
  res.json(rows);
});

router.post('/api/teacher-work-controls', authMiddleware, requireTenant, async (req, res) => {
  const { teacher_id, controlType, title, plannedValue, actualValue, status = 'Open', dueDate, evidenceUrl, remarks } = req.body;
  const validationError = requireFields(req.body, ['teacher_id', 'controlType', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO teacher_work_controls (teacher_id, controlType, title, plannedValue, actualValue, status, dueDate, evidenceUrl, remarks, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacher_id, controlType, title, plannedValue, actualValue, status, dueDate, evidenceUrl, remarks, now, now]
  );
  res.json(await get(`SELECT * FROM teacher_work_controls WHERE id = ?`, [result.lastID]));
});

router.put('/api/teacher-work-controls/:id', authMiddleware, requireTenant, async (req, res) => {
  const { controlType, title, plannedValue, actualValue, status = 'Open', dueDate, evidenceUrl, remarks } = req.body;
  const validationError = requireFields(req.body, ['controlType', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM teacher_work_controls WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Work control not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE teacher_work_controls SET controlType = ?, title = ?, plannedValue = ?, actualValue = ?, status = ?, dueDate = ?, evidenceUrl = ?, remarks = ?, updatedAt = ? WHERE id = ?`,
    [controlType, title, plannedValue, actualValue, status, dueDate, evidenceUrl, remarks, now, req.params.id]
  );
  res.json(await get(`SELECT * FROM teacher_work_controls WHERE id = ?`, [req.params.id]));
});

router.delete('/api/teacher-work-controls/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM teacher_work_controls WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/teacher-management-actions', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT teacher_management_actions.*, teachers.name AS teacherName, teachers.subject AS teacherSubject
     FROM teacher_management_actions
     INNER JOIN teachers ON teachers.id = teacher_management_actions.teacher_id
     ORDER BY teacher_management_actions.updatedAt DESC, teacher_management_actions.id DESC`
  );
  res.json(rows);
});

router.get('/api/teachers/:id/management-actions', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_management_actions WHERE teacher_id = ? ORDER BY updatedAt DESC, id DESC`, [req.params.id]);
  res.json(rows);
});

router.post('/api/teacher-management-actions', authMiddleware, requireTenant, async (req, res) => {
  const { teacher_id, month, actionType, warningLevel, reason, decision, salaryDecision, status = 'Open' } = req.body;
  const validationError = requireFields(req.body, ['teacher_id', 'actionType', 'reason']);
  if (validationError) return res.status(400).json({ error: validationError });
  const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO teacher_management_actions (teacher_id, month, actionType, warningLevel, reason, decision, salaryDecision, status, decidedBy, decidedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacher_id, month, actionType, warningLevel, reason, decision, salaryDecision, status, req.user.username, now, now, now]
  );
  res.json(await get(`SELECT * FROM teacher_management_actions WHERE id = ?`, [result.lastID]));
});

router.put('/api/teacher-management-actions/:id', authMiddleware, requireTenant, async (req, res) => {
  const { month, actionType, warningLevel, reason, decision, salaryDecision, status = 'Open' } = req.body;
  const validationError = requireFields(req.body, ['actionType', 'reason']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM teacher_management_actions WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Management action not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE teacher_management_actions SET month = ?, actionType = ?, warningLevel = ?, reason = ?, decision = ?, salaryDecision = ?, status = ?, decidedBy = ?, decidedAt = ?, updatedAt = ? WHERE id = ?`,
    [month, actionType, warningLevel, reason, decision, salaryDecision, status, req.user.username, now, now, req.params.id]
  );
  res.json(await get(`SELECT * FROM teacher_management_actions WHERE id = ?`, [req.params.id]));
});

router.delete('/api/teacher-management-actions/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM teacher_management_actions WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Teacher review CRUD
function normalizeReview(row) {
  return {
    ...row,
    scores: row.scores ? JSON.parse(row.scores) : {},
  };
}

router.get('/api/teacher-reviews', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT
      teacher_reviews.*,
      teachers.name AS teacherName,
      teachers.subject AS teacherSubject
    FROM teacher_reviews
    INNER JOIN teachers ON teachers.id = teacher_reviews.teacher_id
    ORDER BY teacher_reviews.updatedAt DESC, teacher_reviews.id DESC`
  );
  res.json(rows.map(normalizeReview));
});

router.get('/api/teachers/:id/reviews', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const rows = await all(
    `SELECT
      teacher_reviews.*,
      teachers.name AS teacherName,
      teachers.subject AS teacherSubject
    FROM teacher_reviews
    INNER JOIN teachers ON teachers.id = teacher_reviews.teacher_id
    WHERE teacher_reviews.teacher_id = ?
    ORDER BY teacher_reviews.updatedAt DESC, teacher_reviews.id DESC`,
    [id]
  );
  res.json(rows.map(normalizeReview));
});

router.post('/api/teacher-reviews', authMiddleware, requireTenant, async (req, res) => {
  const { teacher_id, month, scores } = req.body;
  if (!teacher_id || !month) return res.status(400).json({ error: 'Missing teacher_id or month' });

  const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

  const now = new Date().toISOString();
  await run(
    `INSERT INTO teacher_reviews (teacher_id, month, scores, updatedAt, createdAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(teacher_id, month)
     DO UPDATE SET scores = excluded.scores, updatedAt = excluded.updatedAt`,
    [teacher_id, month, JSON.stringify(scores || {}), now, now]
  );

  const row = await get(
    `SELECT * FROM teacher_reviews WHERE teacher_id = ? AND month = ?`,
    [teacher_id, month]
  );
  res.json(normalizeReview(row));
});

router.put('/api/teacher-reviews/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { month, scores } = req.body;
  if (!month) return res.status(400).json({ error: 'Missing month' });

  const existing = await get(`SELECT * FROM teacher_reviews WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  const now = new Date().toISOString();
  await run(
    `UPDATE teacher_reviews SET month = ?, scores = ?, updatedAt = ? WHERE id = ?`,
    [month, JSON.stringify(scores || {}), now, id]
  );
  const row = await get(`SELECT * FROM teacher_reviews WHERE id = ?`, [id]);
  res.json(normalizeReview(row));
});

router.delete('/api/teacher-reviews/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM teacher_reviews WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Students CRUD
router.get('/api/students', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM students WHERE tenant_id = ? ORDER BY id DESC`, [currentTenantId(req)]);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

router.post('/api/students', authMiddleware, requireTenant, async (req, res) => {
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(`INSERT INTO students (tenant_id, name, grade, batch, attendance, data) VALUES (?, ?, ?, ?, ?, ?)`, [currentTenantId(req), name, grade, batch, attendance, JSON.stringify(data || {})]);
  res.json({ id: result.lastID });
});

router.put('/api/students/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  await run(`UPDATE students SET name = ?, grade = ?, batch = ?, attendance = ?, data = ? WHERE id = ? AND tenant_id = ?`, [name, grade, batch, attendance, JSON.stringify(data || {}), id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.delete('/api/students/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
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
  await run(`DELETE FROM students WHERE id = ?`, [id]);
  res.json({ ok: true });
});

router.get('/api/students/:id/history', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT id FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rows = await all(`SELECT * FROM student_history WHERE student_id = ? ORDER BY eventDate DESC, id DESC`, [id]);
  res.json(rows);
});

router.post('/api/students/:id/history', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { type, title, detail, eventDate } = req.body;
  const validationError = requireFields(req.body, ['type', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO student_history (student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, title, detail, eventDate, now]
  );
  const row = await get(`SELECT * FROM student_history WHERE id = ?`, [result.lastID]);
  res.json(row);
});

router.put('/api/student-history/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { type, title, detail, eventDate } = req.body;
  const validationError = requireFields(req.body, ['type', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM student_history WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'History record not found' });
  await run(`UPDATE student_history SET type = ?, title = ?, detail = ?, eventDate = ? WHERE id = ?`, [type, title, detail, eventDate, id]);
  const row = await get(`SELECT * FROM student_history WHERE id = ?`, [id]);
  res.json(row);
});

router.delete('/api/student-history/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM student_history WHERE id = ?`, [id]);
  res.json({ ok: true });
});

function normalizeFollowUpTask(row) {
  if (!row) return row;
  const today = new Date().toISOString().slice(0, 10);
  const savedStatus = row.status || 'Open';
  const computedStatus = savedStatus === 'Open' && row.dueDate && row.dueDate < today ? 'Overdue' : savedStatus;
  return {
    ...row,
    priority: row.priority || 'Medium',
    status: computedStatus,
  };
}

function followUpOrderSql() {
  return `
    CASE COALESCE(follow_up_tasks.priority, 'Medium')
      WHEN 'Urgent' THEN 1
      WHEN 'High' THEN 2
      WHEN 'Medium' THEN 3
      ELSE 4
    END ASC,
    follow_up_tasks.dueDate ASC,
    follow_up_tasks.id DESC`;
}

async function getFollowUpTask(id) {
  const row = await get(
    `SELECT follow_up_tasks.*, COALESCE(students.name, follow_up_tasks.studentName) AS studentName
     FROM follow_up_tasks
     LEFT JOIN students ON students.id = follow_up_tasks.student_id
     WHERE follow_up_tasks.id = ?`,
    [id]
  );
  return normalizeFollowUpTask(row);
}

router.get('/api/follow-ups', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const where = [];
  const params = [];
  const { student_id, status, date, from, to, assignedTo } = req.query;

  if (student_id) {
    where.push('follow_up_tasks.student_id = ?');
    params.push(student_id);
  }
  if (assignedTo) {
    where.push('LOWER(COALESCE(follow_up_tasks.assignedTo, ?)) = LOWER(?)');
    params.push('', assignedTo);
  }
  if (date) {
    where.push('follow_up_tasks.dueDate = ?');
    params.push(date);
  }
  if (from) {
    where.push('follow_up_tasks.dueDate >= ?');
    params.push(from);
  }
  if (to) {
    where.push('follow_up_tasks.dueDate <= ?');
    params.push(to);
  }
  if (status === 'Open') {
    where.push("COALESCE(follow_up_tasks.status, 'Open') = 'Open'");
  } else if (status === 'Overdue') {
    where.push("COALESCE(follow_up_tasks.status, 'Open') = 'Open' AND follow_up_tasks.dueDate < ?");
    params.push(today);
  } else if (status) {
    where.push('follow_up_tasks.status = ?');
    params.push(status);
  }

  const rows = await all(
    `SELECT follow_up_tasks.*, COALESCE(students.name, follow_up_tasks.studentName) AS studentName
     FROM follow_up_tasks
     LEFT JOIN students ON students.id = follow_up_tasks.student_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${followUpOrderSql()}`,
    params
  );
  res.json(rows.map(normalizeFollowUpTask));
});

router.post('/api/follow-ups', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const {
    student_id,
    taskType,
    dueDate,
    priority = 'Medium',
    assignedTo,
    status = 'Open',
    notes,
    linkedType,
    linkedId,
  } = req.body;
  const validationError = requireFields(req.body, ['student_id', 'taskType', 'dueDate']);
  if (validationError) return res.status(400).json({ error: validationError });
  const student = await get(`SELECT * FROM students WHERE id = ?`, [student_id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO follow_up_tasks (student_id, studentName, taskType, dueDate, priority, assignedTo, status, notes, linkedType, linkedId, createdBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, student.name, taskType, dueDate, priority, assignedTo || req.user.username, status, notes, linkedType, linkedId || null, req.user.username, now, now]
  );
  res.json(await getFollowUpTask(result.lastID));
});

router.put('/api/follow-ups/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const { taskType, dueDate, priority = 'Medium', assignedTo, status = 'Open', notes, linkedType, linkedId } = req.body;
  const validationError = requireFields(req.body, ['taskType', 'dueDate']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM follow_up_tasks WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Follow-up task not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE follow_up_tasks
     SET taskType = ?, dueDate = ?, priority = ?, assignedTo = ?, status = ?, notes = ?, linkedType = ?, linkedId = ?, updatedAt = ?
     WHERE id = ?`,
    [taskType, dueDate, priority, assignedTo, status, notes, linkedType, linkedId || null, now, req.params.id]
  );
  res.json(await getFollowUpTask(req.params.id));
});

router.patch('/api/follow-ups/:id/complete', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const existing = await get(`SELECT * FROM follow_up_tasks WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Follow-up task not found' });
  const now = new Date().toISOString();
  const outcome = String(req.body.outcome || req.body.completionOutcome || '').trim();
  const completedBy = req.body.completedBy || req.user.username;
  await run(
    `UPDATE follow_up_tasks SET status = ?, completionOutcome = ?, completedAt = ?, completedBy = ?, updatedAt = ? WHERE id = ?`,
    ['Done', outcome || null, now, completedBy, now, req.params.id]
  );
  await run(
    `INSERT INTO student_history (student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      existing.student_id,
      'Follow-up',
      `${existing.taskType || 'Follow-up'} completed`,
      [
        existing.notes ? `Task note: ${existing.notes}` : '',
        outcome ? `Outcome: ${outcome}` : 'Outcome: Marked done',
        `Completed by: ${completedBy}`,
      ].filter(Boolean).join('\n'),
      now.slice(0, 10),
      now,
    ]
  );
  res.json(await getFollowUpTask(req.params.id));
});

router.delete('/api/follow-ups/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM follow_up_tasks WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.post('/api/automation/follow-ups', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { minAgeDays = 3, assignedTo, dryRun = false } = req.body || {};
  const threshold = Math.max(1, Number(minAgeDays || 3));
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - threshold);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const params = [cutoffDate];
  const assignedFilter = assignedTo ? 'AND LOWER(COALESCE(follow_up_tasks.assignedTo, ?)) = LOWER(?)' : '';
  if (assignedTo) params.push('', assignedTo);

  const rows = await all(
    `SELECT follow_up_tasks.*, COALESCE(students.name, follow_up_tasks.studentName) AS studentName
     FROM follow_up_tasks
     LEFT JOIN students ON students.id = follow_up_tasks.student_id
     WHERE COALESCE(follow_up_tasks.status, 'Open') = 'Open'
       AND follow_up_tasks.dueDate <= ?
       ${assignedFilter}
     ORDER BY ${followUpOrderSql()}`,
    params
  );
  const escalations = rows.map((row) => ({
    ...normalizeFollowUpTask(row),
    ageDays: Math.max(0, Math.floor((new Date(today).getTime() - new Date(row.dueDate).getTime()) / 86400000)),
  }));
  const alreadyEscalated = escalations.filter((task) => String(task.lastEscalatedAt || '').slice(0, 10) === today);
  const pendingEscalations = escalations.filter((task) => String(task.lastEscalatedAt || '').slice(0, 10) !== today);

  if (!dryRun) {
    for (const task of pendingEscalations) {
      await run(
        `INSERT INTO student_history (student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          task.student_id || task.studentId,
          'Follow-up Escalation',
          `${task.taskType || 'Follow-up'} overdue escalation`,
          [
            `Due date: ${task.dueDate || '-'}`,
            `Age: ${task.ageDays} day(s) overdue`,
            `Priority: ${task.priority || 'Medium'}`,
            `Assigned to: ${task.assignedTo || 'Unassigned'}`,
            task.notes ? `Task note: ${task.notes}` : '',
            `Escalated by: ${req.user.username}`,
          ].filter(Boolean).join('\n'),
          today,
          now,
        ]
      );
      await run(
        `UPDATE follow_up_tasks SET lastEscalatedAt = ?, escalationCount = COALESCE(escalationCount, 0) + 1, updatedAt = ? WHERE id = ?`,
        [now, now, task.id]
      );
    }
  }

  res.json({
    dryRun: Boolean(dryRun),
    minAgeDays: threshold,
    escalated: dryRun ? 0 : pendingEscalations.length,
    skipped: alreadyEscalated.length,
    candidates: pendingEscalations,
    alreadyEscalated,
  });
});

function normalizeFeePlan(row) {
  const componentTotal = Array.isArray(row.components)
    ? row.components.reduce((sum, component) => sum + Number(component.amount || 0), 0)
    : 0;
  const totalAmount = Number(row.totalAmount || 0) || componentTotal;
  const discountAmount = Number(row.discountAmount || 0);
  const paidAmount = Number(row.paidAmount || 0);
  const netAmount = Math.max(0, totalAmount - discountAmount);
  const dueAmount = Math.max(0, netAmount - paidAmount);
  const nextInstallment = Array.isArray(row.installments)
    ? row.installments
        .filter((item) => String(item.status || 'Pending').toLowerCase() !== 'paid')
        .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))[0]
    : null;
  const today = new Date().toISOString().slice(0, 10);
  let feeStatus = dueAmount <= 0 ? 'Fully Paid' : paidAmount > 0 ? 'Partially Paid' : 'Not Started';
  if (row.feeStatus && ['Free Student', 'Refund Pending', 'Cancelled Admission'].includes(row.feeStatus)) {
    feeStatus = row.feeStatus;
  } else if (discountAmount >= totalAmount && totalAmount > 0) {
    feeStatus = 'Free Student';
  } else if (discountAmount >= totalAmount * 0.5 && totalAmount > 0) {
    feeStatus = 'Scholarship';
  } else if (dueAmount > 0 && (nextInstallment?.dueDate || row.dueDate) && (nextInstallment?.dueDate || row.dueDate) < today) {
    feeStatus = 'Overdue';
  }
  return {
    ...row,
    totalAmount,
    discountAmount,
    paidAmount,
    netAmount,
    dueAmount,
    nextDueDate: nextInstallment?.dueDate || row.dueDate || '',
    feeStatus,
    status: dueAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending',
  };
}

function makeReceiptNumber(paymentId) {
  const year = new Date().getFullYear();
  return `PK-FEE-${year}-${String(paymentId).padStart(4, '0')}`;
}

function normalizeFeeComponent(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
  };
}

function normalizeFeeInstallment(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    status: row.status || 'Pending',
  };
}

async function getFeeComponents(planId) {
  const rows = await all(`SELECT * FROM fee_components WHERE fee_plan_id = ? ORDER BY id ASC`, [planId]);
  return rows.map(normalizeFeeComponent);
}

async function getFeeInstallments(planId) {
  const rows = await all(`SELECT * FROM fee_installments WHERE fee_plan_id = ? ORDER BY dueDate ASC, id ASC`, [planId]);
  return rows.map(normalizeFeeInstallment);
}

async function attachFeeDetails(plan) {
  if (!plan) return plan;
  const [components, installments] = await Promise.all([
    getFeeComponents(plan.id),
    getFeeInstallments(plan.id),
  ]);
  return normalizeFeePlan({ ...plan, components, installments });
}

async function attachFeeDetailsMany(plans) {
  return Promise.all(plans.map(attachFeeDetails));
}

function cleanFeeComponents(components = []) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component) => ({
      componentName: String(component.componentName || '').trim(),
      amount: Number(component.amount || 0),
    }))
    .filter((component) => component.componentName && component.amount >= 0);
}

function cleanFeeInstallments(installments = []) {
  if (!Array.isArray(installments)) return [];
  return installments
    .map((item) => ({
      label: String(item.label || '').trim(),
      amount: Number(item.amount || 0),
      dueDate: item.dueDate || '',
      status: item.status || 'Pending',
    }))
    .filter((item) => item.label && item.amount >= 0);
}

async function syncFeeComponents(planId, components = []) {
  await run(`DELETE FROM fee_components WHERE fee_plan_id = ?`, [planId]);
  for (const component of cleanFeeComponents(components)) {
    await run(
      `INSERT INTO fee_components (fee_plan_id, componentName, amount) VALUES (?, ?, ?)`,
      [planId, component.componentName, component.amount]
    );
  }
}

async function syncFeeInstallments(planId, installments = []) {
  await run(`DELETE FROM fee_installments WHERE fee_plan_id = ?`, [planId]);
  for (const installment of cleanFeeInstallments(installments)) {
    await run(
      `INSERT INTO fee_installments (fee_plan_id, label, amount, dueDate, status) VALUES (?, ?, ?, ?, ?)`,
      [planId, installment.label, installment.amount, installment.dueDate, installment.status]
    );
  }
}

function feePlanTotalFromPayload(body) {
  const components = cleanFeeComponents(body.components);
  const componentTotal = components.reduce((sum, component) => sum + component.amount, 0);
  return Number(body.totalAmount || 0) || componentTotal;
}

function dayDiff(date) {
  const todayDate = new Date(new Date().toISOString().slice(0, 10));
  const due = new Date(date);
  return Math.round((due.getTime() - todayDate.getTime()) / 86400000);
}

function reminderTypeForDueDate(date) {
  if (!date) return null;
  const diff = dayDiff(date);
  if (diff === 3) return 'Before Due Date';
  if (diff === 0) return 'On Due Date';
  if (diff === -3) return 'After Due Date';
  if (diff <= -7 && diff >= -15) return 'Final Reminder';
  return null;
}

function reminderMessage(plan, installment) {
  return `Dear Parent,\nThis is a reminder that ${Number(installment.amount || plan.dueAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} fee installment for ${plan.studentName} is due on ${installment.dueDate || plan.nextDueDate}.\nKindly pay before the due date.\nProTrack Kaizen, Miraku Education Foundation.`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function parentPhoneFromStudentData(studentData) {
  const data = parseJson(studentData);
  return normalizeIndianPhone(
    data.whatsapp ||
    data.primaryPhone ||
    data.parentMobile ||
    data.fatherPhone ||
    data.motherPhone ||
    data.phone
  );
}

function whatsappConfig() {
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: env.WHATSAPP_API_VERSION,
  };
}

function isWhatsAppConfigured() {
  const config = whatsappConfig();
  return Boolean(config.accessToken && config.phoneNumberId);
}

async function sendWhatsAppText(to, message) {
  const config = whatsappConfig();
  const phone = normalizeIndianPhone(to);
  if (!phone) return { ok: false, status: 'Missing Phone', provider: 'whatsapp_cloud', error: 'Missing parent phone' };
  if (!isWhatsAppConfigured()) return { ok: false, status: 'Queued', provider: 'manual', error: 'WhatsApp Cloud API is not configured' };

  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: 'Failed', provider: 'whatsapp_cloud', error: body.error?.message || response.statusText, response: body };
  }
  return { ok: true, status: 'Sent', provider: 'whatsapp_cloud', response: body };
}

function renderTemplateText(template, values) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

async function renderMessageTemplate(templateKey, values, fallback) {
  const row = await get(`SELECT * FROM message_templates WHERE templateKey = ? AND COALESCE(status, 'Active') = ?`, [templateKey, 'Active']);
  if (!row?.body) return fallback;
  return renderTemplateText(row.body, values);
}

async function writeFeeAudit(entityType, entityId, action, oldValue, newValue, changedBy) {
  await run(
    `INSERT INTO fee_audit_logs (entityType, entityId, action, oldValue, newValue, changedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, changedBy || null, new Date().toISOString()]
  );
}

async function loadFeePlansWithPaid(tenantId = null) {
  const tenantFilter = tenantId ? 'WHERE fee_plans.tenant_id = ?' : '';
  const params = tenantId ? [tenantId] : [];
  const rows = await all(
    `SELECT
      fee_plans.*,
      students.name AS studentName,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
    FROM fee_plans
    INNER JOIN students ON students.id = fee_plans.student_id
    LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
    ${tenantFilter}
    GROUP BY fee_plans.id, students.name
    ORDER BY fee_plans.updatedAt DESC, fee_plans.id DESC`,
    params
  );
  return attachFeeDetailsMany(rows);
}

async function buildStudentCommunicationTimeline(studentId, options = {}) {
  const limit = Number(options.limit || 100);
  const [parentAlerts, parentCalls, feeReminders, parentReports, payments, history] = await Promise.all([
    all(`SELECT * FROM parent_alert_logs WHERE student_id = ? ORDER BY sentAt DESC, id DESC LIMIT ?`, [studentId, limit]),
    all(`SELECT * FROM parent_call_logs WHERE student_id = ? ORDER BY calledAt DESC, id DESC LIMIT ?`, [studentId, limit]),
    all(`SELECT * FROM fee_reminders WHERE student_id = ? ORDER BY sentAt DESC, id DESC LIMIT ?`, [studentId, limit]),
    all(`SELECT * FROM parent_report_logs WHERE student_id = ? ORDER BY sentAt DESC, id DESC LIMIT ?`, [studentId, limit]),
    all(
      `SELECT fee_payments.*, fee_plans.courseProgram, fee_plans.feeCategory
       FROM fee_payments
       LEFT JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
       WHERE fee_payments.student_id = ? AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
       ORDER BY fee_payments.paymentDate DESC, fee_payments.id DESC
       LIMIT ?`,
      [studentId, limit]
    ),
    all(`SELECT * FROM student_history WHERE student_id = ? ORDER BY eventDate DESC, id DESC LIMIT ?`, [studentId, limit]),
  ]);

  const moneyText = (value) => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const timeline = [
    ...parentAlerts.map((item) => ({
      id: `attendance-alert-${item.id}`,
      sourceId: item.id,
      type: 'Attendance Alert',
      channel: item.channel || 'WhatsApp',
      status: item.status || item.delivery || '',
      date: item.sentAt || item.createdAt,
      title: item.alertType || 'Attendance alert',
      detail: item.message,
      triggeredBy: item.channel || 'System',
    })),
    ...parentCalls.map((item) => ({
      id: `parent-call-${item.id}`,
      sourceId: item.id,
      type: 'Parent Call',
      channel: 'Phone',
      status: item.callOutcome || '',
      date: item.calledAt || item.createdAt,
      title: item.callOutcome || 'Parent call',
      detail: item.notes,
      triggeredBy: item.calledBy || 'Staff',
    })),
    ...feeReminders.map((item) => ({
      id: `fee-reminder-${item.id}`,
      sourceId: item.id,
      type: 'Fee Reminder',
      channel: item.sentVia || 'WhatsApp',
      status: item.status || '',
      date: item.sentAt || item.createdAt,
      title: item.reminderType || 'Fee reminder',
      detail: item.message,
      triggeredBy: item.sentVia || 'System',
    })),
    ...parentReports.map((item) => ({
      id: `test-parent-report-${item.id}`,
      sourceId: item.id,
      type: 'Test Result Message',
      channel: item.sentVia || 'WhatsApp',
      status: item.status || '',
      date: item.sentAt,
      title: `Marks ${item.marksObtained || 0}/${item.totalMarks || 0}`,
      detail: [item.teacherRemark, item.requiredAction].filter(Boolean).join('\n'),
      triggeredBy: item.sentVia || 'Academic',
    })),
    ...payments.map((item) => ({
      id: `payment-receipt-${item.id}`,
      sourceId: item.id,
      type: 'Payment Receipt',
      channel: item.paymentMethod || 'Receipt',
      status: item.status || 'Active',
      date: item.paymentDate || item.createdAt,
      title: item.receiptNumber || 'Receipt',
      detail: `${moneyText(item.amount)} received for ${item.courseProgram || item.feeCategory || 'fees'}.`,
      triggeredBy: item.receivedBy || 'Accounts',
    })),
    ...history.map((item) => ({
      id: `history-${item.id}`,
      sourceId: item.id,
      type: item.type || 'Note',
      channel: 'Internal',
      status: '',
      date: item.eventDate || item.createdAt,
      title: item.title || item.type || 'Note',
      detail: item.detail,
      triggeredBy: 'Staff',
    })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return {
    timeline: timeline.slice(0, limit),
    parentAlerts,
    parentCalls,
    feeReminders,
    parentReports,
    payments,
    history,
  };
}

router.get('/api/students/:id/360', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const feePlanRows = await all(
    `SELECT fee_plans.*, students.name AS studentName, COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
     FROM fee_plans
     INNER JOIN students ON students.id = fee_plans.student_id
     LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     WHERE fee_plans.student_id = ? AND fee_plans.tenant_id = ?
     GROUP BY fee_plans.id, students.name
     ORDER BY fee_plans.updatedAt DESC`,
    [id, currentTenantId(req)]
  );
  const feePlans = await attachFeeDetailsMany(feePlanRows);
  const payments = await all(
    `SELECT fee_payments.*, fee_plans.courseProgram AS courseProgram, fee_plans.feeCategory AS feeCategory
     FROM fee_payments
     LEFT JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
     WHERE fee_payments.student_id = ? AND fee_payments.tenant_id = ? AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     ORDER BY fee_payments.paymentDate DESC, fee_payments.id DESC`,
    [id, currentTenantId(req)]
  );
  const attendance = await all(
    `SELECT attendance_records.*, attendance_sessions.date, attendance_sessions.batch, attendance_sessions.course, attendance_sessions.subject, attendance_sessions.teacherName, attendance_sessions.startTime
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_records.student_id = ?
     ORDER BY attendance_sessions.date DESC, attendance_sessions.startTime DESC`,
    [id]
  );
  const communication = await buildStudentCommunicationTimeline(id, { limit: 100 });
  const followUps = await all(
    `SELECT follow_up_tasks.*, COALESCE(students.name, follow_up_tasks.studentName) AS studentName
     FROM follow_up_tasks
     LEFT JOIN students ON students.id = follow_up_tasks.student_id
     WHERE follow_up_tasks.student_id = ?
     ORDER BY ${followUpOrderSql()}`,
    [id]
  );
  const history = await all(`SELECT * FROM student_history WHERE student_id = ? ORDER BY eventDate DESC, id DESC`, [id]);
  const academicResults = await all(`SELECT * FROM student_test_results WHERE student_id = ? ORDER BY updatedAt DESC, id DESC LIMIT 50`, [id]);
  const performanceResults = await all(`SELECT * FROM performance_results WHERE student_id = ? ORDER BY updatedAt DESC, id DESC LIMIT 50`, [id]);
  const remedialActions = await all(`SELECT * FROM remedial_actions WHERE student_id = ? ORDER BY deadline ASC, id DESC LIMIT 50`, [id]);
  const remedialStudents = await all(`SELECT * FROM remedial_students WHERE student_id = ? ORDER BY remedialDate ASC, id DESC LIMIT 50`, [id]);

  const attended = attendance.filter((row) => ['Present', 'Late', 'Excused'].includes(row.status)).length;
  const absent = attendance.filter((row) => row.status === 'Absent').length;
  const late = attendance.filter((row) => row.status === 'Late').length;
  const attendancePercent = attendance.length ? Math.round((attended / attendance.length) * 100) : 0;
  const feeTotals = feePlans.reduce((acc, plan) => {
    acc.net += Number(plan.netAmount || 0);
    acc.paid += Number(plan.paidAmount || 0);
    acc.due += Number(plan.dueAmount || 0);
    return acc;
  }, { net: 0, paid: 0, due: 0 });

  res.json({
    student: { ...student, data: student.data ? JSON.parse(student.data) : {} },
    fees: { plans: feePlans, payments, reminders: communication.feeReminders, totals: feeTotals },
    attendance: { rows: attendance, totals: { total: attendance.length, attended, absent, late, attendancePercent } },
    academics: { academicResults, performanceResults, remedialActions, remedialStudents },
    communication: { ...communication, history, followUps: followUps.map(normalizeFollowUpTask) },
  });
});

function makeExpenseNumber(expenseId) {
  const year = new Date().getFullYear();
  return `EXP-${year}-${String(expenseId).padStart(4, '0')}`;
}

function expenseApprovalRequired(amount) {
  const value = Number(amount || 0);
  if (value <= 500) return 'Admin approval';
  if (value <= 5000) return 'Branch head approval';
  if (value <= 25000) return 'Director approval';
  return 'Director + finance approval';
}

function normalizeExpense(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    deductionAmount: Number(row.deductionAmount || 0),
    bonusAmount: Number(row.bonusAmount || 0),
    netPaid: Number(row.netPaid || 0),
    billUploaded: Boolean(Number(row.billUploaded || 0)),
    gstBill: Boolean(Number(row.gstBill || 0)),
  };
}

function normalizeRecurringExpense(row) {
  if (!row) return row;
  return {
    ...row,
    amount: Number(row.amount || 0),
    dayOfMonth: Number(row.dayOfMonth || 1),
    billUploaded: Boolean(Number(row.billUploaded || 0)),
    gstBill: Boolean(Number(row.gstBill || 0)),
  };
}

function expenseDateForMonth(month, dayOfMonth) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  const safeDay = Math.max(1, Math.min(Number(dayOfMonth || 1), new Date(year, monthNumber, 0).getDate()));
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

async function createExpenseFromRecurringTemplate(template, month, username, tenantId = null) {
  const normalized = normalizeRecurringExpense(template);
  if (!normalized || normalized.status !== 'Active') return { skipped: true, reason: 'inactive' };
  if (normalized.frequency !== 'Monthly') return { skipped: true, reason: 'unsupported frequency' };
  if (normalized.startMonth && month < normalized.startMonth) return { skipped: true, reason: 'before start month' };
  if (normalized.endMonth && month > normalized.endMonth) return { skipped: true, reason: 'after end month' };

  const marker = `[Recurring ${normalized.id} ${month}]`;
  const existing = await get(`SELECT * FROM expenses WHERE remarks LIKE ? AND tenant_id = ? LIMIT 1`, [`%${marker}%`, tenantId]);
  if (existing) return { skipped: true, reason: 'already generated', expense: normalizeExpense(existing) };

  const now = new Date().toISOString();
  const date = expenseDateForMonth(month, normalized.dayOfMonth);
  const remarks = `${normalized.remarks || normalized.templateName || 'Recurring expense'} ${marker}`;
  const result = await run(
    `INSERT INTO expenses (tenant_id, expenseId, date, branch, category, subCategory, expenseType, amount, vendor_id, paidTo, vendorMobile, paymentMode, paidBy, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, approvalRequired, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      `PENDING-${Date.now()}`,
      date,
      normalized.branch || 'Tembhurni',
      normalized.category,
      normalized.subCategory,
      normalized.expenseType || 'Fixed',
      normalized.amount,
      null,
      normalized.paidTo,
      normalized.vendorMobile,
      normalized.paymentMode || 'Bank Transfer',
      null,
      normalized.requestedBy || username,
      normalized.approvedBy || username,
      normalized.billUploaded ? 1 : 0,
      normalized.gstBill ? 1 : 0,
      normalized.billUrl,
      remarks,
      'Approved',
      expenseApprovalRequired(normalized.amount),
      now,
      now,
    ]
  );
  await run(`UPDATE expenses SET expenseId = ? WHERE id = ?`, [makeExpenseNumber(result.lastID), result.lastID]);
  await run(`UPDATE recurring_expense_templates SET lastGeneratedMonth = ?, updatedAt = ? WHERE id = ?`, [month, now, normalized.id]);
  return { skipped: false, expense: normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [result.lastID, tenantId])) };
}

async function createPettyCashEntryForExpense(expense, tenantId = null) {
  if (expense.paymentMode !== 'Cash' || expense.status !== 'Paid') return;
  const branch = expense.branch || 'Tembhurni';
  const latest = await get(`SELECT * FROM petty_cash_entries WHERE branch = ? AND tenant_id = ? ORDER BY date DESC, id DESC LIMIT 1`, [branch, tenantId]);
  const openingCash = Number(latest?.closingCash || 0);
  const paidAmount = Number(expense.netPaid || expense.amount || 0);
  const closingCash = openingCash - paidAmount;
  await run(
    `INSERT INTO petty_cash_entries (tenant_id, date, branch, cashFlowType, amount, openingCash, closingCash, referenceType, referenceId, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, expense.paymentDate || expense.date, branch, 'Expense', paidAmount, openingCash, closingCash, 'Expense', expense.id, expense.remarks || expense.category, new Date().toISOString()]
  );
}

router.get('/api/vendors', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT vendors.*, COALESCE(SUM(CASE WHEN expenses.status = 'Paid' THEN expenses.amount ELSE 0 END), 0) AS totalPaid,
      COALESCE(SUM(CASE WHEN expenses.status IN ('Approved', 'Bill Pending') THEN expenses.amount ELSE 0 END), 0) AS pendingAmount,
      MAX(CASE WHEN expenses.status = 'Paid' THEN expenses.date ELSE NULL END) AS lastPaymentDate
     FROM vendors
     LEFT JOIN expenses ON expenses.vendor_id = vendors.id AND expenses.tenant_id = vendors.tenant_id
     WHERE vendors.tenant_id = ?
     GROUP BY vendors.id
     ORDER BY vendors.vendorName ASC`,
    [currentTenantId(req)]
  );
  res.json(rows.map((row) => ({ ...row, totalPaid: Number(row.totalPaid || 0), pendingAmount: Number(row.pendingAmount || 0) })));
});

router.post('/api/vendors', authMiddleware, requireTenant, async (req, res) => {
  const { vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes } = req.body;
  const validationError = requireFields(req.body, ['vendorName', 'vendorType']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO vendors (tenant_id, vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, now, now]
  );
  res.json(await get(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [result.lastID, currentTenantId(req)]));
});

router.put('/api/vendors/:id', authMiddleware, requireTenant, async (req, res) => {
  const { vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes } = req.body;
  const existing = await get(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  await run(
    `UPDATE vendors SET vendorName = ?, vendorType = ?, mobileNumber = ?, address = ?, gstNumber = ?, bankDetails = ?, notes = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`,
    [vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, new Date().toISOString(), req.params.id, currentTenantId(req)]
  );
  const row = await get(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  if (!row) return res.status(404).json({ error: 'Vendor not found' });
  res.json(row);
});

router.delete('/api/vendors/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`UPDATE expenses SET vendor_id = NULL WHERE vendor_id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  await run(`DELETE FROM vendors WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.get('/api/expenses', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(
    `SELECT expenses.*, vendors.vendorName AS vendorName, vendors.vendorType AS vendorType
     FROM expenses
     LEFT JOIN vendors ON vendors.id = expenses.vendor_id
     WHERE expenses.tenant_id = ?
     ORDER BY expenses.date DESC, expenses.id DESC`,
    [currentTenantId(req)]
  );
  res.json(rows.map(normalizeExpense));
});

router.post('/api/expenses', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { date, branch = 'Tembhurni', category, subCategory, expenseType = 'Variable', amount, vendor_id, paidTo, vendorMobile, paymentMode = 'Cash', paidBy, paymentDate, transactionId, deductionAmount = 0, bonusAmount = 0, netPaid = 0, requestedBy, approvedBy, billUploaded = false, gstBill = false, billUrl, remarks, status = 'Requested' } = req.body;
  const validationError = requireFields({ date, category, amount, paidTo }, ['date', 'category', 'amount', 'paidTo']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO expenses (tenant_id, expenseId, date, branch, category, subCategory, expenseType, amount, vendor_id, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, deductionAmount, bonusAmount, netPaid, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, approvalRequired, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), `PENDING-${Date.now()}`, date, branch, category, subCategory, expenseType, Number(amount), vendor_id || null, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, Number(deductionAmount || 0), Number(bonusAmount || 0), Number(netPaid || 0), requestedBy || req.user.username, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, expenseApprovalRequired(amount), now, now]
  );
  await run(`UPDATE expenses SET expenseId = ? WHERE id = ?`, [makeExpenseNumber(result.lastID), result.lastID]);
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [result.lastID, currentTenantId(req)]));
  await createPettyCashEntryForExpense(row, currentTenantId(req));
  res.json(row);
});

router.put('/api/expenses/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { date, branch = 'Tembhurni', category, subCategory, expenseType = 'Variable', amount, vendor_id, paidTo, vendorMobile, paymentMode = 'Cash', paidBy, paymentDate, transactionId, deductionAmount = 0, bonusAmount = 0, netPaid = 0, requestedBy, approvedBy, billUploaded = false, gstBill = false, billUrl, remarks, status = 'Requested' } = req.body;
  const existing = await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  await run(
    `UPDATE expenses SET date = ?, branch = ?, category = ?, subCategory = ?, expenseType = ?, amount = ?, vendor_id = ?, paidTo = ?, vendorMobile = ?, paymentMode = ?, paidBy = ?, paymentDate = ?, transactionId = ?, deductionAmount = ?, bonusAmount = ?, netPaid = ?, requestedBy = ?, approvedBy = ?, billUploaded = ?, gstBill = ?, billUrl = ?, remarks = ?, status = ?, approvalRequired = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`,
    [date, branch, category, subCategory, expenseType, Number(amount), vendor_id || null, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, Number(deductionAmount || 0), Number(bonusAmount || 0), Number(netPaid || 0), requestedBy, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, expenseApprovalRequired(amount), new Date().toISOString(), req.params.id, currentTenantId(req)]
  );
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]));
  if (existing.status !== 'Paid') await createPettyCashEntryForExpense(row, currentTenantId(req));
  res.json(row);
});

router.patch('/api/expenses/:id/approve', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`UPDATE expenses SET status = ?, approvedBy = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`, ['Approved', req.user.username, new Date().toISOString(), req.params.id, currentTenantId(req)]);
  res.json(normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)])));
});

router.patch('/api/expenses/:id/reject', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`UPDATE expenses SET status = ?, approvedBy = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`, ['Rejected', req.user.username, new Date().toISOString(), req.params.id, currentTenantId(req)]);
  res.json(normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)])));
});

router.patch('/api/expenses/:id/pay', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const existing = await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  const status = Number(existing.billUploaded || 0) ? 'Paid' : 'Bill Pending';
  const paymentDate = existing.paymentDate || new Date().toISOString().slice(0, 10);
  const netPaid = Number(existing.netPaid || existing.amount || 0);
  await run(`UPDATE expenses SET status = ?, paidBy = ?, paymentDate = ?, netPaid = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`, [status, req.user.username, paymentDate, netPaid, new Date().toISOString(), req.params.id, currentTenantId(req)]);
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]));
  await createPettyCashEntryForExpense({ ...row, status: 'Paid' }, currentTenantId(req));
  res.json(row);
});

router.delete('/api/expenses/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM petty_cash_entries WHERE referenceType = ? AND referenceId = ? AND tenant_id = ?`, ['Expense', req.params.id, currentTenantId(req)]);
  await run(`DELETE FROM expenses WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.get('/api/recurring-expenses', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(`SELECT * FROM recurring_expense_templates WHERE tenant_id = ? ORDER BY status ASC, category ASC, templateName ASC`, [currentTenantId(req)]);
  res.json(rows.map(normalizeRecurringExpense));
});

router.post('/api/recurring-expenses', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const {
    templateName,
    branch = 'Tembhurni',
    category = 'Salary',
    subCategory,
    expenseType = 'Fixed',
    amount,
    paidTo,
    vendorMobile,
    paymentMode = 'Bank Transfer',
    requestedBy,
    approvedBy,
    billUploaded = true,
    gstBill = false,
    billUrl,
    remarks,
    status = 'Active',
    frequency = 'Monthly',
    startMonth,
    endMonth,
    dayOfMonth = 1,
  } = req.body;
  const validationError = requireFields({ templateName, category, amount, paidTo, startMonth }, ['templateName', 'category', 'amount', 'paidTo', 'startMonth']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO recurring_expense_templates (tenant_id, templateName, branch, category, subCategory, expenseType, amount, paidTo, vendorMobile, paymentMode, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, frequency, startMonth, endMonth, dayOfMonth, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), templateName, branch, category, subCategory, expenseType, Number(amount), paidTo, vendorMobile, paymentMode, requestedBy || req.user.username, approvedBy || req.user.username, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, frequency, startMonth, endMonth || null, Number(dayOfMonth || 1), now, now]
  );
  res.json(normalizeRecurringExpense(await get(`SELECT * FROM recurring_expense_templates WHERE id = ? AND tenant_id = ?`, [result.lastID, currentTenantId(req)])));
});

router.put('/api/recurring-expenses/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const existing = await get(`SELECT * FROM recurring_expense_templates WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Recurring expense template not found' });
  const {
    templateName,
    branch = 'Tembhurni',
    category = 'Salary',
    subCategory,
    expenseType = 'Fixed',
    amount,
    paidTo,
    vendorMobile,
    paymentMode = 'Bank Transfer',
    requestedBy,
    approvedBy,
    billUploaded = true,
    gstBill = false,
    billUrl,
    remarks,
    status = 'Active',
    frequency = 'Monthly',
    startMonth,
    endMonth,
    dayOfMonth = 1,
  } = req.body;
  const validationError = requireFields({ templateName, category, amount, paidTo, startMonth }, ['templateName', 'category', 'amount', 'paidTo', 'startMonth']);
  if (validationError) return res.status(400).json({ error: validationError });
  await run(
    `UPDATE recurring_expense_templates SET templateName = ?, branch = ?, category = ?, subCategory = ?, expenseType = ?, amount = ?, paidTo = ?, vendorMobile = ?, paymentMode = ?, requestedBy = ?, approvedBy = ?, billUploaded = ?, gstBill = ?, billUrl = ?, remarks = ?, status = ?, frequency = ?, startMonth = ?, endMonth = ?, dayOfMonth = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`,
    [templateName, branch, category, subCategory, expenseType, Number(amount), paidTo, vendorMobile, paymentMode, requestedBy, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, frequency, startMonth, endMonth || null, Number(dayOfMonth || 1), new Date().toISOString(), req.params.id, currentTenantId(req)]
  );
  res.json(normalizeRecurringExpense(await get(`SELECT * FROM recurring_expense_templates WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)])));
});

router.delete('/api/recurring-expenses/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM recurring_expense_templates WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.post('/api/recurring-expenses/generate', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const templates = await all(`SELECT * FROM recurring_expense_templates WHERE status = ? AND tenant_id = ? ORDER BY id ASC`, ['Active', currentTenantId(req)]);
  const created = [];
  const skipped = [];
  for (const template of templates) {
    const result = await createExpenseFromRecurringTemplate(template, month, req.user.username, currentTenantId(req));
    if (result.skipped) skipped.push({ templateId: template.id, templateName: template.templateName, reason: result.reason });
    else created.push(result.expense);
  }
  res.json({ month, created, skipped });
});

router.get('/api/petty-cash', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(`SELECT * FROM petty_cash_entries WHERE tenant_id = ? ORDER BY date DESC, id DESC LIMIT 100`, [currentTenantId(req)]);
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount || 0), openingCash: Number(row.openingCash || 0), closingCash: Number(row.closingCash || 0) })));
});

router.post('/api/petty-cash', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { date, branch = 'Tembhurni', cashFlowType = 'Cash Added', amount, remarks } = req.body;
  const validationError = requireFields(req.body, ['date', 'amount']);
  if (validationError) return res.status(400).json({ error: validationError });
  const latest = await get(`SELECT * FROM petty_cash_entries WHERE branch = ? AND tenant_id = ? ORDER BY date DESC, id DESC LIMIT 1`, [branch, currentTenantId(req)]);
  const openingCash = Number(latest?.closingCash || 0);
  const closingCash = openingCash + (cashFlowType === 'Cash Added' ? Number(amount) : -Number(amount));
  const result = await run(
    `INSERT INTO petty_cash_entries (tenant_id, date, branch, cashFlowType, amount, openingCash, closingCash, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), date, branch, cashFlowType, Number(amount), openingCash, closingCash, remarks, new Date().toISOString()]
  );
  res.json(await get(`SELECT * FROM petty_cash_entries WHERE id = ? AND tenant_id = ?`, [result.lastID, currentTenantId(req)]));
});

router.delete('/api/petty-cash/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM petty_cash_entries WHERE id = ? AND tenant_id = ?`, [req.params.id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.get('/api/expense-reports', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const expenses = (await all(`SELECT expenses.*, vendors.vendorName AS vendorName FROM expenses LEFT JOIN vendors ON vendors.id = expenses.vendor_id WHERE expenses.date LIKE ? AND expenses.tenant_id = ? ORDER BY expenses.date DESC`, [`${month}%`, currentTenantId(req)])).map(normalizeExpense);
  const paidExpenses = expenses.filter((expense) => expense.status === 'Paid' || expense.status === 'Bill Pending');
  const expenseValue = (expense) => Number(expense.netPaid || expense.amount || 0);
  const totalExpenses = paidExpenses.reduce((sum, expense) => sum + expenseValue(expense), 0);
  const fixedExpenses = paidExpenses.filter((expense) => expense.expenseType === 'Fixed').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const variableExpenses = paidExpenses.filter((expense) => expense.expenseType !== 'Fixed').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const refunds = paidExpenses.filter((expense) => expense.category === 'Refunds').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const pendingLiabilities = expenses.filter((expense) => expense.status === 'Approved' || expense.status === 'Bill Pending').reduce((sum, expense) => sum + expense.amount, 0);
  const feeRows = await all(`SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE paymentDate LIKE ? AND tenant_id = ? AND COALESCE(status, 'Active') != 'Cancelled'`, [`${month}%`, currentTenantId(req)]);
  const totalIncome = Number(feeRows[0]?.amount || 0);
  const groupBy = (keyFn) => Object.values(paidExpenses.reduce((acc, expense) => {
    const key = keyFn(expense) || 'Unassigned';
    if (!acc[key]) acc[key] = { name: key, amount: 0, count: 0 };
    acc[key].amount += expenseValue(expense);
    acc[key].count += 1;
    return acc;
  }, {}));
  const categoryWise = groupBy((expense) => expense.category).map((row) => ({ category: row.name, amount: row.amount, count: row.count }));
  const vendorWise = groupBy((expense) => expense.vendorName || expense.paidTo).map((row) => ({ vendor: row.name, amount: row.amount, count: row.count }));
  const branchWise = groupBy((expense) => expense.branch).map((row) => ({ branch: row.name, income: totalIncome, expense: row.amount, profit: totalIncome - row.amount }));
  const billsUploaded = expenses.filter((expense) => expense.billUploaded).length;
  const marketingSpend = paidExpenses.filter((expense) => expense.category === 'Marketing').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const admissionsCount = Number((await get(`SELECT COUNT(*) AS count FROM admissions WHERE status != ? AND tenant_id = ?`, ['Rejected', currentTenantId(req)]))?.count || 0);
  const netProfit = totalIncome - fixedExpenses - variableExpenses - refunds - pendingLiabilities;
  res.json({
    month,
    totals: {
      totalIncome,
      totalExpenses,
      fixedExpenses,
      variableExpenses,
      refunds,
      pendingLiabilities,
      netProfit,
      expenseRatio: totalIncome ? Math.round((totalExpenses / totalIncome) * 100) : 0,
      salaryRatio: totalIncome ? Math.round(((categoryWise.find((row) => row.category === 'Salary')?.amount || 0) / totalIncome) * 100) : 0,
      rentRatio: totalIncome ? Math.round(((categoryWise.find((row) => row.category === 'Rent')?.amount || 0) / totalIncome) * 100) : 0,
      profitMargin: totalIncome ? Math.round((netProfit / totalIncome) * 100) : 0,
      billCompliance: expenses.length ? Math.round((billsUploaded / expenses.length) * 100) : 0,
      cashExpenseRatio: totalExpenses ? Math.round((paidExpenses.filter((expense) => expense.paymentMode === 'Cash').reduce((sum, expense) => sum + expenseValue(expense), 0) / totalExpenses) * 100) : 0,
    },
    dailyExpense: paidExpenses.filter((expense) => expense.date === new Date().toISOString().slice(0, 10)),
    monthlyExpense: paidExpenses,
    categoryWise,
    vendorWise,
    branchWise,
    cashExpenses: paidExpenses.filter((expense) => expense.paymentMode === 'Cash'),
    bankExpenses: paidExpenses.filter((expense) => ['Bank Transfer', 'Cheque', 'Credit Card'].includes(expense.paymentMode)),
    billPending: expenses.filter((expense) => !expense.billUploaded || expense.status === 'Bill Pending'),
    approvalPending: expenses.filter((expense) => expense.status === 'Requested'),
    salaryExpense: paidExpenses.filter((expense) => expense.category === 'Salary'),
    marketingRoi: { marketingSpend, admissions: admissionsCount, costPerAdmission: admissionsCount ? Math.round(marketingSpend / admissionsCount) : 0 },
  });
});

// Fee plans and payments
router.get('/api/fees/summary', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const plans = await loadFeePlansWithPaid(currentTenantId(req));
  const today = new Date().toISOString().slice(0, 10);
  const totals = plans.reduce(
    (acc, plan) => {
      acc.totalFees += plan.totalAmount;
      acc.totalDiscounts += plan.discountAmount;
      acc.netFees += plan.netAmount;
      acc.collected += plan.paidAmount;
      acc.pending += plan.dueAmount;
      if (plan.dueAmount > 0 && plan.nextDueDate && plan.nextDueDate < today) acc.overdue += plan.dueAmount;
      if (plan.feeStatus === 'Fully Paid') acc.fullyPaidStudents += 1;
      if (plan.feeStatus === 'Partially Paid') acc.partiallyPaidStudents += 1;
      if (plan.feeStatus === 'Overdue') acc.overdueStudents += 1;
      return acc;
    },
    { totalFees: 0, totalDiscounts: 0, netFees: 0, collected: 0, pending: 0, overdue: 0, todayCollection: 0, overdueStudents: 0, fullyPaidStudents: 0, partiallyPaidStudents: 0 }
  );
  const todayPayments = await all(`SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE paymentDate = ? AND tenant_id = ? AND COALESCE(status, 'Active') != 'Cancelled'`, [today, currentTenantId(req)]);
  totals.todayCollection = Number(todayPayments[0]?.amount || 0);
  res.json({ totals, plans });
});

router.get('/api/fee-plans', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  res.json(await loadFeePlansWithPaid(currentTenantId(req)));
});

function normalizeFeeStructure(row) {
  return {
    ...row,
    feeAmount: Number(row.feeAmount || 0),
  };
}

router.get('/api/fee-structures', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(`SELECT * FROM fee_structures ORDER BY courseName ASC`);
  res.json(rows.map(normalizeFeeStructure));
});

router.post('/api/fee-structures', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { courseName, feeAmount, billingCycle = 'per year', paymentType = 'Installment', classRange, duration, notes, status = 'Active' } = req.body;
  const validationError = requireFields({ courseName, feeAmount }, ['courseName', 'feeAmount']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  await run(
    `INSERT INTO fee_structures (courseName, feeAmount, billingCycle, paymentType, classRange, duration, notes, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(courseName)
     DO UPDATE SET feeAmount = excluded.feeAmount, billingCycle = excluded.billingCycle, paymentType = excluded.paymentType, classRange = excluded.classRange, duration = excluded.duration, notes = excluded.notes, status = excluded.status, updatedAt = excluded.updatedAt`,
    [courseName, Number(feeAmount || 0), billingCycle, paymentType, classRange, duration, notes, status, now, now]
  );
  res.json(normalizeFeeStructure(await get(`SELECT * FROM fee_structures WHERE courseName = ?`, [courseName])));
});

router.put('/api/fee-structures/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { courseName, feeAmount, billingCycle = 'per year', paymentType = 'Installment', classRange, duration, notes, status = 'Active' } = req.body;
  const existing = await get(`SELECT * FROM fee_structures WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Fee structure not found' });
  await run(
    `UPDATE fee_structures SET courseName = ?, feeAmount = ?, billingCycle = ?, paymentType = ?, classRange = ?, duration = ?, notes = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [courseName, Number(feeAmount || 0), billingCycle, paymentType, classRange, duration, notes, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeFeeStructure(await get(`SELECT * FROM fee_structures WHERE id = ?`, [req.params.id])));
});

router.delete('/api/fee-structures/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM fee_structures WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/students/:id/fee-plans', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT id FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rows = await all(
    `SELECT
      fee_plans.*,
      students.name AS studentName,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
    FROM fee_plans
    INNER JOIN students ON students.id = fee_plans.student_id
    LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
    WHERE fee_plans.student_id = ? AND fee_plans.tenant_id = ?
    GROUP BY fee_plans.id, students.name
    ORDER BY fee_plans.updatedAt DESC, fee_plans.id DESC`,
    [id, currentTenantId(req)]
  );
  res.json(await attachFeeDetailsMany(rows));
});

router.post('/api/fee-plans', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const {
    student_id,
    courseProgram,
    feeCategory,
    paymentType,
    discountAmount = 0,
    discountType,
    discountReason,
    approvedBy,
    discountApprovedDate,
    discountProofNote,
    feeStatus,
    dueDate,
    installmentLabel,
    notes,
    components = [],
    installments = [],
  } = req.body;
  const totalAmount = feePlanTotalFromPayload(req.body);
  const validationError = requireFields({ ...req.body, totalAmount }, ['student_id', 'courseProgram', 'paymentType', 'totalAmount']);
  if (validationError) return res.status(400).json({ error: validationError });
  if (Number(discountAmount || 0) > 0 && (!discountType || !discountReason || !approvedBy)) {
    return res.status(400).json({ error: 'Discount type, reason, and approved by are required when a discount is applied' });
  }
  const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [student_id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO fee_plans (
      tenant_id, student_id, courseProgram, feeCategory, paymentType, totalAmount, discountAmount,
      discountType, discountReason, approvedBy, discountApprovedDate, discountProofNote,
      feeStatus, statusUpdatedAt, dueDate, installmentLabel, notes, createdAt, updatedAt
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      currentTenantId(req),
      student_id,
      courseProgram,
      feeCategory || courseProgram,
      paymentType,
      Number(totalAmount),
      Number(discountAmount || 0),
      discountType,
      discountReason,
      approvedBy,
      discountApprovedDate,
      discountProofNote,
      feeStatus,
      feeStatus ? now : null,
      dueDate,
      installmentLabel,
      notes,
      now,
      now,
    ]
  );
  await syncFeeComponents(result.lastID, components);
  await syncFeeInstallments(result.lastID, installments);
  await writeFeeAudit('fee_plan', result.lastID, 'created', null, req.body, req.user.username);
  const plan = await get(`SELECT fee_plans.*, students.name AS studentName, 0 AS paidAmount FROM fee_plans INNER JOIN students ON students.id = fee_plans.student_id WHERE fee_plans.id = ?`, [result.lastID]);
  res.json(await attachFeeDetails(plan));
});

router.put('/api/fee-plans/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { id } = req.params;
  const {
    courseProgram,
    feeCategory,
    paymentType,
    discountAmount = 0,
    discountType,
    discountReason,
    approvedBy,
    discountApprovedDate,
    discountProofNote,
    feeStatus,
    dueDate,
    installmentLabel,
    notes,
    components = [],
    installments = [],
  } = req.body;
  const totalAmount = feePlanTotalFromPayload(req.body);
  const validationError = requireFields({ ...req.body, totalAmount }, ['courseProgram', 'paymentType', 'totalAmount']);
  if (validationError) return res.status(400).json({ error: validationError });
  if (Number(discountAmount || 0) > 0 && (!discountType || !discountReason || !approvedBy)) {
    return res.status(400).json({ error: 'Discount type, reason, and approved by are required when a discount is applied' });
  }
  const existing = await get(`SELECT * FROM fee_plans WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Fee plan not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE fee_plans SET
      courseProgram = ?, feeCategory = ?, paymentType = ?, totalAmount = ?, discountAmount = ?,
      discountType = ?, discountReason = ?, approvedBy = ?, discountApprovedDate = ?, discountProofNote = ?,
      feeStatus = ?, statusUpdatedAt = ?, dueDate = ?, installmentLabel = ?, notes = ?, updatedAt = ?
     WHERE id = ?`,
    [
      courseProgram,
      feeCategory || courseProgram,
      paymentType,
      Number(totalAmount),
      Number(discountAmount || 0),
      discountType,
      discountReason,
      approvedBy,
      discountApprovedDate,
      discountProofNote,
      feeStatus,
      feeStatus ? now : existing.statusUpdatedAt,
      dueDate,
      installmentLabel,
      notes,
      now,
      id,
    ]
  );
  await syncFeeComponents(id, components);
  await syncFeeInstallments(id, installments);
  await writeFeeAudit('fee_plan', id, 'updated', existing, req.body, req.user.username);
  const plan = await get(
    `SELECT fee_plans.*, students.name AS studentName, COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
     FROM fee_plans
     INNER JOIN students ON students.id = fee_plans.student_id
     LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     WHERE fee_plans.id = ?
     GROUP BY fee_plans.id, students.name`,
    [id]
  );
  res.json(await attachFeeDetails(plan));
});

router.delete('/api/fee-plans/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM fee_components WHERE fee_plan_id = ?`, [id]);
  await run(`DELETE FROM fee_installments WHERE fee_plan_id = ?`, [id]);
  const payments = await all(`SELECT id FROM fee_payments WHERE fee_plan_id = ?`, [id]);
  for (const payment of payments) {
    await run(`DELETE FROM fee_receipts WHERE payment_id = ?`, [payment.id]);
  }
  await run(`DELETE FROM fee_payments WHERE fee_plan_id = ?`, [id]);
  await run(`DELETE FROM fee_plans WHERE id = ?`, [id]);
  res.json({ ok: true });
});

router.get('/api/fee-payments', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(
    `SELECT
      fee_payments.*,
      students.name AS studentName,
      fee_plans.courseProgram AS courseProgram,
      fee_plans.feeCategory AS feeCategory,
      fee_plans.paymentType AS paymentType,
      fee_plans.installmentLabel AS installmentLabel
    FROM fee_payments
    INNER JOIN students ON students.id = fee_payments.student_id
    INNER JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
    WHERE COALESCE(fee_payments.status, 'Active') != 'Cancelled'
      AND fee_payments.tenant_id = ?
    ORDER BY fee_payments.paymentDate DESC, fee_payments.id DESC`,
    [currentTenantId(req)]
  );
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })));
});

router.get('/api/fee-payments/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { id } = req.params;
  const row = await get(
    `SELECT
      fee_payments.*,
      students.name AS studentName,
      students.grade AS grade,
      students.batch AS batch,
      fee_plans.courseProgram AS courseProgram,
      fee_plans.feeCategory AS feeCategory,
      fee_plans.paymentType AS paymentType,
      fee_plans.totalAmount AS totalAmount,
      fee_plans.discountAmount AS discountAmount,
      fee_plans.installmentLabel AS installmentLabel
    FROM fee_payments
    INNER JOIN students ON students.id = fee_payments.student_id
    INNER JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
    WHERE fee_payments.id = ? AND fee_payments.tenant_id = ?`,
    [id, currentTenantId(req)]
  );
  if (!row) return res.status(404).json({ error: 'Payment not found' });
  res.json({ ...row, amount: Number(row.amount || 0), totalAmount: Number(row.totalAmount || 0), discountAmount: Number(row.discountAmount || 0) });
});

router.post('/api/fee-payments', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { fee_plan_id, amount, paymentDate, paymentMethod, transactionId, receivedBy, receiptType = 'Non-GST Receipt', notes, remark } = req.body;
  const validationError = requireFields(req.body, ['fee_plan_id', 'amount', 'paymentDate', 'paymentMethod']);
  if (validationError) return res.status(400).json({ error: validationError });
  const plan = await get(`SELECT * FROM fee_plans WHERE id = ? AND tenant_id = ?`, [fee_plan_id, currentTenantId(req)]);
  if (!plan) return res.status(404).json({ error: 'Fee plan not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO fee_payments (tenant_id, fee_plan_id, student_id, amount, paymentDate, paymentMethod, transactionId, receivedBy, receiptType, receiptNumber, notes, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), fee_plan_id, plan.student_id, Number(amount), paymentDate, paymentMethod, transactionId, receivedBy, receiptType, `PENDING-${Date.now()}`, notes || remark, 'Active', now]
  );
  const receiptNumber = makeReceiptNumber(result.lastID);
  await run(`UPDATE fee_payments SET receiptNumber = ? WHERE id = ?`, [receiptNumber, result.lastID]);
  await run(`INSERT INTO fee_receipts (payment_id, receiptNumber, receiptType, pdfUrl, issuedAt) VALUES (?, ?, ?, ?, ?)`, [result.lastID, receiptNumber, receiptType, null, now]);
  await run(`UPDATE fee_plans SET updatedAt = ? WHERE id = ?`, [now, fee_plan_id]);
  await writeFeeAudit('fee_payment', result.lastID, 'created', null, req.body, req.user.username);
  const payment = await get(
    `SELECT
      fee_payments.*,
      students.name AS studentName,
      fee_plans.courseProgram AS courseProgram,
      fee_plans.feeCategory AS feeCategory,
      fee_plans.paymentType AS paymentType,
      fee_plans.installmentLabel AS installmentLabel
    FROM fee_payments
    INNER JOIN students ON students.id = fee_payments.student_id
    INNER JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
    WHERE fee_payments.id = ? AND fee_payments.tenant_id = ?`,
    [result.lastID, currentTenantId(req)]
  );
  res.json({ ...payment, amount: Number(payment.amount || 0) });
});

router.delete('/api/fee-payments/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { id } = req.params;
  const payment = await get(`SELECT * FROM fee_payments WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const now = new Date().toISOString();
  await run(`UPDATE fee_payments SET status = ?, cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ?`, ['Cancelled', now, req.user.username, req.body?.reason || 'Cancelled by admin', id]);
  await writeFeeAudit('fee_payment', id, 'cancelled', payment, { reason: req.body?.reason || 'Cancelled by admin' }, req.user.username);
  res.json({ ok: true });
});

router.get('/api/fees/reports', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const plans = await loadFeePlansWithPaid(currentTenantId(req));
  const dailyRows = await all(
    `SELECT paymentDate, paymentMethod, COALESCE(SUM(amount), 0) AS amount
     FROM fee_payments
     WHERE COALESCE(status, 'Active') != 'Cancelled' AND tenant_id = ?
     GROUP BY paymentDate, paymentMethod
     ORDER BY paymentDate DESC`,
    [currentTenantId(req)]
  );
  const dailyCollection = Object.values(dailyRows.reduce((acc, row) => {
    const date = row.paymentDate || 'Unknown';
    if (!acc[date]) acc[date] = { date, Cash: 0, UPI: 0, Bank: 0, Cheque: 0, Razorpay: 0, Partial: 0, Other: 0, total: 0 };
    const mode = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Razorpay', 'Partial Payment'].includes(row.paymentMethod) ? row.paymentMethod : 'Other';
    const key = mode === 'Bank Transfer' ? 'Bank' : mode === 'Partial Payment' ? 'Partial' : mode;
    acc[date][key] += Number(row.amount || 0);
    acc[date].total += Number(row.amount || 0);
    return acc;
  }, {}));

  const pendingFees = plans
    .filter((plan) => plan.dueAmount > 0)
    .map((plan) => ({
      studentName: plan.studentName,
      course: plan.courseProgram || plan.feeCategory,
      totalFees: plan.totalAmount,
      paidAmount: plan.paidAmount,
      pendingAmount: plan.dueAmount,
      dueDate: plan.nextDueDate,
      feeStatus: plan.feeStatus,
    }));

  const courseWise = Object.values(plans.reduce((acc, plan) => {
    const course = plan.courseProgram || plan.feeCategory || 'Other';
    if (!acc[course]) acc[course] = { course, totalExpected: 0, collected: 0, pending: 0 };
    acc[course].totalExpected += plan.netAmount;
    acc[course].collected += plan.paidAmount;
    acc[course].pending += plan.dueAmount;
    return acc;
  }, {}));

  const staffRows = await all(
    `SELECT receivedBy, COALESCE(SUM(amount), 0) AS amountCollected, COUNT(DISTINCT student_id) AS students
     FROM fee_payments
     WHERE COALESCE(status, 'Active') != 'Cancelled'
     GROUP BY receivedBy
     ORDER BY amountCollected DESC`
  );
  const staffWise = staffRows.map((row) => ({
    staff: row.receivedBy || 'Unassigned',
    amountCollected: Number(row.amountCollected || 0),
    students: Number(row.students || 0),
  }));

  res.json({
    generatedAt: new Date().toISOString(),
    today,
    dailyCollection,
    pendingFees,
    courseWise,
    staffWise,
  });
});

router.get('/api/fees/reminders', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const plans = await loadFeePlansWithPaid();
  const reminders = [];
  for (const plan of plans) {
    if (plan.dueAmount <= 0) continue;
    const installments = plan.installments?.length ? plan.installments : [{ id: null, label: plan.installmentLabel || 'Fee Due', amount: plan.dueAmount, dueDate: plan.nextDueDate, status: plan.status }];
    for (const installment of installments) {
      if (String(installment.status || '').toLowerCase() === 'paid') continue;
      const reminderType = reminderTypeForDueDate(installment.dueDate || plan.nextDueDate);
      if (!reminderType) continue;
      reminders.push({
        studentId: plan.student_id || plan.studentId,
        studentName: plan.studentName,
        course: plan.courseProgram || plan.feeCategory,
        feePlanId: plan.id,
        installmentId: installment.id || null,
        installmentLabel: installment.label,
        amount: Number(installment.amount || plan.dueAmount || 0),
        dueDate: installment.dueDate || plan.nextDueDate,
        reminderType,
        channels: ['WhatsApp', 'SMS', 'Email'],
        message: reminderMessage(plan, installment),
      });
    }
  }
  res.json(reminders);
});

router.post('/api/fees/reminders', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { student_id, fee_plan_id, installment_id, reminderType, sentVia, message } = req.body;
  const validationError = requireFields(req.body, ['student_id', 'fee_plan_id', 'reminderType', 'sentVia']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO fee_reminders (student_id, fee_plan_id, installment_id, reminderType, sentVia, sentAt, status, message, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, fee_plan_id, installment_id || null, reminderType, sentVia, now, 'Marked Sent', message || null, now]
  );
  const reminder = await get(`SELECT * FROM fee_reminders WHERE id = ?`, [result.lastID]);
  res.json(reminder);
});

router.post('/api/automation/fees', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { dryRun = false, sendNow = true, sentVia = 'WhatsApp Automation' } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const planRows = await all(
    `SELECT fee_plans.*, students.name AS studentName, students.data AS studentData,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
     FROM fee_plans
     LEFT JOIN students ON students.id = fee_plans.student_id
     LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     GROUP BY fee_plans.id, students.name, students.data
     ORDER BY fee_plans.dueDate ASC, fee_plans.id DESC`
  );
  const plans = (await attachFeeDetailsMany(planRows)).filter((plan) => Number(plan.dueAmount || 0) > 0);
  const queued = [];
  const skipped = [];

  for (const plan of plans) {
    const installments = await all(`SELECT * FROM fee_installments WHERE fee_plan_id = ? ORDER BY dueDate ASC, id ASC`, [plan.id]);
    const pendingInstallments = installments.length
      ? installments.filter((installment) => String(installment.status || '').toLowerCase() !== 'paid')
      : [{ id: null, label: plan.installmentLabel || 'Fee Due', amount: plan.dueAmount, dueDate: plan.dueDate, status: plan.feeStatus }];

    for (const installment of pendingInstallments) {
      const dueDate = installment.dueDate || plan.dueDate;
      const reminderType = reminderTypeForDueDate(dueDate);
      if (!reminderType) continue;

      const duplicate = installment.id
        ? await get(
          `SELECT id FROM fee_reminders
           WHERE fee_plan_id = ? AND installment_id = ? AND reminderType = ? AND substr(sentAt, 1, 10) = ?`,
          [plan.id, installment.id, reminderType, today]
        )
        : await get(
          `SELECT id FROM fee_reminders
           WHERE fee_plan_id = ? AND installment_id IS NULL AND reminderType = ? AND substr(sentAt, 1, 10) = ?`,
          [plan.id, reminderType, today]
        );

      const templateKey = reminderType === 'After Due Date' || reminderType === 'Final Reminder'
        ? 'fee_overdue_reminder'
        : 'fee_due_reminder';
      const amount = Number(installment.amount || plan.dueAmount || 0);
      const row = {
        student_id: plan.student_id,
        fee_plan_id: plan.id,
        installment_id: installment.id || null,
        studentName: plan.studentName,
        parentPhone: parentPhoneFromStudentData(plan.studentData),
        course: plan.courseProgram || plan.feeCategory,
        installmentLabel: installment.label || plan.installmentLabel || 'Fee Due',
        amount,
        dueDate,
        reminderType,
        sentVia,
        message: await renderMessageTemplate(templateKey, {
          studentName: plan.studentName,
          amount: amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
          dueDate,
          course: plan.courseProgram || plan.feeCategory,
          installmentLabel: installment.label || plan.installmentLabel || 'Fee Due',
        }, reminderMessage(plan, installment)),
      };

      if (duplicate) {
        skipped.push({ ...row, reason: 'Already queued today' });
        continue;
      }

      if (!dryRun) {
        const delivery = sendNow
          ? await sendWhatsAppText(row.parentPhone, row.message)
          : { ok: false, status: 'Queued', provider: 'manual', error: 'sendNow disabled' };
        row.status = delivery.status;
        row.provider = delivery.provider;
        row.deliveryError = delivery.error || '';
        const result = await run(
          `INSERT INTO fee_reminders (student_id, fee_plan_id, installment_id, reminderType, sentVia, sentAt, status, message, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.student_id, row.fee_plan_id, row.installment_id, row.reminderType, row.sentVia, now, row.status, row.message, now]
        );
        row.id = result.lastID;
      } else {
        row.status = isWhatsAppConfigured() && row.parentPhone ? 'Ready' : row.parentPhone ? 'Queued' : 'Missing Phone';
      }

      queued.push(row);
    }
  }

  if (!dryRun && queued.length) {
    await writeFeeAudit('fee_reminder', 0, 'automation_run', null, { count: queued.length, sentVia, sendNow }, req.user.username);
  }
  const counts = queued.reduce((acc, row) => {
    const key = String(row.status || 'Queued').replace(/\s+/g, '').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    dryRun: Boolean(dryRun),
    providerConfigured: isWhatsAppConfigured(),
    queued,
    skipped,
    summary: {
      queued: queued.length,
      sent: counts.sent || 0,
      failed: counts.failed || 0,
      missingPhone: counts.missingphone || 0,
      skipped: skipped.length,
      checkedPlans: plans.length,
    },
  });
});

router.get('/api/whatsapp/status', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const config = whatsappConfig();
  const recentFailures = await all(
    `SELECT fee_reminders.*, students.name AS studentName, fee_plans.courseProgram
     FROM fee_reminders
     LEFT JOIN students ON students.id = fee_reminders.student_id
     LEFT JOIN fee_plans ON fee_plans.id = fee_reminders.fee_plan_id
     WHERE fee_reminders.status IN ('Failed', 'Missing Phone')
     ORDER BY fee_reminders.sentAt DESC, fee_reminders.id DESC
     LIMIT 10`
  );
  const recentQueued = await all(
    `SELECT status, COUNT(*) AS count
     FROM fee_reminders
     WHERE sentAt >= ?
     GROUP BY status`,
    [new Date(Date.now() - 7 * 86400000).toISOString()]
  );

  res.json({
    configured: isWhatsAppConfigured(),
    provider: 'WhatsApp Cloud API',
    apiVersion: config.apiVersion,
    phoneNumberId: config.phoneNumberId ? `${config.phoneNumberId.slice(0, 4)}...${config.phoneNumberId.slice(-4)}` : '',
    hasAccessToken: Boolean(config.accessToken),
    last7Days: recentQueued.reduce((acc, row) => {
      acc[row.status || 'Unknown'] = Number(row.count || 0);
      return acc;
    }, {}),
    recentFailures,
  });
});

router.post('/api/whatsapp/test', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { phone, message } = req.body;
  const validationError = requireFields(req.body, ['phone', 'message']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await sendWhatsAppText(phone, message);
  res.json({
    configured: isWhatsAppConfigured(),
    phone: normalizeIndianPhone(phone),
    ...result,
  });
});

function normalizeMessageTemplate(row) {
  return {
    ...row,
    variables: row.variables ? JSON.parse(row.variables) : [],
  };
}

router.get('/api/message-templates', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(`SELECT * FROM message_templates ORDER BY displayName ASC, id ASC`);
  res.json(rows.map(normalizeMessageTemplate));
});

router.put('/api/message-templates/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const { id } = req.params;
  const { displayName, channel = 'WhatsApp', body, variables = [], status = 'Active' } = req.body;
  const validationError = requireFields(req.body, ['displayName', 'body']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM message_templates WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Message template not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE message_templates SET displayName = ?, channel = ?, body = ?, variables = ?, status = ?, updatedBy = ?, updatedAt = ? WHERE id = ?`,
    [displayName, channel, body, JSON.stringify(Array.isArray(variables) ? variables : []), status, req.user.username, now, id]
  );
  res.json(normalizeMessageTemplate(await get(`SELECT * FROM message_templates WHERE id = ?`, [id])));
});

router.get('/api/fees/audit-logs', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const rows = await all(`SELECT * FROM fee_audit_logs ORDER BY createdAt DESC, id DESC LIMIT 100`);
  res.json(rows.map((row) => ({
    ...row,
    oldValue: row.oldValue ? JSON.parse(row.oldValue) : null,
    newValue: row.newValue ? JSON.parse(row.newValue) : null,
  })));
});

function parseStudentData(row) {
  try {
    return row.data ? JSON.parse(row.data) : {};
  } catch (err) {
    return {};
  }
}

function parentPhoneForStudent(student) {
  const data = parseStudentData(student);
  return data.parentMobile || data.primaryPhone || data.whatsapp || data.fatherPhone || data.motherPhone || '';
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function parentPhoneMatches(student, phone) {
  const data = parseStudentData(student);
  const candidates = [data.parentMobile, data.primaryPhone, data.whatsapp, data.fatherPhone, data.motherPhone].map(normalizePhone).filter(Boolean);
  return candidates.includes(normalizePhone(phone));
}

function attendanceAlertMessage(record, session) {
  if (record.status === 'Late') {
    return `Dear Parent,\n\nYour child ${record.studentName} came late for ${session.subject} lecture today at ProTrack Kaizen.\n\nLecture Time: ${session.startTime}\nArrival Time: ${record.arrivalTime || record.markedTime || '-'}\n\nPlease ensure punctuality.\n\n- ProTrack Kaizen`;
  }
  return `Dear Parent,\n\nYour child ${record.studentName} was absent for ${session.subject} lecture of ${session.batch} batch on ${session.date}.\n\nPlease contact ProTrack Kaizen office if there is any reason for absence.\n\n- ProTrack Kaizen`;
}

function minutesLate(checkIn, scheduled = '07:00') {
  if (!checkIn || !scheduled) return 0;
  const [checkHour, checkMinute] = String(checkIn).slice(0, 5).split(':').map(Number);
  const [scheduleHour, scheduleMinute] = String(scheduled).slice(0, 5).split(':').map(Number);
  return Math.max(0, (checkHour * 60 + checkMinute) - (scheduleHour * 60 + scheduleMinute));
}

function staffStatusFromLateMinutes(lateMinutes) {
  if (lateMinutes <= 10) return 'Present';
  if (lateMinutes <= 30) return 'Late';
  if (lateMinutes <= 60) return 'Half Day';
  return 'Admin Approval Required';
}

async function createParentAlertLog(recordId, alertStatus, channel, userName) {
  const row = await get(
    `SELECT
      attendance_records.*,
      students.name AS studentName,
      students.data AS studentData,
      attendance_sessions.date,
      attendance_sessions.batch,
      attendance_sessions.subject,
      attendance_sessions.startTime
     FROM attendance_records
     INNER JOIN students ON students.id = attendance_records.student_id
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_records.id = ?`,
    [recordId]
  );
  if (!row) return null;
  const message = attendanceAlertMessage(row, row);
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO parent_alert_logs (student_id, attendance_record_id, alertType, channel, message, status, sentAt, delivery, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.student_id, recordId, row.status, channel || 'WhatsApp', message, alertStatus, now, alertStatus === 'Sent' ? 'Delivered' : alertStatus, now]
  );
  return get(`SELECT * FROM parent_alert_logs WHERE id = ?`, [result.lastID]);
}

async function queueAutomation({ automationType, targetType, targetId, referenceType, referenceId, sentVia = 'WhatsApp', message }) {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO automation_logs (automationType, targetType, targetId, referenceType, referenceId, sentVia, message, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [automationType, targetType, targetId || null, referenceType || null, referenceId || null, sentVia, message, 'Queued', now]
  );
  return get(`SELECT * FROM automation_logs WHERE id = ?`, [result.lastID]);
}

function normalizeAttendanceRecord(row) {
  return {
    ...row,
    status: row.status || 'Not Marked',
    alertStatus: row.alertStatus || 'Not Required',
    parentPhone: row.parentPhone || '',
  };
}

async function getAttendanceRecords(sessionId) {
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [sessionId]);
  const tenantId = session?.tenant_id || null;
  const rows = await all(
    `SELECT
      attendance_records.*,
      students.name AS studentName,
      students.grade AS grade,
      students.batch AS studentBatch,
      students.data AS studentData
    FROM attendance_records
    INNER JOIN students ON students.id = attendance_records.student_id
      AND students.tenant_id = attendance_records.tenant_id
    WHERE attendance_records.session_id = ?
      AND attendance_records.tenant_id = ?
      AND attendance_records.deletedAt IS NULL
    ORDER BY students.name ASC`,
    [sessionId, tenantId]
  );
  return rows.map((row) => normalizeAttendanceRecord({
    ...row,
    parentPhone: parentPhoneForStudent({ data: row.studentData }),
  }));
}

async function attachAttendanceRecords(session) {
  if (!session) return session;
  const records = await getAttendanceRecords(session.id);
  return { ...session, records };
}

async function createMissingAttendanceRecords(session) {
  const students = await all(`SELECT * FROM students WHERE batch = ? AND tenant_id = ? ORDER BY name ASC`, [session.batch, session.tenant_id]);
  for (const student of students) {
    const existing = await get(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND tenant_id = ?`, [session.id, student.id, session.tenant_id]);
    if (!existing) {
      await run(
        `INSERT INTO attendance_records (tenant_id, session_id, student_id, status, alertStatus, createdBy, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.tenant_id, session.id, student.id, 'Not Marked', 'Not Required', session.markedBy || 'system', new Date().toISOString(), new Date().toISOString(), null]
      );
    }
  }
}

async function attendanceSessionsBase(tenantId) {
  const rows = await all(
    `SELECT
      attendance_sessions.*,
      COUNT(attendance_records.id) AS studentCount,
      SUM(CASE WHEN attendance_records.status != 'Not Marked' THEN 1 ELSE 0 END) AS markedCount,
      SUM(CASE WHEN attendance_records.status = 'Absent' THEN 1 ELSE 0 END) AS absentCount,
      SUM(CASE WHEN attendance_records.status = 'Late' THEN 1 ELSE 0 END) AS lateCount
    FROM attendance_sessions
    LEFT JOIN attendance_records ON attendance_records.session_id = attendance_sessions.id
      AND attendance_records.tenant_id = attendance_sessions.tenant_id
      AND attendance_records.deletedAt IS NULL
    WHERE attendance_sessions.tenant_id = ?
      AND attendance_sessions.deletedAt IS NULL
    GROUP BY attendance_sessions.id
    ORDER BY attendance_sessions.date DESC, attendance_sessions.startTime DESC, attendance_sessions.id DESC`,
    [tenantId]
  );
  return rows.map((row) => ({
    ...row,
    studentCount: Number(row.studentCount || 0),
    markedCount: Number(row.markedCount || 0),
    absentCount: Number(row.absentCount || 0),
    lateCount: Number(row.lateCount || 0),
  }));
}

router.get('/api/attendance/sessions', authMiddleware, requireTenant, async (req, res) => {
  res.json(await attendanceSessionsBase(currentTenantId(req)));
});

router.get('/api/attendance/sessions/:id', authMiddleware, requireTenant, async (req, res) => {
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ? AND deletedAt IS NULL`, [req.params.id, currentTenantId(req)]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

router.post('/api/attendance/sessions', authMiddleware, requireTenant, async (req, res) => {
  const { date, batch, course, subject, teacher_id, teacherName, startTime, endTime, lectureType = 'Regular', remarks } = req.body;
  const validationError = requireFields(req.body, ['date', 'batch', 'subject', 'startTime', 'endTime']);
  if (validationError) return res.status(400).json({ error: validationError });
  let teacherLabel = teacherName || '';
  if (teacher_id) {
    const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
    if (teacher) teacherLabel = teacher.name;
  }
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO attendance_sessions (tenant_id, date, batch, course, subject, teacher_id, teacherName, startTime, endTime, lectureType, status, markedBy, remarks, createdBy, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), date, batch, course, subject, teacher_id || null, teacherLabel, startTime, endTime, lectureType, 'Draft', req.user.username, remarks, req.user.id || req.user.username, now, now, null]
  );
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ?`, [result.lastID, currentTenantId(req)]);
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

router.put('/api/attendance/sessions/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { date, batch, course, subject, teacher_id, teacherName, startTime, endTime, lectureType, remarks } = req.body;
  const existing = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ? AND deletedAt IS NULL`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Attendance session not found' });
  if (existing.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  let teacherLabel = teacherName || existing.teacherName;
  if (teacher_id) {
    const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
    if (teacher) teacherLabel = teacher.name;
  }
  await run(
    `UPDATE attendance_sessions SET date = ?, batch = ?, course = ?, subject = ?, teacher_id = ?, teacherName = ?, startTime = ?, endTime = ?, lectureType = ?, remarks = ?, updatedAt = ? WHERE id = ? AND tenant_id = ? AND deletedAt IS NULL`,
    [date, batch, course, subject, teacher_id || null, teacherLabel, startTime, endTime, lectureType, remarks, new Date().toISOString(), id, currentTenantId(req)]
  );
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

router.post('/api/attendance/sessions/:id/records', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { records = [], submit = false } = req.body;
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ? AND deletedAt IS NULL`, [id, currentTenantId(req)]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (session.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  const now = new Date().toISOString();
  for (const record of records) {
    if (!record.student_id && !record.studentId) continue;
    const studentId = record.student_id || record.studentId;
    const status = record.status || 'Not Marked';
    const alertStatus = ['Absent', 'Late'].includes(status) ? (record.alertStatus || 'Not Sent') : 'Not Required';
    const existing = await get(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND tenant_id = ?`, [id, studentId, currentTenantId(req)]);
    if (existing) {
      await run(
        `UPDATE attendance_records SET status = ?, markedBy = ?, markedAt = ?, markedTime = ?, arrivalTime = ?, alertStatus = ?, remarks = ?, updatedAt = ? WHERE session_id = ? AND student_id = ? AND tenant_id = ?`,
        [status, req.user.username, now, record.markedTime || now, record.arrivalTime || null, alertStatus, record.remarks || null, now, id, studentId, currentTenantId(req)]
      );
    } else {
      await run(
        `INSERT INTO attendance_records (tenant_id, session_id, student_id, status, markedBy, markedAt, markedTime, arrivalTime, alertStatus, remarks, createdBy, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentTenantId(req), id, studentId, status, req.user.username, now, record.markedTime || now, record.arrivalTime || null, alertStatus, record.remarks || null, req.user.id || req.user.username, now, now, null]
      );
    }
  }
  await run(
    `UPDATE attendance_sessions SET status = ?, submittedAt = ?, lockedAt = ?, markedBy = ?, updatedAt = ? WHERE id = ? AND tenant_id = ?`,
    [submit ? 'Submitted' : 'Draft', submit ? now : session.submittedAt, submit ? now : session.lockedAt, req.user.username, now, id, currentTenantId(req)]
  );
  const updated = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  res.json(await attachAttendanceRecords(updated));
});

router.post('/api/attendance/sessions/:id/mark-all-present', authMiddleware, requireTenant, async (req, res) => {
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ? AND tenant_id = ? AND deletedAt IS NULL`, [req.params.id, currentTenantId(req)]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (session.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  await createMissingAttendanceRecords(session);
  const now = new Date().toISOString();
  await run(`UPDATE attendance_records SET status = ?, markedBy = ?, markedAt = ?, markedTime = ?, alertStatus = ?, updatedAt = ? WHERE session_id = ? AND tenant_id = ?`, ['Present', req.user.username, now, now, 'Not Required', now, req.params.id, currentTenantId(req)]);
  res.json(await attachAttendanceRecords(session));
});

router.post('/api/attendance/records/:id/alert', authMiddleware, requireTenant, async (req, res) => {
  const { alertStatus = 'Sent', channel = 'WhatsApp' } = req.body;
  const record = await get(`SELECT * FROM attendance_records WHERE id = ?`, [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  await run(`UPDATE attendance_records SET alertStatus = ?, updatedAt = ? WHERE id = ?`, [alertStatus, new Date().toISOString(), req.params.id]);
  const log = await createParentAlertLog(req.params.id, alertStatus, channel, req.user.username);
  res.json({ ok: true, log });
});

router.delete('/api/attendance/sessions/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const records = await all(`SELECT id FROM attendance_records WHERE session_id = ?`, [req.params.id]);
  for (const record of records) {
    await run(`DELETE FROM parent_alert_logs WHERE attendance_record_id = ?`, [record.id]);
    await run(`DELETE FROM parent_call_logs WHERE attendance_record_id = ?`, [record.id]);
    await run(`DELETE FROM attendance_correction_requests WHERE record_id = ?`, [record.id]);
  }
  await run(`DELETE FROM attendance_records WHERE session_id = ?`, [req.params.id]);
  await run(`DELETE FROM attendance_sessions WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/attendance/dashboard', authMiddleware, requireTenant, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const sessions = await attendanceSessionsBase();
  const todaySessions = sessions.filter((session) => session.date === date);
  const records = await all(
    `SELECT attendance_records.*, attendance_sessions.batch, attendance_sessions.subject
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_sessions.date = ?`,
    [date]
  );
  const batchStats = {};
  records.forEach((record) => {
    if (!batchStats[record.batch]) batchStats[record.batch] = { batch: record.batch, total: 0, present: 0 };
    batchStats[record.batch].total += 1;
    if (['Present', 'Late', 'Excused'].includes(record.status)) batchStats[record.batch].present += 1;
  });
  const lowest = Object.values(batchStats)
    .map((row) => ({ ...row, averageAttendance: row.total ? Math.round((row.present / row.total) * 100) : 0 }))
    .sort((a, b) => a.averageAttendance - b.averageAttendance)[0];
  res.json({
    date,
    totalLecturesToday: todaySessions.length,
    attendanceMarked: todaySessions.filter((session) => session.status === 'Submitted').length,
    pendingAttendance: todaySessions.filter((session) => session.status !== 'Submitted').length,
    totalStudentsAbsentToday: records.filter((record) => record.status === 'Absent').length,
    parentAlertsSent: records.filter((record) => record.alertStatus === 'Sent').length,
    alertFailed: records.filter((record) => record.alertStatus === 'Failed').length,
    lowestAttendanceBatch: lowest?.batch || '',
  });
});

router.get('/api/attendance/reports', authMiddleware, requireTenant, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const allRows = await all(
    `SELECT
      attendance_records.*,
      students.name AS studentName,
      students.batch AS studentBatch,
      students.data AS studentData,
      attendance_sessions.batch,
      attendance_sessions.course,
      attendance_sessions.subject,
      attendance_sessions.teacherName,
      attendance_sessions.date
     FROM attendance_records
     INNER JOIN students ON students.id = attendance_records.student_id
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_sessions.date LIKE ?
     ORDER BY attendance_sessions.date DESC, students.name ASC`,
    [`${month}%`]
  );
  const today = new Date().toISOString().slice(0, 10);
  const dailyAbsent = allRows
    .filter((row) => row.date === today && ['Absent', 'Late'].includes(row.status))
    .map((row) => ({
      studentName: row.studentName,
      batch: row.batch,
      subject: row.subject,
      teacherName: row.teacherName,
      parentPhone: parentPhoneForStudent({ data: row.studentData }),
      alertStatus: row.alertStatus,
      status: row.status,
    }));

  const studentStats = Object.values(allRows.reduce((acc, row) => {
    const key = `${row.student_id}-${row.batch}`;
    if (!acc[key]) acc[key] = { studentName: row.studentName, batch: row.batch, totalLectures: 0, present: 0, absent: 0, late: 0, excused: 0 };
    acc[key].totalLectures += 1;
    if (row.status === 'Present') acc[key].present += 1;
    if (row.status === 'Absent') acc[key].absent += 1;
    if (row.status === 'Late') acc[key].late += 1;
    if (row.status === 'Excused') acc[key].excused += 1;
    return acc;
  }, {})).map((row) => ({
    ...row,
    attendancePercent: row.totalLectures ? Math.round((row.present / row.totalLectures) * 100) : 0,
  }));
  const irregularStudents = studentStats
    .filter((row) => row.attendancePercent < 75 || row.absent >= 3 || row.late >= 3)
    .map((row) => ({
      ...row,
      reason: row.attendancePercent < 75 ? 'Below 75% attendance' : row.absent >= 3 ? 'Repeated absence' : 'Repeated late marks',
    }));

  const batchAttendance = Object.values(allRows.reduce((acc, row) => {
    if (!acc[row.batch]) acc[row.batch] = { batch: row.batch, totalRows: 0, attended: 0, students: new Set(), irregular: new Set() };
    acc[row.batch].totalRows += 1;
    acc[row.batch].students.add(row.student_id);
    if (['Present', 'Late', 'Excused'].includes(row.status)) acc[row.batch].attended += 1;
    return acc;
  }, {})).map((row) => {
    const irregularStudents = studentStats.filter((student) => student.batch === row.batch && student.attendancePercent < 75).length;
    return {
      batch: row.batch,
      totalStudents: row.students.size,
      averageAttendance: row.totalRows ? Math.round((row.attended / row.totalRows) * 100) : 0,
      irregularStudents,
    };
  });

  const subjectAttendance = Object.values(allRows.reduce((acc, row) => {
    const key = `${row.subject}-${row.batch}`;
    if (!acc[key]) acc[key] = { subject: row.subject, batch: row.batch, totalRows: 0, attended: 0, lectureDates: new Set() };
    acc[key].totalRows += 1;
    acc[key].lectureDates.add(row.date);
    if (['Present', 'Late', 'Excused'].includes(row.status)) acc[key].attended += 1;
    return acc;
  }, {})).map((row) => ({
    subject: row.subject,
    batch: row.batch,
    totalLectures: row.lectureDates.size,
    averageAttendance: row.totalRows ? Math.round((row.attended / row.totalRows) * 100) : 0,
  }));

  const teacherSessions = await all(
    `SELECT
      attendance_sessions.id,
      attendance_sessions.teacherName,
      attendance_sessions.subject,
      attendance_sessions.status,
      COUNT(attendance_records.id) AS totalRows,
      SUM(CASE WHEN attendance_records.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS attendedRows
     FROM attendance_sessions
     LEFT JOIN attendance_records ON attendance_records.session_id = attendance_sessions.id
     WHERE attendance_sessions.date LIKE ?
     GROUP BY attendance_sessions.id, attendance_sessions.teacherName, attendance_sessions.subject, attendance_sessions.status`,
    [`${month}%`]
  );
  const teacherWise = Object.values(teacherSessions.reduce((acc, row) => {
    const key = `${row.teacherName || 'Unassigned'}-${row.subject || 'Subject'}`;
    if (!acc[key]) acc[key] = { teacherName: row.teacherName || 'Unassigned', subject: row.subject || '-', lecturesAssigned: 0, attendanceMarked: 0, pending: 0, totalRows: 0, attendedRows: 0 };
    acc[key].lecturesAssigned += 1;
    if (row.status === 'Submitted') acc[key].attendanceMarked += 1;
    if (row.status !== 'Submitted') acc[key].pending += 1;
    acc[key].totalRows += Number(row.totalRows || 0);
    acc[key].attendedRows += Number(row.attendedRows || 0);
    return acc;
  }, {})).map((row) => ({
    ...row,
    averageStudentAttendance: row.totalRows ? Math.round((row.attendedRows / row.totalRows) * 100) : 0,
  }));

  const parentAlertLogs = await all(
    `SELECT
      parent_alert_logs.*,
      students.name AS studentName,
      students.data AS studentData,
      attendance_records.status AS attendanceStatus
     FROM parent_alert_logs
     INNER JOIN students ON students.id = parent_alert_logs.student_id
     LEFT JOIN attendance_records ON attendance_records.id = parent_alert_logs.attendance_record_id
     WHERE parent_alert_logs.sentAt LIKE ?
     ORDER BY parent_alert_logs.sentAt DESC`,
    [`${month}%`]
  );

  res.json({
    month,
    dailyAbsent,
    monthlyStudentAttendance: studentStats,
    irregularStudents,
    batchAttendance,
    subjectAttendance,
    teacherWise,
    teacherCompletion: teacherWise,
    parentAlertLogs: parentAlertLogs.map((row) => ({
      ...row,
      parentPhone: parentPhoneForStudent({ data: row.studentData }),
    })),
  });
});

router.get('/api/attendance/parent-alert-logs', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT
      parent_alert_logs.*,
      students.name AS studentName,
      students.data AS studentData,
      attendance_records.status AS attendanceStatus
     FROM parent_alert_logs
     INNER JOIN students ON students.id = parent_alert_logs.student_id
     LEFT JOIN attendance_records ON attendance_records.id = parent_alert_logs.attendance_record_id
     ORDER BY parent_alert_logs.sentAt DESC, parent_alert_logs.id DESC
     LIMIT 100`
  );
  res.json(rows.map((row) => ({
    ...row,
    parentPhone: parentPhoneForStudent({ data: row.studentData }),
  })));
});

router.post('/api/attendance/parent-call-logs', authMiddleware, requireTenant, async (req, res) => {
  const { student_id, attendance_record_id, parentPhone, callOutcome, notes, followUpDate } = req.body;
  const validationError = requireFields(req.body, ['student_id', 'callOutcome']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO parent_call_logs (student_id, attendance_record_id, parentPhone, callOutcome, calledBy, calledAt, followUpDate, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, attendance_record_id || null, parentPhone || null, callOutcome, req.user.username, now, followUpDate || null, notes || null, now]
  );
  res.json(await get(`SELECT * FROM parent_call_logs WHERE id = ?`, [result.lastID]));
});

router.get('/api/attendance/parent-call-logs', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT
      parent_call_logs.*,
      students.name AS studentName
     FROM parent_call_logs
     INNER JOIN students ON students.id = parent_call_logs.student_id
     ORDER BY parent_call_logs.calledAt DESC, parent_call_logs.id DESC
     LIMIT 100`
  );
  res.json(rows);
});

router.post('/api/staff-attendance/check-in', authMiddleware, requireTenant, async (req, res) => {
  const { staff_id, branchName = 'Tembhurni', scheduledStart = '07:00', scheduledLectures = 0, remarks } = req.body;
  const validationError = requireFields(req.body, ['staff_id']);
  if (validationError) return res.status(400).json({ error: validationError });
  const staff = await get(`SELECT * FROM teachers WHERE id = ?`, [staff_id]);
  if (!staff) return res.status(404).json({ error: 'Staff member not found' });
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const checkIn = now.toTimeString().slice(0, 5);
  const lateMinutes = minutesLate(checkIn, scheduledStart);
  const status = staffStatusFromLateMinutes(lateMinutes);
  const existing = await get(`SELECT * FROM staff_attendance_records WHERE staff_id = ? AND date = ?`, [staff_id, date]);
  if (existing) return res.status(400).json({ error: 'Staff already checked in today' });
  const result = await run(
    `INSERT INTO staff_attendance_records (
      staff_id, staffName, role, branchName, date, checkIn, status, lateMinutes,
      scheduledLectures, lecturesTaken, missedLectures, replacementRequired, remarks, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [staff_id, staff.name, staff.subject || 'Teacher', branchName, date, checkIn, status, lateMinutes, Number(scheduledLectures || 0), 0, Number(scheduledLectures || 0), Number(scheduledLectures || 0) > 0 && status === 'Admin Approval Required' ? 'Yes' : 'No', remarks, now.toISOString(), now.toISOString()]
  );
  res.json(await get(`SELECT * FROM staff_attendance_records WHERE id = ?`, [result.lastID]));
});

router.post('/api/staff-attendance/check-out', authMiddleware, requireTenant, async (req, res) => {
  const { staff_id, lecturesTaken = 0, remarks } = req.body;
  const validationError = requireFields(req.body, ['staff_id']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const existing = await get(`SELECT * FROM staff_attendance_records WHERE staff_id = ? AND date = ?`, [staff_id, date]);
  if (!existing) return res.status(404).json({ error: 'No check-in found for today' });
  const missedLectures = Math.max(0, Number(existing.scheduledLectures || 0) - Number(lecturesTaken || 0));
  await run(
    `UPDATE staff_attendance_records SET checkOut = ?, lecturesTaken = ?, missedLectures = ?, replacementRequired = ?, remarks = ?, updatedAt = ? WHERE id = ?`,
    [now.toTimeString().slice(0, 5), Number(lecturesTaken || 0), missedLectures, missedLectures > 0 ? 'Yes' : existing.replacementRequired || 'No', remarks || existing.remarks, now.toISOString(), existing.id]
  );
  res.json(await get(`SELECT * FROM staff_attendance_records WHERE id = ?`, [existing.id]));
});

router.get('/api/staff-attendance/today', authMiddleware, requireTenant, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(await all(`SELECT * FROM staff_attendance_records WHERE date = ? ORDER BY checkIn ASC, staffName ASC`, [date]));
});

router.get('/api/staff-attendance/monthly', authMiddleware, requireTenant, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = await all(`SELECT * FROM staff_attendance_records WHERE date LIKE ? ORDER BY date DESC, staffName ASC`, [`${month}%`]);
  const summary = Object.values(rows.reduce((acc, row) => {
    const key = row.staffName || row.staff_id;
    if (!acc[key]) acc[key] = { staffName: row.staffName, presentDays: 0, lateMarks: 0, halfDays: 0, absentDays: 0, missedLectures: 0, replacementRequired: 0 };
    if (['Present', 'Late', 'Half Day'].includes(row.status)) acc[key].presentDays += 1;
    if (row.status === 'Late') acc[key].lateMarks += 1;
    if (row.status === 'Half Day') acc[key].halfDays += 1;
    if (row.status === 'Absent') acc[key].absentDays += 1;
    acc[key].missedLectures += Number(row.missedLectures || 0);
    if (row.replacementRequired === 'Yes') acc[key].replacementRequired += 1;
    return acc;
  }, {})).map((row) => ({
    ...row,
    salaryHalfDayDeductions: row.halfDays + Math.floor(row.lateMarks / 3),
    salaryAbsentDayDeductions: row.absentDays,
  }));
  res.json({ month, rows, summary });
});

router.post('/api/leave-requests', authMiddleware, requireTenant, async (req, res) => {
  const { staff_id, leaveType, fromDate, toDate, reason, replacementTeacher } = req.body;
  const validationError = requireFields(req.body, ['staff_id', 'leaveType', 'fromDate', 'toDate', 'reason']);
  if (validationError) return res.status(400).json({ error: validationError });
  const staff = await get(`SELECT * FROM teachers WHERE id = ?`, [staff_id]);
  if (!staff) return res.status(404).json({ error: 'Staff member not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO leave_requests (staff_id, staffName, leaveType, fromDate, toDate, reason, replacementTeacher, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [staff_id, staff.name, leaveType, fromDate, toDate, reason, replacementTeacher, 'Pending', now, now]
  );
  res.json(await get(`SELECT * FROM leave_requests WHERE id = ?`, [result.lastID]));
});

router.get('/api/leave-requests', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(`SELECT * FROM leave_requests ORDER BY createdAt DESC, id DESC`));
});

router.patch('/api/leave-requests/:id/approve', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE leave_requests SET status = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`, ['Approved', req.user.username, now, now, req.params.id]);
  const row = await get(`SELECT * FROM leave_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  res.json(row);
});

router.patch('/api/leave-requests/:id/reject', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE leave_requests SET status = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`, ['Rejected', req.user.username, now, now, req.params.id]);
  const row = await get(`SELECT * FROM leave_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  res.json(row);
});

router.post('/api/attendance/corrections', authMiddleware, requireTenant, async (req, res) => {
  const { record_id, newStatus, requestReason } = req.body;
  const validationError = requireFields(req.body, ['record_id', 'newStatus', 'requestReason']);
  if (validationError) return res.status(400).json({ error: validationError });
  const record = await get(`SELECT * FROM attendance_records WHERE id = ?`, [record_id]);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  const result = await run(
    `INSERT INTO attendance_correction_requests (record_id, session_id, student_id, oldStatus, newStatus, requestReason, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record_id, record.session_id, record.student_id, record.status, newStatus, requestReason, 'Pending', req.user.username, new Date().toISOString()]
  );
  res.json(await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [result.lastID]));
});

router.get('/api/attendance/corrections', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(
    `SELECT attendance_correction_requests.*, students.name AS studentName
     FROM attendance_correction_requests
     LEFT JOIN students ON students.id = attendance_correction_requests.student_id
     ORDER BY attendance_correction_requests.createdAt DESC`
  ));
});

router.patch('/api/attendance/corrections/:id/approve', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const correction = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]);
  if (!correction) return res.status(404).json({ error: 'Correction request not found' });
  const now = new Date().toISOString();
  await run(`UPDATE attendance_records SET status = ?, updatedAt = ? WHERE id = ?`, [correction.newStatus, now, correction.record_id]);
  await run(`UPDATE attendance_correction_requests SET status = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ?`, ['Approved', req.user.username, now, req.params.id]);
  res.json(await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]));
});

router.patch('/api/attendance/corrections/:id/reject', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE attendance_correction_requests SET status = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ?`, ['Rejected', req.user.username, now, req.params.id]);
  const row = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Correction request not found' });
  res.json(row);
});

router.get('/api/automation/logs', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM automation_logs ORDER BY createdAt DESC, id DESC LIMIT 150`);
  res.json(rows);
});

router.patch('/api/automation/logs/:id/sent', authMiddleware, requireTenant, async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE automation_logs SET status = ?, sentAt = ?, processedAt = ? WHERE id = ?`, ['Sent', now, now, req.params.id]);
  const row = await get(`SELECT * FROM automation_logs WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Automation log not found' });
  res.json(row);
});

router.post('/api/automation/attendance', authMiddleware, requireTenant, async (req, res) => {
  const month = req.body?.month || new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const absentRows = await all(
    `SELECT
      students.id AS studentId,
      students.name AS studentName,
      students.data AS studentData,
      COUNT(attendance_records.id) AS absentCount
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     INNER JOIN students ON students.id = attendance_records.student_id
     WHERE attendance_sessions.date LIKE ? AND attendance_records.status = 'Absent'
     GROUP BY students.id, students.name, students.data
     HAVING COUNT(attendance_records.id) >= 3`,
    [`${month}%`]
  );
  const absenteeAlerts = [];
  for (const row of absentRows) {
    absenteeAlerts.push(await queueAutomation({
      automationType: 'Repeated Absentee Alert',
      targetType: 'Student',
      targetId: row.studentId,
      referenceType: 'Attendance',
      referenceId: row.studentId,
      sentVia: 'WhatsApp',
      message: `Dear Parent,\n\nYour child ${row.studentName} has been absent ${row.absentCount} times this month at ProTrack Kaizen. Please contact the office for academic support.\n\n- ProTrack Kaizen`,
    }));
  }

  const lateRows = await all(`SELECT * FROM staff_attendance_records WHERE date = ? AND status IN ('Late', 'Half Day', 'Admin Approval Required')`, [today]);
  const teacherLateAlerts = [];
  for (const row of lateRows) {
    teacherLateAlerts.push(await queueAutomation({
      automationType: 'Teacher Late Alert',
      targetType: 'Staff',
      targetId: row.staff_id || row.staffId,
      referenceType: 'Staff Attendance',
      referenceId: row.id,
      sentVia: 'WhatsApp',
      message: `${row.staffName} is marked ${row.status} today. Check-in: ${row.checkIn || '-'}, late minutes: ${row.lateMinutes || 0}. Academic head/admin follow-up required.`,
    }));
  }

  res.json({ month, absenteeAlerts, teacherLateAlerts });
});

router.get('/api/automation/batch-discipline', authMiddleware, requireTenant, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const reportReq = { query: { month } };
  const rows = await all(
    `SELECT
      attendance_sessions.batch,
      COUNT(attendance_records.id) AS totalRows,
      SUM(CASE WHEN attendance_records.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS attendedRows,
      SUM(CASE WHEN attendance_records.status = 'Absent' THEN 1 ELSE 0 END) AS absentRows,
      SUM(CASE WHEN attendance_records.status = 'Late' THEN 1 ELSE 0 END) AS lateRows
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_sessions.date LIKE ?
     GROUP BY attendance_sessions.batch
     ORDER BY attendance_sessions.batch`,
    [`${month}%`]
  );
  res.json(rows.map((row) => {
    const averageAttendance = Number(row.totalRows || 0) ? Math.round((Number(row.attendedRows || 0) / Number(row.totalRows || 0)) * 100) : 0;
    return {
      batch: row.batch,
      averageAttendance,
      absentRows: Number(row.absentRows || 0),
      lateRows: Number(row.lateRows || 0),
      riskLevel: averageAttendance < 70 ? 'High' : averageAttendance < 85 ? 'Medium' : 'Good',
      action: averageAttendance < 70 ? 'Alert branch manager' : averageAttendance < 85 ? 'Counsellor review' : 'Monitor',
    };
  }));
});

router.post('/api/parent-portal/lookup', async (req, res) => {
  const { student_id, parentPhone } = req.body;
  const validationError = requireFields(req.body, ['student_id', 'parentPhone']);
  if (validationError) return res.status(400).json({ error: validationError });
  const student = await get(`SELECT * FROM students WHERE id = ?`, [student_id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!parentPhoneMatches(student, parentPhone)) return res.status(403).json({ error: 'Parent phone does not match this student' });
  const attendanceRows = await all(
    `SELECT attendance_records.status, attendance_records.remarks, attendance_sessions.date, attendance_sessions.batch, attendance_sessions.subject, attendance_sessions.teacherName
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_records.student_id = ?
     ORDER BY attendance_sessions.date DESC, attendance_sessions.startTime DESC
     LIMIT 30`,
    [student_id]
  );
  const feeRows = await all(
    `SELECT
      fee_plans.*,
      students.name AS studentName,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
     FROM fee_plans
     INNER JOIN students ON students.id = fee_plans.student_id
     LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     WHERE fee_plans.student_id = ?
     GROUP BY fee_plans.id, students.name
     ORDER BY fee_plans.updatedAt DESC`,
    [student_id]
  );
  const feePlans = await attachFeeDetailsMany(feeRows);
  const payments = await all(
    `SELECT receiptNumber, amount, paymentDate, paymentMethod
     FROM fee_payments
     WHERE student_id = ? AND COALESCE(status, 'Active') != 'Cancelled'
     ORDER BY paymentDate DESC, id DESC
     LIMIT 20`,
    [student_id]
  );
  const communication = await buildStudentCommunicationTimeline(student_id, { limit: 25 });
  res.json({
    student: { id: student.id, name: student.name, grade: student.grade, batch: student.batch },
    attendance: attendanceRows,
    fees: feePlans.map((plan) => ({ course: plan.courseProgram || plan.feeCategory, netAmount: plan.netAmount, paidAmount: plan.paidAmount, dueAmount: plan.dueAmount, feeStatus: plan.feeStatus, nextDueDate: plan.nextDueDate })),
    payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount || 0) })),
    communication: communication.timeline,
  });
});

function normalizeAiLabStudent(row) {
  if (!row) return row;
  return {
    ...row,
    deviceRequired: Boolean(Number(row.deviceRequired || 0)),
    skillLevel: Number(row.skillLevel || 0),
  };
}

function normalizeAiLabBooleanRow(row, fields = []) {
  if (!row) return row;
  const normalized = { ...row };
  fields.forEach((field) => {
    normalized[field] = Boolean(Number(normalized[field] || 0));
  });
  ['score', 'finalScore', 'totalScore', 'logic', 'coding', 'debugging', 'creativity', 'presentation', 'discipline', 'independence', 'projectWork'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) normalized[field] = Number(normalized[field] || 0);
  });
  return normalized;
}

function makeAiLabCertificateId(id) {
  return `PK-AILAB-${new Date().getFullYear()}-${String(id).padStart(3, '0')}`;
}

async function loadAiLabDashboard() {
  const students = (await all(`SELECT * FROM ai_lab_students ORDER BY id DESC`)).map(normalizeAiLabStudent);
  const courses = await all(`SELECT * FROM ai_lab_courses ORDER BY courseName ASC`);
  const attendanceRows = await all(`SELECT status FROM ai_lab_attendance`);
  const assignmentRows = await all(`SELECT status FROM ai_lab_assignments`);
  const projectRows = await all(`SELECT status, finalDemoStatus FROM ai_lab_projects`);
  const deviceRows = await all(`SELECT status FROM ai_lab_devices`);
  const portfolioRows = await all(`SELECT status, githubUsername, projectRepository FROM ai_lab_portfolios`);
  const certificateRows = await all(`SELECT status FROM ai_lab_certificates`);
  const totalAttendance = attendanceRows.length;
  const attended = attendanceRows.filter((row) => ['Present', 'Late'].includes(row.status)).length;
  const submittedAssignments = assignmentRows.filter((row) => ['Submitted', 'Late'].includes(row.status)).length;
  const completedProjects = projectRows.filter((row) => row.status === 'Completed').length;
  const portfolioComplete = portfolioRows.filter((row) => row.status === 'Complete' || (row.githubUsername && row.projectRepository)).length;
  const activeStudents = students.filter((student) => student.status === 'Active').length;
  return {
    totals: {
      students: students.length,
      activeStudents,
      activeCourses: courses.filter((course) => course.status !== 'Inactive').length,
      attendancePercent: totalAttendance ? Math.round((attended / totalAttendance) * 100) : 0,
      assignmentCompletion: assignmentRows.length ? Math.round((submittedAssignments / assignmentRows.length) * 100) : 0,
      projectCompletion: projectRows.length ? Math.round((completedProjects / projectRows.length) * 100) : 0,
      devicesInUse: deviceRows.filter((device) => device.status === 'In Use').length,
      certificatesPending: certificateRows.filter((certificate) => certificate.status !== 'Issued').length,
      portfolioCompletion: students.length ? Math.round((portfolioComplete / students.length) * 100) : 0,
      dropoutRate: students.length ? Math.round((students.filter((student) => student.status === 'Dropout').length / students.length) * 100) : 0,
    },
    pendingAssignments: assignmentRows.filter((row) => !['Submitted', 'Late'].includes(row.status)).length,
    projectsInProgress: projectRows.filter((row) => ['Idea Stage', 'Planning', 'Development', 'Mentor Review', 'Correction Needed', 'Demo Ready'].includes(row.status)).length,
  };
}

router.get('/api/ai-lab/dashboard', authMiddleware, requireTenant, async (req, res) => {
  res.json(await loadAiLabDashboard());
});

router.get('/api/ai-lab/courses', authMiddleware, requireTenant, async (req, res) => {
  const courses = await all(`SELECT * FROM ai_lab_courses ORDER BY courseName ASC`);
  const modules = await all(`SELECT * FROM ai_lab_modules ORDER BY course_id ASC, moduleOrder ASC, id ASC`);
  res.json(courses.map((course) => ({ ...course, modules: modules.filter((module) => Number(module.course_id) === Number(course.id)) })));
});

router.post('/api/ai-lab/courses', authMiddleware, requireTenant, async (req, res) => {
  const { courseName, category, suitableFor, duration, exampleTopics, status = 'Active', modules = [] } = req.body;
  const validationError = requireFields(req.body, ['courseName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_courses (courseName, category, suitableFor, duration, exampleTopics, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [courseName, category, suitableFor, duration, exampleTopics, status, now, now]
  );
  for (const [index, module] of modules.entries()) {
    if (!module.moduleName && !module.topics) continue;
    await run(
      `INSERT INTO ai_lab_modules (course_id, moduleOrder, moduleName, topics, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [result.lastID, module.moduleOrder || index + 1, module.moduleName, module.topics, module.status || 'Pending', now, now]
    );
  }
  const row = await get(`SELECT * FROM ai_lab_courses WHERE id = ?`, [result.lastID]);
  res.json(row);
});

router.put('/api/ai-lab/courses/:id', authMiddleware, requireTenant, async (req, res) => {
  const { courseName, category, suitableFor, duration, exampleTopics, status = 'Active', modules = [] } = req.body;
  const existing = await get(`SELECT * FROM ai_lab_courses WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'AI Lab course not found' });
  const now = new Date().toISOString();
  await run(
    `UPDATE ai_lab_courses SET courseName = ?, category = ?, suitableFor = ?, duration = ?, exampleTopics = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [courseName, category, suitableFor, duration, exampleTopics, status, now, req.params.id]
  );
  await run(`DELETE FROM ai_lab_modules WHERE course_id = ?`, [req.params.id]);
  for (const [index, module] of modules.entries()) {
    if (!module.moduleName && !module.topics) continue;
    await run(
      `INSERT INTO ai_lab_modules (course_id, moduleOrder, moduleName, topics, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, module.moduleOrder || index + 1, module.moduleName, module.topics, module.status || 'Pending', now, now]
    );
  }
  res.json(await get(`SELECT * FROM ai_lab_courses WHERE id = ?`, [req.params.id]));
});

router.delete('/api/ai-lab/courses/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_modules WHERE course_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_courses WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/students', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_students.*, students.name AS linkedStudentName
     FROM ai_lab_students
     LEFT JOIN students ON students.id = ai_lab_students.student_id
     ORDER BY ai_lab_students.id DESC`
  );
  res.json(rows.map(normalizeAiLabStudent));
});

router.post('/api/ai-lab/students', authMiddleware, requireTenant, async (req, res) => {
  const { student_id, studentName, grade, school, parentName, mobileNumber, course_id, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired = false, previousCodingExperience, skillLevel = 0, skillAssessment, status = 'Active' } = req.body;
  const validationError = requireFields({ studentName, courseName }, ['studentName', 'courseName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_students (student_id, studentName, grade, school, parentName, mobileNumber, course_id, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired, previousCodingExperience, skillLevel, skillAssessment, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id || null, studentName, grade, school, parentName, mobileNumber, course_id || null, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired ? 1 : 0, previousCodingExperience, Number(skillLevel || 0), skillAssessment, status, now, now]
  );
  res.json(normalizeAiLabStudent(await get(`SELECT * FROM ai_lab_students WHERE id = ?`, [result.lastID])));
});

router.put('/api/ai-lab/students/:id', authMiddleware, requireTenant, async (req, res) => {
  const { student_id, studentName, grade, school, parentName, mobileNumber, course_id, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired = false, previousCodingExperience, skillLevel = 0, skillAssessment, status = 'Active' } = req.body;
  const existing = await get(`SELECT * FROM ai_lab_students WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'AI Lab student not found' });
  await run(
    `UPDATE ai_lab_students SET student_id = ?, studentName = ?, grade = ?, school = ?, parentName = ?, mobileNumber = ?, course_id = ?, courseName = ?, batch = ?, joiningDate = ?, courseDuration = ?, feeType = ?, deviceRequired = ?, previousCodingExperience = ?, skillLevel = ?, skillAssessment = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [student_id || null, studentName, grade, school, parentName, mobileNumber, course_id || null, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired ? 1 : 0, previousCodingExperience, Number(skillLevel || 0), skillAssessment, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeAiLabStudent(await get(`SELECT * FROM ai_lab_students WHERE id = ?`, [req.params.id])));
});

router.delete('/api/ai-lab/students/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_attendance WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_device_allocations WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_projects WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_assignments WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_mentor_feedback WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_portfolios WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_certificates WHERE ai_lab_student_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_students WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/attendance', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_attendance.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_attendance
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_attendance.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_attendance.course_id
     ORDER BY ai_lab_attendance.date DESC, ai_lab_attendance.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row, ['assignmentGiven'])));
});

router.post('/api/ai-lab/attendance', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, course_id, date, sessionType = 'Practical', mentor_id, mentorName, status = 'Present', deviceUsed, topicPracticed, assignmentGiven = false, parentAlert = 'Not Sent', remarks } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id', 'date', 'status']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO ai_lab_attendance (ai_lab_student_id, course_id, date, sessionType, mentor_id, mentorName, status, deviceUsed, topicPracticed, assignmentGiven, parentAlert, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, course_id || null, date, sessionType, mentor_id || null, mentorName, status, deviceUsed, topicPracticed, assignmentGiven ? 1 : 0, parentAlert, remarks, new Date().toISOString()]
  );
  res.json(normalizeAiLabBooleanRow(await get(`SELECT * FROM ai_lab_attendance WHERE id = ?`, [result.lastID]), ['assignmentGiven']));
});

router.delete('/api/ai-lab/attendance/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_attendance WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/devices', authMiddleware, requireTenant, async (req, res) => {
  const devices = await all(`SELECT * FROM ai_lab_devices ORDER BY deviceId ASC`);
  const allocations = await all(
    `SELECT ai_lab_device_allocations.*, ai_lab_devices.deviceId, ai_lab_devices.deviceType, ai_lab_students.studentName
     FROM ai_lab_device_allocations
     LEFT JOIN ai_lab_devices ON ai_lab_devices.id = ai_lab_device_allocations.device_id
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_device_allocations.ai_lab_student_id
     ORDER BY ai_lab_device_allocations.date DESC, ai_lab_device_allocations.id DESC`
  );
  res.json({ devices, allocations: allocations.map((row) => normalizeAiLabBooleanRow(row, ['damageReported', 'mentorVerified'])) });
});

router.post('/api/ai-lab/devices', authMiddleware, requireTenant, async (req, res) => {
  const { deviceId, deviceType, name, branch = 'Tembhurni', condition = 'Working', status = 'Available', purchaseDate, notes } = req.body;
  const validationError = requireFields(req.body, ['deviceId', 'deviceType']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_devices (deviceId, deviceType, name, branch, condition, status, purchaseDate, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [deviceId, deviceType, name, branch, condition, status, purchaseDate, notes, now, now]
  );
  res.json(await get(`SELECT * FROM ai_lab_devices WHERE id = ?`, [result.lastID]));
});

router.post('/api/ai-lab/device-allocations', authMiddleware, requireTenant, async (req, res) => {
  const { device_id, ai_lab_student_id, course_id, date, sessionTime, conditionBefore = 'Working', conditionAfter = 'Working', damageReported = false, mentorVerified = false, remarks } = req.body;
  const validationError = requireFields(req.body, ['device_id', 'ai_lab_student_id', 'date']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO ai_lab_device_allocations (device_id, ai_lab_student_id, course_id, date, sessionTime, conditionBefore, conditionAfter, damageReported, mentorVerified, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [device_id, ai_lab_student_id, course_id || null, date, sessionTime, conditionBefore, conditionAfter, damageReported ? 1 : 0, mentorVerified ? 1 : 0, remarks, new Date().toISOString()]
  );
  await run(`UPDATE ai_lab_devices SET status = ?, updatedAt = ? WHERE id = ?`, ['In Use', new Date().toISOString(), device_id]);
  res.json(normalizeAiLabBooleanRow(await get(`SELECT * FROM ai_lab_device_allocations WHERE id = ?`, [result.lastID]), ['damageReported', 'mentorVerified']));
});

router.delete('/api/ai-lab/devices/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_device_allocations WHERE device_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_devices WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/ai-lab/device-allocations/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_device_allocations WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/projects', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_projects.*, ai_lab_students.studentName, ai_lab_courses.courseName, teachers.name AS mentorName
     FROM ai_lab_projects
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_projects.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_projects.course_id
     LEFT JOIN teachers ON teachers.id = ai_lab_projects.mentor_id
     ORDER BY ai_lab_projects.updatedAt DESC, ai_lab_projects.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row)));
});

router.post('/api/ai-lab/projects', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, course_id, mentor_id, projectName, projectType = 'Mini Project', startDate, deadline, status = 'Idea Stage', githubLink, demoVideo, finalScore = 0, finalDemoStatus = 'Pending', remarks } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id', 'projectName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_projects (ai_lab_student_id, course_id, mentor_id, projectName, projectType, startDate, deadline, status, githubLink, demoVideo, finalScore, finalDemoStatus, remarks, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, course_id || null, mentor_id || null, projectName, projectType, startDate, deadline, status, githubLink, demoVideo, Number(finalScore || 0), finalDemoStatus, remarks, now, now]
  );
  res.json(normalizeAiLabBooleanRow(await get(`SELECT * FROM ai_lab_projects WHERE id = ?`, [result.lastID])));
});

router.delete('/api/ai-lab/projects/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_projects WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/assignments', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_assignments.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_assignments
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_assignments.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_assignments.course_id
     ORDER BY ai_lab_assignments.dueDate DESC, ai_lab_assignments.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row, ['fileUploaded'])));
});

router.post('/api/ai-lab/assignments', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, course_id, assignmentName, assignmentType = 'Code File', dueDate, submissionDate, fileUploaded = false, githubLink, mentorFeedback, score = 0, status = 'Assigned' } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id', 'assignmentName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_assignments (ai_lab_student_id, course_id, assignmentName, assignmentType, dueDate, submissionDate, fileUploaded, githubLink, mentorFeedback, score, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, course_id || null, assignmentName, assignmentType, dueDate, submissionDate, fileUploaded ? 1 : 0, githubLink, mentorFeedback, Number(score || 0), status, now, now]
  );
  res.json(normalizeAiLabBooleanRow(await get(`SELECT * FROM ai_lab_assignments WHERE id = ?`, [result.lastID]), ['fileUploaded']));
});

router.delete('/api/ai-lab/assignments/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_assignments WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/feedback', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_mentor_feedback.*, ai_lab_students.studentName, ai_lab_courses.courseName, teachers.name AS mentorName
     FROM ai_lab_mentor_feedback
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_mentor_feedback.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_mentor_feedback.course_id
     LEFT JOIN teachers ON teachers.id = ai_lab_mentor_feedback.mentor_id
     ORDER BY ai_lab_mentor_feedback.date DESC, ai_lab_mentor_feedback.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row)));
});

router.post('/api/ai-lab/feedback', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, course_id, mentor_id, date, logic = 0, coding = 0, debugging = 0, creativity = 0, presentation = 0, discipline = 0, independence = 0, projectWork = 0, remarks } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id', 'date']);
  if (validationError) return res.status(400).json({ error: validationError });
  const totalScore = [logic, coding, debugging, creativity, presentation, discipline, independence, projectWork].reduce((sum, value) => sum + Number(value || 0), 0);
  const result = await run(
    `INSERT INTO ai_lab_mentor_feedback (ai_lab_student_id, course_id, mentor_id, date, logic, coding, debugging, creativity, presentation, discipline, independence, projectWork, totalScore, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, course_id || null, mentor_id || null, date, Number(logic), Number(coding), Number(debugging), Number(creativity), Number(presentation), Number(discipline), Number(independence), Number(projectWork), totalScore, remarks, new Date().toISOString()]
  );
  res.json(normalizeAiLabBooleanRow(await get(`SELECT * FROM ai_lab_mentor_feedback WHERE id = ?`, [result.lastID])));
});

router.delete('/api/ai-lab/feedback/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_mentor_feedback WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/portfolios', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_portfolios.*, ai_lab_students.studentName
     FROM ai_lab_portfolios
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_portfolios.ai_lab_student_id
     ORDER BY ai_lab_portfolios.updatedAt DESC, ai_lab_portfolios.id DESC`
  );
  res.json(rows);
});

router.post('/api/ai-lab/portfolios', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, githubUsername, projectRepository, demoVideo, portfolioPage, certificateLink, linkedinProfile, status = 'Pending' } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_portfolios (ai_lab_student_id, githubUsername, projectRepository, demoVideo, portfolioPage, certificateLink, linkedinProfile, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, githubUsername, projectRepository, demoVideo, portfolioPage, certificateLink, linkedinProfile, status, now, now]
  );
  res.json(await get(`SELECT * FROM ai_lab_portfolios WHERE id = ?`, [result.lastID]));
});

router.delete('/api/ai-lab/portfolios/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_portfolios WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/ai-lab/certificates', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_certificates.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_certificates
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_certificates.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_certificates.course_id
     ORDER BY ai_lab_certificates.issueDate DESC, ai_lab_certificates.id DESC`
  );
  res.json(rows);
});

router.post('/api/ai-lab/certificates', authMiddleware, requireTenant, async (req, res) => {
  const { ai_lab_student_id, course_id, projectName, issueDate, directorSignature = 'Yes', qrVerification = 'Yes', status = 'Pending' } = req.body;
  const validationError = requireFields(req.body, ['ai_lab_student_id', 'course_id']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO ai_lab_certificates (ai_lab_student_id, course_id, certificateId, projectName, issueDate, directorSignature, qrVerification, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ai_lab_student_id, course_id, `PENDING-${Date.now()}`, projectName, issueDate, directorSignature, qrVerification, status, now, now]
  );
  await run(`UPDATE ai_lab_certificates SET certificateId = ? WHERE id = ?`, [makeAiLabCertificateId(result.lastID), result.lastID]);
  res.json(await get(`SELECT * FROM ai_lab_certificates WHERE id = ?`, [result.lastID]));
});

router.delete('/api/ai-lab/certificates/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM ai_lab_certificates WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

function normalizeAcademic(row, booleanFields = [], numberFields = []) {
  if (!row) return row;
  const normalized = { ...row };
  booleanFields.forEach((field) => {
    normalized[field] = Boolean(Number(normalized[field] || 0));
  });
  numberFields.forEach((field) => {
    normalized[field] = Number(normalized[field] || 0);
  });
  return normalized;
}

async function academicDashboard() {
  const syllabus = await all(`SELECT * FROM academic_syllabus`);
  const lecturePlans = await all(`SELECT * FROM lecture_plans`);
  const deliveries = await all(`SELECT * FROM class_delivery_logs`);
  const homework = await all(`SELECT * FROM homework_assignments`);
  const tests = await all(`SELECT * FROM test_calendars`);
  const results = await all(`SELECT * FROM student_test_results`);
  const doubts = await all(`SELECT * FROM doubt_sessions`);
  const revisions = await all(`SELECT * FROM revision_plans`);
  const remedials = await all(`SELECT * FROM remedial_actions`);
  const plannedTopics = syllabus.length;
  const completedTopics = syllabus.filter((row) => ['Completed', 'Revised', 'Tested'].includes(row.status)).length;
  const deliveredLectures = deliveries.filter((row) => Number(row.lectureCompleted || 0)).length;
  const submitted = homework.reduce((sum, row) => sum + Number(row.submittedCount || 0), 0);
  const assigned = homework.reduce((sum, row) => sum + Number(row.totalCount || 0), 0);
  const totalMarks = results.reduce((sum, row) => sum + Number(row.totalMarks || 0), 0);
  const scoredMarks = results.reduce((sum, row) => sum + Number(row.marksObtained || 0), 0);
  const weakStudents = results.filter((row) => Number(row.totalMarks || 0) && Number(row.marksObtained || 0) / Number(row.totalMarks || 0) < 0.5).length;
  const grouped = syllabus.reduce((acc, row) => {
    const key = row.subject || 'Unassigned';
    if (!acc[key]) acc[key] = { subject: key, plannedTopics: 0, completed: 0, pending: 0 };
    acc[key].plannedTopics += 1;
    if (['Completed', 'Revised', 'Tested'].includes(row.status)) acc[key].completed += 1;
    if (!['Completed', 'Revised', 'Tested'].includes(row.status)) acc[key].pending += 1;
    return acc;
  }, {});
  const syllabusBySubject = Object.values(grouped).map((row) => ({
    ...row,
    completionPercent: row.plannedTopics ? Math.round((row.completed / row.plannedTopics) * 100) : 0,
  }));
  return {
    totals: {
      syllabusCompletion: plannedTopics ? Math.round((completedTopics / plannedTopics) * 100) : 0,
      lectureCompletion: lecturePlans.length ? Math.round((deliveredLectures / lecturePlans.length) * 100) : 0,
      homeworkSubmission: assigned ? Math.round((submitted / assigned) * 100) : 0,
      testsScheduled: tests.length,
      averageTestScore: totalMarks ? Math.round((scoredMarks / totalMarks) * 100) : 0,
      weakStudentCount: weakStudents,
      pendingLectures: lecturePlans.filter((row) => row.status !== 'Delivered').length,
      pendingHomework: homework.reduce((sum, row) => sum + Number(row.pendingStudents || 0), 0),
      doubtResolution: doubts.length ? Math.round((doubts.filter((row) => row.status === 'Completed').length / doubts.length) * 100) : 0,
      revisionCompletion: revisions.length ? Math.round((revisions.filter((row) => row.status === 'Completed').length / revisions.length) * 100) : 0,
      openRemedialActions: remedials.filter((row) => row.status !== 'Completed').length,
    },
    syllabusBySubject,
  };
}

router.get('/api/academic/dashboard', authMiddleware, requireTenant, async (req, res) => {
  res.json(await academicDashboard());
});

router.get('/api/academic/syllabus', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM academic_syllabus ORDER BY courseName ASC, subject ASC, chapter ASC, topic ASC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['requiredTest'], ['estimatedLectures'])));
});

router.post('/api/academic/syllabus', authMiddleware, requireTenant, async (req, res) => {
  const { courseName, subject, chapter, topic, subTopic, difficulty = 'Basic', estimatedLectures = 1, requiredTest = false, status = 'Pending' } = req.body;
  const validationError = requireFields(req.body, ['courseName', 'subject', 'chapter', 'topic']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO academic_syllabus (courseName, subject, chapter, topic, subTopic, difficulty, estimatedLectures, requiredTest, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [courseName, subject, chapter, topic, subTopic, difficulty, Number(estimatedLectures || 0), requiredTest ? 1 : 0, status, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM academic_syllabus WHERE id = ?`, [result.lastID]), ['requiredTest'], ['estimatedLectures']));
});

router.put('/api/academic/syllabus/:id', authMiddleware, requireTenant, async (req, res) => {
  const { courseName, subject, chapter, topic, subTopic, difficulty = 'Basic', estimatedLectures = 1, requiredTest = false, status = 'Pending' } = req.body;
  const existing = await get(`SELECT * FROM academic_syllabus WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Syllabus topic not found' });
  await run(
    `UPDATE academic_syllabus SET courseName = ?, subject = ?, chapter = ?, topic = ?, subTopic = ?, difficulty = ?, estimatedLectures = ?, requiredTest = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [courseName, subject, chapter, topic, subTopic, difficulty, Number(estimatedLectures || 0), requiredTest ? 1 : 0, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM academic_syllabus WHERE id = ?`, [req.params.id]), ['requiredTest'], ['estimatedLectures']));
});

router.delete('/api/academic/syllabus/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM academic_syllabus WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/calendar', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(`SELECT * FROM academic_calendars ORDER BY startDate ASC, id DESC`));
});

router.post('/api/academic/calendar', authMiddleware, requireTenant, async (req, res) => {
  const { academicYear, calendarType, title, courseName, startDate, endDate, targetDate, notes, status = 'Planned' } = req.body;
  const validationError = requireFields(req.body, ['academicYear', 'calendarType', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO academic_calendars (academicYear, calendarType, title, courseName, startDate, endDate, targetDate, notes, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [academicYear, calendarType, title, courseName, startDate, endDate, targetDate, notes, status, now, now]
  );
  res.json(await get(`SELECT * FROM academic_calendars WHERE id = ?`, [result.lastID]));
});

router.delete('/api/academic/calendar/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM academic_calendars WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/timetable', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(`SELECT * FROM batch_timetables ORDER BY batchName ASC, dayOfWeek ASC, timeSlot ASC`));
});

router.post('/api/academic/timetable', authMiddleware, requireTenant, async (req, res) => {
  const { batchName, courseName, subject, teacher_id, teacherName, dayOfWeek, timeSlot, room, lectureType = 'Regular', status = 'Scheduled' } = req.body;
  const validationError = requireFields(req.body, ['batchName', 'subject', 'dayOfWeek', 'timeSlot']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO batch_timetables (batchName, courseName, subject, teacher_id, teacherName, dayOfWeek, timeSlot, room, lectureType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchName, courseName, subject, teacher_id || null, teacherName, dayOfWeek, timeSlot, room, lectureType, status, now, now]
  );
  res.json(await get(`SELECT * FROM batch_timetables WHERE id = ?`, [result.lastID]));
});

router.delete('/api/academic/timetable/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM batch_timetables WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/lecture-plans', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(`SELECT * FROM lecture_plans ORDER BY date DESC, batchName ASC, subject ASC`));
});

router.post('/api/academic/lecture-plans', authMiddleware, requireTenant, async (req, res) => {
  const { date, batchName, courseName, subject, chapter, topic, subTopic, teacher_id, teacherName, lectureType = 'Regular', homeworkPlanned, testLinked, teachingMaterial, status = 'Planned' } = req.body;
  const validationError = requireFields(req.body, ['date', 'batchName', 'subject', 'topic']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO lecture_plans (date, batchName, courseName, subject, chapter, topic, subTopic, teacher_id, teacherName, lectureType, homeworkPlanned, testLinked, teachingMaterial, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, batchName, courseName, subject, chapter, topic, subTopic, teacher_id || null, teacherName, lectureType, homeworkPlanned, testLinked, teachingMaterial, status, now, now]
  );
  res.json(await get(`SELECT * FROM lecture_plans WHERE id = ?`, [result.lastID]));
});

router.delete('/api/academic/lecture-plans/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM class_delivery_logs WHERE lecture_plan_id = ?`, [req.params.id]);
  await run(`DELETE FROM lecture_plans WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/delivery-logs', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM class_delivery_logs ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['lectureCompleted', 'homeworkGiven', 'notesProvided'])));
});

router.post('/api/academic/delivery-logs', authMiddleware, requireTenant, async (req, res) => {
  const { lecture_plan_id, date, batchName, subject, teacher_id, teacherName, plannedTopic, actualTopic, lectureCompleted = true, classAttendance, homeworkGiven = false, doubtsSolved, notesProvided = false, teacherRemark, academicHeadRemark, status = 'Delivered' } = req.body;
  const validationError = requireFields(req.body, ['date', 'batchName', 'subject', 'actualTopic']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO class_delivery_logs (lecture_plan_id, date, batchName, subject, teacher_id, teacherName, plannedTopic, actualTopic, lectureCompleted, classAttendance, homeworkGiven, doubtsSolved, notesProvided, teacherRemark, academicHeadRemark, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [lecture_plan_id || null, date, batchName, subject, teacher_id || null, teacherName, plannedTopic, actualTopic, lectureCompleted ? 1 : 0, classAttendance, homeworkGiven ? 1 : 0, doubtsSolved, notesProvided ? 1 : 0, teacherRemark, academicHeadRemark, status, new Date().toISOString()]
  );
  if (lecture_plan_id && lectureCompleted) await run(`UPDATE lecture_plans SET status = ?, updatedAt = ? WHERE id = ?`, ['Delivered', new Date().toISOString(), lecture_plan_id]);
  res.json(normalizeAcademic(await get(`SELECT * FROM class_delivery_logs WHERE id = ?`, [result.lastID]), ['lectureCompleted', 'homeworkGiven', 'notesProvided']));
});

router.delete('/api/academic/delivery-logs/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM class_delivery_logs WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/homework', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM homework_assignments ORDER BY dueDate DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, [], ['submittedCount', 'totalCount', 'pendingStudents'])));
});

router.post('/api/academic/homework', authMiddleware, requireTenant, async (req, res) => {
  const { date, batchName, courseName, subject, topic, homework, dueDate, submittedCount = 0, totalCount = 0, checkedBy, pendingStudents, parentAlert = 'Not Sent', status = 'Assigned' } = req.body;
  const validationError = requireFields(req.body, ['date', 'batchName', 'subject', 'homework']);
  if (validationError) return res.status(400).json({ error: validationError });
  const pending = pendingStudents === undefined ? Math.max(0, Number(totalCount || 0) - Number(submittedCount || 0)) : Number(pendingStudents || 0);
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO homework_assignments (date, batchName, courseName, subject, topic, homework, dueDate, submittedCount, totalCount, checkedBy, pendingStudents, parentAlert, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, batchName, courseName, subject, topic, homework, dueDate, Number(submittedCount || 0), Number(totalCount || 0), checkedBy, pending, parentAlert, status, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM homework_assignments WHERE id = ?`, [result.lastID]), [], ['submittedCount', 'totalCount', 'pendingStudents']));
});

router.delete('/api/academic/homework/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM homework_assignments WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/tests', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM test_calendars ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['analysisRequired'], ['totalMarks'])));
});

router.post('/api/academic/tests', authMiddleware, requireTenant, async (req, res) => {
  const { testName, date, courseName, batchName, subjects, syllabusCovered, totalMarks = 0, duration, resultDate, analysisRequired = true, status = 'Scheduled' } = req.body;
  const validationError = requireFields(req.body, ['testName', 'date', 'batchName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO test_calendars (testName, date, courseName, batchName, subjects, syllabusCovered, totalMarks, duration, resultDate, analysisRequired, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [testName, date, courseName, batchName, subjects, syllabusCovered, Number(totalMarks || 0), duration, resultDate, analysisRequired ? 1 : 0, status, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM test_calendars WHERE id = ?`, [result.lastID]), ['analysisRequired'], ['totalMarks']));
});

router.delete('/api/academic/tests/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM student_test_results WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM test_calendars WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/test-results', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT student_test_results.*, test_calendars.testName
     FROM student_test_results
     LEFT JOIN test_calendars ON test_calendars.id = student_test_results.test_id
     ORDER BY student_test_results.updatedAt DESC, student_test_results.id DESC`
  );
  res.json(rows.map((row) => normalizeAcademic(row, [], ['marksObtained', 'totalMarks', 'testRank', 'accuracy'])));
});

router.post('/api/academic/test-results', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, student_id, studentName, batchName, subject, marksObtained = 0, totalMarks = 0, testRank, accuracy, weakChapter, actionNeeded } = req.body;
  const validationError = requireFields(req.body, ['studentName', 'subject']);
  if (validationError) return res.status(400).json({ error: validationError });
  const computedAccuracy = accuracy === undefined && Number(totalMarks || 0) ? Math.round((Number(marksObtained || 0) / Number(totalMarks || 0)) * 100) : Number(accuracy || 0);
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO student_test_results (test_id, student_id, studentName, batchName, subject, marksObtained, totalMarks, testRank, accuracy, weakChapter, actionNeeded, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id || null, student_id || null, studentName, batchName, subject, Number(marksObtained || 0), Number(totalMarks || 0), testRank || null, computedAccuracy, weakChapter, actionNeeded, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM student_test_results WHERE id = ?`, [result.lastID]), [], ['marksObtained', 'totalMarks', 'testRank', 'accuracy']));
});

router.delete('/api/academic/test-results/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM student_test_results WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/doubt-sessions', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM doubt_sessions ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['improvementChecked'], ['studentsAssigned'])));
});

router.post('/api/academic/doubt-sessions', authMiddleware, requireTenant, async (req, res) => {
  const { date, batchName, subject, topic, teacher_id, teacherName, studentsAssigned = 0, reason, sessionType = 'Weekly Doubt', status = 'Scheduled', improvementChecked = false } = req.body;
  const validationError = requireFields(req.body, ['date', 'batchName', 'subject', 'topic']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO doubt_sessions (date, batchName, subject, topic, teacher_id, teacherName, studentsAssigned, reason, sessionType, status, improvementChecked, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, batchName, subject, topic, teacher_id || null, teacherName, Number(studentsAssigned || 0), reason, sessionType, status, improvementChecked ? 1 : 0, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM doubt_sessions WHERE id = ?`, [result.lastID]), ['improvementChecked'], ['studentsAssigned']));
});

router.delete('/api/academic/doubt-sessions/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM doubt_sessions WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/revision-plans', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM revision_plans ORDER BY revisionDate DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['testAfterRevision'])));
});

router.post('/api/academic/revision-plans', authMiddleware, requireTenant, async (req, res) => {
  const { revisionDate, batchName, subject, chapter, teacher_id, teacherName, revisionType = 'Chapter Revision', material, testAfterRevision = false, status = 'Planned' } = req.body;
  const validationError = requireFields(req.body, ['revisionDate', 'batchName', 'subject', 'chapter']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO revision_plans (revisionDate, batchName, subject, chapter, teacher_id, teacherName, revisionType, material, testAfterRevision, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [revisionDate, batchName, subject, chapter, teacher_id || null, teacherName, revisionType, material, testAfterRevision ? 1 : 0, status, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM revision_plans WHERE id = ?`, [result.lastID]), ['testAfterRevision']));
});

router.delete('/api/academic/revision-plans/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM revision_plans WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/academic/remedial-actions', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM remedial_actions ORDER BY deadline ASC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['followUpTest'])));
});

router.post('/api/academic/remedial-actions', authMiddleware, requireTenant, async (req, res) => {
  const { targetType = 'Student', targetName, student_id, batchName, issue, reason, action, assignedTeacher, deadline, followUpTest = false, status = 'Open' } = req.body;
  const validationError = requireFields(req.body, ['targetName', 'issue', 'action']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO remedial_actions (targetType, targetName, student_id, batchName, issue, reason, action, assignedTeacher, deadline, followUpTest, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [targetType, targetName, student_id || null, batchName, issue, reason, action, assignedTeacher, deadline, followUpTest ? 1 : 0, status, now, now]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM remedial_actions WHERE id = ?`, [result.lastID]), ['followUpTest']));
});

router.delete('/api/academic/remedial-actions/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM remedial_actions WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

function makePerformanceTestCode(id) {
  return `TEST-${new Date().getFullYear()}-${String(id).padStart(3, '0')}`;
}

function normalizePerformance(row, booleanFields = [], numberFields = []) {
  if (!row) return row;
  const normalized = { ...row };
  booleanFields.forEach((field) => {
    normalized[field] = Boolean(Number(normalized[field] || 0));
  });
  numberFields.forEach((field) => {
    normalized[field] = Number(normalized[field] || 0);
  });
  return normalized;
}

async function recalculatePerformanceRanks(testId) {
  const rows = await all(`SELECT * FROM performance_results WHERE test_id = ? ORDER BY marksObtained DESC, accuracy DESC, id ASC`, [testId]);
  for (const [index, row] of rows.entries()) {
    const overallRank = index + 1;
    const batchRank = rows.filter((item) => item.batchName === row.batchName && (Number(item.marksObtained || 0) > Number(row.marksObtained || 0) || (Number(item.marksObtained || 0) === Number(row.marksObtained || 0) && Number(item.id) < Number(row.id)))).length + 1;
    const branchRank = rows.filter((item) => item.branch === row.branch && (Number(item.marksObtained || 0) > Number(row.marksObtained || 0) || (Number(item.marksObtained || 0) === Number(row.marksObtained || 0) && Number(item.id) < Number(row.id)))).length + 1;
    const courseRank = rows.filter((item) => item.courseName === row.courseName && (Number(item.marksObtained || 0) > Number(row.marksObtained || 0) || (Number(item.marksObtained || 0) === Number(row.marksObtained || 0) && Number(item.id) < Number(row.id)))).length + 1;
    await run(`UPDATE performance_results SET overallRank = ?, batchRank = ?, branchRank = ?, courseRank = ?, updatedAt = ? WHERE id = ?`, [overallRank, batchRank, branchRank, courseRank, new Date().toISOString(), row.id]);
  }
}

async function performanceDashboard() {
  const tests = await all(`SELECT * FROM performance_tests`);
  const results = await all(`SELECT * FROM performance_results`);
  const remedials = await all(`SELECT * FROM remedial_students`);
  const parentReports = await all(`SELECT * FROM parent_report_logs`);
  const omrRows = await all(`SELECT * FROM omr_uploads`);
  const present = results.filter((row) => row.status === 'Present');
  const totalMarks = present.reduce((sum, row) => sum + Number(row.totalMarks || 0), 0);
  const scored = present.reduce((sum, row) => sum + Number(row.marksObtained || 0), 0);
  const subjectTotals = {};
  present.forEach((row) => {
    ['physicsMarks', 'chemistryMarks', 'biologyMarks', 'mathsMarks'].forEach((field) => {
      const value = Number(row[field] || 0);
      if (!value) return;
      if (!subjectTotals[field]) subjectTotals[field] = { subject: field.replace('Marks', ''), amount: 0, count: 0 };
      subjectTotals[field].amount += value;
      subjectTotals[field].count += 1;
    });
  });
  return {
    totals: {
      testsConducted: tests.filter((row) => row.status !== 'Scheduled').length,
      testsScheduled: tests.length,
      averageScore: totalMarks ? Math.round((scored / totalMarks) * 100) : 0,
      testAttendance: results.length ? Math.round((present.length / results.length) * 100) : 0,
      weakStudentCount: present.filter((row) => Number(row.percentage || 0) < 40).length,
      topperCount: present.filter((row) => Number(row.percentage || 0) >= 85).length,
      remedialCompletion: remedials.length ? Math.round((remedials.filter((row) => row.status === 'Completed').length / remedials.length) * 100) : 0,
      parentReportSent: parentReports.length ? Math.round((parentReports.filter((row) => row.status === 'Sent').length / parentReports.length) * 100) : 0,
      omrProcessingAccuracy: omrRows.reduce((sum, row) => sum + Number(row.processedCount || 0), 0) ? Math.round((omrRows.reduce((sum, row) => sum + Number(row.processedCount || 0) - Number(row.errorCount || 0), 0) / omrRows.reduce((sum, row) => sum + Number(row.processedCount || 0), 0)) * 100) : 0,
    },
    topPerformers: present.sort((a, b) => Number(b.marksObtained || 0) - Number(a.marksObtained || 0)).slice(0, 5),
    subjectAverages: Object.values(subjectTotals).map((row) => ({ subject: row.subject, average: row.count ? Math.round(row.amount / row.count) : 0 })),
  };
}

router.get('/api/test-performance/dashboard', authMiddleware, requireTenant, async (req, res) => {
  res.json(await performanceDashboard());
});

router.get('/api/test-performance/tests', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM performance_tests ORDER BY testDate DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, ['negativeMarking'], ['totalQuestions', 'totalMarks'])));
});

router.post('/api/test-performance/tests', authMiddleware, requireTenant, async (req, res) => {
  const { testName, testType = 'Weekly Test', courseName, batchName, branch = 'Tembhurni', subject, chapters, testDate, duration, totalQuestions = 0, totalMarks = 0, negativeMarking = false, testMode = 'Offline', resultDate, createdBy, status = 'Scheduled' } = req.body;
  const validationError = requireFields(req.body, ['testName', 'courseName', 'batchName', 'testDate']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO performance_tests (testCode, testName, testType, courseName, batchName, branch, subject, chapters, testDate, duration, totalQuestions, totalMarks, negativeMarking, testMode, resultDate, createdBy, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`PENDING-${Date.now()}`, testName, testType, courseName, batchName, branch, subject, chapters, testDate, duration, Number(totalQuestions || 0), Number(totalMarks || 0), negativeMarking ? 1 : 0, testMode, resultDate, createdBy || req.user.username, status, now, now]
  );
  await run(`UPDATE performance_tests SET testCode = ? WHERE id = ?`, [makePerformanceTestCode(result.lastID), result.lastID]);
  res.json(normalizePerformance(await get(`SELECT * FROM performance_tests WHERE id = ?`, [result.lastID]), ['negativeMarking'], ['totalQuestions', 'totalMarks']));
});

router.delete('/api/test-performance/tests/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM performance_results WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM question_analysis WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM parent_report_logs WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM teacher_result_impact WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM remedial_students WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM omr_uploads WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM performance_tests WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/test-performance/results', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(
    `SELECT performance_results.*, performance_tests.testName
     FROM performance_results
     LEFT JOIN performance_tests ON performance_tests.id = performance_results.test_id
     ORDER BY performance_results.test_id DESC, performance_results.overallRank ASC, performance_results.id DESC`
  );
  res.json(rows.map((row) => normalizePerformance(row, ['parentReportSent'], ['physicsMarks', 'chemistryMarks', 'biologyMarks', 'mathsMarks', 'marksObtained', 'totalMarks', 'percentage', 'batchRank', 'branchRank', 'courseRank', 'overallRank', 'attemptedQuestions', 'correctAnswers', 'wrongAnswers', 'blankQuestions', 'accuracy'])));
});

router.post('/api/test-performance/results', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, student_id, studentName, rollNumber, courseName, batchName, branch = 'Tembhurni', status = 'Present', physicsMarks = 0, chemistryMarks = 0, biologyMarks = 0, mathsMarks = 0, marksObtained, totalMarks = 0, attemptedQuestions = 0, correctAnswers = 0, wrongAnswers = 0, blankQuestions = 0, strongSubject, weakSubject, weakChapter, suggestedAction, teacherRemark } = req.body;
  const validationError = requireFields(req.body, ['test_id', 'studentName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const computedMarks = marksObtained === undefined ? Number(physicsMarks || 0) + Number(chemistryMarks || 0) + Number(biologyMarks || 0) + Number(mathsMarks || 0) : Number(marksObtained || 0);
  const percentage = Number(totalMarks || 0) ? Math.round((computedMarks / Number(totalMarks || 0)) * 10000) / 100 : 0;
  const accuracy = Number(attemptedQuestions || 0) ? Math.round((Number(correctAnswers || 0) / Number(attemptedQuestions || 0)) * 100) : 0;
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO performance_results (test_id, student_id, studentName, rollNumber, courseName, batchName, branch, status, physicsMarks, chemistryMarks, biologyMarks, mathsMarks, marksObtained, totalMarks, percentage, attemptedQuestions, correctAnswers, wrongAnswers, blankQuestions, accuracy, strongSubject, weakSubject, weakChapter, suggestedAction, teacherRemark, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id, student_id || null, studentName, rollNumber, courseName, batchName, branch, status, Number(physicsMarks || 0), Number(chemistryMarks || 0), Number(biologyMarks || 0), Number(mathsMarks || 0), computedMarks, Number(totalMarks || 0), percentage, Number(attemptedQuestions || 0), Number(correctAnswers || 0), Number(wrongAnswers || 0), Number(blankQuestions || 0), accuracy, strongSubject, weakSubject, weakChapter, suggestedAction, teacherRemark, now, now]
  );
  await recalculatePerformanceRanks(test_id);
  if (status === 'Absent' || percentage < 40 || accuracy < 50) {
    await run(
      `INSERT INTO remedial_students (test_id, student_id, studentName, batchName, weakSubject, weakChapter, issue, assignedTeacher, remedialDate, status, followUpTest, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [test_id, student_id || null, studentName, batchName, weakSubject, weakChapter, status === 'Absent' ? 'Test absent' : percentage < 40 ? 'Score below 40%' : 'Low accuracy', '', '', 'Pending', 'Required', now, now]
    );
  }
  const row = await get(`SELECT * FROM performance_results WHERE id = ?`, [result.lastID]);
  res.json(normalizePerformance(row, ['parentReportSent'], ['marksObtained', 'totalMarks', 'percentage', 'accuracy']));
});

router.delete('/api/test-performance/results/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const row = await get(`SELECT * FROM performance_results WHERE id = ?`, [req.params.id]);
  await run(`DELETE FROM performance_results WHERE id = ?`, [req.params.id]);
  if (row?.test_id) await recalculatePerformanceRanks(row.test_id);
  res.json({ ok: true });
});

router.get('/api/test-performance/question-analysis', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM question_analysis ORDER BY test_id DESC, questionNumber ASC, id ASC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['questionNumber', 'marksAwarded'])));
});

router.post('/api/test-performance/question-analysis', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, student_id, questionNumber, subject, chapter, topic, correctOption, selectedOption, resultStatus = 'Correct', marksAwarded = 0 } = req.body;
  const validationError = requireFields(req.body, ['test_id', 'questionNumber', 'chapter']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO question_analysis (test_id, student_id, questionNumber, subject, chapter, topic, correctOption, selectedOption, resultStatus, marksAwarded, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id, student_id || null, Number(questionNumber || 0), subject, chapter, topic, correctOption, selectedOption, resultStatus, Number(marksAwarded || 0), new Date().toISOString()]
  );
  res.json(normalizePerformance(await get(`SELECT * FROM question_analysis WHERE id = ?`, [result.lastID]), [], ['questionNumber', 'marksAwarded']));
});

router.delete('/api/test-performance/question-analysis/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM question_analysis WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/test-performance/parent-reports', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM parent_report_logs ORDER BY sentAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['marksObtained', 'totalMarks', 'batchRank', 'attendancePercent', 'homeworkCompletion'])));
});

router.post('/api/test-performance/parent-reports', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, student_id, studentName, parentPhone, marksObtained = 0, totalMarks = 0, batchRank, strongSubject, weakSubject, attendancePercent = 0, homeworkCompletion = 0, teacherRemark, requiredAction, sentVia = 'WhatsApp', status = 'Draft' } = req.body;
  const validationError = requireFields(req.body, ['test_id', 'studentName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO parent_report_logs (test_id, student_id, studentName, parentPhone, marksObtained, totalMarks, batchRank, strongSubject, weakSubject, attendancePercent, homeworkCompletion, teacherRemark, requiredAction, sentVia, sentAt, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id, student_id || null, studentName, parentPhone, Number(marksObtained || 0), Number(totalMarks || 0), batchRank || null, strongSubject, weakSubject, Number(attendancePercent || 0), Number(homeworkCompletion || 0), teacherRemark, requiredAction, sentVia, new Date().toISOString(), status]
  );
  res.json(await get(`SELECT * FROM parent_report_logs WHERE id = ?`, [result.lastID]));
});

router.delete('/api/test-performance/parent-reports/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM parent_report_logs WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/test-performance/teacher-impact', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_result_impact ORDER BY updatedAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['previousAverage', 'currentAverage', 'improvementPercent', 'weakChapterCount', 'homeworkCompletion', 'doubtResolution'])));
});

router.post('/api/test-performance/teacher-impact', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, teacher_id, teacherName, subject, batchName, previousAverage = 0, currentAverage = 0, weakChapterCount = 0, homeworkCompletion = 0, doubtResolution = 0, remarks } = req.body;
  const validationError = requireFields(req.body, ['teacherName', 'subject', 'batchName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const improvementPercent = Math.round((Number(currentAverage || 0) - Number(previousAverage || 0)) * 100) / 100;
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO teacher_result_impact (test_id, teacher_id, teacherName, subject, batchName, previousAverage, currentAverage, improvementPercent, weakChapterCount, homeworkCompletion, doubtResolution, remarks, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id || null, teacher_id || null, teacherName, subject, batchName, Number(previousAverage || 0), Number(currentAverage || 0), improvementPercent, Number(weakChapterCount || 0), Number(homeworkCompletion || 0), Number(doubtResolution || 0), remarks, now, now]
  );
  res.json(normalizePerformance(await get(`SELECT * FROM teacher_result_impact WHERE id = ?`, [result.lastID]), [], ['improvementPercent']));
});

router.delete('/api/test-performance/teacher-impact/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM teacher_result_impact WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/test-performance/remedial-students', authMiddleware, requireTenant, async (req, res) => {
  res.json(await all(`SELECT * FROM remedial_students ORDER BY remedialDate ASC, id DESC`));
});

router.post('/api/test-performance/remedial-students', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, student_id, studentName, batchName, weakSubject, weakChapter, issue, assignedTeacher, remedialDate, status = 'Pending', followUpTest = 'Required' } = req.body;
  const validationError = requireFields(req.body, ['studentName', 'issue']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO remedial_students (test_id, student_id, studentName, batchName, weakSubject, weakChapter, issue, assignedTeacher, remedialDate, status, followUpTest, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id || null, student_id || null, studentName, batchName, weakSubject, weakChapter, issue, assignedTeacher, remedialDate, status, followUpTest, now, now]
  );
  res.json(await get(`SELECT * FROM remedial_students WHERE id = ?`, [result.lastID]));
});

router.delete('/api/test-performance/remedial-students/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM remedial_students WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/test-performance/omr-uploads', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM omr_uploads ORDER BY uploadedAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['processedCount', 'errorCount'])));
});

router.post('/api/test-performance/omr-uploads', authMiddleware, requireTenant, async (req, res) => {
  const { test_id, omrFileName, uploadedBy, processedCount = 0, errorCount = 0, status = 'Uploaded', notes } = req.body;
  const validationError = requireFields(req.body, ['test_id', 'omrFileName']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(
    `INSERT INTO omr_uploads (test_id, omrFileName, uploadedBy, uploadedAt, processedCount, errorCount, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [test_id, omrFileName, uploadedBy || req.user.username, new Date().toISOString(), Number(processedCount || 0), Number(errorCount || 0), status, notes]
  );
  res.json(normalizePerformance(await get(`SELECT * FROM omr_uploads WHERE id = ?`, [result.lastID]), [], ['processedCount', 'errorCount']));
});

router.delete('/api/test-performance/omr-uploads/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  await run(`DELETE FROM omr_uploads WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Admissions CRUD
router.get('/api/admissions', authMiddleware, requireTenant, async (req, res) => {
  const rows = await all(`SELECT * FROM admissions WHERE tenant_id = ? ORDER BY id DESC`, [currentTenantId(req)]);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

router.post('/api/admissions', authMiddleware, requireTenant, async (req, res) => {
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(`INSERT INTO admissions (tenant_id, name, program, status, source, data) VALUES (?, ?, ?, ?, ?, ?)`, [currentTenantId(req), name, program, status, source, JSON.stringify(data || {})]);
  res.json({ id: result.lastID });
});

router.put('/api/admissions/:id', authMiddleware, requireTenant, async (req, res) => {
  const { id } = req.params;
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM admissions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Admission not found' });
  await run(`UPDATE admissions SET name = ?, program = ?, status = ?, source = ?, data = ? WHERE id = ? AND tenant_id = ?`, [name, program, status, source, JSON.stringify(data || {}), id, currentTenantId(req)]);
  res.json({ ok: true });
});

router.delete('/api/admissions/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM admissions WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  res.json({ ok: true });
});

// Ontology: Entities CRUD
router.get('/api/ontology/entities', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_entities ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

router.get('/api/ontology/entities/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const row = await get(`SELECT * FROM ontology_entities WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: 'Entity not found' });
  row.metadata = row.metadata ? JSON.parse(row.metadata) : null;
  const attrs = await all(`SELECT * FROM ontology_attributes WHERE entity_id = ? ORDER BY id`, [id]);
  row.attributes = attrs.map((a) => ({ ...a, options: a.options ? JSON.parse(a.options) : null }));
  res.json(row);
});

router.post('/api/ontology/entities', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { name, displayName, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_entities (name, displayName, description, metadata, createdAt) VALUES (?, ?, ?, ?, ?)`, [name, displayName, description, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

router.put('/api/ontology/entities/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { displayName, description, metadata } = req.body;
  const existing = await get(`SELECT * FROM ontology_entities WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Entity not found' });
  await run(`UPDATE ontology_entities SET displayName = ?, description = ?, metadata = ? WHERE id = ?`, [displayName, description, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

router.delete('/api/ontology/entities/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_attributes WHERE entity_id = ?`, [id]);
  await run(`DELETE FROM ontology_entities WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Ontology: Attributes CRUD
router.get('/api/ontology/entities/:id/attributes', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const rows = await all(`SELECT * FROM ontology_attributes WHERE entity_id = ? ORDER BY id`, [id]);
  res.json(rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

router.post('/api/ontology/entities/:id/attributes', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { name, label, type, required, options, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const entity = await get(`SELECT * FROM ontology_entities WHERE id = ?`, [id]);
  if (!entity) return res.status(404).json({ error: 'Entity not found' });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_attributes (entity_id, name, label, type, required, options, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, label, type, required ? 1 : 0, options ? JSON.stringify(options) : null, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

router.put('/api/ontology/attributes/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { label, type, required, options, metadata } = req.body;
  const existing = await get(`SELECT * FROM ontology_attributes WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Attribute not found' });
  await run(`UPDATE ontology_attributes SET label = ?, type = ?, required = ?, options = ?, metadata = ? WHERE id = ?`, [label, type, required ? 1 : 0, options ? JSON.stringify(options) : null, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

router.delete('/api/ontology/attributes/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_attributes WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Relations
router.get('/api/ontology/relations', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_relations ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

router.post('/api/ontology/relations', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { from_entity_id, to_entity_id, name, cardinality, metadata } = req.body;
  const validationError = requireFields(req.body, ['from_entity_id', 'to_entity_id', 'name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_relations (from_entity_id, to_entity_id, name, cardinality, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [from_entity_id, to_entity_id, name, cardinality, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

router.put('/api/ontology/relations/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { name, cardinality, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM ontology_relations WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Relation not found' });
  await run(`UPDATE ontology_relations SET name = ?, cardinality = ?, metadata = ? WHERE id = ?`, [name, cardinality, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

router.delete('/api/ontology/relations/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_relations WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Classifications
router.get('/api/ontology/classifications', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_classifications ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

router.post('/api/ontology/classifications', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { name, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_classifications (name, description, metadata, createdAt) VALUES (?, ?, ?, ?)`, [name, description, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

router.put('/api/ontology/classifications/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const { name, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM ontology_classifications WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Classification not found' });
  await run(`UPDATE ontology_classifications SET name = ?, description = ?, metadata = ? WHERE id = ?`, [name, description, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

router.delete('/api/ontology/classifications/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_classifications WHERE id = ?`, [id]);
  res.json({ ok: true });
});


module.exports = router;


