const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';
const username = process.env.SMOKE_USERNAME || process.env.ADMIN_USERNAME || 'admin';
const password = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || 'MirakuAdmin2026!';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${body.error || response.statusText}`);
  }
  return body;
}

async function requestRaw(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function withAuth(token, options = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

async function expectStatus(path, token, allowedStatuses, options = {}) {
  const { response, body } = await requestRaw(path, withAuth(token, options));
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${options.method || 'GET'} ${path} expected ${allowedStatuses.join('/')} but got ${response.status}: ${body.error || response.statusText}`);
  }
  return body;
}

async function expectAllowed(path, token, options = {}) {
  return expectStatus(path, token, [200], options);
}

async function expectForbidden(path, token, options = {}) {
  return expectStatus(path, token, [403], options);
}

async function loginAs(username, password) {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!login.token) throw new Error(`Login did not return a token for ${username}`);
  return login.token;
}

async function createRoleUser(adminToken, role, suffix) {
  const roleUsername = `smoke-rbac-${role}-${suffix}`;
  const rolePassword = `SmokeRole${suffix}!`;
  const created = await request('/users', withAuth(adminToken, {
    method: 'POST',
    body: JSON.stringify({
      username: roleUsername,
      password: rolePassword,
      role,
    }),
  }));
  if (!created.id || created.role !== role) throw new Error(`Failed to create ${role} smoke user`);
  return loginAs(roleUsername, rolePassword);
}

