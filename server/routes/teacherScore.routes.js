const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');
const { calculateTeacherScore, getConfig, getScorecard } = require('../services/teacher-score.service');

const router = express.Router();
const VIEW_ROLES = [ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.TEACHER];
const MANAGE_ROLES = ROLE_GROUPS.MANAGEMENT;

function tenantId(req) { return String(req.user.tenantId || req.user.tenant_id); }
function camel(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}
function monthPeriod(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10), periodType: 'MONTHLY' };
}
function period(req) {
  const fallback = monthPeriod();
  return {
    periodStart: req.body?.periodStart || req.query.periodStart || fallback.periodStart,
    periodEnd: req.body?.periodEnd || req.query.periodEnd || fallback.periodEnd,
    periodType: String(req.body?.periodType || req.query.periodType || fallback.periodType).toUpperCase(),
  };
}
function scorecardPayload(value) {
  if (!value) return value;
  return {
    ...camel(value),
    components: (value.components || []).map(camel),
    alerts: (value.alerts || []).map(camel),
    improvementPlans: (value.improvementPlans || []).map(camel),
    reviewNotes: (value.reviewNotes || []).map(camel),
  };
}
async function audit(req, action, entityType, entityId, oldValues, newValues, branchId = null) {
  return createAuditLog({ tenantId: tenantId(req), branchId, actorUserId: req.user.id, action, entityType, entityId, oldValues, newValues });
}

router.get('/teacher-scorecards', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const conditions = ['CAST(t.tenant_id AS TEXT) = ?'];
  const params = [tenantId(req)];
  if (req.query.teacherId) { conditions.push('CAST(t.id AS TEXT) = ?'); params.push(String(req.query.teacherId)); }
  if (req.query.branchId) { conditions.push('CAST(latest.branch_id AS TEXT) = ?'); params.push(String(req.query.branchId)); }
  if (req.query.grade) { conditions.push('latest.grade = ?'); params.push(req.query.grade); }
  if (req.query.lowConfidenceOnly === 'true') conditions.push('COALESCE(latest.confidence_score, 0) < 60');
  if (req.query.needsReviewOnly === 'true') conditions.push(`(latest.grade = 'NEEDS_REVIEW' OR COALESCE(latest.confidence_score, 0) < 60)`);
  if (req.query.scoreMin) { conditions.push('latest.final_score >= ?'); params.push(Number(req.query.scoreMin)); }
  if (req.query.scoreMax) { conditions.push('latest.final_score <= ?'); params.push(Number(req.query.scoreMax)); }
  if (req.query.batchId || req.query.subjectId || req.query.courseId) {
    const assignmentConditions = ['CAST(bt.tenant_id AS TEXT) = CAST(t.tenant_id AS TEXT)', 'CAST(bt.teacher_id AS TEXT) = CAST(t.id AS TEXT)', `bt.status = 'ACTIVE'`];
    if (req.query.batchId) { assignmentConditions.push('CAST(bt.batch_id AS TEXT) = ?'); params.push(String(req.query.batchId)); }
    if (req.query.subjectId) { assignmentConditions.push('CAST(bt.subject_id AS TEXT) = ?'); params.push(String(req.query.subjectId)); }
    if (req.query.courseId) { assignmentConditions.push('CAST(bx.course_id AS TEXT) = ?'); params.push(String(req.query.courseId)); }
    conditions.push(`EXISTS (SELECT 1 FROM batch_teachers bt JOIN batches bx ON bx.id = bt.batch_id AND bx.tenant_id = bt.tenant_id WHERE ${assignmentConditions.join(' AND ')})`);
  }
  const rows = await all(
    `SELECT t.id AS teacher_id, t.name AS teacher_name, t.subject AS teacher_subject,
       latest.*, b.name AS branch_name,
       (SELECT COUNT(*) FROM teacher_score_alerts a WHERE a.teacher_score_snapshot_id = latest.id AND a.status = 'OPEN') AS open_alert_count,
       (SELECT COUNT(*) FROM teacher_complaints c WHERE c.tenant_id = CAST(t.tenant_id AS TEXT) AND c.teacher_id = CAST(t.id AS TEXT) AND c.status IN ('VALID','OPEN','UNDER_REVIEW','ESCALATED')) AS complaint_count
     FROM teachers t
     LEFT JOIN teacher_score_snapshots latest ON latest.id = (
       SELECT s2.id FROM teacher_score_snapshots s2
       WHERE s2.tenant_id = CAST(t.tenant_id AS TEXT) AND s2.teacher_id = CAST(t.id AS TEXT)
       ORDER BY s2.period_end DESC, s2.calculated_at DESC LIMIT 1
     )
     LEFT JOIN branches b ON CAST(b.id AS TEXT) = latest.branch_id AND CAST(b.tenant_id AS TEXT) = latest.tenant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN latest.final_score IS NULL THEN 1 ELSE 0 END, latest.final_score DESC, t.name`,
    params
  );
  const assignments = await all(
    `SELECT bt.teacher_id, s.name AS subject_name, bx.name AS batch_name
     FROM batch_teachers bt
     LEFT JOIN subjects s ON s.id = bt.subject_id AND s.tenant_id = bt.tenant_id
     LEFT JOIN batches bx ON bx.id = bt.batch_id AND bx.tenant_id = bt.tenant_id
     WHERE CAST(bt.tenant_id AS TEXT) = ? AND bt.status = 'ACTIVE'`,
    [tenantId(req)]
  );
  res.json({ data: rows.map((row) => {
    const related = assignments.filter((item) => String(item.teacher_id) === String(row.teacher_id));
    return {
      ...camel(row),
      subjects: [...new Set(related.map((item) => item.subject_name).filter(Boolean))].join(', '),
      batches: [...new Set(related.map((item) => item.batch_name).filter(Boolean))].join(', '),
    };
  }) });
});

