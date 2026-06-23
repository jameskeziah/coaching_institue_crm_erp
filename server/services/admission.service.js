const {
  ADMISSION_STATUSES,
  LEAD_TEMPERATURES,
} = require('../config/admission.constants');

const statusAliases = {
  'new lead': ADMISSION_STATUSES.NEW,
  new: ADMISSION_STATUSES.NEW,
  contacted: ADMISSION_STATUSES.CONTACTED,
  'counselling scheduled': ADMISSION_STATUSES.COUNSELLING_SCHEDULED,
  'counselling done': ADMISSION_STATUSES.COUNSELLING_DONE,
  'demo scheduled': ADMISSION_STATUSES.DEMO_SCHEDULED,
  'demo done': ADMISSION_STATUSES.DEMO_DONE,
  'follow-up': ADMISSION_STATUSES.FOLLOW_UP,
  followup: ADMISSION_STATUSES.FOLLOW_UP,
  converted: ADMISSION_STATUSES.WON,
  won: ADMISSION_STATUSES.WON,
  lost: ADMISSION_STATUSES.LOST,
  rejected: ADMISSION_STATUSES.LOST,
  cold: ADMISSION_STATUSES.COLD,
};

function normalizeStatus(value, fallback = ADMISSION_STATUSES.NEW) {
  if (!value) return fallback;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (Object.values(ADMISSION_STATUSES).includes(upper)) return upper;
  return statusAliases[raw.toLowerCase()] || fallback;
}

function isValidStatus(value) {
  if (!value) return true;
  const raw = String(value).trim();
  return Object.values(ADMISSION_STATUSES).includes(raw.toUpperCase()) || Boolean(statusAliases[raw.toLowerCase()]);
}

function normalizeTemperature(value, fallback = LEAD_TEMPERATURES.WARM) {
  if (!value) return fallback;
  const upper = String(value).trim().toUpperCase();
  if (Object.values(LEAD_TEMPERATURES).includes(upper)) return upper;
  return fallback;
}

function isValidTemperature(value) {
  if (!value) return true;
  return Object.values(LEAD_TEMPERATURES).includes(String(value).trim().toUpperCase());
}

function validateAdmissionCreate(input) {
  const requiredFields = [
    'studentName',
    'parentPhone',
    'className',
    'courseInterested',
  ];

  for (const field of requiredFields) {
    if (!input[field] || String(input[field]).trim() === '') {
      throw new Error(`${field} is required`);
    }
  }

  if (!isValidStatus(input.status)) {
    throw new Error('Invalid admission status');
  }

  if (!isValidTemperature(input.leadTemperature)) {
    throw new Error('Invalid lead temperature');
  }

  if (
    input.estimatedRevenue !== undefined &&
    input.estimatedRevenue !== null &&
    Number(input.estimatedRevenue) < 0
  ) {
    throw new Error('Estimated revenue cannot be negative');
  }
}

function normalizeAdmissionInput(input) {
  return {
    studentName: input.studentName?.trim(),
    parentName: input.parentName?.trim() || null,
    parentPhone: input.parentPhone?.trim(),
    className: input.className?.trim(),
    school: input.school?.trim() || null,
    courseInterested: input.courseInterested?.trim(),
    targetExam: input.targetExam?.trim() || null,
    branchId: input.branchId || null,
    source: input.source || null,
    subSource: input.subSource || null,
    campaign: input.campaign || null,
    counsellorId: input.counsellorId || null,
    status: normalizeStatus(input.status),
    leadTemperature: normalizeTemperature(input.leadTemperature),
    nextFollowUpAt: input.nextFollowUpAt || null,
    lastContactedAt: input.lastContactedAt || null,
    demoDate: input.demoDate || null,
    demoTeacherId: input.demoTeacherId || null,
    estimatedRevenue: Number(input.estimatedRevenue || 0),
    convertedStudentId: input.convertedStudentId || null,
    convertedAt: input.convertedAt || null,
    lostReason: input.lostReason || null,
    customFields: input.customFields || null,
  };
}

function safeJsonParse(value) {
  if (!value) return {};
  try {
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function admissionToLegacyShape(row) {
  const customFields = safeJsonParse(row.customFields);
  return {
    ...row,
    name: row.studentName || row.name,
    program: row.courseInterested || row.program,
    data: {
      ...customFields,
      phone: row.parentPhone || customFields.phone || '',
      className: row.className || customFields.className || '',
      school: row.school || customFields.school || '',
      branch: row.branchId || customFields.branch || '',
      counsellor: row.counsellorId || customFields.counsellor || '',
      leadTemperature: row.leadTemperature || LEAD_TEMPERATURES.WARM,
      nextFollowUpDate: row.nextFollowUpAt ? String(row.nextFollowUpAt).slice(0, 10) : '',
      demoDate: row.demoDate ? String(row.demoDate).slice(0, 10) : '',
      demoTeacher: row.demoTeacherId || '',
      estimatedRevenue: row.estimatedRevenue || 0,
      convertedStudentId: row.convertedStudentId || '',
      convertedDate: row.convertedAt ? String(row.convertedAt).slice(0, 10) : '',
    },
  };
}

module.exports = {
  validateAdmissionCreate,
  normalizeAdmissionInput,
  normalizeStatus,
  isValidStatus,
  normalizeTemperature,
  isValidTemperature,
  safeJsonParse,
  admissionToLegacyShape,
};
