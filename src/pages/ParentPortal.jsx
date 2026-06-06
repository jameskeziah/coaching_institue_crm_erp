import React, { useState } from 'react';
import { parentPortalLookup } from '../api';

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function ParentPortal() {
  const [form, setForm] = useState({ student_id: '', parentPhone: '' });
  const [portal, setPortal] = useState(null);
  const [error, setError] = useState('');

  async function handleLookup(e) {
    e.preventDefault();
    setError('');
    setPortal(null);
    try {
      setPortal(await parentPortalLookup(form));
    } catch (err) {
      setError(err.error || 'Could not open parent portal');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Parent Portal</h2>
        <p className="mt-1 text-sm text-slate-600">View your child&apos;s attendance, due fees, and receipt history using registered parent phone verification.</p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <form onSubmit={handleLookup} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="Student ID" className="rounded-md border px-3 py-2 text-sm" required />
          <input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} placeholder="Registered parent phone" className="rounded-md border px-3 py-2 text-sm" required />
          <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Open</button>
        </div>
      </form>

      {portal ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">{portal.student.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{portal.student.grade || '-'} - {portal.student.batch || '-'}</p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">Attendance</h3>
              <div className="mt-4 space-y-2 text-sm">
                {portal.attendance.map((row, index) => (
                  <div key={index} className="rounded-lg bg-slate-50 p-3">
                    <strong>{row.date}</strong> - {row.subject} - {row.status}
                    <p className="text-slate-500">{row.batch} - {row.teacherName || '-'}</p>
                  </div>
                ))}
                {!portal.attendance.length ? <p className="text-slate-500">No attendance records yet.</p> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">Fees</h3>
              <div className="mt-4 space-y-2 text-sm">
                {portal.fees.map((row, index) => (
                  <div key={index} className="rounded-lg bg-slate-50 p-3">
                    <strong>{row.course}</strong> - {row.feeStatus}
                    <p className="text-slate-600">Paid {money(row.paidAmount)} of {money(row.netAmount)}. Due {money(row.dueAmount)}.</p>
                    <p className="text-slate-500">Next due: {row.nextDueDate || '-'}</p>
                  </div>
                ))}
                {!portal.fees.length ? <p className="text-slate-500">No fee plans yet.</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Receipt History</h3>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              {portal.payments.map((payment) => (
                <div key={payment.receiptNumber} className="rounded-lg bg-slate-50 p-3">
                  <strong>{payment.receiptNumber}</strong>
                  <p>{money(payment.amount)} - {payment.paymentDate} - {payment.paymentMethod}</p>
                </div>
              ))}
              {!portal.payments.length ? <p className="text-slate-500">No payment receipts yet.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