router.get('/teacher-scorecards/config', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  res.json({ data: camel(await getConfig(tenantId(req))) });
});

router.patch('/teacher-scorecards/config', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const old = await getConfig(tenantId(req));
  const value = (key, fallback) => req.body[key] === undefined ? fallback : Number(req.body[key]);
  const weights = ['attendanceWeight', 'planningWeight', 'syllabusWeight', 'homeworkWeight', 'studentImprovementWeight', 'doubtSupportWeight', 'feedbackWeight'];
  const total = weights.reduce((sum, key) => sum + value(key, old[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]), 0);
  if (Math.abs(total - 100) > 0.01) return res.status(400).json({ error: 'Positive TeacherScore weights must total 100' });
  await run(
    `UPDATE teacher_score_configs SET attendance_weight = ?, planning_weight = ?, syllabus_weight = ?,
     homework_weight = ?, student_improvement_weight = ?, doubt_support_weight = ?, feedback_weight = ?,
     max_complaint_penalty = ?, minimum_feedback_responses = ?, minimum_attendance_sessions = ?,
     minimum_improvement_tests = ?, on_time_attendance_buffer_minutes = ?, allow_teacher_self_view = ?,
     updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`,
    [value('attendanceWeight', old.attendance_weight), value('planningWeight', old.planning_weight),
      value('syllabusWeight', old.syllabus_weight), value('homeworkWeight', old.homework_weight),
      value('studentImprovementWeight', old.student_improvement_weight), value('doubtSupportWeight', old.doubt_support_weight),
      value('feedbackWeight', old.feedback_weight), value('maxComplaintPenalty', old.max_complaint_penalty),
      value('minimumFeedbackResponses', old.minimum_feedback_responses), value('minimumAttendanceSessions', old.minimum_attendance_sessions),
      value('minimumImprovementTests', old.minimum_improvement_tests), value('onTimeAttendanceBufferMinutes', old.on_time_attendance_buffer_minutes),
      req.body.allowTeacherSelfView === undefined ? old.allow_teacher_self_view : req.body.allowTeacherSelfView ? 1 : 0, tenantId(req)]
  );
  const updated = await getConfig(tenantId(req));
  await audit(req, 'TEACHER_SCORE_CONFIG_UPDATED', 'teacher_score_config', updated.id, camel(old), camel(updated));
  res.json({ data: camel(updated) });
});

