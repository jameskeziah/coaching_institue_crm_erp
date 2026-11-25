const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Client } = require('pg');
const { generateReceiptPdf } = require('../services/receiptPdf.service');

if (!process.env.POSTGRES_TEST_ADMIN_URL) {
  throw new Error('POSTGRES_TEST_ADMIN_URL is required; receipt isolation must be verified with PostgreSQL.');
}
const administratorTarget = new URL(process.env.POSTGRES_TEST_ADMIN_URL);
if (!['postgres:', 'postgresql:'].includes(administratorTarget.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(administratorTarget.hostname)
  || administratorTarget.pathname !== '/postgres') {
  throw new Error('Receipt tests require postgres on a disposable loopback PostgreSQL cluster.');
}
const databaseName = `institute_receipt_test_${crypto.randomBytes(8).toString('hex')}`;
const administrator = new Client({ connectionString: administratorTarget.toString(), connectionTimeoutMillis: 10000 });
const originalDirectory = process.cwd();
let directory, databaseCreated = false, connected = false, db, server, baseUrl;
const owners = [];
const receipt = {
  receiptNumber: 'RCPT-00001', studentName: 'Synthetic learner', courseName: 'Synthetic course',
  receiptDate: '2026-11-25', amountPaid: 100, paymentMode: 'CASH', pendingBalance: 900,
};
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN0AAAAASUVORK5CYII=', 'base64');

function junction(target, link) {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

async function api(pathname, { owner, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: `Bearer ${owner.token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function receiptRow(owner, filePath, label = crypto.randomUUID()) {
  return (await db.run(`INSERT INTO fee_receipts (tenant_id, receiptNumber, pdf_path)
    VALUES (?, ?, ?)`, [String(owner.tenantId), `fixture-${label}`, filePath])).lastID;
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'institute-receipt-security-'));
  process.chdir(directory);
  await administrator.connect();
  connected = true;
  await administrator.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const target = new URL(administratorTarget);
  target.pathname = `/${databaseName}`;
  // Prevent an operational .env from participating in this disposable fixture.
  require('dotenv').config = () => ({ parsed: {} });
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: target.toString(), DATABASE_SSL: 'false',
    JWT_SECRET: 'receipt-fixture-secret-at-least-thirty-two-characters',
    APP_URL: 'http://localhost:5173', API_URL: 'http://localhost:4000/api', CORS_ORIGINS: 'http://localhost:5173',
    ADMIN_USERNAME: '', ADMIN_PASSWORD: '', EMAIL_OUTBOX_WORKER_ENABLED: 'false', ALLOW_REGISTRATION: 'false',
    TENANT_BOOTSTRAP_SECRET: 'unused-receipt-fixture-bootstrap-secret', MAIL_FROM: 'fixture@example.test',
    SMTP_HOST: 'unused.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'unused', SMTP_PASS: 'unused',
    WHATSAPP_ACCESS_TOKEN: 'unused', WHATSAPP_PHONE_NUMBER_ID: 'unused', WHATSAPP_API_VERSION: 'v22.0',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'unused', WHATSAPP_APP_SECRET: 'unused',
    RAZORPAY_KEY_ID: 'unused', RAZORPAY_KEY_SECRET: 'unused', RAZORPAY_WEBHOOK_SECRET: 'unused',
  });
  db = require('../db');
  await db.migrate();
  const password = 'ReceiptFixtureOwner2026!';
  const hash = await require('../services/password.service').hashPassword(password);
  for (const label of ['alpha', 'beta']) {
    const tenantId = (await db.run(`INSERT INTO tenants (name, slug, status)
      VALUES (?, ?, 'active')`, [`Synthetic ${label}`, `receipt-${label}`])).lastID;
    await db.run(`INSERT INTO tenant_subscriptions (id, tenant_id, plan, status, monthly_amount, currency)
      VALUES (?, ?, 'local', 'active', 0, 'INR')`, [`receipt-subscription-${label}`, tenantId]);
    const email = `${label}@receipt-fixture.example.test`;
    await db.run(`INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'owner', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [email, `Synthetic ${label} owner`, email, hash, hash, tenantId]);
    const studentId = (await db.run('INSERT INTO students (tenant_id, name) VALUES (?, ?)', [tenantId, `${label} learner`])).lastID;
    const planId = `receipt-plan-${label}`;
    await db.run(`INSERT INTO student_fee_plans
      (id, tenant_id, student_id, course_name, academic_year, total_amount, payable_amount, pending_amount)
      VALUES (?, ?, ?, 'Synthetic course', '2026-27', 1000, 1000, 1000)`, [planId, String(tenantId), String(studentId)]);
    owners.push({ label, tenantId, email, studentId, planId });
  }
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api', require('../routes/fees.routes'));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const owner of owners) {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: owner.email, password } });
    assert.equal(login.status, 200, login.bytes.toString());
    owner.token = JSON.parse(login.bytes).token;
    assert.ok(owner.token);
  }
});

