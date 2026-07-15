const crypto = require('crypto');
const express = require('express');
const { run, all, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { createAuditLog } = require('../services/auditLog.service');
const { currentTenantId } = require('../utils/request');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['ACTIVE', 'INACTIVE', 'PROVISIONAL']);
const GUARDIAN_RELATIONSHIPS = new Set(['FATHER', 'MOTHER', 'GUARDIAN', 'BROTHER', 'SISTER', 'OTHER']);

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeStudent(row = {}) {
  return {
    studentCode: text(row.studentCode ?? row.student_code),
    name: text(row.name ?? row.displayName ?? row.display_name),
    classLevel: text(row.classLevel ?? row.class_level ?? row.grade),
    studentEmail: text(row.studentEmail ?? row.student_email)?.toLowerCase() || null,
    studentPhone: text(row.studentPhone ?? row.student_phone),
    parentName: text(row.parentName ?? row.parent_name),
    parentPhone: text(row.parentPhone ?? row.parent_phone),
    dateOfBirth: text(row.dateOfBirth ?? row.date_of_birth),
    admissionDate: text(row.admissionDate ?? row.admission_date),
    status: text(row.status)?.toUpperCase() || 'PROVISIONAL',
  };
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function normalizeGuardian(row = {}) {
  return {
    studentCode: text(row.studentCode ?? row.student_code),
    name: text(row.name ?? row.guardianName ?? row.guardian_name),
    relationship: text(row.relationship)?.toUpperCase() || 'GUARDIAN',
    phone: text(row.phone),
    alternatePhone: text(row.alternatePhone ?? row.alternate_phone),
    email: text(row.email)?.toLowerCase() || null,
    occupation: text(row.occupation),
    address: text(row.address),
    isPrimary: booleanValue(row.isPrimary ?? row.is_primary),
    isEmergencyContact: booleanValue(row.isEmergencyContact ?? row.is_emergency_contact),
    canReceiveNotifications: booleanValue(row.canReceiveNotifications ?? row.can_receive_notifications, true),
  };
}

function validateGuardian(row) {
  const errors = [];
  if (!row.studentCode) errors.push('STUDENT_CODE_REQUIRED');
  if (!row.name) errors.push('GUARDIAN_NAME_REQUIRED');
  if (!GUARDIAN_RELATIONSHIPS.has(row.relationship)) errors.push('RELATIONSHIP_INVALID');
  if (row.isPrimary && !row.phone) errors.push('PRIMARY_GUARDIAN_PHONE_REQUIRED');
  if (row.email && !EMAIL_PATTERN.test(row.email)) errors.push('GUARDIAN_EMAIL_INVALID');
  return errors;
}

function normalizeFeeOpeningBalance(row = {}) {
  return {
    studentCode: text(row.studentCode ?? row.student_code),
    courseName: text(row.courseName ?? row.course_name),
    academicYear: text(row.academicYear ?? row.academic_year),
    openingBalance: Number(row.openingBalance ?? row.opening_balance),
    dueDate: text(row.dueDate ?? row.due_date),
  };
}

function validateFeeOpeningBalance(row) {
  const errors = [];
  if (!row.studentCode) errors.push('STUDENT_CODE_REQUIRED');
  if (!row.courseName) errors.push('COURSE_NAME_REQUIRED');
  if (!row.academicYear) errors.push('ACADEMIC_YEAR_REQUIRED');
  if (!Number.isFinite(row.openingBalance) || row.openingBalance <= 0) errors.push('OPENING_BALANCE_INVALID');
  if (Number.isFinite(row.openingBalance) && !Number.isInteger(row.openingBalance)) errors.push('OPENING_BALANCE_MUST_BE_WHOLE_RUPEES');
  if (Number.isFinite(row.openingBalance) && row.openingBalance > 100000000) errors.push('OPENING_BALANCE_TOO_LARGE');
  if (!row.dueDate || !DATE_PATTERN.test(row.dueDate)) errors.push('DUE_DATE_INVALID');
  return errors;
}

function validateStudent(row) {
  const errors = [];
  if (!row.studentCode) errors.push('STUDENT_CODE_REQUIRED');
  if (!row.name) errors.push('NAME_REQUIRED');
  if (row.studentCode && row.studentCode.length > 80) errors.push('STUDENT_CODE_TOO_LONG');
  if (row.name && row.name.length > 200) errors.push('NAME_TOO_LONG');
  if (row.studentEmail && !EMAIL_PATTERN.test(row.studentEmail)) errors.push('STUDENT_EMAIL_INVALID');
  if (row.dateOfBirth && !DATE_PATTERN.test(row.dateOfBirth)) errors.push('DATE_OF_BIRTH_INVALID');
  if (row.admissionDate && !DATE_PATTERN.test(row.admissionDate)) errors.push('ADMISSION_DATE_INVALID');
  if (!STATUSES.has(row.status)) errors.push('STATUS_INVALID');
  return errors;
}

function payloadHash(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function findDuplicateCodes(tenantId, rows) {
  const duplicates = new Set();
  const seen = new Set();
  for (const row of rows) {
    const code = row.studentCode?.toLowerCase();
    if (!code) continue;
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }
  for (const row of rows) {
    if (!row.studentCode) continue;
    const existing = await get(
      `SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`,
      [tenantId, row.studentCode]
    );
    if (existing) duplicates.add(row.studentCode.toLowerCase());
  }
  return duplicates;
}

router.get('/', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = await all(
    `SELECT id, entity_type, status, source_name, payload_sha256, total_rows, valid_rows, invalid_rows,
            created_by, created_at, committed_at, rolled_back_at
     FROM data_import_batches
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [currentTenantId(req)]
  );
  res.json(rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    status: row.status,
    sourceName: row.source_name,
    checksum: row.payload_sha256,
    totalRows: Number(row.total_rows || 0),
    validRows: Number(row.valid_rows || 0),
    invalidRows: Number(row.invalid_rows || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    rolledBackAt: row.rolled_back_at,
  })));
});

router.post('/students/dry-run', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length < 1) return res.status(400).json({ error: 'rows must be a non-empty array' });
  if (rows.length > 5000) return res.status(400).json({ error: 'A single import is limited to 5000 rows' });

  const tenantId = currentTenantId(req);
  const normalizedRows = rows.map(normalizeStudent);
  const duplicateCodes = await findDuplicateCodes(tenantId, normalizedRows);
  const results = normalizedRows.map((row, index) => {
    const errors = validateStudent(row);
    if (row.studentCode && duplicateCodes.has(row.studentCode.toLowerCase())) errors.push('STUDENT_CODE_DUPLICATE');
    return { rowNumber: index + 1, status: errors.length ? 'INVALID' : 'VALID', errors, normalized: row };
  });
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const invalidRows = results.filter((row) => row.status === 'INVALID').length;
  await run(
    `INSERT INTO data_import_batches
      (id, tenant_id, entity_type, status, source_name, payload_sha256, total_rows, valid_rows, invalid_rows, created_by, created_at)
     VALUES (?, ?, 'STUDENT', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, tenantId, invalidRows ? 'REJECTED' : 'VALIDATED', text(req.body.sourceName), payloadHash(normalizedRows), rows.length, rows.length - invalidRows, invalidRows, req.user.id, now]
  );
  for (const result of results) {
    await run(
      `INSERT INTO data_import_rows
        (id, batch_id, tenant_id, row_number, status, normalized_data, errors, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), batchId, tenantId, result.rowNumber, result.status, JSON.stringify(result.normalized), JSON.stringify(result.errors), now]
    );
  }
  await createAuditLog({
    tenantId, actorUserId: req.user.id, action: 'STUDENT_IMPORT_VALIDATED', entityType: 'data_import_batch', entityId: batchId,
    newValues: { status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, invalidRows },
  });
  res.status(201).json({ batchId, status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, rows: results });
});

router.post('/guardians/dry-run', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length < 1) return res.status(400).json({ error: 'rows must be a non-empty array' });
  if (rows.length > 5000) return res.status(400).json({ error: 'A single import is limited to 5000 rows' });
  const tenantId = currentTenantId(req);
  const normalizedRows = rows.map(normalizeGuardian);
  const primaryCodes = new Set();
  const duplicatePrimaryCodes = new Set();
  for (const row of normalizedRows) {
    const code = row.studentCode?.toLowerCase();
    if (code && row.isPrimary) {
      if (primaryCodes.has(code)) duplicatePrimaryCodes.add(code);
      primaryCodes.add(code);
    }
  }
  const results = [];
  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const errors = validateGuardian(row);
    let student = null;
    if (row.studentCode) {
      student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
      if (!student) errors.push('STUDENT_NOT_FOUND');
    }
    if (student) {
      const duplicate = await get(
        `SELECT id FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND LOWER(name) = LOWER(?) AND COALESCE(phone, '') = COALESCE(?, '')`,
        [tenantId, String(student.id), row.name || '', row.phone]
      );
      if (duplicate) errors.push('GUARDIAN_DUPLICATE');
      if (row.isPrimary) {
        const existingPrimary = await get(`SELECT id FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND is_primary = 1`, [tenantId, String(student.id)]);
        if (existingPrimary) errors.push('PRIMARY_GUARDIAN_EXISTS');
      }
    }
    if (row.studentCode && row.isPrimary && duplicatePrimaryCodes.has(row.studentCode.toLowerCase())) errors.push('MULTIPLE_PRIMARY_GUARDIANS');
    results.push({ rowNumber: index + 1, status: errors.length ? 'INVALID' : 'VALID', errors, normalized: row });
  }
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const invalidRows = results.filter((row) => row.status === 'INVALID').length;
  await run(
    `INSERT INTO data_import_batches
      (id, tenant_id, entity_type, status, source_name, payload_sha256, total_rows, valid_rows, invalid_rows, created_by, created_at)
     VALUES (?, ?, 'GUARDIAN', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, tenantId, invalidRows ? 'REJECTED' : 'VALIDATED', text(req.body.sourceName), payloadHash(normalizedRows), rows.length, rows.length - invalidRows, invalidRows, req.user.id, now]
  );
  for (const result of results) {
    await run(
      `INSERT INTO data_import_rows (id, batch_id, tenant_id, row_number, status, normalized_data, errors, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), batchId, tenantId, result.rowNumber, result.status, JSON.stringify(result.normalized), JSON.stringify(result.errors), now]
    );
  }
  await createAuditLog({ tenantId, actorUserId: req.user.id, action: 'GUARDIAN_IMPORT_VALIDATED', entityType: 'data_import_batch', entityId: batchId, newValues: { status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, invalidRows } });
  res.status(201).json({ batchId, entityType: 'GUARDIAN', status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, rows: results });
});

router.post('/fee-opening-balances/dry-run', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length < 1) return res.status(400).json({ error: 'rows must be a non-empty array' });
  if (rows.length > 5000) return res.status(400).json({ error: 'A single import is limited to 5000 rows' });
  const tenantId = currentTenantId(req);
  const normalizedRows = rows.map(normalizeFeeOpeningBalance);
  const seen = new Set();
  const duplicateKeys = new Set();
  for (const row of normalizedRows) {
    const key = `${row.studentCode?.toLowerCase()}|${row.courseName?.toLowerCase()}|${row.academicYear?.toLowerCase()}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
  }
  const results = [];
  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const errors = validateFeeOpeningBalance(row);
    let student = null;
    if (row.studentCode) {
      student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
      if (!student) errors.push('STUDENT_NOT_FOUND');
    }
    if (student && row.courseName && row.academicYear) {
      const existing = await get(
        `SELECT id FROM student_fee_plans
         WHERE tenant_id = ? AND student_id = ? AND LOWER(course_name) = LOWER(?) AND LOWER(academic_year) = LOWER(?)
           AND status NOT IN ('REVERSED', 'CANCELLED')`,
        [tenantId, String(student.id), row.courseName, row.academicYear]
      );
      if (existing) errors.push('FEE_PLAN_DUPLICATE');
    }
    const key = `${row.studentCode?.toLowerCase()}|${row.courseName?.toLowerCase()}|${row.academicYear?.toLowerCase()}`;
    if (duplicateKeys.has(key)) errors.push('DUPLICATE_IMPORT_ROW');
    results.push({ rowNumber: index + 1, status: errors.length ? 'INVALID' : 'VALID', errors, normalized: row });
  }
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const invalidRows = results.filter((row) => row.status === 'INVALID').length;
  const totalAmount = results.filter((row) => row.status === 'VALID').reduce((sum, row) => sum + row.normalized.openingBalance, 0);
  await run(
    `INSERT INTO data_import_batches
      (id, tenant_id, entity_type, status, source_name, payload_sha256, total_rows, valid_rows, invalid_rows, created_by, created_at)
     VALUES (?, ?, 'FEE_OPENING_BALANCE', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, tenantId, invalidRows ? 'REJECTED' : 'VALIDATED', text(req.body.sourceName), payloadHash(normalizedRows), rows.length, rows.length - invalidRows, invalidRows, req.user.id, now]
  );
  for (const result of results) {
    await run(
      `INSERT INTO data_import_rows (id, batch_id, tenant_id, row_number, status, normalized_data, errors, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), batchId, tenantId, result.rowNumber, result.status, JSON.stringify(result.normalized), JSON.stringify(result.errors), now]
    );
  }
  await createAuditLog({ tenantId, actorUserId: req.user.id, action: 'FEE_OPENING_BALANCE_IMPORT_VALIDATED', entityType: 'data_import_batch', entityId: batchId, newValues: { status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, invalidRows, totalAmount } });
  res.status(201).json({ batchId, entityType: 'FEE_OPENING_BALANCE', status: invalidRows ? 'REJECTED' : 'VALIDATED', totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, totalAmount, rows: results });
});

