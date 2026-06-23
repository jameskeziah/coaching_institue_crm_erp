const { get } = require('../services/db.service');

async function requireActiveTenant(req, res, next) {
  try {
    if (!req.user?.tenantId) {
      return res.status(403).json({
        message: 'Tenant context missing',
      });
    }

    const tenant = await get(
      `SELECT status
       FROM tenants
       WHERE id = ?
       AND deleted_at IS NULL`,
      [req.user.tenantId]
    );

    if (!tenant) {
      return res.status(403).json({
        message: 'Tenant not found',
      });
    }

    if (!['trialing', 'active', 'Active'].includes(tenant.status)) {
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
