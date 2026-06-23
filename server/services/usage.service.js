const { all } = require('./db.service');

async function getUsageSummary({ tenantId = null, limit = 200 } = {}) {
  const params = [];
  let where = 'u.deleted_at IS NULL';

  if (tenantId) {
    where += ' AND u.tenant_id = ?';
    params.push(tenantId);
  }

  params.push(limit);

  return all(
    `SELECT
       u.id,
       u.tenant_id,
       t.name as tenant_name,
       u.metric_key,
       u.metric_value,
       u.period_start,
       u.period_end,
       u.created_at
     FROM tenant_usage_records u
     JOIN tenants t
       ON t.id = u.tenant_id
     WHERE ${where}
     ORDER BY u.period_start DESC, u.metric_key ASC
     LIMIT ?`,
    params
  );
}

module.exports = {
  getUsageSummary,
};
