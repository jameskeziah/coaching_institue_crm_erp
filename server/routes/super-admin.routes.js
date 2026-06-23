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
