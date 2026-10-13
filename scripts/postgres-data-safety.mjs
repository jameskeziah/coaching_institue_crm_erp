import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromServer = createRequire(new URL('../server/package.json', import.meta.url));
const { Client } = requireFromServer('pg');
dotenv.config({ path: path.join(workspaceRoot, '.env'), quiet: true });

const criticalTables = ['tenants', 'users', 'students', 'fee_plans', 'audit_logs'];

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) continue;
    const key = rest[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = rest[index + 1];
    index += 1;
  }
  return { command, options };
}

function postgresUrl(value, label) {
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) throw new Error(`${label} must be a Postgres connection URL.`);
  const parsed = new URL(value);
  if (!parsed.hostname || !parsed.pathname.slice(1)) throw new Error(`${label} must include a host and database name.`);
  return parsed;
}

function databaseIdentity(parsed) {
  return `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}/${decodeURIComponent(parsed.pathname.slice(1)).toLowerCase()}`;
}

function targetUrlForDatabase(source, databaseName) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(databaseName || '')) {
    throw new Error('--target-database must be 3-63 lowercase letters, numbers, or underscores, starting with a letter.');
  }
  const target = new URL(source.toString());
  target.pathname = `/${databaseName}`;
  return target.toString();
}

function safeDescriptor(parsed) {
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username || ''),
  };
}

function commandEnvironment(parsed) {
  return {
    ...process.env,
    PGPASSWORD: decodeURIComponent(parsed.password || ''),
    PGSSLMODE: parsed.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer',
  };
}

function connectionArgs(parsed) {
  const descriptor = safeDescriptor(parsed);
  return ['--host', descriptor.host, '--port', descriptor.port, '--username', descriptor.user, '--dbname', descriptor.database];
}

function runPostgresCommand(command, args, parsed) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: commandEnvironment(parsed),
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function inspectDatabase(connectionUrl) {
  const client = new Client({ connectionString: connectionUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const database = (await client.query('SELECT current_database() AS database')).rows[0].database;
    const counts = {};
    for (const table of criticalTables) {
      const exists = (await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`])).rows[0].table_name;
      counts[table] = exists ? Number((await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`)).rows[0].count) : null;
    }
    const invalidConstraints = Number((await client.query("SELECT COUNT(*)::bigint AS count FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated")).rows[0].count);
    return { database, counts, invalidConstraints };
  } finally {
    await client.end();
  }
}

async function provisionIsolatedTarget({ databaseUrl, targetDatabase }) {
  const sourceUrl = databaseUrl || process.env.DATABASE_URL;
  const source = postgresUrl(sourceUrl, 'DATABASE_URL');
  const targetConnectionUrl = targetUrlForDatabase(source, targetDatabase);
  const target = postgresUrl(targetConnectionUrl, 'target database');
  if (databaseIdentity(source) === databaseIdentity(target)) throw new Error('Target database must not be the source database.');

  const maintenance = new URL(source.toString());
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString(), ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const exists = (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase])).rowCount > 0;
    if (exists) throw new Error(`Refusing to reuse existing database ${targetDatabase}. Choose a new disposable target name.`);
    await client.query(`CREATE DATABASE "${targetDatabase}"`);
  } finally {
    await client.end();
  }
  return targetConnectionUrl;
}

async function createBackup({ databaseUrl, output }) {
  const sourceUrl = databaseUrl || process.env.DATABASE_URL;
  const source = postgresUrl(sourceUrl, 'DATABASE_URL');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(workspaceRoot, output || path.join('storage', 'backups', `postgres-${timestamp}.dump`));
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  if (fs.existsSync(backupPath)) throw new Error(`Backup destination already exists: ${backupPath}`);

  runPostgresCommand('pg_dump', [
    ...connectionArgs(source),
    '--format', 'custom',
    '--compress', '9',
    '--no-owner',
    '--no-privileges',
    '--file', backupPath,
  ], source);

  const inspection = await inspectDatabase(sourceUrl);
  const manifest = {
    formatVersion: 1,
    engine: 'postgres',
    createdAt: new Date().toISOString(),
    source: safeDescriptor(source),
    backupFileName: path.basename(backupPath),
    bytes: fs.statSync(backupPath).size,
    sha256: sha256(backupPath),
    inspection,
  };
  const manifestPath = `${backupPath}.manifest.json`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { backupPath, manifestPath, manifest };
}