router.post('/:batchId/commit', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const tenantId = currentTenantId(req);
  const batch = await get(`SELECT id, entity_type, status, payload_sha256 FROM data_import_batches WHERE id = ? AND tenant_id = ?`, [req.params.batchId, tenantId]);
  if (!batch) return res.status(404).json({ error: 'Import batch not found' });
  if (batch.status !== 'VALIDATED') return res.status(409).json({ error: `Import batch cannot be committed from ${batch.status}` });
  const importRows = await all(`SELECT id, row_number, normalized_data FROM data_import_rows WHERE batch_id = ? AND tenant_id = ? AND status = 'VALID' ORDER BY row_number`, [batch.id, tenantId]);
  const normalizedRows = importRows.map((row) => JSON.parse(row.normalized_data));
  if (payloadHash(normalizedRows) !== batch.payload_sha256) return res.status(409).json({ error: 'Import batch payload checksum mismatch' });
  if (batch.entity_type === 'STUDENT') {
    const duplicates = await findDuplicateCodes(tenantId, normalizedRows);
    if (duplicates.size) return res.status(409).json({ error: 'Import conflicts changed after validation; run a new dry run', code: 'IMPORT_STALE' });
  } else if (batch.entity_type === 'GUARDIAN') {
    for (const row of normalizedRows) {
      const student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
      if (!student) return res.status(409).json({ error: 'Import conflicts changed after validation; run a new dry run', code: 'IMPORT_STALE' });
      const duplicate = await get(
        `SELECT id FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND LOWER(name) = LOWER(?) AND COALESCE(phone, '') = COALESCE(?, '')`,
        [tenantId, String(student.id), row.name, row.phone]
      );
      const primary = row.isPrimary && await get(`SELECT id FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND is_primary = 1`, [tenantId, String(student.id)]);
      if (duplicate || primary) return res.status(409).json({ error: 'Import conflicts changed after validation; run a new dry run', code: 'IMPORT_STALE' });
    }
  } else if (batch.entity_type === 'FEE_OPENING_BALANCE') {
    for (const row of normalizedRows) {
      const student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
      if (!student) return res.status(409).json({ error: 'Import conflicts changed after validation; run a new dry run', code: 'IMPORT_STALE' });
      const existing = await get(
        `SELECT id FROM student_fee_plans WHERE tenant_id = ? AND student_id = ? AND LOWER(course_name) = LOWER(?) AND LOWER(academic_year) = LOWER(?) AND status NOT IN ('REVERSED', 'CANCELLED')`,
        [tenantId, String(student.id), row.courseName, row.academicYear]
      );
      if (existing) return res.status(409).json({ error: 'Import conflicts changed after validation; run a new dry run', code: 'IMPORT_STALE' });
    }
  }

  await run(`UPDATE data_import_batches SET status = 'COMMITTING' WHERE id = ? AND tenant_id = ? AND status = 'VALIDATED'`, [batch.id, tenantId]);
  const inserted = [];
  try {
    for (let index = 0; index < importRows.length; index += 1) {
      const rowRecord = importRows[index];
      const row = normalizedRows[index];
      let entityId;
      if (batch.entity_type === 'STUDENT') {
        const parts = row.name.split(/\s+/);
        const result = await run(
          `INSERT INTO students
          (tenant_id, student_code, name, student_name, display_name, first_name, last_name, grade, class_level,
           student_email, student_phone, parent_name, parent_phone, date_of_birth, admission_date, status,
           data, legacy_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [tenantId, row.studentCode, row.name, row.name, row.name, parts[0], parts.length > 1 ? parts.slice(1).join(' ') : null,
          row.classLevel, row.classLevel, row.studentEmail, row.studentPhone, row.parentName, row.parentPhone,
          row.dateOfBirth, row.admissionDate, row.status]
        );
        entityId = String(result.lastID);
      } else if (batch.entity_type === 'GUARDIAN') {
        const student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
        if (!student) throw new Error('Guardian import became stale; run a new dry run');
        if (row.isPrimary && await get(`SELECT id FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND is_primary = 1`, [tenantId, String(student.id)])) throw new Error('Guardian import became stale; run a new dry run');
        entityId = crypto.randomUUID();
        await run(
          `INSERT INTO student_guardians
            (id, tenant_id, student_id, name, relationship, phone, alternate_phone, email, occupation, address,
             is_primary, is_emergency_contact, can_receive_notifications, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [entityId, tenantId, String(student.id), row.name, row.relationship, row.phone, row.alternatePhone, row.email,
            row.occupation, row.address, row.isPrimary ? 1 : 0, row.isEmergencyContact ? 1 : 0, row.canReceiveNotifications ? 1 : 0]
        );
      } else if (batch.entity_type === 'FEE_OPENING_BALANCE') {
        const student = await get(`SELECT id FROM students WHERE tenant_id = ? AND LOWER(student_code) = LOWER(?) AND deleted_at IS NULL`, [tenantId, row.studentCode]);
        if (!student) throw new Error('Fee opening balance import became stale; run a new dry run');
        entityId = crypto.randomUUID();
        await run(
          `INSERT INTO student_fee_plans
            (id, tenant_id, student_id, course_name, academic_year, total_amount, discount_amount,
             payable_amount, paid_amount, pending_amount, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [entityId, tenantId, String(student.id), row.courseName, row.academicYear, row.openingBalance, row.openingBalance, row.openingBalance]
        );
        await run(
          `INSERT INTO student_fee_installments
            (id, tenant_id, student_fee_plan_id, installment_number, title, amount, paid_amount, pending_amount, due_date, status, created_at, updated_at)
           VALUES (?, ?, ?, 1, 'Opening Balance', ?, 0, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), tenantId, entityId, row.openingBalance, row.openingBalance, row.dueDate]
        );
      } else throw new Error('Unsupported import entity type');
      inserted.push(entityId);
      await run(`UPDATE data_import_rows SET status = 'IMPORTED', entity_id = ? WHERE id = ? AND tenant_id = ?`, [entityId, rowRecord.id, tenantId]);
    }
  } catch (error) {
    for (const entityId of inserted.reverse()) {
      if (batch.entity_type === 'GUARDIAN') await run(`DELETE FROM student_guardians WHERE id = ? AND tenant_id = ?`, [entityId, tenantId]);
      else if (batch.entity_type === 'FEE_OPENING_BALANCE') {
        await run(`DELETE FROM student_fee_installments WHERE student_fee_plan_id = ? AND tenant_id = ?`, [entityId, tenantId]);
        await run(`DELETE FROM student_fee_plans WHERE id = ? AND tenant_id = ?`, [entityId, tenantId]);
      } else await run(`DELETE FROM students WHERE id = ? AND tenant_id = ?`, [entityId, tenantId]);
    }
    await run(`UPDATE data_import_rows SET status = 'VALID', entity_id = NULL WHERE batch_id = ? AND tenant_id = ?`, [batch.id, tenantId]);
    await run(`UPDATE data_import_batches SET status = 'VALIDATED' WHERE id = ? AND tenant_id = ?`, [batch.id, tenantId]);
    throw error;
  }
  await run(`UPDATE data_import_batches SET status = 'COMMITTED', committed_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, [batch.id, tenantId]);
  await createAuditLog({ tenantId, actorUserId: req.user.id, action: `${batch.entity_type}_IMPORT_COMMITTED`, entityType: 'data_import_batch', entityId: batch.id, newValues: { importedRows: inserted.length } });
  res.json({ batchId: batch.id, entityType: batch.entity_type, status: 'COMMITTED', importedRows: inserted.length });
});

router.post('/:batchId/rollback', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.MANAGEMENT), async (req, res) => {
  const tenantId = currentTenantId(req);
  const batch = await get(`SELECT id, entity_type, status FROM data_import_batches WHERE id = ? AND tenant_id = ?`, [req.params.batchId, tenantId]);
  if (!batch) return res.status(404).json({ error: 'Import batch not found' });
  if (batch.status !== 'COMMITTED') return res.status(409).json({ error: `Import batch cannot be rolled back from ${batch.status}` });
  const importedRows = await all(`SELECT id, entity_id FROM data_import_rows WHERE batch_id = ? AND tenant_id = ? AND status = 'IMPORTED'`, [batch.id, tenantId]);
  if (batch.entity_type === 'FEE_OPENING_BALANCE') {
    for (const row of importedRows) {
      const payment = await get(
        `SELECT id FROM fee_payments WHERE tenant_id = ? AND student_fee_plan_id = ? AND COALESCE(status, 'CAPTURED') NOT IN ('CANCELLED', 'Cancelled')`,
        [tenantId, row.entity_id]
      );
      if (payment) return res.status(409).json({ error: 'Cannot reverse an opening balance after a payment has been posted', code: 'IMPORT_HAS_DEPENDENCIES' });
    }
  }
  for (const row of importedRows) {
    if (batch.entity_type === 'GUARDIAN') await run(`DELETE FROM student_guardians WHERE tenant_id = ? AND id = ?`, [tenantId, row.entity_id]);
    else if (batch.entity_type === 'FEE_OPENING_BALANCE') {
      await run(`UPDATE student_fee_installments SET status = 'REVERSED', pending_amount = 0, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND student_fee_plan_id = ?`, [tenantId, row.entity_id]);
      await run(`UPDATE student_fee_plans SET status = 'REVERSED', pending_amount = 0, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id = ?`, [tenantId, row.entity_id]);
    }
    else {
      await run(`DELETE FROM batch_students WHERE tenant_id = ? AND student_id = ?`, [tenantId, row.entity_id]);
      await run(`DELETE FROM students WHERE tenant_id = ? AND id = ?`, [tenantId, row.entity_id]);
    }
    await run(`UPDATE data_import_rows SET status = 'ROLLED_BACK' WHERE id = ? AND tenant_id = ?`, [row.id, tenantId]);
  }
  await run(`UPDATE data_import_batches SET status = 'ROLLED_BACK', rolled_back_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, [batch.id, tenantId]);
  await createAuditLog({ tenantId, actorUserId: req.user.id, action: `${batch.entity_type}_IMPORT_ROLLED_BACK`, entityType: 'data_import_batch', entityId: batch.id, newValues: { rolledBackRows: importedRows.length } });
  res.json({ batchId: batch.id, entityType: batch.entity_type, status: 'ROLLED_BACK', rolledBackRows: importedRows.length });
});

module.exports = router;
