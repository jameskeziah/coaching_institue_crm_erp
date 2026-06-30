const { get, all } = require('./db.service');

function valueAt(context, source) {
  return String(source || '').split('.').reduce((value, key) => value?.[key], context);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN');
}

async function buildContext({ tenantId, request }) {
  const context = {};
  context.tenant = await get(`SELECT id, name FROM tenants WHERE id = ?`, [tenantId]) || {};
  if (request.studentId) {
    context.student = await get(
      `SELECT *, COALESCE(display_name, student_name, name) AS "displayName"
       FROM students WHERE tenant_id = ? AND id = ?`,
      [tenantId, request.studentId]
    ) || {};
    const guardians = await all(
      `SELECT * FROM student_guardians WHERE tenant_id = ? AND student_id = ? ORDER BY is_primary DESC, name`,
      [String(tenantId), String(request.studentId)]
    );
    context.guardian = request.guardianId ? guardians.find((row) => String(row.id) === String(request.guardianId)) : guardians[0];
  }
  if (request.attendanceSessionId) {
    context.attendanceSession = await get(`SELECT *, COALESCE(session_date, date) AS "sessionDate" FROM attendance_sessions WHERE tenant_id = ? AND id = ?`, [tenantId, request.attendanceSessionId]) || {};
    context.batch = await get(`SELECT * FROM batches WHERE tenant_id = ? AND id = ?`, [tenantId, context.attendanceSession.batch_id]) || {};
    context.subject = await get(`SELECT * FROM subjects WHERE tenant_id = ? AND id = ?`, [tenantId, context.attendanceSession.subject_id]) || { name: context.attendanceSession.subject };
    context.branch = await get(`SELECT * FROM branches WHERE tenant_id = ? AND id = ?`, [tenantId, context.attendanceSession.branch_id || context.batch.branch_id]) || {};
  }
  if (request.feeInstallmentId) {
    let installment = await get(`SELECT * FROM student_fee_installments WHERE tenant_id = ? AND id = ?`, [String(tenantId), request.feeInstallmentId]);
    if (installment) {
      const plan = await get(`SELECT * FROM student_fee_plans WHERE tenant_id = ? AND id = ?`, [String(tenantId), installment.student_fee_plan_id]);
      context.installment = {
        ...installment,
        amountDue: Number(installment.pending_amount || installment.amount || 0),
        dueDate: formatDate(installment.due_date),
        daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(installment.due_date).getTime()) / 86400000)),
      };
      context.course = { name: plan?.course_name };
      context.student ||= await get(`SELECT *, COALESCE(display_name, student_name, name) AS "displayName" FROM students WHERE tenant_id = ? AND id = ?`, [tenantId, plan?.student_id]) || {};
      context.paymentLink = await get(`SELECT razorpay_short_url AS url FROM fee_payment_links WHERE tenant_id = ? AND student_fee_installment_id = ? ORDER BY created_at DESC LIMIT 1`, [String(tenantId), installment.id]) || { url: 'Contact branch for payment link' };
    } else {
      installment = await get(
        `SELECT i.*, p.student_id, p.courseProgram, p.feeCategory
         FROM fee_installments i JOIN fee_plans p ON p.id = i.fee_plan_id
         WHERE p.tenant_id = ? AND i.id = ?`,
        [tenantId, request.feeInstallmentId]
      );
      if (installment) {
        context.installment = {
          ...installment,
          amountDue: Number(installment.amount || 0),
          dueDate: formatDate(installment.dueDate),
          daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(installment.dueDate).getTime()) / 86400000)),
        };
        context.course = { name: installment.courseProgram || installment.feeCategory };
        context.student ||= await get(`SELECT *, COALESCE(display_name, student_name, name) AS "displayName" FROM students WHERE tenant_id = ? AND id = ?`, [tenantId, installment.student_id]) || {};
        context.paymentLink = { url: 'Contact branch for payment link' };
      }
    }
  }
  if (request.paymentId) {
    context.payment = await get(`SELECT *, COALESCE(paid_at, paymentDate, created_at, createdAt) AS date FROM fee_payments WHERE tenant_id = ? AND id = ?`, [tenantId, request.paymentId]) || {};
    context.receipt = await get(`SELECT COALESCE(receipt_number, receiptNumber) AS number, COALESCE(pdf_path, pdfUrl) AS url FROM fee_receipts WHERE payment_id = ? ORDER BY COALESCE(created_at, issuedAt) DESC LIMIT 1`, [request.paymentId]) || {};
    context.student ||= await get(`SELECT *, COALESCE(display_name, student_name, name) AS "displayName" FROM students WHERE tenant_id = ? AND id = ?`, [tenantId, context.payment.student_id]) || {};
    context.payment.pendingBalance = request.pendingBalance ?? 0;
  }
  if (request.testResultId) {
    context.testResult = await get(`SELECT * FROM student_test_results WHERE tenant_id = ? AND id = ?`, [tenantId, request.testResultId])
      || await get(`SELECT * FROM performance_results WHERE tenant_id = ? AND id = ?`, [tenantId, request.testResultId]) || {};
    context.test = await get(`SELECT * FROM test_calendars WHERE tenant_id = ? AND id = ?`, [tenantId, context.testResult.test_id])
      || await get(`SELECT * FROM performance_tests WHERE tenant_id = ? AND id = ?`, [tenantId, context.testResult.test_id]) || {};
    context.test.name = context.test.testName;
    context.subject = { name: context.testResult.subject || context.test.subject };
    context.student ||= await get(`SELECT *, COALESCE(display_name, student_name, name) AS "displayName" FROM students WHERE tenant_id = ? AND id = ?`, [tenantId, context.testResult.student_id]) || {};
    context.testResult.percentage = context.testResult.percentage ?? (Number(context.testResult.totalMarks || 0) ? Math.round(Number(context.testResult.marksObtained || 0) / Number(context.testResult.totalMarks) * 100) : 0);
    context.testResult.rank = context.testResult.overallRank || context.testResult.testRank || context.testResult.batchRank || '-';
  }
  if (request.weeklyReport) context.weeklyReport = request.weeklyReport;
  if (request.admissionId || request.leadId) {
    const leadId = request.admissionId || request.leadId;
    context.lead = await get(`SELECT *, COALESCE(student_name, name) AS "studentName" FROM admissions WHERE tenant_id = ? AND id = ?`, [tenantId, leadId]) || {};
    context.branch = await get(`SELECT * FROM branches WHERE tenant_id = ? AND id = ?`, [tenantId, context.lead.branch_id]) || {};
    context.course = { name: context.lead.course_interested || context.lead.program };
    context.counsellor = { name: request.counsellorName || context.lead.counsellor_id || 'Counsellor' };
    context.followup = { date: formatDate(request.followupDate || context.lead.next_follow_up_at) };
  }
  if (!context.branch && context.student?.branch_id) context.branch = await get(`SELECT * FROM branches WHERE tenant_id = ? AND id = ?`, [tenantId, context.student.branch_id]) || {};
  return context;
}

async function resolveTemplateVariables({ tenantId, template, request }) {
  const schema = typeof template.variable_schema === 'string' ? JSON.parse(template.variable_schema || '[]') : template.variable_schema || [];
  const context = await buildContext({ tenantId, request });
  const resolved = schema.sort((a, b) => a.position - b.position).map((variable) => {
    let value = valueAt(context, variable.source);
    if (variable.name.includes('date') && value) value = formatDate(value);
    return { ...variable, value: value === undefined || value === null ? '' : String(value) };
  });
  const missing = resolved.filter((variable) => variable.required && !variable.value);
  let preview = template.body_text;
  resolved.forEach((variable) => { preview = preview.replaceAll(`{{${variable.position}}}`, variable.value || `[missing:${variable.name}]`); });
  return {
    context,
    recipientPhone: context.guardian?.phone || context.student?.parent_phone || context.lead?.parent_phone || context.lead?.parentPhone || context.lead?.mobile_number || context.lead?.mobileNumber || '',
    guardianId: context.guardian?.id || request.guardianId || null,
    resolved,
    missing,
    preview,
  };
}

module.exports = { resolveTemplateVariables };
