const { get, all, run } = require('./db.service');

function rowCount(row) {
  return Number(row?.count || 0);
}

async function getPlatformSummary() {
  const totalInstitutes = await get(
    `SELECT COUNT(*) as count
     FROM tenants
     WHERE deleted_at IS NULL`
  );

  const activeTrials = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status = 'trialing'
     AND deleted_at IS NULL`
  );

  const paidCustomers = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status = 'active'
     AND monthly_amount > 0
     AND deleted_at IS NULL`
  );

  const expiredTrials = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status = 'trial_expired'
     AND deleted_at IS NULL`
  );

  const suspendedTenants = await get(
    `SELECT COUNT(*) as count
     FROM tenants
     WHERE status = 'suspended'
     AND deleted_at IS NULL`
  );

  const monthlyRevenue = await get(
    `SELECT COALESCE(SUM(monthly_amount), 0) as amount
     FROM tenant_subscriptions
     WHERE status = 'active'
     AND deleted_at IS NULL`
  );

  return {
    totalInstitutes: rowCount(totalInstitutes),
    activeTrials: rowCount(activeTrials),
    paidCustomers: rowCount(paidCustomers),
    expiredTrials: rowCount(expiredTrials),
    suspendedTenants: rowCount(suspendedTenants),
    monthlyRecurringRevenue: Number(monthlyRevenue?.amount || 0),
  };
}

async function listInstitutes({ status, search, limit = 50, offset = 0 }) {
  const params = [];
  let where = 't.deleted_at IS NULL';

  if (status) {
    where += ' AND t.status = ?';
    params.push(status);
  }

  if (search) {
    where += ' AND (t.name LIKE ? OR t.slug LIKE ? OR t.contact_email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  params.push(limit, offset);

  return all(
    `SELECT
       t.id,
       t.name,
       t.slug,
       t.status,
       t.plan,
       t.contact_email,
       t.contact_phone,
       t.created_at,
       (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'owner' AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1) AS owner_email,
       (SELECT u.email_verified_at FROM users u WHERE u.tenant_id = t.id AND u.role = 'owner' AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1) AS owner_verified_at,
       (SELECT r.id FROM tenant_owner_recovery_requests r WHERE r.tenant_id = t.id AND r.accepted_at IS NULL AND r.revoked_at IS NULL ORDER BY r.created_at DESC LIMIT 1) AS owner_recovery_request_id,
       (SELECT r.email FROM tenant_owner_recovery_requests r WHERE r.tenant_id = t.id AND r.accepted_at IS NULL AND r.revoked_at IS NULL ORDER BY r.created_at DESC LIMIT 1) AS owner_recovery_email,
       (SELECT r.expires_at FROM tenant_owner_recovery_requests r WHERE r.tenant_id = t.id AND r.accepted_at IS NULL AND r.revoked_at IS NULL ORDER BY r.created_at DESC LIMIT 1) AS owner_recovery_expires_at,
       (SELECT r.delivery_status FROM tenant_owner_recovery_requests r WHERE r.tenant_id = t.id AND r.accepted_at IS NULL AND r.revoked_at IS NULL ORDER BY r.created_at DESC LIMIT 1) AS owner_recovery_delivery_status,
       s.status as subscription_status,
       s.monthly_amount,
       s.trial_ends_at,
       s.current_period_end
     FROM tenants t
     LEFT JOIN tenant_subscriptions s
       ON s.tenant_id = t.id
      AND s.deleted_at IS NULL
     WHERE ${where}
     ORDER BY t.created_at DESC
     LIMIT ?
     OFFSET ?`,
    params
  );
}

async function getInstituteDetail(tenantId) {
  const tenant = await get(
    `SELECT
       t.*,
       s.status as subscription_status,
       s.monthly_amount,
       s.currency,
       s.trial_started_at,
       s.trial_ends_at,
       s.current_period_start,
       s.current_period_end
     FROM tenants t
     LEFT JOIN tenant_subscriptions s
       ON s.tenant_id = t.id
      AND s.deleted_at IS NULL
     WHERE t.id = ?
     AND t.deleted_at IS NULL`,
    [tenantId]
  );

  if (!tenant) return null;

  const users = await all(
    `SELECT id, name, email, role, is_active, email_verified_at, last_login_at, created_at
     FROM users
     WHERE tenant_id = ?
     AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId]
  );

  const branches = await all(
    `SELECT id, name, code, city, is_default, created_at
     FROM branches
     WHERE tenant_id = ?
     AND deleted_at IS NULL
     ORDER BY is_default DESC, created_at ASC`,
    [tenantId]
  );

  const usage = await all(
    `SELECT metric_key, metric_value, period_start, period_end
     FROM tenant_usage_records
     WHERE tenant_id = ?
     AND deleted_at IS NULL
     ORDER BY period_start DESC
     LIMIT 20`,
    [tenantId]
  );

  return {
    tenant,
    users,
    branches,
    usage,
  };
}

async function updateTenantStatus({ tenantId, status }) {
  await run(
    `UPDATE tenants
     SET status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     AND deleted_at IS NULL`,
    [status, tenantId]
  );
}

async function getPlatformAuditLogs({ limit = 100, offset = 0 }) {
  return all(
    `SELECT
       l.id,
       l.platform_admin_id,
       a.name as platform_admin_name,
       l.action,
       l.target_type,
       l.target_id,
       l.metadata,
       l.ip_address,
       l.user_agent,
       l.created_at
     FROM platform_audit_logs l
     LEFT JOIN platform_admins a
       ON a.id = l.platform_admin_id
     ORDER BY l.created_at DESC
     LIMIT ?
     OFFSET ?`,
    [limit, offset]
  );
}

module.exports = {
  getPlatformSummary,
  listInstitutes,
  getInstituteDetail,
  updateTenantStatus,
  getPlatformAuditLogs,
};
