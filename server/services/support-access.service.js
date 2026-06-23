const { run, get, all } = require('./db.service');
const { generateId, getFutureDate } = require('./token.service');

async function createSupportAccessSession({
  platformAdminId,
  tenantId,
  reason,
  accessType = 'read_only',
}) {
  const tenant = await get(
    `SELECT id
     FROM tenants
     WHERE id = ?
     AND deleted_at IS NULL`,
    [tenantId]
  );

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const sessionId = generateId('sas');
  const expiresAt = getFutureDate({ hours: 1 });

  await run(
    `INSERT INTO support_access_sessions
      (
        id,
        platform_admin_id,
        tenant_id,
        reason,
        access_type,
        expires_at,
        created_at,
        updated_at
      )
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      sessionId,
      platformAdminId,
      tenantId,
      reason,
      accessType,
      expiresAt,
    ]
  );

  return {
    sessionId,
    tenantId,
    accessType,
    expiresAt,
  };
}

async function listSupportAccessSessions() {
  return all(
    `SELECT
       s.id,
       s.platform_admin_id,
       a.name as platform_admin_name,
       s.tenant_id,
       t.name as tenant_name,
       s.reason,
       s.access_type,
       s.expires_at,
       s.revoked_at,
       s.created_at
     FROM support_access_sessions s
     JOIN platform_admins a
       ON a.id = s.platform_admin_id
     JOIN tenants t
       ON t.id = s.tenant_id
     ORDER BY s.created_at DESC
     LIMIT 100`
  );
}

async function revokeSupportAccessSession(sessionId) {
  await run(
    `UPDATE support_access_sessions
     SET revoked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     AND revoked_at IS NULL`,
    [sessionId]
  );
}

module.exports = {
  createSupportAccessSession,
  listSupportAccessSessions,
  revokeSupportAccessSession,
};
