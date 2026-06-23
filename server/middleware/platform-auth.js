const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function platformAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Platform admin authentication required',
      code: 'PLATFORM_AUTH_REQUIRED',
    });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (decoded.tokenType !== 'platform_admin') {
      return res.status(403).json({
        message: 'Invalid platform token',
        code: 'INVALID_PLATFORM_TOKEN',
      });
    }

    req.platformAdmin = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired platform admin token',
      code: 'PLATFORM_TOKEN_INVALID',
    });
  }
}

module.exports = platformAuth;
