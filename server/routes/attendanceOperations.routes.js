const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all, transaction } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');
const { sendTemplateMessage } = require('../services/whatsapp-template.service');

const router = express.Router();
const ATTENDANCE_ROLES = [ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.TEACHER];
const REPORT_ROLES = [ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.COUNSELLOR, ROLES.TEACHER];
const STATUSES = new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'NOT_MARKED']);
const SESSION_TYPES = new Set(['REGULAR_CLASS', 'EXTRA_CLASS', 'TEST', 'DOUBT_SESSION', 'REVISION', 'PRACTICAL', 'OTHER']);

function tenantId(req) {
  return req.user.tenantId || req.user.tenant_id;
}

function isManagement(req) {
  return ROLE_GROUPS.MANAGEMENT.includes(req.user.role);
}

function camel(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}

function normalizeStatus(value) {
  return String(value || 'NOT_MARKED').trim().toUpperCase().replace(/\s+/g, '_');
}

function legacyStatus(value) {
  return String(value || 'NOT_MARKED').toLowerCase().replace(/(^|_)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`).trim();
}

function normalizeSessionType(value) {
  const normalized = String(value || 'REGULAR_CLASS').trim().toUpperCase().replace(/\s+/g, '_');
  const aliases = { REGULAR: 'REGULAR_CLASS', DOUBT: 'DOUBT_SESSION' };
  return aliases[normalized] || normalized;
}

async function audit(req, action, entityType, entityId, oldValues, newValues, branchId = null) {
  await createAuditLog({
    tenantId: tenantId(req),
    branchId,
    actorUserId: req.user.id,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
  });
}

async function findBatch(req, reference) {
  if (!reference) return null;
  return get(
    `SELECT b.*, br.name AS branch_name, c.name AS course_name
     FROM batches b
     JOIN branches br ON br.id = b.branch_id AND br.tenant_id = b.tenant_id
     JOIN courses c ON c.id = b.course_id AND c.tenant_id = b.tenant_id
     WHERE b.tenant_id = ? AND b.deleted_at IS NULL AND (b.id = ? OR b.name = ?)
     ORDER BY CASE WHEN b.id = ? THEN 0 ELSE 1 END LIMIT 1`,
    [tenantId(req), reference, reference, reference]
  );
}

async function teacherCanAccessBatch(req, batchId, teacherId = null) {
  if (isManagement(req)) return true;
  if (req.user.role !== ROLES.TEACHER) return false;
  const ids = [String(req.user.id)];
  if (teacherId) ids.push(String(teacherId));
  const mapping = await get(
    `SELECT id FROM batch_teachers
     WHERE tenant_id = ? AND batch_id = ? AND status = 'ACTIVE'
       AND CAST(teacher_id AS TEXT) IN (${ids.map(() => '?').join(',')})`,
    [tenantId(req), batchId, ...ids]
  );
  return Boolean(mapping);
}

async function loadSession(req, sessionId) {
  return get(
    `SELECT s.*, b.name AS batch_name, br.name AS branch_name, c.name AS course_name,
       sub.name AS subject_name, t.name AS teacher_name
     FROM attendance_sessions s
     LEFT JOIN batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id
     LEFT JOIN branches br ON br.id = COALESCE(s.branch_id, b.branch_id) AND br.tenant_id = s.tenant_id
     LEFT JOIN courses c ON c.id = b.course_id AND c.tenant_id = s.tenant_id
     LEFT JOIN subjects sub ON sub.id = s.subject_id AND sub.tenant_id = s.tenant_id
     LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(s.teacher_id AS TEXT) AND t.tenant_id = s.tenant_id
     WHERE s.id = ? AND s.tenant_id = ? AND s.deletedAt IS NULL`,
    [sessionId, tenantId(req)]
  );
}

async function sessionRecords(req, session) {
  const rows = await all(
    `SELECT ar.*, COALESCE(st.display_name, st.student_name, st.name) AS student_name,
       COALESCE(st.class_level, st.grade) AS class_level,
       COALESCE(g.phone, st.parent_phone) AS parent_phone
     FROM attendance_records ar
     JOIN students st ON CAST(st.id AS TEXT) = CAST(ar.student_id AS TEXT) AND st.tenant_id = ar.tenant_id
     LEFT JOIN student_guardians g ON CAST(g.tenant_id AS TEXT) = CAST(ar.tenant_id AS TEXT)
       AND g.student_id = CAST(st.id AS TEXT) AND g.is_primary = 1
     WHERE ar.tenant_id = ? AND ar.session_id = ? AND ar.deletedAt IS NULL
     ORDER BY COALESCE(st.display_name, st.student_name, st.name)`,
    [tenantId(req), session.id]
  );
  return rows.map((row) => ({
    ...camel(row),
    status: normalizeStatus(row.status),
    studentName: row.student_name,
    grade: row.class_level,
    parentPhone: row.parent_phone,
    alertStatus: row.parent_alert_status || row.alertStatus || 'NOT_REQUIRED',
  }));
}

async function ensureSessionRecords(req, session) {
  const students = await all(
    `SELECT st.id
     FROM batch_students bs
     JOIN students st ON CAST(st.id AS TEXT) = CAST(bs.student_id AS TEXT) AND st.tenant_id = bs.tenant_id
     WHERE bs.tenant_id = ? AND bs.batch_id = ? AND bs.status = 'ACTIVE' AND st.deleted_at IS NULL`,
    [tenantId(req), session.batch_id]
  );
  for (const student of students) {
    await run(
      `INSERT INTO attendance_records
        (tenant_id, branch_id, session_id, batch_id, student_id, status, markedBy,
         marked_by_user_id, parent_alert_status, alertStatus, created_at, updated_at,
         createdAt, updatedAt, deletedAt)
       SELECT ?, ?, ?, ?, ?, 'NOT_MARKED', ?, ?, 'NOT_REQUIRED', 'Not Required',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM attendance_records WHERE tenant_id = ? AND session_id = ? AND student_id = ?
       )`,
      [tenantId(req), session.branch_id, session.id, session.batch_id, String(student.id),
        req.user.username, String(req.user.id), tenantId(req), session.id, String(student.id)]
    );
  }
}

async function formatSession(req, session) {
  const records = await sessionRecords(req, session);
  return {
    ...camel(session),
    date: session.session_date || session.date,
    batch: session.batch_name || session.batch_id || session.batch,
    batchName: session.batch_name || session.batch,
    course: session.course_name || session.course,
    subject: session.subject_name || session.subject,
    teacherName: session.teacher_name || session.teacherName,
    startTime: session.start_time || session.startTime,
    endTime: session.end_time || session.endTime,
    lectureType: session.session_type || session.lectureType,
    submittedAt: session.submitted_at || session.submittedAt,
    lockedAt: session.locked_at || session.lockedAt,
    status: String(session.status || 'DRAFT').toUpperCase(),
    records,
  };
}

async function getSettings(req) {
  return get(`SELECT * FROM attendance_settings WHERE tenant_id = ?`, [String(tenantId(req))]);
}

function attendanceMessage(eventType, studentName, session, percentage = null) {
  if (eventType === 'REPEATED_ABSENCE_ALERT') return `Dear Parent, ${studentName} has been absent for repeated sessions. Please contact the academic team to avoid learning gaps.`;
  if (eventType === 'LOW_ATTENDANCE_WARNING') return `Dear Parent, ${studentName}'s attendance is currently ${percentage}%. Minimum expected attendance is 75%. Please ensure regular attendance.`;
  if (eventType === 'LATE_ALERT') return `Dear Parent, your child ${studentName} was late for today's ${session.subject_name || session.subject || 'class'} class.`;
  return `Dear Parent, your child ${studentName} was absent for today's ${session.subject_name || session.subject || 'class'} at ProTrack Kaizen Academy. Please contact the branch if this was unexpected.`;
}

