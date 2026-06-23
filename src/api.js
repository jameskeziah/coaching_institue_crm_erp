const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getToken() {
  return localStorage.getItem('tps_token');
}

export function getPlatformToken() {
  return localStorage.getItem('tps_platform_token');
}

export function setPlatformToken(token) {
  localStorage.setItem('tps_platform_token', token);
}

export function removePlatformToken() {
  localStorage.removeItem('tps_platform_token');
  localStorage.removeItem('tps_platform_admin');
}

export function getStoredPlatformAdmin() {
  const stored = localStorage.getItem('tps_platform_admin');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

export function setStoredPlatformAdmin(admin) {
  if (!admin) return;
  localStorage.setItem('tps_platform_admin', JSON.stringify(admin));
}

export function setToken(token) {
  localStorage.setItem('tps_token', token);
}

export function removeToken() {
  localStorage.removeItem('tps_token');
}

export function getStoredUser() {
  const stored = localStorage.getItem('tps_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

export function setStoredUser(user) {
  if (!user) return;
  localStorage.setItem('tps_user', JSON.stringify(user));
}

export function removeStoredUser() {
  localStorage.removeItem('tps_user');
}

export function decodeToken(token) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

export function getCurrentUser() {
  const stored = getStoredUser();
  if (stored) return stored;
  const token = getToken();
  return decodeToken(token);
}

async function request(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 && /token/i.test(err.error || '')) {
      removeToken();
      removeStoredUser();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tps-auth-invalid', {
          detail: { message: 'Your session expired. Please sign in again.' },
        }));
      }
      throw { error: 'Your session expired. Please sign in again.' };
    }
    throw err;
  }
  return res.json().catch(() => ({}));
}

export function login(username, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function register(username, password) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function onboardInstitute(payload) {
  return request('/onboarding/institute', { method: 'POST', body: JSON.stringify(payload) });
}

async function platformRequest(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getPlatformToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) removePlatformToken();
    throw body;
  }
  return body;
}

