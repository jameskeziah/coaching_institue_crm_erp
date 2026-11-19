const { get } = require('../services/db.service');
const ACCESS_ENABLED_STATUSES = new Set(['active', 'trialing']);

function isAccessEnabled(value) {
  return ACCESS_ENABLED_STATUSES.has(String(value || '').trim().toLowerCase());
}

function hasSubscriptionAccess(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

async function requireActiveTenant(req, res, next) {
  try {
    if (!req.user?.tenantId) {
      return res.status(403).json({
        message: 'Tenant context missing',
      });
    }

    const tenant = await get(
      `SELECT tenants.status,
              EXISTS (
                SELECT 1
                FROM tenant_subscriptions
                WHERE tenant_subscriptions.tenant_id = tenants.id
                  AND tenant_subscriptions.deleted_at IS NULL
                  AND LOWER(tenant_subscriptions.status) IN ('active', 'trialing')
              ) AS subscription_access_enabled
       FROM tenants
       WHERE tenants.id = ?
       AND tenants.deleted_at IS NULL`,
      [req.user.tenantId]
    );

    if (!tenant) {
      return res.status(403).json({
        message: 'Tenant not found',
      });
    }

    if (!isAccessEnabled(tenant.status) || !hasSubscriptionAccess(tenant.subscription_access_enabled || tenant.subscriptionAccessEnabled)) {
      return res.status(403).json({
        message: 'Tenant access is disabled. Please contact support.',
        code: 'TENANT_ACCESS_DISABLED',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to verify tenant status',
    });
  }
}

module.exports = {
  requireActiveTenant,
};
