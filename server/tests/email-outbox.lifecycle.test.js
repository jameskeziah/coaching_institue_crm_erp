const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

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
  createAccessToken,
} = require('../services/token.service');
const { MailDeliveryError } = require('../services/mail.service');
const authRoutes = require('../routes/auth.routes');
const superAdminRoutes = require('../routes/super-admin.routes');

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

async function createUserFixture({ role = 'user', verified = false, email } = {}) {
  await ensureMigrated();
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const recipient = email || `verify-${suffix}@example.test`;
  const result = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      recipient,
      'Verification User',
      recipient,
      'hash',
      'hash',
      role,
      tenant.id,
      verified ? new Date().toISOString() : null,
    ]
  );

  return {
    tenant,
    user: {
      id: result.lastID,
      username: recipient,
      email: recipient,
      role,
      tenant_id: tenant.id,
      email_verified_at: verified ? new Date().toISOString() : null,
    },
  };
}

async function createVerificationOutboxForUser({
  tenantId,
  userId,
  email,
  token,
  createdAt,
  type = 'user_email_verification',
}) {
  const tokenId = generateId('evt');
  await run(
    `INSERT INTO email_verification_tokens
      (id, user_id, tenant_id, token_hash, expires_at, created_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)`,
    [
      tokenId,
      userId,
      tenantId,
      hashToken(token),
      getFutureDate({ hours: 1 }),
      createdAt,
    ]
  );

  const outboxId = await createEmailOutboxRecord({
    tenantId,
    userId,
    tokenId,
    type,
    recipient: email,
    payload: { token },
  });

  await run(
    `UPDATE email_outbox
     SET created_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [createdAt, createdAt, outboxId]
  );

  return { tokenId, outboxId, token };
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
    async sendOwnerRecoveryEmail(message) {
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

async function startPlatformServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/super-admin', superAdminRoutes);
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
  assert.ok(outbox.payload);
  assert.doesNotMatch(outbox.payload, /retry-token/);

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
  assert.equal(outbox.payload, null);
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

test('queueing a replacement verification email does not invalidate the last delivered token', async () => {
  const { tenant, user } = await createUserFixture();
  const oldToken = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'last-delivered-token',
    createdAt: '2026-01-01 00:00:00',
  });

  await processEmailOutboxRecord(oldToken.outboxId, {
    mailService: successfulMailService({ messageId: 'old-delivered' }),
  });

  const replacement = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'queued-replacement-token',
    createdAt: '2026-01-01 00:01:00',
  });

  const oldRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [oldToken.tokenId]);
  const replacementRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [replacement.tokenId]);
  assert.equal(oldRow.used_at, null);
  assert.equal(oldRow.superseded_at, null);
  assert.equal(oldRow.revoked_at, null);
  assert.equal(replacementRow.used_at, null);
  assert.equal(replacementRow.superseded_at, null);
  assert.equal(replacementRow.revoked_at, null);
});

test('successful delivery supersedes only older tokens and older workers cannot invalidate newer tokens', async () => {
  const { tenant, user } = await createUserFixture();
  const older = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'older-token',
    createdAt: '2026-01-01 00:00:00',
  });
  const newer = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'newer-token',
    createdAt: '2026-01-01 00:01:00',
  });
  let sendCount = 0;
  const mailService = successfulMailService({
    onSend: () => {
      sendCount += 1;
    },
  });

  const newerResult = await processEmailOutboxRecord(newer.outboxId, { workerId: 'newer-worker', mailService });
  assert.equal(newerResult.status, 'sent');

  const olderResult = await processEmailOutboxRecord(older.outboxId, { workerId: 'older-worker', mailService });
  assert.equal(olderResult.status, 'cancelled');
  assert.equal(olderResult.reason, 'TOKEN_SUPERSEDED');
  assert.equal(sendCount, 1);

  const olderRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [older.tokenId]);
  const newerRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [newer.tokenId]);
  assert.equal(olderRow.superseded_by_token_id, newer.tokenId);
  assert.equal(newerRow.superseded_at, null);
  assert.equal(newerRow.revoked_at, null);
});

test('permanent replacement delivery failure preserves previous token and revokes only the replacement', async () => {
  const { tenant, user } = await createUserFixture();
  const previous = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'previous-token',
    createdAt: '2026-01-01 00:00:00',
  });
  await processEmailOutboxRecord(previous.outboxId, {
    mailService: successfulMailService({ messageId: 'previous-delivered' }),
  });
  const replacement = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'failed-replacement-token',
    createdAt: '2026-01-01 00:01:00',
  });

  await assert.rejects(
    processEmailOutboxRecord(replacement.outboxId, {
      mailService: {
        async sendVerificationEmail() {
          throw new MailDeliveryError('Recipient rejected', { code: 'MAIL_RECIPIENT_REJECTED' });
        },
      },
    }),
    /Recipient rejected/
  );

  const previousRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [previous.tokenId]);
  const replacementRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [replacement.tokenId]);
  assert.equal(previousRow.superseded_at, null);
  assert.equal(previousRow.revoked_at, null);
  assert.equal(replacementRow.revoked_at !== null, true);
  assert.equal(replacementRow.revocation_reason, 'MAIL_RECIPIENT_REJECTED');
});

test('old-link verification succeeds while a resend is pending and cancels queued replacements', async () => {
  const { tenant, user } = await createUserFixture();
  const old = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'old-link-token',
    createdAt: '2026-01-01 00:00:00',
  });
  const pending = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'pending-link-token',
    createdAt: '2026-01-01 00:01:00',
  });
  const server = await startAuthServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: old.token }),
    });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }

  const oldRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [old.tokenId]);
  const pendingRow = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [pending.tokenId]);
  const pendingOutbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [pending.outboxId]);
  assert.ok(oldRow.used_at);
  assert.ok(pendingRow.revoked_at);
  assert.equal(pendingRow.revocation_reason, 'verified_with_other_token');
  assert.equal(pendingOutbox.status, 'cancelled');
  assert.equal(pendingOutbox.payload, null);
});

test('worker does not send a verification email after the user is already verified', async () => {
  const { tenant, user } = await createUserFixture({ verified: true });
  const replacement = await createVerificationOutboxForUser({
    tenantId: tenant.id,
    userId: user.id,
    email: user.email,
    token: 'verified-user-token',
    createdAt: '2026-01-01 00:00:00',
  });
  let sendCount = 0;

  const result = await processEmailOutboxRecord(replacement.outboxId, {
    mailService: successfulMailService({
      onSend: () => {
        sendCount += 1;
      },
    }),
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.reason, 'USER_ALREADY_VERIFIED');
  assert.equal(sendCount, 0);

  const outbox = await get(`SELECT * FROM email_outbox WHERE id = ?`, [replacement.outboxId]);
  const token = await get(`SELECT * FROM email_verification_tokens WHERE id = ?`, [replacement.tokenId]);
  assert.equal(outbox.status, 'cancelled');
  assert.equal(outbox.payload, null);
  assert.ok(token.revoked_at);
});

test('authenticated resend deduplicates a recently queued verification email', async () => {
  const { tenant, user } = await createUserFixture();
  const server = await startAuthServer();
  const accessToken = createAccessToken(user, generateId('ses'));

  try {
    const first = await fetch(`${server.baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.deliveryStatus, 'queued');

    const second = await fetch(`${server.baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.deliveryStatus, 'queued');
    assert.equal(secondBody.deduplicated, true);
  } finally {
    await server.close();
  }

  const rows = await all(
    `SELECT *
     FROM email_outbox
     WHERE user_id = ?
       AND tenant_id = ?
       AND type = 'user_email_verification'
       AND status IN ('pending', 'retry', 'processing')`,
    [user.id, tenant.id]
  );
  assert.equal(rows.length, 1);
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
  const tenantResult = await run(
    `INSERT INTO tenants
      (name, slug, subscriptionPlan, subscriptionStatus, billingEmail, status, createdAt, updatedAt, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'trial', 'pending_verification', ?, 'pending_verification', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [`Verify Institute ${suffix}`, `verify-institute-${suffix}`, `verify-owner-${suffix}@example.test`]
  );
  const tenantId = tenantResult.lastID;
  await run(
    `INSERT INTO tenant_subscriptions
      (id, tenant_id, plan, status, monthly_amount, currency, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'trial', 'pending_verification', 0, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [generateId('sub'), tenantId]
  );
  const ownerResult = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, created_at, updated_at)
     VALUES (?, 'Verify Owner', ?, 'hash', 'hash', 'owner', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`verify-owner-${suffix}@example.test`, `verify-owner-${suffix}@example.test`, tenantId]
  );
  const token = `verify-token-${suffix}`;
  await run(
    `INSERT INTO email_verification_tokens
      (id, user_id, tenant_id, token_hash, expires_at, created_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'sent', 1)`,
    [generateId('evt'), ownerResult.lastID, tenantId, hashToken(token), getFutureDate({ hours: 1 })]
  );

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
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.equal(secondBody.message, 'Email is already verified');
  } finally {
    await server.close();
  }

  const tenant = await get(`SELECT * FROM tenants WHERE id = ?`, [tenantId]);
  assert.equal(tenant.status, 'trialing');
  assert.equal(tenant.subscriptionStatus, 'trialing');

  const subscriptions = await all(
    `SELECT *
     FROM tenant_subscriptions
     WHERE tenant_id = ?
       AND deleted_at IS NULL`,
    [tenantId]
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

test('revoked user invite is cancelled before mail delivery', async () => {
  await ensureMigrated();
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const sponsor = await get(`SELECT id FROM users WHERE tenant_id = ? ORDER BY id LIMIT 1`, [tenant.id]);
  const inviteId = generateId('inv');
  await run(
    `INSERT INTO user_invites
      (id, tenant_id, email, role, token_hash, invited_by, expires_at, revoked_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, 'teacher', ?, ?, ?, CURRENT_TIMESTAMP, 'pending', 0)`,
    [inviteId, tenant.id, `revoked-${Date.now()}@example.test`, hashToken('revoked-token'), sponsor.id, getFutureDate({ days: 1 })]
  );
  const outboxId = await createEmailOutboxRecord({ tenantId: tenant.id, userId: sponsor.id, inviteId, type: 'user_invite', recipient: `revoked-${Date.now()}@example.test`, payload: { token: 'revoked-token' } });
  let sends = 0;
  const result = await processEmailOutboxRecord(outboxId, { mailService: successfulMailService({ onSend: () => { sends += 1; } }) });
  assert.equal(result.status, 'cancelled');
  assert.equal(sends, 0);
  assert.equal((await get(`SELECT status FROM email_outbox WHERE id = ?`, [outboxId])).status, 'cancelled');
});

test('generic invite acceptance cannot create an owner', async () => {
  await ensureMigrated();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantResult = await run(
    `INSERT INTO tenants
      (name, slug, status, subscriptionStatus, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'active', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [`Generic Invite Guard ${suffix}`, `generic-guard-${suffix}`]
  );
  const sponsor = await get(`SELECT id FROM users ORDER BY id LIMIT 1`);
  const rawToken = `generic-owner-${suffix}`;
  await run(
    `INSERT INTO user_invites
      (id, tenant_id, email, role, token_hash, invited_by, expires_at, delivery_status)
     VALUES (?, ?, ?, 'owner', ?, ?, ?, 'sent')`,
    [generateId('inv'), tenantResult.lastID, `generic-owner-${suffix}@example.test`, hashToken(rawToken), sponsor.id, getFutureDate({ hours: 1 })]
  );

  const server = await startAuthServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/accept-invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, name: 'Blocked Owner', password: 'StrongPass123' }),
    });
    assert.equal(response.status, 409);
  } finally {
    await server.close();
  }
  const owner = await get(`SELECT id FROM users WHERE tenant_id = ? AND role = 'owner' AND deleted_at IS NULL`, [tenantResult.lastID]);
  assert.equal(owner, undefined);
});

