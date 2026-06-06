const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

const { run, all, get, migrate } = require('./db');

const SECRET = process.env.JWT_SECRET;
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';

if (!SECRET) {
  console.error('JWT_SECRET is required. Set it before starting the server.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/api', (req, res) => {
  res.json({
    ok: true,
    service: 'Teacher Performance Scorecard API',
    endpoints: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/config',
      '/api/users',
      '/api/teachers',
      '/api/teacher-work-controls',
      '/api/teacher-management-actions',
      '/api/teacher-reviews',
      '/api/students',
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

app.get('/api/config', (req, res) => {
  res.json({
    allowRegistration: ALLOW_REGISTRATION,
  });
});

async function ensure() {
  await migrate();
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Insufficient role' });
    next();
  };
}

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' });
    next();
  };
}

const userRoles = ['admin', 'user', 'director', 'owner', 'accountant', 'counsellor', 'teacher'];
const adminRoles = ['admin', 'director', 'owner'];
const feeRoles = ['admin', 'director', 'owner', 'accountant', 'counsellor'];
const paymentRoles = ['admin', 'director', 'owner', 'accountant'];
const expenseRoles = ['admin', 'director', 'owner', 'accountant'];

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
  return { id: user.id, username: user.username, role: user.role };
}

// Auth: Register
app.post('/api/auth/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) return res.status(403).json({ error: 'Registration is disabled' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const existing = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (existing) return res.status(400).json({ error: 'User already exists' });
  const hashed = await bcrypt.hash(password, 10);
  await run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, hashed, 'user']);
  res.json({ ok: true });
});

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
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

