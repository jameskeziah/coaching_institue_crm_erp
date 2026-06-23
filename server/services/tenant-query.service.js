function getTenantId(req) {
  const tenantId = req.user?.tenantId || req.user?.tenant_id;
  if (!tenantId) {
    throw new Error('Tenant context missing');
  }

  return tenantId;
}

function getUserId(req) {
  if (!req.user?.id) {
    throw new Error('User context missing');
  }

  return req.user.id;
}

function addCreateMetadata(req, data = {}) {
  const now = new Date().toISOString();
  return {
    ...data,
    tenant_id: getTenantId(req),
    createdBy: getUserId(req),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function addUpdateMetadata(data = {}) {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getTenantId,
  getUserId,
  addCreateMetadata,
  addUpdateMetadata,
};