async function sendParentAlerts(req, session, eventTypes = ['ABSENCE_ALERT', 'LATE_ALERT']) {
  const settings = await getSettings(req);
  const records = await sessionRecords(req, session);
  const targets = records.filter((record) => (
    (record.status === 'ABSENT' && Number(settings.send_absence_alert) === 1 && eventTypes.includes('ABSENCE_ALERT'))
    || (record.status === 'LATE' && Number(settings.send_late_alert) === 1 && eventTypes.includes('LATE_ALERT'))
  ));
  const sent = [];
  for (const record of targets) {
    const eventType = record.status === 'LATE' ? 'LATE_ALERT' : 'ABSENCE_ALERT';
    const now = new Date().toISOString();
    let result;
    if (record.status === 'ABSENT') {
      try {
        result = await sendTemplateMessage({
          tenantId: tenantId(req),
          branchId: session.branch_id,
          userId: req.user.id,
          request: {
            templateKey: 'attendance_absent',
            studentId: record.studentId,
            attendanceSessionId: session.id,
          },
        });
      } catch (error) {
        await run(
          `UPDATE attendance_records SET parent_alert_status = 'FAILED',
           alertStatus = 'Failed', updated_at = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [record.id, tenantId(req)]
        );
        sent.push({ studentId: record.studentId, eventType: 'ATTENDANCE_ABSENT', failed: true, error: error.message });
        continue;
      }
    } else {
      // There is no approved official late template in the canonical registry.
      sent.push({ studentId: record.studentId, eventType, skipped: true, reason: 'No official late template configured' });
      continue;
    }
    const message = result.preview.preview;
    await run(
      `INSERT INTO parent_alert_logs
        (tenant_id, student_id, attendance_record_id, alertType, channel, message, status,
         sentAt, delivery, createdBy, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'Sent', ?, 'Sent', ?, ?, ?, NULL)`,
      [tenantId(req), record.studentId, record.id, 'ATTENDANCE_ABSENT', settings.alert_channel, message,
        now, req.user.id, now, now]
    );
    await run(
      `UPDATE attendance_records SET parent_alert_status = 'SENT', parent_alert_sent_at = ?,
       alertStatus = 'Sent', updated_at = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [now, record.id, tenantId(req)]
    );
    await audit(req, 'PARENT_ABSENCE_ALERT_SENT', 'attendance_record', record.id, {}, { eventType: 'ATTENDANCE_ABSENT', templateMessageId: result.messageId }, session.branch_id);
    sent.push({ studentId: record.studentId, eventType: 'ATTENDANCE_ABSENT', templateMessageId: result.messageId });
  }
  return sent;
}

async function sendRiskAlert(req, session, snapshot) {
  const settings = await getSettings(req);
  const repeated = snapshot.consecutiveAbsences >= Number(settings.repeated_absence_threshold || 3);
  const low = snapshot.totalSessions > 0 && snapshot.attendancePercentage < Number(settings.low_attendance_threshold || 75);
  let eventType = null;
  if (repeated && Number(settings.send_repeated_absence_alert) === 1) eventType = 'REPEATED_ABSENCE_ALERT';
  else if (low && Number(settings.send_low_attendance_alert) === 1) eventType = 'LOW_ATTENDANCE_WARNING';
  if (!eventType) return null;
  const today = new Date().toISOString().slice(0, 10);
  const duplicate = await get(
    `SELECT id FROM communication_events WHERE tenant_id = ? AND student_id = ?
       AND event_type = ? AND COALESCE(sent_at, created_at) LIKE ? LIMIT 1`,
    [String(tenantId(req)), String(snapshot.studentId), eventType, `${today}%`]
  );
  if (duplicate) return { id: duplicate.id, duplicate: true };
  const student = await get(`SELECT * FROM students WHERE tenant_id = ? AND id = ?`, [tenantId(req), snapshot.studentId]);
  const message = attendanceMessage(eventType, student?.display_name || student?.student_name || student?.name || 'Student', session, snapshot.attendancePercentage);
  const communicationId = crypto.randomUUID();
  const now = new Date().toISOString();
  // The canonical official registry has no low-attendance/repeated-absence
  // provider template. Record the risk internally instead of sending free text.
  await run(
    `INSERT INTO communication_events
      (id, tenant_id, student_id, channel, direction, event_type, subject, message,
       status, provider, sent_by_user_id, sent_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'SYSTEM', 'INTERNAL', ?, ?, ?, 'LOGGED', 'PARENTPULSE_RISK_ENGINE',
       ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [communicationId, String(tenantId(req)), String(snapshot.studentId),
      eventType, eventType.replaceAll('_', ' '), message, String(req.user.id), now,
      JSON.stringify({ sessionId: session.id, riskLevel: snapshot.riskLevel, riskReason: snapshot.riskReason })]
  );
  await audit(req, eventType === 'LOW_ATTENDANCE_WARNING' ? 'LOW_ATTENDANCE_RISK_CREATED' : 'PARENT_ABSENCE_ALERT_SENT', 'student', snapshot.studentId, {}, { eventType, communicationId, riskLevel: snapshot.riskLevel }, session.branch_id);
  return { id: communicationId, duplicate: false };
}

function riskLevel(percentage, consecutive, absent30) {
  if (percentage < 60 || consecutive >= 3) return 'CRITICAL';
  if (percentage < 75 || absent30 >= 5) return 'HIGH';
  if (percentage < 85) return 'MEDIUM';
  return 'LOW';
}

async function recalculateStudentRisk(req, studentId, batchId = null) {
  const today = new Date();
  const periodEnd = today.toISOString().slice(0, 10);
  const periodStart = `${periodEnd.slice(0, 7)}-01`;
  const rows = await all(
    `SELECT ar.status, COALESCE(s.session_date, s.date) AS session_date, COALESCE(s.batch_id, s.batch) AS batch_id
     FROM attendance_records ar
     JOIN attendance_sessions s ON s.id = ar.session_id AND s.tenant_id = ar.tenant_id
     WHERE ar.tenant_id = ? AND ar.student_id = ?
       AND COALESCE(s.session_date, s.date) <= ?
       ${batchId ? 'AND COALESCE(s.batch_id, s.batch) = ?' : ''}
     ORDER BY COALESCE(s.session_date, s.date) DESC, s.id DESC`,
    batchId ? [tenantId(req), studentId, periodEnd, batchId] : [tenantId(req), studentId, periodEnd]
  );
  const total = rows.filter((row) => normalizeStatus(row.status) !== 'NOT_MARKED').length;
  const present = rows.filter((row) => ['PRESENT', 'LATE', 'EXCUSED'].includes(normalizeStatus(row.status))).length;
  const absent = rows.filter((row) => normalizeStatus(row.status) === 'ABSENT').length;
  const late = rows.filter((row) => normalizeStatus(row.status) === 'LATE').length;
  const excused = rows.filter((row) => normalizeStatus(row.status) === 'EXCUSED').length;
  let consecutive = 0;
  for (const row of rows) {
    if (normalizeStatus(row.status) === 'ABSENT') consecutive += 1;
    else if (normalizeStatus(row.status) !== 'NOT_MARKED') break;
  }
  const day7 = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const day30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const absent7 = rows.filter((row) => normalizeStatus(row.status) === 'ABSENT' && row.session_date >= day7).length;
  const absent30 = rows.filter((row) => normalizeStatus(row.status) === 'ABSENT' && row.session_date >= day30).length;
  const percentage = total ? Math.round((present / total) * 10000) / 100 : 0;
  const level = riskLevel(percentage, consecutive, absent30);
  const reasons = [];
  if (consecutive >= 3) reasons.push('THREE_CONSECUTIVE_ABSENCES');
  else if (consecutive >= 2) reasons.push('TWO_CONSECUTIVE_ABSENCES');
  if (absent7 >= 3) reasons.push('THREE_ABSENCES_IN_7_DAYS');
  if (absent30 >= 5) reasons.push('FIVE_ABSENCES_IN_30_DAYS');
  if (percentage < 75 && total > 0) reasons.push('ATTENDANCE_BELOW_75');
  const student = await get(`SELECT branch_id, primary_batch_id FROM students WHERE tenant_id = ? AND id = ?`, [tenantId(req), studentId]);
  const effectiveBatch = batchId || student?.primary_batch_id || rows[0]?.batch_id || '';
  const alert = await get(`SELECT MAX(sentAt) AS last_alert FROM parent_alert_logs WHERE tenant_id = ? AND student_id = ?`, [tenantId(req), studentId]);
  const followup = await get(
    `SELECT MAX(createdAt) AS last_followup, MAX(dueDate) AS next_followup
     FROM follow_up_tasks WHERE tenant_id = ? AND student_id = ? AND (risk_reason IS NOT NULL OR taskType LIKE '%Attendance%')`,
    [tenantId(req), studentId]
  );
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO attendance_risk_snapshots
      (id, tenant_id, branch_id, student_id, batch_id, period_start, period_end,
       total_sessions, present_count, absent_count, late_count, excused_count,
       attendance_percentage, consecutive_absences, absences_last_7_days,
       absences_last_30_days, risk_level, risk_reason, last_parent_alert_at,
       last_followup_at, next_followup_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(tenant_id, student_id, batch_id, period_start, period_end)
     DO UPDATE SET total_sessions = excluded.total_sessions, present_count = excluded.present_count,
       absent_count = excluded.absent_count, late_count = excluded.late_count,
       excused_count = excluded.excused_count, attendance_percentage = excluded.attendance_percentage,
       consecutive_absences = excluded.consecutive_absences, absences_last_7_days = excluded.absences_last_7_days,
       absences_last_30_days = excluded.absences_last_30_days, risk_level = excluded.risk_level,
       risk_reason = excluded.risk_reason, last_parent_alert_at = excluded.last_parent_alert_at,
       last_followup_at = excluded.last_followup_at, next_followup_at = excluded.next_followup_at,
       updated_at = CURRENT_TIMESTAMP`,
    [id, String(tenantId(req)), student?.branch_id || null, String(studentId), String(effectiveBatch),
      periodStart, periodEnd, total, present, absent, late, excused, percentage, consecutive,
      absent7, absent30, level, reasons.join(','), alert?.last_alert || null,
      followup?.last_followup || null, followup?.next_followup || null]
  );
  return { studentId, batchId: effectiveBatch, totalSessions: total, presentCount: present, absentCount: absent, lateCount: late, excusedCount: excused, attendancePercentage: percentage, consecutiveAbsences: consecutive, absencesLast7Days: absent7, absencesLast30Days: absent30, riskLevel: level, riskReason: reasons.join(',') };
}

async function ensureAttendanceFollowup(req, snapshot) {
  const settings = await getSettings(req);
  if (Number(settings.auto_followup_enabled) !== 1 || !snapshot.riskReason) return null;
  const reason = snapshot.riskReason.split(',')[0];
  const existing = await get(
    `SELECT id FROM follow_up_tasks
     WHERE tenant_id = ? AND student_id = ? AND source = 'SYSTEM'
       AND risk_reason = ? AND status NOT IN ('Done', 'Completed', 'Cancelled') LIMIT 1`,
    [tenantId(req), snapshot.studentId, reason]
  );
  if (existing) return { id: existing.id, duplicate: true };
  const student = await get(`SELECT * FROM students WHERE tenant_id = ? AND id = ?`, [tenantId(req), snapshot.studentId]);
  const now = new Date();
  const due = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const result = await run(
    `INSERT INTO follow_up_tasks
      (tenant_id, student_id, studentName, taskType, dueDate, priority, assignedTo,
       status, notes, linkedType, linkedId, createdBy, source, source_entity_type,
       source_entity_id, risk_reason, createdAt, updatedAt)
     VALUES (?, ?, ?, 'Attendance Follow-up', ?, ?, 'Counsellor', 'Open', ?,
       'Attendance Risk', ?, ?, 'SYSTEM', 'ATTENDANCE_RISK', ?, ?, ?, ?)`,
    [tenantId(req), snapshot.studentId, student?.display_name || student?.student_name || student?.name,
      due, ['CRITICAL', 'HIGH'].includes(snapshot.riskLevel) ? 'High' : 'Medium',
      `Attendance risk: ${snapshot.riskReason}. Parent follow-up required.`,
      snapshot.studentId, req.user.id, snapshot.studentId, reason, now.toISOString(), now.toISOString()]
  );
  await audit(req, 'ATTENDANCE_FOLLOWUP_CREATED', 'follow_up_task', result.lastID, {}, { studentId: snapshot.studentId, reason }, student?.branch_id);
  return { id: result.lastID, duplicate: false };
}

async function recalculateTeacherScore(req, teacherId, startDate, endDate) {
  const sessions = await all(
    `SELECT * FROM attendance_sessions WHERE tenant_id = ? AND teacher_id = ?
       AND COALESCE(session_date, date) BETWEEN ? AND ? AND deletedAt IS NULL`,
    [tenantId(req), teacherId, startDate, endDate]
  );
  const scheduled = sessions.length;
  const submitted = sessions.filter((row) => ['SUBMITTED', 'LOCKED'].includes(String(row.status).toUpperCase())).length;
  const onTime = sessions.filter((row) => {
    const submittedAt = row.submitted_at || row.submittedAt;
    const date = row.session_date || row.date;
    const end = row.end_time || row.endTime;
    return submittedAt && date && end && new Date(submittedAt).getTime() <= new Date(`${date}T${end}:00`).getTime() + 30 * 60000;
  }).length;
  const corrections = await get(
    `SELECT COUNT(*) AS count FROM attendance_correction_requests cr
     JOIN attendance_sessions s ON s.id = cr.session_id
     WHERE s.tenant_id = ? AND s.teacher_id = ? AND COALESCE(s.session_date, s.date) BETWEEN ? AND ?`,
    [tenantId(req), teacherId, startDate, endDate]
  );
  const completion = scheduled ? Math.round((submitted / scheduled) * 10000) / 100 : 0;
  const onTimePercentage = scheduled ? Math.round((onTime / scheduled) * 10000) / 100 : 0;
  const finalScore = Math.max(0, Math.round(completion * 0.8 + onTimePercentage * 0.2 - Number(corrections?.count || 0) * 2));
  const teacher = await get(`SELECT * FROM teachers WHERE tenant_id = ? AND id = ?`, [tenantId(req), teacherId]);
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO teacher_attendance_completion_scores
      (id, tenant_id, branch_id, teacher_id, period_start, period_end, scheduled_sessions,
       submitted_sessions, on_time_submissions, late_submissions, missed_sessions,
       correction_requests, completion_percentage, on_time_percentage, final_score,
       created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(tenant_id, teacher_id, period_start, period_end)
     DO UPDATE SET scheduled_sessions = excluded.scheduled_sessions,
       submitted_sessions = excluded.submitted_sessions, on_time_submissions = excluded.on_time_submissions,
       late_submissions = excluded.late_submissions, missed_sessions = excluded.missed_sessions,
       correction_requests = excluded.correction_requests, completion_percentage = excluded.completion_percentage,
       on_time_percentage = excluded.on_time_percentage, final_score = excluded.final_score,
       updated_at = CURRENT_TIMESTAMP`,
    [id, String(tenantId(req)), String(teacherId), startDate, endDate, scheduled, submitted,
      onTime, Math.max(submitted - onTime, 0), Math.max(scheduled - submitted, 0),
      Number(corrections?.count || 0), completion, onTimePercentage, finalScore]
  );
  await audit(req, 'TEACHER_ATTENDANCE_SCORE_UPDATED', 'teacher_attendance_score', teacherId, {}, { startDate, endDate, finalScore });
  return { teacherId, teacherName: teacher?.name || 'Teacher', scheduledSessions: scheduled, submittedSessions: submitted, onTimeSubmissions: onTime, lateSubmissions: Math.max(submitted - onTime, 0), missedSessions: Math.max(scheduled - submitted, 0), correctionRequests: Number(corrections?.count || 0), completionPercentage: completion, onTimePercentage, finalScore };
}

router.get('/teacher/attendance/today', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const conditions = ['s.tenant_id = ?', 'COALESCE(s.session_date, s.date) = ?', 's.deletedAt IS NULL'];
  const params = [tenantId(req), date];
  if (req.user.role === ROLES.TEACHER) {
    conditions.push('(CAST(s.teacher_id AS TEXT) = CAST(? AS TEXT) OR CAST(s.marked_by_user_id AS TEXT) = CAST(? AS TEXT))');
    params.push(req.user.id, req.user.id);
  }
  const rows = await all(
    `SELECT s.*, b.name AS batch_name, sub.name AS subject_name, t.name AS teacher_name
     FROM attendance_sessions s
     LEFT JOIN batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id
     LEFT JOIN subjects sub ON sub.id = s.subject_id AND sub.tenant_id = s.tenant_id
     LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(s.teacher_id AS TEXT) AND t.tenant_id = s.tenant_id
     WHERE ${conditions.join(' AND ')} ORDER BY COALESCE(s.start_time, s.startTime)`,
    params
  );
  res.json({ data: rows.map(camel) });
});

router.get('/attendance/sessions', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const conditions = ['s.tenant_id = ?', 's.deletedAt IS NULL'];
  const params = [tenantId(req)];
  if (req.query.date) { conditions.push('COALESCE(s.session_date, s.date) = ?'); params.push(req.query.date); }
  if (req.user.role === ROLES.TEACHER) {
    conditions.push('(CAST(s.teacher_id AS TEXT) = CAST(? AS TEXT) OR CAST(s.marked_by_user_id AS TEXT) = CAST(? AS TEXT))');
    params.push(req.user.id, req.user.id);
  }
  const rows = await all(
    `SELECT s.*, b.name AS batch_name, sub.name AS subject_name, t.name AS teacher_name,
       (SELECT COUNT(*) FROM attendance_records ar WHERE ar.tenant_id = s.tenant_id AND ar.session_id = s.id AND ar.deletedAt IS NULL) AS student_count,
       (SELECT COUNT(*) FROM attendance_records ar WHERE ar.tenant_id = s.tenant_id AND ar.session_id = s.id AND ar.status != 'NOT_MARKED' AND ar.deletedAt IS NULL) AS marked_count
     FROM attendance_sessions s
     LEFT JOIN batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id
     LEFT JOIN subjects sub ON sub.id = s.subject_id AND sub.tenant_id = s.tenant_id
     LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(s.teacher_id AS TEXT) AND t.tenant_id = s.tenant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(s.session_date, s.date) DESC, COALESCE(s.start_time, s.startTime) DESC`,
    params
  );
  res.json(rows.map((row) => ({
    ...camel(row),
    date: row.session_date || row.date,
    batch: row.batch_name || row.batch_id || row.batch,
    subject: row.subject_name || row.subject,
    teacherName: row.teacher_name || row.teacherName,
    startTime: row.start_time || row.startTime,
    endTime: row.end_time || row.endTime,
    studentCount: Number(row.student_count || 0),
    markedCount: Number(row.marked_count || 0),
  })));
});

router.post('/attendance/sessions', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  try {
    const batch = await findBatch(req, req.body.batchId || req.body.batch);
    if (!batch) throw new Error('Valid batch is required');
    if (batch.status !== 'ACTIVE') throw new Error('Inactive batches cannot create attendance sessions');
    if (!(await teacherCanAccessBatch(req, batch.id, req.body.teacherId || req.body.teacher_id))) throw new Error('Teacher is not assigned to this batch');
    const sessionDate = req.body.sessionDate || req.body.date;
    const startTime = req.body.startTime;
    const endTime = req.body.endTime;
    if (!sessionDate || !startTime || !endTime || startTime >= endTime) throw new Error('Valid session date and time are required');
    const sessionType = normalizeSessionType(req.body.sessionType || req.body.lectureType);
    if (!SESSION_TYPES.has(sessionType)) throw new Error('Invalid session type');
    let subject = null;
    if (req.body.subjectId || req.body.subject) {
      subject = await get(
        `SELECT * FROM subjects WHERE tenant_id = ? AND is_active = 1 AND (id = ? OR name = ? OR code = ?) LIMIT 1`,
        [tenantId(req), req.body.subjectId || req.body.subject, req.body.subject, req.body.subject]
      );
    }
    const teacherId = req.body.teacherId || req.body.teacher_id || (req.user.role === ROLES.TEACHER ? req.user.id : null);
    const teacher = teacherId ? await get(`SELECT * FROM teachers WHERE tenant_id = ? AND id = ?`, [tenantId(req), teacherId]) : null;
    const idResult = await transaction(async () => {
      const result = await run(
        `INSERT INTO attendance_sessions
          (tenant_id, branch_id, batch_id, subject_id, teacher_id, session_date, date,
           start_time, startTime, end_time, endTime, session_type, lectureType, status,
           marked_by_user_id, markedBy, teacherName, batch, course, subject, remarks,
           createdBy, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
        [tenantId(req), batch.branch_id, batch.id, subject?.id || null, teacherId || null,
          sessionDate, sessionDate, startTime, startTime, endTime, endTime, sessionType,
          sessionType, String(req.user.id), req.user.username, teacher?.name || req.body.teacherName || '',
          batch.id, batch.course_name, subject?.name || req.body.subject || '', req.body.remarks || null, req.user.id]
      );
      return result.lastID;
    });
    const session = await loadSession(req, idResult);
    await ensureSessionRecords(req, session);
    await run(
      `UPDATE attendance_sessions SET total_students = (
        SELECT COUNT(*) FROM attendance_records WHERE tenant_id = ? AND session_id = ? AND deletedAt IS NULL
       ) WHERE id = ? AND tenant_id = ?`,
      [tenantId(req), session.id, session.id, tenantId(req)]
    );
    const loaded = await loadSession(req, session.id);
    await audit(req, 'ATTENDANCE_SESSION_CREATED', 'attendance_session', session.id, {}, camel(loaded), batch.branch_id);
    res.status(201).json(await formatSession(req, loaded));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/attendance/sessions/:id', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const session = await loadSession(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (!(await teacherCanAccessBatch(req, session.batch_id, session.teacher_id)) && req.user.role === ROLES.TEACHER) return res.status(403).json({ error: 'Forbidden' });
  await ensureSessionRecords(req, session);
  res.json(await formatSession(req, session));
});

