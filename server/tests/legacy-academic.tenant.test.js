const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const express = require('express');

if (!process.env.POSTGRES_TEST_ADMIN_URL) {
  throw new Error('POSTGRES_TEST_ADMIN_URL is required; real PostgreSQL academic isolation tests must not be skipped.');
}
const administratorUrl = new URL(process.env.POSTGRES_TEST_ADMIN_URL);
if (!['postgres:', 'postgresql:'].includes(administratorUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(administratorUrl.hostname)
  || administratorUrl.pathname !== '/postgres') {
  throw new Error('Academic isolation tests require postgres on a disposable loopback PostgreSQL cluster.');
}
const databaseName = `institute_academic_test_${crypto.randomBytes(8).toString('hex')}`;
const databaseUrl = new URL(administratorUrl);
databaseUrl.pathname = `/${databaseName}`;
const administrator = new Client({ connectionString: administratorUrl.toString(), connectionTimeoutMillis: 10000 });
let databaseCreated = false, administratorConnected = false, db, server, baseUrl;
const owners = [];
const families = [
  ['syllabus', 'academic_syllabus'], ['calendar', 'academic_calendars'],
  ['timetable', 'batch_timetables'], ['lecture-plans', 'lecture_plans'],
  ['delivery-logs', 'class_delivery_logs'], ['homework', 'homework_assignments'],
];

function ownerTenant(row) { return String(row.tenant_id ?? row.tenantId); }

async function request(pathname, { owner, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: `Bearer ${owner.token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, data: await response.json() };
}

function academicPayload(family, owner) {
  const alpha = owner.label === 'alpha';
  const shared = { date: '2026-11-23', batchName: `${owner.label} private batch`, courseName: `${owner.label} private course`, subject: `${owner.label} private subject` };
  if (family === 'syllabus') return { ...shared, chapter: 'Private chapter', topic: `${owner.label} private syllabus`, status: alpha ? 'Completed' : 'Pending' };
  if (family === 'calendar') return { academicYear: '2026-27', calendarType: 'Term', title: `${owner.label} private calendar`, status: 'Planned' };
  if (family === 'timetable') return { ...shared, teacher_id: owner.teacherId, teacherName: `${owner.label} teacher`, dayOfWeek: 'Monday', timeSlot: '09:00' };
  if (family === 'lecture-plans') return { ...shared, teacher_id: owner.teacherId, topic: `${owner.label} private lecture`, status: 'Planned' };
  if (family === 'delivery-logs') return { ...shared, teacher_id: owner.teacherId, lecture_plan_id: owner.records['lecture-plans'], actualTopic: `${owner.label} delivered topic`, lectureCompleted: alpha };
  if (family === 'homework') return { ...shared, teacher_id: owner.teacherId, homework: `${owner.label} private homework`, submittedCount: alpha ? 3 : 0, totalCount: alpha ? 4 : 10, pendingStudents: alpha ? 1 : 10 };
  throw new Error(`Unknown fixture family ${family}`);
}

test.before(async () => {
  await administrator.connect();
  administratorConnected = true;
  await administrator.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  // These tests never load the user's operational .env or mutate its datastore.
  require('dotenv').config = () => ({ parsed: {} });
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: databaseUrl.toString(), DATABASE_SSL: 'false',
    JWT_SECRET: 'academic-isolation-fixture-secret-at-least-thirty-two-characters',
    APP_URL: 'http://localhost:5173', API_URL: 'http://localhost:4000/api', CORS_ORIGINS: 'http://localhost:5173',
    ADMIN_USERNAME: '', ADMIN_PASSWORD: '', EMAIL_OUTBOX_WORKER_ENABLED: 'false', ALLOW_REGISTRATION: 'false',
    TENANT_BOOTSTRAP_SECRET: 'unused-academic-fixture-bootstrap-secret', MAIL_FROM: 'fixture@example.test',
    SMTP_HOST: 'unused.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'unused', SMTP_PASS: 'unused',
    WHATSAPP_ACCESS_TOKEN: 'unused', WHATSAPP_PHONE_NUMBER_ID: 'unused', WHATSAPP_API_VERSION: 'v22.0',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'unused', WHATSAPP_APP_SECRET: 'unused',
    RAZORPAY_KEY_ID: 'unused', RAZORPAY_KEY_SECRET: 'unused', RAZORPAY_WEBHOOK_SECRET: 'unused',
  });
  db = require('../db');
  await db.migrate();
  const { hashPassword } = require('../services/password.service');
  const password = 'AcademicFixtureOwner2026!';
  const passwordHash = await hashPassword(password);
  for (const label of ['alpha', 'beta']) {
    const tenantId = (await db.run(`INSERT INTO tenants
      (name, slug, status, subscriptionPlan, subscriptionStatus, createdAt, updatedAt, created_at, updated_at)
      VALUES (?, ?, 'active', 'local', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`Synthetic ${label} Institute`, `academic-fixture-${label}`])).lastID;
    await db.run(`INSERT INTO tenant_subscriptions
      (id, tenant_id, plan, status, monthly_amount, currency) VALUES (?, ?, 'local', 'active', 0, 'INR')`,
    [`fixture-subscription-${label}`, tenantId]);
    const email = `${label}@academic-fixture.example.test`;
    await db.run(`INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'owner', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [email, `${label} Owner`, email, passwordHash, passwordHash, tenantId]);
    const teacherId = (await db.run("INSERT INTO teachers (tenant_id, name, subject) VALUES (?, ?, 'Physics')", [tenantId, `${label} private teacher`])).lastID;
    const studentId = (await db.run('INSERT INTO students (tenant_id, name, parent_phone) VALUES (?, ?, ?)', [tenantId, `${label} private student`, label === 'alpha' ? '9111111111' : '9222222222'])).lastID;
    owners.push({ label, tenantId, teacherId, studentId, email, records: {} });
  }
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use(require('../routes/legacy.routes'));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const owner of owners) {
    const login = await request('/api/auth/login', { method: 'POST', body: { email: owner.email, password } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.equal(String(login.data.user.tenant_id), String(owner.tenantId));
    assert.ok(login.data.token, 'the actual authentication route must create an access token');
    owner.token = login.data.token;
  }
});

test.after(async () => {
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.close();
  } finally {
    if (administratorConnected) {
      try {
        if (databaseCreated) {
          assert.match(databaseName, /^institute_academic_test_[a-f0-9]{16}$/);
          await administrator.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        }
      } finally { await administrator.end(); }
    }
  }
});

test('both verified owners create each academic resource using session ownership despite supplied tenant identifiers', async () => {
  await Promise.all(owners.map(async (owner, index) => {
    const other = owners[1 - index];
    for (const [family, table] of families) {
      const result = await request(`/api/academic/${family}?tenant_id=${other.tenantId}`, {
        owner, method: 'POST', headers: { 'X-Tenant-Id': String(other.tenantId) },
        body: { ...academicPayload(family, owner), tenant_id: other.tenantId, tenantId: other.tenantId },
      });
      assert.equal(result.status, 200, `${family}: ${JSON.stringify(result.data)}`);
      assert.ok(result.data.id, `${family} response must include the created resource`);
      assert.equal(ownerTenant(result.data), String(owner.tenantId), `${family} response ownership`);
      owner.records[family] = result.data.id;
      const persisted = await db.get(`SELECT tenant_id FROM ${table} WHERE id = ?`, [result.data.id]);
      assert.equal(ownerTenant(persisted), String(owner.tenantId), `${family} persisted ownership`);
    }
  }));
});

test('academic lists and every dashboard data source remain private in both directions', async () => {
  for (const [index, owner] of owners.entries()) {
    const repetitions = index === 0 ? 1 : 2;
    for (let iteration = 0; iteration < repetitions; iteration++) {
      await db.run('INSERT INTO test_calendars (tenant_id, testName, status) VALUES (?, ?, ?)', [owner.tenantId, `${owner.label} test`, 'Scheduled']);
      await db.run('INSERT INTO student_test_results (tenant_id, studentName, subject, marksObtained, totalMarks) VALUES (?, ?, ?, ?, 100)', [owner.tenantId, `${owner.label} learner`, `${owner.label} subject`, index === 0 ? 80 : 10]);
      await db.run('INSERT INTO doubt_sessions (tenant_id, topic, status) VALUES (?, ?, ?)', [owner.tenantId, `${owner.label} doubt`, index === 0 ? 'Completed' : 'Scheduled']);
      await db.run('INSERT INTO revision_plans (tenant_id, chapter, status) VALUES (?, ?, ?)', [owner.tenantId, `${owner.label} revision`, index === 0 ? 'Completed' : 'Planned']);
      await db.run('INSERT INTO remedial_actions (tenant_id, issue, status) VALUES (?, ?, ?)', [owner.tenantId, `${owner.label} remedial`, index === 0 ? 'Completed' : 'Open']);
    }
    const other = owners[1 - index];
    for (const [family] of families) {
      const listed = await request(`/api/academic/${family}?tenantId=${other.tenantId}`, { owner, headers: { 'X-Tenant-Id': String(other.tenantId) } });
      assert.equal(listed.status, 200, family);
      assert.deepEqual(listed.data.map((row) => String(row.id)), [String(owner.records[family])], `${family} must list only the authenticated institution's record`);
      assert.ok(listed.data.every((row) => ownerTenant(row) === String(owner.tenantId)));
      assert.ok(!JSON.stringify(listed.data).includes(`${other.label} private`), `${family} leaked the other institution`);
    }
  }
  const expected = [
    { syllabusCompletion: 100, lectureCompletion: 100, homeworkSubmission: 75, testsScheduled: 1, averageTestScore: 80, weakStudentCount: 0, pendingLectures: 0, pendingHomework: 1, doubtResolution: 100, revisionCompletion: 100, openRemedialActions: 0 },
    { syllabusCompletion: 0, lectureCompletion: 0, homeworkSubmission: 0, testsScheduled: 2, averageTestScore: 10, weakStudentCount: 2, pendingLectures: 1, pendingHomework: 10, doubtResolution: 0, revisionCompletion: 0, openRemedialActions: 2 },
  ];
  for (const [index, owner] of owners.entries()) {
    const dashboard = await request(`/api/academic/dashboard?tenant_id=${owners[1 - index].tenantId}`, { owner });
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.data.totals, expected[index]);
    assert.equal(dashboard.data.syllabusBySubject.length, 1);
    assert.equal(dashboard.data.syllabusBySubject[0].subject, `${owner.label} private subject`);
  }
});

