const express = require('express');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { currentTenantId } = require('../utils/request');
const {
  validateAdmissionCreate,
  normalizeAdmissionInput,
  normalizeStatus,
  normalizeTemperature,
  isValidStatus,
  isValidTemperature,
  admissionToLegacyShape,
} = require('../services/admission.service');
const {
  createLeadActivity,
  LeadActivityType,
} = require('../services/leadActivity.service');
const { normalizeIndianPhone } = require('../utils/phone');
const { findDuplicateLeads, duplicateWarning } = require('../services/duplicateLead.service');

const router = express.Router();

function normalizeLimit(value, fallback = 50) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}

function admissionSelect() {
  return `
    id,
    tenant_id,
    studentName,
    parentName,
    parentPhone,
    className,
    school,
    courseInterested,
    targetExam,
    branchId,
    source,
    subSource,
    campaign,
    counsellorId,
    counsellor_id,
    status,
    leadTemperature,
    nextFollowUpAt,
    lastContactedAt,
    demoDate,
    demoTeacherId,
    estimatedRevenue,
    convertedStudentId,
    convertedAt,
    lostReason,
    parentPhoneNormalized,
    customFields,
    created_by,
    created_at,
    updated_at
  `;
}

router.get('/analytics/summary', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    const [byStatus, hotLeads, todayFollowUps, pipelineRevenue, convertedRevenue] = await Promise.all([
      all(
        `SELECT status, COUNT(*) as count
         FROM admissions
         WHERE tenant_id = ?
         AND deleted_at IS NULL
         GROUP BY status`,
        [tenantId]
      ),
      get(
        `SELECT COUNT(*) as count
         FROM admissions
         WHERE tenant_id = ?
         AND leadTemperature = 'HOT'
         AND deleted_at IS NULL`,
        [tenantId]
      ),
      all(
        `SELECT ${admissionSelect()}
         FROM admissions
         WHERE tenant_id = ?
         AND DATE(nextFollowUpAt) = DATE('now')
         AND deleted_at IS NULL
         ORDER BY nextFollowUpAt ASC`,
        [tenantId]
      ),
      get(
        `SELECT COALESCE(SUM(estimatedRevenue), 0) as pipelineRevenue
         FROM admissions
         WHERE tenant_id = ?
         AND status NOT IN ('WON', 'LOST')
         AND deleted_at IS NULL`,
        [tenantId]
      ),
      get(
        `SELECT COALESCE(SUM(estimatedRevenue), 0) as convertedRevenue
         FROM admissions
         WHERE tenant_id = ?
         AND status = 'WON'
         AND convertedAt IS NOT NULL
         AND deleted_at IS NULL`,
        [tenantId]
      ),
    ]);

    return res.json({
      byStatus,
      hotLeads: Number(hotLeads?.count || 0),
      todayFollowUps: todayFollowUps.map(admissionToLegacyShape),
      pipelineRevenue: Number(pipelineRevenue?.pipelineRevenue || 0),
      convertedRevenue: Number(convertedRevenue?.convertedRevenue || 0),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch admission analytics' });
  }
});

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const {
      status,
      leadTemperature,
      branchId,
      counsellorId,
      source,
      search,
    } = req.query;
    const limit = normalizeLimit(req.query.limit);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const params = [currentTenantId(req)];
    let where = `
      tenant_id = ?
      AND deleted_at IS NULL
    `;

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    if (leadTemperature) {
      where += ' AND leadTemperature = ?';
      params.push(leadTemperature);
    }

    if (branchId) {
      where += ' AND branchId = ?';
      params.push(branchId);
    }

    if (counsellorId) {
      where += ' AND counsellorId = ?';
      params.push(counsellorId);
    }

    if (source) {
      where += ' AND source = ?';
      params.push(source);
    }

    if (search) {
      where += `
        AND (
          studentName LIKE ?
          OR parentName LIKE ?
          OR parentPhone LIKE ?
          OR school LIKE ?
        )
      `;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    params.push(limit, offset);

    const rows = await all(
      `SELECT ${admissionSelect()}
       FROM admissions
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ?
       OFFSET ?`,
      params
    );

    const data = rows.map(admissionToLegacyShape);
    return res.json({
      data,
      pagination: { limit, offset },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch admission leads' });
  }
});

