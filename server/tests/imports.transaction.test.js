const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'protrack-import-transactions-'));
const testDatabasePath = path.join(testDirectory, 'imports.sqlite');

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  JWT_ACCESS_EXPIRES_IN: '15m',
  PORT: '4000',
  DATABASE_URL: testDatabasePath,
  DATABASE_SSL: 'false',
  APP_URL: 'https://app.example.test',
  API_URL: 'https://api.example.test',
  CORS_ORIGINS: 'https://app.example.test',
  TENANT_BOOTSTRAP_SECRET: 'test-bootstrap-secret',
});

const { all, close, get, migrate, run } = require('../db');
const { createAccessToken, generateId } = require('../services/token.service');
const importsRoutes = require('../routes/imports.routes');

let context;

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/imports', importsRoutes);
  app.use((error, req, res, next) => {
    void next;
    res.status(500).json({ error: 'Import transaction failed', detail: error.message });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(`${context.server.baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function dryRun(pathname, rows, sourceName) {
  const result = await apiRequest(`/api/imports/${pathname}/dry-run`, {
    method: 'POST',
    body: JSON.stringify({ rows, sourceName }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.status, 'VALIDATED');
  return result.body.batchId;
}

async function commit(batchId, expectedStatus = 200) {
  const result = await apiRequest(`/api/imports/${batchId}/commit`, { method: 'POST' });
  assert.equal(result.response.status, expectedStatus, JSON.stringify(result.body));
  return result.body;
}

async function rollback(batchId, expectedStatus = 200) {
  const result = await apiRequest(`/api/imports/${batchId}/rollback`, { method: 'POST' });
  assert.equal(result.response.status, expectedStatus, JSON.stringify(result.body));
  return result.body;
}

async function assertBatchState(batchId, expectedBatchStatus, expectedRowStatus) {
  const batch = await get(
    `SELECT status, committed_at, rolled_back_at
     FROM data_import_batches
     WHERE id = ? AND tenant_id = ?`,
    [batchId, context.tenantId]
  );
  assert.equal(batch.status, expectedBatchStatus);

  const rows = await all(
    `SELECT status, entity_id
     FROM data_import_rows
     WHERE batch_id = ? AND tenant_id = ?
     ORDER BY row_number`,
    [batchId, context.tenantId]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.status), [expectedRowStatus, expectedRowStatus]);
  if (expectedRowStatus === 'VALID') {
    assert.deepEqual(rows.map((row) => row.entity_id), [null, null]);
    assert.equal(batch.committed_at, null);
  } else if (expectedRowStatus === 'IMPORTED') {
    assert.equal(rows.every((row) => Boolean(row.entity_id)), true);
  }
}

async function createStudent(studentCode, name) {
  const result = await run(
    `INSERT INTO students
      (tenant_id, student_code, name, student_name, display_name, status, data, legacy_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [context.tenantId, studentCode, name, name, name]
  );
  return String(result.lastID);
}

test.before(async () => {
  await migrate();
  const tenant = await get(`SELECT id FROM tenants WHERE slug = ?`, ['miraku']);
  context = { tenantId: tenant.id };

  const username = `import-owner-${Date.now()}`;
  const userResult = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, email_verified_at, created_at, updated_at)
     VALUES (?, 'Import Owner', ?, 'hash', 'hash', 'owner', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [username, `${username}@example.test`, tenant.id]
  );
  context.token = createAccessToken({
    id: userResult.lastID,
    username,
    email: `${username}@example.test`,
    role: 'owner',
    tenant_id: tenant.id,
    email_verified_at: new Date().toISOString(),
  }, generateId('ses'));
  context.server = await startServer();
});

test('student commit and business rollback are atomic', async () => {
  const suffix = Date.now();
  const firstCode = `TX-STUDENT-OK-${suffix}`;
  const secondCode = `TX-STUDENT-FAIL-${suffix}`;
  const batchId = await dryRun('students', [
    { studentCode: firstCode, name: 'Transaction Student One', status: 'ACTIVE' },
    { studentCode: secondCode, name: 'Transaction Student Two', status: 'ACTIVE' },
  ], 'student-transaction-test.csv');

  await run(
    `CREATE TRIGGER fail_student_import
     BEFORE INSERT ON students
     WHEN NEW.student_code = '${secondCode}'
     BEGIN SELECT RAISE(ABORT, 'forced student import failure'); END`
  );
  await commit(batchId, 500);
  await run(`DROP TRIGGER fail_student_import`);

  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM students WHERE tenant_id = ? AND student_code IN (?, ?)`,
    [context.tenantId, firstCode, secondCode]
  )).count), 0);
  await assertBatchState(batchId, 'VALIDATED', 'VALID');

  await commit(batchId);
  await run(
    `CREATE TRIGGER fail_student_rollback
     BEFORE DELETE ON students
     WHEN OLD.student_code = '${secondCode}'
     BEGIN SELECT RAISE(ABORT, 'forced student rollback failure'); END`
  );
  await rollback(batchId, 500);
  await run(`DROP TRIGGER fail_student_rollback`);

  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM students WHERE tenant_id = ? AND student_code IN (?, ?)`,
    [context.tenantId, firstCode, secondCode]
  )).count), 2);
  await assertBatchState(batchId, 'COMMITTED', 'IMPORTED');

  await rollback(batchId);
  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM students WHERE tenant_id = ? AND student_code IN (?, ?)`,
    [context.tenantId, firstCode, secondCode]
  )).count), 0);
  await assertBatchState(batchId, 'ROLLED_BACK', 'ROLLED_BACK');
});

test('guardian commit and business rollback are atomic', async () => {
  const suffix = Date.now();
  const firstCode = `TX-GUARDIAN-STUDENT-1-${suffix}`;
  const secondCode = `TX-GUARDIAN-STUDENT-2-${suffix}`;
  await createStudent(firstCode, 'Guardian Student One');
  await createStudent(secondCode, 'Guardian Student Two');

  const firstName = `Transaction Guardian One ${suffix}`;
  const secondName = `Transaction Guardian Fail ${suffix}`;
  const batchId = await dryRun('guardians', [
    { studentCode: firstCode, name: firstName, relationship: 'GUARDIAN', phone: '9000000001' },
    { studentCode: secondCode, name: secondName, relationship: 'GUARDIAN', phone: '9000000002' },
  ], 'guardian-transaction-test.csv');

  await run(
    `CREATE TRIGGER fail_guardian_import
     BEFORE INSERT ON student_guardians
     WHEN NEW.name = '${secondName}'
     BEGIN SELECT RAISE(ABORT, 'forced guardian import failure'); END`
  );
  await commit(batchId, 500);
  await run(`DROP TRIGGER fail_guardian_import`);

  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = ? AND name IN (?, ?)`,
    [context.tenantId, firstName, secondName]
  )).count), 0);
  await assertBatchState(batchId, 'VALIDATED', 'VALID');

  await commit(batchId);
  await run(
    `CREATE TRIGGER fail_guardian_rollback
     BEFORE DELETE ON student_guardians
     WHEN OLD.name = '${secondName}'
     BEGIN SELECT RAISE(ABORT, 'forced guardian rollback failure'); END`
  );
  await rollback(batchId, 500);
  await run(`DROP TRIGGER fail_guardian_rollback`);

  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = ? AND name IN (?, ?)`,
    [context.tenantId, firstName, secondName]
  )).count), 2);
  await assertBatchState(batchId, 'COMMITTED', 'IMPORTED');

  await rollback(batchId);
  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = ? AND name IN (?, ?)`,
    [context.tenantId, firstName, secondName]
  )).count), 0);
  await assertBatchState(batchId, 'ROLLED_BACK', 'ROLLED_BACK');
});

