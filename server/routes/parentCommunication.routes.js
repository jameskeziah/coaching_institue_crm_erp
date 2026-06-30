const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all, transaction } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');
const { createCommunicationEvent } = require('../services/communication-timeline.service');
const { sendTemplateMessage } = require('../services/whatsapp-template.service');

const router = express.Router();
const VIEW_ROLES = ROLE_GROUPS.STAFF;
const ACTION_ROLES = [ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.COUNSELLOR, ROLES.TEACHER];

function tenantId(req) { return String(req.user.tenantId || req.user.tenant_id); }
function json(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
function camel(row) {
  if (!row) return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = key === 'metadata' ? json(value) : value;
  }
  return result;
}
function positiveInt(value, fallback, max = 100) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
async function studentForTenant(req, studentId) {
  if (!studentId) return null;
  return get(
    `SELECT s.*, COALESCE(s.display_name, s.student_name, s.name) AS student_name,
       b.name AS branch_name, c.name AS course_name, bt.name AS batch_name
     FROM students s
     LEFT JOIN branches b ON CAST(b.id AS TEXT) = CAST(s.branch_id AS TEXT) AND CAST(b.tenant_id AS TEXT) = CAST(s.tenant_id AS TEXT)
     LEFT JOIN courses c ON CAST(c.id AS TEXT) = CAST(s.primary_course_id AS TEXT) AND CAST(c.tenant_id AS TEXT) = CAST(s.tenant_id AS TEXT)
     LEFT JOIN batches bt ON CAST(bt.id AS TEXT) = CAST(s.primary_batch_id AS TEXT) AND CAST(bt.tenant_id AS TEXT) = CAST(s.tenant_id AS TEXT)
     WHERE CAST(s.tenant_id AS TEXT) = ? AND CAST(s.id AS TEXT) = ? AND s.deleted_at IS NULL`,
    [tenantId(req), String(studentId)]
  );
}
async function guardianForStudent(req, studentId, guardianId = null) {
  const params = [tenantId(req), String(studentId)];
  let condition = '';
  if (guardianId) { condition = ' AND g.id = ?'; params.push(String(guardianId)); }
  return get(
    `SELECT g.* FROM student_guardians g
     WHERE CAST(g.tenant_id AS TEXT) = ? AND CAST(g.student_id AS TEXT) = ?${condition}
     ORDER BY g.is_primary DESC, g.created_at LIMIT 1`,
    params
  );
}
async function audit(req, action, entityType, entityId, oldValues, newValues, branchId = null) {
  return createAuditLog({
    tenantId: tenantId(req), branchId, actorUserId: req.user.id, action,
    entityType, entityId, oldValues, newValues,
  });
}