router.post('/teacher-scorecards/recalculate', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const selectedPeriod = period(req);
  const teachers = await all(`SELECT id FROM teachers WHERE CAST(tenant_id AS TEXT) = ? ORDER BY id`, [tenantId(req)]);
  const results = [];
  for (const teacher of teachers) {
    try { results.push({ ok: true, data: scorecardPayload(await calculateTeacherScore({ tenantId: tenantId(req), teacherId: teacher.id, ...selectedPeriod, userId: req.user.id, branchId: req.body.branchId })) }); }
    catch (error) { results.push({ ok: false, teacherId: teacher.id, error: error.message }); }
  }
  res.json({ data: results });
});

router.post('/teacher-scorecards/:teacherId/recalculate', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const result = await calculateTeacherScore({ tenantId: tenantId(req), teacherId: req.params.teacherId, ...period(req), userId: req.user.id, branchId: req.body.branchId });
    res.status(201).json({ data: scorecardPayload(result) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/teacher-scorecards/:teacherId/lock', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const snapshot = await get(`SELECT * FROM teacher_score_snapshots WHERE id = ? AND tenant_id = ? AND teacher_id = ?`, [req.body.snapshotId, tenantId(req), String(req.params.teacherId)]);
  if (!snapshot) return res.status(404).json({ error: 'TeacherScore snapshot not found' });
  if (!snapshot.locked_at) await run(`UPDATE teacher_score_snapshots SET locked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [new Date().toISOString(), snapshot.id]);
  await audit(req, 'TEACHER_SCORE_LOCKED', 'teacher_score_snapshot', snapshot.id, { lockedAt: snapshot.locked_at }, { lockedAt: new Date().toISOString(), teacherId: req.params.teacherId }, snapshot.branch_id);
  res.json({ data: camel(await get(`SELECT * FROM teacher_score_snapshots WHERE id = ?`, [snapshot.id])) });
});

router.get('/teacher-scorecards/:teacherId', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const result = await getScorecard(tenantId(req), req.params.teacherId, req.query.snapshotId);
  if (!result) return res.status(404).json({ error: 'TeacherScore snapshot not found' });
  res.json({ data: scorecardPayload(result) });
});

router.get('/teacher-scorecards/:teacherId/history', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const rows = await all(
    `SELECT * FROM teacher_score_snapshots WHERE tenant_id = ? AND teacher_id = ?
     ORDER BY period_end DESC, calculated_at DESC`,
    [tenantId(req), String(req.params.teacherId)]
  );
  res.json({ data: rows.map(camel) });
});

router.get('/teacher-scorecards/:teacherId/components', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const scorecard = await getScorecard(tenantId(req), req.params.teacherId, req.query.snapshotId);
  if (!scorecard) return res.status(404).json({ error: 'TeacherScore snapshot not found' });
  res.json({ data: scorecard.components.map(camel) });
});

const evidenceRoutes = {
  'attendance-evidence': ['ATTENDANCE'],
  'syllabus-evidence': ['SYLLABUS', 'PLANNING'],
  'homework-evidence': ['HOMEWORK_DOCUMENTATION'],
  'student-improvement-evidence': ['STUDENT_IMPROVEMENT'],
  'doubt-session-evidence': ['DOUBT_SUPPORT'],
  'complaint-evidence': ['COMPLAINT_PENALTY'],
  'feedback-evidence': ['FEEDBACK_CLASS_QUALITY'],
};
for (const [path, categories] of Object.entries(evidenceRoutes)) {
  router.get(`/teacher-scorecards/:teacherId/${path}`, authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
    const scorecard = await getScorecard(tenantId(req), req.params.teacherId, req.query.snapshotId);
    if (!scorecard) return res.status(404).json({ error: 'TeacherScore snapshot not found' });
    res.json({ data: scorecard.components.filter((item) => categories.includes(item.category)).map(camel) });
  });
}

router.post('/teacher-scorecards/:teacherId/review-notes', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  if (!String(req.body.note || '').trim()) return res.status(400).json({ error: 'note is required' });
  const snapshot = await get(`SELECT * FROM teacher_score_snapshots WHERE id = ? AND tenant_id = ? AND teacher_id = ?`, [req.body.snapshotId, tenantId(req), String(req.params.teacherId)]);
  if (!snapshot) return res.status(404).json({ error: 'TeacherScore snapshot not found' });
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO teacher_score_review_notes (id, tenant_id, teacher_score_snapshot_id, teacher_id, note, reviewed_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), snapshot.id, String(req.params.teacherId), String(req.body.note).trim(), req.user.id]
  );
  await audit(req, 'TEACHER_SCORE_REVIEW_NOTE_ADDED', 'teacher_score_snapshot', snapshot.id, {}, { noteId: id }, snapshot.branch_id);
  res.status(201).json({ data: camel(await get(`SELECT * FROM teacher_score_review_notes WHERE id = ?`, [id])) });
});

router.post('/teacher-scorecards/:teacherId/improvement-plans', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  if (!req.body.problemArea || !req.body.goal || !req.body.actionPlan) return res.status(400).json({ error: 'problemArea, goal, and actionPlan are required' });
  const teacher = await get(`SELECT * FROM teachers WHERE CAST(tenant_id AS TEXT) = ? AND CAST(id AS TEXT) = ?`, [tenantId(req), String(req.params.teacherId)]);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO teacher_improvement_plans
      (id, tenant_id, branch_id, teacher_id, teacher_score_snapshot_id, period_start, period_end,
       problem_area, goal, action_plan, assigned_by_user_id, assigned_to_user_id, review_date,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), req.body.branchId || null, String(req.params.teacherId), req.body.snapshotId || null,
      req.body.periodStart || null, req.body.periodEnd || null, req.body.problemArea, req.body.goal,
      req.body.actionPlan, req.user.id, req.body.assignedToUserId || null, req.body.reviewDate || null]
  );
  await audit(req, 'TEACHER_IMPROVEMENT_PLAN_CREATED', 'teacher_improvement_plan', id, {}, { ...req.body, teacherId: req.params.teacherId }, req.body.branchId);
  res.status(201).json({ data: camel(await get(`SELECT * FROM teacher_improvement_plans WHERE id = ?`, [id])) });
});

router.patch('/teacher-scorecards/improvement-plans/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const old = await get(`SELECT * FROM teacher_improvement_plans WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
  if (!old) return res.status(404).json({ error: 'Improvement plan not found' });
  const status = req.body.status || old.status;
  await run(
    `UPDATE teacher_improvement_plans SET problem_area = ?, goal = ?, action_plan = ?,
     assigned_to_user_id = ?, review_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [req.body.problemArea || old.problem_area, req.body.goal || old.goal, req.body.actionPlan || old.action_plan,
      req.body.assignedToUserId ?? old.assigned_to_user_id, req.body.reviewDate ?? old.review_date, status, old.id]
  );
  const updated = await get(`SELECT * FROM teacher_improvement_plans WHERE id = ?`, [old.id]);
  await audit(req, status === 'COMPLETED' ? 'TEACHER_IMPROVEMENT_PLAN_COMPLETED' : 'TEACHER_IMPROVEMENT_PLAN_UPDATED', 'teacher_improvement_plan', old.id, camel(old), camel(updated), old.branch_id);
  res.json({ data: camel(updated) });
});

router.post('/teacher-scorecards/:teacherId/complaints', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  if (!String(req.body.description || '').trim()) return res.status(400).json({ error: 'description is required' });
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO teacher_complaints
      (id, tenant_id, branch_id, teacher_id, student_id, guardian_id, batch_id, subject_id,
       complaint_type, severity, description, source_channel, status, reported_by_user_id,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), req.body.branchId || null, String(req.params.teacherId), req.body.studentId || null,
      req.body.guardianId || null, req.body.batchId || null, req.body.subjectId || null,
      req.body.complaintType || 'OTHER', req.body.severity || 'LOW', String(req.body.description).trim(),
      req.body.sourceChannel || 'MANUAL', req.body.status || 'OPEN', req.user.id]
  );
  res.status(201).json({ data: camel(await get(`SELECT * FROM teacher_complaints WHERE id = ?`, [id])) });
});

router.patch('/teacher-scorecards/complaints/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const old = await get(`SELECT * FROM teacher_complaints WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
    if (!old) return res.status(404).json({ error: 'Complaint not found' });
    const status = req.body.status || old.status;
    const now = new Date().toISOString();
    const reviewed = ['VALID', 'INVALID', 'RESOLVED'].includes(status);
    const resolved = status === 'RESOLVED';
    await run(
      `UPDATE teacher_complaints SET status = ?, severity = ?, reviewed_by_user_id = ?,
       reviewed_at = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, req.body.severity || old.severity, reviewed ? req.user.id : old.reviewed_by_user_id,
        reviewed ? now : old.reviewed_at, resolved ? req.user.id : old.resolved_by_user_id,
        resolved ? now : old.resolved_at, old.id]
    );
    res.json({ data: camel(await get(`SELECT * FROM teacher_complaints WHERE id = ?`, [old.id])) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/teacher-scorecards/:teacherId/feedback-surveys', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const responses = Array.isArray(req.body.responses) ? req.body.responses : [];
  const average = responses.length ? responses.reduce((sum, item) => sum + Number(item.overallRating || 0), 0) / responses.length : Number(req.body.averageRating || 0);
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO teacher_feedback_surveys
      (id, tenant_id, branch_id, teacher_id, batch_id, subject_id, survey_date,
       period_start, period_end, average_rating, response_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), req.body.branchId || null, String(req.params.teacherId), req.body.batchId || null,
      req.body.subjectId || null, req.body.surveyDate || new Date().toISOString().slice(0, 10),
      req.body.periodStart, req.body.periodEnd, average, responses.length || Number(req.body.responseCount || 0)]
  );
  for (const response of responses) {
    await run(
      `INSERT INTO teacher_feedback_responses
        (id, tenant_id, survey_id, teacher_id, student_id, clarity_rating, pace_rating,
         doubt_solving_rating, discipline_rating, homework_rating, overall_rating, comment,
         is_anonymous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), tenantId(req), id, String(req.params.teacherId), response.studentId || null,
        response.clarityRating || null, response.paceRating || null, response.doubtSolvingRating || null,
        response.disciplineRating || null, response.homeworkRating || null, response.overallRating,
        response.comment || null, response.isAnonymous === false ? 0 : 1]
    );
  }
  res.status(201).json({ data: camel(await get(`SELECT * FROM teacher_feedback_surveys WHERE id = ?`, [id])) });
});

router.get('/teacher-scorecards/:teacherId/syllabus-progress', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const rows = await all(
    `SELECT * FROM batch_syllabus_progress WHERE tenant_id = ? AND teacher_id = ?
     ORDER BY planned_end_date DESC, created_at DESC`,
    [tenantId(req), String(req.params.teacherId)]
  );
  res.json({ data: rows.map(camel) });
});