test('dashboard groups subject names that collide with Object prototype properties safely', async () => {
  const owner = owners[0];
  const subjects = ['__proto__', 'constructor', 'toString'];
  const createdIds = [];
  try {
    for (const subject of subjects) {
      const created = await request('/api/academic/syllabus', { owner, method: 'POST', body: { ...academicPayload('syllabus', owner), subject } });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      createdIds.push(created.data.id);
    }
    const dashboard = await request('/api/academic/dashboard', { owner });
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
    assert.equal(dashboard.data.syllabusBySubject.length, subjects.length + 1);
    for (const subject of subjects) {
      assert.deepEqual(dashboard.data.syllabusBySubject.find((row) => row.subject === subject), {
        subject, plannedTopics: 1, completed: 1, pending: 0, completionPercent: 100,
      });
    }
    const otherDashboard = await request('/api/academic/dashboard', { owner: owners[1] });
    assert.deepEqual(otherDashboard.data.syllabusBySubject.map((row) => row.subject), ['beta private subject']);
  } finally {
    for (const id of createdIds) await request(`/api/academic/syllabus/${id}`, { owner, method: 'DELETE' });
  }
});

test('foreign syllabus updates and all academic deletions return 404 without modifying either institution', async () => {
  for (const [index, owner] of owners.entries()) {
    const other = owners[1 - index];
    const syllabusBefore = await db.get('SELECT * FROM academic_syllabus WHERE id = ?', [other.records.syllabus]);
    const update = await request(`/api/academic/syllabus/${other.records.syllabus}?tenant_id=${other.tenantId}`, {
      owner, method: 'PUT', headers: { 'X-Tenant-Id': String(other.tenantId) },
      body: { ...academicPayload('syllabus', owner), tenant_id: other.tenantId, tenantId: other.tenantId },
    });
    assert.equal(update.status, 404);
    assert.deepEqual(update.data, { error: 'Academic record not found' });
    assert.deepEqual(await db.get('SELECT * FROM academic_syllabus WHERE id = ?', [other.records.syllabus]), syllabusBefore);
    for (const [family, table] of families) {
      const before = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [other.records[family]]);
      const deletion = await request(`/api/academic/${family}/${other.records[family]}?tenantId=${other.tenantId}`, {
        owner, method: 'DELETE', headers: { 'X-Tenant-Id': String(other.tenantId) }, body: { tenant_id: other.tenantId },
      });
      assert.equal(deletion.status, 404, `${family}: ${JSON.stringify(deletion.data)}`);
      assert.deepEqual(deletion.data, { error: 'Academic record not found' });
      assert.deepEqual(await db.get(`SELECT * FROM ${table} WHERE id = ?`, [other.records[family]]), before, `${family} foreign record changed`);
    }
    assert.ok(await db.get('SELECT id FROM class_delivery_logs WHERE id = ?', [other.records['delivery-logs']]), 'foreign lecture deletion must not cascade into its delivery log');
  }
});

