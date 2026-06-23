const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { FEE_STRUCTURE_CATEGORIES, FeeStructureCategory } = require('../config/fee-structure.constants');
const { run, get, all } = require('../services/db.service');

const router = express.Router();
const VALID_DURATIONS = new Set([1, 3, 6, 12, 24]);
const COMPONENT_FIELDS = [
  'admissionFee',
  'tuitionFee',
  'materialFee',
  'testSeriesFee',
  'technologyFee',
  'otherFee',
];

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function toMoneyCents(value) {
  return Math.round(toNumber(value) * 100);
}

function toCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function boolToInt(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function serializeStructure(row, installments = []) {
  const isActive = Number(row.is_active ?? row.isActive ?? 1) === 1;
  const classRange = [row.class_from || row.classFrom, row.class_to || row.classTo].filter(Boolean).join('-');
  const totalAmount = toNumber(row.total_amount ?? row.totalAmount ?? row.feeAmount);
  const durationMonths = Number(row.duration_months ?? row.durationMonths ?? 0) || 0;

  return {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    branchId: row.branch_id ?? row.branchId,
    name: row.name || row.courseName,
    code: row.code,
    category: row.category || FeeStructureCategory.OTHER,
    academicYear: row.academic_year ?? row.academicYear,
    classFrom: row.class_from ?? row.classFrom,
    classTo: row.class_to ?? row.classTo,
    targetExam: row.target_exam ?? row.targetExam,
    durationMonths,
    totalAmount,
    admissionFee: toNumber(row.admission_fee ?? row.admissionFee),
    tuitionFee: toNumber(row.tuition_fee ?? row.tuitionFee),
    materialFee: toNumber(row.material_fee ?? row.materialFee),
    testSeriesFee: toNumber(row.test_series_fee ?? row.testSeriesFee),
    technologyFee: toNumber(row.technology_fee ?? row.technologyFee),
    otherFee: toNumber(row.other_fee ?? row.otherFee),
    installmentsAllowed: Number(row.installments_allowed ?? row.installmentsAllowed ?? 1) === 1,
    discountAllowed: Number(row.discount_allowed ?? row.discountAllowed ?? 1) === 1,
    maxDiscountAmount: toNumber(row.max_discount_amount ?? row.maxDiscountAmount),
    maxDiscountPercent: toNumber(row.max_discount_percent ?? row.maxDiscountPercent),
    isDefault: Number(row.is_default ?? row.isDefault ?? 0) === 1,
    isActive,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    installments,
    courseName: row.name || row.courseName,
    feeAmount: totalAmount,
    billingCycle: row.billingCycle || 'course',
    paymentType: row.paymentType || 'Installment',
    classRange: row.classRange || classRange,
    duration: row.duration || `${durationMonths || 0} months`,
    notes: row.notes || '',
    status: isActive ? 'Active' : 'Inactive',
  };
}

function validatePayload(body) {
  const name = String(body.name || body.courseName || '').trim();
  const code = toCode(body.code || name);
  const academicYear = String(body.academicYear || body.academic_year || '2026-27').trim();
  const durationMonths = Number(body.durationMonths || body.duration_months || 0);
  const totalAmount = toNumber(body.totalAmount ?? body.total_amount ?? body.feeAmount);
  const maxDiscountPercent = toNumber(body.maxDiscountPercent ?? body.max_discount_percent);
  const category = String(body.category || FeeStructureCategory.OTHER).trim().toUpperCase();
  const installments = Array.isArray(body.installments) ? body.installments : [];

  if (!name) throw new Error('Fee structure name is required');
  if (!code) throw new Error('Fee structure code is required');
  if (!academicYear) throw new Error('Academic year is required');
  if (!VALID_DURATIONS.has(durationMonths)) throw new Error('durationMonths must be one of 1, 3, 6, 12, or 24');
  if (totalAmount <= 0) throw new Error('totalAmount must be greater than 0');
  if (maxDiscountPercent > 100) throw new Error('maxDiscountPercent cannot exceed 100');
  if (!FEE_STRUCTURE_CATEGORIES.includes(category)) throw new Error('Invalid fee structure category');
  if (!installments.length && boolToInt(body.installmentsAllowed ?? body.installments_allowed, true) === 1) {
    throw new Error('At least one installment is required when installments are allowed');
  }

  const components = {
    admissionFee: toNumber(body.admissionFee ?? body.admission_fee),
    tuitionFee: toNumber(body.tuitionFee ?? body.tuition_fee),
    materialFee: toNumber(body.materialFee ?? body.material_fee),
    testSeriesFee: toNumber(body.testSeriesFee ?? body.test_series_fee),
    technologyFee: toNumber(body.technologyFee ?? body.technology_fee),
    otherFee: toNumber(body.otherFee ?? body.other_fee),
  };
  const componentTotal = COMPONENT_FIELDS.reduce((sum, field) => sum + toMoneyCents(components[field]), 0);
  if (componentTotal !== toMoneyCents(totalAmount)) {
    throw new Error('Fee breakup total must equal totalAmount');
  }

  const cleanInstallments = installments.map((item, index) => ({
    installmentNumber: Number(item.installmentNumber || item.installment_number || index + 1),
    title: String(item.title || item.label || `Installment ${index + 1}`).trim(),
    amount: toNumber(item.amount),
    dueAfterDays: Number(item.dueAfterDays ?? item.due_after_days ?? 0),
  }));
  const installmentTotal = cleanInstallments.reduce((sum, item) => sum + toMoneyCents(item.amount), 0);
  if (installmentTotal !== toMoneyCents(totalAmount)) {
    throw new Error('Installment total must equal totalAmount');
  }
  if (cleanInstallments.some((item) => !item.title || item.amount <= 0 || item.dueAfterDays < 0)) {
    throw new Error('Installments need a title, positive amount, and non-negative dueAfterDays');
  }

  return {
    name,
    code,
    category,
    academicYear,
    branchId: body.branchId || body.branch_id || null,
    classFrom: body.classFrom || body.class_from || null,
    classTo: body.classTo || body.class_to || null,
    targetExam: body.targetExam || body.target_exam || null,
    durationMonths,
    totalAmount,
    ...components,
    installmentsAllowed: boolToInt(body.installmentsAllowed ?? body.installments_allowed, true),
    discountAllowed: boolToInt(body.discountAllowed ?? body.discount_allowed, true),
    maxDiscountAmount: toNumber(body.maxDiscountAmount ?? body.max_discount_amount),
    maxDiscountPercent,
    isDefault: boolToInt(body.isDefault ?? body.is_default, false),
    installments: cleanInstallments,
  };
}

async function loadInstallments(structureIds) {
  if (!structureIds.length) return new Map();
  const rows = await all(
    `SELECT *
     FROM fee_structure_installments
     WHERE fee_structure_id IN (${structureIds.map(() => '?').join(',')})
     ORDER BY fee_structure_id, installment_number`,
    structureIds
  );
  const byStructure = new Map();
  for (const row of rows) {
    const item = {
      id: row.id,
      feeStructureId: row.fee_structure_id ?? row.feeStructureId,
      installmentNumber: row.installment_number ?? row.installmentNumber,
      title: row.title,
      amount: toNumber(row.amount),
      dueAfterDays: Number(row.due_after_days ?? row.dueAfterDays ?? 0),
      createdAt: row.created_at ?? row.createdAt,
    };
    if (!byStructure.has(item.feeStructureId)) byStructure.set(item.feeStructureId, []);
    byStructure.get(item.feeStructureId).push(item);
  }
  return byStructure;
}

router.get('/fee-structures', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const tenantId = req.user.tenantId;
  const params = [tenantId];
  const filters = ['tenant_id = ?'];

  if (req.query.academicYear) {
    filters.push('academic_year = ?');
    params.push(String(req.query.academicYear));
  }
  if (req.query.branchId) {
    filters.push('branch_id = ?');
    params.push(String(req.query.branchId));
  }
  if (req.query.includeArchived !== 'true') {
    filters.push('is_active = 1');
  }

  const rows = await all(
    `SELECT *
     FROM fee_structures
     WHERE ${filters.join(' AND ')}
     ORDER BY is_active DESC, is_default DESC, name ASC`,
    params
  );
  const installmentsByStructure = await loadInstallments(rows.map((row) => row.id));
  res.json({
    data: rows.map((row) => serializeStructure(row, installmentsByStructure.get(row.id) || [])),
  });
});