async function saveRecords(req, session, records) {
  if (['SUBMITTED', 'LOCKED'].includes(String(session.status).toUpperCase())) throw new Error('Submitted attendance requires a correction request');
  for (const input of records || []) {
    const status = normalizeStatus(input.status);
    if (!STATUSES.has(status)) throw new Error('Invalid attendance status');
    await run(
      `UPDATE attendance_records SET status = ?, marked_at = CURRENT_TIMESTAMP,
       markedAt = CURRENT_TIMESTAMP, marked_by_user_id = ?, markedBy = ?,
       absence_reason = ?, late_minutes = ?, arrivalTime = ?, remarks = ?,
       parent_alert_status = ?, alertStatus = ?, updated_at = CURRENT_TIMESTAMP,
       updatedAt = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND session_id = ? AND student_id = ?`,
      [status, String(req.user.id), req.user.username, input.absenceReason || null,
        Number(input.lateMinutes || 0), input.arrivalTime || null, input.remarks || null,
        ['ABSENT', 'LATE'].includes(status) ? 'NOT_SENT' : 'NOT_REQUIRED',
        ['ABSENT', 'LATE'].includes(status) ? 'Not Sent' : 'Not Required',
        tenantId(req), session.id, String(input.studentId || input.student_id)]
    );
  }
  await audit(req, 'ATTENDANCE_RECORD_UPDATED', 'attendance_session', session.id, {}, { records: records?.length || 0 }, session.branch_id);
}

