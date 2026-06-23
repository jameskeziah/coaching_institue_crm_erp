const express = require('express');
const { get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId } = require('../utils/request');
const {
  createLeadActivity,
  listLeadActivities,
  LeadActivityType,
} = require('../services/leadActivity.service');

const router = express.Router();
const allowedTypes = new Set(Object.values(LeadActivityType));

async function ensureLead(req, res, next) {
  try {
    const lead = await get(
      `SELECT id, branchId
       FROM admissions
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [req.params.leadId, currentTenantId(req)]
    );

    if (!lead) {
      return res.status(404).json({ message: 'Admission lead not found', error: 'Admission lead not found' });
    }

    req.lead = lead;
    return next();
  } catch (error) {
    return res.status(500).json({ message: 'Failed to verify admission lead', error: 'Failed to verify admission lead' });
  }
}

router.get(
  '/leads/:leadId/activities',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.ADMISSIONS),
  ensureLead,
  async (req, res) => {
    try {
      const activities = await listLeadActivities({
        tenantId: currentTenantId(req),
        leadId: req.params.leadId,
      });

      return res.json({ data: activities });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to load lead activity timeline', error: 'Failed to load lead activity timeline' });
    }
  }
);

router.post(
  '/leads/:leadId/activities',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.ADMISSIONS),
  ensureLead,
  async (req, res) => {
    try {
      const {
        type,
        title,
        note,
        oldStatus,
        newStatus,
        activityAt,
        metadata,
      } = req.body;

      if (!allowedTypes.has(type)) {
        return res.status(400).json({ message: 'Invalid lead activity type', error: 'Invalid lead activity type' });
      }

      const activity = await createLeadActivity({
        tenantId: currentTenantId(req),
        leadId: req.params.leadId,
        branchId: req.lead.branchId || null,
        createdByUserId: req.user.id,
        type,
        title,
        note,
        oldStatus,
        newStatus,
        activityAt,
        metadata,
      });

      return res.status(201).json({ data: activity });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to create lead activity', error: 'Failed to create lead activity' });
    }
  }
);

module.exports = router;