test.after(async () => {
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.close();
  } finally {
    try {
      if (connected) {
        try {
          if (databaseCreated) {
            assert.match(databaseName, /^institute_receipt_test_[a-f0-9]{16}$/);
            await administrator.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
          }
        } finally { await administrator.end(); }
      }
    } finally {
      process.chdir(originalDirectory);
      if (directory) {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('institute-receipt-security-'));
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});

test('receipt generation requires a tenant and same-number receipts cannot overwrite any tenant files', async () => {
  for (const tenantId of [undefined, '', 0, '../2', '01', '2/../3']) {
    await assert.rejects(generateReceiptPdf({ tenantId, receipt }), /valid tenant/);
  }
  const alpha = owners[0], beta = owners[1];
  alpha.pdfPath = await generateReceiptPdf({ tenantId: alpha.tenantId, receipt: { ...receipt, studentName: 'Alpha private learner' } });
  const original = fs.readFileSync(alpha.pdfPath);
  beta.pdfPath = await generateReceiptPdf({ tenantId: beta.tenantId, receipt: { ...receipt, studentName: 'Beta private learner' } });
  const repeated = await generateReceiptPdf({ tenantId: alpha.tenantId, receipt });
  assert.notEqual(alpha.pdfPath, beta.pdfPath);
  assert.notEqual(alpha.pdfPath, repeated);
  assert.deepEqual(fs.readFileSync(alpha.pdfPath), original);
  assert.equal(path.dirname(alpha.pdfPath), path.resolve('storage', 'receipts', String(alpha.tenantId)));
  assert.equal(path.dirname(beta.pdfPath), path.resolve('storage', 'receipts', String(beta.tenantId)));
  assert.match(original.toString('ascii', 0, 5), /^%PDF-/);

  const sentinel = path.resolve('outside.pdf');
  fs.writeFileSync(sentinel, 'preserve outside receipt');
  const traversal = await generateReceiptPdf({ tenantId: alpha.tenantId, receipt: { ...receipt, receiptNumber: '../../../outside' } });
  assert.equal(path.dirname(traversal), path.dirname(alpha.pdfPath));
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve outside receipt');
});

test('signature images are read only from the owning tenant and unsafe legacy references are omitted', async () => {
  const alpha = owners[0], beta = owners[1];
  const alphaAssets = path.resolve('storage', 'tenants', String(alpha.tenantId));
  const betaAssets = path.resolve('storage', 'tenants', String(beta.tenantId));
  fs.mkdirSync(alphaAssets, { recursive: true });
  fs.mkdirSync(betaAssets, { recursive: true });
  const own = path.join(alphaAssets, 'signature.png'), other = path.join(betaAssets, 'signature.png');
  const outside = path.resolve('outside-signature.png'), invalid = path.join(alphaAssets, 'invalid.png');
  fs.writeFileSync(own, image); fs.writeFileSync(other, image); fs.writeFileSync(outside, image); fs.writeFileSync(invalid, 'not an image');
  junction(betaAssets, path.join(alphaAssets, 'foreign-assets'));
  for (const [asset, expectedImages] of [[own, true], [other, false], [outside, false],
    [path.join(alphaAssets, 'foreign-assets', 'signature.png'), false], [invalid, false]]) {
    const pdfPath = await generateReceiptPdf({ tenantId: alpha.tenantId, receipt: { ...receipt, authorizedSignatureUrl: asset } });
    const bytes = fs.readFileSync(pdfPath);
    assert.equal(bytes.includes(Buffer.from('/Subtype /Image')), expectedImages, asset);
  }
});

test('real authenticated receipt downloads return only the owning tenant bytes in both directions', async () => {
  for (const owner of owners) owner.receiptId = await receiptRow(owner, owner.pdfPath);
  for (const [index, owner] of owners.entries()) {
    const other = owners[1 - index];
    const own = await api(`/api/fee-receipts/${owner.receiptId}/pdf`, { owner });
    assert.equal(own.status, 200);
    assert.deepEqual(own.bytes, fs.readFileSync(owner.pdfPath));
    const denied = await api(`/api/fee-receipts/${other.receiptId}/pdf?tenant_id=${other.tenantId}`, {
      owner, headers: { 'X-Tenant-Id': String(other.tenantId) },
    });
    assert.equal(denied.status, 404);
    assert.deepEqual(JSON.parse(denied.bytes), { error: 'Receipt PDF not found' });
  }
  assert.equal((await api(`/api/fee-receipts/${owners[0].receiptId}/pdf`)).status, 401);
});

test('legacy shared files, foreign paths, missing files and traversal paths cannot be downloaded', async () => {
  const alpha = owners[0], beta = owners[1];
  const legacy = path.resolve('storage', 'receipts', 'RCPT-00001.pdf');
  fs.writeFileSync(legacy, 'preserved shared historical bytes');
  const outside = path.resolve('outside-sensitive.pdf');
  fs.writeFileSync(outside, 'outside private bytes');
  for (const filePath of [legacy, beta.pdfPath, outside, null,
    path.join(path.dirname(alpha.pdfPath), 'missing.pdf'),
    path.join(path.dirname(alpha.pdfPath), '..', String(beta.tenantId), path.basename(beta.pdfPath))]) {
    const id = await receiptRow(alpha, filePath);
    const denied = await api(`/api/fee-receipts/${id}/pdf`, { owner: alpha });
    assert.equal(denied.status, 404, String(filePath));
    assert.deepEqual(JSON.parse(denied.bytes), { error: 'Receipt PDF not found' });
  }
  assert.equal(fs.readFileSync(legacy, 'utf8'), 'preserved shared historical bytes');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'outside private bytes');
});

