const { ROLE_GROUPS } = require('../config/roles');

const userRoles = ROLE_GROUPS.ALL_AUTHENTICATED;

function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length) {
    return `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`;
  }

  return null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tenant_id: user.tenant_id || user.tenantId || null,
    tenantName: user.tenantName || null,
    subscriptionPlan: user.subscriptionPlan || null,
    subscriptionStatus: user.subscriptionStatus || null,
  };
}

function currentTenantId(req) {
  return req.user?.tenantId || req.user?.tenant_id || null;
}

module.exports = {
  userRoles,
  requireFields,
  publicUser,
  currentTenantId,
};
