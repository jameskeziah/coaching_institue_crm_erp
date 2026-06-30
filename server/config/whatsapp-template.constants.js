const OFFICIAL_TEMPLATE_KEYS = [
  'attendance_absent',
  'fee_due',
  'fee_overdue',
  'payment_receipt',
  'test_result',
  'weekly_report',
  'admission_followup',
];

const TEMPLATE_STATUSES = [
  'LOCAL_DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'ARCHIVED',
  'SYNCED',
];

const TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];

module.exports = {
  OFFICIAL_TEMPLATE_KEYS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
};
