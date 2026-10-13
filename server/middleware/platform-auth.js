const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { get } = require('../services/db.service');

async function platformAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Platform admin authentication required',
      code: 'PLATFORM_AUTH_REQUIRED',
    });
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);

    if (decoded.tokenType !== 'platform_admin') {
      return res.status(403).json({
        message: 'Invalid platform token',
        code: 'INVALID_PLATFORM_TOKEN',
      });
    }

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired platform admin token',
      code: 'PLATFORM_TOKEN_INVALID',
    });
  }

  try {
    const admin = await get(
      `SELECT id, email, role, is_active
       FROM platform_admins
       WHERE id = ?
         AND deleted_at IS NULL`,
      [decoded.id]
    );

    if (!admin || Number(admin.is_active ?? admin.isActive) !== 1) {
      return res.status(401).json({
        message: 'Platform admin account is inactive or no longer exists',
        code: 'PLATFORM_ACCOUNT_INACTIVE',
      });
    }

    req.platformAdmin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };

    return next();
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to validate platform admin account',
      code: 'PLATFORM_AUTH_UNAVAILABLE',
    });
  }
}

module.exports = platformAuth;