test('foreign teachers and lecture references are rejected before inserts or related status changes', async () => {
  for (const [index, owner] of owners.entries()) {
    const other = owners[1 - index];
    for (const family of ['timetable', 'lecture-plans', 'delivery-logs', 'homework']) {
      const beforeCounts = await Promise.all(families.map(async ([, table]) => Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count)));
      const result = await request(`/api/academic/${family}`, { owner, method: 'POST', body: { ...academicPayload(family, owner), teacher_id: other.teacherId } });
      assert.equal(result.status, 404, `${family} accepted another institution's teacher: ${JSON.stringify(result.data)}`);
      assert.deepEqual(result.data, { error: 'Referenced academic record not found' });
      assert.deepEqual(await Promise.all(families.map(async ([, table]) => Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count))), beforeCounts);
    }
    const foreignLectureBefore = await db.get('SELECT * FROM lecture_plans WHERE id = ?', [other.records['lecture-plans']]);
    const invalidDelivery = await request('/api/academic/delivery-logs', {
      owner, method: 'POST', body: { ...academicPayload('delivery-logs', owner), lecture_plan_id: other.records['lecture-plans'], lectureCompleted: true },
    });
    assert.equal(invalidDelivery.status, 404);
    assert.deepEqual(invalidDelivery.data, { error: 'Referenced academic record not found' });
    assert.deepEqual(await db.get('SELECT * FROM lecture_plans WHERE id = ?', [other.records['lecture-plans']]), foreignLectureBefore);
  }
});