test('directory junctions cannot redirect receipt roots, tenant directories, downloads or signature roots', async () => {
  const alpha = owners[0], beta = owners[1];
  const outside = path.resolve('external-storage');
  fs.mkdirSync(outside);
  const aliasRoot = path.resolve('alias-receipts');
  junction(outside, aliasRoot);
  await assert.rejects(generateReceiptPdf({ tenantId: alpha.tenantId, receipt, outputDir: aliasRoot }), /Unsafe tenant file root/);
  await assert.rejects(generateReceiptPdf({ tenantId: alpha.tenantId, receipt, outputDir: path.join(aliasRoot, 'new-receipts') }), /Unsafe tenant file root/);
  assert.deepEqual(fs.readdirSync(outside), []);
  const separateRoot = path.resolve('namespace-test');
  fs.mkdirSync(separateRoot);
  junction(outside, path.join(separateRoot, String(alpha.tenantId)));
  await assert.rejects(generateReceiptPdf({ tenantId: alpha.tenantId, receipt, outputDir: separateRoot }), /Unsafe tenant file directory/);
  assert.deepEqual(fs.readdirSync(outside), []);

  const alphaReceipts = path.dirname(alpha.pdfPath);
  junction(path.dirname(beta.pdfPath), path.join(alphaReceipts, 'foreign'));
  const id = await receiptRow(alpha, path.join(alphaReceipts, 'foreign', path.basename(beta.pdfPath)));
  assert.equal((await api(`/api/fee-receipts/${id}/pdf`, { owner: alpha })).status, 404);

  const savedReceipts = path.resolve('saved-alpha-receipts');
  fs.renameSync(alphaReceipts, savedReceipts);
  junction(path.dirname(beta.pdfPath), alphaReceipts);
  try {
    const aliasId = await receiptRow(alpha, path.join(alphaReceipts, path.basename(beta.pdfPath)));
    assert.equal((await api(`/api/fee-receipts/${aliasId}/pdf`, { owner: alpha })).status, 404);
  } finally {
    fs.unlinkSync(alphaReceipts);
    fs.renameSync(savedReceipts, alphaReceipts);
  }

  const assets = path.resolve('storage', 'tenants');
  const saved = path.resolve('saved-tenant-assets');
  fs.renameSync(assets, saved);
  const externalAssets = path.join(outside, String(alpha.tenantId));
  fs.mkdirSync(externalAssets);
  fs.writeFileSync(path.join(externalAssets, 'signature.png'), image);
  junction(outside, assets);
  try {
    const pdfPath = await generateReceiptPdf({ tenantId: alpha.tenantId, receipt: { ...receipt, authorizedSignatureUrl: path.join(externalAssets, 'signature.png') } });
    assert.equal(fs.readFileSync(pdfPath).includes(Buffer.from('/Subtype /Image')), false);
  } finally {
    fs.unlinkSync(assets);
    fs.renameSync(saved, assets);
  }
});

