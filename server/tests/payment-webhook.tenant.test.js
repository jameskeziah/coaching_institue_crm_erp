const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Client } = require('pg');
const { dropOwnedFixtureDatabase } = require('./postgres-fixture');

if (!process.env.POSTGRES_TEST_ADMIN_URL) {
  throw new Error('POSTGRES_TEST_ADMIN_URL is required; real PostgreSQL payment isolation tests must not be skipped.');
}
const administratorUrl = new URL(process.env.POSTGRES_TEST_ADMIN_URL);
if (!['postgres:', 'postgresql:'].includes(administratorUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(administratorUrl.hostname)
  || administratorUrl.pathname !== '/postgres') {
  throw new Error('Payment webhook tests require postgres on a disposable loopback PostgreSQL cluster.');
}
const databasePrefix = 'institute_payment_test_';
const secrets = { alpha: 'alpha-disposable-webhook-secret', beta: 'beta-disposable-webhook-secret', global: 'global-disposable-webhook-secret' };
let directory, administrator, databaseName, db, server, baseUrl, fixture, originalPdf, pdfService;

function providerPayload(event, name, tenantId) {
  return { event, payload: { payment: { entity: {
    id: `provider-payment-${name}`, payment_link_id: `provider-link-${name}`,
    ...(tenantId === undefined ? {} : { notes: { tenantId: String(tenantId) } }),
  } } } };
}

async function webhook(payload, secret, eventId = crypto.randomUUID()) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const response = await fetch(baseUrl, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-razorpay-event-id': eventId,
    'x-razorpay-signature': crypto.createHmac('sha256', secret).update(body).digest('hex'),
  }, body, signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

async function snapshot() {
  const records = {};
  for (const table of ['fee_payment_links', 'fee_payments', 'fee_receipts', 'student_fee_plans', 'tenant_fee_settings', 'razorpay_webhook_events']) {
    records[table] = await db.all(`SELECT * FROM ${table} ORDER BY id`);
  }
  return records;
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'institute-payment-security-'));
  administrator = new Client({ connectionString: administratorUrl.toString(), connectionTimeoutMillis: 10000 });
  await administrator.connect();
  const generatedName = `${databasePrefix}${crypto.randomBytes(8).toString('hex')}`;
  await administrator.query(`CREATE DATABASE "${generatedName}"`);
  databaseName = generatedName;
  const administratorTarget = new URL(administratorUrl);
  administratorTarget.pathname = `/${databaseName}`;
  const databaseUrl = administratorTarget.toString();

  // Never read a user's operational database or provider settings from .env.
  require('dotenv').config = () => ({ parsed: {} });
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: databaseUrl, DATABASE_SSL: 'false',
    JWT_SECRET: 'payment-security-test-secret-at-least-thirty-two-characters',
    APP_URL: 'https://app.example.test', API_URL: 'https://api.example.test/api', CORS_ORIGINS: 'https://app.example.test',
    ADMIN_USERNAME: '', ADMIN_PASSWORD: '', EMAIL_OUTBOX_WORKER_ENABLED: 'false',
    RAZORPAY_WEBHOOK_SECRET: secrets.global, RAZORPAY_KEY_ID: 'unused', RAZORPAY_KEY_SECRET: 'unused',
    WHATSAPP_ACCESS_TOKEN: 'unused', WHATSAPP_PHONE_NUMBER_ID: 'unused', WHATSAPP_API_VERSION: 'v22.0',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'unused', WHATSAPP_APP_SECRET: 'unused',
    TENANT_BOOTSTRAP_SECRET: 'disposable-payment-test-bootstrap-secret', MAIL_FROM: 'fixture@example.test',
    SMTP_HOST: 'unused.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'unused', SMTP_PASS: 'unused',
  });
  pdfService = require('../services/receiptPdf.service');
  originalPdf = pdfService.generateReceiptPdf;
  pdfService.generateReceiptPdf = (options) => originalPdf({ ...options, outputDir: path.join(directory, 'receipts') });
  db = require('../db');
  await db.migrate();
  const { updateTenantFeeSettings } = require('../services/tenantFeeSettings.service');
  const alpha = (await db.get("SELECT id FROM tenants WHERE slug = 'miraku'")).id;
  const beta = (await db.run("INSERT INTO tenants (name, slug, status) VALUES ('Synthetic Beta', 'payment-beta', 'active')")).lastID;
  fixture = { alpha, beta, students: {} };
  const prefix = crypto.randomBytes(5).toString('hex');
  for (const name of ['alpha', 'beta']) {
    const tenantId = fixture[name];
    await updateTenantFeeSettings(tenantId, { razorpayWebhookSecret: secrets[name], receiptPrefix: `FIX-${prefix}-${name.toUpperCase()}` });
    fixture.students[name] = (await db.run('INSERT INTO students (tenant_id, name) VALUES (?, ?)', [tenantId, `Synthetic ${name} Learner`])).lastID;
    await db.run(`INSERT INTO student_fee_plans
      (id, tenant_id, student_id, course_name, academic_year, total_amount, payable_amount, pending_amount)
      VALUES (?, ?, ?, 'Synthetic Course', '2026-27', 1000, 1000, 1000)`, [`plan-${name}`, String(tenantId), String(fixture.students[name])]);
    await db.run(`INSERT INTO fee_payment_links
      (id, tenant_id, student_fee_plan_id, razorpay_payment_link_id, amount, status)
      VALUES (?, ?, ?, ?, 100, 'CREATED')`, [`local-${name}`, String(tenantId), `plan-${name}`, `provider-link-${name}`]);
  }
  const app = express();
  app.use('/webhook', require('../routes/razorpayWebhook.routes'));
  server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  baseUrl = `http://127.0.0.1:${server.address().port}/webhook`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
  if (pdfService) pdfService.generateReceiptPdf = originalPdf;
  if (administrator) {
    try {
      if (databaseName) {
        assert.match(databaseName, /^institute_payment_test_[a-f0-9]{16}$/);
        await dropOwnedFixtureDatabase(administrator, databaseName);
      }
    } finally { await administrator.end(); }
  }
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('institute-payment-security-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('tenant notes and another institution signature cannot authorize payment-link mutations', async () => {
  const before = await snapshot();
  for (const [name, other] of [['alpha', 'beta'], ['beta', 'alpha']]) {
    const wrongOwner = await webhook(providerPayload('payment.failed', other, fixture[name]), secrets[name]);
    const wrongSignature = await webhook(providerPayload('payment.failed', other), secrets[name]);
    assert.deepEqual(wrongOwner, { status: 400, body: { error: 'Invalid webhook' } });
    assert.deepEqual(wrongSignature, wrongOwner);
  }
  assert.deepEqual(await snapshot(), before);
});

