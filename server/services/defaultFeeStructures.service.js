const { run, get, all } = require('./db.service');
const { FeeStructureCategory } = require('../config/fee-structure.constants');

const DEFAULT_ACADEMIC_YEAR = '2026-27';

const DEFAULT_FEE_STRUCTURES = [
  {
    name: 'Foundation 6th-10th Full-Time',
    code: 'FOUNDATION_6_10_FULL_TIME',
    category: FeeStructureCategory.BOARD_FOUNDATION,
    classFrom: '6',
    classTo: '10',
    targetExam: 'Foundation',
    durationMonths: 12,
    totalAmount: 48000,
    installments: [
      { title: 'Installment 1', amount: 16000, dueAfterDays: 0 },
      { title: 'Installment 2', amount: 16000, dueAfterDays: 60 },
      { title: 'Installment 3', amount: 16000, dueAfterDays: 120 },
    ],
  },
  {
    name: 'Foundation only',
    code: 'FOUNDATION_ONLY',
    category: FeeStructureCategory.FOUNDATION,
    classFrom: '6',
    classTo: '10',
    targetExam: 'Foundation',
    durationMonths: 12,
    totalAmount: 18000,
    installments: [
      { title: 'Installment 1', amount: 6000, dueAfterDays: 0 },
      { title: 'Installment 2', amount: 6000, dueAfterDays: 60 },
      { title: 'Installment 3', amount: 6000, dueAfterDays: 120 },
    ],
  },
  {
    name: 'JEE / NEET',
    code: 'JEE_NEET',
    category: FeeStructureCategory.JEE_NEET,
    classFrom: '11',
    classTo: '12',
    targetExam: 'JEE / NEET',
    durationMonths: 12,
    totalAmount: 60000,
    installments: [
      { title: 'Installment 1', amount: 20000, dueAfterDays: 0 },
      { title: 'Installment 2', amount: 20000, dueAfterDays: 60 },
      { title: 'Installment 3', amount: 20000, dueAfterDays: 120 },
    ],
  },
  {
    name: 'AI / Data Science - 6 months',
    code: 'AI_DATA_SCIENCE_6_MONTHS',
    category: FeeStructureCategory.AI_DATA_SCIENCE,
    targetExam: 'AI / Data Science',
    durationMonths: 6,
    totalAmount: 24000,
    installments: [
      { title: 'Installment 1', amount: 12000, dueAfterDays: 0 },
      { title: 'Installment 2', amount: 12000, dueAfterDays: 90 },
    ],
  },
  {
    name: 'AI / Data Science - 12 months',
    code: 'AI_DATA_SCIENCE_12_MONTHS',
    category: FeeStructureCategory.AI_DATA_SCIENCE,
    targetExam: 'AI / Data Science',
    durationMonths: 12,
    totalAmount: 38000,
    installments: [
      { title: 'Installment 1', amount: 13000, dueAfterDays: 0 },
      { title: 'Installment 2', amount: 13000, dueAfterDays: 60 },
      { title: 'Installment 3', amount: 12000, dueAfterDays: 120 },
    ],
  },
];

function branchScopeCondition(branchId) {
  return branchId
    ? { sql: 'branch_id = ?', params: [branchId] }
    : { sql: 'branch_id IS NULL', params: [] };
}

async function createDefaultFeeStructures({ tenantId, branchId = null, academicYear = DEFAULT_ACADEMIC_YEAR }) {
  if (!tenantId) throw new Error('tenantId is required');

  const created = [];
  for (const structure of DEFAULT_FEE_STRUCTURES) {
    const scope = branchScopeCondition(branchId);
    const existing = await get(
      `SELECT id
       FROM fee_structures
       WHERE tenant_id = ?
       AND code = ?
       AND academic_year = ?
       AND ${scope.sql}`,
      [tenantId, structure.code, academicYear, ...scope.params]
    );

    if (existing) {
      created.push(existing.id);
      continue;
    }

    const tuitionFee = structure.totalAmount;
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
          courseName,
          feeAmount,
          billingCycle,
          paymentType,
          classRange,
          duration,
          status,
          createdAt,
          updatedAt
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, 'course', 'Installment', ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        tenantId,
        branchId,
        structure.name,
        structure.code,
        structure.category,
        academicYear,
        structure.classFrom || null,
        structure.classTo || null,
        structure.targetExam || null,
        structure.durationMonths,
        structure.totalAmount,
        tuitionFee,
        [structure.classFrom, structure.classTo].filter(Boolean).join('-') || null,
        `${structure.durationMonths} months`,
      ]
    );

    const feeStructureId = result.lastID;
    created.push(feeStructureId);
    for (const [index, installment] of structure.installments.entries()) {
      await run(
        `INSERT INTO fee_structure_installments
          (tenant_id, fee_structure_id, installment_number, title, amount, due_after_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          tenantId,
          feeStructureId,
          index + 1,
          installment.title,
          installment.amount,
          installment.dueAfterDays,
        ]
      );
    }
  }

  return created;
}

async function createDefaultFeeStructuresForExistingTenants({ academicYear = DEFAULT_ACADEMIC_YEAR } = {}) {
  const tenants = await all(
    `SELECT id
     FROM tenants`
  );

  for (const tenant of tenants) {
    const branch = await get(
      `SELECT id
       FROM branches
       WHERE tenant_id = ?
       ORDER BY is_default DESC, created_at ASC
       LIMIT 1`,
      [tenant.id]
    );
    await createDefaultFeeStructures({
      tenantId: tenant.id,
      branchId: branch?.id || null,
      academicYear,
    });
  }
}

module.exports = {
  DEFAULT_ACADEMIC_YEAR,
  DEFAULT_FEE_STRUCTURES,
  createDefaultFeeStructures,
  createDefaultFeeStructuresForExistingTenants,
};
