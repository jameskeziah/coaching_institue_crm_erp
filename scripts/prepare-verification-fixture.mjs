import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verificationRoot = path.join(workspaceRoot, 'storage', 'verification');
const databaseUrl = String(process.env.DATABASE_URL || '');
const databasePath = path.resolve(databaseUrl);
const relativeDatabasePath = path.relative(verificationRoot, databasePath);

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Verification fixture refused: NODE_ENV must be test.');
}
if (!databaseUrl || /^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('Verification fixture refused: DATABASE_URL must be an isolated SQLite path.');
}
if (relativeDatabasePath.startsWith('..') || path.isAbsolute(relativeDatabasePath)) {
  throw new Error(`Verification fixture refused: database must be inside ${verificationRoot}.`);
}
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  throw new Error('Verification fixture refused: ADMIN_USERNAME and ADMIN_PASSWORD are required.');
}

const require = createRequire(import.meta.url);
const { close, get, migrate, run } = require('../server/db');

try {
  await migrate();
  const admin = await get(
    `SELECT id, role, tenant_id
     FROM users
     WHERE username = ?
       AND deleted_at IS NULL`,
    [process.env.ADMIN_USERNAME],
  );

  if (!admin || admin.role !== 'admin' || !admin.tenant_id) {
    throw new Error('Verification fixture refused: the isolated seed admin was not created as expected.');
  }

  const result = await run(
    `UPDATE users
     SET email = ?, email_verified_at = CURRENT_TIMESTAMP, is_active = 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND username = ?
       AND role = 'admin'
       AND tenant_id = ?`,
    ['verify-admin@example.com', admin.id, process.env.ADMIN_USERNAME, admin.tenant_id],
  );

  if (Number(result.changes || 0) !== 1) {
    throw new Error('Verification fixture refused: exactly one isolated admin must be activated.');
  }

  console.log(`Prepared verified admin fixture in isolated database: ${databasePath}`);
} finally {
  await close();
}