test('registered target selects its credentials and event IDs are independent for each institution', async () => {
  const eventId = 'shared-provider-event-id';
  for (const name of ['alpha', 'beta']) {
    const result = await webhook(providerPayload('payment.failed', name, fixture[name]), secrets[name], eventId);
    assert.equal(result.status, 200);
    assert.equal((await db.get('SELECT status FROM fee_payment_links WHERE id = ?', [`local-${name}`])).status, 'FAILED');
  }
  const events = await db.all('SELECT event_id FROM razorpay_webhook_events ORDER BY event_id');
  assert.deepEqual(events.map((row) => row.event_id), [`${fixture.alpha}:${eventId}`, `${fixture.beta}:${eventId}`].sort());
  const repeated = await webhook(providerPayload('payment.failed', 'beta', fixture.beta), secrets.beta, eventId);
  assert.deepEqual(repeated, { status: 200, body: { message: 'Webhook already processed' } });
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM razorpay_webhook_events')).count), 2);
});

test('conflicting payment, link and secondary-entity tenant references leave financial records unchanged', async () => {
  for (const name of ['alpha', 'beta']) {
    await db.run('INSERT INTO fee_payments (tenant_id, amount, razorpay_payment_id) VALUES (?, 100, ?)', [fixture[name], `existing-${name}-payment`]);
  }
  const before = await snapshot();
  for (const [name, other] of [['alpha', 'beta'], ['beta', 'alpha']]) {
    const conflictingPayment = providerPayload('payment.failed', name, fixture[name]);
    conflictingPayment.payload.payment.entity.id = `existing-${other}-payment`;
    assert.deepEqual(await webhook(conflictingPayment, secrets[name]), { status: 400, body: { error: 'Invalid webhook' } });
    const conflictingLink = providerPayload('payment_link.paid', name, fixture[other]);
    conflictingLink.payload.payment_link = { entity: { id: `provider-link-${name}`, notes: { tenantId: String(fixture[name]) } } };
    assert.equal((await webhook(conflictingLink, secrets[name])).status, 400);
    const conflictingLinkId = providerPayload('payment.failed', name, fixture[name]);
    conflictingLinkId.payload.payment.entity.notes.paymentLinkId = `provider-link-${other}`;
    assert.equal((await webhook(conflictingLinkId, secrets[name])).status, 400);
  }
  assert.deepEqual(await snapshot(), before);
});

