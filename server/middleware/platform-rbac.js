function requirePlatformRole(allowedRoles = []) {
  return function requirePlatformRoleMiddleware(req, res, next) {
    if (!req.platformAdmin) {
      return res.status(401).json({
        message: 'Platform admin authentication required',
      });
    }

    if (!allowedRoles.includes(req.platformAdmin.role)) {
      return res.status(403).json({
        message: 'Insufficient platform permissions',
      });
    }

    return next();
  };
}

module.exports = {
  requirePlatformRole,
};
