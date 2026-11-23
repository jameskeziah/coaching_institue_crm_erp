const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const databasePrefix = 'institute_migration_test_';
const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const childMode = process.argv.includes('--migration-child');

function testDatabaseUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !new RegExp(`^/${databasePrefix}[a-f0-9]{16}$`).test(url.pathname)) {
    throw new Error('Migration child requires a generated disposable loopback database.');
  }
  return url;
}

async function runMigrationChild() {
  const url = testDatabaseUrl(process.env.MIGRATION_TEST_DATABASE_URL);
  // The test target is explicit. Never read an operational checkout's .env.
  require('dotenv').config = () => ({ parsed: {} });
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', DATABASE_URL: url.toString(), DATABASE_SSL: 'false',
    JWT_SECRET: 'disposable-migration-fixture-secret-at-least-32-characters',
    APP_URL: 'http://localhost:5173', API_URL: 'http://localhost:4000/api',
    CORS_ORIGINS: 'http://localhost:5173', ADMIN_USERNAME: 'migration-fixture-admin',
    ADMIN_PASSWORD: 'MigrationFixture2026!', ADMIN_EMAIL: 'migration-fixture@example.test',
    EMAIL_OUTBOX_WORKER_ENABLED: 'false', ALLOW_REGISTRATION: 'false',
    TENANT_BOOTSTRAP_SECRET: 'disposable-migration-bootstrap-secret',
    MAIL_FROM: 'migration-fixture@example.test', SMTP_HOST: 'unused.example.test',
    SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'unused', SMTP_PASS: 'unused',
    WHATSAPP_ACCESS_TOKEN: 'unused', WHATSAPP_PHONE_NUMBER_ID: 'unused', WHATSAPP_API_VERSION: 'v22.0',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'unused', WHATSAPP_APP_SECRET: 'unused',
    RAZORPAY_KEY_ID: 'unused', RAZORPAY_KEY_SECRET: 'unused', RAZORPAY_WEBHOOK_SECRET: 'unused',
  });

  const query = Client.prototype.query;
  let statements = 0;
  let faultInjected = false;
  const failAfter = Number(process.env.MIGRATION_TEST_FAIL_AFTER || 0);
  const holdLockMs = Number(process.env.MIGRATION_TEST_HOLD_LOCK_MS || 0);
  Client.prototype.query = function instrumentedQuery(...arguments_) {
    const callback = typeof arguments_.at(-1) === 'function' ? arguments_.pop() : null;
    const execute = async () => {
      const sql = typeof arguments_[0] === 'string' ? arguments_[0] : String(arguments_[0]?.text || '');
      const controlStatement = /^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)
        || /pg_advisory_xact_lock/i.test(sql);
      if (!controlStatement) statements++;
      if (!faultInjected && failAfter > 0 && statements === failAfter && !controlStatement) {
        faultInjected = true;
        throw new Error('MIGRATION_TEST_INJECTED_FAILURE');
      }
      const result = await query.apply(this, arguments_);
      if (/pg_advisory_xact_lock/i.test(sql)) {
        process.stdout.write('MIGRATION_TEST_LOCK_ACQUIRED\n');
        if (holdLockMs) await new Promise((resolve) => setTimeout(resolve, holdLockMs));
      }
      return result;
    };
    const result = execute();
    if (callback) {
      result.then((value) => callback(null, value), callback);
      return undefined;
    }
    return result;
  };

  let database;
  try {
    database = require('../db');
    await database.migrate();
    if (failAfter > 0 && !faultInjected) throw new Error('Migration did not reach the requested injected failure.');
    process.stdout.write(`MIGRATION_TEST_COMPLETE ${JSON.stringify({ statements })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = /MIGRATION_TEST_(?:INJECTED|EXISTING)_FAILURE/.test(error.message) ? 2 : 1;
  } finally {
    if (database) await database.close();
    Client.prototype.query = query;
  }
}

if (childMode) {
  runMigrationChild().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
} else {
  const test = require('node:test');
  if (!process.env.POSTGRES_TEST_ADMIN_URL) {
    throw new Error('POSTGRES_TEST_ADMIN_URL is required; PostgreSQL migration verification must not be skipped.');
  }
  const administratorUrl = new URL(process.env.POSTGRES_TEST_ADMIN_URL);
  if (!['postgres:', 'postgresql:'].includes(administratorUrl.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(administratorUrl.hostname)
    || administratorUrl.pathname !== '/postgres') {
    throw new Error('POSTGRES_TEST_ADMIN_URL must point to postgres on an isolated loopback PostgreSQL cluster.');
  }

  const administrator = new Client({ connectionString: administratorUrl.toString(), connectionTimeoutMillis: 10000 });
  const ownedDatabases = new Set();
  const activeChildren = new Set();
  const workspaceRoot = path.resolve(__dirname, '..', '..');

  function startMigration(url, options = {}) {
    testDatabaseUrl(url);
    let output = '', errors = '', resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    const child = spawn(process.execPath, [__filename, '--migration-child'], {
      cwd: workspaceRoot, windowsHide: true, shell: false,
      env: {
        ...process.env, MIGRATION_TEST_DATABASE_URL: url,
        MIGRATION_TEST_FAIL_AFTER: String(options.failAfter || 0),
        MIGRATION_TEST_HOLD_LOCK_MS: String(options.holdLockMs || 0),
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChildren.add(child);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('MIGRATION_TEST_LOCK_ACQUIRED')) resolveReady(true);
    });
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    const result = new Promise((resolve) => {
      child.once('error', (error) => {
        activeChildren.delete(child); resolveReady(false);
        resolve({ code: -1, output, errors: error.message });
      });
      child.once('exit', (code, signal) => {
        activeChildren.delete(child); resolveReady(false);
        resolve({ code, signal, output, errors });
      });
    });
    return { child, ready, result };
  }

  async function migrate(url, options = {}) {
    const outcome = await startMigration(url, options).result;
    assert.equal(outcome.code, options.expectedCode || 0,
      `migration child ${outcome.code ?? outcome.signal}: ${outcome.errors}\n${outcome.output}`);
    return outcome;
  }

  async function withClient(url, callback) {
    testDatabaseUrl(url);
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
    await client.connect();
    try { return await callback(client); }
    finally { await client.end(); }
  }

  async function withDatabase(callback) {
    const name = `${databasePrefix}${crypto.randomBytes(8).toString('hex')}`;
    await administrator.query(`CREATE DATABASE ${quote(name)}`);
    ownedDatabases.add(name);
    const target = new URL(administratorUrl);
    target.pathname = `/${name}`;
    try { return await callback(target.toString(), name); }
    finally {
      await administrator.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
      ownedDatabases.delete(name);
    }
  }

  async function snapshot(url, includeRows = false) {
    return withClient(url, async (client) => {
      const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((row) => row.tablename);
      const columns = (await client.query(`SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows;
      const constraints = (await client.query(`SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition, c.convalidated
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' ORDER BY t.relname, c.conname`)).rows;
      const indexes = (await client.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname")).rows;
      const triggers = (await client.query(`SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname`)).rows;
      const counts = {}, records = {};
      for (const table of tables) {
        counts[table] = Number((await client.query(`SELECT COUNT(*)::bigint AS count FROM public.${quote(table)}`)).rows[0].count);
        if (includeRows) records[table] = (await client.query(`SELECT to_jsonb(t) AS record FROM public.${quote(table)} t ORDER BY to_jsonb(t)::text`)).rows.map((row) => row.record);
      }
      return { tables, columns, constraints, indexes, triggers, counts, ...(includeRows ? { records } : {}) };
    });
  }

  async function prepareLegacy(url, failAtSeed = false) {
    return withClient(url, async (client) => {
      await client.query(`
        CREATE TABLE tenants (
          id SERIAL PRIMARY KEY, name TEXT, slug TEXT UNIQUE,
          subscriptionPlan TEXT DEFAULT 'local', subscriptionStatus TEXT DEFAULT 'active',
          billingEmail TEXT, status TEXT DEFAULT 'Active', createdAt TEXT, updatedAt TEXT
        );
        CREATE TABLE students (
          id SERIAL PRIMARY KEY, tenant_id INTEGER REFERENCES tenants(id), name TEXT,
          grade TEXT, batch TEXT, attendance TEXT, data TEXT, custom_note TEXT
        );
        CREATE INDEX fixture_student_name ON students(name);
        CREATE TABLE migration_fixture_counters (id INTEGER PRIMARY KEY, tenant_id INTEGER, counter INTEGER NOT NULL);
        INSERT INTO tenants (id, name, slug, createdAt, updatedAt) VALUES
          (11, 'Synthetic Alpha Institute', 'fixture-alpha', '2025-01-01', '2025-01-01'),
          (22, 'Synthetic Beta Institute', 'fixture-beta', '2025-02-01', '2025-02-01');
        INSERT INTO students (id, tenant_id, name, grade, batch, attendance, data, custom_note) VALUES
          (101, 11, 'Synthetic Alpha Learner', '10', 'Old Alpha Batch', '91', '{"fixture":"alpha"}', 'Preserve alpha custom field'),
          (202, 22, 'Synthetic Beta Learner', '12', 'Old Beta Batch', '88', '{"fixture":"beta"}', 'Preserve beta custom field');
        INSERT INTO migration_fixture_counters VALUES (1, 11, 7), (2, 22, 19);
        SELECT setval(pg_get_serial_sequence('tenants', 'id'), 22, true);
        SELECT setval(pg_get_serial_sequence('students', 'id'), 202, true);
        CREATE FUNCTION fixture_tenant_update_counter() RETURNS trigger LANGUAGE plpgsql AS $body$
          BEGIN UPDATE migration_fixture_counters SET counter = counter + 1 WHERE tenant_id = NEW.id; RETURN NEW; END
        $body$;
        CREATE TRIGGER fixture_tenant_update_counter AFTER UPDATE ON tenants
          FOR EACH ROW EXECUTE FUNCTION fixture_tenant_update_counter();
      `);
      if (failAtSeed) {
        await client.query(`
          CREATE TABLE ontology_entities (
            id SERIAL PRIMARY KEY, name TEXT UNIQUE, displayName TEXT, description TEXT,
            metadata TEXT, createdAt TEXT
          );
          CREATE FUNCTION fixture_reject_late_seed() RETURNS trigger LANGUAGE plpgsql AS $body$
            BEGIN RAISE EXCEPTION 'MIGRATION_TEST_EXISTING_FAILURE'; END
          $body$;
          CREATE TRIGGER fixture_reject_late_seed BEFORE INSERT ON ontology_entities
            FOR EACH ROW EXECUTE FUNCTION fixture_reject_late_seed();
        `);
      }
    });
  }

  test.before(async () => { await administrator.connect(); });
  test.after(async () => {
    for (const child of activeChildren) child.kill();
    for (const name of ownedDatabases) {
      assert.match(name, new RegExp(`^${databasePrefix}[a-f0-9]{16}$`));
      await administrator.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
    }
    await administrator.end();
  });

  test('fresh PostgreSQL initialization and repeated startup retain table, row-count, index and constraint snapshots', { timeout: 120000 }, async () => {
    await withDatabase(async (url) => {
      await migrate(url);
      const first = await snapshot(url, true);
      for (const table of ['tenants', 'users', 'students', 'ai_lab_students', 'student_guardians', 'audit_logs', 'email_outbox']) {
        assert.ok(first.tables.includes(table), `missing initialized table ${table}`);
      }
      assert.ok(first.tables.length > 100, 'the complete application schema must initialize');
      assert.ok(first.constraints.every((constraint) => constraint.convalidated));
      const adminBefore = await withClient(url, async (client) => {
        const admin = (await client.query(`SELECT name, email, password, password_hash, created_at, updated_at,
          email_verified_at, is_active FROM users WHERE username = 'migration-fixture-admin'`)).rows[0];
        assert.equal(admin.name, 'migration-fixture-admin');
        assert.equal(admin.email, 'migration-fixture-admin');
        assert.equal(admin.password, admin.password_hash);
        assert.match(admin.password_hash, /^\$2[aby]\$/);
        assert.ok(admin.created_at && admin.updated_at, 'a new seeded user must have explicit lifecycle metadata');
        assert.equal(admin.is_active, 1);
        assert.equal(admin.email_verified_at, null, 'seeding must not claim owner/user email possession');
        const tenant = (await client.query("SELECT id FROM tenants WHERE slug = 'miraku'")).rows[0];
        assert.equal(Number((await client.query('SELECT COUNT(*) AS count FROM branches WHERE tenant_id = $1 AND is_default = 1 AND deleted_at IS NULL', [tenant.id])).rows[0].count), 1);
        assert.equal(Number((await client.query('SELECT COUNT(*) AS count FROM tenant_fee_settings WHERE tenant_id = $1', [tenant.id])).rows[0].count), 1,
          'tenant-specific fee defaults must exist on the first startup');
        assert.ok(Number((await client.query('SELECT COUNT(*) AS count FROM teacher_score_configs WHERE tenant_id = $1', [tenant.id])).rows[0].count) > 0,
          'tenant-specific teacher defaults must exist on the first startup');
        const templates = (await client.query('SELECT tenant_id, createdBy AS creator FROM message_templates')).rows;
        assert.ok(templates.length > 0, 'message templates must be seeded on the first startup');
        for (const template of templates) {
          assert.equal(String(template.tenant_id), String(tenant.id));
          assert.ok(template.creator, 'seeded message templates must have creator metadata');
        }
        return admin;
      });
      await migrate(url);
      assert.deepEqual(await snapshot(url, true), first);
      const adminAfter = await withClient(url, async (client) => (await client.query(`SELECT name, email, password, password_hash, created_at, updated_at,
        email_verified_at, is_active FROM users WHERE username = 'migration-fixture-admin'`)).rows[0]);
      assert.deepEqual(adminAfter, adminBefore);
      assert.equal(adminAfter.email_verified_at, null, 'repeated startup must not silently verify a newly seeded account');
    });
  });

  test('two simultaneous PostgreSQL startup processes wait on the migration advisory lock and both complete', { timeout: 120000 }, async () => {
    await withDatabase(async (url, name) => {
      const first = startMigration(url, { holdLockMs: 2500 });
      assert.equal(await first.ready, true, 'first startup must acquire the migration lock');
      const second = startMigration(url);
      let observedWaiting = false;
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const waiting = await administrator.query(`SELECT COUNT(*) AS count FROM pg_stat_activity
          WHERE datname = $1 AND wait_event_type = 'Lock' AND LOWER(wait_event) = 'advisory'`, [name]);
        if (Number(waiting.rows[0].count) > 0) { observedWaiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const outcomes = await Promise.all([first.result, second.result]);
      assert.equal(observedWaiting, true, 'second startup must wait rather than race schema creation');
      for (const outcome of outcomes) assert.equal(outcome.code, 0, outcome.errors);
      const afterConcurrent = await snapshot(url);
      await migrate(url);
      assert.deepEqual(await snapshot(url), afterConcurrent);
    });
  });

  test('legacy PostgreSQL upgrade preserves two tenants, student IDs, custom records and sequence allocation', { timeout: 120000 }, async () => {
    await withDatabase(async (url) => {
      await prepareLegacy(url);
      const before = await snapshot(url, true);
      await migrate(url);
      await withClient(url, async (client) => {
        const rows = (await client.query('SELECT id, tenant_id, name, grade, batch, attendance, data, custom_note FROM students ORDER BY id')).rows;
        assert.deepEqual(rows, before.records.students);
        assert.deepEqual((await client.query('SELECT id, name, slug FROM tenants WHERE id IN (11, 22) ORDER BY id')).rows,
          before.records.tenants.map(({ id, name, slug }) => ({ id, name, slug })));
        const counters = (await client.query('SELECT id, tenant_id, counter FROM migration_fixture_counters ORDER BY id')).rows;
        assert.deepEqual(counters.map(({ id, tenant_id }) => ({ id, tenant_id })), [{ id: 1, tenant_id: 11 }, { id: 2, tenant_id: 22 }]);
        assert.ok(counters[0].counter > 7 && counters[1].counter > 19, 'legacy data backfills must actually run');
        // Probe the preserved sequence without adding a new unprofiled legacy
        // student that the following startup would correctly backfill.
        await client.query('BEGIN');
        try {
          const next = await client.query("INSERT INTO students (tenant_id, name) VALUES (11, 'Synthetic Next Learner') RETURNING id");
          assert.ok(next.rows[0].id > 202, 'existing identity allocation must not reset');
        } finally { await client.query('ROLLBACK'); }
        assert.ok((await client.query("SELECT indexname FROM pg_indexes WHERE indexname = 'fixture_student_name'")).rowCount === 1);
      });
      const upgraded = await snapshot(url, true);
      await migrate(url);
      assert.deepEqual(await snapshot(url, true), upgraded);
    });
  });

  test('late seed failure rolls back all existing-database DDL and backfills, then a clean retry succeeds', { timeout: 120000 }, async () => {
    await withDatabase(async (url) => {
      await prepareLegacy(url, true);
      const before = await snapshot(url, true);
      const failure = await migrate(url, { expectedCode: 2 });
      assert.match(failure.errors, /MIGRATION_TEST_EXISTING_FAILURE/);
      assert.deepEqual(await snapshot(url, true), before, 'failed upgrade must leave the entire pre-upgrade fixture unchanged');
      await withClient(url, (client) => client.query('DROP TRIGGER fixture_reject_late_seed ON ontology_entities; DROP FUNCTION fixture_reject_late_seed()'));
      await migrate(url);
      assert.equal((await snapshot(url)).counts.students, 2);
    });
  });

  test('injected fresh-database migration failure leaves no partial tables and releases its lock for retry', { timeout: 120000 }, async () => {
    await withDatabase(async (url) => {
      const failure = await migrate(url, { failAfter: 20, expectedCode: 2 });
      assert.match(failure.errors, /MIGRATION_TEST_INJECTED_FAILURE/);
      const failed = await snapshot(url);
      assert.deepEqual(failed.tables, []);
      assert.deepEqual(failed.columns, []);
      assert.deepEqual(failed.indexes, []);
      assert.deepEqual(failed.constraints, []);
      await migrate(url);
      assert.ok((await snapshot(url)).tables.includes('students'));
    });
  });
}