test('captured status callbacks update only their registered tenant payment link', async () => {
  for (const [name, other] of [['alpha', 'beta'], ['beta', 'alpha']]) {
    const otherLink = await db.get('SELECT * FROM fee_payment_links WHERE id = ?', [`local-${other}`]);
    assert.equal((await webhook(providerPayload('payment.captured', name), secrets[name])).status, 200);
    const ownLink = await db.get('SELECT * FROM fee_payment_links WHERE id = ?', [`local-${name}`]);
    assert.equal(ownLink.status, 'PAID');
    assert.ok(ownLink.paid_at);
    assert.deepEqual(await db.get('SELECT * FROM fee_payment_links WHERE id = ?', [`local-${other}`]), otherLink);
  }
});

test('valid paid callbacks post only the registered institution ledger and remain idempotent', async () => {
  for (const name of ['alpha', 'beta']) {
    const other = name === 'alpha' ? 'beta' : 'alpha';
    const otherPlan = await db.get('SELECT * FROM student_fee_plans WHERE id = ?', [`plan-${other}`]);
    const payload = providerPayload('payment_link.paid', name, fixture[name]);
    payload.payload.payment_link = { entity: { id: `provider-link-${name}`, notes: { tenantId: String(fixture[name]) } } };
    const eventId = `paid-${name}`;
    const result = await webhook(payload, secrets[name], eventId);
    assert.equal(result.status, 200, JSON.stringify(result));
    const payment = await db.get('SELECT * FROM fee_payments WHERE razorpay_payment_id = ?', [`provider-payment-${name}`]);
    assert.equal(String(payment.tenant_id), String(fixture[name]));
    assert.equal(Number(payment.amount), 100);
    assert.equal(Number((await db.get('SELECT pending_amount FROM student_fee_plans WHERE id = ?', [`plan-${name}`])).pending_amount), 900);
    assert.deepEqual(await db.get('SELECT * FROM student_fee_plans WHERE id = ?', [`plan-${other}`]), otherPlan);
    const afterPaid = await snapshot();
    assert.equal((await webhook(payload, secrets[name], eventId)).status, 200);
    assert.deepEqual(await snapshot(), afterPaid);
  }
});

test('refund callbacks cannot cross institution ownership and valid callbacks affect only their payment', async () => {
  const payload = { event: 'refund.processed', payload: { refund: { entity: {
    id: 'synthetic-refund', payment_id: 'provider-payment-beta', amount: 1000, notes: { tenantId: String(fixture.alpha) },
  } } } };
  const before = await snapshot();
  assert.deepEqual(await webhook(payload, secrets.alpha), { status: 400, body: { error: 'Invalid webhook' } });
  assert.deepEqual(await snapshot(), before);
  payload.payload.refund.entity.notes.tenantId = String(fixture.beta);
  assert.equal((await webhook(payload, secrets.beta)).status, 200);
  const beta = await db.get('SELECT refund_status, refunded_amount FROM fee_payments WHERE razorpay_payment_id = ?', ['provider-payment-beta']);
  assert.equal(beta.refund_status, 'PROCESSED');
  assert.equal(Number(beta.refunded_amount), 10);
  assert.deepEqual(await db.get('SELECT * FROM fee_payments WHERE razorpay_payment_id = ?', ['provider-payment-alpha']), before.fee_payments.find((row) => row.razorpay_payment_id === 'provider-payment-alpha'));
});

test('unauthenticated requests cannot create missing fee settings or reveal target validity', async () => {
  await db.run('DELETE FROM tenant_fee_settings WHERE tenant_id = ?', [fixture.beta]);
  const before = await snapshot();
  assert.deepEqual(await webhook(providerPayload('payment.failed', 'beta'), secrets.alpha), { status: 400, body: { error: 'Invalid webhook' } });
  assert.equal(await db.get('SELECT * FROM tenant_fee_settings WHERE tenant_id = ?', [fixture.beta]), undefined);
  assert.deepEqual(await webhook('{not-json', secrets.alpha), { status: 400, body: { error: 'Invalid webhook' } });
  assert.deepEqual(await snapshot(), before);
});
