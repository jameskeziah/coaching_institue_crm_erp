const express = require('express');

const platformAuth = require('../middleware/platform-auth');
const { requirePlatformRole } = require('../middleware/platform-rbac');
const { PLATFORM_ROLE_GROUPS } = require('../config/platform-roles');

const {
  getPlatformSummary,
  listInstitutes,
  getInstituteDetail,
  updateTenantStatus,
  getPlatformAuditLogs,
} = require('../services/super-admin.service');

const {
  getRevenueSummary,
  getRecentPayments,
} = require('../services/billing-analytics.service');

const {
  createSupportAccessSession,
  listSupportAccessSessions,
  revokeSupportAccessSession,
} = require('../services/support-access.service');

const { getUsageSummary } = require('../services/usage.service');
const { logPlatformAction } = require('../services/platform-audit.service');
const { env } = require('../config/env');
const { get, run, transaction } = require('../services/db.service');
const { generateRawToken, hashToken, generateId, getFutureDate } = require('../services/token.service');
const { createEmailOutboxRecord, processEmailOutboxRecord } = require('../services/email-outbox.service');
const { isMailDeliveryError } = require('../services/mail.service');

const router = express.Router();

router.get(
  '/summary',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.ANY_PLATFORM_ADMIN),
  async (req, res) => {
    try {
      const summary = await getPlatformSummary();
      return res.json({ data: summary });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch platform summary' });
    }
  }
);

router.get(
  '/institutes',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.ANY_PLATFORM_ADMIN),
  async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const offset = Number(req.query.offset || 0);

      const institutes = await listInstitutes({
        status: req.query.status || null,
        search: req.query.search || null,
        limit,
        offset,
      });

      return res.json({ data: institutes });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch institutes' });
    }
  }
);

router.get(
  '/institutes/:tenantId',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.ANY_PLATFORM_ADMIN),
  async (req, res) => {
    try {
      const detail = await getInstituteDetail(req.params.tenantId);

      if (!detail) {
        return res.status(404).json({ message: 'Institute not found' });
      }

      return res.json({ data: detail });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch institute details' });
    }
  }
);

router.patch(
  '/institutes/:tenantId/status',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.FULL_ACCESS),
  async (req, res) => {
    try {
      const { status } = req.body;

      const allowedStatuses = [
        'trialing',
        'active',
        'past_due',
        'trial_expired',
        'suspended',
        'canceled',
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid tenant status' });
      }

      await updateTenantStatus({
        tenantId: req.params.tenantId,
        status,
      });

      await logPlatformAction(req, 'TENANT_STATUS_UPDATED', {
        targetType: 'tenant',
        targetId: req.params.tenantId,
        metadata: { status },
      });

      return res.json({ message: 'Tenant status updated successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to update tenant status' });
    }
  }
);

