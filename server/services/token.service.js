const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function createAccessToken(user, sessionId) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id || user.tenantId,
      sessionId,
      emailVerifiedAt: user.email_verified_at || user.emailVerifiedAt || null,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    }
  );
}

function getFutureDate({ minutes = 0, hours = 0, days = 0 }) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  date.setHours(date.getHours() + hours);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

module.exports = {
  generateRawToken,
  hashToken,
  generateId,
  createAccessToken,
  getFutureDate,
};
