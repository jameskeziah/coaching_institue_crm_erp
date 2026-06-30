const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all, transaction } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');

const router = express.Router();
const VIEW_ROLES = ROLE_GROUPS.STAFF;
const MANAGE_ROLES = ROLE_GROUPS.MANAGEMENT;
const STUDENT_MANAGE_ROLES = [...ROLE_GROUPS.MANAGEMENT, ROLES.COUNSELLOR];
const COURSE_TYPES = new Set(['FOUNDATION', 'JEE', 'NEET', 'BOARD', 'AI_DS', 'OLYMPIAD', 'SCHOLARSHIP', 'OTHER']);
const BATCH_STATUSES = new Set(['PLANNED', 'ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED']);
const STUDENT_STATUSES = new Set(['ACTIVE', 'TRANSFERRED', 'LEFT', 'COMPLETED', 'REMOVED']);
const TEACHER_ROLES = new Set(['PRIMARY', 'ASSISTANT', 'DOUBT_SOLVER', 'TEST_INCHARGE', 'MENTOR']);
const TEACHER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'REMOVED']);
const DAYS_OF_WEEK = new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);

function tenantId(req) {
  return req.user.tenantId || req.user.tenant_id;
}

function boolInt(value, fallback = true) {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function code(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function serialize(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key.startsWith('is_')) return [camel, Number(value) === 1];
    return [camel, value];
  }));
}

function validateTimings(timings = []) {
  if (!Array.isArray(timings)) throw new Error('timings must be an array');
  return timings.map((timing) => {
    const dayOfWeek = String(timing.dayOfWeek || '').toUpperCase();
    const startTime = String(timing.startTime || '');
    const endTime = String(timing.endTime || '');
    if (!DAYS_OF_WEEK.has(dayOfWeek)) throw new Error('Invalid timing day');
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
      throw new Error('Timing startTime must be before endTime');
    }
    return { dayOfWeek, startTime, endTime, roomName: timing.roomName || null };
  });
}

