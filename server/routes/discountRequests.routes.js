const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { run, get, all, transaction } = require('../services/db.service');
const { createAuditLog } = require('../services/auditLog.service');

const router = express.Router();
const REQUEST_ROLES = [...ROLE_GROUPS.FINANCE, ROLES.COUNSELLOR];
const APPLY_ROLES = ROLE_GROUPS.FINANCE;
const VALID_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'APPLIED']);
const VALID_TYPES = new Set(['FIXED', 'PERCENT']);

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    return {};
  }
}

function value(row, snake, camel) {
  return row?.[snake] ?? row?.[camel];
}

function serializeRequest(row) {
  const totalAmount = Number(row.totalAmount || 0);
  const currentDiscount = Number(row.currentDiscountAmount || 0);
  const paidAmount = Number(row.paidAmount || 0);
  return {
    id: row.id,
    tenantId: value(row, 'tenant_id', 'tenantId'),
    branchId: value(row, 'branch_id', 'branchId'),
    studentId: value(row, 'student_id', 'studentId'),
    admissionId: value(row, 'admission_id', 'admissionId'),
    feeInvoiceId: value(row, 'fee_invoice_id', 'feeInvoiceId'),
    discountType: value(row, 'discount_type', 'discountType'),
    discountAmount: Number(value(row, 'discount_amount', 'discountAmount') || 0),
    discountPercent: Number(value(row, 'discount_percent', 'discountPercent') || 0),
    reason: row.reason,
    proofNote: value(row, 'proof_note', 'proofNote'),
    status: row.status,
    rejectionReason: value(row, 'rejection_reason', 'rejectionReason'),
    appliedAmount: Number(value(row, 'applied_amount', 'appliedAmount') || 0),
    studentName: row.studentName,
    courseName: row.courseName,
    originalFee: totalAmount,
    currentDiscountAmount: currentDiscount,
    paidAmount,
    pendingBalance: Math.max(totalAmount - currentDiscount - paidAmount, 0),
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    rejectedBy: row.rejectedBy,
    cancelledBy: row.cancelledBy,
    appliedBy: row.appliedBy,
    requestedByUserId: value(row, 'requested_by_user_id', 'requestedByUserId'),
    requestedAt: value(row, 'requested_at', 'requestedAt'),
    approvedAt: value(row, 'approved_at', 'approvedAt'),
    rejectedAt: value(row, 'rejected_at', 'rejectedAt'),
    cancelledAt: value(row, 'cancelled_at', 'cancelledAt'),
    appliedAt: value(row, 'applied_at', 'appliedAt'),
    createdAt: value(row, 'created_at', 'createdAt'),
    updatedAt: value(row, 'updated_at', 'updatedAt'),
  };
}

const DETAIL_SELECT = `
  SELECT
    dr.*,
    fp.totalAmount AS totalAmount,
    fp.discountAmount AS currentDiscountAmount,
    fp.courseProgram AS courseName,
    s.name AS studentName,
    COALESCE((
      SELECT SUM(pay.amount)
      FROM fee_payments pay
      WHERE pay.fee_plan_id = fp.id
        AND pay.tenant_id = fp.tenant_id
        AND COALESCE(pay.status, 'Active') != 'Cancelled'
    ), 0) AS paidAmount,
    COALESCE(requested_user.name, requested_user.username, requested_user.email) AS requestedBy,
    COALESCE(approved_user.name, approved_user.username, approved_user.email) AS approvedBy,
    COALESCE(rejected_user.name, rejected_user.username, rejected_user.email) AS rejectedBy,
    COALESCE(cancelled_user.name, cancelled_user.username, cancelled_user.email) AS cancelledBy,
    COALESCE(applied_user.name, applied_user.username, applied_user.email) AS appliedBy
  FROM discount_requests dr
  JOIN fee_plans fp
    ON CAST(fp.id AS TEXT) = CAST(dr.fee_invoice_id AS TEXT)
   AND CAST(fp.tenant_id AS TEXT) = CAST(dr.tenant_id AS TEXT)
  JOIN students s
    ON CAST(s.id AS TEXT) = CAST(dr.student_id AS TEXT)
   AND CAST(s.tenant_id AS TEXT) = CAST(dr.tenant_id AS TEXT)
  LEFT JOIN users requested_user ON CAST(requested_user.id AS TEXT) = CAST(dr.requested_by_user_id AS TEXT)
  LEFT JOIN users approved_user ON CAST(approved_user.id AS TEXT) = CAST(dr.approved_by_user_id AS TEXT)
  LEFT JOIN users rejected_user ON CAST(rejected_user.id AS TEXT) = CAST(dr.rejected_by_user_id AS TEXT)
  LEFT JOIN users cancelled_user ON CAST(cancelled_user.id AS TEXT) = CAST(dr.cancelled_by_user_id AS TEXT)
  LEFT JOIN users applied_user ON CAST(applied_user.id AS TEXT) = CAST(dr.applied_by_user_id AS TEXT)
`;