router.post(
  '/institutes/:tenantId/owner-invite',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.FULL_ACCESS),
  async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const reason = String(req.body.reason || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'A valid owner email is required' });
    if (reason.length < 10) return res.status(400).json({ message: 'A recovery reason of at least 10 characters is required' });
    try {
      const queued = await transaction(async () => {
        const tenant = await get(`SELECT id, name FROM tenants WHERE id = ? AND deleted_at IS NULL`, [req.params.tenantId]);
        if (!tenant) throw Object.assign(new Error('Institute not found'), { status: 404 });
        const owner = await get(`SELECT id FROM users WHERE tenant_id = ? AND role = 'owner' AND deleted_at IS NULL`, [tenant.id]);
        if (owner) throw Object.assign(new Error('Institute already has an owner; use the owner-transfer workflow'), { status: 409 });
        const existingUser = await get(`SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?`, [email, email]);
        if (existingUser) throw Object.assign(new Error('That email already belongs to an existing user'), { status: 409 });
        const previousRecovery = await get(
          `SELECT id FROM tenant_owner_recovery_requests
           WHERE tenant_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
          [tenant.id]
        );
        if (previousRecovery) {
          const replaced = await run(
            `UPDATE tenant_owner_recovery_requests
             SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
            [previousRecovery.id]
          );
          if (Number(replaced.changes ?? replaced.rowCount ?? 0) !== 1) {
            throw Object.assign(new Error('Owner recovery state changed; refresh and try again'), { status: 409 });
          }
          await run(
            `UPDATE email_outbox SET status = 'cancelled', payload = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE owner_recovery_request_id = ? AND status IN ('pending', 'retry', 'processing')`,
            [previousRecovery.id]
          );
        }
        const rawToken = generateRawToken();
        const requestId = generateId('own');
        const expiresAt = getFutureDate({ hours: env.OWNER_RECOVERY_TOKEN_HOURS });
        await run(
          `INSERT INTO tenant_owner_recovery_requests
            (id, tenant_id, email, token_hash, platform_admin_id, reason, expires_at, delivery_status, delivery_attempt_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
          [requestId, tenant.id, email, hashToken(rawToken), String(req.platformAdmin.id), reason, expiresAt]
        );
        const outboxId = await createEmailOutboxRecord({
          tenantId: tenant.id,
          ownerRecoveryRequestId: requestId,
          type: 'owner_recovery_invite',
          recipient: email,
          payload: { token: rawToken, instituteName: tenant.name, expiresAt },
        });
        await logPlatformAction(req, 'TENANT_OWNER_RECOVERY_CREATED', {
          targetType: 'tenant', targetId: req.params.tenantId,
          metadata: { requestId, recipient: email, reason, expiresAt },
        });
        return { requestId, outboxId };
      });
      const delivery = await processEmailOutboxRecord(queued.outboxId);
      return res.status(201).json({ message: 'Owner recovery invitation created', deliveryStatus: delivery.status });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (isMailDeliveryError(error)) return res.status(503).json({ message: 'Owner invitation was created but could not be delivered', code: error.code });
      if (/UNIQUE|constraint/i.test(error.message || '')) return res.status(409).json({ message: 'Another owner recovery request is already active; refresh and try again' });
      return res.status(500).json({ message: 'Failed to create owner invitation' });
    }
  }
);

router.delete(
  '/institutes/:tenantId/owner-invite/:requestId',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.FULL_ACCESS),
  async (req, res) => {
    try {
      await transaction(async () => {
        const recovery = await get(
          `SELECT id, email
           FROM tenant_owner_recovery_requests
           WHERE id = ?
             AND tenant_id = ?
             AND accepted_at IS NULL
             AND revoked_at IS NULL`,
          [req.params.requestId, req.params.tenantId]
        );
        if (!recovery) throw Object.assign(new Error('Active owner recovery request not found'), { status: 404 });

        const revoked = await run(
          `UPDATE tenant_owner_recovery_requests
           SET revoked_at = CURRENT_TIMESTAMP,
               delivery_status = CASE WHEN delivery_status = 'sent' THEN delivery_status ELSE 'cancelled' END,
               delivery_last_error_code = 'OWNER_RECOVERY_REVOKED',
               updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
             AND accepted_at IS NULL
             AND revoked_at IS NULL`,
          [recovery.id]
        );
        if (Number(revoked.changes ?? revoked.rowCount ?? 0) !== 1) {
          throw Object.assign(new Error('Owner recovery request is no longer active'), { status: 409 });
        }
        await run(
          `UPDATE email_outbox
           SET status = 'cancelled', payload = NULL, locked_at = NULL, locked_by = NULL,
               last_error_code = 'OWNER_RECOVERY_REVOKED', updated_at = CURRENT_TIMESTAMP
           WHERE owner_recovery_request_id = ?
             AND status IN ('pending', 'retry', 'processing')`,
          [recovery.id]
        );
        await logPlatformAction(req, 'TENANT_OWNER_RECOVERY_REVOKED', {
          targetType: 'tenant',
          targetId: req.params.tenantId,
          metadata: { requestId: recovery.id, recipient: recovery.email },
        });
      });

      return res.json({ message: 'Owner recovery invitation revoked' });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      return res.status(500).json({ message: 'Failed to revoke owner invitation' });
    }
  }
);

router.get(
  '/revenue',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.BILLING),
  async (req, res) => {
    try {
      const summary = await getRevenueSummary();
      const payments = await getRecentPayments();
      return res.json({ data: { summary, payments } });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch revenue data' });
    }
  }
);

router.get(
  '/usage',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.ANY_PLATFORM_ADMIN),
  async (req, res) => {
    try {
      const data = await getUsageSummary({
        tenantId: req.query.tenantId || null,
        limit: Math.min(Number(req.query.limit || 200), 500),
      });

      return res.json({ data });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch usage data' });
    }
  }
);

router.post(
  '/support-access',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.SUPPORT),
  async (req, res) => {
    try {
      const { tenantId, reason, accessType } = req.body;

      if (!tenantId || !reason) {
        return res.status(400).json({ message: 'Tenant ID and reason are required' });
      }

      const session = await createSupportAccessSession({
        platformAdminId: req.platformAdmin.id,
        tenantId,
        reason,
        accessType: accessType || 'read_only',
      });

      await logPlatformAction(req, 'SUPPORT_ACCESS_CREATED', {
        targetType: 'tenant',
        targetId: tenantId,
        metadata: {
          reason,
          accessType: accessType || 'read_only',
          sessionId: session.sessionId,
        },
      });

      return res.status(201).json({
        message: 'Support access session created',
        data: session,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message || 'Failed to create support access',
      });
    }
  }
);

router.get(
  '/support-access',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.SUPPORT),
  async (req, res) => {
    try {
      const sessions = await listSupportAccessSessions();
      return res.json({ data: sessions });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch support access sessions' });
    }
  }
);

router.delete(
  '/support-access/:sessionId',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.SUPPORT),
  async (req, res) => {
    try {
      await revokeSupportAccessSession(req.params.sessionId);

      await logPlatformAction(req, 'SUPPORT_ACCESS_REVOKED', {
        targetType: 'support_access_session',
        targetId: req.params.sessionId,
      });

      return res.json({ message: 'Support access revoked' });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to revoke support access' });
    }
  }
);

router.get(
  '/audit-logs',
  platformAuth,
  requirePlatformRole(PLATFORM_ROLE_GROUPS.ANY_PLATFORM_ADMIN),
  async (req, res) => {
    try {
      const logs = await getPlatformAuditLogs({
        limit: Math.min(Number(req.query.limit || 100), 500),
        offset: Number(req.query.offset || 0),
      });

      return res.json({ data: logs });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
