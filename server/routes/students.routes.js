const express = require('express');
const crypto = require('crypto');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { createAuditLog } = require('../services/auditLog.service');
const { currentTenantId, requireFields } = require('../utils/request');

const router = express.Router();
const STUDENT_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'PROVISIONAL', 'DROPPED', 'COMPLETED', 'TRANSFERRED', 'ALUMNI', 'ARCHIVED']);
const GUARDIAN_RELATIONSHIPS = new Set(['FATHER', 'MOTHER', 'GUARDIAN', 'BROTHER', 'SISTER', 'OTHER']);
const DOCUMENT_TYPES = new Set(['PHOTO', 'AADHAAR', 'BIRTH_CERTIFICATE', 'SCHOOL_ID', 'MARKSHEET', 'TRANSFER_CERTIFICATE', 'CASTE_CERTIFICATE', 'SCHOLARSHIP_DOCUMENT', 'FEE_PROOF', 'OTHER']);
const DOCUMENT_STATUSES = new Set(['UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED']);
const FULL_FOLLOWUP_ROLES = new Set(ROLE_GROUPS.MANAGEMENT);
const FOLLOWUP_READER_ROLES = [
  ...ROLE_GROUPS.MANAGEMENT,
  ROLES.COUNSELLOR,
  ROLES.TEACHER,
];
const FOLLOWUP_CATEGORIES = new Set([
  'ACADEMIC',
  'COUNSELLING',
  'ATTENDANCE',
  'FINANCIAL',
  'GUARDIAN_COMMUNICATION',
  'OPERATIONAL',
]);

function boolInt(value, fallback = false) {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function serialize(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key.startsWith('is_') || key === 'can_receive_notifications') return [camel, Number(value) === 1];
    return [camel, value];
  }));
}

function roleOf(req) {
  return String(req.user?.role || '');
}

function isFullFollowupRole(req) {
  return FULL_FOLLOWUP_ROLES.has(roleOf(req));
}

function normalizeFollowupCategory(value, fallback = 'OPERATIONAL') {
  const normalized = String(value || '').trim().toUpperCase();
  return FOLLOWUP_CATEGORIES.has(normalized) ? normalized : fallback;
}

function inferFollowupCategory(input = {}) {
  const explicit = normalizeFollowupCategory(input.taskCategory || input.task_category || input.category, null);
  if (explicit) return explicit;

  const text = `${input.taskType || ''} ${input.linkedType || ''}`.toUpperCase();
  if (text.includes('ACADEMIC')) return 'ACADEMIC';
  if (text.includes('ATTENDANCE')) return 'ATTENDANCE';
  if (text.includes('FEE') || text.includes('PAYMENT')) return 'FINANCIAL';
  if (text.includes('PARENT') || text.includes('GUARDIAN')) return 'GUARDIAN_COMMUNICATION';
  if (text.includes('COUNSELL')) return 'COUNSELLING';
  return 'OPERATIONAL';
}

function managementStudentDto(row) {
  return serialize(row);
}

function restrictedStudentDto(row) {
  return {
    id: row.id,
    studentCode: row.student_code || row.studentCode || null,
    name: row.display_name || row.student_name || row.name || null,
    displayName: row.display_name || row.student_name || row.name || null,
    classLevel: row.class_level || row.grade || null,
    status: row.status || null,
    branchId: row.branch_id || row.branchId || null,
    branchName: row.branch_name || row.branchName || null,
    courseId: row.primary_course_id || row.primaryCourseId || null,
    courseName: row.course_name || row.courseName || null,
    primaryBatchId: row.primary_batch_id || row.primaryBatchId || null,
    primaryBatchName: row.primary_batch_name || row.primaryBatchName || null,
  };
}

function studentDtoForRole(row, role) {
  return FULL_FOLLOWUP_ROLES.has(role) ? managementStudentDto(row) : restrictedStudentDto(row);
}

