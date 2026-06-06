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

  await request('/users', withAuth(token));
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
  if (!createdUser.id || createdUser.role !== 'user') throw new Error('Admin user creation failed');

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
      batch: 'Morning',
      attendance: '95%',
      data: {
        status: 'Admitted',
        school: 'Smoke School',
        examTarget: 'Boards',
        course: 'Foundation',
        academicYear: '2026-27',
        branch: 'Tembhurni',
        fatherName: 'Smoke Father',
        motherName: 'Smoke Mother',
        primaryPhone: '9999999999',
        whatsapp: '9999999999',
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

  const attendanceSession = await request('/attendance/sessions', withAuth(token, {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-06-04',
      batch: 'Morning',
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
      parentPhone: '9999999999',
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
      name: `Smoke Admission ${suffix}`,
      program: 'X Science',
      status: 'New lead',
      source: 'Smoke test',
      data: {},
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
      discountAmount: 1000,
      discountType: 'Scholarship Discount',
      discountReason: 'Smoke scholarship approval',
      approvedBy: 'Smoke Admin',
      discountApprovedDate: '2026-06-04',
      discountProofNote: 'Smoke proof note',
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
  if (!feePlan.id || Number(feePlan.dueAmount) !== 9000 || !feePlan.components?.length || !feePlan.installments?.length) {
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
      mobileNumber: '9999999999',
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
      parentPhone: '9999999999',
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
      parentPhone: '9999999999',
    }),
  });
  if (!parentPortal.student || !parentPortal.attendance?.length || !parentPortal.fees?.length) {
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
    expectAllowed('/expenses', accountantToken),
    expectAllowed('/fee-plans', counsellorToken),
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
    expectForbidden(`/students/${student.id}`, accountantToken, { method: 'DELETE' }),
    expectForbidden('/expenses', counsellorToken),
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

  await request(`/fee-payments/${payment.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/fee-plans/${feePlan.id}`, withAuth(token, { method: 'DELETE' }));
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
  await request(`/student-history/${history.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/admissions/${admission.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/students/${student.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teacher-management-actions/${managementAction.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teacher-work-controls/${workControl.id}`, withAuth(token, { method: 'DELETE' }));
  await request(`/teachers/${teacher.id}`, withAuth(token, { method: 'DELETE' }));

  console.log('Smoke tests passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
