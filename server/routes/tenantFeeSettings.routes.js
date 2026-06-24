const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const {
  getTenantFeeSettings,
  updateTenantFeeSettings,
} = require('../services/tenantFeeSettings.service');
const { createAuditLog } = require('../services/auditLog.service');

const router = express.Router();

router.get(
  '/tenant/fee-settings',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const settings = await getTenantFeeSettings(req.user.tenantId);
    res.json({ data: settings });
  }
);

router.put(
  '/tenant/fee-settings',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.MANAGEMENT),
  async (req, res) => {
    try {
      const settings = await updateTenantFeeSettings(req.user.tenantId, req.body);
      await createAuditLog({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'TENANT_FEE_SETTINGS_UPDATED',
        entityType: 'TENANT_FEE_SETTINGS',
        entityId: settings.id,
        metadata: {
          changedFields: Object.keys(req.body || {}).filter((key) => !key.toLowerCase().includes('secret')),
          razorpayKeySecretUpdated: Boolean(req.body?.razorpayKeySecret),
          razorpayWebhookSecretUpdated: Boolean(req.body?.razorpayWebhookSecret),
        },
      });
      res.json({ message: 'Fee settings updated', data: settings });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;
