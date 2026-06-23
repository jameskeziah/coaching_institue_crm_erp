function requireAnyRole(allowedRoles = []) {
  return function requireAnyRoleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        message: 'Unauthorized',
      });
    }

    if (!req.user.role) {
      return res.status(403).json({
        message: 'Forbidden: user role is missing',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Forbidden: insufficient permissions',
        requiredRoles: allowedRoles,
        currentRole: req.user.role,
      });
    }

    return next();
  };
}

module.exports = {
  requireAnyRole,
};