test('fee opening-balance commit and business rollback are atomic', async () => {
  const suffix = Date.now();
  const firstCode = `TX-FEE-STUDENT-1-${suffix}`;
  const secondCode = `TX-FEE-STUDENT-2-${suffix}`;
  await createStudent(firstCode, 'Fee Student One');
  await createStudent(secondCode, 'Fee Student Two');

  const firstCourse = `Transaction Course One ${suffix}`;
  const secondCourse = `Transaction Course Fail ${suffix}`;
  const failingDueDate = '2027-02-02';
  const batchId = await dryRun('fee-opening-balances', [
    { studentCode: firstCode, courseName: firstCourse, academicYear: '2027', openingBalance: 1100, dueDate: '2027-01-01' },
    { studentCode: secondCode, courseName: secondCourse, academicYear: '2027', openingBalance: 2200, dueDate: failingDueDate },
  ], 'fee-opening-transaction-test.csv');

  await run(
    `CREATE TRIGGER fail_opening_balance_import
     BEFORE INSERT ON student_fee_installments
     WHEN NEW.due_date = '${failingDueDate}'
     BEGIN SELECT RAISE(ABORT, 'forced opening balance import failure'); END`
  );
  await commit(batchId, 500);
  await run(`DROP TRIGGER fail_opening_balance_import`);

  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count FROM student_fee_plans WHERE tenant_id = ? AND course_name IN (?, ?)`,
    [context.tenantId, firstCourse, secondCourse]
  )).count), 0);
  assert.equal(Number((await get(
    `SELECT COUNT(*) AS count
     FROM student_fee_installments
     WHERE tenant_id = ? AND due_date IN ('2027-01-01', ?)`,
    [context.tenantId, failingDueDate]
  )).count), 0);
  await assertBatchState(batchId, 'VALIDATED', 'VALID');

  await commit(batchId);
  await run(
    `CREATE TRIGGER fail_opening_balance_rollback
     BEFORE UPDATE OF status ON student_fee_plans
     WHEN OLD.course_name = '${secondCourse}' AND NEW.status = 'REVERSED'
     BEGIN SELECT RAISE(ABORT, 'forced opening balance rollback failure'); END`
  );
  await rollback(batchId, 500);
  await run(`DROP TRIGGER fail_opening_balance_rollback`);

  const plansAfterFailure = await all(
    `SELECT status, pending_amount
     FROM student_fee_plans
     WHERE tenant_id = ? AND course_name IN (?, ?)
     ORDER BY course_name`,
    [context.tenantId, firstCourse, secondCourse]
  );
  assert.equal(plansAfterFailure.length, 2);
  assert.equal(plansAfterFailure.every((plan) => plan.status === 'ACTIVE' && Number(plan.pending_amount) > 0), true);
  const installmentsAfterFailure = await all(
    `SELECT status, pending_amount
     FROM student_fee_installments
     WHERE tenant_id = ? AND due_date IN ('2027-01-01', ?)
     ORDER BY due_date`,
    [context.tenantId, failingDueDate]
  );
  assert.equal(installmentsAfterFailure.length, 2);
  assert.equal(installmentsAfterFailure.every((installment) => installment.status === 'PENDING' && Number(installment.pending_amount) > 0), true);
  await assertBatchState(batchId, 'COMMITTED', 'IMPORTED');

  await rollback(batchId);
  const reversedPlans = await all(
    `SELECT status, pending_amount
     FROM student_fee_plans
     WHERE tenant_id = ? AND course_name IN (?, ?)`,
    [context.tenantId, firstCourse, secondCourse]
  );
  assert.equal(reversedPlans.every((plan) => plan.status === 'REVERSED' && Number(plan.pending_amount) === 0), true);
  await assertBatchState(batchId, 'ROLLED_BACK', 'ROLLED_BACK');
});

test.after(async () => {
  await context?.server?.close();
  await close();
  fs.rmSync(testDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