router.post('/fee-structures', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const payload = validatePayload(req.body || {});
    const branchFilter = payload.branchId
      ? { sql: 'branch_id = ?', params: [payload.branchId] }
      : { sql: 'branch_id IS NULL', params: [] };
    const existing = await get(
      `SELECT id
       FROM fee_structures
       WHERE tenant_id = ?
       AND code = ?
       AND academic_year = ?
       AND ${branchFilter.sql}`,
      [tenantId, payload.code, payload.academicYear, ...branchFilter.params]
    );
    if (existing) {
      return res.status(409).json({ error: 'A fee structure with this code already exists for this branch and academic year' });
    }

    const result = await run(
      `INSERT INTO fee_structures
        (
          tenant_id,
          branch_id,
          name,
          code,
          category,
          academic_year,
          class_from,
          class_to,
          target_exam,
          duration_months,
          total_amount,
          admission_fee,
          tuition_fee,
          material_fee,
          test_series_fee,
          technology_fee,
          other_fee,
          installments_allowed,
          discount_allowed,
          max_discount_amount,
          max_discount_percent,
          is_default,
          is_active,
          created_at,
          updated_at,
          billingCycle,
          paymentType,
          classRange,
          duration,
          status,
          createdAt,
          updatedAt
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'course', 'Installment', ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        tenantId,
        payload.branchId,
        payload.name,
        payload.code,
        payload.category,
        payload.academicYear,
        payload.classFrom,
        payload.classTo,
        payload.targetExam,
        payload.durationMonths,
        payload.totalAmount,
        payload.admissionFee,
        payload.tuitionFee,
        payload.materialFee,
        payload.testSeriesFee,
        payload.technologyFee,
        payload.otherFee,
        payload.installmentsAllowed,
        payload.discountAllowed,
        payload.maxDiscountAmount,
        payload.maxDiscountPercent,
        payload.isDefault,
        [payload.classFrom, payload.classTo].filter(Boolean).join('-') || null,
        `${payload.durationMonths} months`,
      ]
    );

    const feeStructureId = result.lastID;
    for (const installment of payload.installments) {
      await run(
        `INSERT INTO fee_structure_installments
          (tenant_id, fee_structure_id, installment_number, title, amount, due_after_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          tenantId,
          feeStructureId,
          installment.installmentNumber,
          installment.title,
          installment.amount,
          installment.dueAfterDays,
        ]
      );
    }

    const row = await get(`SELECT * FROM fee_structures WHERE id = ? AND tenant_id = ?`, [feeStructureId, tenantId]);
    const installmentsByStructure = await loadInstallments([feeStructureId]);
    return res.status(201).json({
      data: serializeStructure(row, installmentsByStructure.get(feeStructureId) || []),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create fee structure' });
  }
});

router.patch('/fee-structures/:id/archive', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.FINANCE), async (req, res) => {
  const tenantId = req.user.tenantId;
  const existing = await get(
    `SELECT id
     FROM fee_structures
     WHERE id = ?
     AND tenant_id = ?`,
    [req.params.id, tenantId]
  );
  if (!existing) return res.status(404).json({ error: 'Fee structure not found' });

  await run(
    `UPDATE fee_structures
     SET is_active = 0,
         status = 'Inactive',
         updated_at = CURRENT_TIMESTAMP,
         updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?
     AND tenant_id = ?`,
    [req.params.id, tenantId]
  );

  return res.json({ success: true, id: req.params.id });
});

module.exports = router;