test('a foreign provider payment identifier never returns another tenant payment as an idempotent result', async () => {
  const alpha = owners[0], beta = owners[1];
  const foreignPaymentId = (await db.run(`INSERT INTO fee_payments
    (tenant_id, student_id, student_fee_plan_id, amount, razorpay_payment_id)
    VALUES (?, ?, ?, 100, 'foreign-receipt-payment')`, [beta.tenantId, beta.studentId, beta.planId])).lastID;
  const { recordFeePayment } = require('../services/feeLedger.service');
  const ownRepeat = await recordFeePayment({ tenantId: beta.tenantId, studentFeePlanId: beta.planId, amount: 100, razorpayPaymentId: 'foreign-receipt-payment' });
  assert.equal(String(ownRepeat.paymentId), String(foreignPaymentId));
  assert.equal(ownRepeat.duplicate, true);
  // A global legacy provider-id constraint still prevents reuse. It must fail,
  // rather than disclose a foreign payment id through the duplicate lookup.
  await assert.rejects(recordFeePayment({ tenantId: alpha.tenantId, studentFeePlanId: alpha.planId, amount: 100, razorpayPaymentId: 'foreign-receipt-payment' }), (error) => error.code === '23505');
  const unchanged = await db.get('SELECT pending_amount FROM student_fee_plans WHERE id = ?', [alpha.planId]);
  assert.equal(Number(unchanged.pending_amount), 1000);
});

test('a second tenant receipt-number database conflict cannot overwrite the first tenant receipt', async () => {
  const alpha = owners[0], beta = owners[1];
  const { recordFeePayment } = require('../services/feeLedger.service');
  const first = await recordFeePayment({ tenantId: alpha.tenantId, studentFeePlanId: alpha.planId, amount: 100 });
  assert.equal(first.receipt.receiptNumber, 'RCPT-00001');
  const originalBytes = fs.readFileSync(first.receipt.pdfPath);
  const originalReceipt = await db.get('SELECT * FROM fee_receipts WHERE id = ? AND tenant_id = ?', [first.receipt.id, String(alpha.tenantId)]);
  assert.ok(originalReceipt);
  const betaPlan = await db.get('SELECT * FROM student_fee_plans WHERE id = ?', [beta.planId]);
  const betaPayments = await db.all('SELECT * FROM fee_payments WHERE tenant_id = ? ORDER BY id', [beta.tenantId]);
  const betaReceipts = await db.all('SELECT * FROM fee_receipts WHERE tenant_id = ? ORDER BY id', [String(beta.tenantId)]);

  await assert.rejects(recordFeePayment({ tenantId: beta.tenantId, studentFeePlanId: beta.planId, amount: 100 }), (error) => error.code === '23505');

  assert.deepEqual(fs.readFileSync(first.receipt.pdfPath), originalBytes);
  assert.deepEqual(await db.get('SELECT * FROM fee_receipts WHERE id = ? AND tenant_id = ?', [first.receipt.id, String(alpha.tenantId)]), originalReceipt);
  assert.deepEqual(await db.get('SELECT * FROM student_fee_plans WHERE id = ?', [beta.planId]), betaPlan);
  assert.deepEqual(await db.all('SELECT * FROM fee_payments WHERE tenant_id = ? ORDER BY id', [beta.tenantId]), betaPayments);
  assert.deepEqual(await db.all('SELECT * FROM fee_receipts WHERE tenant_id = ? ORDER BY id', [String(beta.tenantId)]), betaReceipts);
  const own = await api(`/api/fee-receipts/${first.receipt.id}/pdf`, { owner: alpha });
  assert.equal(own.status, 200);
  assert.deepEqual(own.bytes, originalBytes);
});
