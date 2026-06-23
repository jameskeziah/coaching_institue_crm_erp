const { run } = require('./db.service');
const { generateId } = require('./token.service');

async function logPlatformAction(req, action, options = {}) {
  await run(
    `INSERT INTO platform_audit_logs
      (
        id,
        platform_admin_id,
        action,
        target_type,
        target_id,
        metadata,
        ip_address,
        user_agent,
        created_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      generateId('pal'),
      req.platformAdmin?.id || null,
      action,
      options.targetType || null,
      options.targetId || null,
      JSON.stringify(options.metadata || {}),
      req.ip || null,
      req.headers['user-agent'] || null,
    ]
  );
}

module.exports = {
  logPlatformAction,
};
