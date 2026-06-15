import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CalendarClock, Copy, CreditCard, FileText, MessageCircle, Pencil, PhoneCall, Plus, Save, Trash2, X } from 'lucide-react';
import {
  createFollowUp,
  createFeePayment,
  createFeePlan,
  deleteFeePayment,
  deleteFeePlan,
  fetchFeeAuditLogs,
  fetchFeePayments,
  fetchFeePlans,
  fetchFeeReminders,
  fetchFeeReports,
  fetchFeeStructures,
  fetchMessageTemplates,
  fetchStudents,
  fetchWhatsAppStatus,
  markFeeReminderSent,
  runFeeReminderAutomation,
  sendWhatsAppTest,
  updateMessageTemplate,
  updateFeePlan,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const defaultCoursePrograms = [
  { label: 'Foundation 6th-10th Full-Time', amount: 48000, paymentType: 'Installment' },
  { label: 'Foundation only - Classes 6, 7, 8, 9, 10', amount: 18000, paymentType: 'Installment' },
  { label: 'JEE / NEET', amount: 60000, paymentType: 'Installment' },
  { label: 'AI / Data Science - 6 months', amount: 24000, paymentType: 'Course-wise' },
  { label: 'AI / Data Science - 12 months', amount: 38000, paymentType: 'Course-wise' },
];
const paymentTypes = ['One-Time', 'Installment', 'Monthly', 'Course-wise'];
const feeCategories = ['Tuition', 'Admission Fee', 'Exam Fee', 'Material Fee', 'Lab Fee', 'Transport', 'Other'];
const discountTypes = ['', 'Scholarship Discount', 'Sibling Discount', 'Early Admission Discount', 'Management Discount', 'Special Case Discount'];
const paymentMethods = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Razorpay', 'Partial Payment'];
const installmentStatuses = ['Pending', 'Paid', 'Overdue'];
const feeStatuses = ['', 'Not Started', 'Partially Paid', 'Fully Paid', 'Overdue', 'Scholarship', 'Free Student', 'Refund Pending', 'Cancelled Admission'];
const receiptTypes = ['Normal Receipt', 'Non-GST Receipt', 'GST Invoice', 'Hostel / Mess Receipt'];
const componentNames = ['Tuition Fee', 'Admission Fee', 'Test Series Fee', 'Study Material Fee', 'Lab Fee', 'Hostel Fee', 'Mess Fee', 'Transport Fee'];

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function reminderMessageForPlan(item) {
  return `Dear Parent,\nThis is a reminder that ${money(item.amount)} fee payment for ${item.studentName} (${item.course}) is due on ${item.dueDate || 'today'}.\nKindly clear the pending amount or contact the institute office.\nProTrack Kaizen, Miraku Education Foundation.`;
}

function whatsappLink(item) {
  const phone = normalizePhone(item.parentPhone);
  const text = encodeURIComponent(item.message || reminderMessageForPlan(item));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

function defaultComponents() {
  return componentNames.map((componentName) => ({ componentName, amount: '' }));
}

function defaultInstallments() {
  return [{ label: '1st Installment', amount: '', dueDate: today(), status: 'Pending' }];
}

function defaultPlanForm() {
  return {
    student_id: '',
    courseProgram: '',
    feeCategory: 'Tuition',
    paymentType: 'Installment',
    totalAmount: '',
    discountAmount: '0',
    discountType: '',
    discountReason: '',
    approvedBy: '',
    discountApprovedDate: today(),
    discountProofNote: '',
    feeStatus: '',
    dueDate: today(),
    installmentLabel: 'Installment 1',
    notes: '',
    components: defaultComponents(),
    installments: defaultInstallments(),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function Fees() {
  const { permissions } = useAuth();
  const { canDelete, canEditFinance } = permissions;
  const [students, setStudents] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [reports, setReports] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [planForm, setPlanForm] = useState(defaultPlanForm);
  const [paymentForm, setPaymentForm] = useState({
    fee_plan_id: '',
    amount: '',
    paymentDate: today(),
    paymentMethod: 'Cash',
    receiptType: 'Non-GST Receipt',
    transactionId: '',
    receivedBy: '',
    notes: '',
  });
  const [followUpNotes, setFollowUpNotes] = useState({});
  const [promiseDates, setPromiseDates] = useState({});
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationResult, setAutomationResult] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [testMessage, setTestMessage] = useState({
    phone: '',
    message: 'Test WhatsApp message from ProTrack Kaizen fee reminder system.',
  });
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({});

  async function load() {
    setError('');
    try {
      const [studentRows, planRows, paymentRows, reportRows, reminderRows, auditRows, whatsappRows, templateRows] = await Promise.all([
        fetchStudents(),
        fetchFeePlans(),
        fetchFeePayments(),
        fetchFeeReports(),
        fetchFeeReminders(),
        fetchFeeAuditLogs(),
        fetchWhatsAppStatus().catch(() => null),
        fetchMessageTemplates().catch(() => []),
      ]);
      const structureRows = await fetchFeeStructures().catch(() => []);
      setStudents(studentRows);
      setPlans(planRows);
      setPayments(paymentRows);
      setFeeStructures(structureRows);
      setReports(reportRows);
      setReminders(reminderRows);
      setAuditLogs(auditRows);
      setWhatsappStatus(whatsappRows);
      setMessageTemplates(templateRows);
      const nextPlan = planRows.find((plan) => String(plan.id) === String(selectedPlanId)) || planRows[0];
      if (nextPlan) {
        setSelectedPlanId(String(nextPlan.id));
        setPaymentForm((current) => ({ ...current, fee_plan_id: String(nextPlan.id) }));
      }
    } catch (err) {
      setError(err.error || 'Could not load fee data');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPlan = plans.find((plan) => String(plan.id) === String(selectedPlanId));
  const coursePrograms = feeStructures.length
    ? feeStructures.filter((item) => item.status !== 'Inactive').map((item) => ({ label: item.courseName, amount: item.feeAmount, paymentType: item.paymentType || 'Installment', billingCycle: item.billingCycle, duration: item.duration, classRange: item.classRange }))
    : defaultCoursePrograms;
  const selectedPayments = payments.filter((payment) => String(payment.planId || payment.fee_plan_id) === String(selectedPlanId));
  const componentTotal = planForm.components.reduce((sum, component) => sum + Number(component.amount || 0), 0);
  const formTotal = componentTotal || Number(planForm.totalAmount || 0);
  const formNet = Math.max(0, formTotal - Number(planForm.discountAmount || 0));

  const totals = useMemo(() => {
    return plans.reduce(
      (acc, plan) => {
        acc.netFees += Number(plan.netAmount || 0);
        acc.collected += Number(plan.paidAmount || 0);
        acc.pending += Number(plan.dueAmount || 0);
        if (Number(plan.dueAmount || 0) > 0 && plan.nextDueDate && plan.nextDueDate < today()) {
          acc.overdue += Number(plan.dueAmount || 0);
        }
        return acc;
      },
      { netFees: 0, collected: 0, pending: 0, overdue: 0 }
    );
  }, [plans]);

  const collections = useMemo(() => {
    const todayDate = today();
    const nextWeek = addDays(todayDate, 7);
    const phoneByStudentId = students.reduce((acc, student) => {
      acc[String(student.id)] = student.data?.primaryPhone || student.data?.whatsapp || student.data?.parentMobile || student.data?.fatherPhone || student.data?.motherPhone || '';
      return acc;
    }, {});

    const todayCollection = payments
      .filter((payment) => payment.paymentDate === todayDate)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const queue = [];
    plans.forEach((plan) => {
      if (Number(plan.dueAmount || 0) <= 0) return;
      const base = {
        studentId: plan.student_id || plan.studentId,
        studentName: plan.studentName,
        course: plan.courseProgram || plan.feeCategory,
        feePlanId: plan.id,
        parentPhone: phoneByStudentId[String(plan.student_id || plan.studentId)] || '',
        paidAmount: Number(plan.paidAmount || 0),
        dueAmount: Number(plan.dueAmount || 0),
        feeStatus: plan.feeStatus,
      };
      const installments = plan.installments?.length ? plan.installments : [{ id: null, label: plan.installmentLabel || 'Fee Due', amount: plan.dueAmount, dueDate: plan.nextDueDate, status: plan.feeStatus }];
      installments.forEach((installment) => {
        if (String(installment.status || '').toLowerCase() === 'paid') return;
        const dueDate = installment.dueDate || plan.nextDueDate || todayDate;
        const amount = Number(installment.amount || plan.dueAmount || 0);
        let riskType = '';
        if (dueDate < todayDate) riskType = 'Overdue';
        else if (dueDate <= nextWeek) riskType = 'Due Next 7 Days';
        else if (base.paidAmount > 0 && base.dueAmount > 0) riskType = 'Partially Paid';
        else if (base.paidAmount <= 0) riskType = 'No Payment';
        if (!riskType) return;
        queue.push({
          ...base,
          installmentId: installment.id || null,
          installmentLabel: installment.label || 'Fee Due',
          amount,
          dueDate,
          riskType,
          reminderType: riskType,
          message: reminderMessageForPlan({ ...base, amount, dueDate }),
        });
      });
    });

    const next7Expected = queue
      .filter((item) => item.dueDate >= todayDate && item.dueDate <= nextWeek)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const overdueStudents = new Set(queue.filter((item) => item.riskType === 'Overdue').map((item) => item.studentId || item.studentName)).size;
    const highPending = [...queue].sort((a, b) => b.dueAmount - a.dueAmount);
    const repeatedLate = queue.filter((item) => item.riskType === 'Overdue' && item.paidAmount > 0);

    return { todayCollection, next7Expected, overdueStudents, queue, highPending, repeatedLate };
  }, [payments, plans, students]);

  function setComponent(index, key, value) {
    const components = planForm.components.map((component, itemIndex) => (
      itemIndex === index ? { ...component, [key]: value } : component
    ));
    setPlanForm({ ...planForm, components });
  }

  function setInstallment(index, key, value) {
    const installments = planForm.installments.map((installment, itemIndex) => (
      itemIndex === index ? { ...installment, [key]: value } : installment
    ));
    const firstDueDate = installments.find((item) => item.dueDate)?.dueDate || planForm.dueDate;
    setPlanForm({ ...planForm, installments, dueDate: firstDueDate });
  }

  function addInstallment() {
    setPlanForm({
      ...planForm,
      installments: [
        ...planForm.installments,
        { label: `${planForm.installments.length + 1} Installment`, amount: '', dueDate: today(), status: 'Pending' },
      ],
    });
  }

  function removeInstallment(index) {
    const installments = planForm.installments.filter((_, itemIndex) => itemIndex !== index);
    setPlanForm({ ...planForm, installments: installments.length ? installments : defaultInstallments() });
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanForm(defaultPlanForm());
  }

  function startEditPlan(plan) {
    setEditingPlanId(plan.id);
    setSelectedPlanId(String(plan.id));
    setPlanForm({
      student_id: plan.student_id || plan.studentId || '',
      courseProgram: plan.courseProgram || plan.feeCategory || '',
      feeCategory: plan.feeCategory || 'Tuition',
      paymentType: plan.paymentType || 'Installment',
      totalAmount: String(plan.totalAmount || ''),
      discountAmount: String(plan.discountAmount || 0),
      discountType: plan.discountType || '',
      discountReason: plan.discountReason || '',
      approvedBy: plan.approvedBy || '',
      discountApprovedDate: plan.discountApprovedDate || today(),
      discountProofNote: plan.discountProofNote || '',
      feeStatus: plan.feeStatus || '',
      dueDate: plan.dueDate || today(),
      installmentLabel: plan.installmentLabel || 'Installment 1',
      notes: plan.notes || '',
      components: plan.components?.length ? plan.components.map((item) => ({ componentName: item.componentName, amount: String(item.amount || '') })) : defaultComponents(),
      installments: plan.installments?.length ? plan.installments.map((item) => ({ label: item.label, amount: String(item.amount || ''), dueDate: item.dueDate || today(), status: item.status || 'Pending' })) : defaultInstallments(),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildPlanPayload() {
    return {
      ...planForm,
      totalAmount: formTotal,
      components: planForm.components.filter((component) => component.componentName && Number(component.amount || 0) > 0),
      installments: planForm.installments.filter((installment) => installment.label && Number(installment.amount || 0) > 0),
    };
  }

  async function handleSavePlan(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const payload = buildPlanPayload();
      const saved = editingPlanId ? await updateFeePlan(editingPlanId, payload) : await createFeePlan(payload);
      setMessage(editingPlanId ? 'Fee plan updated.' : 'Fee plan created.');
      resetPlanForm();
      await load();
      setSelectedPlanId(String(saved.id));
      setPaymentForm((current) => ({ ...current, fee_plan_id: String(saved.id), amount: String(saved.dueAmount || '') }));
    } catch (err) {
      setError(err.error || 'Could not save fee plan');
    }
  }

  async function handleCreatePayment(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const payment = await createFeePayment(paymentForm);
      setReceipt(payment);
      setMessage(`Payment saved. Receipt ${payment.receiptNumber} generated.`);
      setPaymentForm((current) => ({
        ...current,
        amount: '',
        paymentDate: today(),
        transactionId: '',
        notes: '',
      }));
      await load();
    } catch (err) {
      setError(err.error || 'Could not save payment');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError('');
    setMessage('');
    try {
      if (deleteTarget.type === 'plan') {
        await deleteFeePlan(deleteTarget.id);
        setMessage('Fee plan deleted.');
        resetPlanForm();
      } else {
        await deleteFeePayment(deleteTarget.id);
        setMessage('Payment deleted.');
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err.error || 'Delete failed');
    }
  }

  async function handleMarkReminderSent(reminder, sentVia = 'WhatsApp') {
    setMessage('');
    setError('');
    try {
      await markFeeReminderSent({
        student_id: reminder.studentId,
        fee_plan_id: reminder.feePlanId,
        installment_id: reminder.installmentId,
        reminderType: reminder.reminderType,
        sentVia,
        message: reminder.message,
      });
      setMessage(`${sentVia} reminder marked sent for ${reminder.studentName}.`);
      await load();
    } catch (err) {
      setError(err.error || 'Could not mark reminder sent');
    }
  }

  async function handleCollectionFollowUp(item, sentVia) {
    setMessage('');
    setError('');
    try {
      const note = followUpNotes[item.feePlanId] || '';
      const promiseDate = promiseDates[item.feePlanId] || '';
      await markFeeReminderSent({
        student_id: item.studentId,
        fee_plan_id: item.feePlanId,
        installment_id: item.installmentId,
        reminderType: item.reminderType,
        sentVia,
        message: `${item.message}${promiseDate ? `\nPromise-to-pay date: ${promiseDate}` : ''}${note ? `\nNote: ${note}` : ''}`,
      });
      if (promiseDate) {
        await createFollowUp({
          student_id: item.studentId,
          taskType: 'Fee Payment Promise',
          dueDate: promiseDate,
          priority: item.riskType === 'Overdue' ? 'High' : 'Medium',
          assignedTo: 'Accounts',
          status: 'Open',
          notes: note || `Follow up for ${money(item.amount)} ${item.installmentLabel || 'installment'}.`,
          linkedType: 'fee_plan',
          linkedId: item.feePlanId,
        });
      }
      setFollowUpNotes((current) => ({ ...current, [item.feePlanId]: '' }));
      setPromiseDates((current) => ({ ...current, [item.feePlanId]: '' }));
      setMessage(`${sentVia} follow-up logged for ${item.studentName}.`);
      await load();
    } catch (err) {
      setError(err.error || 'Could not log collection follow-up');
    }
  }

  async function handleCopyReminder(item) {
    await navigator.clipboard.writeText(item.message || reminderMessageForPlan(item));
    setMessage(`Reminder copied for ${item.studentName}.`);
  }

  async function handleRunFeeAutomation() {
    setMessage('');
    setError('');
    setAutomationRunning(true);
    try {
      const result = await runFeeReminderAutomation({ sentVia: 'WhatsApp Automation' });
      setAutomationResult(result);
      const providerText = result.providerConfigured ? 'WhatsApp sent/attempted' : 'WhatsApp not configured; reminders queued';
      setMessage(`Fee reminder automation processed ${result.summary?.queued || 0} reminder(s). ${providerText}.`);
      await load();
    } catch (err) {
      setError(err.error || 'Could not run fee reminder automation');
    } finally {
      setAutomationRunning(false);
    }
  }

  async function handleSendTestMessage(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setTestSending(true);
    try {
      const result = await sendWhatsAppTest(testMessage);
      setTestResult(result);
      setMessage(result.ok ? 'WhatsApp test message sent.' : `WhatsApp test result: ${result.status}.`);
      const status = await fetchWhatsAppStatus().catch(() => null);
      setWhatsappStatus(status);
    } catch (err) {
      setError(err.error || 'Could not send WhatsApp test message');
    } finally {
      setTestSending(false);
    }
  }

  function startEditTemplate(template) {
    setEditingTemplateId(template.id);
    setTemplateDraft({
      displayName: template.displayName || '',
      channel: template.channel || 'WhatsApp',
      status: template.status || 'Active',
      body: template.body || '',
      variables: template.variables || [],
    });
  }

  async function handleSaveTemplate(templateId) {
    setMessage('');
    setError('');
    try {
      const saved = await updateMessageTemplate(templateId, templateDraft);
      setMessage(`Template saved: ${saved.displayName}.`);
      setEditingTemplateId(null);
      setTemplateDraft({});
      const rows = await fetchMessageTemplates();
      setMessageTemplates(rows);
    } catch (err) {
      setError(err.error || 'Could not save message template');
    }
  }

  function printReceipt(payment = receipt) {
    if (!payment) return;
    const plan = plans.find((item) => String(item.id) === String(payment.planId || payment.fee_plan_id)) || selectedPlan;
    const student = students.find((item) => String(item.id) === String(plan?.student_id || plan?.studentId || payment.student_id || payment.studentId));
    const studentData = student?.data || {};
    const components = plan?.components?.length ? plan.components : [{ componentName: plan?.feeCategory || 'Fee', amount: plan?.totalAmount || payment.amount }];
    const totalPaid = Number(plan?.paidAmount || 0);
    const totalPayable = Number(plan?.netAmount || plan?.totalAmount || 0);
    const pendingBalance = Math.max(0, Number(plan?.dueAmount ?? (totalPayable - totalPaid)));
    const componentRows = components.map((component) => `
      <tr>
        <td>${escapeHtml(component.componentName)}</td>
        <td class="right">${money(component.amount)}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Receipt ${escapeHtml(payment.receiptNumber)}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
            .toolbar { max-width: 794px; margin: 18px auto; text-align: right; }
            button { border: 0; border-radius: 8px; background: #020617; color: white; cursor: pointer; font-weight: 700; padding: 10px 14px; }
            .receipt { width: 794px; min-height: 1123px; margin: 0 auto 24px; background: white; border: 1px solid #dbe3ef; padding: 34px; }
            .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #020617; padding-bottom: 18px; }
            h1 { margin: 0; font-size: 26px; letter-spacing: .08em; text-transform: uppercase; }
            h2 { margin: 4px 0 0; font-size: 18px; }
            .muted { color: #64748b; font-size: 12px; line-height: 1.5; }
            .receipt-tag { align-self: flex-start; border: 1px solid #020617; border-radius: 999px; font-size: 12px; font-weight: 700; padding: 8px 14px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
            .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
            .label { color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
            .value { font-size: 14px; font-weight: 700; margin-top: 5px; }
            table { border-collapse: collapse; width: 100%; margin-top: 22px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f1f5f9; color: #334155; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
            .right { text-align: right; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; }
            .summary .box { border-color: #cbd5e1; }
            .amount { font-size: 22px; }
            .notice { border: 1px solid #e2e8f0; border-radius: 10px; color: #475569; font-size: 12px; line-height: 1.5; margin-top: 22px; padding: 12px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; margin-top: 70px; }
            .signature { border-top: 1px solid #0f172a; font-size: 12px; font-weight: 700; padding-top: 10px; text-align: center; }
            .footer { border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; margin-top: 32px; padding-top: 12px; text-align: center; }
            @media print {
              body { background: white; }
              .toolbar { display: none; }
              .receipt { border: 0; margin: 0; padding: 0; width: auto; min-height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
          <div class="receipt">
            <div class="top">
              <div>
                <h1>Miraku Education Foundation</h1>
                <h2>ProTrack Kaizen Fee Receipt</h2>
                <p class="muted">Institute CRM receipt generated from the Fees Management Module<br />Tembhurni / Kurduvadi Branch</p>
              </div>
              <div class="receipt-tag">${escapeHtml(payment.receiptType || 'Non-GST Receipt')}</div>
            </div>

            <div class="grid">
              <div class="box"><div class="label">Receipt Number</div><div class="value">${escapeHtml(payment.receiptNumber)}</div></div>
              <div class="box"><div class="label">Payment Date</div><div class="value">${escapeHtml(payment.paymentDate || '-')}</div></div>
              <div class="box"><div class="label">Student Name</div><div class="value">${escapeHtml(payment.studentName || plan?.studentName || student?.name || '-')}</div></div>
              <div class="box"><div class="label">Class / Batch</div><div class="value">${escapeHtml(`${student?.grade || '-'} / ${student?.batch || '-'}`)}</div></div>
              <div class="box"><div class="label">Course / Program</div><div class="value">${escapeHtml(payment.courseProgram || plan?.courseProgram || plan?.feeCategory || studentData.course || '-')}</div></div>
              <div class="box"><div class="label">Branch</div><div class="value">${escapeHtml(studentData.branch || '-')}</div></div>
              <div class="box"><div class="label">Payment Mode</div><div class="value">${escapeHtml(payment.paymentMethod || '-')}</div></div>
              <div class="box"><div class="label">Transaction ID</div><div class="value">${escapeHtml(payment.transactionId || '-')}</div></div>
            </div>

            <table>
              <thead><tr><th>Fee Component</th><th class="right">Amount</th></tr></thead>
              <tbody>${componentRows}</tbody>
            </table>

            <div class="summary">
              <div class="box"><div class="label">Total Payable</div><div class="value">${money(totalPayable)}</div></div>
              <div class="box"><div class="label">Total Paid</div><div class="value">${money(totalPaid)}</div></div>
              <div class="box"><div class="label">This Receipt</div><div class="value amount">${money(payment.amount)}</div></div>
              <div class="box"><div class="label">Pending Balance</div><div class="value">${money(pendingBalance)}</div></div>
            </div>

            <div class="grid">
              <div class="box"><div class="label">Received By</div><div class="value">${escapeHtml(payment.receivedBy || '-')}</div></div>
              <div class="box"><div class="label">Payment Plan</div><div class="value">${escapeHtml(payment.paymentType || plan?.paymentType || '-')}</div></div>
            </div>

            <div class="notice">
              <strong>Remark:</strong> ${escapeHtml(payment.notes || '-')}. Fees once paid are subject to the institute refund/cancellation policy. This computer-generated receipt is valid after payment verification.
            </div>

            <div class="signatures">
              <div class="signature">Parent / Student Signature</div>
              <div class="signature">Receiver Signature / Institute Stamp</div>
            </div>

            <div class="footer">Generated on ${escapeHtml(new Date().toLocaleString('en-IN'))} by ProTrack Kaizen CRM</div>
          </div>
        </body>
      </html>
    `;
    const popup = window.open('', '_blank', 'width=820,height=900');
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  }

  return (
    <PageShell
      title="Fees Management"
      description="Track fee structures, approved discounts, installments, collections, due balances, and printable receipts."
    >

      {message ? <Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {deleteTarget?.type === 'plan' ? 'fee plan' : 'payment'}?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          {canDelete ? <Button variant="destructive" onClick={confirmDelete}>Delete</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Net Fees', totals.netFees],
          ['Collected', totals.collected],
          ['Pending', totals.pending],
          ['Overdue', totals.overdue],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={money(value)} tone={label === 'Overdue' ? 'risk' : 'neutral'} />
        ))}
      </div>

      <Tabs defaultValue="collections" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="plans">Fee Plans</TabsTrigger>
          <TabsTrigger value="records">Student Profiles</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="collections" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Collections Control</CardTitle>
            <CardDescription>Daily recovery view for due fees, overdue parents, calls, WhatsApp reminders, and promise-to-pay tracking.</CardDescription>
          </div>
          <Badge variant="secondary">{collections.queue.length} follow-ups</Badge>
        </CardHeader>

        <CardContent className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['Today Collection', money(collections.todayCollection)],
            ['Pending Amount', money(totals.pending)],
            ['Overdue Amount', money(totals.overdue)],
            ['Overdue Students', collections.overdueStudents],
            ['Next 7 Days Expected', money(collections.next7Expected)],
            ['Target Gap', money(Math.max(0, collections.next7Expected - collections.todayCollection))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-muted/35 p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-bold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold">Fee Follow-up Queue</h3>
          </div>
          <div className="mt-4 space-y-3">
            {collections.queue.slice(0, 10).map((item) => (
              <div key={`${item.feePlanId}-${item.installmentId}-${item.riskType}`} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.studentName}</p>
                      <span className={`rounded-full px-2 py-1 text-xs ${item.riskType === 'Overdue' ? 'bg-rose-50 text-rose-700' : item.riskType === 'Due Next 7 Days' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{item.riskType}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.course} - {item.installmentLabel} - due {item.dueDate || '-'}</p>
                    <p className="mt-1 text-lg font-bold">{money(item.amount)} due, {money(item.paidAmount)} paid</p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{item.message}</pre>
                  </div>
                  <div className="w-full space-y-2 xl:w-72">
                    <Input
                      type="date"
                      value={promiseDates[item.feePlanId] || ''}
                      onChange={(e) => setPromiseDates((current) => ({ ...current, [item.feePlanId]: e.target.value }))}
                      title="Promise-to-pay date"
                    />
                    <Textarea
                      value={followUpNotes[item.feePlanId] || ''}
                      onChange={(e) => setFollowUpNotes((current) => ({ ...current, [item.feePlanId]: e.target.value }))}
                      placeholder="Follow-up notes"
                      className="h-20"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                      <a href={whatsappLink(item)} target="_blank" rel="noreferrer" onClick={() => handleCollectionFollowUp(item, 'WhatsApp')}>
                        <MessageCircle className="mr-1 inline h-4 w-4" /> WhatsApp
                      </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCopyReminder(item)}>
                        <Copy className="mr-1 inline h-4 w-4" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCollectionFollowUp(item, 'Call Connected')}>
                        <PhoneCall className="mr-1 inline h-4 w-4" /> Connected
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCollectionFollowUp(item, 'No Answer')}>No Answer</Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!collections.queue.length ? <p className="text-sm text-slate-500">No collection follow-ups due right now.</p> : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold">Installment Risk</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {collections.highPending.slice(0, 6).map((item) => (
                <div key={`${item.feePlanId}-${item.installmentId}-high`} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-semibold">{item.studentName}</p>
                  <p className="text-slate-600">{item.riskType} - {money(item.dueAmount)} total due</p>
                </div>
              ))}
              {!collections.highPending.length ? <p className="text-slate-500">No high-risk installments.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold">Repeated Late Payers</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {collections.repeatedLate.slice(0, 6).map((item) => (
                <div key={`${item.feePlanId}-${item.installmentId}-late`} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-semibold">{item.studentName}</p>
                  <p className="text-slate-600">Partially paid but overdue - {money(item.amount)} installment</p>
                </div>
              ))}
              {!collections.repeatedLate.length ? <p className="text-slate-500">No repeated late payers.</p> : null}
            </div>
          </div>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="records" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Course Fee Structure</CardTitle>
            <CardDescription>These database-backed rates fill the course/program dropdown.</CardDescription>
          </div>
          <Badge variant="secondary">{coursePrograms.length} active rates</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course / Class</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Payment Type</TableHead>
                <TableHead>Duration / Classes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coursePrograms.map((program) => (
                <TableRow key={program.label}>
                  <TableCell className="font-semibold">{program.label}</TableCell>
                  <TableCell className="font-semibold">{money(program.amount)}</TableCell>
                  <TableCell>{program.billingCycle || 'per year'}</TableCell>
                  <TableCell>{program.paymentType || 'Installment'}</TableCell>
                  <TableCell>{program.duration || program.classRange || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSavePlan} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {editingPlanId ? <Pencil className="h-5 w-5 text-slate-500" /> : <Plus className="h-5 w-5 text-slate-500" />}
              <h3 className="font-semibold">{editingPlanId ? 'Edit Student Fee Profile' : 'Create Student Fee Profile'}</h3>
            </div>
            {editingPlanId ? (
              <button type="button" onClick={resetPlanForm} className="inline-flex items-center rounded-md border px-3 py-1 text-sm">
                <X className="mr-1 h-4 w-4" /> Cancel
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={planForm.student_id} onChange={(e) => setPlanForm({ ...planForm, student_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select student</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.name} {student.grade ? `- ${student.grade}` : ''}</option>)}
            </select>
            <select
              value={planForm.courseProgram}
              onChange={(e) => {
                const program = coursePrograms.find((item) => item.label === e.target.value);
                setPlanForm({
                  ...planForm,
                  courseProgram: e.target.value,
                  feeCategory: e.target.value || planForm.feeCategory,
                  paymentType: program?.paymentType || planForm.paymentType,
                  totalAmount: program && !componentTotal ? String(program.amount) : planForm.totalAmount,
                });
              }}
              className="rounded-md border px-3 py-2 text-sm"
              required
            >
              <option value="">Course / program</option>
              {coursePrograms.map((program) => <option key={program.label}>{program.label}</option>)}
            </select>
            <select value={planForm.paymentType} onChange={(e) => setPlanForm({ ...planForm, paymentType: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              {paymentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={planForm.feeCategory} onChange={(e) => setPlanForm({ ...planForm, feeCategory: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {feeCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <input type="number" value={planForm.totalAmount} onChange={(e) => setPlanForm({ ...planForm, totalAmount: e.target.value })} placeholder="Manual total if no breakup" className="rounded-md border px-3 py-2 text-sm" required={!componentTotal} />
            <input type="number" value={planForm.discountAmount} onChange={(e) => setPlanForm({ ...planForm, discountAmount: e.target.value })} placeholder="Discount amount" className="rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h4 className="font-semibold">Fee Components</h4>
              <p className="text-sm text-slate-500">Breakup total: {money(componentTotal || planForm.totalAmount)}</p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {planForm.components.map((component, index) => (
                <div key={`${component.componentName}-${index}`} className="grid grid-cols-[1fr_120px] gap-2">
                  <input value={component.componentName} onChange={(e) => setComponent(index, 'componentName', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
                  <input type="number" value={component.amount} onChange={(e) => setComponent(index, 'amount', e.target.value)} placeholder="Amount" className="rounded-md border px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Installment / Monthly Schedule</h4>
              <button type="button" onClick={addInstallment} className="rounded-md border px-3 py-1 text-sm">Add Row</button>
            </div>
            <div className="mt-3 space-y-2">
              {planForm.installments.map((installment, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_110px_150px_120px_40px]">
                  <input value={installment.label} onChange={(e) => setInstallment(index, 'label', e.target.value)} placeholder="1st Installment / June" className="rounded-md border px-3 py-2 text-sm" />
                  <input type="number" value={installment.amount} onChange={(e) => setInstallment(index, 'amount', e.target.value)} placeholder="Amount" className="rounded-md border px-3 py-2 text-sm" />
                  <input type="date" value={installment.dueDate} onChange={(e) => setInstallment(index, 'dueDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
                  <select value={installment.status} onChange={(e) => setInstallment(index, 'status', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                    {installmentStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <button type="button" onClick={() => removeInstallment(index)} className="rounded-md border px-2 text-sm">X</button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold">Discount Approval</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select value={planForm.discountType} onChange={(e) => setPlanForm({ ...planForm, discountType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                {discountTypes.map((type) => <option key={type} value={type}>{type || 'No discount type'}</option>)}
              </select>
              <input value={planForm.approvedBy} onChange={(e) => setPlanForm({ ...planForm, approvedBy: e.target.value })} placeholder="Approved by Director / Admin" className="rounded-md border px-3 py-2 text-sm" />
              <input type="date" value={planForm.discountApprovedDate} onChange={(e) => setPlanForm({ ...planForm, discountApprovedDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
              <input value={planForm.discountReason} onChange={(e) => setPlanForm({ ...planForm, discountReason: e.target.value })} placeholder="Discount reason" className="rounded-md border px-3 py-2 text-sm" />
              <input value={planForm.discountProofNote} onChange={(e) => setPlanForm({ ...planForm, discountProofNote: e.target.value })} placeholder="Proof / note" className="rounded-md border px-3 py-2 text-sm md:col-span-2" />
              <select value={planForm.feeStatus} onChange={(e) => setPlanForm({ ...planForm, feeStatus: e.target.value })} className="rounded-md border px-3 py-2 text-sm md:col-span-2">
                {feeStatuses.map((status) => <option key={status} value={status}>{status || 'Auto fee status'}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input type="date" value={planForm.dueDate} onChange={(e) => setPlanForm({ ...planForm, dueDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input value={planForm.notes} onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })} placeholder="Internal notes" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Final payable: {money(formNet)}</p>
              <p className="text-slate-600">Total {money(formTotal)} minus discount {money(planForm.discountAmount)}</p>
            </div>
            <button disabled={!canEditFinance} className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {editingPlanId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {editingPlanId ? 'Update Plan' : 'Create Plan'}
            </button>
          </div>
        </form>

        <form onSubmit={handleCreatePayment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold">Fee Collection Entry</h3>
          </div>
          <div className="mt-4 grid gap-3">
            <select value={paymentForm.fee_plan_id} onChange={(e) => { setSelectedPlanId(e.target.value); setPaymentForm({ ...paymentForm, fee_plan_id: e.target.value }); }} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select fee plan</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.studentName} - {plan.courseProgram || plan.feeCategory} - Due {money(plan.dueAmount)}</option>)}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="Amount received" className="rounded-md border px-3 py-2 text-sm" required />
              <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
              <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                {paymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select>
              <select value={paymentForm.receiptType} onChange={(e) => setPaymentForm({ ...paymentForm, receiptType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                {receiptTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
              <input value={paymentForm.transactionId} onChange={(e) => setPaymentForm({ ...paymentForm, transactionId: e.target.value })} placeholder="Transaction ID / cheque no." className="rounded-md border px-3 py-2 text-sm" />
              <input value={paymentForm.receivedBy} onChange={(e) => setPaymentForm({ ...paymentForm, receivedBy: e.target.value })} placeholder="Received by" className="rounded-md border px-3 py-2 text-sm" />
              <input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Remark" className="rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
          <button disabled={!canEditFinance} className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save Payment & Receipt</button>
        </form>
      </div>

        </TabsContent>

        <TabsContent value="payments" className="space-y-6">
      {receipt ? (
        <Card className="border-emerald-200">
          <CardContent className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">Latest Receipt</p>
              <p className="text-lg font-bold">{receipt.receiptNumber} - {receipt.studentName} - {money(receipt.amount)}</p>
            </div>
            <Button onClick={() => printReceipt(receipt)}>
              <FileText className="mr-2 h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt Register</CardTitle>
          <CardDescription>Print or save any receipt as PDF from payment history.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.slice(0, 20).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.receiptNumber}</TableCell>
                    <TableCell>{payment.studentName || '-'}</TableCell>
                    <TableCell>{payment.paymentDate || '-'}</TableCell>
                    <TableCell>{payment.paymentMethod || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{money(payment.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => printReceipt(payment)}>
                        <FileText className="mr-2 h-4 w-4" /> Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No payments saved yet.</p>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-semibold">Due Fee Reminder Panel</h3>
              <p className="mt-1 text-sm text-slate-500">Queue 3-day-before, due-date, overdue, and final reminders without duplicates for today.</p>
            </div>
            <Button type="button" onClick={handleRunFeeAutomation} disabled={!canEditFinance || automationRunning}>
              <Bell className="mr-2 h-4 w-4" />
              {automationRunning ? 'Running...' : 'Run Automation'}
            </Button>
          </div>
          {automationResult ? (
            <Alert className="mt-4">
              <AlertDescription>
                {automationResult.providerConfigured ? 'WhatsApp provider configured.' : 'WhatsApp provider not configured; reminders are queued for manual sending.'}
                {' '}Processed {automationResult.summary?.queued || 0}, sent {automationResult.summary?.sent || 0}, failed {automationResult.summary?.failed || 0}, missing phone {automationResult.summary?.missingPhone || 0}, skipped {automationResult.summary?.skipped || 0}, checked {automationResult.summary?.checkedPlans || 0} fee plan(s).
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="mt-4 space-y-3">
            {reminders.slice(0, 6).map((reminder) => (
              <div key={`${reminder.feePlanId}-${reminder.installmentId}-${reminder.reminderType}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{reminder.studentName} - {reminder.reminderType}</p>
                    <p className="text-sm text-slate-500">{reminder.course} - {reminder.installmentLabel} due {reminder.dueDate}</p>
                    <p className="mt-1 text-sm font-semibold">{money(reminder.amount)}</p>
                  </div>
                  <button onClick={() => handleMarkReminderSent(reminder, 'WhatsApp')} className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">WhatsApp Sent</button>
                </div>
              </div>
            ))}
            {!reminders.length ? <p className="text-sm text-slate-500">No reminders due today based on 3-day, due-date, 3-day-after, or final reminder rules.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-semibold">WhatsApp Settings</h3>
              <p className="mt-1 text-sm text-slate-500">Cloud API status, recent failures, and a test-message check.</p>
            </div>
            <Badge variant={whatsappStatus?.configured ? 'secondary' : 'destructive'}>
              {whatsappStatus?.configured ? 'Configured' : 'Not configured'}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500">Provider</p>
              <p className="font-semibold">{whatsappStatus?.provider || 'WhatsApp Cloud API'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500">Phone Number ID</p>
              <p className="font-semibold">{whatsappStatus?.phoneNumberId || 'Missing'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500">Access Token</p>
              <p className="font-semibold">{whatsappStatus?.hasAccessToken ? 'Present' : 'Missing'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500">Last 7 Days</p>
              <p className="font-semibold">
                Sent {whatsappStatus?.last7Days?.Sent || 0}, Failed {whatsappStatus?.last7Days?.Failed || 0}, Queued {whatsappStatus?.last7Days?.Queued || 0}
              </p>
            </div>
          </div>

          <form onSubmit={handleSendTestMessage} className="mt-4 space-y-3">
            <Input
              value={testMessage.phone}
              onChange={(e) => setTestMessage({ ...testMessage, phone: e.target.value })}
              placeholder="Test phone number, e.g. 919876543210"
              required
            />
            <Textarea
              value={testMessage.message}
              onChange={(e) => setTestMessage({ ...testMessage, message: e.target.value })}
              rows={3}
              required
            />
            <Button type="submit" disabled={!canEditFinance || testSending}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {testSending ? 'Sending...' : 'Send Test'}
            </Button>
          </form>

          {testResult ? (
            <Alert className="mt-4">
              <AlertDescription>
                Test status: {testResult.status || 'Unknown'}
                {testResult.error ? ` - ${testResult.error}` : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold">Recent Failures</p>
            {(whatsappStatus?.recentFailures || []).slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{item.studentName || 'Student'} - {item.status}</p>
                <p className="text-slate-500">{item.courseProgram || 'Fee reminder'} - {item.sentAt || '-'}</p>
              </div>
            ))}
            {!whatsappStatus?.recentFailures?.length ? <p className="text-sm text-slate-500">No recent WhatsApp failures.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Daily Collection Report</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr><th className="py-2">Date</th><th>Cash</th><th>UPI</th><th>Bank</th><th>Total</th></tr>
              </thead>
              <tbody>
                {(reports?.dailyCollection || []).slice(0, 5).map((row) => (
                  <tr key={row.date} className="border-t">
                    <td className="py-2">{row.date}</td>
                    <td>{money(row.Cash)}</td>
                    <td>{money(row.UPI)}</td>
                    <td>{money(row.Bank)}</td>
                    <td className="font-semibold">{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reports?.dailyCollection?.length ? <p className="mt-3 text-sm text-slate-500">No collection rows yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Pending Fee Report</h3>
          <div className="mt-4 space-y-2 text-sm">
            {(reports?.pendingFees || []).slice(0, 8).map((row) => (
              <div key={`${row.studentName}-${row.course}-${row.dueDate}`} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold">{row.studentName}</p>
                <p className="text-slate-600">{row.course} - {row.dueDate || '-'}</p>
                <p>{money(row.pendingAmount)} pending of {money(row.totalFees)}</p>
              </div>
            ))}
            {!reports?.pendingFees?.length ? <p className="text-sm text-slate-500">No pending fees.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Course-Wise Collection</h3>
          <div className="mt-4 space-y-2 text-sm">
            {(reports?.courseWise || []).map((row) => (
              <div key={row.course} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold">{row.course}</p>
                <p className="text-slate-600">Expected {money(row.totalExpected)}</p>
                <p>Collected {money(row.collected)} - Pending {money(row.pending)}</p>
              </div>
            ))}
            {!reports?.courseWise?.length ? <p className="text-sm text-slate-500">No course collection rows yet.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Staff-Wise Collection</h3>
          <div className="mt-4 space-y-2 text-sm">
            {(reports?.staffWise || []).map((row) => (
              <div key={row.staff} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold">{row.staff}</p>
                <p>{money(row.amountCollected)} from {row.students} students</p>
              </div>
            ))}
            {!reports?.staffWise?.length ? <p className="text-sm text-slate-500">No staff collection rows yet.</p> : null}
          </div>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Templates</CardTitle>
          <CardDescription>Edit WhatsApp message wording used by fee reminders, receipts, attendance alerts, and test-result parent updates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messageTemplates.map((template) => {
            const editing = editingTemplateId === template.id;
            const draft = editing ? templateDraft : template;
            return (
              <div key={template.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{template.displayName}</p>
                    <p className="mt-1 text-sm text-slate-500">{template.templateKey} - {template.channel} - {template.status}</p>
                  </div>
                  <div className="flex gap-2">
                    {editing ? (
                      <>
                        <Button type="button" size="sm" onClick={() => handleSaveTemplate(template.id)} disabled={!canEditFinance}>
                          <Save className="mr-2 h-4 w-4" /> Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setEditingTemplateId(null); setTemplateDraft({}); }}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => startEditTemplate(template)} disabled={!canEditFinance}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="mt-4 space-y-3">
                    <Input
                      value={draft.displayName}
                      onChange={(e) => setTemplateDraft({ ...templateDraft, displayName: e.target.value })}
                      placeholder="Template name"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select value={draft.channel} onChange={(e) => setTemplateDraft({ ...templateDraft, channel: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                        <option>WhatsApp</option>
                        <option>SMS</option>
                        <option>Email</option>
                      </select>
                      <select value={draft.status} onChange={(e) => setTemplateDraft({ ...templateDraft, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </div>
                    <Textarea
                      value={draft.body}
                      onChange={(e) => setTemplateDraft({ ...templateDraft, body: e.target.value })}
                      rows={6}
                      placeholder="Message body"
                    />
                  </div>
                ) : (
                  <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{template.body}</pre>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {(template.variables || []).map((variable) => (
                    <Badge key={variable} variant="outline">{`{{${variable}}}`}</Badge>
                  ))}
                </div>
              </div>
            );
          })}
          {!messageTemplates.length ? <p className="text-sm text-muted-foreground">No message templates found. Restart the backend to run migrations and seed defaults.</p> : null}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Fee Audit Log</h3>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          {auditLogs.slice(0, 6).map((log) => (
            <div key={log.id} className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold">{log.action} {log.entityType} #{log.entityId}</p>
              <p className="text-slate-600">{log.changedBy || '-'} - {log.createdAt}</p>
            </div>
          ))}
          {!auditLogs.length ? <p className="text-sm text-slate-500">No fee audit entries yet.</p> : null}
        </div>
      </div>

        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_460px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Student Fee Profiles</h3>
          <div className="mt-4 space-y-3">
            {plans.map((plan) => (
              <div key={plan.id} className={`rounded-xl border p-4 ${String(selectedPlanId) === String(plan.id) ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`}>
                <button onClick={() => { setSelectedPlanId(String(plan.id)); setPaymentForm((current) => ({ ...current, fee_plan_id: String(plan.id), amount: String(plan.dueAmount || '') })); }} className="w-full text-left">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">{plan.studentName}</p>
                      <p className={String(selectedPlanId) === String(plan.id) ? 'text-sm text-slate-300' : 'text-sm text-slate-500'}>{plan.courseProgram || plan.feeCategory} - {plan.paymentType || 'Fee plan'} - Next due {plan.nextDueDate || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{money(plan.dueAmount)} due</p>
                      <p className={String(selectedPlanId) === String(plan.id) ? 'text-sm text-slate-300' : 'text-sm text-slate-500'}>{plan.feeStatus}: {money(plan.paidAmount)} paid of {money(plan.netAmount)}</p>
                    </div>
                  </div>
                </button>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => startEditPlan(plan)} className={`rounded-md px-3 py-1 text-sm ${String(selectedPlanId) === String(plan.id) ? 'border border-slate-600 text-white' : 'border'}`}>Edit</button>
                  {canDelete ? <button onClick={() => setDeleteTarget({ type: 'plan', id: plan.id })} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button> : null}
                </div>
              </div>
            ))}
            {!plans.length ? <p className="text-sm text-slate-500">No fee profiles yet.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Selected Student Fee Record</h3>
          {selectedPlan ? (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{selectedPlan.studentName}</p>
                <p className="text-slate-600">{selectedPlan.courseProgram || selectedPlan.feeCategory}</p>
                <p className="mt-2">Final payable {money(selectedPlan.netAmount)}, paid {money(selectedPlan.paidAmount)}, pending {money(selectedPlan.dueAmount)}</p>
                {selectedPlan.discountAmount > 0 ? <p className="text-slate-600">Discount: {money(selectedPlan.discountAmount)} ({selectedPlan.discountType || 'Approved discount'}) approved by {selectedPlan.approvedBy || '-'}</p> : null}
              </div>

              <div>
                <p className="text-sm font-semibold">Fee Breakup</p>
                <div className="mt-2 space-y-1 text-sm">
                  {(selectedPlan.components || []).map((component) => (
                    <div key={component.id || component.componentName} className="flex justify-between rounded-md bg-slate-50 px-3 py-2">
                      <span>{component.componentName}</span>
                      <strong>{money(component.amount)}</strong>
                    </div>
                  ))}
                  {!selectedPlan.components?.length ? <p className="text-sm text-slate-500">No component breakup saved.</p> : null}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Installments / Monthly Dues</p>
                <div className="mt-2 space-y-1 text-sm">
                  {(selectedPlan.installments || []).map((installment) => (
                    <div key={installment.id || installment.label} className="grid grid-cols-[1fr_90px_90px] gap-2 rounded-md bg-slate-50 px-3 py-2">
                      <span>{installment.label} <span className="text-slate-500">({installment.dueDate || '-'})</span></span>
                      <strong>{money(installment.amount)}</strong>
                      <span>{installment.status}</span>
                    </div>
                  ))}
                  {!selectedPlan.installments?.length ? <p className="text-sm text-slate-500">No schedule saved.</p> : null}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Payment History</p>
                <div className="mt-2 space-y-3">
                  {selectedPayments.map((payment) => (
                    <div key={payment.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{payment.receiptNumber}</p>
                          <p className="text-sm text-slate-500">{payment.paymentDate} - {payment.paymentMethod}</p>
                          <p className="text-sm text-slate-500">Received by {payment.receivedBy || '-'}</p>
                          <p className="mt-1 text-lg font-bold">{money(payment.amount)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => printReceipt(payment)} className="rounded-md border px-3 py-1 text-sm">Receipt</button>
                          {canDelete ? <button onClick={() => setDeleteTarget({ type: 'payment', id: payment.id })} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!selectedPayments.length ? <p className="text-sm text-slate-500">No payments for this plan yet.</p> : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Select a fee profile to view payments and balances.</p>
          )}
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function MetricCard({ label, value, tone = 'neutral' }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-bold ${tone === 'risk' ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
