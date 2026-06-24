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
  followUps: ['owner', 'director', 'admin', 'accountant', 'counsellor', 'teacher'],
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
  academicMasters: ['owner', 'director', 'admin', 'accountant', 'counsellor', 'teacher'],
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

export function discountPermissions(role) {
  const normalized = normalizeRole(role);
  return {
    canRequestDiscount: ['owner', 'director', 'admin', 'accountant', 'counsellor'].includes(normalized),
    canViewDiscounts: ['owner', 'director', 'admin', 'accountant', 'counsellor'].includes(normalized),
    canApproveDiscount: ['owner', 'director', 'admin'].includes(normalized),
    canRejectDiscount: ['owner', 'director', 'admin'].includes(normalized),
    canApplyDiscount: ['owner', 'director', 'admin', 'accountant'].includes(normalized),
    canViewDiscountAudit: ['owner', 'director', 'admin', 'accountant'].includes(normalized),
  };
}

export function academicMasterPermissions(role) {
  const normalized = normalizeRole(role);
  const canView = ['owner', 'director', 'admin', 'accountant', 'counsellor', 'teacher'].includes(normalized);
  const canManage = ['owner', 'director', 'admin'].includes(normalized);
  return {
    canViewAcademicMasters: canView,
    canManageBranches: canManage,
    canManageCourses: canManage,
    canManageBatches: canManage,
    canManageSubjects: canManage,
    canManageBatchStudents: canManage || normalized === 'counsellor',
    canManageBatchTeachers: canManage,
    canManageFacultySubjects: canManage,
    canCreateBatch: canManage,
    canUpdateBatch: canManage,
    canActivateBatch: canManage,
    canDeactivateBatch: canManage,
    canArchiveBatch: canManage,
    canViewBatchStudents: canView,
    canViewBatchTeachers: canView,
    canViewBatchTimings: canView,
    canManageBatchTimings: canManage,
  };
}