test('malformed or missing record references fail closed without SQL errors or writes', async () => {
  const invalidIds = ['not-an-id', '0', '-1', '1.5', '2147483648', '2147483647'];
  const snapshot = async () => Promise.all(families.map(async ([, table]) => db.all(`SELECT * FROM ${table} ORDER BY id`)));
  const before = await snapshot();
  for (const owner of owners) {
    for (const id of invalidIds) {
      for (const [family] of families) {
        const result = await request(`/api/academic/${family}/${id}`, { owner, method: 'DELETE' });
        assert.equal(result.status, 404, `${family}/${id}: ${JSON.stringify(result.data)}`);
        assert.deepEqual(result.data, { error: 'Academic record not found' });
      }
      const edit = await request(`/api/academic/syllabus/${id}`, { owner, method: 'PUT', body: academicPayload('syllabus', owner) });
      assert.equal(edit.status, 404);
      assert.deepEqual(edit.data, { error: 'Academic record not found' });
      for (const family of ['timetable', 'lecture-plans', 'delivery-logs', 'homework']) {
        const result = await request(`/api/academic/${family}`, { owner, method: 'POST', body: { ...academicPayload(family, owner), teacher_id: id } });
        assert.equal(result.status, 404, `${family} accepted teacher ${id}: ${JSON.stringify(result.data)}`);
        assert.deepEqual(result.data, { error: 'Referenced academic record not found' });
      }
      const delivery = await request('/api/academic/delivery-logs', { owner, method: 'POST', body: { ...academicPayload('delivery-logs', owner), lecture_plan_id: id } });
      assert.equal(delivery.status, 404);
      assert.deepEqual(delivery.data, { error: 'Referenced academic record not found' });
    }
  }
  assert.deepEqual(await snapshot(), before, 'invalid references must not insert, edit, delete or complete any academic record');
});