router.get('/parent-communication', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const conditions = ['CAST(e.tenant_id AS TEXT) = ?', 'e.archived_at IS NULL'];
  const params = [tenantId(req)];
  const exact = {
    branchId: 'e.branch_id', studentId: 'e.student_id', guardianId: 'e.guardian_id',
    channel: 'e.channel', eventType: 'e.event_type', status: 'e.status',
    assignedToUserId: 'e.assigned_to_user_id', direction: 'e.direction',
  };
  for (const [key, column] of Object.entries(exact)) {
    if (req.query[key]) { conditions.push(`CAST(${column} AS TEXT) = ?`); params.push(String(req.query[key])); }
  }
  if (req.query.reviewed === 'true') conditions.push('e.reviewed_at IS NOT NULL');
  if (req.query.reviewed === 'false') conditions.push('e.reviewed_at IS NULL');
  if (req.query.dateFrom) { conditions.push('COALESCE(e.logged_at, e.sent_at, e.created_at) >= ?'); params.push(req.query.dateFrom); }
  if (req.query.dateTo) { conditions.push('COALESCE(e.logged_at, e.sent_at, e.created_at) <= ?'); params.push(`${req.query.dateTo}T23:59:59.999Z`); }
  if (req.query.search) {
    conditions.push(`(LOWER(COALESCE(s.display_name, s.student_name, s.name, '')) LIKE ?
      OR LOWER(COALESCE(g.name, '')) LIKE ? OR LOWER(COALESCE(g.phone, s.parent_phone, '')) LIKE ?
      OR LOWER(COALESCE(e.subject, '')) LIKE ? OR LOWER(COALESCE(e.message, '')) LIKE ?)`);
    const search = `%${String(req.query.search).toLowerCase()}%`;
    params.push(search, search, search, search, search);
  }
  const where = conditions.join(' AND ');
  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, 25, 100);
  const offset = (page - 1) * pageSize;
  const today = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date(Date.now() - 30 * 86400000).toISOString();

  const [countRow, rows, statusRows, pendingFollowups, noRecentContact] = await Promise.all([
    get(
      `SELECT COUNT(*) AS total FROM communication_events e
       LEFT JOIN students s ON CAST(s.id AS TEXT) = CAST(e.student_id AS TEXT) AND CAST(s.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN student_guardians g ON g.id = e.guardian_id AND CAST(g.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       WHERE ${where}`, params
    ),
    all(
      `SELECT e.*, COALESCE(s.display_name, s.student_name, s.name) AS student_name,
         s.student_code, s.parent_phone, g.name AS guardian_name, COALESCE(g.phone, s.parent_phone) AS guardian_phone,
         b.name AS branch_name, c.name AS course_name, bt.name AS batch_name,
         sender.name AS sent_by_name, assignee.name AS assigned_to_name
       FROM communication_events e
       LEFT JOIN students s ON CAST(s.id AS TEXT) = CAST(e.student_id AS TEXT) AND CAST(s.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN student_guardians g ON g.id = e.guardian_id AND CAST(g.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN branches b ON CAST(b.id AS TEXT) = CAST(COALESCE(e.branch_id, s.branch_id) AS TEXT) AND CAST(b.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN courses c ON CAST(c.id AS TEXT) = CAST(s.primary_course_id AS TEXT) AND CAST(c.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN batches bt ON CAST(bt.id AS TEXT) = CAST(s.primary_batch_id AS TEXT) AND CAST(bt.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN users sender ON CAST(sender.id AS TEXT) = CAST(e.sent_by_user_id AS TEXT) AND CAST(sender.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       LEFT JOIN users assignee ON CAST(assignee.id AS TEXT) = CAST(e.assigned_to_user_id AS TEXT) AND CAST(assignee.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
       WHERE ${where}
       ORDER BY COALESCE(e.logged_at, e.sent_at, e.created_at) DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ),
    all(
      `SELECT status, COUNT(*) AS count FROM communication_events
       WHERE CAST(tenant_id AS TEXT) = ? AND archived_at IS NULL
         AND COALESCE(logged_at, sent_at, created_at) >= ?
       GROUP BY status`,
      [tenantId(req), today]
    ),
    get(
      `SELECT COUNT(*) AS count FROM follow_up_tasks
       WHERE CAST(tenant_id AS TEXT) = ? AND LOWER(COALESCE(status, 'open')) NOT IN ('completed', 'closed', 'cancelled')`,
      [tenantId(req)]
    ),
    get(
      `SELECT COUNT(*) AS count FROM students s WHERE CAST(s.tenant_id AS TEXT) = ? AND s.deleted_at IS NULL
       AND UPPER(COALESCE(s.status, 'ACTIVE')) = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM communication_events e WHERE CAST(e.tenant_id AS TEXT) = CAST(s.tenant_id AS TEXT)
           AND CAST(e.student_id AS TEXT) = CAST(s.id AS TEXT)
           AND COALESCE(e.logged_at, e.sent_at, e.created_at) >= ?
       )`,
      [tenantId(req), staleCutoff]
    ),
  ]);
  const statusSummary = Object.fromEntries(statusRows.map((row) => [String(row.status || 'LOGGED').toLowerCase(), Number(row.count || 0)]));
  res.json({
    data: rows.map(camel),
    pagination: { page, pageSize, total: Number(countRow?.total || 0), pages: Math.ceil(Number(countRow?.total || 0) / pageSize) },
    summary: {
      todayTotal: Object.values(statusSummary).reduce((sum, count) => sum + count, 0),
      sent: statusSummary.sent || 0, delivered: statusSummary.delivered || 0,
      read: statusSummary.read || 0, failed: statusSummary.failed || 0,
      replied: statusSummary.replied || 0, pendingFollowups: Number(pendingFollowups?.count || 0),
      noRecentContact: Number(noRecentContact?.count || 0),
    },
  });
});

router.get('/parent-communication/:id', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const event = await get(
    `SELECT e.*, COALESCE(s.display_name, s.student_name, s.name) AS student_name,
       s.student_code, s.parent_phone, s.status AS student_status, g.name AS guardian_name,
       g.phone AS guardian_phone, g.email AS guardian_email, g.relationship,
       b.name AS branch_name, c.name AS course_name, bt.name AS batch_name,
       sender.name AS sent_by_name, assignee.name AS assigned_to_name
     FROM communication_events e
     LEFT JOIN students s ON CAST(s.id AS TEXT) = CAST(e.student_id AS TEXT) AND CAST(s.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN student_guardians g ON g.id = e.guardian_id AND CAST(g.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN branches b ON CAST(b.id AS TEXT) = CAST(COALESCE(e.branch_id, s.branch_id) AS TEXT) AND CAST(b.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN courses c ON CAST(c.id AS TEXT) = CAST(s.primary_course_id AS TEXT) AND CAST(c.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN batches bt ON CAST(bt.id AS TEXT) = CAST(s.primary_batch_id AS TEXT) AND CAST(bt.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN users sender ON CAST(sender.id AS TEXT) = CAST(e.sent_by_user_id AS TEXT) AND CAST(sender.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     LEFT JOIN users assignee ON CAST(assignee.id AS TEXT) = CAST(e.assigned_to_user_id AS TEXT) AND CAST(assignee.tenant_id AS TEXT) = CAST(e.tenant_id AS TEXT)
     WHERE e.id = ? AND CAST(e.tenant_id AS TEXT) = ? AND e.archived_at IS NULL`,
    [req.params.id, tenantId(req)]
  );
  if (!event) return res.status(404).json({ error: 'Communication not found' });
  const metadata = json(event.metadata);
  const [message, notes, calls, followups, replies, audits] = await Promise.all([
    metadata.templateMessageId
      ? get(`SELECT * FROM whatsapp_template_messages WHERE id = ? AND CAST(tenant_id AS TEXT) = ?`, [metadata.templateMessageId, tenantId(req)])
      : event.provider_message_id
        ? get(`SELECT * FROM whatsapp_template_messages WHERE provider_message_id = ? AND CAST(tenant_id AS TEXT) = ?`, [event.provider_message_id, tenantId(req)])
        : null,
    all(`SELECT n.*, u.name AS created_by_name FROM parent_manual_notes n LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(n.created_by_user_id AS TEXT) WHERE CAST(n.tenant_id AS TEXT) = ? AND (n.communication_event_id = ? OR (n.student_id = ? AND n.student_id IS NOT NULL)) ORDER BY n.created_at DESC LIMIT 50`, [tenantId(req), event.id, event.student_id]),
    all(`SELECT * FROM parent_call_logs WHERE CAST(tenant_id AS TEXT) = ? AND CAST(student_id AS TEXT) = CAST(? AS TEXT) AND deletedAt IS NULL ORDER BY COALESCE(call_started_at, calledAt, createdAt) DESC LIMIT 50`, [tenantId(req), event.student_id]),
    all(`SELECT * FROM follow_up_tasks WHERE CAST(tenant_id AS TEXT) = ? AND (source_entity_id = ? OR (CAST(student_id AS TEXT) = CAST(? AS TEXT) AND student_id IS NOT NULL)) ORDER BY dueDate DESC, id DESC LIMIT 50`, [tenantId(req), event.id, event.student_id]),
    all(`SELECT * FROM communication_events WHERE CAST(tenant_id AS TEXT) = ? AND direction = 'INBOUND' AND (provider_message_id = ? OR (CAST(student_id AS TEXT) = CAST(? AS TEXT) AND student_id IS NOT NULL)) ORDER BY COALESCE(logged_at, created_at) DESC LIMIT 50`, [tenantId(req), event.provider_message_id, event.student_id]),
    all(`SELECT * FROM audit_logs WHERE CAST(tenant_id AS TEXT) = ? AND ((entity_type = 'communication_event' AND entity_id = ?) OR metadata LIKE ?) ORDER BY created_at DESC LIMIT 50`, [tenantId(req), event.id, `%${event.id}%`]),
  ]);
  const lifecycle = [
    ['CREATED', event.created_at], ['SENT', event.sent_at], ['DELIVERED', event.delivered_at],
    ['READ', event.read_at], ['FAILED', event.failed_at], ['REPLIED', event.replied_at], ['REVIEWED', event.reviewed_at],
  ].filter(([, at]) => at).map(([status, at]) => ({ status, at }));
  res.json({ data: {
    event: { ...camel(event), metadata },
    whatsappMessage: camel(message), lifecycle,
    notes: notes.map(camel), calls: calls.map(camel), followups: followups.map(camel),
    replies: replies.map(camel), audits: audits.map(camel),
  } });
});

router.post('/parent-communication/send-whatsapp', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  try {
    const student = await studentForTenant(req, req.body.studentId);
    if (req.body.studentId && !student) return res.status(404).json({ error: 'Student not found' });
    const result = await sendTemplateMessage({
      tenantId: tenantId(req),
      branchId: req.body.branchId || student?.branch_id || null,
      userId: req.user.id,
      request: req.body,
    });
    res.status(201).json({ data: result });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/parent-communication/log-call', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  try {
    const student = await studentForTenant(req, req.body.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const guardian = await guardianForStudent(req, student.id, req.body.guardianId);
    const startedAt = req.body.callStartedAt || new Date().toISOString();
    const result = await transaction(async () => {
      const inserted = await run(
        `INSERT INTO parent_call_logs
          (student_id, attendance_record_id, parentPhone, callOutcome, calledBy, calledAt,
           followUpDate, notes, createdAt, tenant_id, branch_id, guardian_id, phone_number,
           call_direction, call_status, purpose, summary, outcome, next_action, next_followup_at,
           called_by_user_id, call_started_at, call_ended_at, duration_seconds, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [student.id, req.body.phoneNumber || guardian?.phone || student.parent_phone || null,
          req.body.outcome || null, req.user.id, startedAt, req.body.nextFollowupAt || null,
          req.body.summary || null, tenantId(req), student.branch_id || null, guardian?.id || null,
          req.body.phoneNumber || guardian?.phone || student.parent_phone || null,
          req.body.callDirection || 'OUTBOUND', req.body.callStatus || 'COMPLETED',
          req.body.purpose || null, req.body.summary || null, req.body.outcome || null,
          req.body.nextAction || null, req.body.nextFollowupAt || null, req.user.id,
          startedAt, req.body.callEndedAt || null, req.body.durationSeconds || null]
      );
      const event = await createCommunicationEvent({
        tenantId: tenantId(req), branchId: student.branch_id, studentId: student.id,
        guardianId: guardian?.id || null, channel: 'CALL', direction: req.body.callDirection || 'OUTBOUND',
        eventType: 'PARENT_CALL', subject: req.body.purpose || 'Parent call',
        message: req.body.summary || req.body.outcome || 'Call logged', status: req.body.callStatus || 'COMPLETED',
        provider: 'MANUAL', sentByUserId: req.user.id, loggedAt: startedAt,
        relatedEntityType: 'PARENT_CALL_LOG', relatedEntityId: inserted.lastID,
        metadata: { outcome: req.body.outcome, nextAction: req.body.nextAction, nextFollowupAt: req.body.nextFollowupAt },
      });
      await audit(req, 'PARENT_CALL_LOGGED', 'communication_event', event.id, {}, { studentId: student.id, callLogId: inserted.lastID }, student.branch_id);
      return { event, callLogId: inserted.lastID };
    });
    res.status(201).json({ data: { event: camel(result.event), callLogId: result.callLogId } });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/parent-communication/manual-note', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  try {
    if (!String(req.body.note || '').trim()) return res.status(400).json({ error: 'note is required' });
    const student = await studentForTenant(req, req.body.studentId);
    if (req.body.studentId && !student) return res.status(404).json({ error: 'Student not found' });
    const guardian = student ? await guardianForStudent(req, student.id, req.body.guardianId) : null;
    const result = await transaction(async () => {
      const event = await createCommunicationEvent({
        tenantId: tenantId(req), branchId: req.body.branchId || student?.branch_id || null,
        studentId: student?.id || null, guardianId: guardian?.id || null, leadId: req.body.leadId || null,
        channel: 'NOTE', direction: 'INTERNAL', eventType: 'MANUAL_NOTE',
        subject: req.body.subject || req.body.noteType || 'Manual note', message: String(req.body.note).trim(),
        status: 'LOGGED', provider: 'MANUAL', sentByUserId: req.user.id,
        loggedAt: req.body.loggedAt || new Date().toISOString(),
      });
      const noteId = crypto.randomUUID();
      await run(
        `INSERT INTO parent_manual_notes
          (id, tenant_id, branch_id, student_id, guardian_id, lead_id, communication_event_id,
           note_type, subject, note, visibility, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [noteId, tenantId(req), req.body.branchId || student?.branch_id || null, student?.id || null,
          guardian?.id || null, req.body.leadId || null, event.id, req.body.noteType || 'GENERAL',
          req.body.subject || null, String(req.body.note).trim(), req.body.visibility || 'STAFF', req.user.id]
      );
      await audit(req, 'PARENT_MANUAL_NOTE_CREATED', 'communication_event', event.id, {}, { noteId, studentId: student?.id }, student?.branch_id);
      return { event, noteId };
    });
    res.status(201).json({ data: { event: camel(result.event), noteId: result.noteId } });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/parent-communication/:id/follow-up', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  const event = await get(`SELECT * FROM communication_events WHERE id = ? AND CAST(tenant_id AS TEXT) = ? AND archived_at IS NULL`, [req.params.id, tenantId(req)]);
  if (!event) return res.status(404).json({ error: 'Communication not found' });
  if (!req.body.dueDate) return res.status(400).json({ error: 'dueDate is required' });
  const student = event.student_id ? await studentForTenant(req, event.student_id) : null;
  const inserted = await run(
    `INSERT INTO follow_up_tasks
      (student_id, studentName, taskType, dueDate, priority, assignedTo, status, notes,
       linkedType, linkedId, createdBy, createdAt, updatedAt, tenant_id, source,
       source_entity_type, source_entity_id, risk_reason)
     VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, 'COMMUNICATION', NULL, ?, CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP, ?, 'PARENT_COMMUNICATION', 'communication_event', ?, ?)`,
    [event.student_id, student?.student_name || null, req.body.taskType || 'Parent communication follow-up',
      req.body.dueDate, req.body.priority || 'Medium', req.body.assignedToUserId || req.body.assignedTo || null,
      req.body.notes || null, req.user.id, tenantId(req), event.id, req.body.reason || event.event_type]
  );
  await createCommunicationEvent({
    tenantId: tenantId(req), branchId: event.branch_id, studentId: event.student_id,
    guardianId: event.guardian_id, channel: 'TASK', direction: 'INTERNAL',
    eventType: 'FOLLOWUP_CREATED', subject: req.body.taskType || 'Parent communication follow-up',
    message: req.body.notes || `Due ${req.body.dueDate}`, status: 'OPEN', provider: 'INTERNAL',
    sentByUserId: req.user.id, assignedToUserId: req.body.assignedToUserId || null,
    loggedAt: new Date().toISOString(), relatedEntityType: 'FOLLOW_UP_TASK', relatedEntityId: inserted.lastID,
    metadata: { sourceCommunicationEventId: event.id, dueDate: req.body.dueDate },
  });
  await audit(req, 'PARENT_COMMUNICATION_FOLLOWUP_CREATED', 'communication_event', event.id, {}, { followUpId: inserted.lastID, dueDate: req.body.dueDate }, event.branch_id);
  res.status(201).json({ data: { id: inserted.lastID } });
});

router.patch('/parent-communication/:id/assign', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  const event = await get(`SELECT * FROM communication_events WHERE id = ? AND CAST(tenant_id AS TEXT) = ? AND archived_at IS NULL`, [req.params.id, tenantId(req)]);
  if (!event) return res.status(404).json({ error: 'Communication not found' });
  if (req.body.assignedToUserId) {
    const user = await get(`SELECT id FROM users WHERE CAST(id AS TEXT) = ? AND CAST(tenant_id AS TEXT) = ? AND deleted_at IS NULL`, [String(req.body.assignedToUserId), tenantId(req)]);
    if (!user) return res.status(400).json({ error: 'Assignee not found in tenant' });
  }
  await run(`UPDATE communication_events SET assigned_to_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.body.assignedToUserId || null, event.id]);
  await audit(req, 'PARENT_COMMUNICATION_ASSIGNED', 'communication_event', event.id, { assignedToUserId: event.assigned_to_user_id }, { assignedToUserId: req.body.assignedToUserId || null }, event.branch_id);
  res.json({ data: camel(await get(`SELECT * FROM communication_events WHERE id = ?`, [event.id])) });
});

router.patch('/parent-communication/:id/mark-reviewed', authMiddleware, requireTenant, requireAnyRole(ACTION_ROLES), async (req, res) => {
  const event = await get(`SELECT * FROM communication_events WHERE id = ? AND CAST(tenant_id AS TEXT) = ? AND archived_at IS NULL`, [req.params.id, tenantId(req)]);
  if (!event) return res.status(404).json({ error: 'Communication not found' });
  const reviewed = req.body.reviewed !== false;
  await run(
    `UPDATE communication_events SET reviewed_at = ?, reviewed_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [reviewed ? new Date().toISOString() : null, reviewed ? req.user.id : null, event.id]
  );
  await audit(req, reviewed ? 'PARENT_COMMUNICATION_REVIEWED' : 'PARENT_COMMUNICATION_REOPENED', 'communication_event', event.id, { reviewedAt: event.reviewed_at }, { reviewed }, event.branch_id);
  res.json({ data: camel(await get(`SELECT * FROM communication_events WHERE id = ?`, [event.id])) });
});

module.exports = router;