test('active platform super admin can create and revoke owner recovery while inactive admin is rejected', async () => {
  await ensureMigrated();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantResult = await run(
    `INSERT INTO tenants
      (name, slug, status, subscriptionStatus, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'active', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [`Platform Recovery ${suffix}`, `platform-recovery-${suffix}`]
  );
  const platformAdminId = generateId('pad');
  const platformEmail = `platform-${suffix}@example.test`;
  await run(
    `INSERT INTO platform_admins
      (id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, 'Recovery Admin', ?, 'unused-test-hash', 'super_admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [platformAdminId, platformEmail]
  );
  const token = jwt.sign(
    { id: platformAdminId, email: platformEmail, role: 'super_admin', tokenType: 'platform_admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const ownerEmail = `platform-owner-${suffix}@example.test`;
  const deletedEmail = `deleted-owner-${suffix}@example.test`;
  await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, created_at, updated_at, deleted_at)
     VALUES (?, 'Deleted User', ?, 'hash', 'hash', 'user', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [deletedEmail, deletedEmail, tenantResult.lastID]
  );
  const server = await startPlatformServer();
  try {
    const collision = await fetch(`${server.baseUrl}/api/super-admin/institutes/${tenantResult.lastID}/owner-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: deletedEmail, reason: 'Deleted account collision check' }),
    });
    assert.equal(collision.status, 409);

    const created = await fetch(`${server.baseUrl}/api/super-admin/institutes/${tenantResult.lastID}/owner-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: ownerEmail, reason: 'Institute has no owner account' }),
    });
    assert.equal(created.status, 201);
    const recovery = await get(
      `SELECT * FROM tenant_owner_recovery_requests WHERE tenant_id = ? AND revoked_at IS NULL`,
      [tenantResult.lastID]
    );
    assert.equal(recovery.email, ownerEmail);
    assert.equal(recovery.platform_admin_id, platformAdminId);

    const listed = await fetch(`${server.baseUrl}/api/super-admin/institutes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    const listedTenant = listedBody.data.find((row) => String(row.id) === String(tenantResult.lastID));
    assert.equal(listedTenant.owner_recovery_request_id, recovery.id);
    assert.equal(listedTenant.owner_recovery_email, ownerEmail);

    const revoked = await fetch(`${server.baseUrl}/api/super-admin/institutes/${tenantResult.lastID}/owner-invite/${recovery.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(revoked.status, 200);
    assert.ok((await get(`SELECT revoked_at FROM tenant_owner_recovery_requests WHERE id = ?`, [recovery.id])).revoked_at);
    assert.ok(await get(`SELECT id FROM platform_audit_logs WHERE action = 'TENANT_OWNER_RECOVERY_REVOKED' AND target_id = ?`, [String(tenantResult.lastID)]));

    await run(`UPDATE platform_admins SET is_active = 0 WHERE id = ?`, [platformAdminId]);
    const rejected = await fetch(`${server.baseUrl}/api/super-admin/institutes/${tenantResult.lastID}/owner-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: `other-${ownerEmail}`, reason: 'Attempt from inactive platform admin' }),
    });
    assert.equal(rejected.status, 401);
  } finally {
    await server.close();
  }
});

test('owner recovery acceptance creates one verified owner with tenant and platform audits', async () => {
  await ensureMigrated();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantResult = await run(
    `INSERT INTO tenants
      (name, slug, status, subscriptionStatus, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'active', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [`Recovery Institute ${suffix}`, `recovery-${suffix}`]
  );
  const tenantId = tenantResult.lastID;
  const rawToken = `owner-recovery-${suffix}`;
  const requestId = generateId('own');
  const platformAdminId = generateId('pad');
  await run(
    `INSERT INTO platform_admins
      (id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, 'Acceptance Admin', ?, 'unused-test-hash', 'super_admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [platformAdminId, `acceptance-admin-${suffix}@example.test`]
  );
  await run(
    `INSERT INTO tenant_owner_recovery_requests
      (id, tenant_id, email, token_hash, platform_admin_id, reason, expires_at, delivery_status)
     VALUES (?, ?, ?, ?, ?, 'Missing owner recovery test', ?, 'sent')`,
    [requestId, tenantId, `recovered-owner-${suffix}@example.test`, hashToken(rawToken), platformAdminId, getFutureDate({ hours: 1 })]
  );
  const server = await startAuthServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/accept-owner-recovery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, name: 'Recovered Owner', password: 'StrongPass123' }),
    });
    assert.equal(response.status, 201);
    const replay = await fetch(`${server.baseUrl}/api/auth/accept-owner-recovery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, name: 'Second Owner', password: 'StrongPass123' }),
    });
    assert.equal(replay.status, 400);
  } finally {
    await server.close();
  }
  const owners = await all(`SELECT id, email_verified_at FROM users WHERE tenant_id = ? AND role = 'owner' AND deleted_at IS NULL`, [tenantId]);
  assert.equal(owners.length, 1);
  assert.ok(owners[0].email_verified_at);
  assert.ok(await get(`SELECT id FROM audit_logs WHERE tenant_id = ? AND action = 'TENANT_OWNER_RECOVERY_ACCEPTED'`, [tenantId]));
  assert.ok(await get(`SELECT id FROM platform_audit_logs WHERE target_id = ? AND action = 'TENANT_OWNER_RECOVERY_ACCEPTED'`, [String(tenantId)]));
});

test.after(async () => {
  await close();
  fs.rmSync(testDatabasePath, { force: true });
});
