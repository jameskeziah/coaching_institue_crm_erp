const fs = require('fs');
const path = require('path');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { get, all } = require('../services/db.service');
const {
  createStudentFeePlan,
  loadPlan,
  recordFeePayment,
  serializePlan,
} = require('../services/feeLedger.service');

const router = express.Router();

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    return {};
  }
}

router.post(
  '/students/:studentId/student-fee-plans',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    try {
      const plan = await createStudentFeePlan({
        tenantId: req.user.tenantId,
        studentId: req.params.studentId,
        leadId: req.body.leadId,
        feeStructureId: req.body.feeStructureId,
        admissionDate: req.body.admissionDate,
        discountAmount: req.body.discountAmount,
        actorUserId: req.user.id,
      });
      res.status(201).json({ message: 'Student fee plan created', data: plan });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  }
);

router.get(
  '/student-fee-plans',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const params = [req.user.tenantId];
    const conditions = ['p.tenant_id = ?'];
    if (req.query.studentId) {
      conditions.push('p.student_id = ?');
      params.push(req.query.studentId);
    }
    const rows = await all(
      `SELECT p.*, s.name AS studentName
       FROM student_fee_plans p
       LEFT JOIN students s
         ON CAST(s.id AS TEXT) = CAST(p.student_id AS TEXT)
        AND CAST(s.tenant_id AS TEXT) = CAST(p.tenant_id AS TEXT)
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC`,
      params
    );
    res.json({ data: rows.map((row) => serializePlan(row)) });
  }
);

router.get(
  '/student-fee-plans/:id',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const plan = await loadPlan(req.params.id, req.user.tenantId);
    if (!plan) return res.status(404).json({ error: 'Student fee plan not found' });
    return res.json({ data: plan });
  }
);

router.post(
  '/student-fee-plans/:id/payments',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    try {
      const result = await recordFeePayment({
        tenantId: req.user.tenantId,
        studentFeePlanId: req.params.id,
        studentFeeInstallmentId: req.body.studentFeeInstallmentId || null,
        amount: req.body.amount,
        paymentMode: req.body.paymentMode || 'CASH',
        actorUserId: req.user.id,
      });
      res.status(201).json({ message: 'Payment recorded', data: result });
    } catch (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  }
);

router.get(
  '/fee-receipts/:id/pdf',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const receipt = await get(
      `SELECT pdf_path
       FROM fee_receipts
       WHERE id = ?
       AND tenant_id = ?`,
      [req.params.id, req.user.tenantId]
    );
    if (!receipt?.pdf_path && !receipt?.pdfPath) {
      return res.status(404).json({ error: 'Receipt PDF not found' });
    }
    const filePath = path.resolve(receipt.pdf_path || receipt.pdfPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Receipt PDF file is missing' });
    }
    return res.sendFile(filePath);
  }
);

router.get(
  '/reports/fee-defaulters-aging',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const rows = await all(
      `SELECT
         i.id AS installmentId,
         i.title,
         i.amount,
         i.paid_amount AS paidAmount,
         i.pending_amount AS pendingAmount,
         i.due_date AS dueDate,
         p.id AS feePlanId,
         p.course_name AS courseName,
         s.id AS studentId,
         s.name AS studentName,
         s.data AS studentData
       FROM student_fee_installments i
       JOIN student_fee_plans p
         ON p.id = i.student_fee_plan_id
        AND p.tenant_id = i.tenant_id
       JOIN students s
         ON CAST(s.id AS TEXT) = CAST(p.student_id AS TEXT)
        AND CAST(s.tenant_id AS TEXT) = CAST(p.tenant_id AS TEXT)
       WHERE i.tenant_id = ?
         AND i.pending_amount > 0
         AND i.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
       ORDER BY i.due_date ASC`,
      [req.user.tenantId]
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = {
      dueToday: [],
      overdue1To7: [],
      overdue8To15: [],
      overdue16To30: [],
      overdue30Plus: [],
    };

    for (const row of rows) {
      const studentData = parseJson(row.studentData);
      const branchId = studentData.branchId || studentData.branch_id || studentData.branch;
      if (req.query.branchId && String(branchId || '') !== String(req.query.branchId)) continue;
      const dueDate = new Date(row.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      const item = {
        ...row,
        parentPhone: studentData.parentPhone || studentData.parent_phone || studentData.mobileNumber || null,
        branchId: branchId || null,
        overdueDays,
      };
      delete item.studentData;

      if (overdueDays === 0) buckets.dueToday.push(item);
      else if (overdueDays >= 1 && overdueDays <= 7) buckets.overdue1To7.push(item);
      else if (overdueDays >= 8 && overdueDays <= 15) buckets.overdue8To15.push(item);
      else if (overdueDays >= 16 && overdueDays <= 30) buckets.overdue16To30.push(item);
      else if (overdueDays > 30) buckets.overdue30Plus.push(item);
    }

    const summary = Object.fromEntries(
      Object.entries(buckets).map(([key, items]) => [
        key,
        {
          count: items.length,
          pendingAmount: items.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0),
        },
      ])
    );
    res.json({ data: { summary, buckets } });
  }
);

module.exports = router;