async function main() {
  const suffix = Date.now();
  const smokePhone = `9${String(suffix).slice(-9)}`;
  const config = await request('/config');
  if (typeof config.allowRegistration !== 'boolean') {
    throw new Error('Config did not return allowRegistration');
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const token = login.token;
  if (!token) throw new Error('Login did not return a token');
  if (!login.user?.tenant_id || !login.user?.tenantName) throw new Error('Login did not return tenant metadata');

  await request('/users', withAuth(token));
  const currentTenant = await request('/tenant/current', withAuth(token));
  if (!currentTenant.id || !currentTenant.name || !currentTenant.subscriptionPlan) throw new Error('Current tenant endpoint failed');
  const [accountantToken, counsellorToken, teacherRoleToken, basicUserToken] = await Promise.all([
    createRoleUser(token, 'accountant', suffix),
    createRoleUser(token, 'counsellor', suffix),
    createRoleUser(token, 'teacher', suffix),
    createRoleUser(token, 'user', suffix),
  ]);
  const createdUser = await request('/users', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      username: `smoke-user-${suffix}`,
      password: `SmokePass${suffix}!`,
      role: 'user',
    }),
  }));
  if (!createdUser.id || createdUser.role !== 'user' || Number(createdUser.tenant_id) !== Number(currentTenant.id)) throw new Error('Admin user creation failed');

  const teacher = await request('/teachers', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Teacher ${suffix}`,
      subject: 'Physics',
      month: 'June 2026',
      data: {
        course: 'NEET',
        qualification: 'MSc',
        experience: '5 years',
        salary: 'Rs 30000 + accommodation',
        joiningDate: '2026-04-01',
        contractPeriod: '2 years',
        documents: { aadhaar: 'Submitted', pan: 'Submitted', certificates: 'Submitted' },
        status: 'Active',
      },
    }),
  }));
  const branchMaster = await request('/branches', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Branch ${suffix}`,
      code: `SMK-${suffix}`,
      city: 'Tembhurni',
      phone: smokePhone,
      isActive: true,
    }),
  }));
  const courseMaster = await request('/courses', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Foundation 10 ${suffix}`,
      code: `SMK-F10-${suffix}`,
      courseType: 'FOUNDATION',
      classLevel: '10th',
      durationMonths: 12,
      defaultFee: 10000,
      isActive: true,
    }),
  }));
  const subjectMaster = await request('/subjects', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Mathematics ${suffix}`,
      code: `SMK-MATH-${suffix}`,
      isActive: true,
    }),
  }));
  const batchMaster = await request('/batches', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      branchId: branchMaster.data.id,
      courseId: courseMaster.data.id,
      name: `Smoke Morning Batch ${suffix}`,
      code: `SMK-BATCH-${suffix}`,
      academicYear: '2026-27',
      startDate: '2026-06-01',
      endDate: '2027-03-31',
      capacity: 40,
      status: 'ACTIVE',
      timings: [
        { dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '20:00', roomName: 'Room 1' },
        { dayOfWeek: 'WEDNESDAY', startTime: '18:00', endTime: '20:00', roomName: 'Room 1' },
      ],
    }),
  }));
  if (!branchMaster.data?.id || !courseMaster.data?.id || !subjectMaster.data?.id || !batchMaster.data?.id) {
    throw new Error('Academic master creation failed');
  }
  await request(`/faculty/${teacher.id}/subjects`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ subjectId: subjectMaster.data.id, isPrimary: true }),
  }));

  await request(`/teachers/${teacher.id}`, withAuth(token, {
    method: 'PUT',
    body: JSON.stringify({
      name: `Smoke Teacher Updated ${suffix}`,
      subject: 'Physics',
      month: 'June 2026',
      data: {
        course: 'NEET',
        qualification: 'MSc',
        experience: '5 years',
        salary: 'Rs 30000 + accommodation',
        joiningDate: '2026-04-01',
        contractPeriod: '2 years',
        documents: { aadhaar: 'Submitted', pan: 'Submitted', certificates: 'Submitted' },
        status: 'Active',
      },
    }),
  }));

  const workControl = await request('/teacher-work-controls', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      teacher_id: teacher.id,
      controlType: 'Lecture Plan',
      title: 'Smoke lecture plan',
      plannedValue: 'Teach laws of motion',
      actualValue: 'Completed laws of motion',
      status: 'Completed',
      dueDate: '2026-06-04',
      evidenceUrl: 'Smoke evidence',
      remarks: 'Smoke work control',
    }),
  }));
  if (!workControl.id) throw new Error('Teacher work control creation failed');
  const teacherControls = await request(`/teachers/${teacher.id}/work-controls`, withAuth(token));
  if (!teacherControls.length) throw new Error('Teacher work controls load failed');
  const managementAction = await request('/teacher-management-actions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      teacher_id: teacher.id,
      month: 'June 2026',
      actionType: 'Warning',
      warningLevel: 'Level 1 - Verbal warning',
      reason: 'Smoke warning reason',
      decision: 'Monitor next month',
      salaryDecision: 'Salary released + improvement note',
      status: 'Monitoring',
    }),
  }));
  if (!managementAction.id) throw new Error('Teacher management action creation failed');
  const teacherActions = await request(`/teachers/${teacher.id}/management-actions`, withAuth(token));
  if (!teacherActions.length) throw new Error('Teacher management actions load failed');

  const review = await request('/teacher-reviews', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      teacher_id: teacher.id,
      month: 'June 2026',
      scores: {
        attendance: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
        syllabus: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
        classQuality: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
        studentImprovement: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
        discipline: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
        documentation: { score: 8, evidence: 'Smoke test', remarks: 'ok' },
      },
    }),
  }));
  if (!review.id) throw new Error('Review save did not return an id');

  const teacherReviews = await request(`/teachers/${teacher.id}/reviews`, withAuth(token));
  if (!teacherReviews.length) throw new Error('Teacher review load returned no rows');

  const student = await request('/students', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Student ${suffix}`,
      grade: '10th',
      batch: batchMaster.data.name,
      attendance: '95%',
      branchId: branchMaster.data.id,
      primaryCourseId: courseMaster.data.id,
      primaryBatchId: batchMaster.data.id,
      data: {
        status: 'Admitted',
        school: 'Smoke School',
        examTarget: 'Boards',
        course: courseMaster.data.name,
        academicYear: '2026-27',
        branch: branchMaster.data.name,
        fatherName: 'Smoke Father',
        motherName: 'Smoke Mother',
        primaryPhone: smokePhone,
        whatsapp: smokePhone,
        joiningDate: '2026-06-04',
        counsellor: 'Smoke Counsellor',
        documents: {
          aadhaar: 'Submitted',
          marksheet: 'Pending',
          photo: 'Submitted',
          admissionForm: 'Submitted',
        },
      },
    }),
  }));
  const studentMasters = (await request('/students', withAuth(token))).find((row) => Number(row.id) === Number(student.id));
  if (String(studentMasters?.branch_id || studentMasters?.branchId) !== String(branchMaster.data.id)
    || String(studentMasters?.primary_course_id || studentMasters?.primaryCourseId) !== String(courseMaster.data.id)
    || String(studentMasters?.primary_batch_id || studentMasters?.primaryBatchId) !== String(batchMaster.data.id)) {
    throw new Error('Student relational academic fields were not saved');
  }
  await request(`/batches/${batchMaster.data.id}/teachers`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      teacherId: teacher.id,
      subjectId: subjectMaster.data.id,
      role: 'PRIMARY',
      assignedFrom: '2026-06-01',
    }),
  }));
  const batchDetail = await request(`/batches/${batchMaster.data.id}`, withAuth(token));
  if (Number(batchDetail.data?.studentCount) !== 1 || Number(batchDetail.data?.teacherCount) !== 1 || batchDetail.data?.timings?.length !== 2) {
    throw new Error(`Batch student/teacher mappings failed: ${JSON.stringify(batchDetail.data)}`);
  }
  await request(`/batches/${batchMaster.data.id}/timings`, withAuth(token, {
    method: 'PUT',
    body: JSON.stringify({
      timings: [
        { dayOfWeek: 'TUESDAY', startTime: '17:00', endTime: '19:00', roomName: 'Room 2' },
      ],
    }),
  }));
  const replacedTimings = await request(`/batches/${batchMaster.data.id}`, withAuth(token));
  if (replacedTimings.data?.timings?.length !== 1 || replacedTimings.data.timings[0].dayOfWeek !== 'TUESDAY') {
    throw new Error('Batch timing replacement failed');
  }
  await request(`/batches/${batchMaster.data.id}/status`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'INACTIVE' }),
  }));
  const inactiveTeacherAssignment = await requestRaw(`/batches/${batchMaster.data.id}/teachers`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      teacherId: teacher.id,
      subjectId: subjectMaster.data.id,
      role: 'ASSISTANT',
      assignedFrom: '2026-06-02',
    }),
  }));
  if (inactiveTeacherAssignment.response.status !== 400) throw new Error('Inactive batch accepted a teacher assignment');
  await request(`/batches/${batchMaster.data.id}/status`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'ACTIVE' }),
  }));
  const batchAudit = await request(`/batches/${batchMaster.data.id}/audit`, withAuth(token));
  const batchAuditActions = new Set((batchAudit.data || []).map((entry) => entry.action));
  if (!['BATCH_CREATED', 'BATCH_TIMING_UPDATED', 'BATCH_DEACTIVATED', 'BATCH_ACTIVATED'].every((action) => batchAuditActions.has(action))) {
    throw new Error('Batch audit trail is incomplete');
  }
  const guardian = await request(`/students/${student.id}/guardians`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke Parent',
      relationship: 'FATHER',
      phone: smokePhone,
      email: `parent-${suffix}@example.com`,
      isPrimary: true,
      isEmergencyContact: true,
      canReceiveNotifications: true,
    }),
  }));
  if (!guardian.data?.id || !guardian.data?.isPrimary) throw new Error('Student guardian creation failed');
  const document = await request(`/students/${student.id}/documents`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      documentType: 'AADHAAR',
      title: 'Smoke Aadhaar',
      fileUrl: `https://example.com/smoke-${suffix}.pdf`,
      fileName: `smoke-${suffix}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 1024,
    }),
  }));
  if (!document.data?.id || document.data?.status !== 'UPLOADED') throw new Error('Student document creation failed');
  await request(`/students/${student.id}/documents/${document.data.id}`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'VERIFIED' }),
  }));
  const studentProfile = await request(`/students/${student.id}/profile`, withAuth(token));
  if (studentProfile.data?.student?.studentCode == null
    || studentProfile.data?.guardians?.length < 1
    || studentProfile.data?.batchMemberships?.length < 1
    || studentProfile.data?.documents?.length < 1
    || !Array.isArray(studentProfile.data?.alerts)) {
    throw new Error(`Student aggregate profile failed: ${JSON.stringify(studentProfile.data)}`);
  }
  const [studentAcademic, studentFees, studentAttendance, studentTests, studentCommunications] = await Promise.all([
    request(`/students/${student.id}/academic`, withAuth(token)),
    request(`/students/${student.id}/fees`, withAuth(token)),
    request(`/students/${student.id}/attendance`, withAuth(token)),
    request(`/students/${student.id}/tests`, withAuth(token)),
    request(`/students/${student.id}/communications`, withAuth(token)),
  ]);
  if (!Array.isArray(studentAcademic.data?.batchMemberships)
    || !studentFees.data?.summary
    || !studentAttendance.data?.summary
    || !studentTests.data?.summary
    || !Array.isArray(studentCommunications.data)) {
    throw new Error('Student profile tab endpoints failed');
  }

  const history = await request(`/students/${student.id}/history`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'Parent Meeting',
      title: 'Smoke parent meeting',
      detail: 'Discussed progress',
      eventDate: '2026-06-04',
    }),
  }));
  if (!history.id) throw new Error('Student history creation failed');
  const historyRows = await request(`/students/${student.id}/history`, withAuth(token));
  if (!historyRows.length) throw new Error('Student history load failed');

  const followUp = await request('/follow-ups', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      student_id: student.id,
      taskType: 'Parent Call Follow-up',
      dueDate: '2026-06-05',
      priority: 'High',
      assignedTo: 'Smoke Counsellor',
      notes: 'Smoke follow-up task',
    }),
  }));
  if (!followUp.id || followUp.status !== 'Overdue') throw new Error('Follow-up task creation failed');
  const followUps = await request(`/follow-ups?student_id=${student.id}`, withAuth(token));
  if (!followUps.length) throw new Error('Follow-up task list failed');
  const followUpEscalation = await request('/automation/follow-ups', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ minAgeDays: 1 }),
  }));
  if (!Array.isArray(followUpEscalation.candidates) || !followUpEscalation.candidates.some((row) => Number(row.id) === Number(followUp.id))) {
    throw new Error('Follow-up escalation did not include overdue task');
  }
  if (Number(followUpEscalation.escalated || 0) < 1) throw new Error('Follow-up escalation did not mark any task escalated');
  const duplicateFollowUpEscalation = await request('/automation/follow-ups', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ minAgeDays: 1 }),
  }));
  if (!duplicateFollowUpEscalation.alreadyEscalated?.some((row) => Number(row.id) === Number(followUp.id))) {
    throw new Error('Follow-up escalation did not skip task already escalated today');
  }
  const completedFollowUp = await request(`/follow-ups/${followUp.id}/complete`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({ outcome: 'Parent call completed in smoke test' }),
  }));
  if (completedFollowUp.status !== 'Done' || completedFollowUp.completionOutcome !== 'Parent call completed in smoke test') throw new Error('Follow-up completion failed');
  const followUpHistoryRows = await request(`/students/${student.id}/history`, withAuth(token));
  if (!followUpHistoryRows.some((row) => row.type === 'Follow-up' && /Parent call completed in smoke test/.test(row.detail || ''))) {
    throw new Error('Follow-up completion was not written to student history');
  }
  if (!followUpHistoryRows.some((row) => row.type === 'Follow-up Escalation' && /overdue/i.test(row.title || ''))) {
    throw new Error('Follow-up escalation was not written to student history');
  }

  const officialTemplates = await request('/whatsapp/templates/official', withAuth(token));
  if (!Array.isArray(officialTemplates.data) || officialTemplates.data.length < 7) {
    throw new Error('Official WhatsApp template registry was not seeded');
  }
  const attendanceOfficialTemplate = officialTemplates.data.find((item) => item.templateKey === 'attendance_absent');
  if (!attendanceOfficialTemplate) throw new Error('attendance_absent official template missing');
  const unapprovedSend = await requestRaw('/whatsapp/templates/send', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ templateKey: 'attendance_absent', studentId: student.id }),
  }));
  if (unapprovedSend.response.status !== 400) throw new Error('Unapproved official WhatsApp template was allowed to send');
  await request(`/whatsapp/templates/official/${attendanceOfficialTemplate.id}/submit`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({}),
  }));
  await request('/whatsapp/templates/official/sync', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({}),
  }));

  const attendanceSession = await request('/attendance/sessions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-04',
      batch: batchMaster.data.name,
      course: 'Foundation',
      subject: 'Physics',
      teacher_id: teacher.id,
      startTime: '07:00',
      endTime: '08:30',
      lectureType: 'Regular',
      remarks: 'Smoke attendance session',
    }),
  }));
  if (!attendanceSession.id || !attendanceSession.records?.length) throw new Error('Attendance session creation failed');
  const smokeAttendanceRecord = attendanceSession.records.find((record) => Number(record.student_id || record.studentId) === Number(student.id));
  if (!smokeAttendanceRecord) throw new Error('Attendance session did not include smoke student');
  await request(`/attendance/sessions/${attendanceSession.id}/records`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      submit: true,
      records: attendanceSession.records.map((record) => ({
        student_id: record.student_id || record.studentId,
        status: Number(record.student_id || record.studentId) === Number(student.id) ? 'Absent' : 'Present',
        alertStatus: Number(record.student_id || record.studentId) === Number(student.id) ? 'Not Sent' : 'Not Required',
      })),
    }),
  }));
  const submittedAttendanceSession = await request(`/attendance/sessions/${attendanceSession.id}`, withAuth(token));
  const submittedSmokeRecord = submittedAttendanceSession.records.find((record) => Number(record.student_id || record.studentId) === Number(student.id));
  await request(`/attendance/records/${submittedSmokeRecord.id}/alert`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ alertStatus: 'Sent', channel: 'WhatsApp' }),
  }));
  const alertLogs = await request('/attendance/parent-alert-logs', withAuth(token));
  if (!alertLogs.length) throw new Error('Parent alert log creation failed');
  await request('/attendance/parent-call-logs', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      student_id: student.id,
      attendance_record_id: submittedSmokeRecord.id,
      parentPhone: smokePhone,
      callOutcome: 'Connected',
      notes: 'Smoke parent call',
    }),
  }));
  const callLogs = await request('/attendance/parent-call-logs', withAuth(token));
  if (!callLogs.length) throw new Error('Parent call log creation failed');
  const correction = await request('/attendance/corrections', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      record_id: submittedSmokeRecord.id,
      newStatus: 'Excused',
      requestReason: 'Smoke correction approval',
    }),
  }));
  const attendanceDashboard = await request('/attendance/dashboard?date=2026-06-04', withAuth(token));
  if (Number(attendanceDashboard.totalLecturesToday || 0) < 1) throw new Error('Attendance dashboard did not include session');
  const attendanceReports = await request('/attendance/reports?month=2026-06', withAuth(token));
  if (!Array.isArray(attendanceReports.dailyAbsent)) throw new Error('Attendance daily absent report failed');
  if (!attendanceReports.teacherWise?.length) throw new Error('Teacher-wise attendance report failed');
  if (!attendanceReports.teacherCompletion?.length) throw new Error('Teacher attendance completion report failed');
  if (!attendanceReports.parentAlertLogs?.length) throw new Error('Attendance parent alert report failed');
  const attendanceCalendar = await request(`/attendance/calendar?batchId=${encodeURIComponent(batchMaster.data.id)}&month=6&year=2026`, withAuth(token));
  if (!attendanceCalendar.data?.sessions?.some((row) => String(row.id) === String(attendanceSession.id) && row.status === 'SUBMITTED')) {
    throw new Error('Attendance calendar did not include submitted session');
  }
  const teacherAttendanceToday = await request('/teacher/attendance/today?date=2026-06-04', withAuth(token));
  if (!teacherAttendanceToday.data?.some((row) => String(row.id) === String(attendanceSession.id))) {
    throw new Error('Teacher attendance today did not include session');
  }
  const recalculatedRisk = await request('/attendance/risk/recalculate', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ studentId: student.id, batchId: batchMaster.data.id }),
  }));
  if (!recalculatedRisk.data?.length || !recalculatedRisk.data[0].riskLevel) throw new Error('Attendance risk recalculation failed');
  const attendanceRisk = await request(`/reports/attendance-risk?batchId=${encodeURIComponent(batchMaster.data.id)}`, withAuth(token));
  if (!attendanceRisk.data?.some((row) => String(row.studentId) === String(student.id))) throw new Error('Attendance risk report failed');
  const autoFollowups = await request('/attendance/auto-followups/run', withAuth(token, { method: 'POST', body: JSON.stringify({}) }));
  if (!Array.isArray(autoFollowups.data)) throw new Error('Attendance auto follow-up run failed');
  const completionRecalculation = await request('/attendance/teacher-completion/recalculate', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ teacherId: teacher.id, month: '2026-06' }),
  }));
  if (!completionRecalculation.data?.length) throw new Error('Teacher attendance completion recalculation failed');
  const completionReport = await request('/reports/teacher-attendance-completion?month=2026-06', withAuth(token));
  if (!completionReport.data?.some((row) => String(row.teacherId) === String(teacher.id))) {
    throw new Error('Teacher attendance completion report failed');
  }
  const attendanceCommunications = await request(`/students/${student.id}/communications`, withAuth(token));
  if (!attendanceCommunications.data?.some((row) => row.eventType === 'ATTENDANCE_ABSENT')) {
    throw new Error('ParentPulse absence alert was not added to communication timeline');
  }
  const attendanceTemplateDetail = await request(`/whatsapp/templates/official/${attendanceOfficialTemplate.id}`, withAuth(token));
  const attendanceTemplateSend = attendanceTemplateDetail.data?.sends?.find((row) => row.providerMessageId);
  if (!attendanceTemplateSend) throw new Error('Official attendance template send log missing');
  await request('/webhooks/whatsapp', {
    method: 'POST',
    body: JSON.stringify({
      statuses: [{ id: attendanceTemplateSend.providerMessageId, status: 'delivered', timestamp: '1782261000', recipient_id: smokePhone }],
    }),
  });
  const deliveredTemplateDetail = await request(`/whatsapp/templates/official/${attendanceOfficialTemplate.id}`, withAuth(token));
  if (!deliveredTemplateDetail.data?.sends?.some((row) => row.providerMessageId === attendanceTemplateSend.providerMessageId && row.status === 'DELIVERED')) {
    throw new Error('WhatsApp webhook did not update official template message status');
  }
  await request('/webhooks/whatsapp', {
    method: 'POST',
    body: JSON.stringify({
      statuses: [{ id: attendanceTemplateSend.providerMessageId, status: 'read', timestamp: '1782261060', recipient_id: smokePhone }],
    }),
  });
  await request('/webhooks/whatsapp', {
    method: 'POST',
    body: JSON.stringify({
      statuses: [{ id: attendanceTemplateSend.providerMessageId, status: 'delivered', timestamp: '1782261000', recipient_id: smokePhone }],
    }),
  });
  const readTemplateDetail = await request(`/whatsapp/templates/official/${attendanceOfficialTemplate.id}`, withAuth(token));
  if (!readTemplateDetail.data?.sends?.some((row) => row.providerMessageId === attendanceTemplateSend.providerMessageId && row.status === 'READ' && row.deliveredAt && row.readAt)) {
    throw new Error('WhatsApp status ordering downgraded READ or missed implied delivery');
  }
  const inboundMessageId = `wamid.inbound.${suffix}`;
  await request('/webhooks/whatsapp', {
    method: 'POST',
    body: JSON.stringify({
      metadata: { phone_number_id: 'local-phone' },
      messages: [{
        id: inboundMessageId,
        from: smokePhone,
        timestamp: '1782261120',
        type: 'text',
        text: { body: 'Acknowledged, thank you.' },
        context: { id: attendanceTemplateSend.providerMessageId },
      }],
    }),
  });
  await request('/webhooks/whatsapp', {
    method: 'POST',
    body: JSON.stringify({
      metadata: { phone_number_id: 'local-phone' },
      messages: [{
        id: inboundMessageId,
        from: smokePhone,
        timestamp: '1782261120',
        type: 'text',
        text: { body: 'Acknowledged, thank you.' },
        context: { id: attendanceTemplateSend.providerMessageId },
      }],
    }),
  });
  const repliedTemplateDetail = await request(`/whatsapp/templates/official/${attendanceOfficialTemplate.id}`, withAuth(token));
  if (!repliedTemplateDetail.data?.sends?.some((row) => row.providerMessageId === attendanceTemplateSend.providerMessageId && row.status === 'REPLIED' && row.repliedAt)) {
    throw new Error('Inbound WhatsApp reply did not mark outbound message replied');
  }
  const studentWhatsAppTimeline = await request(`/students/${student.id}/whatsapp-timeline`, withAuth(token));
  if (!studentWhatsAppTimeline.data?.some((row) => row.direction === 'INBOUND' && row.eventType === 'PARENT_REPLY' && row.providerMessageId === inboundMessageId)) {
    throw new Error('Inbound WhatsApp reply missing from student timeline');
  }
  const webhookEvents = await request('/whatsapp/webhook-events', withAuth(token));
  if (!webhookEvents.data?.some((row) => row.providerInboundMessageId === inboundMessageId && row.processingStatus === 'PROCESSED')) {
    throw new Error('WhatsApp webhook event audit missing');
  }
  await request(`/attendance/corrections/${correction.id}/approve`, withAuth(token, { method: 'PATCH', body: JSON.stringify({}) }));

  await request('/staff-attendance/check-in', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      staff_id: teacher.id,
      branchName: 'Tembhurni',
      scheduledStart: '00:00',
      scheduledLectures: 2,
      remarks: 'Smoke check in',
    }),
  }));
  await request('/staff-attendance/check-out', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      staff_id: teacher.id,
      lecturesTaken: 2,
      remarks: 'Smoke check out',
    }),
  }));
  const staffMonthly = await request('/staff-attendance/monthly', withAuth(token));
  if (!staffMonthly.summary?.length) throw new Error('Staff attendance monthly report failed');
  const automationResult = await request('/automation/attendance', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ month: '2026-06' }),
  }));
  if (!Array.isArray(automationResult.teacherLateAlerts)) throw new Error('Attendance automation did not return teacher late alerts');
  const automationLogs = await request('/automation/logs', withAuth(token));
  if (!automationLogs.length) throw new Error('Automation logs failed');
  const batchDiscipline = await request('/automation/batch-discipline?month=2026-06', withAuth(token));
  if (!batchDiscipline.length) throw new Error('Batch discipline dashboard failed');
  const leave = await request('/leave-requests', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      staff_id: teacher.id,
      leaveType: 'Casual Leave',
      fromDate: '2026-06-10',
      toDate: '2026-06-10',
      reason: 'Smoke leave',
      replacementTeacher: 'Smoke Replacement',
    }),
  }));
  await request(`/leave-requests/${leave.id}/approve`, withAuth(token, { method: 'PATCH', body: JSON.stringify({}) }));

  const admission = await request('/admissions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      studentName: `Smoke Admission ${suffix}`,
      parentName: 'Smoke Parent',
      parentPhone: smokePhone,
      className: '10th',
      school: 'Smoke School',
      courseInterested: 'X Science',
      targetExam: 'Boards',
      branchId: 'Tembhurni',
      status: 'NEW',
      leadTemperature: 'HOT',
      source: 'Smoke test',
      nextFollowUpAt: '2026-06-05',
      estimatedRevenue: 10000,
    }),
  }));

  const feePlan = await request('/fee-plans', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      student_id: student.id,
      courseProgram: 'Foundation 6th-10th Full-Time',
      feeCategory: 'Tuition',
      paymentType: 'Installment',
      totalAmount: 10000,
      discountAmount: 0,
      dueDate: '2026-06-30',
      installmentLabel: 'Installment 1',
      components: [
        { componentName: 'Tuition Fee', amount: 7000 },
        { componentName: 'Study Material Fee', amount: 3000 },
      ],
      installments: [
        { label: '1st Installment', amount: 2500, dueDate: '2026-06-04', status: 'Pending' },
        { label: '2nd Installment', amount: 6500, dueDate: '2026-06-30', status: 'Pending' },
      ],
      notes: 'Smoke fee plan',
    }),
  }));
  if (!feePlan.id || Number(feePlan.dueAmount) !== 10000 || !feePlan.components?.length || !feePlan.installments?.length) {
    throw new Error('Fee plan creation failed');
  }

  const feeAutomationPreview = await request('/automation/fees', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ dryRun: true, sentVia: 'Smoke Preview' }),
  }));
  if (!feeAutomationPreview.summary || !Array.isArray(feeAutomationPreview.queued)) {
    throw new Error('Fee reminder automation preview failed');
  }

  const payment = await request('/fee-payments', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      fee_plan_id: feePlan.id,
      amount: 2500,
      paymentDate: '2026-06-04',
      paymentMethod: 'Cash',
      transactionId: `SMOKE-${suffix}`,
      receivedBy: 'Smoke Cashier',
      notes: 'Smoke payment',
    }),
  }));
  if (!payment.id || !payment.receiptNumber?.startsWith('PK-FEE-')) throw new Error('Fee payment receipt generation failed');

  const feeSettings = await request('/tenant/fee-settings', withAuth(token));
  if (!feeSettings.data?.academicYear || feeSettings.data.hasRazorpayKeySecret === undefined) {
    throw new Error('Tenant fee settings failed');
  }
  const updatedFeeSettings = await request('/tenant/fee-settings', withAuth(token, {
    method: 'PUT',
    body: JSON.stringify({
      receiptPrefix: 'SMK',
      defaultInstallmentCount: 3,
      defaultInstallmentGapDays: 30,
      discountApprovalRequired: true,
    }),
  }));
  if (updatedFeeSettings.data?.receiptPrefix !== 'SMK') throw new Error('Tenant fee settings update failed');

  const hardeningStructure = await request('/fee-structures', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke FeeFlow ${suffix}`,
      code: `SMOKE_FEEFLOW_${suffix}`,
      category: 'OTHER',
      academicYear: '2026-27',
      durationMonths: 3,
      totalAmount: 10000,
      admissionFee: 1000,
      tuitionFee: 9000,
      materialFee: 0,
      testSeriesFee: 0,
      technologyFee: 0,
      otherFee: 0,
      installmentsAllowed: true,
      discountAllowed: true,
      maxDiscountAmount: 2000,
      maxDiscountPercent: 20,
      installments: [
        { installmentNumber: 1, title: 'Admission installment', amount: 3333, dueAfterDays: 0 },
        { installmentNumber: 2, title: 'Installment 2', amount: 3333, dueAfterDays: 30 },
        { installmentNumber: 3, title: 'Installment 3', amount: 3334, dueAfterDays: 60 },
      ],
    }),
  }));
  if (!hardeningStructure.data?.id) throw new Error('FeeFlow structure creation failed');

  const studentFeePlan = await request(`/students/${student.id}/student-fee-plans`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      feeStructureId: hardeningStructure.data.id,
      admissionDate: new Date().toISOString(),
    }),
  }));
  if (!studentFeePlan.data?.id || studentFeePlan.data.installments?.length !== 3) {
    throw new Error('Student fee plan schedule generation failed');
  }
  if (studentFeePlan.data.installments.reduce((sum, item) => sum + Number(item.amount), 0) !== 10000) {
    throw new Error('Student fee installments do not reconcile');
  }

  const hardeningPayment = await request(`/student-fee-plans/${studentFeePlan.data.id}/payments`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      studentFeeInstallmentId: studentFeePlan.data.installments[0].id,
      amount: 1000,
      paymentMode: 'CASH',
    }),
  }));
  if (!hardeningPayment.data?.receipt?.receiptNumber?.startsWith('SMK-')) {
    throw new Error('Backend FeeFlow receipt generation failed');
  }

  const agingReport = await request('/reports/fee-defaulters-aging', withAuth(token));
  if (!agingReport.data?.summary?.dueToday || !Array.isArray(agingReport.data?.buckets?.dueToday)) {
    throw new Error('Fee defaulter aging report failed');
  }

  const discountRequest = await request('/discount-requests', withAuth(accountantToken, {
    method: 'POST',
    body: JSON.stringify({
      studentId: student.id,
      admissionId: admission.id,
      feeInvoiceId: feePlan.id,
      discountType: 'FIXED',
      discountAmount: 500,
      reason: 'Smoke approved discount',
      proofNote: 'Smoke proof',
    }),
  }));
  if (!discountRequest.data?.id || discountRequest.data.status !== 'PENDING') {
    throw new Error('Discount approval request failed');
  }
  const pendingDiscountPlan = (await request('/fee-plans', withAuth(token)))
    .find((plan) => Number(plan.id) === Number(feePlan.id));
  if (Number(pendingDiscountPlan?.discountAmount) !== 0 || Number(pendingDiscountPlan?.dueAmount) !== 7500) {
    throw new Error('Pending discount changed the fee balance');
  }
  await request(`/discount-requests/${discountRequest.data.id}/approve`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({}),
  }));
  const approvedDiscountPlan = (await request('/fee-plans', withAuth(token)))
    .find((plan) => Number(plan.id) === Number(feePlan.id));
  if (Number(approvedDiscountPlan?.discountAmount) !== 0 || Number(approvedDiscountPlan?.dueAmount) !== 7500) {
    throw new Error('Approval changed the fee balance before application');
  }
  await request(`/discount-requests/${discountRequest.data.id}/apply`, withAuth(accountantToken, {
    method: 'PATCH',
    body: JSON.stringify({}),
  }));
  const discountedPlan = (await request('/fee-plans', withAuth(token)))
    .find((plan) => Number(plan.id) === Number(feePlan.id));
  if (Number(discountedPlan?.discountAmount) !== 500 || Number(discountedPlan?.dueAmount) !== 7000) {
    throw new Error('Applied discount did not reconcile the fee ledger');
  }
  if (String(discountedPlan?.discount_request_id || discountedPlan?.discountRequestId) !== String(discountRequest.data.id)) {
    throw new Error('Applied discount request was not linked to the fee invoice');
  }
  const discountAudit = await request(`/discount-requests/${discountRequest.data.id}/audit`, withAuth(accountantToken));
  const discountAuditActions = new Set((discountAudit.data || []).map((entry) => entry.action));
  if (!['DISCOUNT_REQUESTED', 'DISCOUNT_APPROVED', 'DISCOUNT_APPLIED'].every((action) => discountAuditActions.has(action))) {
    throw new Error('Discount audit trail is incomplete');
  }

  const rejectedDiscount = await request('/discount-requests', withAuth(counsellorToken, {
    method: 'POST',
    body: JSON.stringify({
      studentId: student.id,
      feeInvoiceId: feePlan.id,
      discountType: 'PERCENT',
      discountPercent: 5,
      reason: 'Smoke rejected discount',
      proofNote: 'Smoke rejected proof',
    }),
  }));
  await request(`/discount-requests/${rejectedDiscount.data.id}/reject`, withAuth(token, {
    method: 'PATCH',
    body: JSON.stringify({ rejectionReason: 'Smoke rejection reason' }),
  }));
  const rejectedDetail = await request(`/discount-requests/${rejectedDiscount.data.id}`, withAuth(counsellorToken));
  if (rejectedDetail.data?.status !== 'REJECTED' || rejectedDetail.data?.rejectionReason !== 'Smoke rejection reason') {
    throw new Error('Discount rejection workflow failed');
  }

  const cancelledDiscount = await request('/discount-requests', withAuth(counsellorToken, {
    method: 'POST',
    body: JSON.stringify({
      studentId: student.id,
      feeInvoiceId: feePlan.id,
      discountType: 'FIXED',
      discountAmount: 100,
      reason: 'Smoke cancelled discount',
      proofNote: 'Smoke cancellation proof',
    }),
  }));
  await request(`/discount-requests/${cancelledDiscount.data.id}/cancel`, withAuth(counsellorToken, {
    method: 'PATCH',
    body: JSON.stringify({}),
  }));

  const feeSummary = await request('/fees/summary', withAuth(token));
  if (!feeSummary.totals || Number(feeSummary.totals.collected) < 2500) throw new Error('Fee summary did not include payment');

  const vendor = await request('/vendors', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      vendorName: `Smoke Vendor ${suffix}`,
      vendorType: 'Printing Vendor',
      mobileNumber: '9876543210',
      address: 'Tembhurni',
      gstNumber: 'SMOKEGST',
      bankDetails: 'Smoke bank',
      notes: 'Smoke vendor',
    }),
  }));
  if (!vendor.id) throw new Error('Vendor creation failed');
  const expense = await request('/expenses', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-04',
      branch: 'Tembhurni',
      category: 'Marketing',
      subCategory: 'Banner printing',
      expenseType: 'Variable',
      amount: 4500,
      vendor_id: vendor.id,
      paidTo: vendor.vendorName,
      vendorMobile: vendor.mobileNumber,
      paymentMode: 'Cash',
      requestedBy: 'Smoke Counsellor',
      billUploaded: true,
      gstBill: false,
      remarks: 'Smoke expense',
      status: 'Requested',
    }),
  }));
  if (!expense.id || !expense.expenseId?.startsWith('EXP-')) throw new Error('Expense creation failed');
  await request(`/expenses/${expense.id}/approve`, withAuth(token, { method: 'PATCH', body: JSON.stringify({}) }));
  await request(`/expenses/${expense.id}/pay`, withAuth(token, { method: 'PATCH', body: JSON.stringify({}) }));
  const pettyCash = await request('/petty-cash', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ date: '2026-06-04', branch: 'Tembhurni', cashFlowType: 'Cash Added', amount: 1000, remarks: 'Smoke cash add' }),
  }));
  if (!pettyCash.id) throw new Error('Petty cash entry failed');
  const expenseReports = await request('/expense-reports?month=2026-06', withAuth(token));
  if (!expenseReports.totals || Number(expenseReports.totals.totalExpenses) < 4500) throw new Error('Expense reports failed');

  const recurringTemplate = await request('/recurring-expenses', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      templateName: `Smoke Monthly Salary ${suffix}`,
      branch: 'Tembhurni',
      category: 'Salary',
      subCategory: 'Smoke Subject',
      expenseType: 'Fixed',
      amount: 1234,
      paidTo: `Smoke Teacher ${suffix}`,
      paymentMode: 'Bank Transfer',
      requestedBy: 'Smoke Admin',
      approvedBy: 'Smoke Admin',
      billUploaded: true,
      startMonth: '2026-06',
      dayOfMonth: 1,
      remarks: 'Smoke recurring salary',
    }),
  }));
  if (!recurringTemplate.id) throw new Error('Recurring expense template creation failed');
  const generatedRecurring = await request('/recurring-expenses/generate', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({ month: '2026-06' }),
  }));
  if (!generatedRecurring.created?.length) throw new Error('Recurring expense generation failed');
  const generatedRecurringExpense = generatedRecurring.created[0];

  const aiCourse = await request('/ai-lab/courses', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      courseName: `Smoke Python AI ${suffix}`,
      category: 'Python Programming',
      suitableFor: 'Class 6th onwards',
      duration: '3 months',
      exampleTopics: 'Variables, loops, functions, mini project',
      modules: [
        { moduleOrder: 1, moduleName: 'Computer basics', topics: 'Files, folders, browser', status: 'Completed' },
        { moduleOrder: 2, moduleName: 'Python basics', topics: 'Variables and loops', status: 'In Progress' },
      ],
    }),
  }));
  if (!aiCourse.id) throw new Error('AI Lab course creation failed');
  const aiLabStudent = await request('/ai-lab/students', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      student_id: student.id,
      studentName: student.name || `Smoke Student ${suffix}`,
      grade: '10th',
      school: 'Smoke School',
      parentName: 'Smoke Father',
      mobileNumber: smokePhone,
      course_id: aiCourse.id,
      courseName: aiCourse.courseName,
      batch: 'AI Lab Weekend',
      joiningDate: '2026-06-04',
      courseDuration: '3 months',
      feeType: 'Monthly',
      deviceRequired: true,
      previousCodingExperience: 'Beginner',
      skillLevel: 2,
      skillAssessment: 'Smoke skill test passed',
      status: 'Active',
    }),
  }));
  if (!aiLabStudent.id) throw new Error('AI Lab student creation failed');
  const aiAttendance = await request('/ai-lab/attendance', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      date: '2026-06-04',
      sessionType: 'Practical',
      mentor_id: teacher.id,
      mentorName: `Smoke Teacher Updated ${suffix}`,
      status: 'Present',
      deviceUsed: `SMOKE-PC-${suffix}`,
      topicPracticed: 'Loops',
      assignmentGiven: true,
      parentAlert: 'Not Sent',
    }),
  }));
  if (!aiAttendance.id) throw new Error('AI Lab attendance creation failed');
  const aiDevice = await request('/ai-lab/devices', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      deviceId: `SMOKE-PC-${suffix}`,
      deviceType: 'Desktop Computer',
      name: 'Smoke lab PC',
      branch: 'Tembhurni',
      condition: 'Working',
      status: 'Available',
    }),
  }));
  if (!aiDevice.id) throw new Error('AI Lab device creation failed');
  const aiAllocation = await request('/ai-lab/device-allocations', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      device_id: aiDevice.id,
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      date: '2026-06-04',
      sessionTime: '5 PM - 6 PM',
      conditionBefore: 'Working',
      conditionAfter: 'Working',
      mentorVerified: true,
    }),
  }));
  if (!aiAllocation.id) throw new Error('AI Lab device allocation failed');
  const aiProject = await request('/ai-lab/projects', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      mentor_id: teacher.id,
      projectName: 'Smoke Attendance Bot',
      projectType: 'Mini Project',
      startDate: '2026-06-04',
      deadline: '2026-06-30',
      status: 'Completed',
      githubLink: 'https://github.com/smoke/attendance-bot',
      demoVideo: 'https://example.com/demo',
      finalScore: 88,
      finalDemoStatus: 'Completed',
    }),
  }));
  if (!aiProject.id) throw new Error('AI Lab project creation failed');
  const aiAssignment = await request('/ai-lab/assignments', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      assignmentName: 'Smoke loops practice',
      assignmentType: 'Code File',
      dueDate: '2026-06-10',
      submissionDate: '2026-06-09',
      fileUploaded: true,
      githubLink: 'https://github.com/smoke/loops',
      mentorFeedback: 'Good logic',
      score: 9,
      status: 'Submitted',
    }),
  }));
  if (!aiAssignment.id) throw new Error('AI Lab assignment creation failed');
  const aiFeedback = await request('/ai-lab/feedback', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      mentor_id: teacher.id,
      date: '2026-06-04',
      logic: 8,
      coding: 8,
      debugging: 7,
      creativity: 8,
      presentation: 8,
      discipline: 9,
      independence: 7,
      projectWork: 9,
      remarks: 'Smoke feedback',
    }),
  }));
  if (!aiFeedback.id || Number(aiFeedback.totalScore) < 60) throw new Error('AI Lab mentor feedback failed');
  const aiPortfolio = await request('/ai-lab/portfolios', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      githubUsername: `smoke-ai-${suffix}`,
      projectRepository: 'https://github.com/smoke/attendance-bot',
      demoVideo: 'https://example.com/demo',
      portfolioPage: 'https://example.com/portfolio',
      status: 'Complete',
    }),
  }));
  if (!aiPortfolio.id) throw new Error('AI Lab portfolio creation failed');
  const aiCertificate = await request('/ai-lab/certificates', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      ai_lab_student_id: aiLabStudent.id,
      course_id: aiCourse.id,
      projectName: 'Smoke Attendance Bot',
      issueDate: '2026-06-30',
      status: 'Issued',
    }),
  }));
  if (!aiCertificate.id || !aiCertificate.certificateId?.startsWith('PK-AILAB-')) throw new Error('AI Lab certificate generation failed');
  const aiDashboard = await request('/ai-lab/dashboard', withAuth(token));
  if (!aiDashboard.totals || Number(aiDashboard.totals.students) < 1) throw new Error('AI Lab dashboard failed');

  const academicSyllabus = await request('/academic/syllabus', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      courseName: 'NEET 2026',
      subject: 'Biology',
      chapter: 'Human Physiology',
      topic: 'Digestion',
      subTopic: 'Enzymes',
      difficulty: 'Basic',
      estimatedLectures: 3,
      requiredTest: true,
      status: 'Completed',
    }),
  }));
  if (!academicSyllabus.id) throw new Error('Academic syllabus creation failed');
  const academicCalendar = await request('/academic/calendar', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      academicYear: '2026-27',
      calendarType: 'Yearly Calendar',
      title: 'Smoke syllabus completion target',
      courseName: 'NEET 2026',
      startDate: '2026-06-15',
      endDate: '2026-12-31',
      targetDate: '2026-12-31',
      notes: 'Smoke academic calendar',
    }),
  }));
  if (!academicCalendar.id) throw new Error('Academic calendar creation failed');
  const academicTimetable = await request('/academic/timetable', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      batchName: 'NEET 2026 Morning',
      courseName: 'NEET',
      subject: 'Biology',
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      dayOfWeek: 'Monday',
      timeSlot: '8:00 AM - 9:30 AM',
      room: 'Classroom 1',
      lectureType: 'Regular',
    }),
  }));
  if (!academicTimetable.id) throw new Error('Academic timetable creation failed');
  const lecturePlan = await request('/academic/lecture-plans', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-08',
      batchName: 'NEET 2026 Morning',
      courseName: 'NEET',
      subject: 'Biology',
      chapter: 'Human Physiology',
      topic: 'Digestion',
      subTopic: 'Digestive enzymes',
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      lectureType: 'Regular',
      homeworkPlanned: 'NCERT Exercise',
      testLinked: 'Weekly Test 1',
      teachingMaterial: 'Notes / PPT / Board',
    }),
  }));
  if (!lecturePlan.id) throw new Error('Academic lecture plan creation failed');
  const deliveryLog = await request('/academic/delivery-logs', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      lecture_plan_id: lecturePlan.id,
      date: '2026-06-08',
      batchName: 'NEET 2026 Morning',
      subject: 'Biology',
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      plannedTopic: 'Digestion',
      actualTopic: 'Digestion and enzymes',
      lectureCompleted: true,
      classAttendance: '42 / 50',
      homeworkGiven: true,
      doubtsSolved: 'Partial',
      notesProvided: true,
      teacherRemark: 'Need extra practice',
    }),
  }));
  if (!deliveryLog.id) throw new Error('Academic delivery log creation failed');
  const homeworkRow = await request('/academic/homework', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-08',
      batchName: 'NEET 2026 Morning',
      courseName: 'NEET',
      subject: 'Biology',
      topic: 'Digestion',
      homework: 'NCERT Exercise Q1-Q10',
      dueDate: '2026-06-09',
      submittedCount: 32,
      totalCount: 45,
      checkedBy: `Smoke Teacher Updated ${suffix}`,
      parentAlert: 'Sent',
    }),
  }));
  if (!homeworkRow.id || Number(homeworkRow.pendingStudents) !== 13) throw new Error('Academic homework creation failed');
  const academicTest = await request('/academic/tests', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      testName: `Smoke NEET Weekly Test ${suffix}`,
      date: '2026-06-14',
      courseName: 'NEET',
      batchName: 'NEET 2026 Morning',
      subjects: 'Physics, Chemistry, Biology',
      syllabusCovered: 'Digestion',
      totalMarks: 720,
      duration: '3 hours',
      resultDate: '2026-06-16',
      analysisRequired: true,
    }),
  }));
  if (!academicTest.id) throw new Error('Academic test creation failed');
  const testResult = await request('/academic/test-results', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: academicTest.id,
      student_id: student.id,
      studentName: student.name || `Smoke Student ${suffix}`,
      batchName: 'NEET 2026 Morning',
      subject: 'Biology',
      marksObtained: 285,
      totalMarks: 360,
      testRank: 5,
      weakChapter: 'Plant Physiology',
      actionNeeded: 'Doubt session',
    }),
  }));
  if (!testResult.id || Number(testResult.accuracy) < 70) throw new Error('Academic test result creation failed');
  const doubtSession = await request('/academic/doubt-sessions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-10',
      batchName: 'NEET 2026',
      subject: 'Physics',
      topic: 'Laws of Motion',
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      studentsAssigned: 12,
      reason: 'Low test score',
      sessionType: 'Weak Student Doubt',
      status: 'Completed',
      improvementChecked: true,
    }),
  }));
  if (!doubtSession.id) throw new Error('Academic doubt session creation failed');
  const teacherScoreConfig = await request('/teacher-scorecards/config', withAuth(token));
  if (!teacherScoreConfig.data?.id) throw new Error('TeacherScore config failed');
  const teacherScore = await request(`/teacher-scorecards/${teacher.id}/recalculate`, withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      periodType: 'MONTHLY',
    }),
  }));
  if (!teacherScore.data?.id || teacherScore.data.components?.length !== 8) throw new Error('TeacherScore calculation failed');
  const teacherScoreDashboard = await request('/teacher-scorecards', withAuth(token));
  if (!teacherScoreDashboard.data?.some((row) => String(row.teacherId) === String(teacher.id))) throw new Error('TeacherScore dashboard failed');
  const teacherScoreDetail = await request(`/teacher-scorecards/${teacher.id}`, withAuth(token));
  if (!teacherScoreDetail.data?.components?.every((item) => item.calculationNote)) throw new Error('TeacherScore evidence drill-down failed');
  const revisionPlan = await request('/academic/revision-plans', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      revisionDate: '2027-01-15',
      batchName: 'NEET 2027',
      subject: 'Biology',
      chapter: 'Genetics',
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      revisionType: 'Chapter Revision',
      material: 'Short notes + MCQ',
      testAfterRevision: true,
      status: 'Completed',
    }),
  }));
  if (!revisionPlan.id) throw new Error('Academic revision plan creation failed');
  const remedialAction = await request('/academic/remedial-actions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      targetType: 'Student',
      targetName: student.name || `Smoke Student ${suffix}`,
      student_id: student.id,
      batchName: 'NEET Batch',
      issue: 'Low Biology score',
      reason: 'Weak in Genetics',
      action: 'Doubt session + assignment',
      assignedTeacher: `Smoke Teacher Updated ${suffix}`,
      deadline: '2026-06-20',
      followUpTest: true,
      status: 'Open',
    }),
  }));
  if (!remedialAction.id) throw new Error('Academic remedial action creation failed');
  const academicDashboard = await request('/academic/dashboard', withAuth(token));
  if (!academicDashboard.totals || Number(academicDashboard.totals.syllabusCompletion) < 1) throw new Error('Academic dashboard failed');

  const performanceTest = await request('/test-performance/tests', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      testName: `Smoke NEET Performance Test ${suffix}`,
      testType: 'Weekly Test',
      courseName: 'NEET',
      batchName: 'NEET 2026 Morning',
      branch: 'Tembhurni',
      subject: 'Biology',
      chapters: 'Cell, Biomolecules',
      testDate: '2026-06-14',
      duration: '1 Hour',
      totalQuestions: 50,
      totalMarks: 200,
      negativeMarking: true,
      testMode: 'OMR',
      resultDate: '2026-06-16',
      status: 'Conducted',
    }),
  }));
  if (!performanceTest.id || !performanceTest.testCode?.startsWith('TEST-')) throw new Error('Performance test creation failed');
  const performanceResult = await request('/test-performance/results', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      student_id: student.id,
      studentName: student.name || `Smoke Student ${suffix}`,
      rollNumber: `PK-NEET-${suffix}`,
      courseName: 'NEET',
      batchName: 'NEET 2026 Morning',
      branch: 'Tembhurni',
      physicsMarks: 120,
      chemistryMarks: 135,
      biologyMarks: 290,
      totalMarks: 720,
      attemptedQuestions: 160,
      correctAnswers: 125,
      wrongAnswers: 35,
      blankQuestions: 20,
      strongSubject: 'Biology',
      weakSubject: 'Physics',
      weakChapter: 'Laws of Motion',
      suggestedAction: 'Physics doubt session',
      teacherRemark: 'Improve numericals',
    }),
  }));
  if (!performanceResult.id || Number(performanceResult.percentage) < 70) throw new Error('Performance result creation failed');
  const questionAnalysis = await request('/test-performance/question-analysis', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      student_id: student.id,
      questionNumber: 1,
      subject: 'Biology',
      chapter: 'Cell Biology',
      topic: 'Cell organelles',
      correctOption: 'A',
      selectedOption: 'A',
      resultStatus: 'Correct',
      marksAwarded: 4,
    }),
  }));
  if (!questionAnalysis.id) throw new Error('Question analysis creation failed');
  const parentReport = await request('/test-performance/parent-reports', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      student_id: student.id,
      studentName: student.name || `Smoke Student ${suffix}`,
      parentPhone: smokePhone,
      marksObtained: 545,
      totalMarks: 720,
      batchRank: 1,
      strongSubject: 'Biology',
      weakSubject: 'Physics',
      attendancePercent: 86,
      homeworkCompletion: 78,
      teacherRemark: 'Good progress',
      requiredAction: 'Attend Physics remedial class',
      sentVia: 'WhatsApp',
      status: 'Sent',
    }),
  }));
  if (!parentReport.id) throw new Error('Parent performance report creation failed');
  const teacherImpact = await request('/test-performance/teacher-impact', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      teacher_id: teacher.id,
      teacherName: `Smoke Teacher Updated ${suffix}`,
      subject: 'Biology',
      batchName: 'NEET 2026',
      previousAverage: 52,
      currentAverage: 68,
      weakChapterCount: 1,
      homeworkCompletion: 78,
      doubtResolution: 85,
      remarks: 'Smoke teacher impact',
    }),
  }));
  if (!teacherImpact.id || Number(teacherImpact.improvementPercent) !== 16) throw new Error('Teacher impact creation failed');
  const remedialStudent = await request('/test-performance/remedial-students', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      student_id: student.id,
      studentName: student.name || `Smoke Student ${suffix}`,
      batchName: 'NEET 2026',
      weakSubject: 'Physics',
      weakChapter: 'NLM',
      issue: 'Low accuracy',
      assignedTeacher: `Smoke Teacher Updated ${suffix}`,
      remedialDate: '2026-06-18',
      status: 'Pending',
      followUpTest: 'Required',
    }),
  }));
  if (!remedialStudent.id) throw new Error('Remedial student creation failed');
  const omrUpload = await request('/test-performance/omr-uploads', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      test_id: performanceTest.id,
      omrFileName: `smoke-omr-${suffix}.pdf`,
      processedCount: 50,
      errorCount: 1,
      status: 'Processed',
      notes: 'Smoke OMR upload',
    }),
  }));
  if (!omrUpload.id) throw new Error('OMR upload creation failed');
  const performanceDashboard = await request('/test-performance/dashboard', withAuth(token));
  if (!performanceDashboard.totals || Number(performanceDashboard.totals.testsScheduled) < 1) throw new Error('Test performance dashboard failed');

  const parentPortal = await request('/parent-portal/lookup', {
    method: 'POST',
    body: JSON.stringify({
      student_id: student.id,
      parentPhone: smokePhone,
    }),
  });
  if (!parentPortal.student || !parentPortal.attendance?.length || !parentPortal.fees?.length || !Array.isArray(parentPortal.communication)) {
    throw new Error('Parent portal lookup failed');
  }

  await Promise.all([
    request('/teachers', withAuth(token)),
    request('/students', withAuth(token)),
    request('/admissions', withAuth(token)),
    request('/teacher-reviews', withAuth(token)),
    request('/fee-plans', withAuth(token)),
    request('/fee-payments', withAuth(token)),
  ]);

  await Promise.all([
    expectAllowed('/fees/summary', accountantToken),
    expectAllowed('/fee-plans', accountantToken),
    expectAllowed('/branches', accountantToken),
    expectAllowed('/courses', counsellorToken),
    expectAllowed('/batches', teacherRoleToken),
    expectAllowed('/expenses', accountantToken),
    expectAllowed('/fee-plans', counsellorToken),
    expectAllowed('/follow-ups', counsellorToken),
    expectAllowed('/students', counsellorToken),
    expectAllowed('/admissions', counsellorToken),
    expectAllowed('/attendance/sessions', teacherRoleToken),
    expectAllowed('/academic/dashboard', teacherRoleToken),
    expectAllowed('/test-performance/dashboard', teacherRoleToken),
    expectAllowed('/teacher-reviews', teacherRoleToken),
  ]);

  await Promise.all([
    expectForbidden(`/expenses/${expense.id}/approve`, accountantToken, { method: 'PATCH', body: JSON.stringify({}) }),
    expectForbidden('/ontology/entities', accountantToken),
    expectForbidden('/branches', accountantToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'Forbidden Branch', code: `FORB-${suffix}` }),
    }),
    expectForbidden('/subjects', counsellorToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'Forbidden Subject', code: `FORB-SUB-${suffix}` }),
    }),
    expectForbidden('/discount-requests', teacherRoleToken),
    expectForbidden('/discount-requests', basicUserToken),
    expectForbidden(`/students/${student.id}`, accountantToken, { method: 'DELETE' }),
    expectForbidden('/expenses', counsellorToken),
    expectForbidden('/automation/follow-ups', counsellorToken, { method: 'POST', body: JSON.stringify({ minAgeDays: 1 }) }),
    expectForbidden('/recurring-expenses', counsellorToken, {
      method: 'POST',
      body: JSON.stringify({
        templateName: `Forbidden Salary ${suffix}`,
        branch: 'Tembhurni',
        category: 'Salary',
        subCategory: 'Forbidden',
        expenseType: 'Fixed',
        amount: 1,
        startMonth: '2026-06',
      }),
    }),
    expectForbidden('/ontology/entities', counsellorToken),
    expectForbidden('/fee-plans', teacherRoleToken),
    expectForbidden('/expenses', teacherRoleToken),
    expectForbidden('/ontology/entities', teacherRoleToken),
    expectForbidden(`/attendance/sessions/${attendanceSession.id}`, teacherRoleToken, { method: 'DELETE' }),
    expectForbidden('/users', basicUserToken),
    expectForbidden('/fee-plans', basicUserToken),
    expectForbidden('/expenses', basicUserToken),
    expectForbidden('/ontology/entities', basicUserToken),
  ]);

  await request(`/expenses/${generatedRecurringExpense.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/recurring-expenses/${recurringTemplate.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/expenses/${expense.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/petty-cash/${pettyCash.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/vendors/${vendor.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/certificates/${aiCertificate.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/portfolios/${aiPortfolio.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/feedback/${aiFeedback.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/assignments/${aiAssignment.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/projects/${aiProject.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/device-allocations/${aiAllocation.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/devices/${aiDevice.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/attendance/${aiAttendance.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/students/${aiLabStudent.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/ai-lab/courses/${aiCourse.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/remedial-actions/${remedialAction.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/revision-plans/${revisionPlan.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/doubt-sessions/${doubtSession.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/test-results/${testResult.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/tests/${academicTest.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/homework/${homeworkRow.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/delivery-logs/${deliveryLog.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/lecture-plans/${lecturePlan.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/timetable/${academicTimetable.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/calendar/${academicCalendar.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/academic/syllabus/${academicSyllabus.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/omr-uploads/${omrUpload.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/remedial-students/${remedialStudent.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/teacher-impact/${teacherImpact.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/parent-reports/${parentReport.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/question-analysis/${questionAnalysis.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/results/${performanceResult.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/test-performance/tests/${performanceTest.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/attendance/sessions/${attendanceSession.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/follow-ups/${followUp.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/student-history/${history.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/admissions/${admission.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teacher-management-actions/${managementAction.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teacher-work-controls/${workControl.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teachers/${teacher.id}`, withAuth(token, { method: 'DELETE' }));

  console.log('Smoke tests passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
