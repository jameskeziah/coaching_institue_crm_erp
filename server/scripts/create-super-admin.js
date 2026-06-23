const { migrateSuperAdmin, close } = require('../db');
const { run, get } = require('../services/db.service');
const { generateId } = require('../services/token.service');
const { hashPassword, validatePasswordStrength } = require('../services/password.service');

async function main() {
  await migrateSuperAdmin();

  const name = process.env.SUPER_ADMIN_NAME;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are required');
    process.exitCode = 1;
    return;
  }

  validatePasswordStrength(password);

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await get(
    `SELECT id
     FROM platform_admins
     WHERE LOWER(email) = ?
     AND deleted_at IS NULL`,
    [normalizedEmail]
  );

  if (existing) {
    console.log('Super admin already exists');
    return;
  }

  const passwordHash = await hashPassword(password);

  await run(
    `INSERT INTO platform_admins
      (
        id,
        name,
        email,
        password_hash,
        role,
        is_active,
        created_at,
        updated_at,
        deleted_at
      )
     VALUES (?, ?, ?, ?, 'super_admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [
      generateId('pad'),
      name,
      normalizedEmail,
      passwordHash,
    ]
  );

  console.log('Super admin created successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
