const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const testDatabasePath = path.join(process.cwd(), 'server', 'test-email-outbox.sqlite');
fs.rmSync(testDatabasePath, { force: true });

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  PORT: '4000',
  DATABASE_URL: './server/test-email-outbox.sqlite',
  DATABASE_SSL: 'false',
  APP_URL: 'https://app.example.test',
  API_URL: 'https://api.example.test',
  MAIL_FROM: 'no-reply@example.test',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASS: 'smtp-password',
  TENANT_BOOTSTRAP_SECRET: 'test-bootstrap-secret',
  WHATSAPP_ACCESS_TOKEN: 'test',
  WHATSAPP_PHONE_NUMBER_ID: 'test',
  WHATSAPP_API_VERSION: 'v22.0',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test',
  WHATSAPP_APP_SECRET: 'test',
  RAZORPAY_KEY_ID: 'test',
  RAZORPAY_KEY_SECRET: 'test',
  RAZORPAY_WEBHOOK_SECRET: 'test',
});

const {
  all,
  close,
  get,
  migrate,
  run,
} = require('../db');
const {
  createEmailOutboxRecord,
  processDueEmailOutboxRecords,
  processEmailOutboxRecord,
} = require('../services/email-outbox.service');
const {
  createTenantOnboarding,
} = require('../services/tenant-onboarding.service');
const {
  generateId,
  hashToken,
  getFutureDate,
} = require('../services/token.service');
const { MailDeliveryError } = require('../services/mail.service');
const authRoutes = require('../routes/auth.routes');

let migrationPromise;

async function ensureMigrated() {
  if (!migrationPromise) migrationPromise = migrate();
  await migrationPromise;
}