router.get('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const admission = await get(
      `SELECT ${admissionSelect()}
       FROM admissions
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [req.params.id, currentTenantId(req)]
    );

    if (!admission) {
      return res.status(404).json({ message: 'Admission lead not found' });
    }

    return res.json(admissionToLegacyShape(admission));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch admission lead' });
  }
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    validateAdmissionCreate(req.body);
    const duplicateLeads = await findDuplicateLeads({
      tenantId,
      parentPhone: req.body.parentPhone,
      studentName: req.body.studentName,
    });

    if (duplicateLeads.length > 0 && !req.body.ignoreDuplicateWarning) {
      return res.status(409).json({
        code: 'DUPLICATE_LEAD_WARNING',
        warning: duplicateWarning(duplicateLeads),
        duplicates: duplicateLeads,
      });
    }

    const admission = normalizeAdmissionInput(req.body);
    const parentPhoneNormalized = normalizeIndianPhone(admission.parentPhone);

    const result = await run(
      `INSERT INTO admissions
        (
          tenant_id,
          studentName,
          parentName,
          parentPhone,
          className,
          school,
          courseInterested,
          targetExam,
          branchId,
          source,
          subSource,
          campaign,
          counsellorId,
          counsellor_id,
          status,
          leadTemperature,
          nextFollowUpAt,
          lastContactedAt,
          demoDate,
          demoTeacherId,
          estimatedRevenue,
          convertedStudentId,
          convertedAt,
          lostReason,
          parentPhoneNormalized,
          parent_phone_normalized,
          customFields,
          created_by,
          created_at,
          updated_at,
          deleted_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [
        tenantId,
        admission.studentName,
        admission.parentName,
        admission.parentPhone,
        admission.className,
        admission.school,
        admission.courseInterested,
        admission.targetExam,
        admission.branchId,
        admission.source,
        admission.subSource,
        admission.campaign,
        admission.counsellorId,
        admission.counsellorId,
        admission.status,
        admission.leadTemperature,
        admission.nextFollowUpAt,
        admission.lastContactedAt,
        admission.demoDate,
        admission.demoTeacherId,
        admission.estimatedRevenue,
        admission.convertedStudentId,
        admission.convertedAt,
        admission.lostReason,
        parentPhoneNormalized,
        parentPhoneNormalized,
        admission.customFields ? JSON.stringify(admission.customFields) : null,
        req.user.id,
      ]
    );

    const created = await get(
      `SELECT ${admissionSelect()}
       FROM admissions
       WHERE id = ?
       AND tenant_id = ?`,
      [result.lastID, currentTenantId(req)]
    );

    return res.status(201).json(admissionToLegacyShape(created));
  } catch (error) {
    return res.status(400).json({ message: error.message, error: error.message });
  }
});