router.post('/teacher-scorecards/:teacherId/syllabus-progress', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  if (!req.body.topicTitle && !req.body.topicId) return res.status(400).json({ error: 'topicTitle or topicId is required' });
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO batch_syllabus_progress
      (id, tenant_id, branch_id, batch_id, course_id, subject_id, teacher_id, topic_id,
       topic_title, planned_start_date, planned_end_date, actual_completed_date, status,
       completion_percentage, verified_by_user_id, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), req.body.branchId || null, req.body.batchId || null, req.body.courseId || null,
      req.body.subjectId || null, String(req.params.teacherId), req.body.topicId || null,
      req.body.topicTitle || null, req.body.plannedStartDate || null, req.body.plannedEndDate || null,
      req.body.actualCompletedDate || null, req.body.status || 'NOT_STARTED',
      Number(req.body.completionPercentage || 0), req.body.verified ? req.user.id : null,
      req.body.verified ? new Date().toISOString() : null]
  );
  res.status(201).json({ data: camel(await get(`SELECT * FROM batch_syllabus_progress WHERE id = ?`, [id])) });
});

router.patch('/teacher-scorecards/syllabus-progress/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const old = await get(`SELECT * FROM batch_syllabus_progress WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
  if (!old) return res.status(404).json({ error: 'Syllabus progress record not found' });
  const status = req.body.status || old.status;
  const verified = status === 'VERIFIED' || req.body.verified === true;
  await run(
    `UPDATE batch_syllabus_progress SET actual_completed_date = ?, status = ?,
     completion_percentage = ?, verified_by_user_id = ?, verified_at = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [req.body.actualCompletedDate ?? old.actual_completed_date, status,
      Number(req.body.completionPercentage ?? old.completion_percentage),
      verified ? req.user.id : old.verified_by_user_id,
      verified ? new Date().toISOString() : old.verified_at, old.id]
  );
  res.json({ data: camel(await get(`SELECT * FROM batch_syllabus_progress WHERE id = ?`, [old.id])) });
});

router.post('/teacher-scorecards/:teacherId/homework-checks', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  if (!req.body.homeworkAssignmentId) return res.status(400).json({ error: 'homeworkAssignmentId is required' });
  const assignment = await get(`SELECT * FROM homework_assignments WHERE CAST(id AS TEXT) = ? AND CAST(tenant_id AS TEXT) = ?`, [String(req.body.homeworkAssignmentId), tenantId(req)]);
  if (!assignment) return res.status(404).json({ error: 'Homework assignment not found' });
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO homework_checks
      (id, tenant_id, homework_assignment_id, student_id, teacher_id, checked_status,
       checked_at, remarks, marks_or_grade, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, tenantId(req), String(assignment.id), req.body.studentId || null, String(req.params.teacherId),
      req.body.checkedStatus || 'CHECKED', req.body.checkedAt || new Date().toISOString(),
      req.body.remarks || null, req.body.marksOrGrade || null]
  );
  await run(
    `UPDATE homework_assignments SET teacher_id = COALESCE(teacher_id, ?),
     checked_count = (SELECT COUNT(*) FROM homework_checks WHERE homework_assignment_id = ? AND checked_status IN ('CHECKED','RETURNED_FOR_CORRECTION')),
     checked_on_time_count = (SELECT COUNT(*) FROM homework_checks WHERE homework_assignment_id = ? AND checked_status IN ('CHECKED','RETURNED_FOR_CORRECTION') AND checked_at <= COALESCE(homework_assignments.due_date, homework_assignments.dueDate)),
     updatedAt = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = ?`,
    [String(req.params.teacherId), String(assignment.id), String(assignment.id), assignment.id]
  );
  res.status(201).json({ data: camel(await get(`SELECT * FROM homework_checks WHERE id = ?`, [id])) });
});

router.get('/teacher-scorecards/:teacherId/audit-log', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const rows = await all(
    `SELECT * FROM audit_logs WHERE CAST(tenant_id AS TEXT) = ?
       AND ((entity_type = 'teacher_score_snapshot' AND (new_values LIKE ? OR old_values LIKE ?))
         OR (entity_type = 'teacher_improvement_plan' AND (new_values LIKE ? OR old_values LIKE ?)))
     ORDER BY created_at DESC LIMIT 200`,
    [tenantId(req), `%"teacherId":"${req.params.teacherId}"%`, `%"teacherId":"${req.params.teacherId}"%`,
      `%"teacherId":"${req.params.teacherId}"%`, `%"teacherId":"${req.params.teacherId}"%`]
  );
  res.json({ data: rows.map(camel) });
});

module.exports = router;