app.get('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const users = await all(`SELECT id, username, role FROM users ORDER BY username`);
  res.json(users);
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  if (!userRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (existing) return res.status(400).json({ error: 'User already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const result = await run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, hashed, role]);
  const user = await get(`SELECT id, username, role FROM users WHERE id = ?`, [result.lastID]);
  res.json(publicUser(user));
});

app.put('/api/users/:id/role', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!userRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await run(`UPDATE users SET role = ? WHERE id = ?`, [role, id]);
  const user = await get(`SELECT id, username, role FROM users WHERE id = ?`, [id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

// Teachers CRUD
app.get('/api/teachers', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM teachers ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

app.post('/api/teachers', authMiddleware, async (req, res) => {
  const { name, subject, month, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO teachers (name, subject, month, data, updatedAt) VALUES (?, ?, ?, ?, ?)`, [name, subject, month, JSON.stringify(data || {}), now]);
  res.json({ id: result.lastID });
});

app.put('/api/teachers/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, subject, month, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM teachers WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Teacher not found' });
  const now = new Date().toISOString();
  await run(`UPDATE teachers SET name = ?, subject = ?, month = ?, data = ?, updatedAt = ? WHERE id = ?`, [name, subject, month, JSON.stringify(data || {}), now, id]);
  res.json({ ok: true });
});

app.delete('/api/teachers/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM staff_attendance_records WHERE staff_id = ?`, [id]);
  await run(`DELETE FROM leave_requests WHERE staff_id = ?`, [id]);
  await run(`DELETE FROM teacher_work_controls WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teacher_management_actions WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teacher_reviews WHERE teacher_id = ?`, [id]);
  await run(`DELETE FROM teachers WHERE id = ?`, [id]);
  res.json({ ok: true });
});

app.get('/api/teacher-work-controls', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT teacher_work_controls.*, teachers.name AS teacherName, teachers.subject AS teacherSubject
     FROM teacher_work_controls
     INNER JOIN teachers ON teachers.id = teacher_work_controls.teacher_id
     ORDER BY teacher_work_controls.updatedAt DESC, teacher_work_controls.id DESC`
  );
  res.json(rows);
});

app.get('/api/teachers/:id/work-controls', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_work_controls WHERE teacher_id = ? ORDER BY updatedAt DESC, id DESC`, [req.params.id]);
  res.json(rows);
});

app.post('/api/teacher-work-controls', authMiddleware, async (req, res) => {
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

app.put('/api/teacher-work-controls/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/teacher-work-controls/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM teacher_work_controls WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/teacher-management-actions', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT teacher_management_actions.*, teachers.name AS teacherName, teachers.subject AS teacherSubject
     FROM teacher_management_actions
     INNER JOIN teachers ON teachers.id = teacher_management_actions.teacher_id
     ORDER BY teacher_management_actions.updatedAt DESC, teacher_management_actions.id DESC`
  );
  res.json(rows);
});

app.get('/api/teachers/:id/management-actions', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_management_actions WHERE teacher_id = ? ORDER BY updatedAt DESC, id DESC`, [req.params.id]);
  res.json(rows);
});

app.post('/api/teacher-management-actions', authMiddleware, async (req, res) => {
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

app.put('/api/teacher-management-actions/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/teacher-management-actions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/teacher-reviews', authMiddleware, async (req, res) => {
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

app.get('/api/teachers/:id/reviews', authMiddleware, async (req, res) => {
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

app.post('/api/teacher-reviews', authMiddleware, async (req, res) => {
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

app.put('/api/teacher-reviews/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/teacher-reviews/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM teacher_reviews WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Students CRUD
app.get('/api/students', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM students ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

app.post('/api/students', authMiddleware, async (req, res) => {
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(`INSERT INTO students (name, grade, batch, attendance, data) VALUES (?, ?, ?, ?, ?)`, [name, grade, batch, attendance, JSON.stringify(data || {})]);
  res.json({ id: result.lastID });
});

app.put('/api/students/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, grade, batch, attendance, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  await run(`UPDATE students SET name = ?, grade = ?, batch = ?, attendance = ?, data = ? WHERE id = ?`, [name, grade, batch, attendance, JSON.stringify(data || {}), id]);
  res.json({ ok: true });
});

app.delete('/api/students/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
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
  await run(`DELETE FROM student_history WHERE student_id = ?`, [id]);
  await run(`DELETE FROM students WHERE id = ?`, [id]);
  res.json({ ok: true });
});

app.get('/api/students/:id/history', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const rows = await all(`SELECT * FROM student_history WHERE student_id = ? ORDER BY eventDate DESC, id DESC`, [id]);
  res.json(rows);
});

app.post('/api/students/:id/history', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { type, title, detail, eventDate } = req.body;
  const validationError = requireFields(req.body, ['type', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });
  const student = await get(`SELECT * FROM students WHERE id = ?`, [id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO student_history (student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, title, detail, eventDate, now]
  );
  const row = await get(`SELECT * FROM student_history WHERE id = ?`, [result.lastID]);
  res.json(row);
});

app.put('/api/student-history/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/student-history/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM student_history WHERE id = ?`, [id]);
  res.json({ ok: true });
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

async function writeFeeAudit(entityType, entityId, action, oldValue, newValue, changedBy) {
  await run(
    `INSERT INTO fee_audit_logs (entityType, entityId, action, oldValue, newValue, changedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, changedBy || null, new Date().toISOString()]
  );
}

async function loadFeePlansWithPaid() {
  const rows = await all(
    `SELECT
      fee_plans.*,
      students.name AS studentName,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
    FROM fee_plans
    INNER JOIN students ON students.id = fee_plans.student_id
    LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
    GROUP BY fee_plans.id, students.name
    ORDER BY fee_plans.updatedAt DESC, fee_plans.id DESC`
  );
  return attachFeeDetailsMany(rows);
}

app.get('/api/students/:id/360', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT * FROM students WHERE id = ?`, [id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const feePlanRows = await all(
    `SELECT fee_plans.*, students.name AS studentName, COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
     FROM fee_plans
     INNER JOIN students ON students.id = fee_plans.student_id
     LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     WHERE fee_plans.student_id = ?
     GROUP BY fee_plans.id, students.name
     ORDER BY fee_plans.updatedAt DESC`,
    [id]
  );
  const feePlans = await attachFeeDetailsMany(feePlanRows);
  const payments = await all(
    `SELECT fee_payments.*, fee_plans.courseProgram AS courseProgram, fee_plans.feeCategory AS feeCategory
     FROM fee_payments
     LEFT JOIN fee_plans ON fee_plans.id = fee_payments.fee_plan_id
     WHERE fee_payments.student_id = ? AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
     ORDER BY fee_payments.paymentDate DESC, fee_payments.id DESC`,
    [id]
  );
  const attendance = await all(
    `SELECT attendance_records.*, attendance_sessions.date, attendance_sessions.batch, attendance_sessions.course, attendance_sessions.subject, attendance_sessions.teacherName, attendance_sessions.startTime
     FROM attendance_records
     INNER JOIN attendance_sessions ON attendance_sessions.id = attendance_records.session_id
     WHERE attendance_records.student_id = ?
     ORDER BY attendance_sessions.date DESC, attendance_sessions.startTime DESC`,
    [id]
  );
  const parentAlerts = await all(`SELECT * FROM parent_alert_logs WHERE student_id = ? ORDER BY sentAt DESC, id DESC LIMIT 50`, [id]);
  const parentCalls = await all(`SELECT * FROM parent_call_logs WHERE student_id = ? ORDER BY calledAt DESC, id DESC LIMIT 50`, [id]);
  const feeReminders = await all(`SELECT * FROM fee_reminders WHERE student_id = ? ORDER BY sentAt DESC, id DESC LIMIT 50`, [id]);
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
    fees: { plans: feePlans, payments, reminders: feeReminders, totals: feeTotals },
    attendance: { rows: attendance, totals: { total: attendance.length, attended, absent, late, attendancePercent } },
    academics: { academicResults, performanceResults, remedialActions, remedialStudents },
    communication: { parentAlerts, parentCalls, feeReminders, history },
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

async function createExpenseFromRecurringTemplate(template, month, username) {
  const normalized = normalizeRecurringExpense(template);
  if (!normalized || normalized.status !== 'Active') return { skipped: true, reason: 'inactive' };
  if (normalized.frequency !== 'Monthly') return { skipped: true, reason: 'unsupported frequency' };
  if (normalized.startMonth && month < normalized.startMonth) return { skipped: true, reason: 'before start month' };
  if (normalized.endMonth && month > normalized.endMonth) return { skipped: true, reason: 'after end month' };

  const marker = `[Recurring ${normalized.id} ${month}]`;
  const existing = await get(`SELECT * FROM expenses WHERE remarks LIKE ? LIMIT 1`, [`%${marker}%`]);
  if (existing) return { skipped: true, reason: 'already generated', expense: normalizeExpense(existing) };

  const now = new Date().toISOString();
  const date = expenseDateForMonth(month, normalized.dayOfMonth);
  const remarks = `${normalized.remarks || normalized.templateName || 'Recurring expense'} ${marker}`;
  const result = await run(
    `INSERT INTO expenses (expenseId, date, branch, category, subCategory, expenseType, amount, vendor_id, paidTo, vendorMobile, paymentMode, paidBy, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, approvalRequired, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
  return { skipped: false, expense: normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [result.lastID])) };
}

async function createPettyCashEntryForExpense(expense) {
  if (expense.paymentMode !== 'Cash' || expense.status !== 'Paid') return;
  const branch = expense.branch || 'Tembhurni';
  const latest = await get(`SELECT * FROM petty_cash_entries WHERE branch = ? ORDER BY date DESC, id DESC LIMIT 1`, [branch]);
  const openingCash = Number(latest?.closingCash || 0);
  const paidAmount = Number(expense.netPaid || expense.amount || 0);
  const closingCash = openingCash - paidAmount;
  await run(
    `INSERT INTO petty_cash_entries (date, branch, cashFlowType, amount, openingCash, closingCash, referenceType, referenceId, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [expense.paymentDate || expense.date, branch, 'Expense', paidAmount, openingCash, closingCash, 'Expense', expense.id, expense.remarks || expense.category, new Date().toISOString()]
  );
}

app.get('/api/vendors', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT vendors.*, COALESCE(SUM(CASE WHEN expenses.status = 'Paid' THEN expenses.amount ELSE 0 END), 0) AS totalPaid,
      COALESCE(SUM(CASE WHEN expenses.status IN ('Approved', 'Bill Pending') THEN expenses.amount ELSE 0 END), 0) AS pendingAmount,
      MAX(CASE WHEN expenses.status = 'Paid' THEN expenses.date ELSE NULL END) AS lastPaymentDate
     FROM vendors
     LEFT JOIN expenses ON expenses.vendor_id = vendors.id
     GROUP BY vendors.id
     ORDER BY vendors.vendorName ASC`
  );
  res.json(rows.map((row) => ({ ...row, totalPaid: Number(row.totalPaid || 0), pendingAmount: Number(row.pendingAmount || 0) })));
});

app.post('/api/vendors', authMiddleware, async (req, res) => {
  const { vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes } = req.body;
  const validationError = requireFields(req.body, ['vendorName', 'vendorType']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO vendors (vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, now, now]
  );
  res.json(await get(`SELECT * FROM vendors WHERE id = ?`, [result.lastID]));
});

app.put('/api/vendors/:id', authMiddleware, async (req, res) => {
  const { vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes } = req.body;
  await run(
    `UPDATE vendors SET vendorName = ?, vendorType = ?, mobileNumber = ?, address = ?, gstNumber = ?, bankDetails = ?, notes = ?, updatedAt = ? WHERE id = ?`,
    [vendorName, vendorType, mobileNumber, address, gstNumber, bankDetails, notes, new Date().toISOString(), req.params.id]
  );
  const row = await get(`SELECT * FROM vendors WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Vendor not found' });
  res.json(row);
});

app.delete('/api/vendors/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`UPDATE expenses SET vendor_id = NULL WHERE vendor_id = ?`, [req.params.id]);
  await run(`DELETE FROM vendors WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/expenses', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const rows = await all(
    `SELECT expenses.*, vendors.vendorName AS vendorName, vendors.vendorType AS vendorType
     FROM expenses
     LEFT JOIN vendors ON vendors.id = expenses.vendor_id
     ORDER BY expenses.date DESC, expenses.id DESC`
  );
  res.json(rows.map(normalizeExpense));
});

app.post('/api/expenses', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const { date, branch = 'Tembhurni', category, subCategory, expenseType = 'Variable', amount, vendor_id, paidTo, vendorMobile, paymentMode = 'Cash', paidBy, paymentDate, transactionId, deductionAmount = 0, bonusAmount = 0, netPaid = 0, requestedBy, approvedBy, billUploaded = false, gstBill = false, billUrl, remarks, status = 'Requested' } = req.body;
  const validationError = requireFields({ date, category, amount, paidTo }, ['date', 'category', 'amount', 'paidTo']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO expenses (expenseId, date, branch, category, subCategory, expenseType, amount, vendor_id, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, deductionAmount, bonusAmount, netPaid, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, approvalRequired, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`PENDING-${Date.now()}`, date, branch, category, subCategory, expenseType, Number(amount), vendor_id || null, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, Number(deductionAmount || 0), Number(bonusAmount || 0), Number(netPaid || 0), requestedBy || req.user.username, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, expenseApprovalRequired(amount), now, now]
  );
  await run(`UPDATE expenses SET expenseId = ? WHERE id = ?`, [makeExpenseNumber(result.lastID), result.lastID]);
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [result.lastID]));
  await createPettyCashEntryForExpense(row);
  res.json(row);
});

app.put('/api/expenses/:id', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const { date, branch = 'Tembhurni', category, subCategory, expenseType = 'Variable', amount, vendor_id, paidTo, vendorMobile, paymentMode = 'Cash', paidBy, paymentDate, transactionId, deductionAmount = 0, bonusAmount = 0, netPaid = 0, requestedBy, approvedBy, billUploaded = false, gstBill = false, billUrl, remarks, status = 'Requested' } = req.body;
  const existing = await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  await run(
    `UPDATE expenses SET date = ?, branch = ?, category = ?, subCategory = ?, expenseType = ?, amount = ?, vendor_id = ?, paidTo = ?, vendorMobile = ?, paymentMode = ?, paidBy = ?, paymentDate = ?, transactionId = ?, deductionAmount = ?, bonusAmount = ?, netPaid = ?, requestedBy = ?, approvedBy = ?, billUploaded = ?, gstBill = ?, billUrl = ?, remarks = ?, status = ?, approvalRequired = ?, updatedAt = ? WHERE id = ?`,
    [date, branch, category, subCategory, expenseType, Number(amount), vendor_id || null, paidTo, vendorMobile, paymentMode, paidBy, paymentDate, transactionId, Number(deductionAmount || 0), Number(bonusAmount || 0), Number(netPaid || 0), requestedBy, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, expenseApprovalRequired(amount), new Date().toISOString(), req.params.id]
  );
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id]));
  if (existing.status !== 'Paid') await createPettyCashEntryForExpense(row);
  res.json(row);
});

app.patch('/api/expenses/:id/approve', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  await run(`UPDATE expenses SET status = ?, approvedBy = ?, updatedAt = ? WHERE id = ?`, ['Approved', req.user.username, new Date().toISOString(), req.params.id]);
  res.json(normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id])));
});

app.patch('/api/expenses/:id/reject', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  await run(`UPDATE expenses SET status = ?, approvedBy = ?, updatedAt = ? WHERE id = ?`, ['Rejected', req.user.username, new Date().toISOString(), req.params.id]);
  res.json(normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id])));
});

app.patch('/api/expenses/:id/pay', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
  const existing = await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  const status = Number(existing.billUploaded || 0) ? 'Paid' : 'Bill Pending';
  const paymentDate = existing.paymentDate || new Date().toISOString().slice(0, 10);
  const netPaid = Number(existing.netPaid || existing.amount || 0);
  await run(`UPDATE expenses SET status = ?, paidBy = ?, paymentDate = ?, netPaid = ?, updatedAt = ? WHERE id = ?`, [status, req.user.username, paymentDate, netPaid, new Date().toISOString(), req.params.id]);
  const row = normalizeExpense(await get(`SELECT * FROM expenses WHERE id = ?`, [req.params.id]));
  await createPettyCashEntryForExpense({ ...row, status: 'Paid' });
  res.json(row);
});

app.delete('/api/expenses/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM petty_cash_entries WHERE referenceType = ? AND referenceId = ?`, ['Expense', req.params.id]);
  await run(`DELETE FROM expenses WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/recurring-expenses', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM recurring_expense_templates ORDER BY status ASC, category ASC, templateName ASC`);
  res.json(rows.map(normalizeRecurringExpense));
});

app.post('/api/recurring-expenses', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
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
    `INSERT INTO recurring_expense_templates (templateName, branch, category, subCategory, expenseType, amount, paidTo, vendorMobile, paymentMode, requestedBy, approvedBy, billUploaded, gstBill, billUrl, remarks, status, frequency, startMonth, endMonth, dayOfMonth, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [templateName, branch, category, subCategory, expenseType, Number(amount), paidTo, vendorMobile, paymentMode, requestedBy || req.user.username, approvedBy || req.user.username, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, frequency, startMonth, endMonth || null, Number(dayOfMonth || 1), now, now]
  );
  res.json(normalizeRecurringExpense(await get(`SELECT * FROM recurring_expense_templates WHERE id = ?`, [result.lastID])));
});

app.put('/api/recurring-expenses/:id', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const existing = await get(`SELECT * FROM recurring_expense_templates WHERE id = ?`, [req.params.id]);
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
    `UPDATE recurring_expense_templates SET templateName = ?, branch = ?, category = ?, subCategory = ?, expenseType = ?, amount = ?, paidTo = ?, vendorMobile = ?, paymentMode = ?, requestedBy = ?, approvedBy = ?, billUploaded = ?, gstBill = ?, billUrl = ?, remarks = ?, status = ?, frequency = ?, startMonth = ?, endMonth = ?, dayOfMonth = ?, updatedAt = ? WHERE id = ?`,
    [templateName, branch, category, subCategory, expenseType, Number(amount), paidTo, vendorMobile, paymentMode, requestedBy, approvedBy, billUploaded ? 1 : 0, gstBill ? 1 : 0, billUrl, remarks, status, frequency, startMonth, endMonth || null, Number(dayOfMonth || 1), new Date().toISOString(), req.params.id]
  );
  res.json(normalizeRecurringExpense(await get(`SELECT * FROM recurring_expense_templates WHERE id = ?`, [req.params.id])));
});

app.delete('/api/recurring-expenses/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM recurring_expense_templates WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/recurring-expenses/generate', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const templates = await all(`SELECT * FROM recurring_expense_templates WHERE status = ? ORDER BY id ASC`, ['Active']);
  const created = [];
  const skipped = [];
  for (const template of templates) {
    const result = await createExpenseFromRecurringTemplate(template, month, req.user.username);
    if (result.skipped) skipped.push({ templateId: template.id, templateName: template.templateName, reason: result.reason });
    else created.push(result.expense);
  }
  res.json({ month, created, skipped });
});

app.get('/api/petty-cash', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM petty_cash_entries ORDER BY date DESC, id DESC LIMIT 100`);
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount || 0), openingCash: Number(row.openingCash || 0), closingCash: Number(row.closingCash || 0) })));
});

app.post('/api/petty-cash', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const { date, branch = 'Tembhurni', cashFlowType = 'Cash Added', amount, remarks } = req.body;
  const validationError = requireFields(req.body, ['date', 'amount']);
  if (validationError) return res.status(400).json({ error: validationError });
  const latest = await get(`SELECT * FROM petty_cash_entries WHERE branch = ? ORDER BY date DESC, id DESC LIMIT 1`, [branch]);
  const openingCash = Number(latest?.closingCash || 0);
  const closingCash = openingCash + (cashFlowType === 'Cash Added' ? Number(amount) : -Number(amount));
  const result = await run(
    `INSERT INTO petty_cash_entries (date, branch, cashFlowType, amount, openingCash, closingCash, remarks, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, branch, cashFlowType, Number(amount), openingCash, closingCash, remarks, new Date().toISOString()]
  );
  res.json(await get(`SELECT * FROM petty_cash_entries WHERE id = ?`, [result.lastID]));
});

app.delete('/api/petty-cash/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM petty_cash_entries WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/expense-reports', authMiddleware, requireAnyRole(expenseRoles), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const expenses = (await all(`SELECT expenses.*, vendors.vendorName AS vendorName FROM expenses LEFT JOIN vendors ON vendors.id = expenses.vendor_id WHERE expenses.date LIKE ? ORDER BY expenses.date DESC`, [`${month}%`])).map(normalizeExpense);
  const paidExpenses = expenses.filter((expense) => expense.status === 'Paid' || expense.status === 'Bill Pending');
  const expenseValue = (expense) => Number(expense.netPaid || expense.amount || 0);
  const totalExpenses = paidExpenses.reduce((sum, expense) => sum + expenseValue(expense), 0);
  const fixedExpenses = paidExpenses.filter((expense) => expense.expenseType === 'Fixed').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const variableExpenses = paidExpenses.filter((expense) => expense.expenseType !== 'Fixed').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const refunds = paidExpenses.filter((expense) => expense.category === 'Refunds').reduce((sum, expense) => sum + expenseValue(expense), 0);
  const pendingLiabilities = expenses.filter((expense) => expense.status === 'Approved' || expense.status === 'Bill Pending').reduce((sum, expense) => sum + expense.amount, 0);
  const feeRows = await all(`SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE paymentDate LIKE ? AND COALESCE(status, 'Active') != 'Cancelled'`, [`${month}%`]);
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
  const admissionsCount = Number((await get(`SELECT COUNT(*) AS count FROM admissions WHERE status != ?`, ['Rejected']))?.count || 0);
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
app.get('/api/fees/summary', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
  const plans = await loadFeePlansWithPaid();
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
  const todayPayments = await all(`SELECT COALESCE(SUM(amount), 0) AS amount FROM fee_payments WHERE paymentDate = ? AND COALESCE(status, 'Active') != 'Cancelled'`, [today]);
  totals.todayCollection = Number(todayPayments[0]?.amount || 0);
  res.json({ totals, plans });
});

app.get('/api/fee-plans', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
  res.json(await loadFeePlansWithPaid());
});

function normalizeFeeStructure(row) {
  return {
    ...row,
    feeAmount: Number(row.feeAmount || 0),
  };
}

app.get('/api/fee-structures', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM fee_structures ORDER BY courseName ASC`);
  res.json(rows.map(normalizeFeeStructure));
});

app.post('/api/fee-structures', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
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

app.put('/api/fee-structures/:id', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
  const { courseName, feeAmount, billingCycle = 'per year', paymentType = 'Installment', classRange, duration, notes, status = 'Active' } = req.body;
  const existing = await get(`SELECT * FROM fee_structures WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Fee structure not found' });
  await run(
    `UPDATE fee_structures SET courseName = ?, feeAmount = ?, billingCycle = ?, paymentType = ?, classRange = ?, duration = ?, notes = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [courseName, Number(feeAmount || 0), billingCycle, paymentType, classRange, duration, notes, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeFeeStructure(await get(`SELECT * FROM fee_structures WHERE id = ?`, [req.params.id])));
});

app.delete('/api/fee-structures/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM fee_structures WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/students/:id/fee-plans', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
  const { id } = req.params;
  const rows = await all(
    `SELECT
      fee_plans.*,
      students.name AS studentName,
      COALESCE(SUM(fee_payments.amount), 0) AS paidAmount
    FROM fee_plans
    INNER JOIN students ON students.id = fee_plans.student_id
    LEFT JOIN fee_payments ON fee_payments.fee_plan_id = fee_plans.id AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
    WHERE fee_plans.student_id = ?
    GROUP BY fee_plans.id, students.name
    ORDER BY fee_plans.updatedAt DESC, fee_plans.id DESC`,
    [id]
  );
  res.json(await attachFeeDetailsMany(rows));
});

app.post('/api/fee-plans', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
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
  const student = await get(`SELECT * FROM students WHERE id = ?`, [student_id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO fee_plans (
      student_id, courseProgram, feeCategory, paymentType, totalAmount, discountAmount,
      discountType, discountReason, approvedBy, discountApprovedDate, discountProofNote,
      feeStatus, statusUpdatedAt, dueDate, installmentLabel, notes, createdAt, updatedAt
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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

app.put('/api/fee-plans/:id', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
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

app.delete('/api/fee-plans/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/fee-payments', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
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
    ORDER BY fee_payments.paymentDate DESC, fee_payments.id DESC`
  );
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })));
});

app.get('/api/fee-payments/:id', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
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
    WHERE fee_payments.id = ?`,
    [id]
  );
  if (!row) return res.status(404).json({ error: 'Payment not found' });
  res.json({ ...row, amount: Number(row.amount || 0), totalAmount: Number(row.totalAmount || 0), discountAmount: Number(row.discountAmount || 0) });
});

app.post('/api/fee-payments', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
  const { fee_plan_id, amount, paymentDate, paymentMethod, transactionId, receivedBy, receiptType = 'Non-GST Receipt', notes, remark } = req.body;
  const validationError = requireFields(req.body, ['fee_plan_id', 'amount', 'paymentDate', 'paymentMethod']);
  if (validationError) return res.status(400).json({ error: validationError });
  const plan = await get(`SELECT * FROM fee_plans WHERE id = ?`, [fee_plan_id]);
  if (!plan) return res.status(404).json({ error: 'Fee plan not found' });
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO fee_payments (fee_plan_id, student_id, amount, paymentDate, paymentMethod, transactionId, receivedBy, receiptType, receiptNumber, notes, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fee_plan_id, plan.student_id, Number(amount), paymentDate, paymentMethod, transactionId, receivedBy, receiptType, `PENDING-${Date.now()}`, notes || remark, 'Active', now]
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
    WHERE fee_payments.id = ?`,
    [result.lastID]
  );
  res.json({ ...payment, amount: Number(payment.amount || 0) });
});

app.delete('/api/fee-payments/:id', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
  const { id } = req.params;
  const payment = await get(`SELECT * FROM fee_payments WHERE id = ?`, [id]);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const now = new Date().toISOString();
  await run(`UPDATE fee_payments SET status = ?, cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ?`, ['Cancelled', now, req.user.username, req.body?.reason || 'Cancelled by admin', id]);
  await writeFeeAudit('fee_payment', id, 'cancelled', payment, { reason: req.body?.reason || 'Cancelled by admin' }, req.user.username);
  res.json({ ok: true });
});

app.get('/api/fees/reports', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const plans = await loadFeePlansWithPaid();
  const dailyRows = await all(
    `SELECT paymentDate, paymentMethod, COALESCE(SUM(amount), 0) AS amount
     FROM fee_payments
     WHERE COALESCE(status, 'Active') != 'Cancelled'
     GROUP BY paymentDate, paymentMethod
     ORDER BY paymentDate DESC`
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

app.get('/api/fees/reminders', authMiddleware, requireAnyRole(feeRoles), async (req, res) => {
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

app.post('/api/fees/reminders', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
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

app.post('/api/automation/fees', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
  const { dryRun = false, sentVia = 'WhatsApp Automation' } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const plans = await all(
    `SELECT fee_plans.*, students.name AS studentName, students.data AS studentData
     FROM fee_plans
     LEFT JOIN students ON students.id = fee_plans.student_id
     WHERE fee_plans.dueAmount > 0
     ORDER BY fee_plans.dueDate ASC, fee_plans.id DESC`
  );
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

      const row = {
        student_id: plan.student_id,
        fee_plan_id: plan.id,
        installment_id: installment.id || null,
        studentName: plan.studentName,
        course: plan.courseProgram || plan.feeCategory,
        installmentLabel: installment.label || plan.installmentLabel || 'Fee Due',
        amount: Number(installment.amount || plan.dueAmount || 0),
        dueDate,
        reminderType,
        sentVia,
        message: buildReminderMessage(plan, installment),
      };

      if (duplicate) {
        skipped.push({ ...row, reason: 'Already queued today' });
        continue;
      }

      if (!dryRun) {
        const result = await run(
          `INSERT INTO fee_reminders (student_id, fee_plan_id, installment_id, reminderType, sentVia, sentAt, status, message, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.student_id, row.fee_plan_id, row.installment_id, row.reminderType, row.sentVia, now, 'Queued', row.message, now]
        );
        row.id = result.lastID;
      }

      queued.push(row);
    }
  }

  if (!dryRun && queued.length) {
    await auditLog('fee_reminder', 0, 'automation_run', null, { count: queued.length, sentVia }, req.user.username);
  }

  res.json({
    dryRun: Boolean(dryRun),
    queued,
    skipped,
    summary: {
      queued: queued.length,
      skipped: skipped.length,
      checkedPlans: plans.length,
    },
  });
});

app.get('/api/fees/audit-logs', authMiddleware, requireAnyRole(paymentRoles), async (req, res) => {
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
  const rows = await all(
    `SELECT
      attendance_records.*,
      students.name AS studentName,
      students.grade AS grade,
      students.batch AS studentBatch,
      students.data AS studentData
    FROM attendance_records
    INNER JOIN students ON students.id = attendance_records.student_id
    WHERE attendance_records.session_id = ?
    ORDER BY students.name ASC`,
    [sessionId]
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
  const students = await all(`SELECT * FROM students WHERE batch = ? ORDER BY name ASC`, [session.batch]);
  for (const student of students) {
    const existing = await get(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?`, [session.id, student.id]);
    if (!existing) {
      await run(
        `INSERT INTO attendance_records (session_id, student_id, status, alertStatus, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        [session.id, student.id, 'Not Marked', 'Not Required', new Date().toISOString()]
      );
    }
  }
}

async function attendanceSessionsBase() {
  const rows = await all(
    `SELECT
      attendance_sessions.*,
      COUNT(attendance_records.id) AS studentCount,
      SUM(CASE WHEN attendance_records.status != 'Not Marked' THEN 1 ELSE 0 END) AS markedCount,
      SUM(CASE WHEN attendance_records.status = 'Absent' THEN 1 ELSE 0 END) AS absentCount,
      SUM(CASE WHEN attendance_records.status = 'Late' THEN 1 ELSE 0 END) AS lateCount
    FROM attendance_sessions
    LEFT JOIN attendance_records ON attendance_records.session_id = attendance_sessions.id
    GROUP BY attendance_sessions.id
    ORDER BY attendance_sessions.date DESC, attendance_sessions.startTime DESC, attendance_sessions.id DESC`
  );
  return rows.map((row) => ({
    ...row,
    studentCount: Number(row.studentCount || 0),
    markedCount: Number(row.markedCount || 0),
    absentCount: Number(row.absentCount || 0),
    lateCount: Number(row.lateCount || 0),
  }));
}

app.get('/api/attendance/sessions', authMiddleware, async (req, res) => {
  res.json(await attendanceSessionsBase());
});

app.get('/api/attendance/sessions/:id', authMiddleware, async (req, res) => {
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

app.post('/api/attendance/sessions', authMiddleware, async (req, res) => {
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
    `INSERT INTO attendance_sessions (date, batch, course, subject, teacher_id, teacherName, startTime, endTime, lectureType, status, markedBy, remarks, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, batch, course, subject, teacher_id || null, teacherLabel, startTime, endTime, lectureType, 'Draft', req.user.username, remarks, now, now]
  );
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [result.lastID]);
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

app.put('/api/attendance/sessions/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { date, batch, course, subject, teacher_id, teacherName, startTime, endTime, lectureType, remarks } = req.body;
  const existing = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Attendance session not found' });
  if (existing.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  let teacherLabel = teacherName || existing.teacherName;
  if (teacher_id) {
    const teacher = await get(`SELECT * FROM teachers WHERE id = ?`, [teacher_id]);
    if (teacher) teacherLabel = teacher.name;
  }
  await run(
    `UPDATE attendance_sessions SET date = ?, batch = ?, course = ?, subject = ?, teacher_id = ?, teacherName = ?, startTime = ?, endTime = ?, lectureType = ?, remarks = ?, updatedAt = ? WHERE id = ?`,
    [date, batch, course, subject, teacher_id || null, teacherLabel, startTime, endTime, lectureType, remarks, new Date().toISOString(), id]
  );
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [id]);
  await createMissingAttendanceRecords(session);
  res.json(await attachAttendanceRecords(session));
});

app.post('/api/attendance/sessions/:id/records', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { records = [], submit = false } = req.body;
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [id]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (session.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  const now = new Date().toISOString();
  for (const record of records) {
    if (!record.student_id && !record.studentId) continue;
    const studentId = record.student_id || record.studentId;
    const status = record.status || 'Not Marked';
    const alertStatus = ['Absent', 'Late'].includes(status) ? (record.alertStatus || 'Not Sent') : 'Not Required';
    const existing = await get(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?`, [id, studentId]);
    if (existing) {
      await run(
        `UPDATE attendance_records SET status = ?, markedBy = ?, markedAt = ?, markedTime = ?, arrivalTime = ?, alertStatus = ?, remarks = ?, updatedAt = ? WHERE session_id = ? AND student_id = ?`,
        [status, req.user.username, now, record.markedTime || now, record.arrivalTime || null, alertStatus, record.remarks || null, now, id, studentId]
      );
    } else {
      await run(
        `INSERT INTO attendance_records (session_id, student_id, status, markedBy, markedAt, markedTime, arrivalTime, alertStatus, remarks, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, studentId, status, req.user.username, now, record.markedTime || now, record.arrivalTime || null, alertStatus, record.remarks || null, now]
      );
    }
  }
  await run(
    `UPDATE attendance_sessions SET status = ?, submittedAt = ?, lockedAt = ?, markedBy = ?, updatedAt = ? WHERE id = ?`,
    [submit ? 'Submitted' : 'Draft', submit ? now : session.submittedAt, submit ? now : session.lockedAt, req.user.username, now, id]
  );
  const updated = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [id]);
  res.json(await attachAttendanceRecords(updated));
});

app.post('/api/attendance/sessions/:id/mark-all-present', authMiddleware, async (req, res) => {
  const session = await get(`SELECT * FROM attendance_sessions WHERE id = ?`, [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (session.lockedAt) return res.status(400).json({ error: 'Attendance session is locked' });
  await createMissingAttendanceRecords(session);
  const now = new Date().toISOString();
  await run(`UPDATE attendance_records SET status = ?, markedBy = ?, markedAt = ?, markedTime = ?, alertStatus = ?, updatedAt = ? WHERE session_id = ?`, ['Present', req.user.username, now, now, 'Not Required', now, req.params.id]);
  res.json(await attachAttendanceRecords(session));
});

app.post('/api/attendance/records/:id/alert', authMiddleware, async (req, res) => {
  const { alertStatus = 'Sent', channel = 'WhatsApp' } = req.body;
  const record = await get(`SELECT * FROM attendance_records WHERE id = ?`, [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  await run(`UPDATE attendance_records SET alertStatus = ?, updatedAt = ? WHERE id = ?`, [alertStatus, new Date().toISOString(), req.params.id]);
  const log = await createParentAlertLog(req.params.id, alertStatus, channel, req.user.username);
  res.json({ ok: true, log });
});

app.delete('/api/attendance/sessions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/attendance/dashboard', authMiddleware, async (req, res) => {
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

app.get('/api/attendance/reports', authMiddleware, async (req, res) => {
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

app.get('/api/attendance/parent-alert-logs', authMiddleware, async (req, res) => {
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

app.post('/api/attendance/parent-call-logs', authMiddleware, async (req, res) => {
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

app.get('/api/attendance/parent-call-logs', authMiddleware, async (req, res) => {
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

app.post('/api/staff-attendance/check-in', authMiddleware, async (req, res) => {
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

app.post('/api/staff-attendance/check-out', authMiddleware, async (req, res) => {
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

app.get('/api/staff-attendance/today', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(await all(`SELECT * FROM staff_attendance_records WHERE date = ? ORDER BY checkIn ASC, staffName ASC`, [date]));
});

app.get('/api/staff-attendance/monthly', authMiddleware, async (req, res) => {
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

app.post('/api/leave-requests', authMiddleware, async (req, res) => {
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

app.get('/api/leave-requests', authMiddleware, async (req, res) => {
  res.json(await all(`SELECT * FROM leave_requests ORDER BY createdAt DESC, id DESC`));
});

app.patch('/api/leave-requests/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE leave_requests SET status = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`, ['Approved', req.user.username, now, now, req.params.id]);
  const row = await get(`SELECT * FROM leave_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  res.json(row);
});

app.patch('/api/leave-requests/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE leave_requests SET status = ?, approvedBy = ?, approvedAt = ?, updatedAt = ? WHERE id = ?`, ['Rejected', req.user.username, now, now, req.params.id]);
  const row = await get(`SELECT * FROM leave_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });
  res.json(row);
});

app.post('/api/attendance/corrections', authMiddleware, async (req, res) => {
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

app.get('/api/attendance/corrections', authMiddleware, async (req, res) => {
  res.json(await all(
    `SELECT attendance_correction_requests.*, students.name AS studentName
     FROM attendance_correction_requests
     LEFT JOIN students ON students.id = attendance_correction_requests.student_id
     ORDER BY attendance_correction_requests.createdAt DESC`
  ));
});

app.patch('/api/attendance/corrections/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
  const correction = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]);
  if (!correction) return res.status(404).json({ error: 'Correction request not found' });
  const now = new Date().toISOString();
  await run(`UPDATE attendance_records SET status = ?, updatedAt = ? WHERE id = ?`, [correction.newStatus, now, correction.record_id]);
  await run(`UPDATE attendance_correction_requests SET status = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ?`, ['Approved', req.user.username, now, req.params.id]);
  res.json(await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]));
});

app.patch('/api/attendance/corrections/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE attendance_correction_requests SET status = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ?`, ['Rejected', req.user.username, now, req.params.id]);
  const row = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Correction request not found' });
  res.json(row);
});

app.get('/api/automation/logs', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM automation_logs ORDER BY createdAt DESC, id DESC LIMIT 150`);
  res.json(rows);
});

app.patch('/api/automation/logs/:id/sent', authMiddleware, async (req, res) => {
  const now = new Date().toISOString();
  await run(`UPDATE automation_logs SET status = ?, sentAt = ?, processedAt = ? WHERE id = ?`, ['Sent', now, now, req.params.id]);
  const row = await get(`SELECT * FROM automation_logs WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Automation log not found' });
  res.json(row);
});

app.post('/api/automation/attendance', authMiddleware, async (req, res) => {
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

app.get('/api/automation/batch-discipline', authMiddleware, async (req, res) => {
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

app.post('/api/parent-portal/lookup', async (req, res) => {
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
  res.json({
    student: { id: student.id, name: student.name, grade: student.grade, batch: student.batch },
    attendance: attendanceRows,
    fees: feePlans.map((plan) => ({ course: plan.courseProgram || plan.feeCategory, netAmount: plan.netAmount, paidAmount: plan.paidAmount, dueAmount: plan.dueAmount, feeStatus: plan.feeStatus, nextDueDate: plan.nextDueDate })),
    payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount || 0) })),
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

app.get('/api/ai-lab/dashboard', authMiddleware, async (req, res) => {
  res.json(await loadAiLabDashboard());
});

app.get('/api/ai-lab/courses', authMiddleware, async (req, res) => {
  const courses = await all(`SELECT * FROM ai_lab_courses ORDER BY courseName ASC`);
  const modules = await all(`SELECT * FROM ai_lab_modules ORDER BY course_id ASC, moduleOrder ASC, id ASC`);
  res.json(courses.map((course) => ({ ...course, modules: modules.filter((module) => Number(module.course_id) === Number(course.id)) })));
});

app.post('/api/ai-lab/courses', authMiddleware, async (req, res) => {
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

app.put('/api/ai-lab/courses/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/courses/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_modules WHERE course_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_courses WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/students', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_students.*, students.name AS linkedStudentName
     FROM ai_lab_students
     LEFT JOIN students ON students.id = ai_lab_students.student_id
     ORDER BY ai_lab_students.id DESC`
  );
  res.json(rows.map(normalizeAiLabStudent));
});

app.post('/api/ai-lab/students', authMiddleware, async (req, res) => {
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

app.put('/api/ai-lab/students/:id', authMiddleware, async (req, res) => {
  const { student_id, studentName, grade, school, parentName, mobileNumber, course_id, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired = false, previousCodingExperience, skillLevel = 0, skillAssessment, status = 'Active' } = req.body;
  const existing = await get(`SELECT * FROM ai_lab_students WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'AI Lab student not found' });
  await run(
    `UPDATE ai_lab_students SET student_id = ?, studentName = ?, grade = ?, school = ?, parentName = ?, mobileNumber = ?, course_id = ?, courseName = ?, batch = ?, joiningDate = ?, courseDuration = ?, feeType = ?, deviceRequired = ?, previousCodingExperience = ?, skillLevel = ?, skillAssessment = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [student_id || null, studentName, grade, school, parentName, mobileNumber, course_id || null, courseName, batch, joiningDate, courseDuration, feeType, deviceRequired ? 1 : 0, previousCodingExperience, Number(skillLevel || 0), skillAssessment, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeAiLabStudent(await get(`SELECT * FROM ai_lab_students WHERE id = ?`, [req.params.id])));
});

app.delete('/api/ai-lab/students/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/ai-lab/attendance', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_attendance.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_attendance
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_attendance.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_attendance.course_id
     ORDER BY ai_lab_attendance.date DESC, ai_lab_attendance.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row, ['assignmentGiven'])));
});

app.post('/api/ai-lab/attendance', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/attendance/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_attendance WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/devices', authMiddleware, async (req, res) => {
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

app.post('/api/ai-lab/devices', authMiddleware, async (req, res) => {
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

app.post('/api/ai-lab/device-allocations', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/devices/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_device_allocations WHERE device_id = ?`, [req.params.id]);
  await run(`DELETE FROM ai_lab_devices WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/ai-lab/device-allocations/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_device_allocations WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/projects', authMiddleware, async (req, res) => {
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

app.post('/api/ai-lab/projects', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/projects/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_projects WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/assignments', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_assignments.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_assignments
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_assignments.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_assignments.course_id
     ORDER BY ai_lab_assignments.dueDate DESC, ai_lab_assignments.id DESC`
  );
  res.json(rows.map((row) => normalizeAiLabBooleanRow(row, ['fileUploaded'])));
});

app.post('/api/ai-lab/assignments', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/assignments/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_assignments WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/feedback', authMiddleware, async (req, res) => {
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

app.post('/api/ai-lab/feedback', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/feedback/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_mentor_feedback WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/portfolios', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_portfolios.*, ai_lab_students.studentName
     FROM ai_lab_portfolios
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_portfolios.ai_lab_student_id
     ORDER BY ai_lab_portfolios.updatedAt DESC, ai_lab_portfolios.id DESC`
  );
  res.json(rows);
});

app.post('/api/ai-lab/portfolios', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/portfolios/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM ai_lab_portfolios WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/ai-lab/certificates', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT ai_lab_certificates.*, ai_lab_students.studentName, ai_lab_courses.courseName
     FROM ai_lab_certificates
     LEFT JOIN ai_lab_students ON ai_lab_students.id = ai_lab_certificates.ai_lab_student_id
     LEFT JOIN ai_lab_courses ON ai_lab_courses.id = ai_lab_certificates.course_id
     ORDER BY ai_lab_certificates.issueDate DESC, ai_lab_certificates.id DESC`
  );
  res.json(rows);
});

app.post('/api/ai-lab/certificates', authMiddleware, async (req, res) => {
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

app.delete('/api/ai-lab/certificates/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/academic/dashboard', authMiddleware, async (req, res) => {
  res.json(await academicDashboard());
});

app.get('/api/academic/syllabus', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM academic_syllabus ORDER BY courseName ASC, subject ASC, chapter ASC, topic ASC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['requiredTest'], ['estimatedLectures'])));
});

app.post('/api/academic/syllabus', authMiddleware, async (req, res) => {
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

app.put('/api/academic/syllabus/:id', authMiddleware, async (req, res) => {
  const { courseName, subject, chapter, topic, subTopic, difficulty = 'Basic', estimatedLectures = 1, requiredTest = false, status = 'Pending' } = req.body;
  const existing = await get(`SELECT * FROM academic_syllabus WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Syllabus topic not found' });
  await run(
    `UPDATE academic_syllabus SET courseName = ?, subject = ?, chapter = ?, topic = ?, subTopic = ?, difficulty = ?, estimatedLectures = ?, requiredTest = ?, status = ?, updatedAt = ? WHERE id = ?`,
    [courseName, subject, chapter, topic, subTopic, difficulty, Number(estimatedLectures || 0), requiredTest ? 1 : 0, status, new Date().toISOString(), req.params.id]
  );
  res.json(normalizeAcademic(await get(`SELECT * FROM academic_syllabus WHERE id = ?`, [req.params.id]), ['requiredTest'], ['estimatedLectures']));
});

app.delete('/api/academic/syllabus/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM academic_syllabus WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/calendar', authMiddleware, async (req, res) => {
  res.json(await all(`SELECT * FROM academic_calendars ORDER BY startDate ASC, id DESC`));
});

app.post('/api/academic/calendar', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/calendar/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM academic_calendars WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/timetable', authMiddleware, async (req, res) => {
  res.json(await all(`SELECT * FROM batch_timetables ORDER BY batchName ASC, dayOfWeek ASC, timeSlot ASC`));
});

app.post('/api/academic/timetable', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/timetable/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM batch_timetables WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/lecture-plans', authMiddleware, async (req, res) => {
  res.json(await all(`SELECT * FROM lecture_plans ORDER BY date DESC, batchName ASC, subject ASC`));
});

app.post('/api/academic/lecture-plans', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/lecture-plans/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM class_delivery_logs WHERE lecture_plan_id = ?`, [req.params.id]);
  await run(`DELETE FROM lecture_plans WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/delivery-logs', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM class_delivery_logs ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['lectureCompleted', 'homeworkGiven', 'notesProvided'])));
});

app.post('/api/academic/delivery-logs', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/delivery-logs/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM class_delivery_logs WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/homework', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM homework_assignments ORDER BY dueDate DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, [], ['submittedCount', 'totalCount', 'pendingStudents'])));
});

app.post('/api/academic/homework', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/homework/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM homework_assignments WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/tests', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM test_calendars ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['analysisRequired'], ['totalMarks'])));
});

app.post('/api/academic/tests', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/tests/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM student_test_results WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM test_calendars WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/test-results', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT student_test_results.*, test_calendars.testName
     FROM student_test_results
     LEFT JOIN test_calendars ON test_calendars.id = student_test_results.test_id
     ORDER BY student_test_results.updatedAt DESC, student_test_results.id DESC`
  );
  res.json(rows.map((row) => normalizeAcademic(row, [], ['marksObtained', 'totalMarks', 'testRank', 'accuracy'])));
});

app.post('/api/academic/test-results', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/test-results/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM student_test_results WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/doubt-sessions', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM doubt_sessions ORDER BY date DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['improvementChecked'], ['studentsAssigned'])));
});

app.post('/api/academic/doubt-sessions', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/doubt-sessions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM doubt_sessions WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/revision-plans', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM revision_plans ORDER BY revisionDate DESC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['testAfterRevision'])));
});

app.post('/api/academic/revision-plans', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/revision-plans/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM revision_plans WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/academic/remedial-actions', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM remedial_actions ORDER BY deadline ASC, id DESC`);
  res.json(rows.map((row) => normalizeAcademic(row, ['followUpTest'])));
});

app.post('/api/academic/remedial-actions', authMiddleware, async (req, res) => {
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

app.delete('/api/academic/remedial-actions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.get('/api/test-performance/dashboard', authMiddleware, async (req, res) => {
  res.json(await performanceDashboard());
});

app.get('/api/test-performance/tests', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM performance_tests ORDER BY testDate DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, ['negativeMarking'], ['totalQuestions', 'totalMarks'])));
});

app.post('/api/test-performance/tests', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/tests/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM performance_results WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM question_analysis WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM parent_report_logs WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM teacher_result_impact WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM remedial_students WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM omr_uploads WHERE test_id = ?`, [req.params.id]);
  await run(`DELETE FROM performance_tests WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/test-performance/results', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT performance_results.*, performance_tests.testName
     FROM performance_results
     LEFT JOIN performance_tests ON performance_tests.id = performance_results.test_id
     ORDER BY performance_results.test_id DESC, performance_results.overallRank ASC, performance_results.id DESC`
  );
  res.json(rows.map((row) => normalizePerformance(row, ['parentReportSent'], ['physicsMarks', 'chemistryMarks', 'biologyMarks', 'mathsMarks', 'marksObtained', 'totalMarks', 'percentage', 'batchRank', 'branchRank', 'courseRank', 'overallRank', 'attemptedQuestions', 'correctAnswers', 'wrongAnswers', 'blankQuestions', 'accuracy'])));
});

app.post('/api/test-performance/results', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/results/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const row = await get(`SELECT * FROM performance_results WHERE id = ?`, [req.params.id]);
  await run(`DELETE FROM performance_results WHERE id = ?`, [req.params.id]);
  if (row?.test_id) await recalculatePerformanceRanks(row.test_id);
  res.json({ ok: true });
});

app.get('/api/test-performance/question-analysis', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM question_analysis ORDER BY test_id DESC, questionNumber ASC, id ASC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['questionNumber', 'marksAwarded'])));
});

app.post('/api/test-performance/question-analysis', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/question-analysis/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM question_analysis WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/test-performance/parent-reports', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM parent_report_logs ORDER BY sentAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['marksObtained', 'totalMarks', 'batchRank', 'attendancePercent', 'homeworkCompletion'])));
});

app.post('/api/test-performance/parent-reports', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/parent-reports/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM parent_report_logs WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/test-performance/teacher-impact', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM teacher_result_impact ORDER BY updatedAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['previousAverage', 'currentAverage', 'improvementPercent', 'weakChapterCount', 'homeworkCompletion', 'doubtResolution'])));
});

app.post('/api/test-performance/teacher-impact', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/teacher-impact/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM teacher_result_impact WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/test-performance/remedial-students', authMiddleware, async (req, res) => {
  res.json(await all(`SELECT * FROM remedial_students ORDER BY remedialDate ASC, id DESC`));
});

app.post('/api/test-performance/remedial-students', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/remedial-students/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM remedial_students WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/test-performance/omr-uploads', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM omr_uploads ORDER BY uploadedAt DESC, id DESC`);
  res.json(rows.map((row) => normalizePerformance(row, [], ['processedCount', 'errorCount'])));
});

app.post('/api/test-performance/omr-uploads', authMiddleware, async (req, res) => {
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

app.delete('/api/test-performance/omr-uploads/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await run(`DELETE FROM omr_uploads WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Admissions CRUD
app.get('/api/admissions', authMiddleware, async (req, res) => {
  const rows = await all(`SELECT * FROM admissions ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })));
});

app.post('/api/admissions', authMiddleware, async (req, res) => {
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const result = await run(`INSERT INTO admissions (name, program, status, source, data) VALUES (?, ?, ?, ?, ?)`, [name, program, status, source, JSON.stringify(data || {})]);
  res.json({ id: result.lastID });
});

app.put('/api/admissions/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, program, status, source, data } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM admissions WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Admission not found' });
  await run(`UPDATE admissions SET name = ?, program = ?, status = ?, source = ?, data = ? WHERE id = ?`, [name, program, status, source, JSON.stringify(data || {}), id]);
  res.json({ ok: true });
});

app.delete('/api/admissions/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM admissions WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Ontology: Entities CRUD
app.get('/api/ontology/entities', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_entities ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

app.get('/api/ontology/entities/:id', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  const { id } = req.params;
  const row = await get(`SELECT * FROM ontology_entities WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: 'Entity not found' });
  row.metadata = row.metadata ? JSON.parse(row.metadata) : null;
  const attrs = await all(`SELECT * FROM ontology_attributes WHERE entity_id = ? ORDER BY id`, [id]);
  row.attributes = attrs.map((a) => ({ ...a, options: a.options ? JSON.parse(a.options) : null }));
  res.json(row);
});

app.post('/api/ontology/entities', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, displayName, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_entities (name, displayName, description, metadata, createdAt) VALUES (?, ?, ?, ?, ?)`, [name, displayName, description, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

app.put('/api/ontology/entities/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { displayName, description, metadata } = req.body;
  const existing = await get(`SELECT * FROM ontology_entities WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Entity not found' });
  await run(`UPDATE ontology_entities SET displayName = ?, description = ?, metadata = ? WHERE id = ?`, [displayName, description, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

app.delete('/api/ontology/entities/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_attributes WHERE entity_id = ?`, [id]);
  await run(`DELETE FROM ontology_entities WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Ontology: Attributes CRUD
app.get('/api/ontology/entities/:id/attributes', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  const { id } = req.params;
  const rows = await all(`SELECT * FROM ontology_attributes WHERE entity_id = ? ORDER BY id`, [id]);
  res.json(rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

app.post('/api/ontology/entities/:id/attributes', authMiddleware, requireRole('admin'), async (req, res) => {
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

app.put('/api/ontology/attributes/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { label, type, required, options, metadata } = req.body;
  const existing = await get(`SELECT * FROM ontology_attributes WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Attribute not found' });
  await run(`UPDATE ontology_attributes SET label = ?, type = ?, required = ?, options = ?, metadata = ? WHERE id = ?`, [label, type, required ? 1 : 0, options ? JSON.stringify(options) : null, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

app.delete('/api/ontology/attributes/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_attributes WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Relations
app.get('/api/ontology/relations', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_relations ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

app.post('/api/ontology/relations', authMiddleware, requireRole('admin'), async (req, res) => {
  const { from_entity_id, to_entity_id, name, cardinality, metadata } = req.body;
  const validationError = requireFields(req.body, ['from_entity_id', 'to_entity_id', 'name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_relations (from_entity_id, to_entity_id, name, cardinality, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [from_entity_id, to_entity_id, name, cardinality, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

app.put('/api/ontology/relations/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, cardinality, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM ontology_relations WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Relation not found' });
  await run(`UPDATE ontology_relations SET name = ?, cardinality = ?, metadata = ? WHERE id = ?`, [name, cardinality, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

app.delete('/api/ontology/relations/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_relations WHERE id = ?`, [id]);
  res.json({ ok: true });
});

// Classifications
app.get('/api/ontology/classifications', authMiddleware, requireAnyRole(adminRoles), async (req, res) => {
  const rows = await all(`SELECT * FROM ontology_classifications ORDER BY id DESC`);
  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

app.post('/api/ontology/classifications', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO ontology_classifications (name, description, metadata, createdAt) VALUES (?, ?, ?, ?)`, [name, description, metadata ? JSON.stringify(metadata) : null, now]);
  res.json({ id: result.lastID });
});

app.put('/api/ontology/classifications/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, description, metadata } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await get(`SELECT * FROM ontology_classifications WHERE id = ?`, [id]);
  if (!existing) return res.status(404).json({ error: 'Classification not found' });
  await run(`UPDATE ontology_classifications SET name = ?, description = ?, metadata = ? WHERE id = ?`, [name, description, metadata ? JSON.stringify(metadata) : null, id]);
  res.json({ ok: true });
});

app.delete('/api/ontology/classifications/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  await run(`DELETE FROM ontology_classifications WHERE id = ?`, [id]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;

(async () => {
  // run DB migrations/seed and start server
  await migrate();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
})();
