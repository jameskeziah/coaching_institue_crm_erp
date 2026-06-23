const crypto = require('crypto');
const express = require('express');
const { run, all } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId } = require('../utils/request');

const router = express.Router();

router.get('/reports/source-analytics', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    const { from, to, branchId } = req.query;
    const conditions = ['a.tenant_id = ?', 'a.deleted_at IS NULL'];
    const params = [tenantId];

    if (from) {
      conditions.push('date(a.created_at) >= date(?)');
      params.push(from);
    }
    if (to) {
      conditions.push('date(a.created_at) <= date(?)');
      params.push(to);
    }
    if (branchId) {
      conditions.push('a.branchId = ?');
      params.push(branchId);
    }

    const rows = await all(
      `SELECT
        COALESCE(a.source, 'UNKNOWN') AS source,
        COUNT(a.id) AS totalLeads,
        SUM(CASE WHEN a.status IN ('WON', 'CONVERTED', 'ADMITTED') THEN 1 ELSE 0 END) AS convertedLeads,
        SUM(CASE WHEN a.status IN ('WON', 'CONVERTED', 'ADMITTED') THEN COALESCE(a.estimatedRevenue, 0) ELSE 0 END) AS revenue,
        COALESCE(SUM(DISTINCT mc.spend_amount), 0) AS campaignSpend
       FROM admissions a
       LEFT JOIN marketing_campaigns mc
         ON mc.tenant_id = a.tenant_id
         AND mc.source = a.source
         AND mc.name = a.campaign
       WHERE ${conditions.join(' AND ')}
       GROUP BY COALESCE(a.source, 'UNKNOWN')
       ORDER BY totalLeads DESC`,
      params
    );

    return res.json({
      data: rows.map((row) => {
        const totalLeads = Number(row.totalLeads || row.totalleads || 0);
        const convertedLeads = Number(row.convertedLeads || row.convertedleads || 0);
        const revenue = Number(row.revenue || 0);
        const campaignSpend = Number(row.campaignSpend || row.campaignspend || 0);
        return {
          source: row.source,
          totalLeads,
          convertedLeads,
          conversionRate: totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0,
          campaignSpend,
          revenue,
          costPerAdmission: convertedLeads > 0 ? Number((campaignSpend / convertedLeads).toFixed(2)) : 0,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load source analytics', error: 'Failed to load source analytics' });
  }
});

router.get('/marketing-campaigns', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  const rows = await all(
    `SELECT id, tenant_id, branch_id, name, source, spend_amount, start_date, end_date, is_active, created_at, updated_at
     FROM marketing_campaigns
     WHERE tenant_id = ?
     ORDER BY is_active DESC, source ASC, name ASC`,
    [currentTenantId(req)]
  );
  return res.json({ data: rows });
});

router.post('/marketing-campaigns', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const { name, source, branchId = null, spendAmount = 0, startDate = null, endDate = null, isActive = true } = req.body;
    if (!name || !source) return res.status(400).json({ message: 'Campaign name and source are required', error: 'Campaign name and source are required' });
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO marketing_campaigns
       (id, tenant_id, branch_id, name, source, spend_amount, start_date, end_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, currentTenantId(req), branchId, name, source, Number(spendAmount || 0), startDate, endDate, isActive ? 1 : 0]
    );
    return res.status(201).json({ data: { id, name, source, branchId, spendAmount: Number(spendAmount || 0), startDate, endDate, isActive } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save marketing campaign', error: 'Failed to save marketing campaign' });
  }
});

module.exports = router;
