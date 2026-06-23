const { all } = require('../db');
const { normalizeIndianPhone } = require('../utils/phone');

async function findDuplicateLeads({ tenantId, parentPhone, studentName, excludeLeadId = null }) {
  const normalizedPhone = normalizeIndianPhone(parentPhone);
  if (!normalizedPhone) return [];

  const params = [tenantId, normalizedPhone, String(studentName || '').trim().toLowerCase(), normalizedPhone];
  let excludeClause = '';
  if (excludeLeadId) {
    excludeClause = 'AND id != ?';
    params.push(excludeLeadId);
  }

  const rows = await all(
    `SELECT
      id,
      studentName,
      parentName,
      parentPhone,
      parentPhoneNormalized,
      className,
      targetExam,
      status,
      source,
      campaign,
      created_at
    FROM admissions
    WHERE tenant_id = ?
      AND deleted_at IS NULL
      AND (
        parentPhoneNormalized = ?
        OR (
          lower(COALESCE(studentName, '')) = ?
          AND parentPhoneNormalized = ?
        )
      )
      ${excludeClause}
    ORDER BY created_at DESC, id DESC
    LIMIT 5`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    studentName: row.studentName,
    parentName: row.parentName,
    parentPhone: row.parentPhone,
    parentPhoneNormalized: row.parentPhoneNormalized,
    className: row.className,
    targetExam: row.targetExam,
    status: row.status,
    source: row.source,
    campaign: row.campaign,
    createdAt: row.created_at || row.createdAt,
  }));
}

function duplicateWarning(duplicates) {
  const first = duplicates?.[0];
  if (!first?.createdAt) return 'This parent already has an enquiry.';
  const date = new Date(first.createdAt);
  const formatted = Number.isNaN(date.getTime())
    ? String(first.createdAt).slice(0, 10)
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return `This parent already enquired on ${formatted}.`;
}

module.exports = {
  findDuplicateLeads,
  duplicateWarning,
};