function managementFollowupDto(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    studentId: row.student_id ?? row.studentId,
    taskType: row.taskType,
    title: row.title || row.taskType,
    description: row.description || row.notes || null,
    notes: row.notes || null,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    assignedTo: row.assignedTo,
    assignedToUserId: row.assigned_to_user_id ?? row.assignedToUserId ?? null,
    taskCategory: row.task_category ?? row.taskCategory,
    visibilityScope: row.visibility_scope ?? row.visibilityScope,
    linkedType: row.linkedType,
    linkedId: row.linkedId,
    riskReason: row.risk_reason ?? row.riskReason ?? null,
    completionOutcome: row.completionOutcome,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function restrictedFollowupDto(row) {
  return {
    id: row.id,
    studentId: row.student_id ?? row.studentId,
    action: row.title || row.taskType,
    type: row.taskType,
    dueDate: row.dueDate,
    status: row.status,
    priority: row.priority,
  };
}

function attendanceFollowupDto(row) {
  return {
    id: row.id,
    studentId: row.student_id ?? row.studentId,
    action: row.title || row.taskType,
    dueDate: row.dueDate,
    status: row.status,
    priority: row.priority,
  };
}

function attendanceRowDto(row) {
  return {
    id: row.id,
    date: row.date || row.session_date || null,
    batch: row.batch || row.batch_id || null,
    subject: row.subject || null,
    status: row.status,
    markedAt: row.marked_at || row.markedAt || null,
  };
}

async function getTenantStudent(req, studentId) {
  return get(
    `SELECT s.*, br.name AS branch_name, c.name AS course_name, b.name AS primary_batch_name
     FROM students s
     LEFT JOIN branches br ON br.id = s.branch_id AND br.tenant_id = s.tenant_id
     LEFT JOIN courses c ON c.id = s.primary_course_id AND c.tenant_id = s.tenant_id
     LEFT JOIN batches b ON b.id = s.primary_batch_id AND b.tenant_id = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ? AND s.deleted_at IS NULL`,
    [studentId, currentTenantId(req)]
  );
}

async function teacherCanAccessStudent({ tenantId, studentId, userId }) {
  const row = await get(
    `SELECT 1 AS allowed
     FROM batch_students bs
     JOIN batch_teachers bt
       ON bt.tenant_id = bs.tenant_id
      AND bt.batch_id = bs.batch_id
      AND bt.status = 'ACTIVE'
     JOIN teachers t
       ON CAST(t.id AS TEXT) = CAST(bt.teacher_id AS TEXT)
      AND CAST(t.tenant_id AS TEXT) = CAST(bt.tenant_id AS TEXT)
      AND CAST(t.user_id AS TEXT) = CAST(? AS TEXT)
     WHERE CAST(bs.tenant_id AS TEXT) = CAST(? AS TEXT)
       AND CAST(bs.student_id AS TEXT) = CAST(? AS TEXT)
       AND bs.status = 'ACTIVE'
     LIMIT 1`,
    [userId, tenantId, studentId]
  );
  return Boolean(row);
}

async function requireRoleScopedStudent(req, student) {
  if (roleOf(req) !== ROLES.TEACHER) return true;
  const allowed = await teacherCanAccessStudent({
    tenantId: currentTenantId(req),
    studentId: student.id,
    userId: req.user.id,
  });
  return allowed;
}

async function getManagementFollowups(tenantId, studentId, { limit } = {}) {
  return all(
    `SELECT
       id,
       tenant_id,
       student_id,
       taskType,
       taskType AS title,
       notes,
       status,
       priority,
       dueDate,
       assignedTo,
       assigned_to_user_id,
       task_category,
       visibility_scope,
       linkedType,
       linkedId,
       risk_reason,
       completionOutcome,
       completedAt,
       completedBy,
       createdBy,
       createdAt,
       updatedAt
     FROM follow_up_tasks
     WHERE tenant_id = ?
       AND student_id = ?
     ORDER BY dueDate DESC, id DESC
     ${limit ? 'LIMIT ?' : ''}`,
    limit ? [tenantId, studentId, limit] : [tenantId, studentId]
  );
}

async function getAssignedCounsellorFollowups({ tenantId, studentId, userId, limit }) {
  return all(
    `SELECT
       id,
       student_id,
       taskType,
       taskType AS title,
       status,
       priority,
       dueDate
     FROM follow_up_tasks
     WHERE tenant_id = ?
       AND student_id = ?
       AND CAST(assigned_to_user_id AS TEXT) = CAST(? AS TEXT)
       AND task_category = 'COUNSELLING'
     ORDER BY dueDate ASC, id DESC
     ${limit ? 'LIMIT ?' : ''}`,
    limit ? [tenantId, studentId, userId, limit] : [tenantId, studentId, userId]
  );
}

async function getTeacherAcademicFollowups(tenantId, studentId, { limit } = {}) {
  return all(
    `SELECT
       id,
       student_id,
       taskType,
       taskType AS title,
       status,
       priority,
       dueDate
     FROM follow_up_tasks
     WHERE tenant_id = ?
       AND student_id = ?
       AND task_category = 'ACADEMIC'
     ORDER BY dueDate ASC, id DESC
     ${limit ? 'LIMIT ?' : ''}`,
    limit ? [tenantId, studentId, limit] : [tenantId, studentId]
  );
}

async function getAttendanceFollowups(tenantId, studentId, { restricted = false } = {}) {
  if (restricted) {
    return all(
      `SELECT
         id,
         student_id,
         taskType,
         taskType AS title,
         status,
         priority,
         dueDate
       FROM follow_up_tasks
       WHERE tenant_id = ?
         AND student_id = ?
         AND task_category = 'ATTENDANCE'
       ORDER BY createdAt DESC, id DESC
       LIMIT 20`,
      [tenantId, studentId]
    );
  }

  return all(
    `SELECT
       id,
       tenant_id,
       student_id,
       taskType,
       taskType AS title,
       notes,
       status,
       priority,
       dueDate,
       assignedTo,
       assigned_to_user_id,
       task_category,
       visibility_scope,
       risk_reason,
       completionOutcome,
       completedAt,
       completedBy,
       createdBy,
       createdAt,
       updatedAt
     FROM follow_up_tasks
     WHERE tenant_id = ?
       AND student_id = ?
       AND task_category = 'ATTENDANCE'
     ORDER BY createdAt DESC, id DESC
     LIMIT 20`,
    [tenantId, studentId]
  );
}

async function getRoleScopedFollowups(req, studentId, { limit } = {}) {
  const tenantId = currentTenantId(req);
  const role = roleOf(req);

  if (FULL_FOLLOWUP_ROLES.has(role)) {
    return (await getManagementFollowups(tenantId, studentId, { limit })).map(managementFollowupDto);
  }

  if (role === ROLES.COUNSELLOR) {
    return (await getAssignedCounsellorFollowups({
      tenantId,
      studentId,
      userId: req.user.id,
      limit,
    })).map(restrictedFollowupDto);
  }

  if (role === ROLES.TEACHER) {
    return (await getTeacherAcademicFollowups(tenantId, studentId, { limit })).map(restrictedFollowupDto);
  }

  return [];
}

async function getStudentFeeData(tenantId, studentId) {
  const [plans, installments, legacyPlans, legacyInstallments, payments, receipts, links, discounts] = await Promise.all([
    all(`SELECT * FROM student_fee_plans WHERE tenant_id = ? AND student_id = ? ORDER BY created_at DESC`, [tenantId, String(studentId)]),
    all(
      `SELECT i.* FROM student_fee_installments i
       JOIN student_fee_plans p ON p.id = i.student_fee_plan_id AND p.tenant_id = i.tenant_id
       WHERE i.tenant_id = ? AND p.student_id = ? ORDER BY i.due_date`,
      [tenantId, String(studentId)]
    ),
    all(
      `SELECT p.*, COALESCE(SUM(pay.amount), 0) AS paid_amount
       FROM fee_plans p
       LEFT JOIN fee_payments pay ON pay.fee_plan_id = p.id AND pay.tenant_id = p.tenant_id
         AND COALESCE(pay.status, 'Active') != 'Cancelled'
       WHERE p.tenant_id = ? AND p.student_id = ?
       GROUP BY p.id ORDER BY p.updatedAt DESC`,
      [tenantId, studentId]
    ),
    all(
      `SELECT i.* FROM fee_installments i
       JOIN fee_plans p ON p.id = i.fee_plan_id
       WHERE p.tenant_id = ? AND p.student_id = ? ORDER BY i.dueDate`,
      [tenantId, studentId]
    ),
    all(
      `SELECT * FROM fee_payments WHERE tenant_id = ? AND student_id = ?
       AND COALESCE(status, 'Active') != 'Cancelled' ORDER BY COALESCE(paid_at, paymentDate, created_at, createdAt) DESC`,
      [tenantId, studentId]
    ),
    all(
      `SELECT r.* FROM fee_receipts r
       JOIN fee_payments p ON CAST(p.id AS TEXT) = CAST(r.payment_id AS TEXT)
       WHERE p.tenant_id = ? AND p.student_id = ? ORDER BY COALESCE(r.created_at, r.issuedAt) DESC`,
      [tenantId, studentId]
    ),
    all(
      `SELECT l.* FROM fee_payment_links l
       JOIN student_fee_plans p ON p.id = l.student_fee_plan_id AND p.tenant_id = l.tenant_id
       WHERE l.tenant_id = ? AND p.student_id = ? ORDER BY l.created_at DESC`,
      [tenantId, String(studentId)]
    ),
    all(`SELECT * FROM discount_requests WHERE tenant_id = ? AND student_id = ? ORDER BY requested_at DESC`, [tenantId, String(studentId)]),
  ]);
  const summary = plans.reduce((acc, plan) => {
    acc.totalFee += Number(plan.total_amount || 0);
    acc.discountAmount += Number(plan.discount_amount || 0);
    acc.netPayable += Number(plan.payable_amount || 0);
    acc.paidAmount += Number(plan.paid_amount || 0);
    acc.pendingAmount += Number(plan.pending_amount || 0);
    return acc;
  }, { totalFee: 0, discountAmount: 0, netPayable: 0, paidAmount: 0, pendingAmount: 0 });
  for (const plan of legacyPlans) {
    const total = Number(plan.totalAmount || 0);
    const discount = Number(plan.discountAmount || 0);
    const paid = Number(plan.paid_amount || 0);
    summary.totalFee += total;
    summary.discountAmount += discount;
    summary.netPayable += Math.max(total - discount, 0);
    summary.paidAmount += paid;
    summary.pendingAmount += Math.max(total - discount - paid, 0);
  }
  const today = new Date().toISOString().slice(0, 10);
  const normalizedLegacyInstallments = legacyInstallments.map((item) => ({
    ...item,
    title: item.label,
    due_date: item.dueDate,
    pending_amount: String(item.status || '').toUpperCase() === 'PAID' ? 0 : Number(item.amount || 0),
  }));
  const allInstallments = [...installments, ...normalizedLegacyInstallments].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  summary.overdueAmount = allInstallments
    .filter((item) => item.due_date < today && Number(item.pending_amount || 0) > 0)
    .reduce((sum, item) => sum + Number(item.pending_amount || 0), 0);
  const nextDue = allInstallments.find((item) => item.due_date >= today && Number(item.pending_amount || 0) > 0);
  summary.nextDueDate = nextDue?.due_date || null;
  summary.nextDueAmount = Number(nextDue?.pending_amount || 0);
  return {
    summary,
    plans: [...plans, ...legacyPlans.map((item) => ({ ...item, source: 'LEGACY' }))],
    installments: allInstallments,
    payments,
    receipts,
    paymentLinks: links,
    discounts,
  };
}

async function getStudentAttendance(tenantId, studentId, { restricted = false } = {}) {
  const rows = await all(
    `SELECT
       ar.id,
       ar.tenant_id,
       ar.session_id,
       ar.student_id,
       ar.status,
       ar.markedBy,
       ar.marked_at,
       ar.markedAt,
       ar.markedTime,
       ar.arrivalTime,
       ar.remarks,
       s.date,
       s.session_date,
       s.batch,
       s.batch_id,
       s.course,
       s.subject,
       s.teacherName
     FROM attendance_records ar
     JOIN attendance_sessions s ON s.id = ar.session_id AND s.tenant_id = ar.tenant_id
     WHERE ar.tenant_id = ? AND ar.student_id = ?
     ORDER BY s.date DESC, s.startTime DESC`,
    [tenantId, studentId]
  );
  const present = rows.filter((row) => ['Present', 'Late', 'Excused', 'PRESENT', 'LATE', 'EXCUSED'].includes(row.status)).length;
  const absent = rows.filter((row) => String(row.status).toUpperCase() === 'ABSENT').length;
  const late = rows.filter((row) => String(row.status).toUpperCase() === 'LATE').length;
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthRows = rows.filter((row) => String(row.date || '').startsWith(monthPrefix));
  const monthPresent = monthRows.filter((row) => ['Present', 'Late', 'Excused', 'PRESENT', 'LATE', 'EXCUSED'].includes(row.status)).length;
  const subjectWise = Object.values(rows.reduce((acc, row) => {
    const subject = row.subject || 'General';
    if (!acc[subject]) acc[subject] = { subject, totalSessions: 0, presentCount: 0 };
    acc[subject].totalSessions += 1;
    if (['Present', 'Late', 'Excused', 'PRESENT', 'LATE', 'EXCUSED'].includes(row.status)) acc[subject].presentCount += 1;
    return acc;
  }, {})).map((row) => ({ ...row, attendancePercentage: row.totalSessions ? Math.round((row.presentCount / row.totalSessions) * 100) : 0 }));
  const [risk, alerts, followups] = restricted
    ? [null, [], await getAttendanceFollowups(tenantId, studentId, { restricted: true })]
    : await Promise.all([
      get(`SELECT * FROM attendance_risk_snapshots WHERE tenant_id = ? AND student_id = ? ORDER BY updated_at DESC LIMIT 1`, [String(tenantId), String(studentId)]),
      all(`SELECT * FROM communication_events WHERE tenant_id = ? AND student_id = ?
        AND (event_type LIKE '%ATTENDANCE%' OR event_type IN ('ABSENCE_ALERT', 'LATE_ALERT', 'LOW_ATTENDANCE_WARNING', 'REPEATED_ABSENCE_ALERT'))
        ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 20`, [String(tenantId), String(studentId)]),
      getAttendanceFollowups(tenantId, studentId, { restricted: false }),
    ]);
  return {
    summary: {
      totalSessions: rows.length,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      attendancePercentage: rows.length ? Math.round((present / rows.length) * 100) : 0,
      monthlyAttendancePercentage: monthRows.length ? Math.round((monthPresent / monthRows.length) * 100) : 0,
      lastAbsentDate: rows.find((row) => String(row.status).toUpperCase() === 'ABSENT')?.date || null,
    },
    rows: restricted ? rows.map(attendanceRowDto) : rows.map(serialize),
    subjectWise,
    ...(restricted ? {} : { risk: risk ? serialize(risk) : null }),
    ...(restricted ? {} : { parentAlerts: alerts.map(serialize) }),
    followups: followups.map(restricted ? attendanceFollowupDto : managementFollowupDto),
  };
}

async function getStudentTests(tenantId, studentId) {
  const [academic, performance] = await Promise.all([
    all(
      `SELECT r.*, t.testName, t.date AS testDate
       FROM student_test_results r LEFT JOIN test_calendars t ON t.id = r.test_id
       WHERE r.tenant_id = ? AND r.student_id = ? ORDER BY COALESCE(t.date, r.updatedAt) DESC`,
      [tenantId, studentId]
    ),
    all(
      `SELECT r.*, t.testName, t.testDate
       FROM performance_results r LEFT JOIN performance_tests t ON t.id = r.test_id
       WHERE r.tenant_id = ? AND r.student_id = ? ORDER BY COALESCE(t.testDate, r.updatedAt) DESC`,
      [tenantId, studentId]
    ),
  ]);
  const rows = [
    ...academic.map((row) => ({ ...row, percentage: Number(row.totalMarks || 0) ? Math.round((Number(row.marksObtained || 0) / Number(row.totalMarks)) * 100) : 0, rank: row.testRank })),
    ...performance.map((row) => ({ ...row, rank: row.overallRank || row.batchRank })),
  ].sort((a, b) => String(b.testDate || b.updatedAt || '').localeCompare(String(a.testDate || a.updatedAt || '')));
  const attempted = rows.filter((row) => Number(row.totalMarks || 0) > 0);
  const percentages = attempted.map((row) => Number(row.percentage || 0));
  return {
    summary: {
      testsAttempted: attempted.length,
      averagePercentage: percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0,
      latestScore: percentages[0] || 0,
      bestScore: percentages.length ? Math.max(...percentages) : 0,
      weakestSubject: rows.find((row) => row.weakSubject || row.subject)?.weakSubject || rows.find((row) => row.subject)?.subject || null,
      rankIfAvailable: rows.find((row) => row.rank)?.rank || null,
    },
    rows,
  };
}

async function getStudentAcademic(tenantId, studentId) {
  const [memberships, teachers] = await Promise.all([
    all(
      `SELECT bs.*, b.name AS batch_name, b.academic_year, c.name AS course_name, br.name AS branch_name
       FROM batch_students bs
       JOIN batches b ON b.id = bs.batch_id AND b.tenant_id = bs.tenant_id
       JOIN courses c ON c.id = b.course_id AND c.tenant_id = b.tenant_id
       JOIN branches br ON br.id = b.branch_id AND br.tenant_id = b.tenant_id
       WHERE bs.tenant_id = ? AND bs.student_id = ? ORDER BY bs.joined_at DESC`,
      [tenantId, String(studentId)]
    ),
    all(
      `SELECT bt.*, t.name AS teacher_name, sub.name AS subject_name, b.name AS batch_name
       FROM batch_students bs
       JOIN batch_teachers bt ON bt.batch_id = bs.batch_id AND bt.tenant_id = bs.tenant_id AND bt.status = 'ACTIVE'
       JOIN teachers t ON CAST(t.id AS TEXT) = CAST(bt.teacher_id AS TEXT) AND t.tenant_id = bt.tenant_id
       JOIN subjects sub ON sub.id = bt.subject_id AND sub.tenant_id = bt.tenant_id
       JOIN batches b ON b.id = bt.batch_id AND b.tenant_id = bt.tenant_id
       WHERE bs.tenant_id = ? AND bs.student_id = ? AND bs.status = 'ACTIVE'
       ORDER BY b.name, t.name`,
      [tenantId, String(studentId)]
    ),
  ]);
  return { batchMemberships: memberships.map(serialize), teachers: teachers.map(serialize) };
}

async function getStudentCommunications(tenantId, studentId) {
  const [events, alerts, calls, reminders, reports] = await Promise.all([
      all(`SELECT * FROM communication_events WHERE tenant_id = ? AND student_id = ? AND archived_at IS NULL ORDER BY COALESCE(logged_at, sent_at, created_at) DESC`, [tenantId, String(studentId)]),
    all(`SELECT * FROM parent_alert_logs WHERE tenant_id = ? AND student_id = ? AND deletedAt IS NULL ORDER BY sentAt DESC`, [tenantId, studentId]),
      all(`SELECT p.* FROM parent_call_logs p WHERE p.tenant_id = ? AND p.student_id = ? AND p.deletedAt IS NULL
        AND NOT EXISTS (SELECT 1 FROM communication_events e WHERE e.tenant_id = ? AND e.related_entity_type = 'PARENT_CALL_LOG' AND CAST(e.related_entity_id AS TEXT) = CAST(p.id AS TEXT))
        ORDER BY COALESCE(p.call_started_at, p.calledAt) DESC`, [tenantId, studentId, tenantId]),
    all(`SELECT * FROM fee_reminders WHERE tenant_id = ? AND student_id = ? ORDER BY sentAt DESC`, [tenantId, studentId]),
    all(`SELECT * FROM parent_report_logs WHERE tenant_id = ? AND student_id = ? ORDER BY sentAt DESC`, [tenantId, studentId]),
  ]);
  return [
      ...events.map((row) => ({ ...serialize(row), date: row.logged_at || row.sent_at || row.created_at })),
    ...alerts.map((row) => ({ id: `alert-${row.id}`, channel: row.channel, eventType: 'ATTENDANCE_ALERT', subject: row.alertType, message: row.message, status: row.status, date: row.sentAt })),
    ...calls.map((row) => ({ id: `call-${row.id}`, channel: 'CALL', eventType: 'PARENT_CALL', subject: row.callOutcome, message: row.notes, status: 'LOGGED', date: row.calledAt })),
    ...reminders.map((row) => ({ id: `fee-${row.id}`, channel: row.sentVia, eventType: 'FEE_REMINDER', subject: row.reminderType, message: row.message, status: row.status, date: row.sentAt })),
    ...reports.map((row) => ({ id: `test-${row.id}`, channel: row.sentVia, eventType: 'TEST_RESULT', subject: `Marks ${row.marksObtained}/${row.totalMarks}`, message: row.teacherRemark, status: row.status, date: row.sentAt })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function validateBatchAssignment({ tenantId, branchId, courseId, batchId, studentId = null }) {
  const [branch, course, batch] = await Promise.all([
    get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [branchId, tenantId]),
    get(`SELECT * FROM courses WHERE id = ? AND tenant_id = ?`, [courseId, tenantId]),
    get(
      `SELECT b.*,
        (SELECT COUNT(*) FROM batch_students bs
         WHERE bs.tenant_id = b.tenant_id AND bs.batch_id = b.id AND bs.status = 'ACTIVE') AS active_students
       FROM batches b WHERE b.id = ? AND b.tenant_id = ? AND b.deleted_at IS NULL`,
      [batchId, tenantId]
    ),
  ]);
  if (!branch || Number(branch.is_active ?? branch.isActive) !== 1) throw new Error('Active branch is required');
  if (!course || Number(course.is_active ?? course.isActive) !== 1) throw new Error('Active course is required');
  if (!batch || String(batch.branch_id) !== String(branch.id) || String(batch.course_id) !== String(course.id)) {
    throw new Error('Branch, course, and batch selection is invalid');
  }
  if (batch.status !== 'ACTIVE') throw new Error('Only active batches can accept students');
  const currentMapping = studentId
    ? await get(
      `SELECT id FROM batch_students
       WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'`,
      [tenantId, batch.id, String(studentId)]
    )
    : null;
  if (!currentMapping && Number(batch.active_students || 0) >= Number(batch.capacity)) {
    throw new Error('Batch capacity reached');
  }
  return { branch, course, batch };
}

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const rows = await all(
    `SELECT s.*, br.name AS branchName, c.name AS courseName, b.name AS batchName
     FROM students s
     LEFT JOIN branches br ON br.id = s.branch_id AND br.tenant_id = s.tenant_id
     LEFT JOIN courses c ON c.id = s.primary_course_id AND c.tenant_id = s.tenant_id
     LEFT JOIN batches b ON b.id = s.primary_batch_id AND b.tenant_id = s.tenant_id
     WHERE s.tenant_id = ? ORDER BY s.id DESC`,
    [currentTenantId(req)]
  );
  res.json(rows.map((row) => ({
    ...row,
    name: row.student_name || row.name,
    grade: row.class_level || row.grade,
    batch: row.batchName || row.batch,
    data: row.data ? JSON.parse(row.data) : null,
  })));
});

router.post('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { name, grade, attendance, data, branchId, primaryCourseId, primaryBatchId } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });
  const tenantId = currentTenantId(req);
  let branch = null;
  let course = null;
  let batchRow = null;
  if (branchId || primaryCourseId || primaryBatchId) {
    if (!branchId || !primaryCourseId || !primaryBatchId) {
      return res.status(400).json({ error: 'branchId, primaryCourseId, and primaryBatchId are required together' });
    }
    try {
      ({ branch, course, batch: batchRow } = await validateBatchAssignment({
        tenantId, branchId, courseId: primaryCourseId, batchId: primaryBatchId,
      }));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const result = await run(
    `INSERT INTO students
      (tenant_id, name, grade, batch, attendance, data, branch_id, primary_course_id,
       primary_batch_id, student_name, parent_name, parent_phone, class_level, school_name,
       admission_id, converted_from_lead_id, status, legacy_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      tenantId,
      name,
      grade || course?.class_level || null,
      null,
      attendance,
      JSON.stringify(data || {}),
      branch?.id || null,
      course?.id || null,
      batchRow?.id || null,
      name,
      req.body.parentName || data?.parentName || data?.fatherName || null,
      req.body.parentPhone || data?.primaryPhone || data?.whatsapp || null,
      req.body.classLevel || grade || course?.class_level || null,
      req.body.schoolName || data?.school || null,
      req.body.admissionId || null,
      req.body.convertedFromLeadId || null,
      req.body.status || data?.status || 'ACTIVE',
      JSON.stringify(data || {}),
    ]
  );
  const studentCode = req.body.studentCode || `STU-${String(tenantId).padStart(3, '0')}-${String(result.lastID).padStart(5, '0')}`;
  const displayName = req.body.displayName || name;
  const nameParts = String(displayName).trim().split(/\s+/);
  const status = String(req.body.status || data?.status || (batchRow ? 'ACTIVE' : 'PROVISIONAL')).toUpperCase();
  await run(
    `UPDATE students SET student_code = ?, first_name = ?, middle_name = ?, last_name = ?,
     display_name = ?, gender = ?, date_of_birth = ?, student_phone = ?, student_email = ?,
     address = ?, admission_date = ?, status = ? WHERE id = ? AND tenant_id = ?`,
    [studentCode, req.body.firstName || nameParts[0] || name, req.body.middleName || null,
      req.body.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : null), displayName,
      req.body.gender || null, req.body.dateOfBirth || null, req.body.studentPhone || null,
      req.body.studentEmail || null, req.body.address || data?.address || null,
      req.body.admissionDate || data?.joiningDate || null, STUDENT_STATUSES.has(status) ? status : 'PROVISIONAL',
      result.lastID, tenantId]
  );
  if (batchRow) {
    const mappingId = crypto.randomUUID();
    await run(
      `INSERT INTO batch_students
        (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [mappingId, tenantId, batchRow.id, String(result.lastID), req.body.joinedAt || new Date().toISOString().slice(0, 10)]
    );
    await createAuditLog({
      tenantId,
      branchId: batchRow.branch_id,
      actorUserId: req.user.id,
      action: 'STUDENT_ADDED_TO_BATCH',
      entityType: 'batch_student',
      entityId: mappingId,
      newValues: { batchId: batchRow.id, studentId: result.lastID },
      metadata: { batchId: batchRow.id },
    });
  }

  const created = await getTenantStudent(req, result.lastID);
  await createAuditLog({
    tenantId,
    branchId: created?.branch_id,
    actorUserId: req.user.id,
    action: 'STUDENT_CREATED',
    entityType: 'student',
    entityId: result.lastID,
    newValues: serialize(created),
  });

  res.json({ id: result.lastID });
});

router.put('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const { name, grade, attendance, data, branchId, primaryCourseId, primaryBatchId } = req.body;
  const validationError = requireFields(req.body, ['name']);
  if (validationError) return res.status(400).json({ error: validationError });

  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });

  const tenantId = currentTenantId(req);
  let branch = null;
  let course = null;
  let batchRow = null;
  if (branchId || primaryCourseId || primaryBatchId) {
    try {
      ({ branch, course, batch: batchRow } = await validateBatchAssignment({
        tenantId, branchId, courseId: primaryCourseId, batchId: primaryBatchId, studentId: id,
      }));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  await run(
     `UPDATE students SET name = ?, grade = ?, attendance = ?, data = ?,
     branch_id = COALESCE(?, branch_id), primary_course_id = COALESCE(?, primary_course_id),
     primary_batch_id = COALESCE(?, primary_batch_id), student_name = ?, parent_name = ?,
     parent_phone = ?, class_level = ?, school_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [
      name,
      grade || course?.class_level || existing.grade,
      attendance,
      JSON.stringify(data || {}),
      branch?.id || null,
      course?.id || null,
      batchRow?.id || null,
      name,
      req.body.parentName || data?.parentName || data?.fatherName || existing.parent_name,
      req.body.parentPhone || data?.primaryPhone || data?.whatsapp || existing.parent_phone,
      req.body.classLevel || grade || course?.class_level || existing.class_level,
      req.body.schoolName || data?.school || existing.school_name,
      req.body.status || data?.status || existing.status || 'ACTIVE',
      id,
      tenantId,
    ]
  );
  await run(
    `UPDATE students SET first_name = ?, middle_name = ?, last_name = ?, display_name = ?,
     gender = ?, date_of_birth = ?, student_phone = ?, student_email = ?, address = ?,
     admission_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [req.body.firstName ?? existing.first_name, req.body.middleName ?? existing.middle_name,
      req.body.lastName ?? existing.last_name, req.body.displayName || name,
      req.body.gender ?? existing.gender, req.body.dateOfBirth ?? existing.date_of_birth,
      req.body.studentPhone ?? existing.student_phone, req.body.studentEmail ?? existing.student_email,
      req.body.address ?? data?.address ?? existing.address, req.body.admissionDate ?? existing.admission_date,
      id, tenantId]
  );
  if (batchRow && String(existing.primary_batch_id || '') !== String(batchRow.id)) {
    const previousMapping = await get(
      `SELECT * FROM batch_students WHERE tenant_id = ? AND student_id = ? AND status = 'ACTIVE'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, String(id)]
    );
    await run(
      `UPDATE batch_students SET status = 'TRANSFERRED', left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND student_id = ? AND status = 'ACTIVE'`,
      [tenantId, String(id)]
    );
    const mappingId = crypto.randomUUID();
    await run(
      `INSERT INTO batch_students
        (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [mappingId, tenantId, batchRow.id, String(id), req.body.joinedAt || new Date().toISOString().slice(0, 10)]
    );
    await createAuditLog({
      tenantId,
      branchId: batchRow.branch_id,
      actorUserId: req.user.id,
      action: previousMapping ? 'STUDENT_TRANSFERRED_BATCH' : 'STUDENT_ADDED_TO_BATCH',
      entityType: 'batch_student',
      entityId: mappingId,
      oldValues: previousMapping ? { batchId: previousMapping.batch_id, studentId: id } : {},
      newValues: { batchId: batchRow.id, studentId: id },
      metadata: { batchId: batchRow.id },
    });
  }

  const updated = await getTenantStudent(req, id);
  await createAuditLog({
    tenantId,
    branchId: updated?.branch_id,
    actorUserId: req.user.id,
    action: 'STUDENT_UPDATED',
    entityType: 'student',
    entityId: id,
    oldValues: serialize(existing),
    newValues: serialize(updated),
  });

  res.json({ ok: true });
});

router.get('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!(await requireRoleScopedStudent(req, student))) {
    return res.status(404).json({ error: 'Student not found' });
  }
  res.json({ data: studentDtoForRole(student, roleOf(req)) });
});

