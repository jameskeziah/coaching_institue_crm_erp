import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const requireFromServer = createRequire(new URL('../server/package.json', import.meta.url));
const sqlite3 = requireFromServer('sqlite3').verbose();
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(workspaceRoot, '.env'), quiet: true });

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) continue;
    options[value.slice(2)] = rest[index + 1];
    index += 1;
  }
  return { command, options };
}

function openDatabase(databasePath, mode = sqlite3.OPEN_READONLY) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, mode, (error) => (error ? reject(error) : resolve(database)));
  });
}

function closeDatabase(database) {
  return new Promise((resolve, reject) => database.close((error) => (error ? reject(error) : resolve())));
}

function all(database, sql, params = []) {
  return new Promise((resolve, reject) => database.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))));
}

function run(database, sql, params = []) {
  return new Promise((resolve, reject) => database.run(sql, params, (error) => (error ? reject(error) : resolve())));
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function resolveSqliteSource(databaseOption) {
  const configured = databaseOption || process.env.DATABASE_URL || './server/data.sqlite';
  if (/^postgres(?:ql)?:\/\//i.test(configured)) {
    throw new Error('Configured DATABASE_URL is Postgres. Use the upcoming pg_dump adapter; SQLite backup refused.');
  }
  const resolved = path.resolve(workspaceRoot, configured);
  if (!fs.existsSync(resolved)) throw new Error(`SQLite database not found: ${resolved}`);
  return resolved;
}

async function inspectDatabase(databasePath) {
  const database = await openDatabase(databasePath);
  try {
    const integrity = await all(database, 'PRAGMA integrity_check');
    const foreignKeyViolations = await all(database, 'PRAGMA foreign_key_check');
    const tables = await all(database, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tableNames = new Set(tables.map((row) => row.name));
    const count = async (table) => tableNames.has(table)
      ? Number((await all(database, `SELECT COUNT(*) AS count FROM ${table}`))[0]?.count || 0)
      : null;
    return {
      integrity: integrity.map((row) => Object.values(row)[0]),
      foreignKeyViolationCount: foreignKeyViolations.length,
      tableCount: tables.length,
      counts: {
        tenants: await count('tenants'),
        users: await count('users'),
        students: await count('students'),
        feePlans: await count('fee_plans'),
        auditLogs: await count('audit_logs'),
      },
    };
  } finally {
    await closeDatabase(database);
  }
}

async function createBackup({ database, output }) {
  const sourcePath = resolveSqliteSource(database);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(workspaceRoot, output || path.join('storage', 'backups', `sqlite-${timestamp}.sqlite`));
  if (path.resolve(sourcePath) === path.resolve(backupPath)) throw new Error('Backup destination must differ from the source database.');
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  if (fs.existsSync(backupPath)) throw new Error(`Backup destination already exists: ${backupPath}`);

  const source = await openDatabase(sourcePath, sqlite3.OPEN_READWRITE);
  try {
    const escapedDestination = backupPath.replace(/'/g, "''");
    await run(source, `VACUUM INTO '${escapedDestination}'`);
  } finally {
    await closeDatabase(source);
  }

  const inspection = await inspectDatabase(backupPath);
  if (inspection.integrity.some((value) => String(value).toLowerCase() !== 'ok')) throw new Error('Backup failed SQLite integrity_check.');
  const manifest = {
    formatVersion: 1,
    engine: 'sqlite',
    createdAt: new Date().toISOString(),
    sourceFileName: path.basename(sourcePath),
    backupFileName: path.basename(backupPath),
    bytes: fs.statSync(backupPath).size,
    sha256: sha256(backupPath),
    inspection,
  };
  const manifestPath = `${backupPath}.manifest.json`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { backupPath, manifestPath, manifest };
}

async function verifyRestore({ backup }) {
  if (!backup) throw new Error('--backup is required for restore verification.');
  const backupPath = path.resolve(workspaceRoot, backup);
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);
  const manifestPath = `${backupPath}.manifest.json`;
  if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actualHash = sha256(backupPath);
  if (actualHash !== manifest.sha256) throw new Error('Backup checksum does not match its manifest.');

  const restoreDirectory = path.join(workspaceRoot, 'storage', 'restore-verification');
  fs.mkdirSync(restoreDirectory, { recursive: true });
  const restoredPath = path.join(restoreDirectory, `restored-${crypto.randomUUID()}.sqlite`);
  fs.copyFileSync(backupPath, restoredPath, fs.constants.COPYFILE_EXCL);
  try {
    const inspection = await inspectDatabase(restoredPath);
    if (inspection.integrity.some((value) => String(value).toLowerCase() !== 'ok')) throw new Error('Restored copy failed SQLite integrity_check.');
    if (inspection.foreignKeyViolationCount > 0) throw new Error(`Restored copy has ${inspection.foreignKeyViolationCount} foreign-key violation(s).`);
    if (JSON.stringify(inspection.counts) !== JSON.stringify(manifest.inspection.counts)) throw new Error('Restored copy row counts do not match the backup manifest.');
    return { restoredPath, inspection, sha256: actualHash };
  } finally {
    fs.rmSync(restoredPath, { force: true });
  }
}

async function selfTest() {
  const directory = path.join(workspaceRoot, 'storage', 'data-safety-self-test', crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const sourcePath = path.join(directory, 'source.sqlite');
  const source = await openDatabase(sourcePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  try {
    await run(source, 'PRAGMA foreign_keys = ON');
    await run(source, 'CREATE TABLE tenants (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    await run(source, 'CREATE TABLE users (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), username TEXT NOT NULL)');
    await run(source, "INSERT INTO tenants (id, name) VALUES (1, 'Pilot Institute')");
    await run(source, "INSERT INTO users (id, tenant_id, username) VALUES (1, 1, 'owner')");
  } finally {
    await closeDatabase(source);
  }
  try {
    const backupResult = await createBackup({ database: sourcePath, output: path.join(directory, 'backup.sqlite') });
    const restoreResult = await verifyRestore({ backup: backupResult.backupPath });
    if (restoreResult.inspection.counts.tenants !== 1 || restoreResult.inspection.counts.users !== 1) throw new Error('Self-test counts are incorrect.');
    return { backup: backupResult.manifest, restore: restoreResult.inspection };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  if (command === 'backup') {
    const result = await createBackup(options);
    console.log(`SQLite backup created: ${result.backupPath}`);
    console.log(`Manifest created: ${result.manifestPath}`);
    console.log(`SHA-256: ${result.manifest.sha256}`);
  } else if (command === 'verify-restore') {
    const result = await verifyRestore(options);
    console.log('SQLite restore verification passed.');
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Tables: ${result.inspection.tableCount}; tenants: ${result.inspection.counts.tenants ?? 'n/a'}; users: ${result.inspection.counts.users ?? 'n/a'}`);
  } else if (command === 'self-test') {
    await selfTest();
    console.log('SQLite backup and isolated restore self-test passed.');
  } else {
    throw new Error('Usage: node scripts/sqlite-data-safety.mjs <backup|verify-restore|self-test> [--database path] [--output path] [--backup path]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
