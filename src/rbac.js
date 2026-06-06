export const roleLabels = {
  owner: 'Owner',
  director: 'Director',
  admin: 'Admin',
  accountant: 'Accountant',
  counsellor: 'Counsellor',
  teacher: 'Teacher',
  user: 'User',
};

export const moduleRoles = {
  dashboard: ['owner', 'director', 'admin', 'accountant', 'counsellor', 'teacher', 'user'],
  students: ['owner', 'director', 'admin', 'counsellor', 'teacher'],
  admissions: ['owner', 'director', 'admin', 'counsellor'],
  fees: ['owner', 'director', 'admin', 'accountant', 'counsellor'],
  expenses: ['owner', 'director', 'admin', 'accountant'],
  reports: ['owner', 'director', 'admin', 'accountant'],
  academic: ['owner', 'director', 'admin', 'teacher'],
  aiLab: ['owner', 'director', 'admin', 'teacher'],
  tests: ['owner', 'director', 'admin', 'teacher'],
  attendance: ['owner', 'director', 'admin', 'teacher'],
  automation: ['owner', 'director', 'admin'],
  teachers: ['owner', 'director', 'admin'],
  teacherPerformance: ['owner', 'director', 'admin', 'teacher'],
  parentPortal: ['owner', 'director', 'admin', 'counsellor', 'teacher', 'accountant'],
  ontology: ['owner', 'director', 'admin'],
};

export function normalizeRole(role) {
  return String(role || 'user').toLowerCase();
}

export function canAccessModule(role, moduleName) {
  const roles = moduleRoles[moduleName] || [];
  return roles.includes(normalizeRole(role));
}

export function isAdminRole(role) {
  return ['owner', 'director', 'admin'].includes(normalizeRole(role));
}

export function canDelete(role) {
  return isAdminRole(role);
}

export function canApprove(role) {
  return isAdminRole(role);
}

export function canPay(role) {
  return ['owner', 'director', 'admin', 'accountant'].includes(normalizeRole(role));
}

export function canEditFinance(role) {
  return ['owner', 'director', 'admin', 'accountant'].includes(normalizeRole(role));
}

export function canManageUsers(role) {
  return isAdminRole(role);
}

export function canApproveCorrections(role) {
  return isAdminRole(role);
}