async function replaceBatchTimings(req, batch, timings, auditAction = 'BATCH_TIMING_UPDATED') {
  const cleanTimings = validateTimings(timings);
  const oldRows = await all(
    `SELECT * FROM batch_timings WHERE tenant_id = ? AND batch_id = ? AND is_active = 1 ORDER BY day_of_week, start_time`,
    [tenantId(req), batch.id]
  );
  await run(
    `UPDATE batch_timings SET is_active = 0, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND batch_id = ? AND is_active = 1`,
    [tenantId(req), batch.id]
  );
  for (const timing of cleanTimings) {
    await run(
      `INSERT INTO batch_timings
        (id, tenant_id, batch_id, day_of_week, start_time, end_time, room_name,
         is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), tenantId(req), batch.id, timing.dayOfWeek, timing.startTime, timing.endTime, timing.roomName]
    );
  }
  const newRows = await all(
    `SELECT * FROM batch_timings WHERE tenant_id = ? AND batch_id = ? AND is_active = 1 ORDER BY day_of_week, start_time`,
    [tenantId(req), batch.id]
  );
  await audit(req, auditAction, 'batch_timing', batch.id, oldRows.map(serialize), newRows.map(serialize), batch.branch_id || batch.branchId);
  return newRows.map(serialize);
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
    metadata: {
      batchId: newValues?.batchId || oldValues?.batchId || (entityType === 'batch' || entityType === 'batch_timing' ? entityId : null),
    },
  });
}

async function uniqueCode(table, tenant, entityCode, excludeId = null) {
  const params = [tenant, entityCode];
  let sql = `SELECT id FROM ${table} WHERE tenant_id = ? AND code = ?`;
  if (table === 'branches') sql += ' AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  return get(sql, params);
}

router.get('/branches', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const rows = await all(
    `SELECT * FROM branches WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name`,
    [tenantId(req)]
  );
  res.json({ data: rows.map(serialize) });
});

router.post('/branches', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const branchCode = code(req.body.code);
    if (!name) throw new Error('Branch name is required');
    if (!branchCode) throw new Error('Branch code is required');
    if (await uniqueCode('branches', tenantId(req), branchCode)) throw new Error('Branch code already exists');
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO branches
        (id, tenant_id, name, code, city, address, phone, email, is_default, is_active,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, tenantId(req), name, branchCode, req.body.city || null, req.body.address || null,
        req.body.phone || null, req.body.email || null, boolInt(req.body.isActive), req.user.id]
    );
    const created = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ?`, [id, tenantId(req)]);
    await audit(req, 'BRANCH_CREATED', 'branch', id, {}, serialize(created), id);
    res.status(201).json({ data: serialize(created) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/branches/:id', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const row = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, tenantId(req)]);
  if (!row) return res.status(404).json({ error: 'Branch not found' });
  return res.json({ data: serialize(row) });
});

router.patch('/branches/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const old = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, tenantId(req)]);
    if (!old) return res.status(404).json({ error: 'Branch not found' });
    const branchCode = req.body.code === undefined ? old.code : code(req.body.code);
    if (await uniqueCode('branches', tenantId(req), branchCode, old.id)) throw new Error('Branch code already exists');
    await run(
      `UPDATE branches SET name = ?, code = ?, city = ?, address = ?, phone = ?, email = ?,
       is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
      [req.body.name ?? old.name, branchCode, req.body.city ?? old.city, req.body.address ?? old.address,
        req.body.phone ?? old.phone, req.body.email ?? old.email, boolInt(req.body.isActive, Number(old.is_active) === 1),
        old.id, tenantId(req)]
    );
    const updated = await get(`SELECT * FROM branches WHERE id = ?`, [old.id]);
    await audit(req, 'BRANCH_UPDATED', 'branch', old.id, serialize(old), serialize(updated), old.id);
    res.json({ data: serialize(updated) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/branches/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const branch = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, tenantId(req)]);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  const usage = await get(`SELECT COUNT(*) AS count FROM batches WHERE branch_id = ? AND tenant_id = ?`, [branch.id, tenantId(req)]);
  if (Number(usage?.count || 0) > 0) return res.status(409).json({ error: 'Branch with batches cannot be deleted; deactivate it instead' });
  await run(`UPDATE branches SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ? AND tenant_id = ?`, [branch.id, tenantId(req)]);
  await audit(req, 'BRANCH_UPDATED', 'branch', branch.id, serialize(branch), { ...serialize(branch), isActive: false, deleted: true }, branch.id);
  return res.json({ ok: true });
});

function registerSimpleMaster({ path, table, entity, createdAction, updatedAction, validate }) {
  router.get(`/${path}`, authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
    const rows = await all(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY name`, [tenantId(req)]);
    res.json({ data: rows.map(serialize) });
  });
  router.get(`/${path}/:id`, authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
    const row = await get(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
    if (!row) return res.status(404).json({ error: `${entity} not found` });
    return res.json({ data: serialize(row) });
  });
  router.post(`/${path}`, authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
    try {
      const payload = validate(req.body);
      if (await uniqueCode(table, tenantId(req), payload.code)) throw new Error(`${entity} code already exists`);
      const id = crypto.randomUUID();
      if (table === 'courses') {
        await run(
          `INSERT INTO courses
            (id, tenant_id, name, code, course_type, class_level, duration_months, description,
             default_fee, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, tenantId(req), payload.name, payload.code, payload.courseType, payload.classLevel,
            payload.durationMonths, payload.description, payload.defaultFee, payload.isActive]
        );
      } else {
        await run(
          `INSERT INTO subjects
            (id, tenant_id, name, code, description, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, tenantId(req), payload.name, payload.code, payload.description, payload.isActive]
        );
      }
      const created = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      await audit(req, createdAction, entity.toLowerCase(), id, {}, serialize(created));
      res.status(201).json({ data: serialize(created) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  router.patch(`/${path}/:id`, authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
    try {
      const old = await get(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
      if (!old) return res.status(404).json({ error: `${entity} not found` });
      const payload = validate({ ...serialize(old), ...req.body });
      if (await uniqueCode(table, tenantId(req), payload.code, old.id)) throw new Error(`${entity} code already exists`);
      if (table === 'courses') {
        await run(
          `UPDATE courses SET name = ?, code = ?, course_type = ?, class_level = ?, duration_months = ?,
           description = ?, default_fee = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [payload.name, payload.code, payload.courseType, payload.classLevel, payload.durationMonths,
            payload.description, payload.defaultFee, payload.isActive, old.id, tenantId(req)]
        );
      } else {
        await run(
          `UPDATE subjects SET name = ?, code = ?, description = ?, is_active = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
          [payload.name, payload.code, payload.description, payload.isActive, old.id, tenantId(req)]
        );
      }
      const updated = await get(`SELECT * FROM ${table} WHERE id = ?`, [old.id]);
      await audit(req, updatedAction, entity.toLowerCase(), old.id, serialize(old), serialize(updated));
      res.json({ data: serialize(updated) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  router.delete(`/${path}/:id`, authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
    const row = await get(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId(req)]);
    if (!row) return res.status(404).json({ error: `${entity} not found` });
    const referenceTable = table === 'courses' ? 'batches' : 'batch_teachers';
    const referenceColumn = table === 'courses' ? 'course_id' : 'subject_id';
    const usage = await get(`SELECT COUNT(*) AS count FROM ${referenceTable} WHERE ${referenceColumn} = ? AND tenant_id = ?`, [row.id, tenantId(req)]);
    if (Number(usage?.count || 0) > 0) return res.status(409).json({ error: `${entity} is in use; deactivate it instead` });
    await run(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`, [row.id, tenantId(req)]);
    res.json({ ok: true });
  });
}

registerSimpleMaster({
  path: 'courses',
  table: 'courses',
  entity: 'Course',
  createdAction: 'COURSE_CREATED',
  updatedAction: 'COURSE_UPDATED',
  validate(body) {
    const name = String(body.name || '').trim();
    const courseCode = code(body.code);
    const courseType = String(body.courseType || 'OTHER').toUpperCase();
    const defaultFee = Number(body.defaultFee || 0);
    const durationMonths = Number(body.durationMonths || 0);
    if (!name) throw new Error('Course name is required');
    if (!courseCode) throw new Error('Course code is required');
    if (!COURSE_TYPES.has(courseType)) throw new Error('Invalid course type');
    if (defaultFee < 0) throw new Error('Default fee cannot be negative');
    if (durationMonths <= 0) throw new Error('Duration months must be greater than 0');
    return {
      name, code: courseCode, courseType, classLevel: body.classLevel || null, durationMonths,
      description: body.description || null, defaultFee, isActive: boolInt(body.isActive),
    };
  },
});

registerSimpleMaster({
  path: 'subjects',
  table: 'subjects',
  entity: 'Subject',
  createdAction: 'SUBJECT_CREATED',
  updatedAction: 'SUBJECT_UPDATED',
  validate(body) {
    const name = String(body.name || '').trim();
    const subjectCode = code(body.code);
    if (!name) throw new Error('Subject name is required');
    if (!subjectCode) throw new Error('Subject code is required');
    return { name, code: subjectCode, description: body.description || null, isActive: boolInt(body.isActive) };
  },
});

async function batchDetail(batchId, tenant) {
  return get(
    `SELECT b.*, br.name AS "branchName", c.name AS "courseName", c.class_level AS "classLevel",
       (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.id AND bs.tenant_id = b.tenant_id AND bs.status = 'ACTIVE') AS "studentCount",
       (SELECT COUNT(*) FROM batch_teachers bt WHERE bt.batch_id = b.id AND bt.tenant_id = b.tenant_id AND bt.status = 'ACTIVE') AS "teacherCount"
     FROM batches b
     JOIN branches br ON br.id = b.branch_id AND br.tenant_id = b.tenant_id
     JOIN courses c ON c.id = b.course_id AND c.tenant_id = b.tenant_id
     WHERE b.id = ? AND b.tenant_id = ? AND b.deleted_at IS NULL`,
    [batchId, tenant]
  );
}

router.get('/batches', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const conditions = ['b.tenant_id = ?', 'b.deleted_at IS NULL'];
  const params = [tenantId(req)];
  for (const [queryKey, column] of [['branchId', 'b.branch_id'], ['courseId', 'b.course_id'], ['academicYear', 'b.academic_year'], ['status', 'b.status']]) {
    if (req.query[queryKey]) {
      conditions.push(`${column} = ?`);
      params.push(queryKey === 'status' ? String(req.query[queryKey]).toUpperCase() : req.query[queryKey]);
    }
  }
  if (req.query.search) {
    conditions.push('(LOWER(b.name) LIKE ? OR LOWER(b.code) LIKE ?)');
    const term = `%${String(req.query.search).toLowerCase()}%`;
    params.push(term, term);
  }
  if (req.user.role === ROLES.TEACHER) {
    conditions.push(`EXISTS (
      SELECT 1 FROM batch_teachers bt
      WHERE bt.batch_id = b.id AND bt.tenant_id = b.tenant_id
        AND CAST(bt.teacher_id AS TEXT) = CAST(? AS TEXT) AND bt.status = 'ACTIVE'
    )`);
    params.push(req.user.id);
  }
  const rows = await all(
    `SELECT b.*, br.name AS "branchName", c.name AS "courseName", c.class_level AS "classLevel",
       (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.id AND bs.tenant_id = b.tenant_id AND bs.status = 'ACTIVE') AS "studentCount",
       (SELECT COUNT(*) FROM batch_teachers bt WHERE bt.batch_id = b.id AND bt.tenant_id = b.tenant_id AND bt.status = 'ACTIVE') AS "teacherCount",
       (SELECT COUNT(*) FROM batch_timings tm WHERE tm.batch_id = b.id AND tm.tenant_id = b.tenant_id AND tm.is_active = 1) AS "timingCount"
     FROM batches b
     JOIN branches br ON br.id = b.branch_id AND br.tenant_id = b.tenant_id
     JOIN courses c ON c.id = b.course_id AND c.tenant_id = b.tenant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.academic_year DESC, b.name`,
    params
  );
  res.json({ data: rows.map(serialize) });
});

router.post('/batches', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const batchCode = code(req.body.code);
    const capacity = Number(req.body.capacity || 0);
    const status = String(req.body.status || 'PLANNED').toUpperCase();
    if (!name || !batchCode) throw new Error('Batch name and code are required');
    if (!req.body.branchId || !req.body.courseId) throw new Error('branchId and courseId are required');
    if (capacity <= 0) throw new Error('Capacity must be greater than 0');
    if (!req.body.startDate || !req.body.endDate || req.body.startDate >= req.body.endDate) throw new Error('Start date must be before end date');
    if (!BATCH_STATUSES.has(status)) throw new Error('Invalid batch status');
    if (await uniqueCode('batches', tenantId(req), batchCode)) throw new Error('Batch code already exists');
    const branch = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.body.branchId, tenantId(req)]);
    const course = await get(`SELECT * FROM courses WHERE id = ? AND tenant_id = ?`, [req.body.courseId, tenantId(req)]);
    if (!branch || Number(branch.is_active ?? branch.isActive) !== 1) throw new Error('Active branch is required');
    if (!course || Number(course.is_active ?? course.isActive) !== 1) throw new Error('Active course is required');
    const id = crypto.randomUUID();
    await transaction(async () => {
      await run(
        `INSERT INTO batches
          (id, tenant_id, branch_id, course_id, name, code, academic_year, start_date,
           end_date, capacity, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, tenantId(req), branch.id, course.id, name, batchCode, req.body.academicYear,
          req.body.startDate, req.body.endDate, capacity, status]
      );
      const batch = await get(`SELECT * FROM batches WHERE id = ? AND tenant_id = ?`, [id, tenantId(req)]);
      if (req.body.timings !== undefined) {
        await replaceBatchTimings(req, batch, req.body.timings, 'BATCH_TIMING_CREATED');
      }
    });
    const created = await batchDetail(id, tenantId(req));
    await audit(req, 'BATCH_CREATED', 'batch', id, {}, serialize(created), branch.id);
    res.status(201).json({ data: serialize(created) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/batches/:id', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const batch = await batchDetail(req.params.id, tenantId(req));
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const [students, teachers, timings] = await Promise.all([
    all(
      `SELECT bs.*, COALESCE(s.student_name, s.name) AS "studentName",
        COALESCE(s.class_level, s.grade) AS "classLevel",
        s.parent_phone AS "parentPhone"
       FROM batch_students bs JOIN students s ON CAST(s.id AS TEXT) = CAST(bs.student_id AS TEXT)
       WHERE bs.batch_id = ? AND bs.tenant_id = ? ORDER BY s.name`,
      [batch.id, tenantId(req)]
    ),
    all(
      `SELECT bt.*, t.name AS "teacherName", sub.name AS "subjectName"
       FROM batch_teachers bt
       JOIN teachers t ON CAST(t.id AS TEXT) = CAST(bt.teacher_id AS TEXT)
       JOIN subjects sub ON sub.id = bt.subject_id
       WHERE bt.batch_id = ? AND bt.tenant_id = ? ORDER BY t.name, sub.name`,
      [batch.id, tenantId(req)]
    ),
    all(
      `SELECT * FROM batch_timings
       WHERE batch_id = ? AND tenant_id = ? AND is_active = 1
       ORDER BY CASE day_of_week
         WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3
         WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 ELSE 7 END,
         start_time`,
      [batch.id, tenantId(req)]
    ),
  ]);
  res.json({
    data: {
      ...serialize(batch),
      availableSeats: Math.max(Number(batch.capacity) - Number(batch.studentCount || 0), 0),
      students: students.map(serialize),
      teachers: teachers.map(serialize),
      timings: timings.map(serialize),
    },
  });
});

router.patch('/batches/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const old = await batchDetail(req.params.id, tenantId(req));
    if (!old) return res.status(404).json({ error: 'Batch not found' });
    const next = { ...serialize(old), ...req.body };
    const batchCode = code(next.code);
    if (!String(next.name || '').trim()) throw new Error('Batch name is required');
    if (!batchCode) throw new Error('Batch code is required');
    if (!String(next.academicYear || '').trim()) throw new Error('Academic year is required');
    if (await uniqueCode('batches', tenantId(req), batchCode, old.id)) throw new Error('Batch code already exists');
    if (Number(next.capacity) <= 0) throw new Error('Capacity must be greater than 0');
    if (Number(next.capacity) < Number(old.studentCount || 0) && !req.body.capacityOverride) {
      throw new Error('Capacity cannot be reduced below current active student count without override');
    }
    if (next.startDate >= next.endDate) throw new Error('Start date must be before end date');
    if (!BATCH_STATUSES.has(String(next.status).toUpperCase())) throw new Error('Invalid batch status');
    const branch = await get(`SELECT * FROM branches WHERE id = ? AND tenant_id = ?`, [next.branchId, tenantId(req)]);
    const course = await get(`SELECT * FROM courses WHERE id = ? AND tenant_id = ?`, [next.courseId, tenantId(req)]);
    if (!branch || Number(branch.is_active ?? branch.isActive) !== 1) throw new Error('Active branch is required');
    if (!course || Number(course.is_active ?? course.isActive) !== 1) throw new Error('Active course is required');
    await run(
      `UPDATE batches SET branch_id = ?, course_id = ?, name = ?, code = ?, academic_year = ?,
       start_date = ?, end_date = ?, capacity = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [next.branchId, next.courseId, next.name, batchCode, next.academicYear, next.startDate,
        next.endDate, Number(next.capacity), String(next.status).toUpperCase(), old.id, tenantId(req)]
    );
    const updated = await batchDetail(old.id, tenantId(req));
    if (req.body.timings !== undefined) await replaceBatchTimings(req, updated, req.body.timings);
    await audit(req, 'BATCH_UPDATED', 'batch', old.id, serialize(old), serialize(updated), next.branchId);
    res.json({ data: serialize(updated) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/batches/:id', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const batch = await batchDetail(req.params.id, tenantId(req));
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  await run(
    `UPDATE batches SET status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [batch.id, tenantId(req)]
  );
  await audit(req, 'BATCH_ARCHIVED', 'batch', batch.id, serialize(batch), { ...serialize(batch), status: 'ARCHIVED', archived: true }, batch.branch_id);
  res.json({ ok: true, status: 'ARCHIVED' });
});

router.patch('/batches/:id/status', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const batch = await batchDetail(req.params.id, tenantId(req));
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const status = String(req.body.status || '').toUpperCase();
  if (!BATCH_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid batch status' });
  if (status === 'ARCHIVED') {
    await run(
      `UPDATE batches SET status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [batch.id, tenantId(req)]
    );
  } else {
    await run(
      `UPDATE batches SET status = ?, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [status, batch.id, tenantId(req)]
    );
  }
  const action = status === 'ACTIVE'
    ? 'BATCH_ACTIVATED'
    : status === 'INACTIVE'
      ? 'BATCH_DEACTIVATED'
      : status === 'ARCHIVED'
        ? 'BATCH_ARCHIVED'
        : 'BATCH_UPDATED';
  await audit(req, action, 'batch', batch.id, { status: batch.status }, { status }, batch.branch_id);
  return res.json({ data: { id: batch.id, status } });
});

router.put('/batches/:batchId/timings', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const batch = await batchDetail(req.params.batchId, tenantId(req));
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (!['PLANNED', 'ACTIVE'].includes(batch.status)) {
      throw new Error('Only planned or active batches can accept timing changes');
    }
    const data = await transaction(() => replaceBatchTimings(req, batch, req.body.timings || []));
    res.json({ data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/batches/:batchId/audit', authMiddleware, requireTenant, requireAnyRole(VIEW_ROLES), async (req, res) => {
  const batch = await batchDetail(req.params.batchId, tenantId(req));
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const rows = await all(
    `SELECT * FROM audit_logs
     WHERE tenant_id = ? AND (
       (entity_type = 'batch' AND entity_id = ?)
       OR (entity_type IN ('batch_timing', 'batch_student', 'batch_teacher') AND metadata LIKE ?)
     )
     ORDER BY created_at DESC`,
    [tenantId(req), batch.id, `%${batch.id}%`]
  );
  res.json({ data: rows.map(serialize) });
});

router.post('/batches/:batchId/students', authMiddleware, requireTenant, requireAnyRole(STUDENT_MANAGE_ROLES), async (req, res) => {
  try {
    const result = await transaction(async () => {
      const batch = await batchDetail(req.params.batchId, tenantId(req));
      if (!batch) throw new Error('Batch not found');
      if (batch.status !== 'ACTIVE') throw new Error('Only active batches can accept students');
      const studentIds = Array.isArray(req.body.studentIds)
        ? req.body.studentIds
        : [req.body.studentId].filter(Boolean);
      if (!studentIds.length) throw new Error('At least one studentId is required');
      if (new Set(studentIds.map(String)).size !== studentIds.length) {
        throw new Error('studentIds must not contain duplicates');
      }
      const activeCount = Number(batch.studentCount || 0);
      if (activeCount + studentIds.length > Number(batch.capacity) && !req.body.capacityOverride) {
        throw new Error('Batch capacity reached; admin override is required');
      }
      if (req.body.capacityOverride && !ROLE_GROUPS.MANAGEMENT.includes(req.user.role)) {
        throw new Error('Only management can override batch capacity');
      }
      const createdIds = [];
      for (const studentId of studentIds) {
        const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [studentId, tenantId(req)]);
        if (!student) throw new Error('Student and batch must belong to the same tenant');
        if (String(student.status || 'ACTIVE').toUpperCase() !== 'ACTIVE' && String(student.status || '').toUpperCase() !== 'ADMITTED') {
          throw new Error('Only active students can be assigned');
        }
        if (student.branch_id && String(student.branch_id) !== String(batch.branch_id) && !req.body.allowBranchTransfer) {
          throw new Error('Student belongs to another branch; transfer permission is required');
        }
        if (req.body.allowBranchTransfer && !ROLE_GROUPS.MANAGEMENT.includes(req.user.role)) {
          throw new Error('Only management can override branch mismatch');
        }
        const existing = await get(
          `SELECT id FROM batch_students WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'`,
          [tenantId(req), batch.id, String(student.id)]
        );
        if (existing) throw new Error('Student is already active in this batch');
        const id = crypto.randomUUID();
        await run(
          `INSERT INTO batch_students
            (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, tenantId(req), batch.id, String(student.id), req.body.joinedAt || new Date().toISOString().slice(0, 10)]
        );
        if (req.body.makePrimary !== false) {
          await run(
            `UPDATE students SET branch_id = ?, primary_course_id = ?, primary_batch_id = ?,
             grade = COALESCE(?, grade), updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND tenant_id = ?`,
            [batch.branch_id, batch.course_id, batch.id, batch.class_level || null, student.id, tenantId(req)]
          );
        }
        await audit(req, 'STUDENT_ADDED_TO_BATCH', 'batch_student', id, {}, { batchId: batch.id, studentId: student.id }, batch.branch_id);
        createdIds.push(id);
      }
      return { ids: createdIds };
    });
    res.status(201).json({ data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/batches/:batchId/students/:studentId', authMiddleware, requireTenant, requireAnyRole(STUDENT_MANAGE_ROLES), async (req, res) => {
  const mapping = await get(
    `SELECT * FROM batch_students WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'`,
    [tenantId(req), req.params.batchId, req.params.studentId]
  );
  if (!mapping) return res.status(404).json({ error: 'Active batch-student mapping not found' });
  await run(
    `UPDATE batch_students SET status = 'REMOVED', left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [mapping.id]
  );
  await audit(req, 'STUDENT_REMOVED_FROM_BATCH', 'batch_student', mapping.id, serialize(mapping), { ...serialize(mapping), status: 'REMOVED' });
  res.json({ ok: true });
});

router.post('/batches/:batchId/students/:studentId/transfer', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const result = await transaction(async () => {
      const source = await batchDetail(req.params.batchId, tenantId(req));
      const target = await batchDetail(req.body.targetBatchId, tenantId(req));
      if (!source || !target) throw new Error('Source and target batches are required');
      if (target.status !== 'ACTIVE') throw new Error('Target batch must be active');
      if (Number(target.studentCount || 0) >= Number(target.capacity) && !req.body.capacityOverride) {
        throw new Error('Target batch capacity reached');
      }
      const mapping = await get(
        `SELECT * FROM batch_students WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'`,
        [tenantId(req), source.id, req.params.studentId]
      );
      if (!mapping) throw new Error('Active source assignment not found');
      const duplicate = await get(
        `SELECT id FROM batch_students WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'`,
        [tenantId(req), target.id, req.params.studentId]
      );
      if (duplicate) throw new Error('Student is already active in the target batch');
      await run(
        `UPDATE batch_students SET status = 'TRANSFERRED', left_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [mapping.id]
      );
      const id = crypto.randomUUID();
      await run(
        `INSERT INTO batch_students
          (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, tenantId(req), target.id, req.params.studentId, req.body.joinedAt || new Date().toISOString().slice(0, 10)]
      );
      await run(
        `UPDATE students SET branch_id = ?, primary_course_id = ?, primary_batch_id = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
        [target.branch_id, target.course_id, target.id, req.params.studentId, tenantId(req)]
      );
      await audit(req, 'STUDENT_TRANSFERRED_BATCH', 'batch_student', id,
        { batchId: source.id, studentId: req.params.studentId },
        { batchId: target.id, studentId: req.params.studentId },
        target.branch_id);
      return { id, targetBatchId: target.id };
    });
    res.json({ data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/teachers', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const batch = await batchDetail(req.params.batchId, tenantId(req));
    const teacher = await get(`SELECT * FROM teachers WHERE id = ? AND tenant_id = ?`, [req.body.teacherId, tenantId(req)]);
    const subject = await get(`SELECT * FROM subjects WHERE id = ? AND tenant_id = ?`, [req.body.subjectId, tenantId(req)]);
    if (!batch || !teacher) throw new Error('Batch and teacher must belong to the tenant');
    if (batch.status !== 'ACTIVE') throw new Error('Only active batches can accept teacher assignments');
    if (!subject || Number(subject.is_active ?? subject.isActive) !== 1) throw new Error('Active subject is required');
    const role = String(req.body.role || 'PRIMARY').toUpperCase();
    const status = String(req.body.status || 'ACTIVE').toUpperCase();
    if (!TEACHER_ROLES.has(role) || !TEACHER_STATUSES.has(status)) throw new Error('Invalid teacher role or status');
    const existing = await get(
      `SELECT id FROM batch_teachers WHERE tenant_id = ? AND batch_id = ? AND teacher_id = ?
       AND subject_id = ? AND status = 'ACTIVE'`,
      [tenantId(req), batch.id, String(teacher.id), subject.id]
    );
    if (existing) throw new Error('Teacher and subject are already assigned to this batch');
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO batch_teachers
        (id, tenant_id, batch_id, teacher_id, subject_id, role, assigned_from, assigned_to,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, tenantId(req), batch.id, String(teacher.id), subject.id, role,
        req.body.assignedFrom || new Date().toISOString().slice(0, 10), req.body.assignedTo || null, status]
    );
    await audit(req, 'TEACHER_ASSIGNED_TO_BATCH', 'batch_teacher', id, {}, { batchId: batch.id, teacherId: teacher.id, subjectId: subject.id, role }, batch.branch_id);
    res.status(201).json({ data: { id } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/batches/:batchId/teachers/:teacherId', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const params = [tenantId(req), req.params.batchId, req.params.teacherId];
  let sql = `SELECT * FROM batch_teachers WHERE tenant_id = ? AND batch_id = ? AND teacher_id = ? AND status = 'ACTIVE'`;
  if (req.query.subjectId) {
    sql += ' AND subject_id = ?';
    params.push(req.query.subjectId);
  }
  const mappings = await all(sql, params);
  if (!mappings.length) return res.status(404).json({ error: 'Active batch-teacher mapping not found' });
  for (const mapping of mappings) {
    await run(
      `UPDATE batch_teachers SET status = 'REMOVED', assigned_to = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [mapping.id]
    );
    await audit(req, 'TEACHER_REMOVED_FROM_BATCH', 'batch_teacher', mapping.id, serialize(mapping), { ...serialize(mapping), status: 'REMOVED' });
  }
  res.json({ ok: true });
});

router.post('/faculty/:facultyId/subjects', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  try {
    const faculty = await get(`SELECT * FROM teachers WHERE id = ? AND tenant_id = ?`, [req.params.facultyId, tenantId(req)]);
    const subject = await get(`SELECT * FROM subjects WHERE id = ? AND tenant_id = ?`, [req.body.subjectId, tenantId(req)]);
    if (!faculty) throw new Error('Faculty not found');
    if (!subject || Number(subject.is_active ?? subject.isActive) !== 1) throw new Error('Active subject is required');
    const existing = await get(
      `SELECT id FROM faculty_subjects WHERE tenant_id = ? AND faculty_id = ? AND subject_id = ?`,
      [tenantId(req), String(faculty.id), subject.id]
    );
    if (existing) throw new Error('Faculty-subject mapping already exists');
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO faculty_subjects
        (id, tenant_id, faculty_id, subject_id, is_primary, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, tenantId(req), String(faculty.id), subject.id, boolInt(req.body.isPrimary, false)]
    );
    await audit(req, 'FACULTY_SUBJECT_ASSIGNED', 'faculty_subject', id, {}, { facultyId: faculty.id, subjectId: subject.id, isPrimary: Boolean(req.body.isPrimary) });
    res.status(201).json({ data: { id } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/faculty/:facultyId/subjects/:subjectId', authMiddleware, requireTenant, requireAnyRole(MANAGE_ROLES), async (req, res) => {
  const mapping = await get(
    `SELECT * FROM faculty_subjects WHERE tenant_id = ? AND faculty_id = ? AND subject_id = ? AND is_active = 1`,
    [tenantId(req), req.params.facultyId, req.params.subjectId]
  );
  if (!mapping) return res.status(404).json({ error: 'Faculty-subject mapping not found' });
  await run(`UPDATE faculty_subjects SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [mapping.id]);
  await audit(req, 'FACULTY_SUBJECT_REMOVED', 'faculty_subject', mapping.id, serialize(mapping), { ...serialize(mapping), isActive: false });
  res.json({ ok: true });
});

module.exports = router;
