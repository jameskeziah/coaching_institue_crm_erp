const express = require('express');
const jwt = require('jsonwebtoken');

const { env } = require('../config/env');
const { get, run } = require('../services/db.service');
const { verifyPassword } = require('../services/password.service');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const admin = await get(
      `SELECT *
       FROM platform_admins
       WHERE LOWER(email) = ?
       AND deleted_at IS NULL`,
      [String(email).trim().toLowerCase()]
    );

    if (!admin || admin.is_active !== 1) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const isValid = await verifyPassword(password, admin.password_hash);

    if (!isValid) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    await run(
      `UPDATE platform_admins
       SET last_login_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [admin.id]
    );

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        tokenType: 'platform_admin',
      },
      env.JWT_SECRET,
      {
        expiresIn: '8h',
      }
    );

    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Platform login failed',
    });
  }
});

module.exports = router;
