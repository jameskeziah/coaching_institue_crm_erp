const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const testDatabasePath = path.join(process.cwd(), 'server', 'test-student-followups.sqlite');
fs.rmSync(testDatabasePath, { force: true });

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  PORT: '4000',
  DATABASE_URL: './server/test-student-followups.sqlite',
  DATABASE_SSL: 'false',
  APP_URL: 'https://app.example.test',
  API_URL: 'https://api.example.test',
  CORS_ORIGINS: 'https://app.example.test',
  TENANT_BOOTSTRAP_SECRET: 'test-bootstrap-secret',
  WHATSAPP_ACCESS_TOKEN: 'test',
  WHATSAPP_PHONE_NUMBER_ID: 'test',
  WHATSAPP_API_VERSION: 'v22.0',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test',
  WHATSAPP_APP_SECRET: 'test',
  RAZORPAY_KEY_ID: 'test',
  RAZORPAY_KEY_SECRET: 'test',
  RAZORPAY_WEBHOOK_SECRET: 'test',
});

const { close, get, migrate, run } = require('../db');
const { createAccessToken, generateId } = require('../services/token.service');
const studentsRoutes = require('../routes/students.routes');
const legacyRoutes = require('../routes/legacy.routes');

let context;

const forbiddenRestrictedKeys = [
  'description',
  'notes',
  'riskReason',
  'risk_reason',
  'assignedTo',
  'assigned_to',
  'assignedToUserId',
  'assigned_to_user_id',
  'createdBy',
  'created_by',
  'completedBy',
  'completed_by',
  'completionOutcome',
  'completion_outcome',
  'guardianPhone',
  'parentPhone',
];

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/students', studentsRoutes);
  app.use(legacyRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function createUser(tenantId, role, username) {
  const result = await run(
    `INSERT INTO users
      (username, name, email, password, password_hash, role, tenant_id, is_active, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, 'hash', 'hash', ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [username, username, `${username}@example.test`, role, tenantId]
  );
  return {
    id: result.lastID,
    username,
    email: `${username}@example.test`,
    role,
    tenant_id: tenantId,
  };
}

function authHeader(user) {
  return {
    Authorization: `Bearer ${createAccessToken(user, generateId('ses'))}`,
  };
}

async function apiGet(pathname, user) {
  return apiRequest(pathname, user);
}

async function apiRequest(pathname, user, options = {}) {
  const response = await fetch(`${context.server.baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function assertNoForbiddenKeys(rows) {
  for (const row of rows) {
    for (const key of forbiddenRestrictedKeys) {
      assert.equal(Object.hasOwn(row, key), false, `restricted row leaked ${key}`);
    }
  }
}

test.before(async () => {
  await migrate();
  const tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  const tenantId = tenant.id;
  const users = {
    owner: await createUser(tenantId, 'owner', 'owner-followups'),
    director: await createUser(tenantId, 'director', 'director-followups'),
    admin: await createUser(tenantId, 'admin', 'admin-followups'),
    accountant: await createUser(tenantId, 'accountant', 'accountant-followups'),
    counsellor: await createUser(tenantId, 'counsellor', 'counsellor-followups'),
    otherCounsellor: await createUser(tenantId, 'counsellor', 'other-counsellor-followups'),
    teacher: await createUser(tenantId, 'teacher', 'teacher-followups'),
    user: await createUser(tenantId, 'user', 'user-followups'),
  };

  await run(`INSERT INTO branches (id, tenant_id, name, code, city, created_by) VALUES (?, ?, 'Main', 'TST', 'Bengaluru', ?)`, ['branch-followups', tenantId, users.owner.id]);
  await run(`INSERT INTO courses (id, tenant_id, name, code, course_type, class_level) VALUES (?, ?, 'NEET', 'NEET-TST', 'EXAM', '12')`, ['course-followups', tenantId]);
  await run(`INSERT INTO subjects (id, tenant_id, name, code) VALUES (?, ?, 'Physics', 'PHY-TST')`, ['subject-followups', tenantId]);
  await run(
    `INSERT INTO batches (id, tenant_id, branch_id, course_id, name, code, academic_year, start_date, end_date, capacity, status)
     VALUES (?, ?, ?, ?, 'Batch A', 'BAT-TST', '2026', '2026-01-01', '2026-12-31', 30, 'ACTIVE')`,
    ['batch-followups', tenantId, 'branch-followups', 'course-followups']
  );
  await run(`INSERT INTO teachers (tenant_id, name, subject, user_id) VALUES (?, 'Teacher Followups', 'Physics', ?)`, [tenantId, users.teacher.id]);
  const teacher = await get(`SELECT * FROM teachers WHERE tenant_id = ? AND user_id = ?`, [tenantId, String(users.teacher.id)]);

  const studentResult = await run(
    `INSERT INTO students
      (tenant_id, name, student_name, display_name, status, primary_batch_id, primary_course_id, branch_id, created_at, updated_at)
     VALUES (?, 'Student One', 'Student One', 'Student One', 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, 'batch-followups', 'course-followups', 'branch-followups']
  );
  const otherStudentResult = await run(
    `INSERT INTO students
      (tenant_id, name, student_name, display_name, status, created_at, updated_at)
     VALUES (?, 'Student Two', 'Student Two', 'Student Two', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId]
  );
  await run(
    `INSERT INTO batch_students (id, tenant_id, batch_id, student_id, joined_at, status)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'ACTIVE')`,
    ['bs-followups', tenantId, 'batch-followups', String(studentResult.lastID)]
  );
  await run(
    `INSERT INTO batch_teachers (id, tenant_id, batch_id, teacher_id, subject_id, assigned_from, status)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ACTIVE')`,
    ['bt-followups', tenantId, 'batch-followups', String(teacher.id), 'subject-followups']
  );

  const followups = [
    ['Management Review', 'OPERATIONAL', null, 'management secret'],
    ['Counselling Call', 'COUNSELLING', users.counsellor.id, 'counselling secret'],
    ['Other Counsellor Call', 'COUNSELLING', users.otherCounsellor.id, 'other counselling secret'],
    ['Academic Action', 'ACADEMIC', users.teacher.id, 'academic secret'],
    ['Fee Collection', 'FINANCIAL', null, 'financial secret'],
    ['Attendance Action', 'ATTENDANCE', users.teacher.id, 'attendance secret'],
  ];

  for (const [taskType, category, assignee, notes] of followups) {
    await run(
      `INSERT INTO follow_up_tasks
        (tenant_id, student_id, studentName, taskType, dueDate, priority, assignedTo, assigned_to_user_id,
         task_category, visibility_scope, status, notes, risk_reason, createdBy, createdAt, updatedAt)
       VALUES (?, ?, 'Student One', ?, '2026-08-01', 'High', 'Sensitive Staff', ?, ?, 'MANAGEMENT', 'Open', ?, 'private risk', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [tenantId, studentResult.lastID, taskType, assignee ? String(assignee) : null, category, notes]
    );
  }

  await run(`ALTER TABLE follow_up_tasks ADD COLUMN unexpected_secret TEXT`);
  await run(`UPDATE follow_up_tasks SET unexpected_secret = 'do-not-leak' WHERE tenant_id = ?`, [tenantId]);

  const secondTenantResult = await run(
    `INSERT INTO tenants (name, slug, subscriptionPlan, subscriptionStatus, status, createdAt, updatedAt)
     VALUES ('Other Institute', 'other-followups', 'local', 'active', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const secondTenantId = secondTenantResult.lastID;
  const secondTenantOwner = await createUser(secondTenantId, 'owner', 'other-tenant-owner-followups');
  const secondStudentResult = await run(
    `INSERT INTO students
      (tenant_id, name, student_name, display_name, status, created_at, updated_at)
     VALUES (?, 'Private Other Student', 'Private Other Student', 'Private Other Student', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId]
  );
  const secondHistoryResult = await run(
    `INSERT INTO student_history (tenant_id, student_id, type, title, detail, eventDate, createdAt)
     VALUES (?, ?, 'Private', 'Other tenant history', 'must remain private', '2026-07-01', CURRENT_TIMESTAMP)`,
    [secondTenantId, secondStudentResult.lastID]
  );
  const secondFollowupResult = await run(
    `INSERT INTO follow_up_tasks
      (tenant_id, student_id, studentName, taskType, dueDate, priority, task_category, visibility_scope, status, notes, createdBy, createdAt, updatedAt)
     VALUES (?, ?, 'Private Other Student', 'Other tenant overdue task', '2020-01-01', 'High', 'OPERATIONAL', 'MANAGEMENT', 'Open', 'must remain private', 'other-owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, secondStudentResult.lastID]
  );
  const reminderDueDateValue = new Date();
  reminderDueDateValue.setDate(reminderDueDateValue.getDate() - 7);
  const reminderDueDate = reminderDueDateValue.toISOString().slice(0, 10);
  const localFeePlanResult = await run(
    `INSERT INTO fee_plans
      (tenant_id, student_id, courseProgram, feeCategory, paymentType, totalAmount, discountAmount, dueDate, installmentLabel, createdAt, updatedAt)
     VALUES (?, ?, 'Local Course', 'Tuition', 'Installment', 1000, 0, ?, 'Local Due', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, studentResult.lastID, reminderDueDate]
  );
  const foreignFeePlanResult = await run(
    `INSERT INTO fee_plans
      (tenant_id, student_id, courseProgram, feeCategory, paymentType, totalAmount, discountAmount, dueDate, installmentLabel, createdAt, updatedAt)
     VALUES (?, ?, 'Private Foreign Course', 'Tuition', 'Installment', 900000, 0, ?, 'Foreign Due', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, secondStudentResult.lastID, reminderDueDate]
  );
  await run(
    `INSERT INTO fee_payments
      (tenant_id, fee_plan_id, student_id, amount, paymentDate, paymentMethod, receivedBy, receiptNumber, status, createdAt)
     VALUES (?, ?, ?, 100, '2026-07-01', 'Cash', 'Local Cashier', 'LOCAL-RECEIPT', 'Active', CURRENT_TIMESTAMP)`,
    [tenantId, localFeePlanResult.lastID, studentResult.lastID]
  );
  await run(
    `INSERT INTO fee_payments
      (tenant_id, fee_plan_id, student_id, amount, paymentDate, paymentMethod, receivedBy, receiptNumber, status, createdAt)
     VALUES (?, ?, ?, 800000, '2026-07-01', 'Cash', 'Foreign Cashier', 'FOREIGN-RECEIPT', 'Active', CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignFeePlanResult.lastID, secondStudentResult.lastID]
  );
  await run(
    `INSERT INTO fee_reminders
      (tenant_id, student_id, fee_plan_id, reminderType, sentVia, sentAt, status, message, createdAt)
     VALUES (?, ?, ?, 'Final Reminder', 'WhatsApp', CURRENT_TIMESTAMP, 'Failed', 'local reminder', CURRENT_TIMESTAMP)`,
    [tenantId, studentResult.lastID, localFeePlanResult.lastID]
  );
  await run(
    `INSERT INTO fee_reminders
      (tenant_id, student_id, fee_plan_id, reminderType, sentVia, sentAt, status, message, createdAt)
     VALUES (?, ?, ?, 'Final Reminder', 'WhatsApp', CURRENT_TIMESTAMP, 'Failed', 'private foreign reminder', CURRENT_TIMESTAMP)`,
    [secondTenantId, secondStudentResult.lastID, foreignFeePlanResult.lastID]
  );
  await run(
    `INSERT INTO fee_audit_logs
      (tenant_id, entityType, entityId, action, newValue, changedBy, createdAt)
     VALUES (?, 'fee_plan', ?, 'local_action', '{"scope":"local"}', 'Local Owner', CURRENT_TIMESTAMP)`,
    [tenantId, localFeePlanResult.lastID]
  );
  await run(
    `INSERT INTO fee_audit_logs
      (tenant_id, entityType, entityId, action, newValue, changedBy, createdAt)
     VALUES (?, 'fee_plan', ?, 'foreign_private_action', '{"scope":"foreign"}', 'Foreign Owner', CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignFeePlanResult.lastID]
  );
  const attendanceMonth = new Date().toISOString().slice(0, 7);
  const localSessionResult = await run(
    `INSERT INTO attendance_sessions (tenant_id, date, batch, course, subject, status, createdAt, updatedAt)
     VALUES (?, ?, 'Local Batch', 'Local Course', 'Physics', 'Submitted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, `${attendanceMonth}-01`]
  );
  const foreignSessionResult = await run(
    `INSERT INTO attendance_sessions (tenant_id, date, batch, course, subject, status, createdAt, updatedAt)
     VALUES (?, ?, 'Private Foreign Batch', 'Private Foreign Course', 'Physics', 'Submitted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, `${attendanceMonth}-01`]
  );
  const localAttendanceResult = await run(
    `INSERT INTO attendance_records (tenant_id, session_id, student_id, status, updatedAt)
     VALUES (?, ?, ?, 'Present', CURRENT_TIMESTAMP)`,
    [tenantId, localSessionResult.lastID, studentResult.lastID]
  );
  const foreignAttendanceResult = await run(
    `INSERT INTO attendance_records (tenant_id, session_id, student_id, status, updatedAt)
     VALUES (?, ?, ?, 'Absent', CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignSessionResult.lastID, secondStudentResult.lastID]
  );
  const localCorrectionResult = await run(
    `INSERT INTO attendance_correction_requests
      (tenant_id, record_id, session_id, student_id, oldStatus, newStatus, requestReason, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, 'Present', 'Absent', 'Local correction', 'Pending', 'Local Owner', CURRENT_TIMESTAMP)`,
    [tenantId, localAttendanceResult.lastID, localSessionResult.lastID, studentResult.lastID]
  );
  const foreignCorrectionResult = await run(
    `INSERT INTO attendance_correction_requests
      (tenant_id, record_id, session_id, student_id, oldStatus, newStatus, requestReason, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, 'Absent', 'Present', 'Private foreign correction', 'Pending', 'Foreign Owner', CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignAttendanceResult.lastID, foreignSessionResult.lastID, secondStudentResult.lastID]
  );
  const localAutomationResult = await run(
    `INSERT INTO automation_logs (tenant_id, automationType, targetType, targetId, message, status, createdAt)
     VALUES (?, 'Local Automation', 'Student', ?, 'local automation message', 'Queued', CURRENT_TIMESTAMP)`,
    [tenantId, studentResult.lastID]
  );
  const foreignAutomationResult = await run(
    `INSERT INTO automation_logs (tenant_id, automationType, targetType, targetId, message, status, createdAt)
     VALUES (?, 'Private Foreign Automation', 'Student', ?, 'private foreign automation message', 'Queued', CURRENT_TIMESTAMP)`,
    [secondTenantId, secondStudentResult.lastID]
  );
  const foreignTeacherResult = await run(
    `INSERT INTO teachers (tenant_id, name, subject, month, data, updatedAt)
     VALUES (?, 'Private Foreign Teacher', 'Chemistry', '2026-07', '{}', CURRENT_TIMESTAMP)`,
    [secondTenantId]
  );
  const localWorkControlResult = await run(
    `INSERT INTO teacher_work_controls (teacher_id, controlType, title, status, createdAt, updatedAt)
     VALUES (?, 'Local Control', 'Local teacher control', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [teacher.id]
  );
  const foreignWorkControlResult = await run(
    `INSERT INTO teacher_work_controls (teacher_id, controlType, title, status, createdAt, updatedAt)
     VALUES (?, 'Private Control', 'Private foreign control', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [foreignTeacherResult.lastID]
  );
  const localManagementActionResult = await run(
    `INSERT INTO teacher_management_actions (teacher_id, month, actionType, reason, status, createdAt, updatedAt)
     VALUES (?, '2026-07', 'Local Action', 'Local reason', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [teacher.id]
  );
  const foreignManagementActionResult = await run(
    `INSERT INTO teacher_management_actions (teacher_id, month, actionType, reason, status, createdAt, updatedAt)
     VALUES (?, '2026-07', 'Private Foreign Action', 'Private reason', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [foreignTeacherResult.lastID]
  );
  const localReviewResult = await run(
    `INSERT INTO teacher_reviews (teacher_id, month, scores, createdAt, updatedAt)
     VALUES (?, '2026-07', '{"local":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [teacher.id]
  );
  const foreignReviewResult = await run(
    `INSERT INTO teacher_reviews (teacher_id, month, scores, createdAt, updatedAt)
     VALUES (?, '2026-07', '{"foreign":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [foreignTeacherResult.lastID]
  );
  const attendanceDate = new Date().toISOString().slice(0, 10);
  await run(
    `INSERT INTO staff_attendance_records (tenant_id, staff_id, staffName, date, checkIn, status, createdAt, updatedAt)
     VALUES (?, ?, 'Teacher Followups', ?, '08:00', 'Present', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, teacher.id, attendanceDate]
  );
  await run(
    `INSERT INTO staff_attendance_records (tenant_id, staff_id, staffName, date, checkIn, status, createdAt, updatedAt)
     VALUES (?, ?, 'Private Foreign Teacher', ?, '08:00', 'Absent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignTeacherResult.lastID, attendanceDate]
  );
  const localLeaveResult = await run(
    `INSERT INTO leave_requests (tenant_id, staff_id, staffName, leaveType, fromDate, toDate, reason, status, createdAt, updatedAt)
     VALUES (?, ?, 'Teacher Followups', 'Casual', '2026-07-20', '2026-07-20', 'Local leave', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, teacher.id]
  );
  const foreignLeaveResult = await run(
    `INSERT INTO leave_requests (tenant_id, staff_id, staffName, leaveType, fromDate, toDate, reason, status, createdAt, updatedAt)
     VALUES (?, ?, 'Private Foreign Teacher', 'Casual', '2026-07-20', '2026-07-20', 'Private foreign leave', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignTeacherResult.lastID]
  );
  const localPerformanceTestResult = await run(
    `INSERT INTO performance_tests (tenant_id, testCode, testName, courseName, batchName, testDate, totalMarks, status, createdAt, updatedAt)
     VALUES (?, 'LOCAL-TEST', 'Local Performance Test', 'Local Course', 'Local Batch', '2026-07-10', 100, 'Conducted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId]
  );
  const foreignPerformanceTestResult = await run(
    `INSERT INTO performance_tests (tenant_id, testCode, testName, courseName, batchName, testDate, totalMarks, status, createdAt, updatedAt)
     VALUES (?, 'FOREIGN-TEST', 'Private Foreign Performance Test', 'Private Course', 'Private Batch', '2026-07-10', 100, 'Conducted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId]
  );
  const localPerformanceResult = await run(
    `INSERT INTO performance_results (tenant_id, test_id, student_id, studentName, status, marksObtained, totalMarks, percentage, accuracy, createdAt, updatedAt)
     VALUES (?, ?, ?, 'Student One', 'Present', 80, 100, 80, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [tenantId, localPerformanceTestResult.lastID, studentResult.lastID]
  );
  const foreignPerformanceResult = await run(
    `INSERT INTO performance_results (tenant_id, test_id, student_id, studentName, status, marksObtained, totalMarks, percentage, accuracy, createdAt, updatedAt)
     VALUES (?, ?, ?, 'Private Other Student', 'Present', 99, 100, 99, 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignPerformanceTestResult.lastID, secondStudentResult.lastID]
  );
  const localQuestionResult = await run(
    `INSERT INTO question_analysis (tenant_id, test_id, student_id, questionNumber, chapter, resultStatus, marksAwarded, createdAt)
     VALUES (?, ?, ?, 1, 'Local Chapter', 'Correct', 4, CURRENT_TIMESTAMP)`,
    [tenantId, localPerformanceTestResult.lastID, studentResult.lastID]
  );
  const foreignQuestionResult = await run(
    `INSERT INTO question_analysis (tenant_id, test_id, student_id, questionNumber, chapter, resultStatus, marksAwarded, createdAt)
     VALUES (?, ?, ?, 1, 'Private Foreign Chapter', 'Correct', 4, CURRENT_TIMESTAMP)`,
    [secondTenantId, foreignPerformanceTestResult.lastID, secondStudentResult.lastID]
  );
  const localParentReportResult = await run(
    `INSERT INTO parent_report_logs (tenant_id, test_id, student_id, studentName, parentPhone, marksObtained, totalMarks, sentAt, status)
     VALUES (?, ?, ?, 'Student One', '9000000001', 80, 100, CURRENT_TIMESTAMP, 'Sent')`,
    [tenantId, localPerformanceTestResult.lastID, studentResult.lastID]
  );
  const foreignParentReportResult = await run(
    `INSERT INTO parent_report_logs (tenant_id, test_id, student_id, studentName, parentPhone, marksObtained, totalMarks, sentAt, status)
     VALUES (?, ?, ?, 'Private Other Student', '9888888888', 99, 100, CURRENT_TIMESTAMP, 'Sent')`,
    [secondTenantId, foreignPerformanceTestResult.lastID, secondStudentResult.lastID]
  );
  const localImpactResult = await run(`INSERT INTO teacher_result_impact (tenant_id, test_id, teacher_id, teacherName, subject, batchName, createdAt, updatedAt) VALUES (?, ?, ?, 'Teacher Followups', 'Physics', 'Local Batch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localPerformanceTestResult.lastID, teacher.id]);
  const foreignImpactResult = await run(`INSERT INTO teacher_result_impact (tenant_id, test_id, teacher_id, teacherName, subject, batchName, createdAt, updatedAt) VALUES (?, ?, ?, 'Private Foreign Teacher', 'Chemistry', 'Private Batch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignPerformanceTestResult.lastID, foreignTeacherResult.lastID]);
  const localRemedialResult = await run(`INSERT INTO remedial_students (tenant_id, test_id, student_id, studentName, issue, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Student One', 'Local issue', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localPerformanceTestResult.lastID, studentResult.lastID]);
  const foreignRemedialResult = await run(`INSERT INTO remedial_students (tenant_id, test_id, student_id, studentName, issue, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Private Other Student', 'Private foreign issue', 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignPerformanceTestResult.lastID, secondStudentResult.lastID]);
  const localOmrResult = await run(`INSERT INTO omr_uploads (tenant_id, test_id, omrFileName, uploadedAt, status) VALUES (?, ?, 'local.omr', CURRENT_TIMESTAMP, 'Processed')`, [tenantId, localPerformanceTestResult.lastID]);
  const foreignOmrResult = await run(`INSERT INTO omr_uploads (tenant_id, test_id, omrFileName, uploadedAt, status) VALUES (?, ?, 'private-foreign.omr', CURRENT_TIMESTAMP, 'Processed')`, [secondTenantId, foreignPerformanceTestResult.lastID]);
  const localAcademicTestResult = await run(`INSERT INTO test_calendars (tenant_id, testName, date, batchName, createdAt, updatedAt) VALUES (?, 'Local Academic Test', '2026-07-11', 'Local Batch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId]);
  const foreignAcademicTestResult = await run(`INSERT INTO test_calendars (tenant_id, testName, date, batchName, createdAt, updatedAt) VALUES (?, 'Private Foreign Academic Test', '2026-07-11', 'Private Batch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId]);
  const localAcademicResult = await run(`INSERT INTO student_test_results (tenant_id, test_id, student_id, studentName, subject, marksObtained, totalMarks, createdAt, updatedAt) VALUES (?, ?, ?, 'Student One', 'Physics', 80, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localAcademicTestResult.lastID, studentResult.lastID]);
  const foreignAcademicResult = await run(`INSERT INTO student_test_results (tenant_id, test_id, student_id, studentName, subject, marksObtained, totalMarks, createdAt, updatedAt) VALUES (?, ?, ?, 'Private Other Student', 'Chemistry', 99, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignAcademicTestResult.lastID, secondStudentResult.lastID]);
  const localDoubtResult = await run(`INSERT INTO doubt_sessions (tenant_id, date, batchName, subject, topic, teacher_id, teacherName, status, createdAt, updatedAt) VALUES (?, '2026-07-12', 'Local Batch', 'Physics', 'Local Doubt', ?, 'Teacher Followups', 'Scheduled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, teacher.id]);
  const foreignDoubtResult = await run(`INSERT INTO doubt_sessions (tenant_id, date, batchName, subject, topic, teacher_id, teacherName, status, createdAt, updatedAt) VALUES (?, '2026-07-12', 'Private Batch', 'Chemistry', 'Private Foreign Doubt', ?, 'Private Foreign Teacher', 'Scheduled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignTeacherResult.lastID]);
  const localRevisionResult = await run(`INSERT INTO revision_plans (tenant_id, revisionDate, batchName, subject, chapter, teacher_id, teacherName, status, createdAt, updatedAt) VALUES (?, '2026-07-13', 'Local Batch', 'Physics', 'Local Chapter', ?, 'Teacher Followups', 'Planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, teacher.id]);
  const foreignRevisionResult = await run(`INSERT INTO revision_plans (tenant_id, revisionDate, batchName, subject, chapter, teacher_id, teacherName, status, createdAt, updatedAt) VALUES (?, '2026-07-13', 'Private Batch', 'Chemistry', 'Private Foreign Chapter', ?, 'Private Foreign Teacher', 'Planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignTeacherResult.lastID]);
  const localAcademicRemedialResult = await run(`INSERT INTO remedial_actions (tenant_id, targetType, targetName, student_id, issue, action, status, createdAt, updatedAt) VALUES (?, 'Student', 'Student One', ?, 'Local weakness', 'Local action', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, studentResult.lastID]);
  const foreignAcademicRemedialResult = await run(`INSERT INTO remedial_actions (tenant_id, targetType, targetName, student_id, issue, action, status, createdAt, updatedAt) VALUES (?, 'Student', 'Private Other Student', ?, 'Private foreign weakness', 'Private action', 'Open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, secondStudentResult.lastID]);
  const localAiCourseResult = await run(`INSERT INTO ai_lab_courses (tenant_id, courseName, status, createdAt, updatedAt) VALUES (?, 'Local AI Course', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId]);
  const foreignAiCourseResult = await run(`INSERT INTO ai_lab_courses (tenant_id, courseName, status, createdAt, updatedAt) VALUES (?, 'Private Foreign AI Course', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId]);
  const localAiStudentResult = await run(`INSERT INTO ai_lab_students (tenant_id, student_id, studentName, course_id, courseName, status, createdAt, updatedAt) VALUES (?, ?, 'Student One', ?, 'Local AI Course', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, studentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiStudentResult = await run(`INSERT INTO ai_lab_students (tenant_id, student_id, studentName, course_id, courseName, status, createdAt, updatedAt) VALUES (?, ?, 'Private Other Student', ?, 'Private Foreign AI Course', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, secondStudentResult.lastID, foreignAiCourseResult.lastID]);
  const localAiAttendanceResult = await run(`INSERT INTO ai_lab_attendance (tenant_id, ai_lab_student_id, course_id, date, status, createdAt) VALUES (?, ?, ?, '2026-07-14', 'Present', CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiAttendanceResult = await run(`INSERT INTO ai_lab_attendance (tenant_id, ai_lab_student_id, course_id, date, status, createdAt) VALUES (?, ?, ?, '2026-07-14', 'Present', CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID, foreignAiCourseResult.lastID]);
  const localAiDeviceResult = await run(`INSERT INTO ai_lab_devices (tenant_id, deviceId, deviceType, status, createdAt, updatedAt) VALUES (?, 'LOCAL-DEVICE', 'Laptop', 'Available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId]);
  const foreignAiDeviceResult = await run(`INSERT INTO ai_lab_devices (tenant_id, deviceId, deviceType, status, createdAt, updatedAt) VALUES (?, 'FOREIGN-DEVICE', 'Laptop', 'Available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId]);
  const localAiProjectResult = await run(`INSERT INTO ai_lab_projects (tenant_id, ai_lab_student_id, course_id, projectName, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Local AI Project', 'Development', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiProjectResult = await run(`INSERT INTO ai_lab_projects (tenant_id, ai_lab_student_id, course_id, projectName, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Private Foreign AI Project', 'Development', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID, foreignAiCourseResult.lastID]);
  const localAiAssignmentResult = await run(`INSERT INTO ai_lab_assignments (tenant_id, ai_lab_student_id, course_id, assignmentName, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Local Assignment', 'Assigned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiAssignmentResult = await run(`INSERT INTO ai_lab_assignments (tenant_id, ai_lab_student_id, course_id, assignmentName, status, createdAt, updatedAt) VALUES (?, ?, ?, 'Private Foreign Assignment', 'Assigned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID, foreignAiCourseResult.lastID]);
  const localAiFeedbackResult = await run(`INSERT INTO ai_lab_mentor_feedback (tenant_id, ai_lab_student_id, course_id, date, remarks, createdAt) VALUES (?, ?, ?, '2026-07-14', 'Local feedback', CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiFeedbackResult = await run(`INSERT INTO ai_lab_mentor_feedback (tenant_id, ai_lab_student_id, course_id, date, remarks, createdAt) VALUES (?, ?, ?, '2026-07-14', 'Private foreign feedback', CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID, foreignAiCourseResult.lastID]);
  const localAiPortfolioResult = await run(`INSERT INTO ai_lab_portfolios (tenant_id, ai_lab_student_id, githubUsername, status, createdAt, updatedAt) VALUES (?, ?, 'local-github', 'Complete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID]);
  const foreignAiPortfolioResult = await run(`INSERT INTO ai_lab_portfolios (tenant_id, ai_lab_student_id, githubUsername, status, createdAt, updatedAt) VALUES (?, ?, 'private-foreign-github', 'Complete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID]);
  const localAiCertificateResult = await run(`INSERT INTO ai_lab_certificates (tenant_id, ai_lab_student_id, course_id, certificateId, status, createdAt, updatedAt) VALUES (?, ?, ?, 'LOCAL-CERT', 'Issued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId, localAiStudentResult.lastID, localAiCourseResult.lastID]);
  const foreignAiCertificateResult = await run(`INSERT INTO ai_lab_certificates (tenant_id, ai_lab_student_id, course_id, certificateId, status, createdAt, updatedAt) VALUES (?, ?, ?, 'FOREIGN-CERT', 'Issued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [secondTenantId, foreignAiStudentResult.lastID, foreignAiCourseResult.lastID]);

  context = {
    tenantId,
    users,
    studentId: studentResult.lastID,
    otherStudentId: otherStudentResult.lastID,
    secondTenantId,
    secondTenantOwner,
    secondTenantStudentId: secondStudentResult.lastID,
    secondTenantHistoryId: secondHistoryResult.lastID,
    secondTenantFollowupId: secondFollowupResult.lastID,
    localFeePlanId: localFeePlanResult.lastID,
    foreignFeePlanId: foreignFeePlanResult.lastID,
    attendanceMonth,
    localCorrectionId: localCorrectionResult.lastID,
    foreignCorrectionId: foreignCorrectionResult.lastID,
    foreignAttendanceId: foreignAttendanceResult.lastID,
    localAutomationId: localAutomationResult.lastID,
    foreignAutomationId: foreignAutomationResult.lastID,
    foreignTeacherId: foreignTeacherResult.lastID,
    localWorkControlId: localWorkControlResult.lastID,
    foreignWorkControlId: foreignWorkControlResult.lastID,
    localManagementActionId: localManagementActionResult.lastID,
    foreignManagementActionId: foreignManagementActionResult.lastID,
    localReviewId: localReviewResult.lastID,
    foreignReviewId: foreignReviewResult.lastID,
    attendanceDate,
    localLeaveId: localLeaveResult.lastID,
    foreignLeaveId: foreignLeaveResult.lastID,
    localPerformanceTestId: localPerformanceTestResult.lastID,
    foreignPerformanceTestId: foreignPerformanceTestResult.lastID,
    localPerformanceResultId: localPerformanceResult.lastID,
    foreignPerformanceResultId: foreignPerformanceResult.lastID,
    localQuestionId: localQuestionResult.lastID,
    foreignQuestionId: foreignQuestionResult.lastID,
    localParentReportId: localParentReportResult.lastID,
    foreignParentReportId: foreignParentReportResult.lastID,
    localImpactId: localImpactResult.lastID,
    foreignImpactId: foreignImpactResult.lastID,
    localRemedialId: localRemedialResult.lastID,
    foreignRemedialId: foreignRemedialResult.lastID,
    localOmrId: localOmrResult.lastID,
    foreignOmrId: foreignOmrResult.lastID,
    foreignAcademicTestId: foreignAcademicTestResult.lastID,
    localAcademicResultId: localAcademicResult.lastID,
    foreignAcademicResultId: foreignAcademicResult.lastID,
    localDoubtId: localDoubtResult.lastID,
    foreignDoubtId: foreignDoubtResult.lastID,
    localRevisionId: localRevisionResult.lastID,
    foreignRevisionId: foreignRevisionResult.lastID,
    localAcademicRemedialId: localAcademicRemedialResult.lastID,
    foreignAcademicRemedialId: foreignAcademicRemedialResult.lastID,
    localAiCourseId: localAiCourseResult.lastID,
    foreignAiCourseId: foreignAiCourseResult.lastID,
    localAiStudentId: localAiStudentResult.lastID,
    foreignAiStudentId: foreignAiStudentResult.lastID,
    localAiAttendanceId: localAiAttendanceResult.lastID,
    foreignAiAttendanceId: foreignAiAttendanceResult.lastID,
    localAiDeviceId: localAiDeviceResult.lastID,
    foreignAiDeviceId: foreignAiDeviceResult.lastID,
    localAiProjectId: localAiProjectResult.lastID,
    foreignAiProjectId: foreignAiProjectResult.lastID,
    localAiAssignmentId: localAiAssignmentResult.lastID,
    foreignAiAssignmentId: foreignAiAssignmentResult.lastID,
    localAiFeedbackId: localAiFeedbackResult.lastID,
    foreignAiFeedbackId: foreignAiFeedbackResult.lastID,
    localAiPortfolioId: localAiPortfolioResult.lastID,
    foreignAiPortfolioId: foreignAiPortfolioResult.lastID,
    localAiCertificateId: localAiCertificateResult.lastID,
    foreignAiCertificateId: foreignAiCertificateResult.lastID,
    server: await startServer(),
  };
});

test('management roles receive explicit full follow-up DTOs', async () => {
  for (const role of ['owner', 'director', 'admin']) {
    const { response, body } = await apiGet(`/api/students/${context.studentId}/followups`, context.users[role]);
    assert.equal(response.status, 200);
    assert.equal(body.data.length, 6);
    assert.equal(Object.hasOwn(body.data[0], 'unexpected_secret'), false);
    assert.equal(Object.hasOwn(body.data[0], 'notes'), true);
  }
});

test('accountant and basic user cannot access student follow-ups', async () => {
  for (const role of ['accountant', 'user']) {
    const { response } = await apiGet(`/api/students/${context.studentId}/followups`, context.users[role]);
    assert.equal(response.status, 403);
  }
});

test('counsellor receives only assigned counselling task reduced DTO', async () => {
  const { response, body } = await apiGet(`/api/students/${context.studentId}/followups`, context.users.counsellor);
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.map((row) => row.type), ['Counselling Call']);
  assertNoForbiddenKeys(body.data);
});

test('teacher receives only academic fields for assigned students and 404 for unassigned students', async () => {
  const assigned = await apiGet(`/api/students/${context.studentId}/followups`, context.users.teacher);
  assert.equal(assigned.response.status, 200);
  assert.deepEqual(assigned.body.data.map((row) => row.type), ['Academic Action']);
  assertNoForbiddenKeys(assigned.body.data);

  const unassigned = await apiGet(`/api/students/${context.otherStudentId}/followups`, context.users.teacher);
  assert.equal(unassigned.response.status, 404);
});

test('profile and attendance do not reintroduce full follow-up rows for teachers', async () => {
  const profile = await apiGet(`/api/students/${context.studentId}/profile`, context.users.teacher);
  assert.equal(profile.response.status, 200);
  assertNoForbiddenKeys(profile.body.data.recentFollowups);
  assert.equal(profile.body.data.guardians.length, 0);
  assert.equal(profile.body.data.documents.length, 0);
  assert.equal(Object.hasOwn(profile.body.data, 'feeSummary'), false);

  const attendance = await apiGet(`/api/students/${context.studentId}/attendance`, context.users.teacher);
  assert.equal(attendance.response.status, 200);
  assertNoForbiddenKeys(attendance.body.data.followups);
  assert.equal(Object.hasOwn(attendance.body.data, 'parentAlerts'), false);
});

test('management users cannot read or mutate another tenant student history and follow-ups', async () => {
  const owner = context.users.owner;

  const profile = await apiGet(`/api/students/${context.secondTenantStudentId}/profile`, owner);
  assert.equal(profile.response.status, 404);

  const history = await apiGet(`/api/students/${context.secondTenantStudentId}/history`, owner);
  assert.equal(history.response.status, 404);

  const updateHistory = await apiRequest(`/api/student-history/${context.secondTenantHistoryId}`, owner, {
    method: 'PUT',
    body: JSON.stringify({ type: 'Tampered', title: 'Tampered', detail: 'Tampered', eventDate: '2026-07-02' }),
  });
  assert.equal(updateHistory.response.status, 404);

  const deleteHistory = await apiRequest(`/api/student-history/${context.secondTenantHistoryId}`, owner, { method: 'DELETE' });
  assert.equal(deleteHistory.response.status, 404);

  const updateFollowup = await apiRequest(`/api/follow-ups/${context.secondTenantFollowupId}`, owner, {
    method: 'PUT',
    body: JSON.stringify({ taskType: 'Tampered', dueDate: '2026-07-03' }),
  });
  assert.equal(updateFollowup.response.status, 404);

  const completeFollowup = await apiRequest(`/api/follow-ups/${context.secondTenantFollowupId}/complete`, owner, {
    method: 'PATCH',
    body: JSON.stringify({ outcome: 'Tampered' }),
  });
  assert.equal(completeFollowup.response.status, 404);

  const deleteFollowup = await apiRequest(`/api/follow-ups/${context.secondTenantFollowupId}`, owner, { method: 'DELETE' });
  assert.equal(deleteFollowup.response.status, 404);

  const storedHistory = await get(`SELECT * FROM student_history WHERE id = ? AND tenant_id = ?`, [context.secondTenantHistoryId, context.secondTenantId]);
  const storedFollowup = await get(`SELECT * FROM follow_up_tasks WHERE id = ? AND tenant_id = ?`, [context.secondTenantFollowupId, context.secondTenantId]);
  assert.equal(storedHistory.title, 'Other tenant history');
  assert.equal(storedFollowup.taskType, 'Other tenant overdue task');
  assert.equal(storedFollowup.status, 'Open');
});

test('follow-up automation only enumerates and escalates the authenticated tenant', async () => {
  const before = await get(`SELECT lastEscalatedAt, escalationCount FROM follow_up_tasks WHERE id = ?`, [context.secondTenantFollowupId]);
  const result = await apiRequest('/api/automation/follow-ups', context.users.owner, {
    method: 'POST',
    body: JSON.stringify({ minAgeDays: 1 }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.candidates.some((row) => Number(row.id) === Number(context.secondTenantFollowupId)), false);

  const after = await get(`SELECT lastEscalatedAt, escalationCount FROM follow_up_tasks WHERE id = ?`, [context.secondTenantFollowupId]);
  assert.deepEqual(after, before);
  const foreignHistory = await get(
    `SELECT id FROM student_history WHERE tenant_id = ? AND student_id = ? AND type = 'Follow-up Escalation'`,
    [context.secondTenantId, context.secondTenantStudentId]
  );
  assert.equal(foreignHistory, undefined);
});

test('finance reports, reminders, automation, provider status, and audit logs remain tenant-scoped', async () => {
  const accountant = context.users.accountant;

  const reports = await apiGet('/api/fees/reports', accountant);
  assert.equal(reports.response.status, 200);
  assert.equal(reports.body.staffWise.some((row) => row.staff === 'Local Cashier'), true);
  assert.equal(reports.body.staffWise.some((row) => row.staff === 'Foreign Cashier'), false);
  assert.equal(reports.body.pendingFees.some((row) => row.course === 'Private Foreign Course'), false);

  const reminders = await apiGet('/api/fees/reminders', accountant);
  assert.equal(reminders.response.status, 200);
  assert.equal(reminders.body.some((row) => Number(row.feePlanId) === Number(context.localFeePlanId)), true);
  assert.equal(reminders.body.some((row) => Number(row.feePlanId) === Number(context.foreignFeePlanId)), false);

  const automation = await apiRequest('/api/automation/fees', accountant, {
    method: 'POST',
    body: JSON.stringify({ dryRun: true, sendNow: false }),
  });
  assert.equal(automation.response.status, 200);
  const evaluatedAutomationRows = [...automation.body.queued, ...automation.body.skipped];
  assert.equal(evaluatedAutomationRows.some((row) => Number(row.fee_plan_id) === Number(context.localFeePlanId)), true);
  assert.equal(evaluatedAutomationRows.some((row) => Number(row.fee_plan_id) === Number(context.foreignFeePlanId)), false);

  const whatsappStatus = await apiGet('/api/whatsapp/status', accountant);
  assert.equal(whatsappStatus.response.status, 200);
  assert.equal(whatsappStatus.body.recentFailures.some((row) => row.message === 'local reminder'), true);
  assert.equal(whatsappStatus.body.recentFailures.some((row) => row.message === 'private foreign reminder'), false);

  const auditLogs = await apiGet('/api/fees/audit-logs', accountant);
  assert.equal(auditLogs.response.status, 200);
  assert.equal(auditLogs.body.some((row) => row.action === 'local_action'), true);
  assert.equal(auditLogs.body.some((row) => row.action === 'foreign_private_action'), false);
});

test('attendance corrections, automation logs, and batch discipline remain tenant-scoped', async () => {
  const owner = context.users.owner;

  const corrections = await apiGet('/api/attendance/corrections', owner);
  assert.equal(corrections.response.status, 200);
  assert.equal(corrections.body.some((row) => Number(row.id) === Number(context.localCorrectionId)), true);
  assert.equal(corrections.body.some((row) => Number(row.id) === Number(context.foreignCorrectionId)), false);

  const createForeignCorrection = await apiRequest('/api/attendance/corrections', owner, {
    method: 'POST',
    body: JSON.stringify({ record_id: context.foreignAttendanceId, newStatus: 'Present', requestReason: 'Cross-tenant attempt' }),
  });
  assert.equal(createForeignCorrection.response.status, 404);

  const approveForeign = await apiRequest(`/api/attendance/corrections/${context.foreignCorrectionId}/approve`, owner, { method: 'PATCH' });
  const rejectForeign = await apiRequest(`/api/attendance/corrections/${context.foreignCorrectionId}/reject`, owner, { method: 'PATCH' });
  assert.equal(approveForeign.response.status, 404);
  assert.equal(rejectForeign.response.status, 404);

  const foreignCorrection = await get(`SELECT status FROM attendance_correction_requests WHERE id = ? AND tenant_id = ?`, [context.foreignCorrectionId, context.secondTenantId]);
  const foreignAttendance = await get(`SELECT status FROM attendance_records WHERE id = ? AND tenant_id = ?`, [context.foreignAttendanceId, context.secondTenantId]);
  assert.equal(foreignCorrection.status, 'Pending');
  assert.equal(foreignAttendance.status, 'Absent');

  const automationLogs = await apiGet('/api/automation/logs', owner);
  assert.equal(automationLogs.response.status, 200);
  assert.equal(automationLogs.body.some((row) => Number(row.id) === Number(context.localAutomationId)), true);
  assert.equal(automationLogs.body.some((row) => Number(row.id) === Number(context.foreignAutomationId)), false);

  const markForeignSent = await apiRequest(`/api/automation/logs/${context.foreignAutomationId}/sent`, owner, { method: 'PATCH' });
  assert.equal(markForeignSent.response.status, 404);
  const storedForeignAutomation = await get(`SELECT status FROM automation_logs WHERE id = ? AND tenant_id = ?`, [context.foreignAutomationId, context.secondTenantId]);
  assert.equal(storedForeignAutomation.status, 'Queued');

  const discipline = await apiGet(`/api/automation/batch-discipline?month=${context.attendanceMonth}`, owner);
  assert.equal(discipline.response.status, 200);
  assert.equal(discipline.body.some((row) => row.batch === 'Local Batch'), true);
  assert.equal(discipline.body.some((row) => row.batch === 'Private Foreign Batch'), false);
});

test('teacher operations, staff attendance, and leave workflows remain tenant-scoped', async () => {
  const owner = context.users.owner;
  const listCases = [
    ['/api/teacher-work-controls', context.localWorkControlId, context.foreignWorkControlId],
    ['/api/teacher-management-actions', context.localManagementActionId, context.foreignManagementActionId],
    ['/api/teacher-reviews', context.localReviewId, context.foreignReviewId],
    ['/api/leave-requests', context.localLeaveId, context.foreignLeaveId],
  ];
  for (const [pathname, localId, foreignId] of listCases) {
    const result = await apiGet(pathname, owner);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.some((row) => Number(row.id) === Number(localId)), true);
    assert.equal(result.body.some((row) => Number(row.id) === Number(foreignId)), false);
  }

  const staffToday = await apiGet(`/api/staff-attendance/today?date=${context.attendanceDate}`, owner);
  assert.equal(staffToday.response.status, 200);
  assert.equal(staffToday.body.some((row) => row.staffName === 'Teacher Followups'), true);
  assert.equal(staffToday.body.some((row) => row.staffName === 'Private Foreign Teacher'), false);

  const foreignTeacherCreates = [
    ['/api/teacher-work-controls', { teacher_id: context.foreignTeacherId, controlType: 'Tamper', title: 'Tamper' }],
    ['/api/teacher-management-actions', { teacher_id: context.foreignTeacherId, actionType: 'Tamper', reason: 'Tamper' }],
    ['/api/teacher-reviews', { teacher_id: context.foreignTeacherId, month: '2026-08', scores: {} }],
    ['/api/leave-requests', { staff_id: context.foreignTeacherId, leaveType: 'Casual', fromDate: '2026-08-01', toDate: '2026-08-01', reason: 'Tamper' }],
  ];
  for (const [pathname, body] of foreignTeacherCreates) {
    const result = await apiRequest(pathname, owner, { method: 'POST', body: JSON.stringify(body) });
    assert.equal(result.response.status, 404);
  }

  const updateForeignControl = await apiRequest(`/api/teacher-work-controls/${context.foreignWorkControlId}`, owner, {
    method: 'PUT', body: JSON.stringify({ controlType: 'Tamper', title: 'Tamper' }),
  });
  const deleteForeignControl = await apiRequest(`/api/teacher-work-controls/${context.foreignWorkControlId}`, owner, { method: 'DELETE' });
  const updateForeignAction = await apiRequest(`/api/teacher-management-actions/${context.foreignManagementActionId}`, owner, {
    method: 'PUT', body: JSON.stringify({ actionType: 'Tamper', reason: 'Tamper' }),
  });
  const deleteForeignAction = await apiRequest(`/api/teacher-management-actions/${context.foreignManagementActionId}`, owner, { method: 'DELETE' });
  const updateForeignReview = await apiRequest(`/api/teacher-reviews/${context.foreignReviewId}`, owner, {
    method: 'PUT', body: JSON.stringify({ month: '2026-08', scores: { tampered: true } }),
  });
  const deleteForeignReview = await apiRequest(`/api/teacher-reviews/${context.foreignReviewId}`, owner, { method: 'DELETE' });
  const approveForeignLeave = await apiRequest(`/api/leave-requests/${context.foreignLeaveId}/approve`, owner, { method: 'PATCH' });
  const rejectForeignLeave = await apiRequest(`/api/leave-requests/${context.foreignLeaveId}/reject`, owner, { method: 'PATCH' });
  const checkoutForeignStaff = await apiRequest('/api/staff-attendance/check-out', owner, {
    method: 'POST', body: JSON.stringify({ staff_id: context.foreignTeacherId, lecturesTaken: 1 }),
  });

  for (const result of [updateForeignControl, deleteForeignControl, updateForeignAction, deleteForeignAction, updateForeignReview, deleteForeignReview, approveForeignLeave, rejectForeignLeave, checkoutForeignStaff]) {
    assert.equal(result.response.status, 404);
  }

  assert.equal((await get(`SELECT title FROM teacher_work_controls WHERE id = ?`, [context.foreignWorkControlId])).title, 'Private foreign control');
  assert.equal((await get(`SELECT actionType FROM teacher_management_actions WHERE id = ?`, [context.foreignManagementActionId])).actionType, 'Private Foreign Action');
  assert.equal((await get(`SELECT month FROM teacher_reviews WHERE id = ?`, [context.foreignReviewId])).month, '2026-07');
  assert.equal((await get(`SELECT status FROM leave_requests WHERE id = ?`, [context.foreignLeaveId])).status, 'Pending');
});

test('test performance, parent reports, remediation, and OMR data remain tenant-scoped', async () => {
  const owner = context.users.owner;
  const listCases = [
    ['/api/test-performance/tests', context.localPerformanceTestId, context.foreignPerformanceTestId],
    ['/api/test-performance/results', context.localPerformanceResultId, context.foreignPerformanceResultId],
    ['/api/test-performance/question-analysis', context.localQuestionId, context.foreignQuestionId],
    ['/api/test-performance/parent-reports', context.localParentReportId, context.foreignParentReportId],
    ['/api/test-performance/teacher-impact', context.localImpactId, context.foreignImpactId],
    ['/api/test-performance/remedial-students', context.localRemedialId, context.foreignRemedialId],
    ['/api/test-performance/omr-uploads', context.localOmrId, context.foreignOmrId],
  ];
  for (const [pathname, localId, foreignId] of listCases) {
    const result = await apiGet(pathname, owner);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.some((row) => Number(row.id) === Number(localId)), true);
    assert.equal(result.body.some((row) => Number(row.id) === Number(foreignId)), false);
  }

  const dashboard = await apiGet('/api/test-performance/dashboard', owner);
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.topPerformers.some((row) => row.studentName === 'Student One'), true);
  assert.equal(dashboard.body.topPerformers.some((row) => row.studentName === 'Private Other Student'), false);

  const createAgainstForeignTest = [
    ['/api/test-performance/results', { test_id: context.foreignPerformanceTestId, studentName: 'Tamper', totalMarks: 100 }],
    ['/api/test-performance/question-analysis', { test_id: context.foreignPerformanceTestId, questionNumber: 2, chapter: 'Tamper' }],
    ['/api/test-performance/parent-reports', { test_id: context.foreignPerformanceTestId, studentName: 'Tamper' }],
    ['/api/test-performance/teacher-impact', { test_id: context.foreignPerformanceTestId, teacherName: 'Tamper', subject: 'Tamper', batchName: 'Tamper' }],
    ['/api/test-performance/remedial-students', { test_id: context.foreignPerformanceTestId, studentName: 'Tamper', issue: 'Tamper' }],
    ['/api/test-performance/omr-uploads', { test_id: context.foreignPerformanceTestId, omrFileName: 'tamper.omr' }],
  ];
  for (const [pathname, body] of createAgainstForeignTest) {
    const result = await apiRequest(pathname, owner, { method: 'POST', body: JSON.stringify(body) });
    assert.equal(result.response.status, 404);
  }

  const deleteCases = [
    ['/api/test-performance/tests', context.foreignPerformanceTestId],
    ['/api/test-performance/results', context.foreignPerformanceResultId],
    ['/api/test-performance/question-analysis', context.foreignQuestionId],
    ['/api/test-performance/parent-reports', context.foreignParentReportId],
    ['/api/test-performance/teacher-impact', context.foreignImpactId],
    ['/api/test-performance/remedial-students', context.foreignRemedialId],
    ['/api/test-performance/omr-uploads', context.foreignOmrId],
  ];
  for (const [pathname, id] of deleteCases) {
    const result = await apiRequest(`${pathname}/${id}`, owner, { method: 'DELETE' });
    assert.equal(result.response.status, 404);
  }

  assert.equal((await get(`SELECT testName FROM performance_tests WHERE id = ? AND tenant_id = ?`, [context.foreignPerformanceTestId, context.secondTenantId])).testName, 'Private Foreign Performance Test');
  assert.equal((await get(`SELECT parentPhone FROM parent_report_logs WHERE id = ? AND tenant_id = ?`, [context.foreignParentReportId, context.secondTenantId])).parentPhone, '9888888888');
});

test('academic results, doubt sessions, revision plans, and remedial actions remain tenant-scoped', async () => {
  const owner = context.users.owner;
  const listCases = [
    ['/api/academic/test-results', context.localAcademicResultId, context.foreignAcademicResultId],
    ['/api/academic/doubt-sessions', context.localDoubtId, context.foreignDoubtId],
    ['/api/academic/revision-plans', context.localRevisionId, context.foreignRevisionId],
    ['/api/academic/remedial-actions', context.localAcademicRemedialId, context.foreignAcademicRemedialId],
  ];
  for (const [pathname, localId, foreignId] of listCases) {
    const result = await apiGet(pathname, owner);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.some((row) => Number(row.id) === Number(localId)), true);
    assert.equal(result.body.some((row) => Number(row.id) === Number(foreignId)), false);
  }

  const foreignCreates = [
    ['/api/academic/test-results', { test_id: context.foreignAcademicTestId, studentName: 'Tamper', subject: 'Physics' }],
    ['/api/academic/test-results', { student_id: context.secondTenantStudentId, studentName: 'Tamper', subject: 'Physics' }],
    ['/api/academic/doubt-sessions', { date: '2026-08-01', batchName: 'Tamper', subject: 'Physics', topic: 'Tamper', teacher_id: context.foreignTeacherId }],
    ['/api/academic/revision-plans', { revisionDate: '2026-08-01', batchName: 'Tamper', subject: 'Physics', chapter: 'Tamper', teacher_id: context.foreignTeacherId }],
    ['/api/academic/remedial-actions', { targetName: 'Tamper', issue: 'Tamper', action: 'Tamper', student_id: context.secondTenantStudentId }],
  ];
  for (const [pathname, body] of foreignCreates) {
    const result = await apiRequest(pathname, owner, { method: 'POST', body: JSON.stringify(body) });
    assert.equal(result.response.status, 404);
  }

  const deleteCases = [
    ['/api/academic/test-results', context.foreignAcademicResultId],
    ['/api/academic/doubt-sessions', context.foreignDoubtId],
    ['/api/academic/revision-plans', context.foreignRevisionId],
    ['/api/academic/remedial-actions', context.foreignAcademicRemedialId],
  ];
  for (const [pathname, id] of deleteCases) {
    const result = await apiRequest(`${pathname}/${id}`, owner, { method: 'DELETE' });
    assert.equal(result.response.status, 404);
  }

  assert.equal((await get(`SELECT studentName FROM student_test_results WHERE id = ? AND tenant_id = ?`, [context.foreignAcademicResultId, context.secondTenantId])).studentName, 'Private Other Student');
  assert.equal((await get(`SELECT topic FROM doubt_sessions WHERE id = ? AND tenant_id = ?`, [context.foreignDoubtId, context.secondTenantId])).topic, 'Private Foreign Doubt');
});

test('AI Lab dashboard, records, references, and mutations remain tenant-scoped', async () => {
  const owner = context.users.owner;
  const listCases = [
    ['/api/ai-lab/courses', context.localAiCourseId, context.foreignAiCourseId],
    ['/api/ai-lab/students', context.localAiStudentId, context.foreignAiStudentId],
    ['/api/ai-lab/attendance', context.localAiAttendanceId, context.foreignAiAttendanceId],
    ['/api/ai-lab/projects', context.localAiProjectId, context.foreignAiProjectId],
    ['/api/ai-lab/assignments', context.localAiAssignmentId, context.foreignAiAssignmentId],
    ['/api/ai-lab/feedback', context.localAiFeedbackId, context.foreignAiFeedbackId],
    ['/api/ai-lab/portfolios', context.localAiPortfolioId, context.foreignAiPortfolioId],
    ['/api/ai-lab/certificates', context.localAiCertificateId, context.foreignAiCertificateId],
  ];
  for (const [pathname, localId, foreignId] of listCases) {
    const result = await apiGet(pathname, owner);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.some((row) => Number(row.id) === Number(localId)), true);
    assert.equal(result.body.some((row) => Number(row.id) === Number(foreignId)), false);
  }

  const devices = await apiGet('/api/ai-lab/devices', owner);
  assert.equal(devices.response.status, 200);
  assert.equal(devices.body.devices.some((row) => Number(row.id) === Number(context.localAiDeviceId)), true);
  assert.equal(devices.body.devices.some((row) => Number(row.id) === Number(context.foreignAiDeviceId)), false);

  const dashboard = await apiGet('/api/ai-lab/dashboard', owner);
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.totals.students, 1);
  assert.equal(dashboard.body.totals.activeCourses, 1);

  const foreignCreates = [
    ['/api/ai-lab/students', { student_id: context.secondTenantStudentId, studentName: 'Tamper', courseName: 'Tamper' }],
    ['/api/ai-lab/attendance', { ai_lab_student_id: context.foreignAiStudentId, date: '2026-08-01', status: 'Present' }],
    ['/api/ai-lab/projects', { ai_lab_student_id: context.foreignAiStudentId, projectName: 'Tamper' }],
    ['/api/ai-lab/assignments', { ai_lab_student_id: context.foreignAiStudentId, assignmentName: 'Tamper' }],
    ['/api/ai-lab/feedback', { ai_lab_student_id: context.foreignAiStudentId, date: '2026-08-01' }],
    ['/api/ai-lab/portfolios', { ai_lab_student_id: context.foreignAiStudentId }],
    ['/api/ai-lab/certificates', { ai_lab_student_id: context.foreignAiStudentId, course_id: context.foreignAiCourseId }],
  ];
  for (const [pathname, body] of foreignCreates) {
    const result = await apiRequest(pathname, owner, { method: 'POST', body: JSON.stringify(body) });
    assert.equal(result.response.status, 404);
  }

  const deleteCases = [
    ['/api/ai-lab/courses', context.foreignAiCourseId],
    ['/api/ai-lab/students', context.foreignAiStudentId],
    ['/api/ai-lab/attendance', context.foreignAiAttendanceId],
    ['/api/ai-lab/devices', context.foreignAiDeviceId],
    ['/api/ai-lab/projects', context.foreignAiProjectId],
    ['/api/ai-lab/assignments', context.foreignAiAssignmentId],
    ['/api/ai-lab/feedback', context.foreignAiFeedbackId],
    ['/api/ai-lab/portfolios', context.foreignAiPortfolioId],
    ['/api/ai-lab/certificates', context.foreignAiCertificateId],
  ];
  for (const [pathname, id] of deleteCases) {
    const result = await apiRequest(`${pathname}/${id}`, owner, { method: 'DELETE' });
    assert.equal(result.response.status, 404);
  }

  assert.equal((await get(`SELECT studentName FROM ai_lab_students WHERE id = ? AND tenant_id = ?`, [context.foreignAiStudentId, context.secondTenantId])).studentName, 'Private Other Student');
  assert.equal((await get(`SELECT projectName FROM ai_lab_projects WHERE id = ? AND tenant_id = ?`, [context.foreignAiProjectId, context.secondTenantId])).projectName, 'Private Foreign AI Project');
});

test.after(async () => {
  await context?.server?.close();
  await close();
  fs.rmSync(testDatabasePath, { force: true });
});