async function submitSession(req, session) {
  const records = await sessionRecords(req, session);
  const unmarked = records.filter((row) => row.status === 'NOT_MARKED');
  if (unmarked.length) throw new Error(`${unmarked.length} students are still not marked`);
  const counts = {
    total: records.length,
    present: records.filter((row) => row.status === 'PRESENT').length,
    absent: records.filter((row) => row.status === 'ABSENT').length,
    late: records.filter((row) => row.status === 'LATE').length,
    excused: records.filter((row) => row.status === 'EXCUSED').length,
  };
  const now = new Date().toISOString();
  await run(
    `UPDATE attendance_sessions SET status = 'SUBMITTED', submitted_at = ?, submittedAt = ?,
     total_students = ?, present_count = ?, absent_count = ?, late_count = ?, excused_count = ?,
     updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [now, now, counts.total, counts.present, counts.absent, counts.late, counts.excused, session.id, tenantId(req)]
  );
  const updated = await loadSession(req, session.id);
  const alerts = await sendParentAlerts(req, updated);
  const snapshots = [];
  const followups = [];
  for (const record of records) {
    const snapshot = await recalculateStudentRisk(req, record.studentId, session.batch_id);
    snapshots.push(snapshot);
    await sendRiskAlert(req, updated, snapshot);
    const followup = await ensureAttendanceFollowup(req, snapshot);
    if (followup) followups.push(followup);
  }
  if (session.teacher_id) {
    const month = (session.session_date || session.date).slice(0, 7);
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10);
    await recalculateTeacherScore(req, session.teacher_id, start, end);
  }
  await audit(req, 'ATTENDANCE_SUBMITTED', 'attendance_session', session.id, { status: session.status }, { status: 'SUBMITTED', ...counts, alerts: alerts.length, followups: followups.length }, session.branch_id);
  return formatSession(req, updated);
}

router.patch('/attendance/sessions/:id/records', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  try {
    const session = await loadSession(req, req.params.id);
    if (!session) return res.status(404).json({ error: 'Attendance session not found' });
    if (!(await teacherCanAccessBatch(req, session.batch_id, session.teacher_id))) return res.status(403).json({ error: 'Forbidden' });
    await saveRecords(req, session, req.body.records);
    res.json(await formatSession(req, await loadSession(req, session.id)));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/attendance/sessions/:id/draft', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  try {
    const session = await loadSession(req, req.params.id);
    if (!session) return res.status(404).json({ error: 'Attendance session not found' });
    if (!(await teacherCanAccessBatch(req, session.batch_id, session.teacher_id))) return res.status(403).json({ error: 'Forbidden' });
    await saveRecords(req, session, req.body.records);
    await run(`UPDATE attendance_sessions SET status = 'DRAFT', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, [session.id, tenantId(req)]);
    await audit(req, 'ATTENDANCE_DRAFT_SAVED', 'attendance_session', session.id, {}, { records: req.body.records?.length || 0 }, session.branch_id);
    res.json(await formatSession(req, await loadSession(req, session.id)));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/attendance/sessions/:id/submit', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  try {
    const session = await loadSession(req, req.params.id);
    if (!session) return res.status(404).json({ error: 'Attendance session not found' });
    if (!(await teacherCanAccessBatch(req, session.batch_id, session.teacher_id))) return res.status(403).json({ error: 'Forbidden' });
    if (req.body.records) await saveRecords(req, session, req.body.records);
    res.json(await submitSession(req, await loadSession(req, session.id)));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/attendance/sessions/:id/records', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  try {
    const session = await loadSession(req, req.params.id);
    if (!session) return res.status(404).json({ error: 'Attendance session not found' });
    if (!(await teacherCanAccessBatch(req, session.batch_id, session.teacher_id))) return res.status(403).json({ error: 'Forbidden' });
    await saveRecords(req, session, req.body.records);
    if (req.body.submit) return res.json(await submitSession(req, await loadSession(req, session.id)));
    res.json(await formatSession(req, await loadSession(req, session.id)));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/attendance/sessions/:id/mark-all-present', authMiddleware, requireTenant, requireAnyRole(ATTENDANCE_ROLES), async (req, res) => {
  const session = await loadSession(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (['SUBMITTED', 'LOCKED'].includes(String(session.status).toUpperCase())) return res.status(400).json({ error: 'Submitted attendance requires a correction request' });
  await run(
    `UPDATE attendance_records SET status = 'PRESENT', marked_at = CURRENT_TIMESTAMP,
     markedAt = CURRENT_TIMESTAMP, marked_by_user_id = ?, markedBy = ?,
     parent_alert_status = 'NOT_REQUIRED', alertStatus = 'Not Required',
     updated_at = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND session_id = ? AND status = 'NOT_MARKED'`,
    [String(req.user.id), req.user.username, tenantId(req), session.id]
  );
  res.json(await formatSession(req, await loadSession(req, session.id)));
});

