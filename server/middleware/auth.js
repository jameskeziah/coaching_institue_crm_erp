const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      ...decoded,
      role: decoded.role ? String(decoded.role).toLowerCase() : undefined,
      tenantId: decoded.tenantId || decoded.tenant_id || null,
      tenant_id: decoded.tenant_id || decoded.tenantId || null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
