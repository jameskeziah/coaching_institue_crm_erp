const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one number');
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
};
