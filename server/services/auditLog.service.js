const crypto = require('crypto');

const { run } = require('./db.service');

async function createAuditLog({
  tenantId,
  actorUserId,
  action,
  entityType,
  entityId,
  metadata = {},
}) {
  await run(
    `INSERT INTO audit_logs
      (id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      crypto.randomUUID(),
      tenantId,
      actorUserId || null,
      action,
      entityType,
      String(entityId),
      JSON.stringify(metadata || {}),
    ]
  );
}

module.exports = {
  createAuditLog,
};