router.patch('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const displayName = String(req.body.displayName ?? student.display_name ?? student.student_name ?? student.name).trim();
  if (!displayName) return res.status(400).json({ error: 'Student name is required' });
  const status = String(req.body.status ?? student.status ?? 'ACTIVE').toUpperCase();
  if (!STUDENT_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid student status' });
  await run(
    `UPDATE students SET first_name = ?, middle_name = ?, last_name = ?, display_name = ?,
     student_name = ?, name = ?, gender = ?, date_of_birth = ?, class_level = ?, grade = ?,
     school_name = ?, student_phone = ?, student_email = ?, address = ?, admission_date = ?,
     status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [req.body.firstName ?? student.first_name, req.body.middleName ?? student.middle_name,
      req.body.lastName ?? student.last_name, displayName, displayName, displayName,
      req.body.gender ?? student.gender, req.body.dateOfBirth ?? student.date_of_birth,
      req.body.classLevel ?? student.class_level, req.body.classLevel ?? student.grade,
      req.body.schoolName ?? student.school_name, req.body.studentPhone ?? student.student_phone,
      req.body.studentEmail ?? student.student_email, req.body.address ?? student.address,
      req.body.admissionDate ?? student.admission_date, status, student.id, currentTenantId(req)]
  );
  const updated = await getTenantStudent(req, student.id);
  await createAuditLog({ tenantId: currentTenantId(req), branchId: updated.branch_id, actorUserId: req.user.id, action: 'STUDENT_UPDATED', entityType: 'student', entityId: student.id, oldValues: serialize(student), newValues: serialize(updated) });
  res.json({ data: serialize(updated) });
});

router.get('/:id/profile', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const tenantId = currentTenantId(req);
  const role = roleOf(req);
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  if (!(await requireRoleScopedStudent(req, student))) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (!FULL_FOLLOWUP_ROLES.has(role)) {
    const [academic, attendance, tests, followUps] = await Promise.all([
      getStudentAcademic(tenantId, student.id),
      getStudentAttendance(tenantId, student.id, { restricted: true }),
      getStudentTests(tenantId, student.id),
      getRoleScopedFollowups(req, student.id, { limit: 10 }),
    ]);
    const alerts = [];
    if (!student.primary_batch_id) alerts.push({ type: 'BATCH_NOT_ASSIGNED', severity: 'HIGH', message: 'No primary batch assigned', actionLabel: 'View Academic', actionUrl: `/students/${student.id}?tab=academic` });
    if (attendance.summary.totalSessions > 0 && attendance.summary.attendancePercentage < 75) alerts.push({ type: 'LOW_ATTENDANCE', severity: 'HIGH', message: `Attendance is ${attendance.summary.attendancePercentage}%`, actionLabel: 'View Attendance', actionUrl: `/students/${student.id}?tab=attendance` });
    if (tests.summary.testsAttempted > 0 && tests.summary.averagePercentage < 50) alerts.push({ type: 'POOR_TEST_PERFORMANCE', severity: 'MEDIUM', message: `Average test score is ${tests.summary.averagePercentage}%`, actionLabel: 'View Tests', actionUrl: `/students/${student.id}?tab=tests` });

    return res.json({
      data: {
        student: studentDtoForRole(student, role),
        guardians: [],
        branch: student.branch_id ? { id: student.branch_id, name: student.branch_name } : null,
        course: student.primary_course_id ? { id: student.primary_course_id, name: student.course_name } : null,
        primaryBatch: student.primary_batch_id ? { id: student.primary_batch_id, name: student.primary_batch_name } : null,
        ...academic,
        attendanceSummary: attendance.summary,
        testSummary: tests.summary,
        recentFollowups: followUps,
        recentCommunication: [],
        documents: [],
        status: student.status,
        nextFollowup: followUps.find((item) => !['Done', 'Completed'].includes(item.status))?.dueDate || null,
        alerts,
      },
    });
  }

  const [guardians, academic, fees, attendance, tests, followUps, communication, documents] = await Promise.all([
    all(`SELECT * FROM student_guardians WHERE tenant_id = ? AND student_id = ? ORDER BY is_primary DESC, name`, [tenantId, String(student.id)]),
    getStudentAcademic(tenantId, student.id),
    getStudentFeeData(tenantId, student.id),
    getStudentAttendance(tenantId, student.id, { restricted: false }),
    getStudentTests(tenantId, student.id),
    getManagementFollowups(tenantId, student.id, { limit: 10 }),
    getStudentCommunications(tenantId, student.id),
    all(`SELECT * FROM student_documents WHERE tenant_id = ? AND student_id = ? AND archived_at IS NULL ORDER BY created_at DESC`, [tenantId, String(student.id)]),
  ]);
  const primaryGuardian = guardians.find((item) => Number(item.is_primary) === 1);
  const latestFollowUp = followUps[0];
  const alerts = [];
  if (!student.primary_batch_id) alerts.push({ type: 'BATCH_NOT_ASSIGNED', severity: 'HIGH', message: 'No primary batch assigned', actionLabel: 'View Academic', actionUrl: `/students/${student.id}?tab=academic` });
  if (!primaryGuardian?.phone && !student.parent_phone) alerts.push({ type: 'PARENT_PHONE_MISSING', severity: 'HIGH', message: 'Primary guardian phone is missing', actionLabel: 'Add Guardian', actionUrl: `/students/${student.id}?tab=overview` });
  if (fees.summary.overdueAmount > 0) alerts.push({ type: 'FEE_OVERDUE', severity: 'HIGH', message: `${fees.summary.overdueAmount} pending past due date`, actionLabel: 'View Fees', actionUrl: `/students/${student.id}?tab=fees` });
  if (attendance.summary.totalSessions > 0 && attendance.summary.attendancePercentage < 75) alerts.push({ type: 'LOW_ATTENDANCE', severity: 'HIGH', message: `Attendance is ${attendance.summary.attendancePercentage}%`, actionLabel: 'View Attendance', actionUrl: `/students/${student.id}?tab=attendance` });
  if (tests.summary.testsAttempted > 0 && tests.summary.averagePercentage < 50) alerts.push({ type: 'POOR_TEST_PERFORMANCE', severity: 'MEDIUM', message: `Average test score is ${tests.summary.averagePercentage}%`, actionLabel: 'View Tests', actionUrl: `/students/${student.id}?tab=tests` });
  if (!documents.length) alerts.push({ type: 'DOCUMENT_MISSING', severity: 'MEDIUM', message: 'No student documents uploaded', actionLabel: 'View Documents', actionUrl: `/students/${student.id}?tab=documents` });
  const failedWhatsApp = communication.find((item) => item.channel === 'WHATSAPP' && item.status === 'FAILED');
  if (failedWhatsApp) alerts.push({ type: 'WHATSAPP_FAILED', severity: 'HIGH', message: 'A WhatsApp message to the guardian failed. Check the phone number or use another channel.', actionLabel: 'View Communication', actionUrl: `/students/${student.id}?tab=communication` });
  const lastFollowUpDate = latestFollowUp?.createdAt || latestFollowUp?.updatedAt;
  if (!lastFollowUpDate || Date.now() - new Date(lastFollowUpDate).getTime() > 15 * 86400000) alerts.push({ type: 'FOLLOWUP_OVERDUE', severity: 'MEDIUM', message: 'No follow-up recorded in the last 15 days', actionLabel: 'Add Follow-up', actionUrl: `/students/${student.id}?tab=followups` });
  return res.json({
    data: {
      student: serialize(student),
      guardians: guardians.map(serialize),
      branch: student.branch_id ? { id: student.branch_id, name: student.branch_name } : null,
      course: student.primary_course_id ? { id: student.primary_course_id, name: student.course_name } : null,
      primaryBatch: student.primary_batch_id ? { id: student.primary_batch_id, name: student.primary_batch_name } : null,
      ...academic,
      feeSummary: fees.summary,
      attendanceSummary: attendance.summary,
      testSummary: tests.summary,
      recentFollowups: followUps.map(managementFollowupDto),
      recentCommunication: communication.slice(0, 10),
      documents: documents.map(serialize),
      status: student.status,
      nextFollowup: followUps.find((item) => !['Done', 'Completed'].includes(item.status))?.dueDate || null,
      alerts,
    },
  });
});

router.get('/:id/academic', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ data: await getStudentAcademic(currentTenantId(req), student.id) });
});

router.get('/:id/fees', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ data: await getStudentFeeData(currentTenantId(req), student.id) });
});

router.get('/:id/attendance', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!(await requireRoleScopedStudent(req, student))) {
    return res.status(404).json({ error: 'Student not found' });
  }
  const restricted = !FULL_FOLLOWUP_ROLES.has(roleOf(req));
  res.json({ data: await getStudentAttendance(currentTenantId(req), student.id, { restricted }) });
});

router.get('/:id/tests', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ data: await getStudentTests(currentTenantId(req), student.id) });
});

router.get('/:id/followups', authMiddleware, requireTenant, requireAnyRole(FOLLOWUP_READER_ROLES), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const tenantId = currentTenantId(req);
  const role = roleOf(req);

  if (FULL_FOLLOWUP_ROLES.has(role)) {
    const rows = await getManagementFollowups(tenantId, student.id);
    return res.json({ data: rows.map(managementFollowupDto) });
  }

  if (role === ROLES.COUNSELLOR) {
    const rows = await getAssignedCounsellorFollowups({
      tenantId,
      studentId: student.id,
      userId: req.user.id,
    });
    return res.json({ data: rows.map(restrictedFollowupDto) });
  }

  if (role === ROLES.TEACHER) {
    if (!(await teacherCanAccessStudent({ tenantId, studentId: student.id, userId: req.user.id }))) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const rows = await getTeacherAcademicFollowups(tenantId, student.id);
    return res.json({ data: rows.map(restrictedFollowupDto) });
  }

  return res.status(403).json({
    message: 'Follow-up access is restricted',
    code: 'STUDENT_FOLLOWUP_ACCESS_RESTRICTED',
  });
});

router.get('/:id/communications', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STAFF), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ data: await getStudentCommunications(currentTenantId(req), student.id) });
});

router.get('/:id/guardians', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rows = await all(`SELECT * FROM student_guardians WHERE tenant_id = ? AND student_id = ? ORDER BY is_primary DESC, name`, [currentTenantId(req), String(student.id)]);
  res.json({ data: rows.map(serialize) });
});

router.post('/:id/guardians', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const student = await getTenantStudent(req, req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const relationship = String(req.body.relationship || 'GUARDIAN').toUpperCase();
    if (!String(req.body.name || '').trim()) throw new Error('Guardian name is required');
    if (!GUARDIAN_RELATIONSHIPS.has(relationship)) throw new Error('Invalid guardian relationship');
    const isPrimary = boolInt(req.body.isPrimary);
    if (isPrimary && !String(req.body.phone || '').trim()) throw new Error('Phone is required for primary guardian');
    if (isPrimary) await run(`UPDATE student_guardians SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND student_id = ?`, [currentTenantId(req), String(student.id)]);
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO student_guardians
        (id, tenant_id, student_id, name, relationship, phone, alternate_phone, email,
         occupation, address, is_primary, is_emergency_contact, can_receive_notifications,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, String(currentTenantId(req)), String(student.id), String(req.body.name).trim(), relationship,
        req.body.phone || null, req.body.alternatePhone || null, req.body.email || null, req.body.occupation || null,
        req.body.address || null, isPrimary, boolInt(req.body.isEmergencyContact), boolInt(req.body.canReceiveNotifications, true)]
    );
    const created = await get(`SELECT * FROM student_guardians WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
    await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action: 'GUARDIAN_ADDED', entityType: 'student_guardian', entityId: id, newValues: serialize(created), metadata: { studentId: student.id } });
    res.status(201).json({ data: serialize(created) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/guardians/:guardianId', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const student = await getTenantStudent(req, req.params.id);
    const old = await get(`SELECT * FROM student_guardians WHERE id = ? AND tenant_id = ? AND student_id = ?`, [req.params.guardianId, currentTenantId(req), String(req.params.id)]);
    if (!student || !old) return res.status(404).json({ error: 'Guardian not found' });
    const next = { ...serialize(old), ...req.body };
    const relationship = String(next.relationship || 'GUARDIAN').toUpperCase();
    if (!String(next.name || '').trim()) throw new Error('Guardian name is required');
    if (!GUARDIAN_RELATIONSHIPS.has(relationship)) throw new Error('Invalid guardian relationship');
    if (next.isPrimary && !String(next.phone || '').trim()) throw new Error('Phone is required for primary guardian');
    if (next.isPrimary) await run(`UPDATE student_guardians SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND student_id = ?`, [currentTenantId(req), String(student.id)]);
    await run(
      `UPDATE student_guardians SET name = ?, relationship = ?, phone = ?, alternate_phone = ?,
       email = ?, occupation = ?, address = ?, is_primary = ?, is_emergency_contact = ?,
       can_receive_notifications = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
      [next.name, relationship, next.phone || null, next.alternatePhone || null, next.email || null,
        next.occupation || null, next.address || null, boolInt(next.isPrimary), boolInt(next.isEmergencyContact),
        boolInt(next.canReceiveNotifications, true), old.id, currentTenantId(req)]
    );
    const updated = await get(`SELECT * FROM student_guardians WHERE id = ?`, [old.id]);
    await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action: 'GUARDIAN_UPDATED', entityType: 'student_guardian', entityId: old.id, oldValues: serialize(old), newValues: serialize(updated), metadata: { studentId: student.id } });
    res.json({ data: serialize(updated) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/documents', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rows = await all(`SELECT * FROM student_documents WHERE tenant_id = ? AND student_id = ? AND archived_at IS NULL ORDER BY created_at DESC`, [currentTenantId(req), String(student.id)]);
  res.json({ data: rows.map(serialize) });
});

router.post('/:id/documents', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const student = await getTenantStudent(req, req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const documentType = String(req.body.documentType || '').toUpperCase();
    if (!DOCUMENT_TYPES.has(documentType)) throw new Error('Valid documentType is required');
    if (!req.body.title || !req.body.fileUrl) throw new Error('Document title and fileUrl are required');
    if (Number(req.body.fileSize || 0) > 10 * 1024 * 1024) throw new Error('Document file size cannot exceed 10 MB');
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO student_documents
        (id, tenant_id, student_id, document_type, title, file_url, file_name, mime_type,
         file_size, uploaded_by_user_id, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, String(currentTenantId(req)), String(student.id), documentType, req.body.title, req.body.fileUrl,
        req.body.fileName || null, req.body.mimeType || null, Number(req.body.fileSize || 0), req.user.id, req.body.notes || null]
    );
    const created = await get(`SELECT * FROM student_documents WHERE id = ?`, [id]);
    await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action: 'STUDENT_DOCUMENT_UPLOADED', entityType: 'student_document', entityId: id, newValues: serialize(created), metadata: { studentId: student.id } });
    res.status(201).json({ data: serialize(created) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/documents/:documentId', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  const old = await get(`SELECT * FROM student_documents WHERE id = ? AND tenant_id = ? AND student_id = ? AND archived_at IS NULL`, [req.params.documentId, currentTenantId(req), String(req.params.id)]);
  if (!student || !old) return res.status(404).json({ error: 'Document not found' });
  const status = String(req.body.status || old.status).toUpperCase();
  if (!DOCUMENT_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid document status' });
  await run(
    `UPDATE student_documents SET status = ?, notes = ?, verified_by_user_id = ?,
     verified_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [status, req.body.notes ?? old.notes, status === 'VERIFIED' ? req.user.id : null,
      status === 'VERIFIED' ? new Date().toISOString() : null, old.id, currentTenantId(req)]
  );
  const updated = await get(`SELECT * FROM student_documents WHERE id = ?`, [old.id]);
  const action = status === 'VERIFIED' ? 'STUDENT_DOCUMENT_VERIFIED' : status === 'REJECTED' ? 'STUDENT_DOCUMENT_REJECTED' : 'STUDENT_UPDATED';
  await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action, entityType: 'student_document', entityId: old.id, oldValues: serialize(old), newValues: serialize(updated), metadata: { studentId: student.id } });
  res.json({ data: serialize(updated) });
});

