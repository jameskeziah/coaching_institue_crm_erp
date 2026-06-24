const crypto = require('crypto');

const { run } = require('./db.service');

async function createAuditLog({
  tenantId,
  branchId = null,
  actorUserId,
  action,
  entityType,
  entityId,
  oldValues = {},
  newValues = {},
  metadata = {},
}) {
  await run(
    `INSERT INTO audit_logs
      (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
       old_values, new_values, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      crypto.randomUUID(),
      tenantId,
      branchId,
      actorUserId || null,
      action,
      entityType,
      String(entityId),
      JSON.stringify(oldValues || {}),
      JSON.stringify(newValues || {}),
      JSON.stringify(metadata || {}),
    ]
  );
}

module.exports = {
  createAuditLog,
};