export async function platformLogin(email, password) {
  const result = await platformRequest('/platform-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setPlatformToken(result.token);
  setStoredPlatformAdmin(result.admin);
  return result;
}

export function fetchPlatformSummary() {
  return platformRequest('/super-admin/summary');
}

export function fetchPlatformInstitutes(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  return platformRequest(`/super-admin/institutes${query ? `?${query}` : ''}`);
}

export function fetchPlatformInstituteDetail(tenantId) {
  return platformRequest(`/super-admin/institutes/${tenantId}`);
}

export function updatePlatformTenantStatus(tenantId, status) {
  return platformRequest(`/super-admin/institutes/${tenantId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchPlatformRevenue() {
  return platformRequest('/super-admin/revenue');
}

export function fetchPlatformUsage(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  return platformRequest(`/super-admin/usage${query ? `?${query}` : ''}`);
}

export function fetchSupportAccessSessions() {
  return platformRequest('/super-admin/support-access');
}

export function createSupportAccess(payload) {
  return platformRequest('/super-admin/support-access', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeSupportAccess(sessionId) {
  return platformRequest(`/super-admin/support-access/${sessionId}`, { method: 'DELETE' });
}

export function fetchPlatformAuditLogs() {
  return platformRequest('/super-admin/audit-logs');
}

export function fetchConfig() {
  return request('/config');
}

export function fetchCurrentTenant() {
  return request('/tenant/current');
}

export function changePassword(currentPassword, newPassword) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function fetchUsers() {
  return request('/users');
}

export function createUser(payload) {
  return request('/users', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateUserRole(id, role) {
  return request(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
}

function toQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function fetchAdmissions(params = {}) {
  const query = toQuery(params);
  const result = await request(`/admissions${query ? `?${query}` : ''}`);
  return Array.isArray(result) ? result : (result.data || []);
}

export function fetchAdmissionAnalytics() {
  return request('/admissions/analytics/summary');
}
export function createAdmission(payload) {
  return request('/admissions', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateAdmission(id, payload) {
  return request(`/admissions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export function deleteAdmission(id) {
  return request(`/admissions/${id}`, { method: 'DELETE' });
}

export function getCounsellors() {
  return request('/users/counsellors');
}

export function assignLeadCounsellor(leadId, counsellorId) {
  return request(`/leads/${leadId}/counsellor`, {
    method: 'PATCH',
    body: JSON.stringify({ counsellorId }),
  });
}

export function getLeadActivities(leadId) {
  return request(`/leads/${leadId}/activities`);
}

export function createLeadActivity(leadId, payload) {
  return request(`/leads/${leadId}/activities`, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchSourceAnalytics(params = {}) {
  const query = toQuery(params);
  return request(`/reports/source-analytics${query ? `?${query}` : ''}`);
}

export function fetchMarketingCampaigns() {
  return request('/marketing-campaigns');
}

export function createMarketingCampaign(payload) {
  return request('/marketing-campaigns', { method: 'POST', body: JSON.stringify(payload) });
}

export function getPublicBranches(tenant) {
  return request(`/public/branches?tenant=${encodeURIComponent(tenant)}`);
}

export function submitPublicEnquiry(payload) {
  return request('/public/enquiries', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchStudents() {
  return request('/students');
}
export function createStudent(payload) {
  return request('/students', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateStudent(id, payload) {
  return request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function deleteStudent(id) {
  return request(`/students/${id}`, { method: 'DELETE' });
}

export function fetchStudentHistory(studentId) {
  return request(`/students/${studentId}/history`);
}

export function fetchStudent360(studentId) {
  return request(`/students/${studentId}/360`);
}

export function createStudentHistory(studentId, payload) {
  return request(`/students/${studentId}/history`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateStudentHistory(id, payload) {
  return request(`/student-history/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteStudentHistory(id) {
  return request(`/student-history/${id}`, { method: 'DELETE' });
}

export function fetchFollowUps(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  return request(`/follow-ups${query ? `?${query}` : ''}`);
}

export function createFollowUp(payload) {
  return request('/follow-ups', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateFollowUp(id, payload) {
  return request(`/follow-ups/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function completeFollowUp(id, payload = {}) {
  return request(`/follow-ups/${id}/complete`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteFollowUp(id) {
  return request(`/follow-ups/${id}`, { method: 'DELETE' });
}

export function runFollowUpEscalation(payload = {}) {
  return request('/automation/follow-ups', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchFeesSummary() {
  return request('/fees/summary');
}

export async function fetchFeeStructures(params = {}) {
  const query = toQuery(params);
  const result = await request(`/fee-structures${query ? `?${query}` : ''}`);
  return Array.isArray(result) ? result : (result.data || []);
}

export function getFeeStructures(params = {}) {
  return fetchFeeStructures(params);
}

export function createFeeStructure(payload) {
  return request('/fee-structures', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateFeeStructure(id, payload) {
  return request(`/fee-structures/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteFeeStructure(id) {
  return request(`/fee-structures/${id}`, { method: 'DELETE' });
}

export function archiveFeeStructure(id) {
  return request(`/fee-structures/${id}/archive`, { method: 'PATCH' });
}

export function fetchVendors() {
  return request('/vendors');
}

export function createVendor(payload) {
  return request('/vendors', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateVendor(id, payload) {
  return request(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteVendor(id) {
  return request(`/vendors/${id}`, { method: 'DELETE' });
}

export function fetchExpenses() {
  return request('/expenses');
}

export function createExpense(payload) {
  return request('/expenses', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateExpense(id, payload) {
  return request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function approveExpense(id) {
  return request(`/expenses/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function rejectExpense(id) {
  return request(`/expenses/${id}/reject`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function payExpense(id) {
  return request(`/expenses/${id}/pay`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function deleteExpense(id) {
  return request(`/expenses/${id}`, { method: 'DELETE' });
}

export function fetchRecurringExpenses() {
  return request('/recurring-expenses');
}

export function createRecurringExpense(payload) {
  return request('/recurring-expenses', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateRecurringExpense(id, payload) {
  return request(`/recurring-expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteRecurringExpense(id) {
  return request(`/recurring-expenses/${id}`, { method: 'DELETE' });
}

export function generateRecurringExpenses(payload) {
  return request('/recurring-expenses/generate', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchPettyCash() {
  return request('/petty-cash');
}

export function createPettyCashEntry(payload) {
  return request('/petty-cash', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchExpenseReports(month) {
  return request(`/expense-reports${month ? `?month=${encodeURIComponent(month)}` : ''}`);
}

export function fetchAiLabDashboard() {
  return request('/ai-lab/dashboard');
}

export function fetchAiLabCourses() {
  return request('/ai-lab/courses');
}

export function createAiLabCourse(payload) {
  return request('/ai-lab/courses', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabCourse(id) {
  return request(`/ai-lab/courses/${id}`, { method: 'DELETE' });
}

export function fetchAiLabStudents() {
  return request('/ai-lab/students');
}

export function createAiLabStudent(payload) {
  return request('/ai-lab/students', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabStudent(id) {
  return request(`/ai-lab/students/${id}`, { method: 'DELETE' });
}

export function fetchAiLabAttendance() {
  return request('/ai-lab/attendance');
}

export function createAiLabAttendance(payload) {
  return request('/ai-lab/attendance', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabAttendance(id) {
  return request(`/ai-lab/attendance/${id}`, { method: 'DELETE' });
}

export function fetchAiLabDevices() {
  return request('/ai-lab/devices');
}

export function createAiLabDevice(payload) {
  return request('/ai-lab/devices', { method: 'POST', body: JSON.stringify(payload) });
}

export function createAiLabDeviceAllocation(payload) {
  return request('/ai-lab/device-allocations', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabDevice(id) {
  return request(`/ai-lab/devices/${id}`, { method: 'DELETE' });
}

export function deleteAiLabDeviceAllocation(id) {
  return request(`/ai-lab/device-allocations/${id}`, { method: 'DELETE' });
}

export function fetchAiLabProjects() {
  return request('/ai-lab/projects');
}

export function createAiLabProject(payload) {
  return request('/ai-lab/projects', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabProject(id) {
  return request(`/ai-lab/projects/${id}`, { method: 'DELETE' });
}

export function fetchAiLabAssignments() {
  return request('/ai-lab/assignments');
}

export function createAiLabAssignment(payload) {
  return request('/ai-lab/assignments', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabAssignment(id) {
  return request(`/ai-lab/assignments/${id}`, { method: 'DELETE' });
}

export function fetchAiLabFeedback() {
  return request('/ai-lab/feedback');
}

export function createAiLabFeedback(payload) {
  return request('/ai-lab/feedback', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabFeedback(id) {
  return request(`/ai-lab/feedback/${id}`, { method: 'DELETE' });
}

export function fetchAiLabPortfolios() {
  return request('/ai-lab/portfolios');
}

export function createAiLabPortfolio(payload) {
  return request('/ai-lab/portfolios', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabPortfolio(id) {
  return request(`/ai-lab/portfolios/${id}`, { method: 'DELETE' });
}

export function fetchAiLabCertificates() {
  return request('/ai-lab/certificates');
}

export function createAiLabCertificate(payload) {
  return request('/ai-lab/certificates', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAiLabCertificate(id) {
  return request(`/ai-lab/certificates/${id}`, { method: 'DELETE' });
}

export function fetchAcademicDashboard() { return request('/academic/dashboard'); }
export function fetchAcademicSyllabus() { return request('/academic/syllabus'); }
export function createAcademicSyllabus(payload) { return request('/academic/syllabus', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteAcademicSyllabus(id) { return request(`/academic/syllabus/${id}`, { method: 'DELETE' }); }
export function fetchAcademicCalendar() { return request('/academic/calendar'); }
export function createAcademicCalendar(payload) { return request('/academic/calendar', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteAcademicCalendar(id) { return request(`/academic/calendar/${id}`, { method: 'DELETE' }); }
export function fetchAcademicTimetable() { return request('/academic/timetable'); }
export function createAcademicTimetable(payload) { return request('/academic/timetable', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteAcademicTimetable(id) { return request(`/academic/timetable/${id}`, { method: 'DELETE' }); }
export function fetchLecturePlans() { return request('/academic/lecture-plans'); }
export function createLecturePlan(payload) { return request('/academic/lecture-plans', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteLecturePlan(id) { return request(`/academic/lecture-plans/${id}`, { method: 'DELETE' }); }
export function fetchClassDeliveryLogs() { return request('/academic/delivery-logs'); }
export function createClassDeliveryLog(payload) { return request('/academic/delivery-logs', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteClassDeliveryLog(id) { return request(`/academic/delivery-logs/${id}`, { method: 'DELETE' }); }
export function fetchHomeworkAssignments() { return request('/academic/homework'); }
export function createHomeworkAssignment(payload) { return request('/academic/homework', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteHomeworkAssignment(id) { return request(`/academic/homework/${id}`, { method: 'DELETE' }); }
export function fetchAcademicTests() { return request('/academic/tests'); }
export function createAcademicTest(payload) { return request('/academic/tests', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteAcademicTest(id) { return request(`/academic/tests/${id}`, { method: 'DELETE' }); }
export function fetchStudentTestResults() { return request('/academic/test-results'); }
export function createStudentTestResult(payload) { return request('/academic/test-results', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteStudentTestResult(id) { return request(`/academic/test-results/${id}`, { method: 'DELETE' }); }
export function fetchDoubtSessions() { return request('/academic/doubt-sessions'); }
export function createDoubtSession(payload) { return request('/academic/doubt-sessions', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteDoubtSession(id) { return request(`/academic/doubt-sessions/${id}`, { method: 'DELETE' }); }
export function fetchRevisionPlans() { return request('/academic/revision-plans'); }
export function createRevisionPlan(payload) { return request('/academic/revision-plans', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteRevisionPlan(id) { return request(`/academic/revision-plans/${id}`, { method: 'DELETE' }); }
export function fetchRemedialActions() { return request('/academic/remedial-actions'); }
export function createRemedialAction(payload) { return request('/academic/remedial-actions', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteRemedialAction(id) { return request(`/academic/remedial-actions/${id}`, { method: 'DELETE' }); }

export function fetchTestPerformanceDashboard() { return request('/test-performance/dashboard'); }
export function fetchPerformanceTests() { return request('/test-performance/tests'); }
export function createPerformanceTest(payload) { return request('/test-performance/tests', { method: 'POST', body: JSON.stringify(payload) }); }
export function deletePerformanceTest(id) { return request(`/test-performance/tests/${id}`, { method: 'DELETE' }); }
export function fetchPerformanceResults() { return request('/test-performance/results'); }
export function createPerformanceResult(payload) { return request('/test-performance/results', { method: 'POST', body: JSON.stringify(payload) }); }
export function deletePerformanceResult(id) { return request(`/test-performance/results/${id}`, { method: 'DELETE' }); }
export function fetchQuestionAnalysis() { return request('/test-performance/question-analysis'); }
export function createQuestionAnalysis(payload) { return request('/test-performance/question-analysis', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteQuestionAnalysis(id) { return request(`/test-performance/question-analysis/${id}`, { method: 'DELETE' }); }
export function fetchParentReports() { return request('/test-performance/parent-reports'); }
export function createParentReport(payload) { return request('/test-performance/parent-reports', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteParentReport(id) { return request(`/test-performance/parent-reports/${id}`, { method: 'DELETE' }); }
export function fetchTeacherImpact() { return request('/test-performance/teacher-impact'); }
export function createTeacherImpact(payload) { return request('/test-performance/teacher-impact', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteTeacherImpact(id) { return request(`/test-performance/teacher-impact/${id}`, { method: 'DELETE' }); }
export function fetchRemedialStudents() { return request('/test-performance/remedial-students'); }
export function createRemedialStudent(payload) { return request('/test-performance/remedial-students', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteRemedialStudent(id) { return request(`/test-performance/remedial-students/${id}`, { method: 'DELETE' }); }
export function fetchOmrUploads() { return request('/test-performance/omr-uploads'); }
export function createOmrUpload(payload) { return request('/test-performance/omr-uploads', { method: 'POST', body: JSON.stringify(payload) }); }
export function deleteOmrUpload(id) { return request(`/test-performance/omr-uploads/${id}`, { method: 'DELETE' }); }

export function fetchFeeReports() {
  return request('/fees/reports');
}

export function fetchFeeReminders() {
  return request('/fees/reminders');
}

export function markFeeReminderSent(payload) {
  return request('/fees/reminders', { method: 'POST', body: JSON.stringify(payload) });
}

export function runFeeReminderAutomation(payload = {}) {
  return request('/automation/fees', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchWhatsAppStatus() {
  return request('/whatsapp/status');
}

export function sendWhatsAppTest(payload) {
  return request('/whatsapp/test', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchMessageTemplates() {
  return request('/message-templates');
}

export function updateMessageTemplate(id, payload) {
  return request(`/message-templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function fetchFeeAuditLogs() {
  return request('/fees/audit-logs');
}

export function fetchFeePlans() {
  return request('/fee-plans');
}

export function fetchStudentFeePlans(studentId) {
  return request(`/students/${studentId}/fee-plans`);
}

export function createFeePlan(payload) {
  return request('/fee-plans', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateFeePlan(id, payload) {
  return request(`/fee-plans/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteFeePlan(id) {
  return request(`/fee-plans/${id}`, { method: 'DELETE' });
}

export function fetchFeePayments() {
  return request('/fee-payments');
}

export function fetchFeePayment(id) {
  return request(`/fee-payments/${id}`);
}

export function createFeePayment(payload) {
  return request('/fee-payments', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteFeePayment(id) {
  return request(`/fee-payments/${id}`, { method: 'DELETE' });
}

export function fetchAttendanceSessions() {
  return request('/attendance/sessions');
}

export function fetchAttendanceSession(id) {
  return request(`/attendance/sessions/${id}`);
}

export function createAttendanceSession(payload) {
  return request('/attendance/sessions', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAttendanceSession(id, payload) {
  return request(`/attendance/sessions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function saveAttendanceRecords(sessionId, payload) {
  return request(`/attendance/sessions/${sessionId}/records`, { method: 'POST', body: JSON.stringify(payload) });
}

export function markAllAttendancePresent(sessionId) {
  return request(`/attendance/sessions/${sessionId}/mark-all-present`, { method: 'POST', body: JSON.stringify({}) });
}

export function updateAttendanceAlert(recordId, alertStatus) {
  return request(`/attendance/records/${recordId}/alert`, { method: 'POST', body: JSON.stringify({ alertStatus }) });
}

export function deleteAttendanceSession(id) {
  return request(`/attendance/sessions/${id}`, { method: 'DELETE' });
}

export function fetchAttendanceDashboard(date) {
  return request(`/attendance/dashboard${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

export function fetchAttendanceReports(month) {
  return request(`/attendance/reports${month ? `?month=${encodeURIComponent(month)}` : ''}`);
}

export function runAttendanceAutomation(month) {
  return request('/automation/attendance', { method: 'POST', body: JSON.stringify({ month }) });
}

export function fetchAutomationLogs() {
  return request('/automation/logs');
}

export function markAutomationSent(id) {
  return request(`/automation/logs/${id}/sent`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function fetchBatchDiscipline(month) {
  return request(`/automation/batch-discipline${month ? `?month=${encodeURIComponent(month)}` : ''}`);
}

export function parentPortalLookup(payload) {
  return request('/parent-portal/lookup', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchParentAlertLogs() {
  return request('/attendance/parent-alert-logs');
}

export function createParentCallLog(payload) {
  return request('/attendance/parent-call-logs', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchParentCallLogs() {
  return request('/attendance/parent-call-logs');
}

export function staffCheckIn(payload) {
  return request('/staff-attendance/check-in', { method: 'POST', body: JSON.stringify(payload) });
}

export function staffCheckOut(payload) {
  return request('/staff-attendance/check-out', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchStaffAttendanceToday(date) {
  return request(`/staff-attendance/today${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

export function fetchStaffAttendanceMonthly(month) {
  return request(`/staff-attendance/monthly${month ? `?month=${encodeURIComponent(month)}` : ''}`);
}

export function createLeaveRequest(payload) {
  return request('/leave-requests', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchLeaveRequests() {
  return request('/leave-requests');
}

export function approveLeaveRequest(id) {
  return request(`/leave-requests/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function rejectLeaveRequest(id) {
  return request(`/leave-requests/${id}/reject`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function createAttendanceCorrection(payload) {
  return request('/attendance/corrections', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchAttendanceCorrections() {
  return request('/attendance/corrections');
}

export function approveAttendanceCorrection(id) {
  return request(`/attendance/corrections/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function rejectAttendanceCorrection(id) {
  return request(`/attendance/corrections/${id}/reject`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function fetchTeachers() {
  return request('/teachers');
}
export function createTeacher(payload) {
  return request('/teachers', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateTeacher(id, payload) {
  return request(`/teachers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function deleteTeacher(id) {
  return request(`/teachers/${id}`, { method: 'DELETE' });
}

export function fetchTeacherWorkControls() {
  return request('/teacher-work-controls');
}

export function fetchTeacherWorkControlsForTeacher(teacherId) {
  return request(`/teachers/${teacherId}/work-controls`);
}

export function createTeacherWorkControl(payload) {
  return request('/teacher-work-controls', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTeacherWorkControl(id, payload) {
  return request(`/teacher-work-controls/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTeacherWorkControl(id) {
  return request(`/teacher-work-controls/${id}`, { method: 'DELETE' });
}

export function fetchTeacherManagementActions() {
  return request('/teacher-management-actions');
}

export function fetchTeacherManagementActionsForTeacher(teacherId) {
  return request(`/teachers/${teacherId}/management-actions`);
}

export function createTeacherManagementAction(payload) {
  return request('/teacher-management-actions', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTeacherManagementAction(id, payload) {
  return request(`/teacher-management-actions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTeacherManagementAction(id) {
  return request(`/teacher-management-actions/${id}`, { method: 'DELETE' });
}

export function fetchTeacherReviews() {
  return request('/teacher-reviews');
}

export function fetchTeacherReviewsForTeacher(teacherId) {
  return request(`/teachers/${teacherId}/reviews`);
}

export function saveTeacherReview(payload) {
  return request('/teacher-reviews', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTeacherReview(id, payload) {
  return request(`/teacher-reviews/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTeacherReview(id) {
  return request(`/teacher-reviews/${id}`, { method: 'DELETE' });
}

// Ontology API
export function fetchOntologyEntities() {
  return request('/ontology/entities');
}

export function fetchOntologyEntity(id) {
  return request(`/ontology/entities/${id}`);
}

export function createOntologyEntity(payload) {
  return request('/ontology/entities', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateOntologyEntity(id, payload) {
  return request(`/ontology/entities/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteOntologyEntity(id) {
  return request(`/ontology/entities/${id}`, { method: 'DELETE' });
}

export function fetchEntityAttributes(entityId) {
  return request(`/ontology/entities/${entityId}/attributes`);
}

export function createEntityAttribute(entityId, payload) {
  return request(`/ontology/entities/${entityId}/attributes`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateEntityAttribute(attrId, payload) {
  return request(`/ontology/attributes/${attrId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteEntityAttribute(attrId) {
  return request(`/ontology/attributes/${attrId}`, { method: 'DELETE' });
}

export function fetchOntologyRelations() { return request('/ontology/relations'); }
export function createOntologyRelation(payload) { return request('/ontology/relations', { method: 'POST', body: JSON.stringify(payload) }); }
export function updateOntologyRelation(id, payload) { return request(`/ontology/relations/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }
export function deleteOntologyRelation(id) { return request(`/ontology/relations/${id}`, { method: 'DELETE' }); }

export function fetchOntologyClassifications() { return request('/ontology/classifications'); }
export function createOntologyClassification(payload) { return request('/ontology/classifications', { method: 'POST', body: JSON.stringify(payload) }); }
export function updateOntologyClassification(id, payload) { return request(`/ontology/classifications/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }
export function deleteOntologyClassification(id) { return request(`/ontology/classifications/${id}`, { method: 'DELETE' }); }

export async function fetchOntologyEntityByName(name) {
  const entities = await fetchOntologyEntities();
  const entity = entities.find((item) => item.name === name);
  if (!entity) throw { error: `Ontology entity '${name}' not found` };
  return fetchOntologyEntity(entity.id);
}
