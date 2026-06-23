const { requireActiveTenant } = require('./tenant-status');

function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: 'Unauthorized',
    });
  }

  const tenantId = req.user.tenantId || req.user.tenant_id;
  if (!tenantId) {
    return res.status(403).json({
      message: 'Forbidden: tenant context missing',
    });
  }

  req.user.tenantId = tenantId;
  req.user.tenant_id = tenantId;

  return requireActiveTenant(req, res, next);
}

module.exports = {
  requireTenant,
};
