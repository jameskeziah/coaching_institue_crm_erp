const crypto = require('crypto');

const { run, get, all, transaction } = require('./db.service');
const { generateInstallmentSchedule } = require('./installmentSchedule.service');
const { ensureTenantFeeSettings } = require('./tenantFeeSettings.service');
const { generateReceiptPdf } = require('./receiptPdf.service');
const { createAuditLog } = require('./auditLog.service');
const { FeeInstallmentStatus } = require('../config/feeflow.constants');

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function parseStudentData(row) {
  try {
    return row?.data ? JSON.parse(row.data) : {};
  } catch (err) {
    return {};
  }
}

function serializeInstallment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    studentFeePlanId: row.student_fee_plan_id ?? row.studentFeePlanId,
    installmentNumber: Number(row.installment_number ?? row.installmentNumber),
    title: row.title,
    amount: asNumber(row.amount),
    paidAmount: asNumber(row.paid_amount ?? row.paidAmount),
    pendingAmount: asNumber(row.pending_amount ?? row.pendingAmount),
    dueDate: row.due_date ?? row.dueDate,
    status: row.status,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function serializePlan(row, installments = []) {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    studentId: row.student_id ?? row.studentId,
    leadId: row.lead_id ?? row.leadId,
    feeStructureId: row.fee_structure_id ?? row.feeStructureId,
    courseName: row.course_name ?? row.courseName,
    academicYear: row.academic_year ?? row.academicYear,
    totalAmount: asNumber(row.total_amount ?? row.totalAmount),
    discountAmount: asNumber(row.discount_amount ?? row.discountAmount),
    payableAmount: asNumber(row.payable_amount ?? row.payableAmount),
    paidAmount: asNumber(row.paid_amount ?? row.paidAmount),
    pendingAmount: asNumber(row.pending_amount ?? row.pendingAmount),
    status: row.status,
    studentName: row.studentName || row.student_name || row.name,
    installments,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

async function generateReceiptNumber({ tenantId }) {
  await ensureTenantFeeSettings(tenantId);
  await run(
    `UPDATE tenant_fee_settings
     SET next_receipt_number = next_receipt_number + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const settings = await get(
    `SELECT receipt_prefix, next_receipt_number
     FROM tenant_fee_settings
     WHERE tenant_id = ?`,
    [tenantId]
  );
  const prefix = settings.receipt_prefix || settings.receiptPrefix || 'RCPT';
  const number = Number(settings.next_receipt_number ?? settings.nextReceiptNumber ?? 2) - 1;
  return `${prefix}-${String(number).padStart(5, '0')}`;
}

async function loadPlan(planId, tenantId) {
  const plan = await get(
    `SELECT p.*, s.name AS studentName
     FROM student_fee_plans p
     LEFT JOIN students s
       ON CAST(s.id AS TEXT) = CAST(p.student_id AS TEXT)
      AND CAST(s.tenant_id AS TEXT) = CAST(p.tenant_id AS TEXT)
     WHERE p.id = ?
     AND p.tenant_id = ?`,
    [planId, tenantId]
  );
  if (!plan) return null;
  const installments = await all(
    `SELECT *
     FROM student_fee_installments
     WHERE student_fee_plan_id = ?
     AND tenant_id = ?
     ORDER BY installment_number`,
    [planId, tenantId]
  );
  return serializePlan(plan, installments.map(serializeInstallment));
}

async function createStudentFeePlan({
  tenantId,
  studentId,
  leadId = null,
  feeStructureId,
  admissionDate,
  discountAmount = 0,
  actorUserId = null,
}) {
  return transaction(async () => {
    const student = await get(`SELECT * FROM students WHERE id = ? AND tenant_id = ?`, [studentId, tenantId]);
    if (!student) throw new Error('Student not found');

    const settings = await ensureTenantFeeSettings(tenantId);
    const structure = await get(
      `SELECT *
       FROM fee_structures
       WHERE id = ?
       AND tenant_id = ?
       AND is_active = 1`,
      [feeStructureId, tenantId]
    );
    if (!structure) throw new Error('Active fee structure not found');

    const totalAmount = asNumber(structure.total_amount ?? structure.totalAmount ?? structure.feeAmount);
    const cleanDiscount = asNumber(discountAmount);
    if (cleanDiscount < 0 || cleanDiscount > totalAmount) throw new Error('Discount amount is invalid');
    const payableAmount = totalAmount - cleanDiscount;
    const planId = crypto.randomUUID();
    const academicYear = structure.academic_year || settings.academic_year || '2026-27';
    const courseName = structure.name || structure.courseName;

    await run(
      `INSERT INTO student_fee_plans
        (id, tenant_id, student_id, lead_id, fee_structure_id, course_name, academic_year,
         total_amount, discount_amount, payable_amount, paid_amount, pending_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        planId,
        tenantId,
        String(studentId),
        leadId,
        String(feeStructureId),
        courseName,
        academicYear,
        totalAmount,
        cleanDiscount,
        payableAmount,
        payableAmount,
      ]
    );

    const templateRows = await all(
      `SELECT *
       FROM fee_structure_installments
       WHERE fee_structure_id = ?
       AND tenant_id = ?
       ORDER BY installment_number`,
      [feeStructureId, tenantId]
    );

    let schedule;
    if (templateRows.length) {
      const start = admissionDate ? new Date(admissionDate) : new Date();
      schedule = templateRows.map((template, index) => {
        const dueDate = new Date(start);
        dueDate.setDate(start.getDate() + Number(template.due_after_days ?? template.dueAfterDays ?? 0));
        const proportionalAmount = Math.round((asNumber(template.amount) / totalAmount) * payableAmount);
        return {
          installmentNumber: Number(template.installment_number ?? template.installmentNumber ?? index + 1),
          title: template.title || `Installment ${index + 1}`,
          amount: proportionalAmount,
          dueDate: dueDate.toISOString(),
          status: FeeInstallmentStatus.PENDING,
        };
      });
      const diff = payableAmount - schedule.reduce((sum, item) => sum + item.amount, 0);
      if (schedule.length && diff !== 0) schedule[schedule.length - 1].amount += diff;
    } else {
      schedule = generateInstallmentSchedule({
        totalAmount: payableAmount,
        installmentCount: settings.default_installment_count || 3,
        admissionDate,
        gapDays: settings.default_installment_gap_days || 30,
      });
    }

    for (const item of schedule) {
      await run(
        `INSERT INTO student_fee_installments
          (id, tenant_id, student_fee_plan_id, installment_number, title, amount, paid_amount,
           pending_amount, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          tenantId,
          planId,
          item.installmentNumber,
          item.title,
          item.amount,
          item.amount,
          item.dueDate,
          item.status,
        ]
      );
    }

    await createAuditLog({
      tenantId,
      actorUserId,
      action: 'STUDENT_FEE_PLAN_CREATED',
      entityType: 'STUDENT_FEE_PLAN',
      entityId: planId,
      metadata: { studentId, feeStructureId, payableAmount },
    });

    return loadPlan(planId, tenantId);
  });
}

async function recordFeePayment({
  tenantId,
  studentFeePlanId,
  studentFeeInstallmentId = null,
  amount,
  paymentMode = 'CASH',
  razorpayPaymentId = null,
  razorpayPaymentLinkId = null,
  actorUserId = null,
}) {
  return transaction(async () => {
    const cleanAmount = asNumber(amount);
    if (cleanAmount <= 0) throw new Error('Payment amount must be greater than 0');
    if (razorpayPaymentId || razorpayPaymentLinkId) {
      const existingPayment = await get(
        `SELECT id
         FROM fee_payments
         WHERE (razorpay_payment_id = ? AND ? IS NOT NULL)
            OR (razorpay_payment_link_id = ? AND ? IS NOT NULL)
         LIMIT 1`,
        [
          razorpayPaymentId,
          razorpayPaymentId,
          razorpayPaymentLinkId,
          razorpayPaymentLinkId,
        ]
      );
      if (existingPayment) {
        return {
          paymentId: existingPayment.id,
          duplicate: true,
          plan: await loadPlan(studentFeePlanId, tenantId),
        };
      }
    }

    const plan = await get(
      `SELECT p.*, s.name AS studentName, s.data AS studentData
       FROM student_fee_plans p
       LEFT JOIN students s
         ON CAST(s.id AS TEXT) = CAST(p.student_id AS TEXT)
        AND CAST(s.tenant_id AS TEXT) = CAST(p.tenant_id AS TEXT)
       WHERE p.id = ?
       AND p.tenant_id = ?`,
      [studentFeePlanId, tenantId]
    );
    if (!plan) throw new Error('Student fee plan not found');
    if (cleanAmount > asNumber(plan.pending_amount)) throw new Error('Payment amount exceeds pending balance');

    let installment = null;
    if (studentFeeInstallmentId) {
      installment = await get(
        `SELECT *
         FROM student_fee_installments
         WHERE id = ?
         AND tenant_id = ?
         AND student_fee_plan_id = ?`,
        [studentFeeInstallmentId, tenantId, studentFeePlanId]
      );
      if (!installment) throw new Error('Installment not found');
      if (cleanAmount > asNumber(installment.pending_amount)) throw new Error('Payment amount exceeds installment pending balance');
    }

    const paymentId = crypto.randomUUID();
    const paymentResult = await run(
      `INSERT INTO fee_payments
        (tenant_id, student_id, student_fee_plan_id, student_fee_installment_id, amount, payment_mode,
         paymentDate, paymentMethod, razorpay_payment_id, razorpay_payment_link_id,
         status, paid_at, created_at, updated_at, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'CAPTURED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        tenantId,
        plan.student_id,
        studentFeePlanId,
        studentFeeInstallmentId,
        cleanAmount,
        paymentMode,
        paymentMode,
        razorpayPaymentId,
        razorpayPaymentLinkId,
      ]
    );
    const localPaymentId = paymentResult.lastID || paymentId;

    if (installment) {
      await run(
        `UPDATE student_fee_installments
         SET paid_amount = paid_amount + ?,
             pending_amount = pending_amount - ?,
             status = CASE WHEN pending_amount - ? <= 0 THEN 'PAID' ELSE 'PARTIAL' END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         AND tenant_id = ?`,
        [cleanAmount, cleanAmount, cleanAmount, studentFeeInstallmentId, tenantId]
      );
    }

    await run(
      `UPDATE student_fee_plans
       SET paid_amount = paid_amount + ?,
           pending_amount = pending_amount - ?,
           status = CASE WHEN pending_amount - ? <= 0 THEN 'PAID' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?`,
      [cleanAmount, cleanAmount, cleanAmount, studentFeePlanId, tenantId]
    );

    const updatedPlan = await get(
      `SELECT p.*, s.name AS studentName, s.data AS studentData
       FROM student_fee_plans p
       LEFT JOIN students s
         ON CAST(s.id AS TEXT) = CAST(p.student_id AS TEXT)
        AND CAST(s.tenant_id AS TEXT) = CAST(p.tenant_id AS TEXT)
       WHERE p.id = ?
       AND p.tenant_id = ?`,
      [studentFeePlanId, tenantId]
    );
    const settings = await ensureTenantFeeSettings(tenantId);
    const receiptNumber = await generateReceiptNumber({ tenantId });
    const studentData = parseStudentData(updatedPlan);
    const receipt = {
      receiptNumber,
      studentName: updatedPlan.studentName || studentData.studentName || 'Student',
      courseName: updatedPlan.course_name,
      amountPaid: cleanAmount,
      paymentMode,
      pendingBalance: asNumber(updatedPlan.pending_amount),
      branchName: studentData.branchName || studentData.branch || null,
      receiptDate: new Date().toISOString(),
      receiptFooterNote: settings.receipt_footer_note,
      authorizedSignatureUrl: settings.authorized_signature_url,
    };
    const pdfPath = await generateReceiptPdf({ receipt });
    const receiptId = crypto.randomUUID();

    const receiptResult = await run(
      `INSERT INTO fee_receipts
        (payment_id, tenant_id, receipt_number, receiptNumber, student_name, course_name,
         amount_paid, payment_mode, pending_balance, branch_name, receipt_date, pdf_path,
         pdfUrl, receiptType, issuedAt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Backend PDF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        localPaymentId,
        tenantId,
        receiptNumber,
        receiptNumber,
        receipt.studentName,
        receipt.courseName,
        receipt.amountPaid,
        receipt.paymentMode,
        receipt.pendingBalance,
        receipt.branchName,
        receipt.receiptDate,
        pdfPath,
        pdfPath,
      ]
    );

    await createAuditLog({
      tenantId,
      actorUserId,
      action: 'FEE_PAYMENT_RECORDED',
      entityType: 'FEE_PAYMENT',
      entityId: String(localPaymentId),
      metadata: { studentFeePlanId, studentFeeInstallmentId, amount: cleanAmount, receiptNumber },
    });

    return {
      paymentId: localPaymentId,
      receipt: { id: receiptResult.lastID || receiptId, ...receipt, pdfPath },
      plan: await loadPlan(studentFeePlanId, tenantId),
    };
  });
}

module.exports = {
  createStudentFeePlan,
  generateReceiptNumber,
  loadPlan,
  recordFeePayment,
  serializeInstallment,
  serializePlan,
};