test('authorized syllabus edits, own deletions and lecture-child cleanup still work independently', async () => {
  for (const [index, owner] of owners.entries()) {
    const other = owners[1 - index];
    const updated = await request(`/api/academic/syllabus/${owner.records.syllabus}?tenantId=${other.tenantId}`, {
      owner, method: 'PUT', headers: { 'X-Tenant-Id': String(other.tenantId) },
      body: { ...academicPayload('syllabus', owner), topic: `${owner.label} updated topic`, tenant_id: other.tenantId },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.topic, `${owner.label} updated topic`);
    assert.equal(ownerTenant(updated.data), String(owner.tenantId));
    const standaloneDelivery = await request('/api/academic/delivery-logs', { owner, method: 'POST', body: { ...academicPayload('delivery-logs', owner), lecture_plan_id: null } });
    assert.equal(standaloneDelivery.status, 200);
    assert.equal((await request(`/api/academic/delivery-logs/${standaloneDelivery.data.id}`, { owner, method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/academic/lecture-plans/${owner.records['lecture-plans']}`, { owner, method: 'DELETE' })).status, 200);
    assert.equal(await db.get('SELECT id FROM class_delivery_logs WHERE id = ?', [owner.records['delivery-logs']]), undefined);
    if (index === 0) {
      assert.ok(await db.get('SELECT id FROM lecture_plans WHERE id = ?', [owners[1].records['lecture-plans']]));
      assert.ok(await db.get('SELECT id FROM class_delivery_logs WHERE id = ?', [owners[1].records['delivery-logs']]));
    }
    for (const family of ['syllabus', 'calendar', 'timetable', 'homework']) {
      const result = await request(`/api/academic/${family}/${owner.records[family]}`, { owner, method: 'DELETE' });
      assert.equal(result.status, 200, family);
    }
    for (const [family] of families) assert.deepEqual((await request(`/api/academic/${family}`, { owner })).data, [], family);
  }
});

test('academic endpoints require authentication and the legacy parent lookup remains closed', async () => {
  for (const family of [...families.map(([family]) => family), 'dashboard']) {
    assert.equal((await request(`/api/academic/${family}`)).status, 401);
  }
  for (const [family] of families) {
    assert.equal((await request(`/api/academic/${family}`, { method: 'POST', body: academicPayload(family, owners[0]) })).status, 401);
    assert.equal((await request(`/api/academic/${family}/1`, { method: 'DELETE' })).status, 401);
  }
  assert.equal((await request('/api/academic/syllabus/1', { method: 'PUT', body: academicPayload('syllabus', owners[0]) })).status, 401);
  for (const owner of [undefined, ...owners]) {
    const response = await request('/api/parent-portal/lookup', { owner, method: 'POST', body: { student_id: owners[1].studentId, parentPhone: '9222222222' } });
    assert.equal(response.status, 403);
    assert.deepEqual(response.data, { code: 'PARENT_PORTAL_UNAVAILABLE', message: 'Secure parent sign-in is not yet available.' });
  }
});