async function createOutboxFixture({ token = `token-${Date.now()}`, email, type = 'user_email_verification' } = {}) {
  await ensureMigrated();
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const recipient = email || `outbox-${suffix}@example.test`;
  const userResult = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'user', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      recipient,
      'Outbox User',
      recipient,
      'hash',
      'hash',
      tenant.id,
    ]
  );

  const tokenId = generateId(type === 'password_reset' ? 'prt' : 'evt');
  const tokenTable = type === 'password_reset' ? 'password_reset_tokens' : 'email_verification_tokens';
  await run(
    `INSERT INTO ${tokenTable}
      (id, user_id, tenant_id, token_hash, expires_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
    [
      tokenId,
      userResult.lastID,
      tenant.id,
      hashToken(token),
      getFutureDate({ hours: 1 }),
    ]
  );

  const outboxId = await createEmailOutboxRecord({
    tenantId: tenant.id,
    userId: userResult.lastID,
    tokenId,
    type,
    recipient,
    payload: { token },
  });

  return {
    tenant,
    userId: userResult.lastID,
    tokenId,
    tokenTable,
    outboxId,
    token,
    recipient,
  };
}

function successfulMailService({ messageId = 'message-1', onSend } = {}) {
  return {
    async sendVerificationEmail(message) {
      if (onSend) await onSend(message);
      return { success: true, messageId };
    },
    async sendPasswordResetEmail(message) {
      if (onSend) await onSend(message);
      return { success: true, messageId };
    },
    async sendInviteEmail(message) {
      if (onSend) await onSend(message);
      return { success: true, messageId };
    },
  };
}

async function startAuthServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

test('email outbox sends verification email, redacts payload, and mirrors token delivery state', async () => {
  const fixture = await createOutboxFixture({ token: 'outbox-token' });

  const result = await processEmailOutboxRecord(fixture.outboxId, {
    mailService: successfulMailService(),
  });

  assert.equal(result.status, 'sent');

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'sent');
  assert.equal(outbox.payload, null);
  assert.equal(outbox.last_error_code, null);

  const token = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [fixture.tokenId]);
  assert.equal(token.delivery_status, 'sent');
  assert.equal(Number(token.delivery_attempt_count), 1);

  const leakedPayloadRows = await all(
    `SELECT id FROM email_outbox WHERE payload LIKE ?`,
    ['%outbox-token%']
  );
  assert.equal(leakedPayloadRows.length, 0);
});

test('temporary SMTP failure becomes retry, then the due-job processor delivers it', async () => {
  const fixture = await createOutboxFixture({ token: 'retry-token' });
  let attempts = 0;
  const mailService = {
    async sendVerificationEmail() {
      attempts += 1;
      if (attempts === 1) {
        throw new MailDeliveryError('Temporary SMTP outage', { code: 'MAIL_TRANSPORT_ERROR' });
      }
      return { success: true, messageId: 'retry-message' };
    },
  };

  const firstRun = await processDueEmailOutboxRecords({ limit: 1, workerId: 'retry-worker-1', mailService });
  assert.equal(firstRun.length, 1);
  assert.equal(firstRun[0].status, 'retry');

  let outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'retry');
  assert.equal(outbox.last_error_code, 'MAIL_TRANSPORT_ERROR');
  assert.match(outbox.payload, /retry-token/);

  await run(`UPDATE email_outbox SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = ?`, [fixture.outboxId]);
  const secondRun = await processDueEmailOutboxRecords({ limit: 1, workerId: 'retry-worker-2', mailService });
  assert.equal(secondRun.length, 1);
  assert.equal(secondRun[0].status, 'sent');

  outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'sent');
  assert.equal(outbox.payload, null);
  assert.equal(attempts, 2);
});

test('stale processing records are reclaimed by the due-job processor', async () => {
  const fixture = await createOutboxFixture({ token: 'stale-token' });
  await run(
    `UPDATE email_outbox
     SET status = 'processing',
         locked_at = ?,
         locked_by = 'dead-worker',
         next_attempt_at = NULL
     WHERE id = ?`,
    ['2000-01-01 00:00:00', fixture.outboxId]
  );

  const results = await processDueEmailOutboxRecords({
    limit: 1,
    workerId: 'reclaimer',
    staleAfterMs: 1,
    mailService: successfulMailService({ messageId: 'stale-message' }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'sent');

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'sent');
  assert.equal(outbox.locked_at, null);
  assert.equal(outbox.locked_by, null);
});

test('fifth temporary SMTP failure becomes permanently failed and clears raw token payload', async () => {
  const fixture = await createOutboxFixture({ token: 'final-failure-token' });
  await run(`UPDATE email_outbox SET attempt_count = 4 WHERE id = ?`, [fixture.outboxId]);

  await assert.rejects(
    processEmailOutboxRecord(fixture.outboxId, {
      mailService: {
        async sendVerificationEmail() {
          throw new MailDeliveryError('Still down', { code: 'MAIL_TRANSPORT_ERROR' });
        },
      },
    }),
    /Still down/
  );

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'failed');
  assert.equal(outbox.payload, null);
  assert.equal(outbox.last_error_code, 'MAIL_TRANSPORT_ERROR');
});

test('permanent SMTP failure clears raw token payload immediately', async () => {
  const fixture = await createOutboxFixture({ token: 'rejected-token' });

  await assert.rejects(
    processEmailOutboxRecord(fixture.outboxId, {
      mailService: {
        async sendVerificationEmail() {
          throw new MailDeliveryError('Recipient rejected', { code: 'MAIL_RECIPIENT_REJECTED' });
        },
      },
    }),
    /Recipient rejected/
  );

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'failed');
  assert.equal(outbox.payload, null);
  assert.equal(outbox.last_error_code, 'MAIL_RECIPIENT_REJECTED');
});

test('development-skipped mail is not marked sent', async () => {
  const fixture = await createOutboxFixture({ token: 'skipped-token' });

  const result = await processEmailOutboxRecord(fixture.outboxId);
  assert.equal(result.status, 'skipped');
  assert.equal(result.result.skipped, true);

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'skipped');
  assert.equal(outbox.sent_at, null);

  const token = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [fixture.tokenId]);
  assert.equal(token.delivery_status, 'skipped');
});

test('two concurrent workers cannot send the same outbox record twice', async () => {
  const fixture = await createOutboxFixture({ token: 'concurrency-token' });
  let sendCount = 0;
  const mailService = successfulMailService({
    messageId: 'concurrency-message',
    onSend: async () => {
      sendCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  });

  const results = await Promise.all([
    processEmailOutboxRecord(fixture.outboxId, { workerId: 'worker-a', mailService }),
    processEmailOutboxRecord(fixture.outboxId, { workerId: 'worker-b', mailService }),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ['not_claimed', 'sent']
  );
  assert.equal(sendCount, 1);

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [fixture.outboxId]);
  assert.equal(outbox.status, 'sent');
});

test('repeated onboarding for an unverified owner resumes pending access without starting trial', async () => {
  await ensureMigrated();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const input = {
    instituteName: `Pending Institute ${suffix}`,
    ownerName: 'Pending Owner',
    ownerEmail: `pending-owner-${suffix}@example.test`,
    ownerPassword: 'StrongPass123',
    branchName: 'Main Branch',
    branchCode: 'MAIN',
    city: 'Bengaluru',
  };

  const first = await createTenantOnboarding(input);
  const resumed = await createTenantOnboarding(input);

  assert.equal(first.tenant.status, 'pending_verification');
  assert.equal(first.tenant.subscriptionStatus, 'pending_verification');
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.tenant.id, first.tenant.id);
  assert.equal(resumed.owner.email, input.ownerEmail);
  assert.ok(resumed.owner.id);
  assert.equal(resumed.branch, undefined);

  const tenant = await get(`SELECT * FROM tenants WHERE id = ?`, [first.tenant.id]);
  assert.equal(tenant.status, 'pending_verification');
  assert.equal(tenant.subscriptionStatus, 'pending_verification');

  const subscriptions = await all(
    `SELECT *
     FROM tenant_subscriptions
     WHERE tenant_id = ?
       AND deleted_at IS NULL`,
    [first.tenant.id]
  );
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].status, 'pending_verification');
  assert.equal(subscriptions[0].trial_started_at, null);
  assert.equal(subscriptions[0].trial_ends_at, null);
});

test('successful owner verification activates tenant and subscription exactly once', async () => {
  await ensureMigrated();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const input = {
    instituteName: `Verify Institute ${suffix}`,
    ownerName: 'Verify Owner',
    ownerEmail: `verify-owner-${suffix}@example.test`,
    ownerPassword: 'StrongPass123',
    branchName: 'Main Branch',
    branchCode: 'MAIN',
    city: 'Bengaluru',
  };

  const onboarding = await createTenantOnboarding(input);
  const outbox = await get(
    `SELECT *
     FROM email_outbox
     WHERE tenant_id = ?
       AND type = 'owner_email_verification'
     ORDER BY created_at DESC
     LIMIT 1`,
    [onboarding.tenant.id]
  );
  const { token } = JSON.parse(outbox.payload);
  const server = await startAuthServer();

  try {
    const firstResponse = await fetch(`${server.baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(firstResponse.status, 200);

    const secondResponse = await fetch(`${server.baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(secondResponse.status, 400);
  } finally {
    await server.close();
  }

  const tenant = await get(`SELECT * FROM tenants WHERE id = ?`, [onboarding.tenant.id]);
  assert.equal(tenant.status, 'trialing');
  assert.equal(tenant.subscriptionStatus, 'trialing');

  const subscriptions = await all(
    `SELECT *
     FROM tenant_subscriptions
     WHERE tenant_id = ?
       AND deleted_at IS NULL`,
    [onboarding.tenant.id]
  );
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].status, 'trialing');
  assert.ok(subscriptions[0].trial_started_at);
  assert.ok(subscriptions[0].trial_ends_at);
});

test('current subscription invariant rejects multiple non-deleted subscription rows', async () => {
  await ensureMigrated();
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);

  await assert.rejects(
    run(
      `INSERT INTO tenant_subscriptions
        (id, tenant_id, plan, status, monthly_amount, currency, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'trial', 'trialing', 0, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [generateId('sub'), tenant.id]
    ),
    /UNIQUE|constraint/i
  );
});

test.after(async () => {
  await close();
  fs.rmSync(testDatabasePath, { force: true });
});
