import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, PhoneCall, Trash2, UserPlus } from 'lucide-react';
import {
  createAdmission,
  createFeePlan,
  createStudent,
  deleteAdmission,
  fetchAdmissions,
  fetchFeeStructures,
  updateAdmission,
} from '../api';
import { useAuth } from '../AuthContext';

const pipelineStages = ['New Lead', 'Contacted', 'Demo Scheduled', 'Demo Done', 'Follow-up', 'Converted', 'Lost'];
const leadTemperatures = ['Hot', 'Warm', 'Cold'];
const callOutcomes = ['Not Called', 'Connected', 'No Answer', 'Interested', 'Not Interested', 'Call Back'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function defaultForm() {
  return {
    name: '',
    program: '',
    status: 'New Lead',
    source: '',
    data: {
      phone: '',
      className: '',
      school: '',
      branch: 'Tembhurni',
      academicYear: '2026-27',
      counsellor: '',
      leadTemperature: 'Warm',
      nextFollowUpDate: today(),
      followUpNotes: '',
      callOutcome: 'Not Called',
      demoSubject: '',
      demoTeacher: '',
      demoDate: '',
      studentFeedback: '',
      parentFeedback: '',
      estimatedRevenue: '',
    },
  };
}

function normalizeStatus(status) {
  if (!status) return 'New Lead';
  const found = pipelineStages.find((stage) => stage.toLowerCase() === String(status).toLowerCase());
  if (found) return found;
  if (String(status).toLowerCase() === 'new lead') return 'New Lead';
  return status;
}

export default function Admissions() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [admissionRows, structureRows] = await Promise.all([fetchAdmissions(), fetchFeeStructures()]);
      setItems(admissionRows.map((item) => ({ ...item, status: normalizeStatus(item.status), data: item.data || {} })));
      setFeeStructures(structureRows.filter((row) => row.status !== 'Inactive'));
    } catch (e) {
      setError(e.error || 'Could not load admissions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dashboard = useMemo(() => {
    const todayDate = today();
    const thisMonth = todayDate.slice(0, 7);
    const activeLeads = items.filter((item) => !['Converted', 'Lost'].includes(item.status));
    const missedFollowUps = activeLeads.filter((item) => item.data?.nextFollowUpDate && item.data.nextFollowUpDate < todayDate);
    const demoToday = activeLeads.filter((item) => item.data?.demoDate === todayDate);
    const hotLeads = activeLeads.filter((item) => item.data?.leadTemperature === 'Hot');
    const leadsThisMonth = items.filter((item) => String(item.data?.createdDate || '').startsWith(thisMonth) || !item.data?.createdDate);
    const converted = items.filter((item) => item.status === 'Converted').length;
    const revenuePipeline = activeLeads.reduce((sum, item) => sum + Number(item.data?.estimatedRevenue || 0), 0);
    return {
      activeLeads: activeLeads.length,
      hotLeads: hotLeads.length,
      missedFollowUps,
      demoToday,
      conversionRate: items.length ? Math.round((converted / items.length) * 100) : 0,
      leadsThisMonth: leadsThisMonth.length,
      revenuePipeline,
    };
  }, [items]);

  const grouped = useMemo(() => {
    return pipelineStages.reduce((acc, stage) => {
      acc[stage] = items.filter((item) => normalizeStatus(item.status) === stage);
      return acc;
    }, {});
  }, [items]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateData(field, value) {
    setForm((current) => ({ ...current, data: { ...current.data, [field]: value } }));
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      name: entry.name || '',
      program: entry.program || '',
      status: normalizeStatus(entry.status),
      source: entry.source || '',
      data: { ...defaultForm().data, ...(entry.data || {}) },
    });
    setSelectedFeeStructureId('');
    setMessage('');
    setError('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm());
    setSelectedFeeStructureId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const payload = {
        ...form,
        status: normalizeStatus(form.status),
        data: { ...form.data, createdDate: form.data.createdDate || today() },
      };
      if (editingId) {
        await updateAdmission(editingId, payload);
        setMessage('Lead updated.');
      } else {
        await createAdmission(payload);
        setMessage('Lead added to pipeline.');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e.error || 'Save failed');
    }
  }

  async function updateStage(entry, status) {
    await updateAdmission(entry.id, { ...entry, status, data: entry.data || {} });
    setMessage(`${entry.name} moved to ${status}.`);
    await load();
  }

  async function handleConvert(entry) {
    setMessage('');
    setError('');
    try {
      const structure = feeStructures.find((item) => String(item.id) === String(selectedFeeStructureId))
        || feeStructures.find((item) => item.courseName === entry.program)
        || feeStructures[0];
      const student = await createStudent({
        name: entry.name,
        grade: entry.data?.className || '',
        batch: entry.program || '',
        attendance: '',
        data: {
          primaryPhone: entry.data?.phone || '',
          whatsapp: entry.data?.phone || '',
          school: entry.data?.school || '',
          branch: entry.data?.branch || 'Tembhurni',
          academicYear: entry.data?.academicYear || '2026-27',
          admissionSource: entry.source || '',
          admissionLeadId: entry.id,
        },
      });
      if (structure?.id) {
        await createFeePlan({
          student_id: student.id,
          courseProgram: structure.courseName,
          feeCategory: structure.courseName,
          paymentType: structure.paymentType || 'Installment',
          totalAmount: Number(structure.feeAmount || entry.data?.estimatedRevenue || 0),
          dueDate: today(),
          installmentLabel: 'Admission fee plan',
          notes: `Created from admission lead ${entry.name}`,
        });
      }
      await updateAdmission(entry.id, {
        ...entry,
        status: 'Converted',
        data: { ...(entry.data || {}), convertedStudentId: student.id, convertedDate: today(), feeStructureId: structure?.id || '' },
      });
      setMessage(`${entry.name} converted to student${structure?.id ? ' with fee plan' : ''}.`);
      await load();
    } catch (e) {
      setError(e.error || 'Conversion failed');
    }
  }

  async function handleDelete(id) {
    await deleteAdmission(id);
    setMessage('Lead deleted.');
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">CRM Pipeline</p>
        <h2 className="mt-2 text-2xl font-bold">Admissions</h2>
        <p className="mt-1 text-sm text-slate-600">Move enquiries from lead to follow-up, demo, conversion, student record, and fee plan.</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Leads This Month" value={dashboard.leadsThisMonth} />
        <Metric label="Active Leads" value={dashboard.activeLeads} />
        <Metric label="Hot Leads" value={dashboard.hotLeads} />
        <Metric label="Missed Follow-ups" value={dashboard.missedFollowUps.length} tone="risk" />
        <Metric label="Demo Today" value={dashboard.demoToday.length} />
        <Metric label="Pipeline Value" value={money(dashboard.revenuePipeline)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold">{editingId ? 'Edit Lead' : 'Add Lead'}</h3>
          </div>
          <div className="mt-4 grid gap-3">
            <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Student name" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={form.data.phone} onChange={(e) => updateData('phone', e.target.value)} placeholder="Parent phone / WhatsApp" className="rounded-md border px-3 py-2 text-sm" />
            <input value={form.program} onChange={(e) => updateField('program', e.target.value)} placeholder="Course / target" className="rounded-md border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.data.className} onChange={(e) => updateData('className', e.target.value)} placeholder="Class" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.school} onChange={(e) => updateData('school', e.target.value)} placeholder="School" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.data.branch} onChange={(e) => updateData('branch', e.target.value)} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.academicYear} onChange={(e) => updateData('academicYear', e.target.value)} placeholder="Academic year" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <input value={form.source} onChange={(e) => updateField('source', e.target.value)} placeholder="Source, e.g. walk-in, referral, ad" className="rounded-md border px-3 py-2 text-sm" />
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              {pipelineStages.map((stage) => <option key={stage}>{stage}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.data.leadTemperature} onChange={(e) => updateData('leadTemperature', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                {leadTemperatures.map((temperature) => <option key={temperature}>{temperature}</option>)}
              </select>
              <select value={form.data.callOutcome} onChange={(e) => updateData('callOutcome', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                {callOutcomes.map((outcome) => <option key={outcome}>{outcome}</option>)}
              </select>
            </div>
            <input type="date" value={form.data.nextFollowUpDate} onChange={(e) => updateData('nextFollowUpDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <textarea value={form.data.followUpNotes} onChange={(e) => updateData('followUpNotes', e.target.value)} placeholder="Follow-up notes" className="h-20 rounded-md border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.data.demoSubject} onChange={(e) => updateData('demoSubject', e.target.value)} placeholder="Demo subject" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.demoTeacher} onChange={(e) => updateData('demoTeacher', e.target.value)} placeholder="Demo teacher" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <input type="date" value={form.data.demoDate} onChange={(e) => updateData('demoDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <textarea value={form.data.parentFeedback} onChange={(e) => updateData('parentFeedback', e.target.value)} placeholder="Parent feedback after demo" className="h-16 rounded-md border px-3 py-2 text-sm" />
            <input type="number" value={form.data.estimatedRevenue} onChange={(e) => updateData('estimatedRevenue', e.target.value)} placeholder="Estimated revenue" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{editingId ? 'Save Lead' : 'Add Lead'}</button>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm">Cancel</button> : null}
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Pipeline Board</h3>
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : null}
            <div className="mt-4 grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              {pipelineStages.map((stage) => (
                <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">{stage}</h4>
                    <span className="rounded-full bg-white px-2 py-1 text-xs">{grouped[stage]?.length || 0}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(grouped[stage] || []).slice(0, 8).map((entry) => (
                      <LeadCard
                        key={entry.id}
                        entry={entry}
                        onEdit={() => startEdit(entry)}
                        onStage={(status) => updateStage(entry, status)}
                        onConvert={() => handleConvert(entry)}
                        onDelete={isAdmin ? () => handleDelete(entry.id) : null}
                        feeStructures={feeStructures}
                        selectedFeeStructureId={selectedFeeStructureId}
                        setSelectedFeeStructureId={setSelectedFeeStructureId}
                      />
                    ))}
                    {!grouped[stage]?.length ? <p className="text-xs text-slate-500">No leads.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <List title="Missed Follow-ups" icon={PhoneCall} rows={dashboard.missedFollowUps} empty="No missed follow-ups." render={(entry) => (
              <span><strong>{entry.name}</strong> - {entry.data?.nextFollowUpDate} - {entry.data?.callOutcome || 'Not called'}</span>
            )} />
            <List title="Demo Scheduled Today" icon={CalendarDays} rows={dashboard.demoToday} empty="No demos today." render={(entry) => (
              <span><strong>{entry.name}</strong> - {entry.data?.demoSubject || entry.program} - {entry.data?.demoTeacher || '-'}</span>
            )} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone === 'risk' ? 'text-rose-700' : ''}`}>{value}</p>
    </div>
  );
}

function LeadCard({ entry, onEdit, onStage, onConvert, onDelete, feeStructures, selectedFeeStructureId, setSelectedFeeStructureId }) {
  const data = entry.data || {};
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{entry.name}</p>
          <p className="text-xs text-slate-500">{entry.program || '-'} - {data.phone || '-'}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${data.leadTemperature === 'Hot' ? 'bg-rose-50 text-rose-700' : data.leadTemperature === 'Cold' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
          {data.leadTemperature || 'Warm'}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">Follow-up: {data.nextFollowUpDate || '-'} - {data.callOutcome || 'Not Called'}</p>
      <p className="text-xs text-slate-600">Demo: {data.demoDate || '-'} {data.demoSubject ? `- ${data.demoSubject}` : ''}</p>
      {data.followUpNotes ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{data.followUpNotes}</p> : null}
      <div className="mt-3 grid gap-2">
        <select value={entry.status} onChange={(e) => onStage(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
          {pipelineStages.map((stage) => <option key={stage}>{stage}</option>)}
        </select>
        {entry.status !== 'Converted' ? (
          <>
            <select value={selectedFeeStructureId} onChange={(e) => setSelectedFeeStructureId(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
              <option value="">Auto fee structure</option>
              {feeStructures.map((fee) => <option key={fee.id} value={fee.id}>{fee.courseName} - {money(fee.feeAmount)}</option>)}
            </select>
            <button onClick={onConvert} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> Convert
            </button>
          </>
        ) : null}
        <div className="flex gap-2">
          <button onClick={onEdit} className="rounded-md border px-3 py-1 text-xs">Edit</button>
          {onDelete ? <button onClick={onDelete} className="rounded-md bg-rose-500 px-3 py-1 text-xs text-white"><Trash2 className="inline h-3 w-3" /> Delete</button> : null}
        </div>
      </div>
    </div>
  );
}

function List({ title, icon: Icon, rows, empty, render }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-slate-500" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {rows.slice(0, 8).map((row) => <div key={row.id} className="rounded-lg bg-slate-50 p-3">{render(row)}</div>)}
        {!rows.length ? <p className="text-slate-500">{empty}</p> : null}
      </div>
    </div>
  );
}