router.post('/attendance/sessions/:id/lock', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const session = await loadSession(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  if (String(session.status).toUpperCase() !== 'SUBMITTED') return res.status(400).json({ error: 'Only submitted attendance can be locked' });
  const now = new Date().toISOString();
  await run(
    `UPDATE attendance_sessions SET status = 'LOCKED', locked_at = ?, lockedAt = ?,
     updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [now, now, session.id, tenantId(req)]
  );
  await audit(req, 'ATTENDANCE_LOCKED', 'attendance_session', session.id, { status: session.status }, { status: 'LOCKED' }, session.branch_id);
  res.json(await formatSession(req, await loadSession(req, session.id)));
});

router.get('/attendance/settings', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  res.json({ data: camel(await getSettings(req)) });
});

router.put('/attendance/settings', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const old = await getSettings(req);
  const value = (key, fallback) => req.body[key] === undefined ? fallback : req.body[key];
  await run(
    `UPDATE attendance_settings SET send_absence_alert = ?, send_late_alert = ?,
     send_repeated_absence_alert = ?, send_low_attendance_alert = ?,
     low_attendance_threshold = ?, repeated_absence_threshold = ?,
     auto_followup_enabled = ?, alert_channel = ?, alert_delay_minutes = ?,
     updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`,
    [value('sendAbsenceAlert', Number(old.send_absence_alert)) ? 1 : 0,
      value('sendLateAlert', Number(old.send_late_alert)) ? 1 : 0,
      value('sendRepeatedAbsenceAlert', Number(old.send_repeated_absence_alert)) ? 1 : 0,
      value('sendLowAttendanceAlert', Number(old.send_low_attendance_alert)) ? 1 : 0,
      Number(value('lowAttendanceThreshold', old.low_attendance_threshold)),
      Number(value('repeatedAbsenceThreshold', old.repeated_absence_threshold)),
      value('autoFollowupEnabled', Number(old.auto_followup_enabled)) ? 1 : 0,
      value('alertChannel', old.alert_channel),
      Number(value('alertDelayMinutes', old.alert_delay_minutes)),
      String(tenantId(req))]
  );
  const updated = await getSettings(req);
  await audit(req, 'ATTENDANCE_SETTINGS_UPDATED', 'attendance_settings', updated.id, camel(old), camel(updated));
  res.json({ data: camel(updated) });
});

router.get('/attendance/calendar', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const year = Number(req.query.year || new Date().getFullYear());
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const conditions = ['s.tenant_id = ?', 'COALESCE(s.session_date, s.date) LIKE ?', 's.deletedAt IS NULL'];
  const params = [tenantId(req), `${prefix}%`];
  for (const [key, column] of [['branchId', 's.branch_id'], ['batchId', 's.batch_id'], ['teacherId', 's.teacher_id'], ['status', 's.status']]) {
    if (req.query[key]) { conditions.push(`${column} = ?`); params.push(req.query[key]); }
  }
  if (req.query.courseId) { conditions.push('b.course_id = ?'); params.push(req.query.courseId); }
  if (req.user.role === ROLES.TEACHER) { conditions.push('CAST(s.teacher_id AS TEXT) = CAST(? AS TEXT)'); params.push(req.user.id); }
  const rows = await all(
    `SELECT s.*, b.name AS batch_name, sub.name AS subject_name, t.name AS teacher_name
     FROM attendance_sessions s
     LEFT JOIN batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id
     LEFT JOIN subjects sub ON sub.id = s.subject_id AND sub.tenant_id = s.tenant_id
     LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(s.teacher_id AS TEXT) AND t.tenant_id = s.tenant_id
     WHERE ${conditions.join(' AND ')} ORDER BY COALESCE(s.session_date, s.date), COALESCE(s.start_time, s.startTime)`,
    params
  );
  res.json({
    data: {
      month,
      year,
      sessions: rows.map((row) => ({
        id: row.id,
        date: row.session_date || row.date,
        batchId: row.batch_id,
        batch: row.batch_name || row.batch,
        subject: row.subject_name || row.subject,
        teacher: row.teacher_name || row.teacherName,
        status: row.status,
        presentCount: Number(row.present_count || 0),
        absentCount: Number(row.absent_count || 0),
        lateCount: Number(row.late_count || 0),
        totalStudents: Number(row.total_students || 0),
        attendancePercentage: Number(row.total_students || 0) ? Math.round(((Number(row.present_count || 0) + Number(row.late_count || 0) + Number(row.excused_count || 0)) / Number(row.total_students)) * 100) : 0,
        submittedAt: row.submitted_at || row.submittedAt,
      })),
    },
  });
});

router.post('/attendance/sessions/:id/send-parent-alerts', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const session = await loadSession(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found' });
  res.json({ data: await sendParentAlerts(req, session) });
});

router.post('/attendance/risk/recalculate', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const students = req.body.studentId
    ? [{ id: req.body.studentId, primary_batch_id: req.body.batchId }]
    : await all(`SELECT id, primary_batch_id FROM students WHERE tenant_id = ? AND deleted_at IS NULL`, [tenantId(req)]);
  const snapshots = [];
  for (const student of students) snapshots.push(await recalculateStudentRisk(req, student.id, req.body.batchId || student.primary_batch_id));
  res.json({ data: snapshots });
});

router.get('/reports/attendance-risk', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const conditions = ['r.tenant_id = ?'];
  const params = [String(tenantId(req))];
  for (const [key, column] of [['branchId', 'r.branch_id'], ['batchId', 'r.batch_id'], ['riskLevel', 'r.risk_level']]) {
    if (req.query[key]) { conditions.push(`${column} = ?`); params.push(req.query[key]); }
  }
  const rows = await all(
    `SELECT r.*, COALESCE(s.display_name, s.student_name, s.name) AS student_name,
       COALESCE(g.phone, s.parent_phone) AS parent_phone, br.name AS branch_name,
       c.name AS course_name, b.name AS batch_name
     FROM attendance_risk_snapshots r
     JOIN students s ON CAST(s.id AS TEXT) = CAST(r.student_id AS TEXT)
       AND CAST(s.tenant_id AS TEXT) = CAST(r.tenant_id AS TEXT)
     LEFT JOIN student_guardians g ON CAST(g.tenant_id AS TEXT) = CAST(r.tenant_id AS TEXT)
       AND g.student_id = CAST(s.id AS TEXT) AND g.is_primary = 1
     LEFT JOIN branches br ON br.id = r.branch_id
       AND CAST(br.tenant_id AS TEXT) = CAST(r.tenant_id AS TEXT)
     LEFT JOIN batches b ON b.id = r.batch_id
       AND CAST(b.tenant_id AS TEXT) = CAST(r.tenant_id AS TEXT)
     LEFT JOIN courses c ON c.id = b.course_id
       AND CAST(c.tenant_id AS TEXT) = CAST(r.tenant_id AS TEXT)
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE r.risk_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
       r.attendance_percentage`,
    params
  );
  res.json({ data: rows.map(camel) });
});

router.post('/attendance/auto-followups/run', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const snapshots = await all(`SELECT * FROM attendance_risk_snapshots WHERE tenant_id = ? AND risk_level IN ('CRITICAL', 'HIGH', 'MEDIUM')`, [String(tenantId(req))]);
  const results = [];
  for (const snapshot of snapshots) results.push(await ensureAttendanceFollowup(req, camel(snapshot)));
  res.json({ data: results.filter(Boolean) });
});

router.post('/attendance/teacher-completion/recalculate', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  const start = req.body.startDate || `${month}-01`;
  const end = req.body.endDate || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10);
  const teachers = req.body.teacherId ? [{ id: req.body.teacherId }] : await all(`SELECT id FROM teachers WHERE tenant_id = ?`, [tenantId(req)]);
  const scores = [];
  for (const teacher of teachers) scores.push(await recalculateTeacherScore(req, teacher.id, start, end));
  res.json({ data: scores });
});

router.get('/reports/teacher-attendance-completion', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const start = req.query.startDate || `${month}-01`;
  const end = req.query.endDate || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10);
  let sql = `SELECT sc.*, t.name AS teacher_name FROM teacher_attendance_completion_scores sc
    JOIN teachers t ON CAST(t.id AS TEXT) = CAST(sc.teacher_id AS TEXT)
      AND CAST(t.tenant_id AS TEXT) = CAST(sc.tenant_id AS TEXT)
    WHERE sc.tenant_id = ? AND sc.period_start = ? AND sc.period_end = ?`;
  const params = [String(tenantId(req)), start, end];
  if (req.query.teacherId) { sql += ' AND sc.teacher_id = ?'; params.push(req.query.teacherId); }
  if (req.query.branchId) { sql += ' AND sc.branch_id = ?'; params.push(req.query.branchId); }
  sql += ' ORDER BY sc.final_score ASC, t.name';
  res.json({ data: (await all(sql, params)).map(camel) });
});

router.post('/attendance/corrections', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const record = await get(
    `SELECT ar.*, s.branch_id FROM attendance_records ar
     JOIN attendance_sessions s ON s.id = ar.session_id AND s.tenant_id = ar.tenant_id
     WHERE ar.id = ? AND ar.tenant_id = ?`,
    [req.body.record_id || req.body.recordId, tenantId(req)]
  );
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  const newStatus = normalizeStatus(req.body.newStatus);
  if (!STATUSES.has(newStatus) || newStatus === 'NOT_MARKED') return res.status(400).json({ error: 'Valid corrected status is required' });
  if (!String(req.body.requestReason || '').trim()) return res.status(400).json({ error: 'Correction reason is required' });
  const result = await run(
    `INSERT INTO attendance_correction_requests
      (tenant_id, record_id, session_id, student_id, oldStatus, newStatus,
       requestReason, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, CURRENT_TIMESTAMP)`,
    [tenantId(req), record.id, record.session_id, record.student_id, record.status,
      newStatus, req.body.requestReason, req.user.username]
  );
  const created = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [result.lastID]);
  await audit(req, 'ATTENDANCE_CORRECTION_REQUESTED', 'attendance_correction', result.lastID, {}, camel(created), record.branch_id);
  res.status(201).json(created);
});

router.get('/attendance/corrections', authMiddleware, requireTenant, requireAnyRole(REPORT_ROLES), async (req, res) => {
  const rows = await all(
    `SELECT cr.*, COALESCE(st.display_name, st.student_name, st.name) AS studentName
     FROM attendance_correction_requests cr
     JOIN attendance_records ar ON ar.id = cr.record_id
     JOIN students st ON CAST(st.id AS TEXT) = CAST(cr.student_id AS TEXT) AND st.tenant_id = ar.tenant_id
     WHERE ar.tenant_id = ? ORDER BY cr.createdAt DESC`,
    [tenantId(req)]
  );
  res.json(rows);
});

async function resolveCorrection(req, status) {
  const correction = await get(
    `SELECT cr.*, ar.tenant_id, s.branch_id, s.batch_id
     FROM attendance_correction_requests cr
     JOIN attendance_records ar ON ar.id = cr.record_id
     JOIN attendance_sessions s ON s.id = cr.session_id AND s.tenant_id = ar.tenant_id
     WHERE cr.id = ? AND ar.tenant_id = ?`,
    [req.params.id, tenantId(req)]
  );
  if (!correction) return null;
  const now = new Date().toISOString();
  if (status === 'Approved') {
    await run(
      `UPDATE attendance_records SET status = ?, updated_at = CURRENT_TIMESTAMP,
       updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
      [normalizeStatus(correction.newStatus), correction.record_id, tenantId(req)]
    );
    await recalculateStudentRisk(req, correction.student_id, correction.batch_id);
  }
  await run(
    `UPDATE attendance_correction_requests SET status = ?, resolvedBy = ?, resolvedAt = ?
     WHERE id = ?`,
    [status, req.user.username, now, correction.id]
  );
  const updated = await get(`SELECT * FROM attendance_correction_requests WHERE id = ?`, [correction.id]);
  await audit(req, status === 'Approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED', 'attendance_correction', correction.id, camel(correction), camel(updated), correction.branch_id);
  return updated;
}

router.patch('/attendance/corrections/:id/approve', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const updated = await resolveCorrection(req, 'Approved');
  if (!updated) return res.status(404).json({ error: 'Correction request not found' });
  res.json(updated);
});

router.patch('/attendance/corrections/:id/reject', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const updated = await resolveCorrection(req, 'Rejected');
  if (!updated) return res.status(404).json({ error: 'Correction request not found' });
  res.json(updated);
});

module.exports = router;
