const express = require('express');
const { run, all, get } = require('../db');
const { normalizeIndianPhone } = require('../utils/phone');
const { findDuplicateLeads, duplicateWarning } = require('../services/duplicateLead.service');

const router = express.Router();

async function findPublicTenant(slug) {
  if (!slug) return null;
  return get(
    `SELECT id, name, slug
     FROM tenants
     WHERE slug = ?
     AND deleted_at IS NULL
     AND COALESCE(status, 'Active') NOT IN ('Suspended', 'Deleted')`,
    [slug]
  );
}

router.get('/public/branches', async (req, res) => {
  try {
    const tenant = await findPublicTenant(req.query.tenant);
    if (!req.query.tenant) return res.status(400).json({ message: 'Tenant is required', error: 'Tenant is required' });
    if (!tenant) return res.status(404).json({ message: 'Institute not found', error: 'Institute not found' });

    const branches = await all(
      `SELECT id, name, city
       FROM branches
       WHERE tenant_id = ?
       AND deleted_at IS NULL
       ORDER BY is_default DESC, name ASC`,
      [tenant.id]
    );

    return res.json({ data: branches });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load branches', error: 'Failed to load branches' });
  }
});

router.post('/public/enquiries', async (req, res) => {
  try {
    const {
      tenant: tenantSlug,
      studentName,
      parentName = '',
      parentPhone,
      className,
      targetExam = '',
      branchId,
      source = 'WEBSITE',
      campaign = null,
      website,
      ignoreDuplicateWarning = false,
    } = req.body;

    if (website) return res.status(200).json({ message: 'Enquiry submitted' });
    if (!tenantSlug || !studentName || !parentPhone || !className || !branchId) {
      return res.status(400).json({ message: 'Student name, parent phone, class, branch, and tenant are required', error: 'Student name, parent phone, class, branch, and tenant are required' });
    }

    const tenant = await findPublicTenant(tenantSlug);
    if (!tenant) return res.status(404).json({ message: 'Institute not found', error: 'Institute not found' });

    const branch = await get(
      `SELECT id
       FROM branches
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [branchId, tenant.id]
    );
    if (!branch) return res.status(400).json({ message: 'Invalid branch selected', error: 'Invalid branch selected' });

    const duplicateLeads = await findDuplicateLeads({ tenantId: tenant.id, parentPhone, studentName });
    if (duplicateLeads.length > 0 && !ignoreDuplicateWarning) {
      return res.status(409).json({
        code: 'DUPLICATE_LEAD_WARNING',
        warning: duplicateWarning(duplicateLeads),
        duplicateDetected: true,
      });
    }

    const normalizedPhone = normalizeIndianPhone(parentPhone);
    const result = await run(
      `INSERT INTO admissions (
        tenant_id, studentName, parentName, parentPhone, parentPhoneNormalized,
        parent_phone_normalized, className, courseInterested, targetExam, branchId,
        source, campaign, status, leadTemperature, estimatedRevenue,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 'WARM', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [
        tenant.id,
        studentName,
        parentName,
        parentPhone,
        normalizedPhone,
        normalizedPhone,
        className,
        targetExam || 'Admission enquiry',
        targetExam || null,
        branchId,
        source || 'WEBSITE',
        campaign || null,
      ]
    );

    return res.status(201).json({
      message: 'Enquiry submitted successfully',
      data: { leadId: result.lastID },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to submit enquiry', error: 'Failed to submit enquiry' });
  }
});

module.exports = router;
