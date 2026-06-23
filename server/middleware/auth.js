const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role ? String(decoded.role).toLowerCase() : undefined,
      tenantId: decoded.tenantId || decoded.tenant_id || null,
      tenant_id: decoded.tenant_id || decoded.tenantId || null,
      sessionId: decoded.sessionId,
      emailVerifiedAt: decoded.emailVerifiedAt,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired', code: 'TOKEN_EXPIRED' });
    }

    return res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

module.exports = authMiddleware;
