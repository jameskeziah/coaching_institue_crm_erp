const express = require('express');
const { createTenantOnboarding } = require('../services/tenant-onboarding.service');
const auth = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { run, get, all } = require('../services/db.service');

const router = express.Router();

router.post('/institute', async (req, res) => {
  try {
    const result = await createTenantOnboarding(req.body);

    return res.status(201).json({
      message: 'Institute onboarded successfully',
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || 'Failed to onboard institute',
    });
  }
});

router.get('/dashboard-summary', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const [admissions, payments, attendance] = await Promise.all([
      get(
        `SELECT COUNT(*) AS count
         FROM admissions
         WHERE tenant_id = ?`,
        [tenantId]
      ),
      get(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS collected
         FROM fee_payments
         WHERE tenant_id = ?
         AND COALESCE(status, 'Active') != 'Cancelled'`,
        [tenantId]
      ),
      get(
        `SELECT COUNT(*) AS count
         FROM attendance_records
         WHERE tenant_id = ?
         AND deletedAt IS NULL`,
        [tenantId]
      ),
    ]);

    const hasRealData =
      Number(admissions?.count || 0) > 0 ||
      Number(payments?.count || 0) > 0 ||
      Number(attendance?.count || 0) > 0;

    if (hasRealData) {
      return res.json({
        mode: 'real',
        metrics: [
          {
            metric_key: 'total_admissions',
            metric_label: 'Admissions',
            metric_value: Number(admissions?.count || 0),
          },
          {
            metric_key: 'fee_collected',
            metric_label: 'Fee Collected',
            metric_value: Number(payments?.collected || 0),
          },
          {
            metric_key: 'attendance_records',
            metric_label: 'Attendance Records',
            metric_value: Number(attendance?.count || 0),
          },
        ],
      });
    }

    const sampleMetrics = await all(
      `SELECT metric_key, metric_label, metric_value
       FROM dashboard_sample_metrics
       WHERE tenant_id = ?
       AND deleted_at IS NULL
       ORDER BY metric_key ASC`,
      [tenantId]
    );

    return res.json({
      mode: 'sample',
      metrics: sampleMetrics,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to load onboarding dashboard summary',
    });
  }
});

router.get('/checklist', auth, requireTenant, async (req, res) => {
  try {
    const rows = await all(
      `SELECT checklist_key, label, is_completed, completed_at
       FROM tenant_onboarding_checklist
       WHERE tenant_id = ?
       AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [req.user.tenantId]
    );

    return res.json({
      items: rows,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to load onboarding checklist',
    });
  }
});

router.delete(
  '/sample-data',
  auth,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.MANAGEMENT),
  async (req, res) => {
    try {
      await run(
        `UPDATE dashboard_sample_metrics
         SET deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ?
         AND deleted_at IS NULL`,
        [req.user.tenantId]
      );

      return res.json({
        message: 'Sample dashboard data removed',
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to remove sample dashboard data',
      });
    }
  }
);

module.exports = router;