async function verifyRestore({ backup, targetUrl, targetDatabase, confirmIsolatedTarget }) {
  if (!backup) throw new Error('--backup is required.');
  const source = postgresUrl(process.env.DATABASE_URL, 'DATABASE_URL');
  const targetConnectionUrl = targetUrl
    || (targetDatabase ? targetUrlForDatabase(source, targetDatabase) : null)
    || process.env.RESTORE_DATABASE_URL;
  const target = postgresUrl(targetConnectionUrl, 'RESTORE_DATABASE_URL');
  if (databaseIdentity(source) === databaseIdentity(target)) throw new Error('Restore target must not be the source database.');
  const confirmedTargetDatabase = safeDescriptor(target).database;
  if (confirmIsolatedTarget !== confirmedTargetDatabase) {
    throw new Error(`Refusing restore. Pass --confirm-isolated-target ${confirmedTargetDatabase} to confirm the disposable target database.`);
  }

  const backupPath = path.resolve(workspaceRoot, backup);
  const manifestPath = `${backupPath}.manifest.json`;
  if (!fs.existsSync(backupPath) || !fs.existsSync(manifestPath)) throw new Error('Backup and matching manifest are required.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (sha256(backupPath) !== manifest.sha256) throw new Error('Backup checksum does not match its manifest.');

  runPostgresCommand('pg_restore', [
    ...connectionArgs(target),
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    backupPath,
  ], target);

  const inspection = await inspectDatabase(targetConnectionUrl);
  if (inspection.invalidConstraints > 0) throw new Error(`Restored database has ${inspection.invalidConstraints} unvalidated constraint(s).`);
  if (JSON.stringify(inspection.counts) !== JSON.stringify(manifest.inspection.counts)) throw new Error('Restored critical row counts do not match the backup manifest.');
  const proof = {
    formatVersion: 1,
    engine: 'postgres',
    verifiedAt: new Date().toISOString(),
    backupFileName: path.basename(backupPath),
    backupCreatedAt: manifest.createdAt,
    sha256: manifest.sha256,
    source: manifest.source,
    target: safeDescriptor(target),
    inspection,
  };
  const proofDirectory = path.join(workspaceRoot, 'storage', 'readiness');
  const proofPath = path.join(proofDirectory, 'latest-postgres-restore-proof.json');
  fs.mkdirSync(proofDirectory, { recursive: true });
  const temporaryProofPath = `${proofPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryProofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporaryProofPath, proofPath);
  return { inspection, sha256: manifest.sha256, proofPath };
}

async function provisionAndVerify(options) {
  if (!options.targetDatabase) throw new Error('--target-database is required.');
  if (options.confirmIsolatedTarget !== options.targetDatabase) {
    throw new Error(`Refusing provisioning. Pass --confirm-isolated-target ${options.targetDatabase} to confirm the new disposable target database.`);
  }
  const targetUrl = await provisionIsolatedTarget(options);
  return verifyRestore({
    backup: options.backup,
    targetUrl,
    confirmIsolatedTarget: options.confirmIsolatedTarget,
  });
}

function selfTest() {
  const source = postgresUrl('postgresql://user:secret@localhost:5432/source_db', 'source');
  const target = postgresUrl('postgresql://user:other@localhost:5432/restore_db', 'target');
  if (databaseIdentity(source) === databaseIdentity(target)) throw new Error('Distinct database identities were treated as equal.');
  if (safeDescriptor(source).database !== 'source_db') throw new Error('Safe descriptor failed.');
  if (JSON.stringify(safeDescriptor(source)).includes('secret')) throw new Error('Safe descriptor leaked a password.');
  const parsed = parseArgs(['verify-restore', '--target-url', 'postgresql://localhost/restore', '--confirm-isolated-target', 'restore']);
  if (parsed.options.targetUrl !== 'postgresql://localhost/restore' || parsed.options.confirmIsolatedTarget !== 'restore') {
    throw new Error('Kebab-case CLI options were not normalized.');
  }
  try {
    const same = postgresUrl('postgresql://other:password@LOCALHOST:5432/source_db', 'target');
    if (databaseIdentity(source) !== databaseIdentity(same)) throw new Error('Same database identities were not detected.');
  } catch (error) {
    throw new Error(`Postgres data-safety self-test failed: ${error.message}`);
  }
}

const { command, options } = parseArgs(process.argv.slice(2));
try {
  if (command === 'backup') {
    const result = await createBackup(options);
    console.log(`Postgres backup created: ${result.backupPath}`);
    console.log(`Manifest created: ${result.manifestPath}`);
    console.log(`SHA-256: ${result.manifest.sha256}`);
  } else if (command === 'verify-restore') {
    const result = await verifyRestore(options);
    console.log(`Postgres restore verification passed for ${result.inspection.database}.`);
    console.log(`Restore proof created: ${result.proofPath}`);
    console.log(`SHA-256: ${result.sha256}`);
  } else if (command === 'provision-and-verify') {
    const result = await provisionAndVerify(options);
    console.log(`Postgres isolated restore verification passed for ${result.inspection.database}.`);
    console.log(`Critical counts: ${JSON.stringify(result.inspection.counts)}`);
    console.log(`SHA-256: ${result.sha256}`);
  } else if (command === 'self-test') {
    selfTest();
    console.log('Postgres data-safety guardrail self-test passed.');
  } else {
    throw new Error('Usage: node scripts/postgres-data-safety.mjs <backup|verify-restore|provision-and-verify|self-test> [options]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
