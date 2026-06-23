const DEFAULT_ROLES = [
  {
    roleKey: 'owner',
    displayName: 'Owner',
    description: 'Full tenant control including billing, users, roles, and settings.',
  },
  {
    roleKey: 'director',
    displayName: 'Director',
    description: 'Institute-level management access.',
  },
  {
    roleKey: 'admin',
    displayName: 'Admin',
    description: 'Operational admin access.',
  },
  {
    roleKey: 'accountant',
    displayName: 'Accountant',
    description: 'Fee collection, expenses, receipts, and finance reports.',
  },
  {
    roleKey: 'counsellor',
    displayName: 'Counsellor',
    description: 'Admissions, leads, follow-ups, and parent communication.',
  },
  {
    roleKey: 'teacher',
    displayName: 'Teacher',
    description: 'Academic, attendance, tests, and student performance access.',
  },
  {
    roleKey: 'user',
    displayName: 'User',
    description: 'Basic authenticated user access.',
  },
];

const DEFAULT_FEE_PLANS = [
  {
    name: 'Foundation Only',
    courseType: 'foundation',
    amount: 18000,
    billingCycle: 'course',
    durationMonths: 12,
  },
  {
    name: 'Board + Foundation',
    courseType: 'board_foundation',
    amount: 48000,
    billingCycle: 'yearly',
    durationMonths: 12,
  },
  {
    name: 'JEE / NEET',
    courseType: 'jee_neet',
    amount: 60000,
    billingCycle: 'yearly',
    durationMonths: 12,
  },
  {
    name: 'AI / Data Science - 6 Months',
    courseType: 'ai_data_science',
    amount: 24000,
    billingCycle: 'course',
    durationMonths: 6,
  },
  {
    name: 'AI / Data Science - 12 Months',
    courseType: 'ai_data_science',
    amount: 38000,
    billingCycle: 'course',
    durationMonths: 12,
  },
];

const DEFAULT_MESSAGE_TEMPLATES = [
  {
    name: 'Fee Payment Received',
    channel: 'whatsapp',
    category: 'fees',
    body: 'Dear Parent, fee payment of Rs {{amount}} has been received for {{studentName}}. Receipt No: {{receiptNumber}}.',
    variables: ['amount', 'studentName', 'receiptNumber'],
  },
  {
    name: 'Fee Reminder',
    channel: 'whatsapp',
    category: 'fees',
    body: 'Dear Parent, pending fee of Rs {{pendingAmount}} is due for {{studentName}}. Kindly complete the payment.',
    variables: ['pendingAmount', 'studentName'],
  },
  {
    name: 'Attendance Alert',
    channel: 'whatsapp',
    category: 'attendance',
    body: 'Dear Parent, {{studentName}} was marked absent on {{date}}. Please contact the institute for details.',
    variables: ['studentName', 'date'],
  },
  {
    name: 'Test Result Published',
    channel: 'whatsapp',
    category: 'tests',
    body: 'Dear Parent, {{studentName}} scored {{marks}}/{{totalMarks}} in {{testName}}.',
    variables: ['studentName', 'marks', 'totalMarks', 'testName'],
  },
  {
    name: 'Admission Follow-up',
    channel: 'whatsapp',
    category: 'admissions',
    body: 'Dear Parent, thank you for visiting {{instituteName}}. Our counsellor will contact you for the next admission step.',
    variables: ['instituteName'],
  },
];

const DEFAULT_DASHBOARD_METRICS = [
  {
    metricKey: 'sample_total_leads',
    metricLabel: 'Sample Leads',
    metricValue: 42,
  },
  {
    metricKey: 'sample_admissions',
    metricLabel: 'Sample Admissions',
    metricValue: 18,
  },
  {
    metricKey: 'sample_fee_collected',
    metricLabel: 'Sample Fee Collected',
    metricValue: 325000,
  },
  {
    metricKey: 'sample_pending_fees',
    metricLabel: 'Sample Pending Fees',
    metricValue: 96000,
  },
  {
    metricKey: 'sample_attendance_percentage',
    metricLabel: 'Sample Attendance %',
    metricValue: 87,
  },
];

const DEFAULT_CHECKLIST_ITEMS = [
  {
    key: 'verify_email',
    label: 'Verify owner email',
  },
  {
    key: 'update_institute_profile',
    label: 'Update institute profile',
  },
  {
    key: 'confirm_fee_plans',
    label: 'Confirm fee plans',
  },
  {
    key: 'invite_staff',
    label: 'Invite staff members',
  },
  {
    key: 'add_students',
    label: 'Add first students',
  },
  {
    key: 'connect_whatsapp',
    label: 'Connect WhatsApp',
  },
  {
    key: 'connect_razorpay',
    label: 'Connect Razorpay',
  },
];

module.exports = {
  DEFAULT_ROLES,
  DEFAULT_FEE_PLANS,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_DASHBOARD_METRICS,
  DEFAULT_CHECKLIST_ITEMS,
};
