import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromServer = createRequire(new URL('../server/package.json', import.meta.url));
const { Client } = requireFromServer('pg');
dotenv.config({ path: path.join(workspaceRoot, '.env'), quiet: true });

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function ageHours(value) {
  return (Date.now() - new Date(value).getTime()) / 3600000;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function newestManifest() {
  const directory = path.join(workspaceRoot, 'storage', 'backups');
  if (!fs.existsSync(directory)) return null;
  const manifests = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.dump.manifest.json'))
    .map((name) => ({ path: path.join(directory, name), modified: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((left, right) => right.modified - left.modified);
  return manifests[0]?.path || null;
}

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

const databaseUrl = process.env.DATABASE_URL;
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl || '')) throw new Error('Pilot readiness requires the configured Postgres production path.');
const requestedTenantId = option('tenant-id');
const maxBackupAgeHours = Number(option('max-backup-age-hours') || 24);
const maxRestoreAgeHours = Number(option('max-restore-age-hours') || 168);
const maxVerificationAgeHours = Number(option('max-verification-age-hours') || 24);
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed: Boolean(passed), detail });

const client = new Client({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
await client.connect();
let tenant;
try {
  if (requestedTenantId) {
    tenant = (await client.query('SELECT id, name, status FROM tenants WHERE id = $1 AND deleted_at IS NULL', [requestedTenantId])).rows[0];
  } else {
    const tenants = (await client.query('SELECT id, name, status FROM tenants WHERE deleted_at IS NULL ORDER BY id')).rows;
    if (tenants.length !== 1) throw new Error(`Pass --tenant-id because ${tenants.length} non-deleted tenants exist.`);
    [tenant] = tenants;
  }
  add('tenant_exists', Boolean(tenant), tenant ? `Tenant ${tenant.id} selected.` : 'Tenant was not found.');
  if (tenant) {
    const status = String(tenant.status || '').toLowerCase();
    add('tenant_lifecycle', ['trial', 'active'].includes(status), `Tenant status is ${status || 'missing'}.`);
    const owner = (await client.query(
      `SELECT id, email_verified_at FROM users WHERE tenant_id = $1 AND role = 'owner' AND deleted_at IS NULL AND is_active = 1 ORDER BY id LIMIT 1`,
      [tenant.id]
    )).rows[0];
    add('verified_owner', Boolean(owner?.email_verified_at), owner?.email_verified_at ? 'Active owner email is verified.' : 'No active verified owner exists.');
    const auditCount = Number((await client.query('SELECT COUNT(*)::bigint AS count FROM audit_logs WHERE tenant_id = $1', [tenant.id])).rows[0].count);
    add('audit_activity', auditCount > 0, `${auditCount} tenant audit records exist.`);
  }
  const requiredTables = ['data_import_batches', 'data_import_rows', 'students', 'student_guardians', 'student_fee_plans', 'student_fee_installments', 'audit_logs'];
  const missingTables = [];
  for (const table of requiredTables) {
    const exists = (await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`])).rows[0].table_name;
    if (!exists) missingTables.push(table);
  }
  add('import_schema', missingTables.length === 0, missingTables.length ? `Missing tables: ${missingTables.join(', ')}.` : 'Required import and audit tables exist.');
  const invalidConstraints = Number((await client.query("SELECT COUNT(*)::bigint AS count FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated")).rows[0].count);
  add('validated_constraints', invalidConstraints === 0, `${invalidConstraints} unvalidated constraints.`);
} finally {
  await client.end();
}

const manifestPath = newestManifest();
const manifest = manifestPath ? readJson(manifestPath) : null;
const backupPath = manifestPath && manifest ? path.join(path.dirname(manifestPath), manifest.backupFileName) : null;
const backupFresh = Boolean(manifest?.createdAt) && ageHours(manifest.createdAt) <= maxBackupAgeHours;
const backupValid = Boolean(backupPath && fs.existsSync(backupPath) && sha256(backupPath) === manifest.sha256);
add('recent_backup', backupFresh && backupValid, manifest ? `Latest backup is ${ageHours(manifest.createdAt).toFixed(1)} hours old and checksum ${backupValid ? 'matches' : 'does not match'}.` : 'No Postgres backup manifest exists.');

const readinessDirectory = path.join(workspaceRoot, 'storage', 'readiness');
const restoreProof = readJson(path.join(readinessDirectory, 'latest-postgres-restore-proof.json'));
const restoreFresh = Boolean(restoreProof?.verifiedAt) && ageHours(restoreProof.verifiedAt) <= maxRestoreAgeHours;
const restoreMatches = Boolean(restoreProof?.sha256 && manifest?.sha256 && restoreProof.sha256 === manifest.sha256);
add('tested_restore', restoreFresh && restoreMatches, restoreProof ? `Restore proof is ${ageHours(restoreProof.verifiedAt).toFixed(1)} hours old and ${restoreMatches ? 'matches' : 'does not match'} the latest backup.` : 'No restore proof exists.');

const verificationProof = readJson(path.join(readinessDirectory, 'latest-verification-proof.json'));
const verificationFresh = Boolean(verificationProof?.verifiedAt) && ageHours(verificationProof.verifiedAt) <= maxVerificationAgeHours;
const requiredStages = ['build', 'check:legacy', 'check:tenant', 'test:data-safety', 'test:mail', 'test:authz', 'test:smoke', 'test:ui'];
const verificationComplete = verificationProof?.status === 'PASSED' && requiredStages.every((stage) => verificationProof.stages?.includes(stage));
add('recent_full_verification', verificationFresh && verificationComplete, verificationProof ? `Full verification proof is ${ageHours(verificationProof.verifiedAt).toFixed(1)} hours old.` : 'No full verification proof exists.');

const ready = checks.every((check) => check.passed);
const report = { formatVersion: 1, generatedAt: new Date().toISOString(), tenant: tenant ? { id: tenant.id, name: tenant.name, status: tenant.status } : null, ready, checks };
const reportPath = path.join(readinessDirectory, `pilot-readiness-${tenant?.id || 'unknown'}.json`);
fs.mkdirSync(readinessDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.key}: ${check.detail}`);
console.log(`Pilot readiness: ${ready ? 'READY' : 'NOT READY'}`);
console.log(`Report created: ${reportPath}`);
if (!ready) process.exitCode = 1;