async function updateAdmission(req, res) {
  try {
    if (!isValidStatus(req.body.status)) throw new Error('Invalid admission status');
    if (!isValidTemperature(req.body.leadTemperature)) throw new Error('Invalid lead temperature');
    const nextStatus = req.body.status === undefined ? undefined : normalizeStatus(req.body.status);
    const nextTemperature = req.body.leadTemperature === undefined ? undefined : normalizeTemperature(req.body.leadTemperature);
    const nextParentPhoneNormalized = req.body.parentPhone === undefined ? undefined : normalizeIndianPhone(req.body.parentPhone);
    const tenantId = currentTenantId(req);
    const existing = await get(
      `SELECT ${admissionSelect()}
       FROM admissions
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [req.params.id, tenantId]
    );

    if (!existing) return res.status(404).json({ message: 'Admission lead not found', error: 'Admission lead not found' });

    const customFields = req.body.customFields === undefined ? undefined : JSON.stringify(req.body.customFields || {});
    await run(
      `UPDATE admissions
       SET
         studentName = COALESCE(?, studentName),
         parentName = COALESCE(?, parentName),
         parentPhone = COALESCE(?, parentPhone),
         className = COALESCE(?, className),
         school = COALESCE(?, school),
         courseInterested = COALESCE(?, courseInterested),
         targetExam = COALESCE(?, targetExam),
         branchId = COALESCE(?, branchId),
         source = COALESCE(?, source),
         subSource = COALESCE(?, subSource),
         campaign = COALESCE(?, campaign),
         counsellorId = COALESCE(?, counsellorId),
         counsellor_id = COALESCE(?, counsellor_id),
         status = COALESCE(?, status),
         leadTemperature = COALESCE(?, leadTemperature),
         nextFollowUpAt = COALESCE(?, nextFollowUpAt),
         lastContactedAt = COALESCE(?, lastContactedAt),
         demoDate = COALESCE(?, demoDate),
         demoTeacherId = COALESCE(?, demoTeacherId),
         estimatedRevenue = COALESCE(?, estimatedRevenue),
         convertedStudentId = COALESCE(?, convertedStudentId),
         convertedAt = COALESCE(?, convertedAt),
         lostReason = COALESCE(?, lostReason),
         parentPhoneNormalized = COALESCE(?, parentPhoneNormalized),
         parent_phone_normalized = COALESCE(?, parent_phone_normalized),
         customFields = COALESCE(?, customFields),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [
        req.body.studentName ?? null,
        req.body.parentName ?? null,
        req.body.parentPhone ?? null,
        req.body.className ?? null,
        req.body.school ?? null,
        req.body.courseInterested ?? null,
        req.body.targetExam ?? null,
        req.body.branchId ?? null,
        req.body.source ?? null,
        req.body.subSource ?? null,
        req.body.campaign ?? null,
        req.body.counsellorId ?? null,
        req.body.counsellorId ?? null,
        nextStatus ?? null,
        nextTemperature ?? null,
        req.body.nextFollowUpAt ?? null,
        req.body.lastContactedAt ?? null,
        req.body.demoDate ?? null,
        req.body.demoTeacherId ?? null,
        req.body.estimatedRevenue ?? null,
        req.body.convertedStudentId ?? null,
        req.body.convertedAt ?? null,
        req.body.lostReason ?? null,
        nextParentPhoneNormalized ?? null,
        nextParentPhoneNormalized ?? null,
        customFields ?? null,
        req.params.id,
        tenantId,
      ]
    );

    const updated = await get(
      `SELECT ${admissionSelect()}
       FROM admissions
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [req.params.id, tenantId]
    );

    if (!updated) return res.status(404).json({ message: 'Admission lead not found', error: 'Admission lead not found' });
    const activityBase = {
      tenantId,
      leadId: req.params.id,
      branchId: updated.branchId || existing.branchId || null,
      createdByUserId: req.user.id,
    };

    if (nextStatus !== undefined && existing.status !== updated.status) {
      await createLeadActivity({
        ...activityBase,
        type: LeadActivityType.STATUS_CHANGE,
        oldStatus: existing.status,
        newStatus: updated.status,
        note: req.body.note || null,
      });
    }

    if (req.body.nextFollowUpAt !== undefined && existing.nextFollowUpAt !== updated.nextFollowUpAt) {
      await createLeadActivity({
        ...activityBase,
        type: LeadActivityType.FOLLOW_UP_CREATED,
        note: req.body.note || null,
        metadata: {
          followUpAt: updated.nextFollowUpAt,
          mode: req.body.mode || null,
          outcome: req.body.outcome || null,
        },
      });
    }

    if (req.body.demoDate !== undefined && existing.demoDate !== updated.demoDate) {
      await createLeadActivity({
        ...activityBase,
        type: LeadActivityType.DEMO_SCHEDULED,
        note: req.body.note || null,
        metadata: {
          demoDate: updated.demoDate,
          demoTeacherId: updated.demoTeacherId || null,
        },
      });
    }

    if (updated.status === 'WON' && existing.status !== 'WON') {
      await createLeadActivity({
        ...activityBase,
        type: LeadActivityType.LEAD_CONVERTED,
        note: req.body.note || 'Lead converted to student',
        metadata: {
          convertedStudentId: updated.convertedStudentId || null,
          convertedAt: updated.convertedAt || new Date().toISOString(),
          estimatedRevenue: updated.estimatedRevenue || 0,
        },
      });
    }

    if (updated.status === 'LOST' && existing.status !== 'LOST') {
      await createLeadActivity({
        ...activityBase,
        type: LeadActivityType.LEAD_LOST,
        note: req.body.lostReason || req.body.note || 'Lead marked as lost',
        metadata: {
          lostReason: req.body.lostReason || updated.lostReason || null,
        },
      });
    }

    return res.json(admissionToLegacyShape(updated));
  } catch (error) {
    return res.status(400).json({ message: error.message, error: error.message });
  }
}

router.patch('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), updateAdmission);
router.put('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), updateAdmission);

router.delete('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const result = await run(
      `UPDATE admissions
       SET deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [req.params.id, currentTenantId(req)]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Admission lead not found', error: 'Admission lead not found' });
    }

    return res.json({ message: 'Admission lead deleted successfully', ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete admission lead', error: 'Failed to delete admission lead' });
  }
});

module.exports = router;
