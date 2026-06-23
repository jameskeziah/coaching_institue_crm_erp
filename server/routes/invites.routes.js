const express = require('express');
const { run } = require('../db');
const auth = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { requireVerifiedEmail } = require('../middleware/verified-email');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { env } = require('../config/env');
const {
  generateRawToken,
  hashToken,
  generateId,
  getFutureDate,
} = require('../services/token.service');
const { sendInviteEmail } = require('../services/mail.service');

const router = express.Router();

const INVITABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.ACCOUNTANT,
  ROLES.COUNSELLOR,
  ROLES.TEACHER,
  ROLES.USER,
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

router.post(
  '/',
  auth,
  requireTenant,
  requireVerifiedEmail,
  requireAnyRole(ROLE_GROUPS.MANAGEMENT),
  async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const { role } = req.body;

    if (!email || !role) {
      return res.status(400).json({
        message: 'Email and role are required',
      });
    }

    if (!INVITABLE_ROLES.includes(role)) {
      return res.status(400).json({
        message: 'Invalid invite role',
      });
    }

    try {
      const rawToken = generateRawToken();

      await run(
        `INSERT INTO user_invites
         (id, tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId('inv'),
          req.user.tenantId,
          email,
          role,
          hashToken(rawToken),
          req.user.id,
          getFutureDate({ days: env.INVITE_TOKEN_DAYS }),
        ]
      );

      await sendInviteEmail({
        email,
        token: rawToken,
      });

      return res.status(201).json({
        message: 'Invite sent successfully',
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to create invite',
      });
    }
  }
);

module.exports = router;