router.patch('/:id/status', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const status = String(req.body.status || '').toUpperCase();
  if (!STUDENT_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid student status' });
  const fees = await getStudentFeeData(currentTenantId(req), student.id);
  if (status === 'COMPLETED' && fees.summary.pendingAmount > 0 && !req.body.overridePendingFees) {
    return res.status(400).json({ error: 'Student cannot be completed while fees are pending without override' });
  }
  await run(`UPDATE students SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, [status, student.id, currentTenantId(req)]);
  await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action: 'STUDENT_STATUS_CHANGED', entityType: 'student', entityId: student.id, oldValues: { status: student.status }, newValues: { status } });
  res.json({ data: { id: student.id, status } });
});

router.post('/:id/archive', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const student = await getTenantStudent(req, req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.status === 'ACTIVE' && !String(req.body.reason || '').trim()) return res.status(400).json({ error: 'Reason is required to archive an active student' });
  await run(`UPDATE students SET status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, [student.id, currentTenantId(req)]);
  await createAuditLog({ tenantId: currentTenantId(req), branchId: student.branch_id, actorUserId: req.user.id, action: 'STUDENT_ARCHIVED', entityType: 'student', entityId: student.id, oldValues: { status: student.status }, newValues: { status: 'ARCHIVED', reason: req.body.reason } });
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const { id } = req.params;
  const existing = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  const discountHistory = await get(
    `SELECT id FROM discount_requests WHERE student_id = ? AND tenant_id = ? LIMIT 1`,
    [String(id), currentTenantId(req)]
  );
  if (discountHistory) {
    return res.status(409).json({ error: 'Students with discount audit history cannot be deleted' });
  }

  const tenantId = currentTenantId(req);
  const plans = await all(`SELECT id FROM fee_plans WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  for (const plan of plans) {
    await run(`DELETE FROM fee_components WHERE fee_plan_id = ?`, [plan.id]);
    await run(`DELETE FROM fee_installments WHERE fee_plan_id = ?`, [plan.id]);
  }

  const studentPayments = await all(
    `SELECT id FROM fee_payments WHERE student_id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  for (const payment of studentPayments) {
    await run(`DELETE FROM fee_receipts WHERE payment_id = ?`, [payment.id]);
  }

  const hardenedPlans = await all(
    `SELECT id FROM student_fee_plans WHERE student_id = ? AND tenant_id = ?`,
    [String(id), tenantId]
  );
  for (const plan of hardenedPlans) {
    await run(`DELETE FROM fee_payment_links WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
    await run(`DELETE FROM fee_discount_requests WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
    await run(`DELETE FROM student_fee_installments WHERE student_fee_plan_id = ? AND tenant_id = ?`, [plan.id, tenantId]);
  }

  await run(`DELETE FROM fee_payments WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM student_fee_plans WHERE student_id = ? AND tenant_id = ?`, [String(id), tenantId]);
  await run(`DELETE FROM fee_plans WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM parent_alert_logs WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM parent_call_logs WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM attendance_correction_requests WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM attendance_records WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM follow_up_tasks WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM student_history WHERE student_id = ? AND tenant_id = ?`, [id, tenantId]);
  await run(`DELETE FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);

  res.json({ ok: true });
});

router.get('/:id/history', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const student = await get(`SELECT id FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const [legacyRows, auditRows] = await Promise.all([
    all(`SELECT * FROM student_history WHERE student_id = ? AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY eventDate DESC, id DESC`, [id, currentTenantId(req)]),
    all(
      `SELECT * FROM audit_logs WHERE tenant_id = ? AND (
        (entity_type = 'student' AND entity_id = ?)
        OR metadata LIKE ?
       ) ORDER BY created_at DESC`,
      [currentTenantId(req), String(id), `%"studentId":${JSON.stringify(Number.isNaN(Number(id)) ? String(id) : Number(id))}%`]
    ),
  ]);
  const rows = [
    ...legacyRows,
    ...auditRows.map((row) => ({ ...row, type: row.action, title: row.action, detail: row.new_values, eventDate: row.created_at })),
  ].sort((a, b) => String(b.eventDate || b.created_at || '').localeCompare(String(a.eventDate || a.created_at || '')));
  res.json(rows);
});

router.post('/:id/history', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.STUDENTS), async (req, res) => {
  const { id } = req.params;
  const { type, title, detail, eventDate } = req.body;
  const validationError = requireFields(req.body, ['type', 'title']);
  if (validationError) return res.status(400).json({ error: validationError });

  const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [id, currentTenantId(req)]);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const result = await run(
    `INSERT INTO student_history (tenant_id, student_id, type, title, detail, eventDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [currentTenantId(req), id, type, title, detail, eventDate || new Date().toISOString(), new Date().toISOString()]
  );

  res.json(await get(`SELECT * FROM student_history WHERE id = ?`, [result.lastID]));
});

module.exports = router;
