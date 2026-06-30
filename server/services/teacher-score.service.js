const crypto = require('crypto');

const { run, get, all, transaction } = require('./db.service');
const { createAuditLog } = require('./auditLog.service');

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}
function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(Number(value || 0) * multiplier) / multiplier;
}
function json(value, fallback = []) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
function gradeFor(score) {
  if (score >= 90) return 'A_PLUS';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'NEEDS_REVIEW';
}
function improvementScore(points) {
  if (points >= 20) return 100;
  if (points >= 15) return 90;
  if (points >= 10) return 80;
  if (points >= 5) return 70;
  if (points >= 0) return 55;
  return clamp(30 + points * 2, 0, 30);
}
function component({ metricKey, category, rawValue = 0, rawDisplay, targetValue = 0, score = 0, weight = 0, sourceEntityType, sourceEntityIds = [], calculationNote, evidenceAvailable = false, minimumDataMet = false }) {
  return {
    metricKey, category, rawValue: round(rawValue), rawDisplay, targetValue: round(targetValue),
    score: round(clamp(score)), weight: round(weight), weightedScore: round((clamp(score) / 100) * Number(weight || 0)),
    sourceEntityType, sourceEntityIds, calculationNote, evidenceAvailable, minimumDataMet,
  };
}
async function getConfig(tenantId) {
  return get(`SELECT * FROM teacher_score_configs WHERE tenant_id = ? AND is_active = 1`, [String(tenantId)]);
}
async function teacherContext(tenantId, teacherId) {
  const teacher = await get(`SELECT * FROM teachers WHERE CAST(tenant_id AS TEXT) = ? AND CAST(id AS TEXT) = ?`, [String(tenantId), String(teacherId)]);
  if (!teacher) throw new Error('Teacher not found');
  const assignments = await all(
    `SELECT bt.*, b.name AS batch_name, b.branch_id, s.name AS subject_name, c.name AS course_name
     FROM batch_teachers bt
     JOIN batches b ON b.id = bt.batch_id AND b.tenant_id = bt.tenant_id
     LEFT JOIN subjects s ON s.id = bt.subject_id AND s.tenant_id = bt.tenant_id
     LEFT JOIN courses c ON c.id = b.course_id AND c.tenant_id = bt.tenant_id
     WHERE CAST(bt.tenant_id AS TEXT) = ? AND CAST(bt.teacher_id AS TEXT) = ? AND bt.status = 'ACTIVE'`,
    [String(tenantId), String(teacherId)]
  );
  return { teacher, assignments };
}
async function attendanceMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const row = await get(
    `SELECT * FROM teacher_attendance_completion_scores
     WHERE tenant_id = ? AND teacher_id = ? AND period_start <= ? AND period_end >= ?
     ORDER BY updated_at DESC LIMIT 1`,
    [String(tenantId), String(teacherId), periodEnd, periodStart]
  );
  const scheduled = Number(row?.scheduled_sessions || 0);
  const onTime = Number(row?.on_time_submissions || 0);
  const score = scheduled ? (onTime / scheduled) * 100 : 0;
  return component({
    metricKey: 'attendance_taken_on_time', category: 'ATTENDANCE',
    rawValue: onTime, rawDisplay: `${onTime}/${scheduled} on-time submissions`, targetValue: scheduled,
    score, weight: config.attendance_weight, sourceEntityType: 'teacher_attendance_completion_scores',
    sourceEntityIds: row ? [row.id] : [], evidenceAvailable: Boolean(row),
    minimumDataMet: scheduled >= Number(config.minimum_attendance_sessions || 5),
    calculationNote: row ? `${onTime} out of ${scheduled} scheduled sessions had attendance submitted on time. ${Number(row.correction_requests || 0)} correction requests recorded.` : 'No attendance completion snapshot exists for this period.',
  });
}
async function planningMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM lecture_plans WHERE CAST(tenant_id AS TEXT) = ? AND CAST(teacher_id AS TEXT) = ?
       AND COALESCE(plan_date, date) BETWEEN ? AND ? ORDER BY COALESCE(plan_date, date)`,
    [String(tenantId), String(teacherId), periodStart, periodEnd]
  );
  let credits = 0;
  rows.forEach((row) => {
    const status = String(row.status || '').toUpperCase();
    credits += status === 'VERIFIED' ? 1 : ['COMPLETED', 'DELIVERED'].includes(status) ? 0.7 : 0;
  });
  const score = rows.length ? (credits / rows.length) * 100 : 0;
  return component({
    metricKey: 'lecture_plans_completed', category: 'PLANNING', rawValue: credits,
    rawDisplay: `${round(credits)}/${rows.length} weighted plans`, targetValue: rows.length,
    score, weight: config.planning_weight, sourceEntityType: 'lecture_plans',
    sourceEntityIds: rows.map((row) => row.id), evidenceAvailable: rows.length > 0,
    minimumDataMet: rows.length > 0,
    calculationNote: `${rows.filter((row) => String(row.status).toUpperCase() === 'VERIFIED').length} verified and ${rows.filter((row) => ['COMPLETED', 'DELIVERED'].includes(String(row.status).toUpperCase())).length} completed plans out of ${rows.length}.`,
  });
}
async function syllabusMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM batch_syllabus_progress WHERE tenant_id = ? AND teacher_id = ?
       AND COALESCE(planned_end_date, planned_start_date, created_at) BETWEEN ? AND ?
       AND status <> 'SKIPPED' ORDER BY planned_end_date`,
    [String(tenantId), String(teacherId), periodStart, periodEnd]
  );
  let credits = 0;
  rows.forEach((row) => {
    const status = String(row.status || '').toUpperCase();
    if (status === 'VERIFIED') credits += 1;
    else if (status === 'COMPLETED') credits += row.actual_completed_date && row.planned_end_date && row.actual_completed_date > row.planned_end_date ? 0.8 : 1;
    else credits += clamp(row.completion_percentage) / 100;
  });
  return component({
    metricKey: 'syllabus_progress', category: 'SYLLABUS', rawValue: credits,
    rawDisplay: `${round(credits)}/${rows.length} topic credits`, targetValue: rows.length,
    score: rows.length ? (credits / rows.length) * 100 : 0, weight: config.syllabus_weight,
    sourceEntityType: 'batch_syllabus_progress', sourceEntityIds: rows.map((row) => row.id),
    evidenceAvailable: rows.length > 0, minimumDataMet: rows.length > 0,
    calculationNote: rows.length ? `Aggregated ${rows.length} planned batch-subject topics with reduced credit for delayed completion.` : 'No teacher-linked syllabus progress exists for this period.',
  });
}
async function homeworkMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM homework_assignments WHERE CAST(tenant_id AS TEXT) = ? AND CAST(teacher_id AS TEXT) = ?
       AND COALESCE(assigned_date, date) BETWEEN ? AND ? ORDER BY COALESCE(assigned_date, date)`,
    [String(tenantId), String(teacherId), periodStart, periodEnd]
  );
  const submitted = rows.reduce((sum, row) => sum + Number(row.submitted_count ?? row.submittedCount ?? 0), 0);
  const checked = rows.reduce((sum, row) => sum + Number(row.checked_count ?? 0), 0);
  const onTime = rows.reduce((sum, row) => sum + Number(row.checked_on_time_count ?? row.checked_count ?? 0), 0);
  const checkingScore = submitted ? (onTime / submitted) * 70 : 0;
  const assignmentScore = rows.length ? 30 : 0;
  return component({
    metricKey: 'homework_checked', category: 'HOMEWORK_DOCUMENTATION', rawValue: checked,
    rawDisplay: `${checked}/${submitted} submissions checked`, targetValue: submitted,
    score: checkingScore + assignmentScore, weight: config.homework_weight,
    sourceEntityType: 'homework_assignments', sourceEntityIds: rows.map((row) => row.id),
    evidenceAvailable: rows.length > 0 && submitted > 0, minimumDataMet: rows.length > 0 && submitted > 0,
    calculationNote: rows.length ? `${rows.length} assignments; ${onTime} of ${submitted} submitted items were recorded as checked on time.` : 'No teacher-linked homework assignments exist for this period.',
  });
}
async function improvementMetric(tenantId, teacherId, periodStart, periodEnd, config, assignments) {
  const batchNames = [...new Set(assignments.map((row) => row.batch_name).filter(Boolean))];
  const subjects = [...new Set(assignments.map((row) => row.subject_name).filter(Boolean))];
  if (!batchNames.length) return component({
    metricKey: 'student_marks_improvement', category: 'STUDENT_IMPROVEMENT', weight: config.student_improvement_weight,
    sourceEntityType: 'student_test_results', calculationNote: 'No active batch-subject assignment exists for this teacher.',
  });
  const params = [String(tenantId), periodStart, periodEnd, ...batchNames];
  let sql = `SELECT r.*, t.date AS test_date FROM student_test_results r
    LEFT JOIN test_calendars t ON t.id = r.test_id
    WHERE CAST(r.tenant_id AS TEXT) = ? AND COALESCE(t.date, r.createdAt) BETWEEN ? AND ?
      AND r.batchName IN (${batchNames.map(() => '?').join(',')})`;
  if (subjects.length) { sql += ` AND r.subject IN (${subjects.map(() => '?').join(',')})`; params.push(...subjects); }
  sql += ' ORDER BY COALESCE(t.date, r.createdAt), r.id';
  const rows = await all(sql, params);
  const groups = {};
  rows.forEach((row) => {
    const key = `${row.student_id || row.studentName}|${row.subject || ''}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...row, percentage: Number(row.totalMarks || 0) ? (Number(row.marksObtained || 0) / Number(row.totalMarks)) * 100 : Number(row.accuracy || 0) });
  });
  const comparable = Object.values(groups).filter((items) => items.length >= Number(config.minimum_improvement_tests || 2));
  const gains = comparable.map((items) => items[items.length - 1].percentage - items[0].percentage);
  const averageGain = gains.length ? gains.reduce((sum, value) => sum + value, 0) / gains.length : 0;
  const weakGroups = comparable.filter((items) => items[0].percentage < 50);
  const weakGain = weakGroups.length ? weakGroups.reduce((sum, items) => sum + (items[items.length - 1].percentage - items[0].percentage), 0) / weakGroups.length : 0;
  const combinedGain = gains.length ? averageGain * 0.75 + weakGain * 0.25 : 0;
  return component({
    metricKey: 'student_marks_improvement', category: 'STUDENT_IMPROVEMENT',
    rawValue: combinedGain, rawDisplay: `${round(combinedGain)} percentage-point adjusted gain`, targetValue: 20,
    score: improvementScore(combinedGain), weight: config.student_improvement_weight,
    sourceEntityType: 'student_test_results', sourceEntityIds: rows.map((row) => row.id),
    evidenceAvailable: rows.length > 0, minimumDataMet: comparable.length > 0,
    calculationNote: comparable.length ? `${comparable.length} student-subject trends compared. Average gain ${round(averageGain)} points; weak-student gain ${round(weakGain)} points.` : `At least ${config.minimum_improvement_tests || 2} tests per student-subject are required.`,
  });
}
async function doubtMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM doubt_sessions WHERE CAST(tenant_id AS TEXT) = ? AND CAST(teacher_id AS TEXT) = ?
       AND COALESCE(session_date, date) BETWEEN ? AND ? ORDER BY COALESCE(session_date, date)`,
    [String(tenantId), String(teacherId), periodStart, periodEnd]
  );
  const completed = rows.filter((row) => String(row.status || '').toUpperCase() === 'COMPLETED').length;
  const resolutionTotal = rows.reduce((sum, row) => sum + Number(row.resolved_count || 0), 0);
  const studentTotal = rows.reduce((sum, row) => sum + Number(row.student_count ?? row.studentsAssigned ?? 0), 0);
  const completion = rows.length ? (completed / rows.length) * 80 : 0;
  const resolution = studentTotal ? (resolutionTotal / studentTotal) * 20 : (rows.some((row) => Number(row.improvementChecked)) ? 20 : 0);
  return component({
    metricKey: 'doubt_support', category: 'DOUBT_SUPPORT', rawValue: completed,
    rawDisplay: `${completed}/${rows.length} completed sessions`, targetValue: rows.length,
    score: completion + resolution, weight: config.doubt_support_weight,
    sourceEntityType: 'doubt_sessions', sourceEntityIds: rows.map((row) => row.id),
    evidenceAvailable: rows.length > 0, minimumDataMet: rows.length > 0,
    calculationNote: `${completed} of ${rows.length} planned doubt sessions completed; resolution evidence contributed ${round(resolution)} score points.`,
  });
}
async function feedbackMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM teacher_feedback_surveys WHERE tenant_id = ? AND teacher_id = ?
       AND period_start <= ? AND period_end >= ? ORDER BY survey_date`,
    [String(tenantId), String(teacherId), periodEnd, periodStart]
  );
  const responses = rows.reduce((sum, row) => sum + Number(row.response_count || 0), 0);
  const rating = responses ? rows.reduce((sum, row) => sum + Number(row.average_rating || 0) * Number(row.response_count || 0), 0) / responses : 0;
  return component({
    metricKey: 'student_feedback', category: 'FEEDBACK_CLASS_QUALITY', rawValue: rating,
    rawDisplay: `${round(rating)}/5 from ${responses} responses`, targetValue: 5,
    score: (rating / 5) * 100, weight: config.feedback_weight,
    sourceEntityType: 'teacher_feedback_surveys', sourceEntityIds: rows.map((row) => row.id),
    evidenceAvailable: responses > 0, minimumDataMet: responses >= Number(config.minimum_feedback_responses || 10),
    calculationNote: responses ? `Weighted average rating from ${responses} responses. Low sample size affects confidence, not the score.` : 'No structured student feedback exists for this period.',
  });
}
async function complaintMetric(tenantId, teacherId, periodStart, periodEnd, config) {
  const rows = await all(
    `SELECT * FROM teacher_complaints WHERE tenant_id = ? AND teacher_id = ?
       AND created_at BETWEEN ? AND ? ORDER BY created_at`,
    [String(tenantId), String(teacherId), periodStart, `${periodEnd}T23:59:59.999Z`]
  );
  const counted = rows.filter((row) => row.status === 'VALID' || (['HIGH', 'CRITICAL'].includes(row.severity) && ['OPEN', 'UNDER_REVIEW', 'ESCALATED'].includes(row.status)));
  const values = { LOW: 1, MEDIUM: 3, HIGH: 6, CRITICAL: 10 };
  const penalty = Math.min(Number(config.max_complaint_penalty || 10), counted.reduce((sum, row) => sum + (values[row.severity] || 0), 0));
  const unreviewed = rows.filter((row) => !['VALID', 'INVALID', 'RESOLVED'].includes(row.status)).length;
  return {
    component: component({
      metricKey: 'parent_complaint_penalty', category: 'COMPLAINT_PENALTY',
      rawValue: counted.length, rawDisplay: `${counted.length} counted complaints`, targetValue: 0,
      score: 0, weight: 0, sourceEntityType: 'teacher_complaints',
      sourceEntityIds: rows.map((row) => row.id), evidenceAvailable: true, minimumDataMet: unreviewed === 0,
      calculationNote: `${counted.length} valid or unresolved serious complaints produced a ${round(penalty)} point penalty. Invalid complaints were excluded.`,
    }),
    penalty: round(penalty),
    rows,
  };
}
async function createAlerts({ tenantId, branchId, teacherId, snapshotId, components, finalScore, confidenceScore, complaintPenalty }) {
  const byKey = Object.fromEntries(components.map((item) => [item.metricKey, item]));
  const alerts = [];
  const add = (type, severity, message) => alerts.push({ type, severity, message });
  if (finalScore < 60 && confidenceScore >= 60) add('TEACHER_SCORE_LOW', 'HIGH', `TeacherScore is ${round(finalScore)}, below 60.`);
  if (byKey.attendance_taken_on_time?.minimumDataMet && (byKey.attendance_taken_on_time?.score || 0) < 75) add('ATTENDANCE_SCORE_LOW', 'HIGH', 'Attendance discipline is below 75.');
  if ((byKey.syllabus_progress?.score || 0) < 80 && byKey.syllabus_progress?.evidenceAvailable) add('SYLLABUS_DELAY', 'MEDIUM', 'Syllabus completion is below 80%.');
  if ((byKey.homework_checked?.score || 0) < 70 && byKey.homework_checked?.evidenceAvailable) add('HOMEWORK_CHECKING_LOW', 'MEDIUM', 'Homework checking is below 70%.');
  if ((byKey.student_marks_improvement?.rawValue || 0) < 0) add('STUDENT_IMPROVEMENT_NEGATIVE', 'HIGH', 'Student marks trend is negative.');
  if (complaintPenalty > 5) add('COMPLAINT_PENALTY_HIGH', 'HIGH', `Complaint penalty is ${complaintPenalty}.`);
  if ((byKey.student_feedback?.rawValue || 0) < 3.5 && byKey.student_feedback?.minimumDataMet) add('FEEDBACK_LOW', 'MEDIUM', 'Student feedback is below 3.5/5.');
  if (confidenceScore < 60) add('CONFIDENCE_LOW', 'MEDIUM', `TeacherScore confidence is ${round(confidenceScore)}%.`);
  await run(`DELETE FROM teacher_score_alerts WHERE teacher_score_snapshot_id = ?`, [snapshotId]);
  for (const alert of alerts) {
    await run(
      `INSERT INTO teacher_score_alerts
        (id, tenant_id, branch_id, teacher_id, teacher_score_snapshot_id, alert_type, severity, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), String(tenantId), branchId || null, String(teacherId), snapshotId, alert.type, alert.severity, alert.message]
    );
  }
}
async function calculateTeacherScore({ tenantId, teacherId, periodStart, periodEnd, periodType = 'MONTHLY', userId, branchId = null }) {
  const config = await getConfig(tenantId);
  if (!config) throw new Error('TeacherScore config not found');
  const context = await teacherContext(tenantId, teacherId);
  const metrics = await Promise.all([
    attendanceMetric(tenantId, teacherId, periodStart, periodEnd, config),
    planningMetric(tenantId, teacherId, periodStart, periodEnd, config),
    syllabusMetric(tenantId, teacherId, periodStart, periodEnd, config),
    homeworkMetric(tenantId, teacherId, periodStart, periodEnd, config),
    improvementMetric(tenantId, teacherId, periodStart, periodEnd, config, context.assignments),
    doubtMetric(tenantId, teacherId, periodStart, periodEnd, config),
    feedbackMetric(tenantId, teacherId, periodStart, periodEnd, config),
  ]);
  const complaint = await complaintMetric(tenantId, teacherId, periodStart, periodEnd, config);
  const components = [...metrics, complaint.component];
  const positiveScore = metrics.reduce((sum, item) => sum + item.weightedScore, 0);
  const finalScore = round(clamp(positiveScore - complaint.penalty));
  const confidenceFactors = metrics.map((item) => item.evidenceAvailable && item.minimumDataMet ? 1 : item.evidenceAvailable ? 0.5 : 0);
  confidenceFactors.push(complaint.component.minimumDataMet ? 1 : 0.5);
  const confidenceScore = round((confidenceFactors.reduce((sum, value) => sum + value, 0) / confidenceFactors.length) * 100);
  const snapshotId = crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = await get(
    `SELECT * FROM teacher_score_snapshots WHERE tenant_id = ? AND teacher_id = ? AND period_start = ? AND period_end = ? AND period_type = ?`,
    [String(tenantId), String(teacherId), periodStart, periodEnd, periodType]
  );
  if (existing?.locked_at) throw new Error('This TeacherScore snapshot is locked');
  const id = existing?.id || snapshotId;
  await transaction(async () => {
    if (existing) {
      await run(
        `UPDATE teacher_score_snapshots SET branch_id = ?, attendance_score = ?, planning_score = ?,
         syllabus_score = ?, homework_score = ?, student_improvement_score = ?, doubt_support_score = ?,
         feedback_score = ?, complaint_penalty = ?, final_score = ?, grade = ?, confidence_score = ?,
         data_status = ?, calculated_by_user_id = ?, calculated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [branchId || context.assignments[0]?.branch_id || null, metrics[0].score, metrics[1].score, metrics[2].score,
          metrics[3].score, metrics[4].score, metrics[5].score, metrics[6].score, complaint.penalty,
          finalScore, gradeFor(finalScore), confidenceScore, confidenceScore >= 80 ? 'COMPLETE' : 'PARTIAL', userId, now, id]
      );
      await run(`DELETE FROM teacher_score_components WHERE teacher_score_snapshot_id = ?`, [id]);
    } else {
      await run(
        `INSERT INTO teacher_score_snapshots
          (id, tenant_id, branch_id, teacher_id, period_start, period_end, period_type,
           attendance_score, planning_score, syllabus_score, homework_score, student_improvement_score,
           doubt_support_score, feedback_score, complaint_penalty, final_score, grade, confidence_score,
           data_status, calculated_by_user_id, calculated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, String(tenantId), branchId || context.assignments[0]?.branch_id || null, String(teacherId),
          periodStart, periodEnd, periodType, metrics[0].score, metrics[1].score, metrics[2].score,
          metrics[3].score, metrics[4].score, metrics[5].score, metrics[6].score, complaint.penalty,
          finalScore, gradeFor(finalScore), confidenceScore, confidenceScore >= 80 ? 'COMPLETE' : 'PARTIAL', userId, now]
      );
    }
    for (const item of components) {
      await run(
        `INSERT INTO teacher_score_components
          (id, tenant_id, teacher_score_snapshot_id, teacher_id, metric_key, category,
           raw_value, raw_display, target_value, score, weight, weighted_score,
           source_entity_type, source_entity_ids, calculation_note, evidence_available,
           minimum_data_met, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), String(tenantId), id, String(teacherId), item.metricKey, item.category,
          item.rawValue, item.rawDisplay || null, item.targetValue, item.score, item.weight,
          item.weightedScore, item.sourceEntityType || null, JSON.stringify(item.sourceEntityIds || []),
          item.calculationNote || null, item.evidenceAvailable ? 1 : 0, item.minimumDataMet ? 1 : 0]
      );
    }
    await createAlerts({ tenantId, branchId: branchId || context.assignments[0]?.branch_id, teacherId, snapshotId: id, components, finalScore, confidenceScore, complaintPenalty: complaint.penalty });
    await createAuditLog({
      tenantId, branchId: branchId || context.assignments[0]?.branch_id || null, actorUserId: userId,
      action: existing ? 'TEACHER_SCORE_RECALCULATED' : 'TEACHER_SCORE_CALCULATED',
      entityType: 'teacher_score_snapshot', entityId: id,
      oldValues: existing ? { finalScore: existing.final_score, confidenceScore: existing.confidence_score } : {},
      newValues: { teacherId, periodStart, periodEnd, finalScore, grade: gradeFor(finalScore), confidenceScore },
    });
  });
  return getScorecard(tenantId, teacherId, id);
}
async function getScorecard(tenantId, teacherId, snapshotId = null) {
  const params = [String(tenantId), String(teacherId)];
  let condition = '';
  if (snapshotId) { condition = ' AND s.id = ?'; params.push(snapshotId); }
  const snapshot = await get(
    `SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject, b.name AS branch_name
     FROM teacher_score_snapshots s
     JOIN teachers t ON CAST(t.id AS TEXT) = s.teacher_id AND CAST(t.tenant_id AS TEXT) = s.tenant_id
     LEFT JOIN branches b ON CAST(b.id AS TEXT) = s.branch_id AND CAST(b.tenant_id AS TEXT) = s.tenant_id
     WHERE s.tenant_id = ? AND s.teacher_id = ?${condition}
     ORDER BY s.period_end DESC, s.calculated_at DESC LIMIT 1`,
    params
  );
  if (!snapshot) return null;
  const [components, alerts, plans, notes] = await Promise.all([
    all(`SELECT * FROM teacher_score_components WHERE teacher_score_snapshot_id = ? ORDER BY weight DESC, metric_key`, [snapshot.id]),
    all(`SELECT * FROM teacher_score_alerts WHERE teacher_score_snapshot_id = ? ORDER BY severity DESC, created_at DESC`, [snapshot.id]),
    all(`SELECT * FROM teacher_improvement_plans WHERE tenant_id = ? AND teacher_id = ? ORDER BY created_at DESC`, [String(tenantId), String(teacherId)]),
    all(`SELECT n.*, u.name AS reviewed_by_name FROM teacher_score_review_notes n LEFT JOIN users u ON CAST(u.id AS TEXT) = n.reviewed_by_user_id WHERE n.teacher_score_snapshot_id = ? ORDER BY n.created_at DESC`, [snapshot.id]),
  ]);
  return {
    ...snapshot,
    components: components.map((row) => ({ ...row, source_entity_ids: json(row.source_entity_ids) })),
    alerts, improvementPlans: plans, reviewNotes: notes,
  };
}

module.exports = {
  calculateTeacherScore,
  getConfig,
  getScorecard,
  gradeFor,
};