async function loadRequest(id, tenantId) {
  return get(`${DETAIL_SELECT} WHERE dr.id = ? AND dr.tenant_id = ?`, [id, tenantId]);
}

function requestedDiscountAmount(body, plan) {
  const type = String(body.discountType || '').toUpperCase();
  const amount = Number(body.discountAmount || 0);
  const percent = Number(body.discountPercent || 0);
  if (!VALID_TYPES.has(type)) throw new Error('discountType must be FIXED or PERCENT');
  if (type === 'FIXED' && (!(amount > 0) || percent > 0)) {
    throw new Error('A positive discountAmount is required for FIXED discounts');
  }
  if (type === 'PERCENT' && (!(percent > 0) || percent > 100 || amount > 0)) {
    throw new Error('discountPercent must be between 1 and 100 for PERCENT discounts');
  }
  return type === 'FIXED' ? amount : Math.round(Number(plan.totalAmount) * percent / 100);
}

async function auditDiscount({ req, request, action, oldStatus, newStatus, extra = {} }) {
  await createAuditLog({
    tenantId: req.user.tenantId,
    branchId: value(request, 'branch_id', 'branchId'),
    actorUserId: req.user.id,
    action,
    entityType: 'discount_request',
    entityId: request.id,
    oldValues: { status: oldStatus },
    newValues: { status: newStatus, ...extra },
    metadata: { feeInvoiceId: value(request, 'fee_invoice_id', 'feeInvoiceId') },
  });
}

