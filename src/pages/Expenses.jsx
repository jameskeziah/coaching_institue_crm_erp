import React, { useEffect, useState } from 'react';
import {
  approveExpense,
  createExpense,
  createPettyCashEntry,
  createRecurringExpense,
  createVendor,
  deleteExpense,
  deleteRecurringExpense,
  fetchExpenseReports,
  fetchExpenses,
  fetchPettyCash,
  fetchRecurringExpenses,
  fetchStaffAttendanceMonthly,
  fetchVendors,
  generateRecurringExpenses,
  payExpense,
  rejectExpense,
  updateExpense,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const categories = ['Salary', 'Rent', 'Electricity', 'Marketing', 'Stationery', 'Exam Cost', 'Software', 'Furniture', 'Lab Equipment', 'Maintenance', 'Travel', 'Food / Mess', 'Legal / Accounting', 'Events', 'Refunds', 'Miscellaneous'];
const expenseTypes = ['Fixed', 'Variable'];
const paymentModes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Card', 'Wallet'];
const statuses = ['Draft', 'Requested', 'Approved', 'Rejected', 'Paid', 'Bill Pending', 'Closed'];
const vendorTypes = ['Printing Vendor', 'Furniture Vendor', 'Stationery Vendor', 'Maintenance Vendor', 'Software Vendor', 'Food Vendor', 'Transport Vendor', 'Other'];
const teacherSalaryTemplates = [
  { subject: 'Physics', amount: 30000 },
  { subject: 'Biology', amount: 30000 },
  { subject: 'Chemistry', amount: 30000 },
  { subject: 'Maths', amount: 30000 },
  { subject: 'History/Geo', amount: 18000 },
  { subject: 'Marathi', amount: 15000 },
  { subject: 'Hindi', amount: 15000 },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function Expenses() {
  const { permissions } = useAuth();
  const { canApprove, canDelete, canPay, canEditFinance } = permissions;
  const [vendors, setVendors] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [pettyCash, setPettyCash] = useState([]);
  const [staffMonthly, setStaffMonthly] = useState({ month: monthNow(), summary: [] });
  const [reports, setReports] = useState(null);
  const [month, setMonth] = useState(monthNow());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [salaryEdit, setSalaryEdit] = useState(null);
  const [salaryForm, setSalaryForm] = useState({
    paymentDate: today(),
    paymentMode: 'Bank Transfer',
    transactionId: '',
    paidBy: '',
    approvedBy: '',
    deductionAmount: '0',
    bonusAmount: '0',
    netPaid: '',
    remarks: '',
    status: 'Approved',
  });
  const [vendorForm, setVendorForm] = useState({ vendorName: '', vendorType: 'Printing Vendor', mobileNumber: '', address: '', gstNumber: '', bankDetails: '', notes: '' });
  const [expenseForm, setExpenseForm] = useState({
    date: today(),
    branch: 'Tembhurni',
    category: 'Marketing',
    subCategory: '',
    expenseType: 'Variable',
    amount: '',
    vendor_id: '',
    paidTo: '',
    vendorMobile: '',
    paymentMode: 'Cash',
    paidBy: '',
    requestedBy: '',
    approvedBy: '',
    billUploaded: false,
    gstBill: false,
    billUrl: '',
    remarks: '',
    status: 'Requested',
  });
  const [cashForm, setCashForm] = useState({ date: today(), branch: 'Tembhurni', cashFlowType: 'Cash Added', amount: '', remarks: '' });
  const [recurringForm, setRecurringForm] = useState({
    templateName: '',
    branch: 'Tembhurni',
    category: 'Salary',
    subCategory: '',
    expenseType: 'Fixed',
    amount: '',
    paidTo: '',
    vendorMobile: '',
    paymentMode: 'Bank Transfer',
    requestedBy: '',
    approvedBy: '',
    billUploaded: true,
    gstBill: false,
    billUrl: '',
    remarks: '',
    status: 'Active',
    frequency: 'Monthly',
    startMonth: monthNow(),
    endMonth: '',
    dayOfMonth: 1,
  });

  async function load(nextMonth = month) {
    setError('');
    try {
      const [vendorRows, expenseRows, recurringRows, cashRows, reportRows] = await Promise.all([
        fetchVendors(),
        fetchExpenses(),
        fetchRecurringExpenses(),
        fetchPettyCash(),
        fetchExpenseReports(nextMonth),
      ]);
      const staffRows = await fetchStaffAttendanceMonthly(nextMonth).catch(() => ({ month: nextMonth, summary: [] }));
      setVendors(vendorRows);
      setExpenses(expenseRows);
      setRecurringExpenses(recurringRows);
      setPettyCash(cashRows);
      setStaffMonthly(staffRows);
      setReports(reportRows);
    } catch (err) {
      setError(err.error || 'Could not load expense data');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salaryExpenses = expenses.filter((expense) => (
    expense.category === 'Salary' && (!month || String(expense.date || '').startsWith(month))
  ));
  const salaryTemplates = recurringExpenses.filter((template) => template.category === 'Salary');
  const salaryTotals = salaryExpenses.reduce(
    (acc, expense) => {
      acc.payable += Number(expense.amount || 0);
      if (expense.status === 'Paid' || expense.status === 'Bill Pending') acc.paid += Number(expense.netPaid || expense.amount || 0);
      if (['Requested', 'Approved', 'Draft'].includes(expense.status)) acc.pending += Number(expense.amount || 0);
      if (expense.status === 'Approved') acc.approved += Number(expense.netPaid || expense.amount || 0);
      return acc;
    },
    { payable: 0, paid: 0, pending: 0, approved: 0 }
  );

  async function handleVendor(e) {
    e.preventDefault();
    await createVendor(vendorForm);
    setVendorForm({ vendorName: '', vendorType: 'Printing Vendor', mobileNumber: '', address: '', gstNumber: '', bankDetails: '', notes: '' });
    setMessage('Vendor added.');
    await load();
  }

  async function handleExpense(e) {
    e.preventDefault();
    const created = await createExpense(expenseForm);
    setExpenseForm({ ...expenseForm, amount: '', subCategory: '', paidTo: '', vendorMobile: '', billUrl: '', remarks: '', status: 'Requested' });
    setMessage(`Expense ${created.expenseId} recorded.`);
    await load();
  }

  async function handleCash(e) {
    e.preventDefault();
    await createPettyCashEntry(cashForm);
    setCashForm({ ...cashForm, amount: '', remarks: '' });
    setMessage('Petty cash entry added.');
    await load();
  }

  async function handleRecurring(e) {
    e.preventDefault();
    const created = await createRecurringExpense(recurringForm);
    setRecurringForm({
      ...recurringForm,
      templateName: '',
      subCategory: '',
      amount: '',
      paidTo: '',
      vendorMobile: '',
      billUrl: '',
      remarks: '',
    });
    setMessage(`Recurring template ${created.templateName} saved.`);
    await load();
  }

  async function handleGenerateRecurring() {
    const result = await generateRecurringExpenses({ month });
    setMessage(`Generated ${result.created.length} recurring expense(s) for ${result.month}. Skipped ${result.skipped.length}.`);
    await load(month);
  }

  async function handleGenerateSalaryExpenses() {
    setMessage('');
    setError('');
    try {
      const activeSalaryTemplates = salaryTemplates.filter((template) => template.status === 'Active');
      let created = 0;
      let skipped = 0;
      for (const template of activeSalaryTemplates) {
        const alreadyExists = expenses.some((expense) => (
          expense.category === 'Salary'
          && String(expense.date || '').startsWith(month)
          && expense.paidTo === template.paidTo
          && expense.subCategory === template.subCategory
        ));
        if (alreadyExists) {
          skipped += 1;
          continue;
        }
        await createExpense({
          date: `${month}-${String(template.dayOfMonth || 1).padStart(2, '0')}`,
          branch: template.branch,
          category: 'Salary',
          subCategory: template.subCategory,
          expenseType: 'Fixed',
          amount: template.amount,
          vendor_id: '',
          paidTo: template.paidTo,
          vendorMobile: template.vendorMobile,
          paymentMode: template.paymentMode,
          paidBy: '',
          paymentDate: '',
          transactionId: '',
          deductionAmount: 0,
          bonusAmount: 0,
          netPaid: template.amount,
          requestedBy: template.requestedBy || 'Admin',
          approvedBy: template.approvedBy || '',
          billUploaded: true,
          gstBill: false,
          billUrl: template.billUrl,
          remarks: template.remarks || `Monthly salary generated from ${template.templateName}`,
          status: 'Requested',
        });
        created += 1;
      }
      setMessage(`Generated ${created} salary expense(s) for ${month}. Skipped ${skipped}.`);
      await load(month);
    } catch (err) {
      setError(err.error || 'Could not generate salary expenses');
    }
  }

  async function seedTeacherSalaryTemplates() {
    setMessage('');
    setError('');
    try {
      const existingNames = new Set(recurringExpenses.map((item) => String(item.templateName || '').toLowerCase()));
      let created = 0;
      for (const template of teacherSalaryTemplates) {
        const templateName = `${template.subject} Teacher Salary`;
        if (existingNames.has(templateName.toLowerCase())) continue;
        await createRecurringExpense({
          templateName,
          branch: 'Tembhurni',
          category: 'Salary',
          subCategory: template.subject,
          expenseType: 'Fixed',
          amount: template.amount,
          paidTo: `${template.subject} Teacher`,
          vendorMobile: '',
          paymentMode: 'Bank Transfer',
          requestedBy: 'Admin',
          approvedBy: '',
          billUploaded: true,
          gstBill: false,
          billUrl: '',
          remarks: `Monthly teacher salary from June. Subject: ${template.subject}.`,
          status: 'Active',
          frequency: 'Monthly',
          startMonth: '2026-06',
          endMonth: '',
          dayOfMonth: 1,
        });
        created += 1;
      }
      setMessage(created ? `Created ${created} teacher salary template(s).` : 'Teacher salary templates already exist.');
      await load(month);
    } catch (err) {
      setError(err.error || 'Could not create salary templates');
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function startSalaryEdit(expense) {
    const deductionAmount = Number(expense.deductionAmount || 0);
    const bonusAmount = Number(expense.bonusAmount || 0);
    const netPaid = Number(expense.netPaid || (Number(expense.amount || 0) - deductionAmount + bonusAmount));
    setSalaryEdit(expense);
    setSalaryForm({
      paymentDate: expense.paymentDate || today(),
      paymentMode: expense.paymentMode || 'Bank Transfer',
      transactionId: expense.transactionId || '',
      paidBy: expense.paidBy || '',
      approvedBy: expense.approvedBy || '',
      deductionAmount: String(deductionAmount),
      bonusAmount: String(bonusAmount),
      netPaid: String(netPaid),
      remarks: expense.remarks || '',
      status: expense.status || 'Approved',
    });
  }

  function salaryAttendanceMatch(expense) {
    const subject = String(expense.subCategory || '').toLowerCase();
    const paidTo = String(expense.paidTo || '').toLowerCase();
    return (staffMonthly.summary || []).find((row) => {
      const staffName = String(row.staffName || '').toLowerCase();
      return staffName && (
        paidTo.includes(staffName)
        || staffName.includes(paidTo)
        || (subject && staffName.includes(subject))
        || (subject && paidTo.includes(subject))
      );
    });
  }

  function salaryDeductionSuggestion(expense) {
    const attendance = salaryAttendanceMatch(expense);
    if (!attendance) return null;
    const gross = Number(expense.amount || 0);
    const dailyRate = gross / 30;
    const halfDayUnits = Number(attendance.salaryHalfDayDeductions || 0);
    const absentDayUnits = Number(attendance.salaryAbsentDayDeductions || attendance.absentDays || 0);
    const halfDayDeduction = halfDayUnits * (dailyRate / 2);
    const absentDeduction = absentDayUnits * dailyRate;
    const suggestedDeduction = Math.round(halfDayDeduction + absentDeduction);
    return {
      ...attendance,
      dailyRate,
      suggestedDeduction,
      reason: `${attendance.lateMarks || 0} late marks, ${attendance.halfDays || 0} half days, ${attendance.absentDays || 0} absent days, ${attendance.missedLectures || 0} missed lectures`,
    };
  }

  function applyAttendanceDeduction() {
    if (!salaryEdit) return;
    const suggestion = salaryDeductionSuggestion(salaryEdit);
    if (!suggestion) {
      setError('No matching teacher attendance summary found for this salary row.');
      return;
    }
    const existingRemarks = salaryForm.remarks || '';
    const deduction = Number(suggestion.suggestedDeduction || 0);
    const bonus = Number(salaryForm.bonusAmount || 0);
    const reason = `Attendance deduction for ${staffMonthly.month}: ${suggestion.reason}. Suggested deduction ${money(deduction)}. Missed lectures require manual approval if used.`;
    setSalaryForm({
      ...salaryForm,
      deductionAmount: String(deduction),
      netPaid: String(Math.max(0, Number(salaryEdit.amount || 0) - deduction + bonus)),
      remarks: existingRemarks.includes(reason) ? existingRemarks : [existingRemarks, reason].filter(Boolean).join('\n'),
    });
    setMessage(`Applied attendance deduction suggestion for ${salaryEdit.paidTo}.`);
  }

  function updateSalaryField(field, value) {
    const next = { ...salaryForm, [field]: value };
    if (field === 'deductionAmount' || field === 'bonusAmount') {
      const gross = Number(salaryEdit?.amount || 0);
      next.netPaid = String(Math.max(0, gross - Number(next.deductionAmount || 0) + Number(next.bonusAmount || 0)));
    }
    setSalaryForm(next);
  }

  async function saveSalaryPayment(e) {
    e.preventDefault();
    if (!salaryEdit) return;
    setMessage('');
    setError('');
    try {
      await updateExpense(salaryEdit.id, {
        ...salaryEdit,
        paymentDate: salaryForm.paymentDate,
        paymentMode: salaryForm.paymentMode,
        transactionId: salaryForm.transactionId,
        paidBy: salaryForm.paidBy,
        approvedBy: salaryForm.approvedBy,
        deductionAmount: Number(salaryForm.deductionAmount || 0),
        bonusAmount: Number(salaryForm.bonusAmount || 0),
        netPaid: Number(salaryForm.netPaid || 0),
        remarks: salaryForm.remarks,
        status: salaryForm.status,
        billUploaded: true,
      });
      setSalaryEdit(null);
      setMessage(`Salary details saved for ${salaryEdit.paidTo}.`);
      await load(month);
    } catch (err) {
      setError(err.error || 'Could not save salary payment details');
    }
  }

  function printSalarySlip(expense) {
    const netPaid = Number(expense.netPaid || expense.amount || 0);
    const suggestion = salaryDeductionSuggestion(expense);
    const html = `
      <html>
        <head>
          <title>Salary Slip ${escapeHtml(expense.expenseId)}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            body { background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; margin: 0; }
            .toolbar { margin: 18px auto; max-width: 760px; text-align: right; }
            button { background: #020617; border: 0; border-radius: 8px; color: white; cursor: pointer; font-weight: 700; padding: 10px 14px; }
            .slip { background: white; border: 1px solid #dbe3ef; margin: 0 auto; max-width: 760px; padding: 34px; }
            .top { border-bottom: 3px solid #020617; padding-bottom: 16px; }
            h1 { font-size: 24px; margin: 0; text-transform: uppercase; }
            h2 { font-size: 18px; margin: 6px 0 0; }
            .muted { color: #64748b; font-size: 12px; }
            .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-top: 22px; }
            .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .label { color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
            .value { font-size: 14px; font-weight: 700; margin-top: 5px; }
            .amount { font-size: 28px; }
            .note { border: 1px solid #e2e8f0; border-radius: 10px; color: #475569; font-size: 12px; line-height: 1.5; margin-top: 22px; padding: 12px; }
            .signatures { display: grid; gap: 64px; grid-template-columns: 1fr 1fr; margin-top: 70px; }
            .signature { border-top: 1px solid #0f172a; font-size: 12px; font-weight: 700; padding-top: 10px; text-align: center; }
            @media print { body { background: white; } .toolbar { display: none; } .slip { border: 0; margin: 0; padding: 0; } }
          </style>
        </head>
        <body>
          <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
          <div class="slip">
            <div class="top">
              <h1>Miraku Education Foundation</h1>
              <h2>Teacher Salary Slip</h2>
              <p class="muted">Generated from ProTrack Kaizen Expense Management</p>
            </div>
            <div class="grid">
              <div class="box"><div class="label">Salary ID</div><div class="value">${escapeHtml(expense.expenseId)}</div></div>
              <div class="box"><div class="label">Month / Date</div><div class="value">${escapeHtml(expense.date)}</div></div>
              <div class="box"><div class="label">Payment Date</div><div class="value">${escapeHtml(expense.paymentDate || '-')}</div></div>
              <div class="box"><div class="label">Teacher / Paid To</div><div class="value">${escapeHtml(expense.paidTo)}</div></div>
              <div class="box"><div class="label">Subject</div><div class="value">${escapeHtml(expense.subCategory || '-')}</div></div>
              <div class="box"><div class="label">Branch</div><div class="value">${escapeHtml(expense.branch || '-')}</div></div>
              <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(expense.status || '-')}</div></div>
              <div class="box"><div class="label">Payment Mode</div><div class="value">${escapeHtml(expense.paymentMode || '-')}</div></div>
              <div class="box"><div class="label">Transaction / Reference</div><div class="value">${escapeHtml(expense.transactionId || '-')}</div></div>
              <div class="box"><div class="label">Approved By</div><div class="value">${escapeHtml(expense.approvedBy || '-')}</div></div>
              <div class="box"><div class="label">Paid By</div><div class="value">${escapeHtml(expense.paidBy || '-')}</div></div>
              <div class="box"><div class="label">Gross Salary</div><div class="value">${money(expense.amount)}</div></div>
              <div class="box"><div class="label">Deduction</div><div class="value">${money(expense.deductionAmount)}</div></div>
              <div class="box"><div class="label">Bonus</div><div class="value">${money(expense.bonusAmount)}</div></div>
              <div class="box"><div class="label">Net Paid</div><div class="value amount">${money(netPaid)}</div></div>
            </div>
            ${suggestion ? `<div class="note"><strong>Attendance summary:</strong> ${escapeHtml(suggestion.reason)}. Suggested attendance deduction: ${money(suggestion.suggestedDeduction)}.</div>` : ''}
            <div class="note"><strong>Remarks:</strong> ${escapeHtml(expense.remarks || '-')}. This salary slip is valid after payment verification and institute approval.</div>
            <div class="signatures">
              <div class="signature">Teacher Signature</div>
              <div class="signature">Director / Accounts Signature</div>
            </div>
          </div>
        </body>
      </html>
    `;
    const popup = window.open('', '_blank', 'width=820,height=900');
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  }

  function selectVendor(id) {
    const vendor = vendors.find((item) => String(item.id) === String(id));
    setExpenseForm({
      ...expenseForm,
      vendor_id: id,
      paidTo: vendor?.vendorName || expenseForm.paidTo,
      vendorMobile: vendor?.mobileNumber || expenseForm.vendorMobile,
    });
  }

  return (
    <PageShell
      title="Expense Management"
      description="Record, approve, pay, categorize, and report institute spending with branch-wise P&L."
      actions={<input type="month" value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }} className="rounded-md border bg-background px-3 py-2 text-sm" />}
    >
      {message ? <Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Dialog open={Boolean(salaryEdit)} onOpenChange={(open) => { if (!open) setSalaryEdit(null); }}>
        <DialogContent className="max-w-2xl">
          {salaryEdit ? (
            <form onSubmit={saveSalaryPayment}>
              <DialogHeader>
                <DialogTitle>Edit Salary Payment</DialogTitle>
                <DialogDescription>{salaryEdit.paidTo} - {salaryEdit.subCategory || 'Teacher Salary'} - Gross {money(salaryEdit.amount)}</DialogDescription>
              </DialogHeader>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input type="date" value={salaryForm.paymentDate} onChange={(e) => updateSalaryField('paymentDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
              <select value={salaryForm.paymentMode} onChange={(e) => updateSalaryField('paymentMode', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                {paymentModes.map((mode) => <option key={mode}>{mode}</option>)}
              </select>
              <input value={salaryForm.transactionId} onChange={(e) => updateSalaryField('transactionId', e.target.value)} placeholder="Transaction ID / reference" className="rounded-md border px-3 py-2 text-sm" />
              <input value={salaryForm.paidBy} onChange={(e) => updateSalaryField('paidBy', e.target.value)} placeholder="Paid by" className="rounded-md border px-3 py-2 text-sm" />
              <input value={salaryForm.approvedBy} onChange={(e) => updateSalaryField('approvedBy', e.target.value)} placeholder="Approved by" className="rounded-md border px-3 py-2 text-sm" />
              <select value={salaryForm.status} onChange={(e) => updateSalaryField('status', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                <option>Requested</option>
                <option>Approved</option>
                <option>Paid</option>
                <option>Bill Pending</option>
              </select>
              <input type="number" value={salaryForm.deductionAmount} onChange={(e) => updateSalaryField('deductionAmount', e.target.value)} placeholder="Deduction amount" className="rounded-md border px-3 py-2 text-sm" />
              <input type="number" value={salaryForm.bonusAmount} onChange={(e) => updateSalaryField('bonusAmount', e.target.value)} placeholder="Bonus amount" className="rounded-md border px-3 py-2 text-sm" />
              <input type="number" value={salaryForm.netPaid} onChange={(e) => updateSalaryField('netPaid', e.target.value)} placeholder="Net paid" className="rounded-md border px-3 py-2 text-sm" />
              <input value={salaryForm.remarks} onChange={(e) => updateSalaryField('remarks', e.target.value)} placeholder="Notes" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            {salaryDeductionSuggestion(salaryEdit) ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Attendance deduction suggestion: {money(salaryDeductionSuggestion(salaryEdit).suggestedDeduction)}</p>
                <p className="mt-1">{salaryDeductionSuggestion(salaryEdit).reason}</p>
                <p className="mt-1 text-amber-800">Rule: 3 late marks = 1 half-day deduction; 1 absent day = 1 day salary deduction. Missed lectures are shown for manual approval.</p>
                <button type="button" onClick={applyAttendanceDeduction} className="mt-3 rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white">Apply Attendance Deduction</button>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No matching teacher attendance summary found for this salary row in {staffMonthly.month}.
              </div>
            )}
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold">Net paid: {money(salaryForm.netPaid)}</p>
              <p className="text-slate-600">Gross {money(salaryEdit.amount)} - deduction {money(salaryForm.deductionAmount)} + bonus {money(salaryForm.bonusAmount)}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button>Save Salary Details</Button>
              <Button type="button" variant="outline" onClick={() => updateSalaryField('status', 'Paid')}>Set Status Paid</Button>
            </div>
          </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="salaries">Salaries</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="petty-cash">Petty Cash</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Income', reports?.totals?.totalIncome],
          ['Expenses', reports?.totals?.totalExpenses],
          ['Pending Liability', reports?.totals?.pendingLiabilities],
          ['Net Profit', reports?.totals?.netProfit],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={money(value)} />
        ))}
      </div>

        </TabsContent>

        <TabsContent value="salaries" className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Teacher Salary Register</CardTitle>
            <CardDescription>Track monthly teacher salary payable, approval, payment status, and salary slips.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={seedTeacherSalaryTemplates}>Create Teacher Salary Templates</Button>
            <Button type="button" onClick={handleGenerateSalaryExpenses}>Generate {month} Salary</Button>
          </div>
        </CardHeader>
        <CardContent>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ['Salary Payable', salaryTotals.payable],
            ['Salary Paid', salaryTotals.paid],
            ['Salary Pending', salaryTotals.pending],
            ['Approved Awaiting Pay', salaryTotals.approved],
          ].map(([label, value]) => (
            <MetricCard key={label} label={label} value={money(value)} compact />
          ))}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {salaryExpenses.map((expense) => (
              <div key={expense.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    {salaryDeductionSuggestion(expense) ? (
                      <span className="mb-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        Attendance deduction suggested: {money(salaryDeductionSuggestion(expense).suggestedDeduction)}
                      </span>
                    ) : null}
                    <p className="font-semibold">{expense.paidTo} - {expense.subCategory || 'Teacher Salary'}</p>
                    <p className="text-sm text-slate-500">{expense.expenseId} - {expense.date} - {expense.branch} - {expense.status}</p>
                    <p className="mt-1 text-xl font-bold">{money(expense.netPaid || expense.amount)}</p>
                    <p className="text-sm text-slate-600">Gross {money(expense.amount)} - Deduction {money(expense.deductionAmount)} - Bonus {money(expense.bonusAmount)}</p>
                    <p className="text-sm text-slate-600">{expense.paymentDate || 'No payment date'} - {expense.paymentMode} - Ref {expense.transactionId || '-'}</p>
                    <p className="text-sm text-slate-600">Approved by {expense.approvedBy || '-'} - Paid by {expense.paidBy || '-'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canApprove ? <Button type="button" variant="outline" size="sm" onClick={() => approveExpense(expense.id).then(() => load(month))}>Approve</Button> : null}
                    {canEditFinance ? <Button type="button" size="sm" onClick={() => startSalaryEdit(expense)}>Payment Details</Button> : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => printSalarySlip(expense)}>Salary Slip</Button>
                  </div>
                </div>
              </div>
            ))}
            {!salaryExpenses.length ? <p className="text-sm text-slate-500">No salary expenses generated for {month}. Create templates, then generate monthly salary.</p> : null}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold">Active Salary Templates</h4>
            <div className="mt-3 space-y-2 text-sm">
              {salaryTemplates.map((template) => (
                <div key={template.id} className="rounded-lg bg-slate-50 p-3">
                  <strong>{template.subCategory || template.templateName}</strong>
                  <p>{template.paidTo} - {money(template.amount)} - starts {template.startMonth}</p>
                </div>
              ))}
              {!salaryTemplates.length ? <p className="text-slate-500">No teacher salary templates yet.</p> : null}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="expenses" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleExpense} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Add Expense / Request</h3>
          <div className="mt-4 grid gap-3">
            <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
            <input value={expenseForm.branch} onChange={(e) => setExpenseForm({ ...expenseForm, branch: e.target.value })} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
            <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <input value={expenseForm.subCategory} onChange={(e) => setExpenseForm({ ...expenseForm, subCategory: e.target.value })} placeholder="Sub-category" className="rounded-md border px-3 py-2 text-sm" />
            <select value={expenseForm.expenseType} onChange={(e) => setExpenseForm({ ...expenseForm, expenseType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {expenseTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="Amount" className="rounded-md border px-3 py-2 text-sm" required />
            <select value={expenseForm.vendor_id} onChange={(e) => selectVendor(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="">No vendor record</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
            </select>
            <input value={expenseForm.paidTo} onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })} placeholder="Paid to" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={expenseForm.vendorMobile} onChange={(e) => setExpenseForm({ ...expenseForm, vendorMobile: e.target.value })} placeholder="Vendor mobile" className="rounded-md border px-3 py-2 text-sm" />
            <select value={expenseForm.paymentMode} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {paymentModes.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
            <input value={expenseForm.requestedBy} onChange={(e) => setExpenseForm({ ...expenseForm, requestedBy: e.target.value })} placeholder="Requested by" className="rounded-md border px-3 py-2 text-sm" />
            <select value={expenseForm.status} onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expenseForm.billUploaded} onChange={(e) => setExpenseForm({ ...expenseForm, billUploaded: e.target.checked })} /> Bill uploaded</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expenseForm.gstBill} onChange={(e) => setExpenseForm({ ...expenseForm, gstBill: e.target.checked })} /> GST bill</label>
            <input value={expenseForm.billUrl} onChange={(e) => setExpenseForm({ ...expenseForm, billUrl: e.target.value })} placeholder="Bill / voucher link" className="rounded-md border px-3 py-2 text-sm" />
            <input value={expenseForm.remarks} onChange={(e) => setExpenseForm({ ...expenseForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <Button className="mt-4">Save Expense</Button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Approval & Payment Register</h3>
          <div className="mt-4 space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{expense.expenseId} - {expense.category}</p>
                    <p className="text-sm text-slate-500">{expense.date} - {expense.branch} - {expense.status} - {expense.approvalRequired}</p>
                    <p className="mt-1 text-lg font-bold">{money(expense.amount)}</p>
                    <p className="text-sm text-slate-600">{expense.paidTo} - {expense.paymentMode} - Bill {expense.billUploaded ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canApprove ? <Button type="button" variant="outline" size="sm" onClick={() => approveExpense(expense.id).then(() => load())}>Approve</Button> : null}
                    {canApprove ? <Button type="button" variant="outline" size="sm" onClick={() => rejectExpense(expense.id).then(() => load())}>Reject</Button> : null}
                    {canPay ? <Button type="button" size="sm" onClick={() => payExpense(expense.id).then(() => load())}>Pay</Button> : null}
                    {canDelete ? <Button type="button" variant="destructive" size="sm" onClick={() => deleteExpense(expense.id).then(() => load())}>Delete</Button> : null}
                  </div>
                </div>
              </div>
            ))}
            {!expenses.length ? <p className="text-sm text-slate-500">No expenses yet.</p> : null}
          </div>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="recurring" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-semibold">Recurring Monthly Expenses</h3>
            <p className="mt-1 text-sm text-slate-500">Use this for teacher salaries, rent, printing retainers, software, and other regular monthly costs.</p>
          </div>
          <Button type="button" onClick={handleGenerateRecurring}>
            Generate {month}
          </Button>
        </div>

        <form onSubmit={handleRecurring} className="mt-5 grid gap-3 md:grid-cols-4">
          <input value={recurringForm.templateName} onChange={(e) => setRecurringForm({ ...recurringForm, templateName: e.target.value })} placeholder="Template name, e.g. Physics salary" className="rounded-md border px-3 py-2 text-sm" required />
          <input value={recurringForm.paidTo} onChange={(e) => setRecurringForm({ ...recurringForm, paidTo: e.target.value })} placeholder="Paid to" className="rounded-md border px-3 py-2 text-sm" required />
          <input type="number" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} placeholder="Monthly amount" className="rounded-md border px-3 py-2 text-sm" required />
          <input type="month" value={recurringForm.startMonth} onChange={(e) => setRecurringForm({ ...recurringForm, startMonth: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
          <input value={recurringForm.branch} onChange={(e) => setRecurringForm({ ...recurringForm, branch: e.target.value })} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
          <select value={recurringForm.category} onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <input value={recurringForm.subCategory} onChange={(e) => setRecurringForm({ ...recurringForm, subCategory: e.target.value })} placeholder="Sub-category / subject" className="rounded-md border px-3 py-2 text-sm" />
          <select value={recurringForm.paymentMode} onChange={(e) => setRecurringForm({ ...recurringForm, paymentMode: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
            {paymentModes.map((mode) => <option key={mode}>{mode}</option>)}
          </select>
          <input type="number" min="1" max="31" value={recurringForm.dayOfMonth} onChange={(e) => setRecurringForm({ ...recurringForm, dayOfMonth: e.target.value })} placeholder="Day" className="rounded-md border px-3 py-2 text-sm" />
          <input type="month" value={recurringForm.endMonth} onChange={(e) => setRecurringForm({ ...recurringForm, endMonth: e.target.value })} className="rounded-md border px-3 py-2 text-sm" title="Optional end month" />
          <select value={recurringForm.status} onChange={(e) => setRecurringForm({ ...recurringForm, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
            <option>Active</option>
            <option>Paused</option>
          </select>
          <input value={recurringForm.remarks} onChange={(e) => setRecurringForm({ ...recurringForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recurringForm.billUploaded} onChange={(e) => setRecurringForm({ ...recurringForm, billUploaded: e.target.checked })} /> Voucher ready</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recurringForm.gstBill} onChange={(e) => setRecurringForm({ ...recurringForm, gstBill: e.target.checked })} /> GST bill</label>
          <Button className="md:col-span-2">Save Recurring Template</Button>
        </form>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recurringExpenses.map((template) => (
            <div key={template.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{template.templateName}</p>
                  <p className="text-sm text-slate-500">{template.category} - {template.subCategory || template.paidTo}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${template.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{template.status}</span>
              </div>
              <p className="mt-3 text-xl font-bold">{money(template.amount)}</p>
              <p className="text-sm text-slate-600">Start {template.startMonth} - Day {template.dayOfMonth} - Last generated {template.lastGeneratedMonth || 'Never'}</p>
              {canDelete ? (
                <Button type="button" variant="destructive" size="sm" onClick={() => deleteRecurringExpense(template.id).then(() => load())} className="mt-3">
                  Delete
                </Button>
              ) : null}
            </div>
          ))}
          {!recurringExpenses.length ? <p className="text-sm text-slate-500">No recurring templates yet.</p> : null}
        </div>
      </div>

        </TabsContent>

        <TabsContent value="vendors" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleVendor} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Vendor Management</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={vendorForm.vendorName} onChange={(e) => setVendorForm({ ...vendorForm, vendorName: e.target.value })} placeholder="Vendor name" className="rounded-md border px-3 py-2 text-sm" required />
            <select value={vendorForm.vendorType} onChange={(e) => setVendorForm({ ...vendorForm, vendorType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {vendorTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input value={vendorForm.mobileNumber} onChange={(e) => setVendorForm({ ...vendorForm, mobileNumber: e.target.value })} placeholder="Mobile" className="rounded-md border px-3 py-2 text-sm" />
            <input value={vendorForm.gstNumber} onChange={(e) => setVendorForm({ ...vendorForm, gstNumber: e.target.value })} placeholder="GST number" className="rounded-md border px-3 py-2 text-sm" />
            <input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} placeholder="Address" className="rounded-md border px-3 py-2 text-sm" />
            <input value={vendorForm.bankDetails} onChange={(e) => setVendorForm({ ...vendorForm, bankDetails: e.target.value })} placeholder="Bank details" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <Button className="mt-4">Add Vendor</Button>
          <div className="mt-4 space-y-2 text-sm">
            {vendors.slice(0, 6).map((vendor) => (
              <div key={vendor.id} className="rounded-lg bg-slate-50 p-3">
                <strong>{vendor.vendorName}</strong> - {vendor.vendorType} - paid {money(vendor.totalPaid)}
              </div>
            ))}
          </div>
        </form>
      </div>

        </TabsContent>

        <TabsContent value="petty-cash" className="space-y-6">
        <form onSubmit={handleCash} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Petty Cash Register</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="date" value={cashForm.date} onChange={(e) => setCashForm({ ...cashForm, date: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input value={cashForm.branch} onChange={(e) => setCashForm({ ...cashForm, branch: e.target.value })} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
            <select value={cashForm.cashFlowType} onChange={(e) => setCashForm({ ...cashForm, cashFlowType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              <option>Cash Added</option>
              <option>Cash Expense</option>
            </select>
            <input type="number" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} placeholder="Amount" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={cashForm.remarks} onChange={(e) => setCashForm({ ...cashForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm md:col-span-2" />
          </div>
          <Button className="mt-4">Add Cash Entry</Button>
          <div className="mt-4 space-y-2 text-sm">
            {pettyCash.slice(0, 6).map((entry) => (
              <div key={entry.id} className="rounded-lg bg-slate-50 p-3">
                <strong>{entry.date}</strong> - {entry.cashFlowType} {money(entry.amount)} - closing {money(entry.closingCash)}
              </div>
            ))}
          </div>
        </form>

        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="font-semibold">Monthly P&L and Reports</h3>
          <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }} className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ['Expense Ratio', `${reports?.totals?.expenseRatio || 0}%`],
            ['Profit Margin', `${reports?.totals?.profitMargin || 0}%`],
            ['Bill Compliance', `${reports?.totals?.billCompliance || 0}%`],
            ['Cash Expense Ratio', `${reports?.totals?.cashExpenseRatio || 0}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Report title="Category-wise" rows={reports?.categoryWise || []} labelKey="category" />
          <Report title="Vendor-wise" rows={reports?.vendorWise || []} labelKey="vendor" />
          <Report title="Branch-wise P&L" rows={reports?.branchWise || []} labelKey="branch" />
          <Report title="Bill Pending" rows={reports?.billPending || []} labelKey="expenseId" />
          <Report title="Approval Pending" rows={reports?.approvalPending || []} labelKey="expenseId" />
          <Report title="Marketing ROI" rows={reports ? [{ name: 'Marketing', amount: reports.marketingRoi.marketingSpend, count: reports.marketingRoi.admissions }] : []} labelKey="name" />
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Report({ title, rows, labelKey }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.slice(0, 8).map((row, index) => (
          <div key={index} className="rounded-lg bg-muted/40 p-3">
            <strong>{row[labelKey] || row.name}</strong>
            <p>{money(row.amount || row.expense || 0)} {row.profit !== undefined ? `profit ${money(row.profit)}` : ''}</p>
          </div>
        ))}
        {!rows.length ? <p className="text-muted-foreground">No rows yet.</p> : null}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, compact = false }) {
  return (
    <Card>
      <CardContent className={compact ? 'p-4' : 'p-5'}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={compact ? 'mt-1 text-xl font-bold' : 'mt-2 text-2xl font-bold'}>{value}</p>
      </CardContent>
    </Card>
  );
}
