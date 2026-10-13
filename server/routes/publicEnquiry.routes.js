const express = require('express');
const { run, all, get } = require('../db');
const { normalizeIndianPhone } = require('../utils/phone');
const { findDuplicateLeads } = require('../services/duplicateLead.service');

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
    } = req.body;

    if (website) return res.status(202).json({ message: 'Enquiry received. Our team will review it.' });
    if (!tenantSlug || !studentName || !parentPhone || !className || !branchId) {
      return res.status(400).json({ message: 'Student name, parent phone, class, branch, and tenant are required', error: 'Student name, parent phone, class, branch, and tenant are required' });
    }
    const hasValidText = (value, maxLength) =>
      typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
    if (
      !hasValidText(tenantSlug, 80) ||
      !hasValidText(studentName, 160) ||
      !hasValidText(parentPhone, 32) ||
      !/^[6-9]\d{9}$/.test(normalizeIndianPhone(parentPhone)) ||
      !hasValidText(className, 80) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(String(branchId)) ||
      (parentName && !hasValidText(parentName, 160)) ||
      typeof source !== 'string' || source.length > 40 ||
      (campaign !== null && (typeof campaign !== 'string' || campaign.length > 120)) ||
      (typeof targetExam !== 'string' || targetExam.length > 80)
    ) {
      return res.status(400).json({ message: 'Invalid enquiry details' });
    }
    // The public website may provide minimal, consented context. Never accept
    // arbitrary client-defined column names or admission workflow privileges.
    const safeDetails = {};
    for (const [key, maxLength] of Object.entries({
      academicYear: 32, enquiryTopic: 64, preferredContactMethod: 16,
      email: 254, question: 1000,
    })) {
      const value = req.body[key];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || value.length > maxLength) {
        return res.status(400).json({ message: 'Invalid enquiry details' });
      }
      safeDetails[key] = value.trim();
    }
    if (Object.keys(safeDetails).length) {
      safeDetails.origin = 'PUBLIC_WEBSITE';
      safeDetails.contactConsent = req.body.contactConsent === true;
      if (safeDetails.contactConsent) safeDetails.consentCapturedAt = new Date().toISOString();
    }

    const tenant = await findPublicTenant(tenantSlug);
    if (!tenant) return res.status(404).json({ message: 'Institute not found', error: 'Institute not found' });

    const branch = await get(
      `SELECT id
       FROM branches
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [branchId, tenant.id]
    );
    if (!branch) return res.status(400).json({ message: 'Invalid branch selected', error: 'Invalid branch selected' });

    const duplicateLeads = await findDuplicateLeads({ tenantId: tenant.id, parentPhone, studentName });
    if (duplicateLeads.length > 0) {
      // An unauthenticated caller must never receive existing lead names,
      // phone numbers, workflow status, or even a duplicate indicator.
      // Do not allow "ignoreDuplicateWarning" to bypass this protection.
      return res.status(202).json({ message: 'Enquiry received. Our team will review it.' });
    }

    const normalizedPhone = normalizeIndianPhone(parentPhone);
    await run(
      `INSERT INTO admissions (
        tenant_id,
        studentName,
        parentName,
        parentPhone,
        parentPhoneNormalized,
        parent_phone_normalized,
        className,
        courseInterested,
        targetExam,
        branchId,
        source,
        campaign,
        customFields,
        status,
        leadTemperature,
        estimatedRevenue,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 'WARM', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
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
        Object.keys(safeDetails).length ? JSON.stringify(safeDetails) : null,
      ]
    );

    // Same status and body as the duplicate path: prevent public lead enumeration.
    return res.status(202).json({ message: 'Enquiry received. Our team will review it.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to submit enquiry', error: 'Failed to submit enquiry' });
  }
});

module.exports = router;