router.post(
  '/discount-requests',
  authMiddleware,
  requireTenant,
  requireAnyRole(REQUEST_ROLES),
  async (req, res) => {
    try {
      const reason = String(req.body.reason || '').trim();
      const proofNote = String(req.body.proofNote || '').trim();
      if (!reason) return res.status(400).json({ error: 'Discount reason is required' });
      if (!proofNote) return res.status(400).json({ error: 'Discount proof note is required' });
      if (!req.body.feeInvoiceId) return res.status(400).json({ error: 'feeInvoiceId is required' });

      const plan = await get(
        `SELECT fp.*, s.data AS studentData
         FROM fee_plans fp
         JOIN students s ON s.id = fp.student_id AND s.tenant_id = fp.tenant_id
         WHERE fp.id = ? AND fp.tenant_id = ?`,
        [req.body.feeInvoiceId, req.user.tenantId]
      );
      if (!plan) return res.status(404).json({ error: 'Fee invoice not found' });
      if (req.body.studentId && String(req.body.studentId) !== String(plan.student_id ?? plan.studentId)) {
        return res.status(400).json({ error: 'Student does not match fee invoice' });
      }

      const paid = await get(
        `SELECT COALESCE(SUM(amount), 0) AS paidAmount
         FROM fee_payments
         WHERE fee_plan_id = ? AND tenant_id = ?
           AND COALESCE(status, 'Active') != 'Cancelled'`,
        [plan.id, req.user.tenantId]
      );
      const discountValue = requestedDiscountAmount(req.body, plan);
      const pendingBalance = Math.max(
        Number(plan.totalAmount || 0) - Number(plan.discountAmount || 0) - Number(paid?.paidAmount || 0),
        0
      );
      if (discountValue > pendingBalance) {
        return res.status(400).json({ error: 'Discount cannot exceed the pending fee balance' });
      }

      const existing = await get(
        `SELECT id FROM discount_requests
         WHERE tenant_id = ? AND fee_invoice_id = ? AND status = 'PENDING'`,
        [req.user.tenantId, String(plan.id)]
      );
      if (existing) return res.status(409).json({ error: 'A pending discount request already exists for this invoice' });

      const studentData = parseJson(plan.studentData);
      const branchId = req.body.branchId
        || studentData.branchId
        || studentData.branch_id
        || studentData.branch
        || null;
      const id = crypto.randomUUID();
      await run(
        `INSERT INTO discount_requests
          (id, tenant_id, branch_id, student_id, admission_id, fee_invoice_id,
           discount_type, discount_amount, discount_percent, reason, proof_note,
           requested_by_user_id, requested_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'PENDING',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          id,
          req.user.tenantId,
          branchId,
          String(plan.student_id ?? plan.studentId),
          req.body.admissionId || null,
          String(plan.id),
          String(req.body.discountType).toUpperCase(),
          Number(req.body.discountAmount || 0),
          Number(req.body.discountPercent || 0),
          reason,
          proofNote,
          req.user.id,
        ]
      );
      const created = await loadRequest(id, req.user.tenantId);
      await auditDiscount({
        req,
        request: created,
        action: 'DISCOUNT_REQUESTED',
        oldStatus: null,
        newStatus: 'PENDING',
        extra: { requestedDiscount: discountValue },
      });
      res.status(201).json({ message: 'Discount request submitted', data: serializeRequest(created) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.get(
  '/discount-requests',
  authMiddleware,
  requireTenant,
  requireAnyRole(REQUEST_ROLES),
  async (req, res) => {
    const conditions = ['dr.tenant_id = ?'];
    const params = [req.user.tenantId];
    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid discount status' });
      conditions.push('dr.status = ?');
      params.push(status);
    }
    if (req.query.feeInvoiceId) {
      conditions.push('dr.fee_invoice_id = ?');
      params.push(String(req.query.feeInvoiceId));
    }
    if (req.user.role === ROLES.COUNSELLOR) {
      conditions.push('dr.requested_by_user_id = ?');
      params.push(req.user.id);
    }
    const rows = await all(
      `${DETAIL_SELECT}
       WHERE ${conditions.join(' AND ')}
       ORDER BY dr.created_at DESC`,
      params
    );
    res.json({ data: rows.map(serializeRequest) });
  }
);

router.get(
  '/discount-requests/:id',
  authMiddleware,
  requireTenant,
  requireAnyRole(REQUEST_ROLES),
  async (req, res) => {
    const row = await loadRequest(req.params.id, req.user.tenantId);
    if (!row) return res.status(404).json({ error: 'Discount request not found' });
    if (req.user.role === ROLES.COUNSELLOR
      && String(value(row, 'requested_by_user_id', 'requestedByUserId')) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    return res.json({ data: serializeRequest(row) });
  }
);

router.get(
  '/discount-requests/:id/audit',
  authMiddleware,
  requireTenant,
  requireAnyRole(APPLY_ROLES),
  async (req, res) => {
    const request = await loadRequest(req.params.id, req.user.tenantId);
    if (!request) return res.status(404).json({ error: 'Discount request not found' });
    const rows = await all(
      `SELECT *
       FROM audit_logs
       WHERE tenant_id = ?
         AND entity_type = 'discount_request'
         AND entity_id = ?
       ORDER BY created_at ASC`,
      [req.user.tenantId, req.params.id]
    );
    return res.json({
      data: rows.map((row) => ({
        ...row,
        oldValues: parseJson(value(row, 'old_values', 'oldValues')),
        newValues: parseJson(value(row, 'new_values', 'newValues')),
        metadata: parseJson(row.metadata),
      })),
    });
  }
);

router.patch(
  '/discount-requests/:id/approve',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.MANAGEMENT),
  async (req, res) => {
    const request = await loadRequest(req.params.id, req.user.tenantId);
    if (!request) return res.status(404).json({ error: 'Discount request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Only pending requests can be approved' });
    await run(
      `UPDATE discount_requests
       SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ? AND status = 'PENDING'`,
      [req.user.id, request.id, req.user.tenantId]
    );
    await auditDiscount({
      req,
      request,
      action: 'DISCOUNT_APPROVED',
      oldStatus: 'PENDING',
      newStatus: 'APPROVED',
      extra: { approvedByUserId: req.user.id, approvedAt: new Date().toISOString() },
    });
    return res.json({ message: 'Discount approved; balance is unchanged until application' });
  }
);

router.patch(
  '/discount-requests/:id/reject',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.MANAGEMENT),
  async (req, res) => {
    const rejectionReason = String(req.body.rejectionReason || '').trim();
    if (!rejectionReason) return res.status(400).json({ error: 'Rejection reason is required' });
    const request = await loadRequest(req.params.id, req.user.tenantId);
    if (!request) return res.status(404).json({ error: 'Discount request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Only pending requests can be rejected' });
    await run(
      `UPDATE discount_requests
       SET status = 'REJECTED', rejected_by_user_id = ?, rejected_at = CURRENT_TIMESTAMP,
           rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ? AND status = 'PENDING'`,
      [req.user.id, rejectionReason, request.id, req.user.tenantId]
    );
    await auditDiscount({
      req,
      request,
      action: 'DISCOUNT_REJECTED',
      oldStatus: 'PENDING',
      newStatus: 'REJECTED',
      extra: { rejectedByUserId: req.user.id, rejectionReason },
    });
    return res.json({ message: 'Discount rejected' });
  }
);

router.patch(
  '/discount-requests/:id/cancel',
  authMiddleware,
  requireTenant,
  requireAnyRole(REQUEST_ROLES),
  async (req, res) => {
    const request = await loadRequest(req.params.id, req.user.tenantId);
    if (!request) return res.status(404).json({ error: 'Discount request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    const ownsRequest = String(value(request, 'requested_by_user_id', 'requestedByUserId')) === String(req.user.id);
    const isManager = ROLE_GROUPS.MANAGEMENT.includes(req.user.role);
    if (!ownsRequest && !isManager) return res.status(403).json({ error: 'Only the requester or management can cancel this request' });
    await run(
      `UPDATE discount_requests
       SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ? AND status = 'PENDING'`,
      [req.user.id, request.id, req.user.tenantId]
    );
    await auditDiscount({
      req,
      request,
      action: 'DISCOUNT_CANCELLED',
      oldStatus: 'PENDING',
      newStatus: 'CANCELLED',
      extra: { cancelledByUserId: req.user.id },
    });
    return res.json({ message: 'Discount request cancelled' });
  }
);

router.patch(
  '/discount-requests/:id/apply',
  authMiddleware,
  requireTenant,
  requireAnyRole(APPLY_ROLES),
  async (req, res) => {
    try {
      const result = await transaction(async () => {
        const request = await loadRequest(req.params.id, req.user.tenantId);
        if (!request) throw new Error('Discount request not found');
        if (request.status !== 'APPROVED') throw new Error('Only approved discounts can be applied');

        const plan = await get(
          `SELECT * FROM fee_plans WHERE id = ? AND tenant_id = ?`,
          [value(request, 'fee_invoice_id', 'feeInvoiceId'), req.user.tenantId]
        );
        if (!plan) throw new Error('Fee invoice not found');
        const paid = await get(
          `SELECT COALESCE(SUM(amount), 0) AS paidAmount
           FROM fee_payments
           WHERE fee_plan_id = ? AND tenant_id = ?
             AND COALESCE(status, 'Active') != 'Cancelled'`,
          [plan.id, req.user.tenantId]
        );
        const appliedAmount = request.discount_type === 'PERCENT'
          ? Math.round(Number(plan.totalAmount) * Number(request.discount_percent) / 100)
          : Number(request.discount_amount);
        const pendingBefore = Math.max(
          Number(plan.totalAmount) - Number(plan.discountAmount || 0) - Number(paid?.paidAmount || 0),
          0
        );
        if (appliedAmount <= 0 || appliedAmount > pendingBefore) {
          throw new Error('Approved discount exceeds the current pending balance');
        }

        const newDiscountAmount = Number(plan.discountAmount || 0) + appliedAmount;
        await run(
          `UPDATE fee_plans
           SET discountAmount = ?,
               discount_request_id = ?,
               net_payable_amount = ?,
               pending_balance = ?,
               discountType = ?,
               discountReason = ?,
               approvedBy = ?,
               discountApprovedDate = CURRENT_TIMESTAMP,
               discountProofNote = ?,
               updatedAt = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ?`,
          [
            newDiscountAmount,
            request.id,
            Number(plan.totalAmount) - newDiscountAmount,
            pendingBefore - appliedAmount,
            request.discount_type,
            request.reason,
            request.approvedBy || req.user.username,
            request.proof_note,
            plan.id,
            req.user.tenantId,
          ]
        );
        await run(
          `UPDATE discount_requests
           SET status = 'APPLIED', applied_by_user_id = ?, applied_at = CURRENT_TIMESTAMP,
               applied_amount = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ? AND status = 'APPROVED'`,
          [req.user.id, appliedAmount, request.id, req.user.tenantId]
        );
        await auditDiscount({
          req,
          request,
          action: 'DISCOUNT_APPLIED',
          oldStatus: 'APPROVED',
          newStatus: 'APPLIED',
          extra: {
            appliedByUserId: req.user.id,
            appliedAmount,
            discountAmount: newDiscountAmount,
            pendingBalance: pendingBefore - appliedAmount,
          },
        });
        return {
          appliedAmount,
          discountAmount: newDiscountAmount,
          pendingBalance: pendingBefore - appliedAmount,
        };
      });
      return res.json({ message: 'Approved discount applied to fee invoice', data: result });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  }
);

module.exports = router;
