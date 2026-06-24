import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, PhoneCall, Trash2, UserPlus } from 'lucide-react';
import {
  createAdmission,
  createFeePlan,
  createStudent,
  deleteAdmission,
  fetchAdmissions,
  fetchBatches,
  fetchBranches,
  fetchCourses,
  fetchFeeStructures,
  getCounsellors,
  getLeadActivities,
  createLeadActivity,
  assignLeadCounsellor,
  updateAdmission,
} from '../api';
import { useAuth } from '../AuthContext';
import AddLeadActivityForm from '@/components/leads/AddLeadActivityForm';
import LeadActivityTimeline from '@/components/leads/LeadActivityTimeline';

const pipelineStages = [
  { value: 'NEW', label: 'New Lead' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'COUNSELLING_SCHEDULED', label: 'Counselling Scheduled' },
  { value: 'COUNSELLING_DONE', label: 'Counselling Done' },
  { value: 'DEMO_SCHEDULED', label: 'Demo Scheduled' },
  { value: 'DEMO_DONE', label: 'Demo Done' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'COLD', label: 'Cold' },
];

const leadTemperatures = ['HOT', 'WARM', 'COLD'];
const callOutcomes = ['Not Called', 'Connected', 'No Answer', 'Interested', 'Not Interested', 'Call Back'];
const leadSources = ['FACEBOOK', 'WALK_IN', 'REFERRAL', 'SCHOOL_VISIT', 'BANNER', 'SEMINAR', 'GOOGLE_ADS', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'OTHER'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function defaultForm() {
  return {
    studentName: '',
    parentName: '',
    parentPhone: '',
    className: '',
    school: '',
    courseInterested: '',
    targetExam: '',
    branchId: '',
    source: '',
    subSource: '',
    campaign: '',
    counsellorId: '',
    status: 'NEW',
    leadTemperature: 'WARM',
    nextFollowUpAt: today(),
    lastContactedAt: '',
    demoDate: '',
    demoTeacherId: '',
    estimatedRevenue: '',
    lostReason: '',
    customFields: {
      academicYear: '2026-27',
      followUpNotes: '',
      callOutcome: 'Not Called',
      demoSubject: '',
      studentFeedback: '',
      parentFeedback: '',
    },
  };
}

function normalizeStatus(status) {
  if (!status) return 'NEW';
  const raw = String(status).trim();
  const upper = raw.toUpperCase();
  const stage = pipelineStages.find((item) => item.value === upper || item.label.toLowerCase() === raw.toLowerCase());
  if (stage) return stage.value;
  if (raw.toLowerCase() === 'converted') return 'WON';
  if (raw.toLowerCase() === 'lost' || raw.toLowerCase() === 'rejected') return 'LOST';
  return 'NEW';
}

function normalizeTemperature(value) {
  const upper = String(value || 'WARM').toUpperCase();
  return leadTemperatures.includes(upper) ? upper : 'WARM';
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

function stageLabel(value) {
  return pipelineStages.find((stage) => stage.value === normalizeStatus(value))?.label || value || 'New Lead';
}

function formFromEntry(entry) {
  const data = entry.data || {};
  return {
    ...defaultForm(),
    studentName: entry.studentName || entry.name || '',
    parentName: entry.parentName || '',
    parentPhone: entry.parentPhone || data.phone || '',
    className: entry.className || data.className || '',
    school: entry.school || data.school || '',
    courseInterested: entry.courseInterested || entry.program || '',
    targetExam: entry.targetExam || '',
    branchId: entry.branchId || '',
    source: entry.source || '',
    subSource: entry.subSource || '',
    campaign: entry.campaign || '',
    counsellorId: entry.counsellorId || data.counsellor || '',
    status: normalizeStatus(entry.status),
    leadTemperature: normalizeTemperature(entry.leadTemperature || data.leadTemperature),
    nextFollowUpAt: dateOnly(entry.nextFollowUpAt || data.nextFollowUpDate) || today(),
    lastContactedAt: dateOnly(entry.lastContactedAt),
    demoDate: dateOnly(entry.demoDate || data.demoDate),
    demoTeacherId: entry.demoTeacherId || data.demoTeacher || '',
    estimatedRevenue: entry.estimatedRevenue || data.estimatedRevenue || '',
    lostReason: entry.lostReason || '',
    customFields: {
      ...defaultForm().customFields,
      ...(data || {}),
      academicYear: entry.customFields?.academicYear || data.academicYear || '2026-27',
      followUpNotes: entry.customFields?.followUpNotes || data.followUpNotes || '',
      callOutcome: entry.customFields?.callOutcome || data.callOutcome || 'Not Called',
      demoSubject: entry.customFields?.demoSubject || data.demoSubject || '',
      studentFeedback: entry.customFields?.studentFeedback || data.studentFeedback || '',
      parentFeedback: entry.customFields?.parentFeedback || data.parentFeedback || '',
    },
  };
}

function toPayload(form) {
  return {
    studentName: form.studentName,
    parentName: form.parentName,
    parentPhone: form.parentPhone,
    className: form.className,
    school: form.school,
    courseInterested: form.courseInterested,
    targetExam: form.targetExam,
    branchId: form.branchId,
    source: form.source,
    subSource: form.subSource,
    campaign: form.campaign,
    counsellorId: form.counsellorId,
    status: form.status,
    leadTemperature: form.leadTemperature,
    nextFollowUpAt: form.nextFollowUpAt || null,
    lastContactedAt: form.lastContactedAt || null,
    demoDate: form.demoDate || null,
    demoTeacherId: form.demoTeacherId,
    estimatedRevenue: Number(form.estimatedRevenue || 0),
    lostReason: form.lostReason,
    customFields: form.customFields,
  };
}

export default function Admissions() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [counsellors, setCounsellors] = useState([]);
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [duplicatePayload, setDuplicatePayload] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [admissionRows, structureRows, counsellorRows, branchRows, courseRows, batchRows] = await Promise.all([
        fetchAdmissions(), fetchFeeStructures(), getCounsellors(), fetchBranches(), fetchCourses(), fetchBatches(),
      ]);
      const normalizedRows = admissionRows.map((item) => ({
        ...item,
        status: normalizeStatus(item.status),
        leadTemperature: normalizeTemperature(item.leadTemperature || item.data?.leadTemperature),
      }));
      setItems(normalizedRows);
      setFeeStructures(structureRows.filter((row) => row.status !== 'Inactive'));
      setCounsellors(counsellorRows.data || []);
      setBranches(branchRows);
      setCourses(courseRows);
      setBatches(batchRows);
      setSelectedLeadId((current) => {
        if (current && normalizedRows.some((row) => String(row.id) === String(current))) return current;
        return normalizedRows[0]?.id || null;
      });
    } catch (e) {
      setError(e.error || e.message || 'Could not load admissions');
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
    const activeLeads = items.filter((item) => !['WON', 'LOST'].includes(item.status));
    const missedFollowUps = activeLeads.filter((item) => {
      const followUpDate = dateOnly(item.nextFollowUpAt || item.data?.nextFollowUpDate);
      return followUpDate && followUpDate < todayDate;
    });
    const demoToday = activeLeads.filter((item) => dateOnly(item.demoDate || item.data?.demoDate) === todayDate);
    const hotLeads = activeLeads.filter((item) => item.leadTemperature === 'HOT');
    const leadsThisMonth = items.filter((item) => String(item.created_at || item.createdAt || '').startsWith(thisMonth));
    const converted = items.filter((item) => item.status === 'WON').length;
    const revenuePipeline = activeLeads.reduce((sum, item) => sum + Number(item.estimatedRevenue || item.data?.estimatedRevenue || 0), 0);
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
      acc[stage.value] = items.filter((item) => normalizeStatus(item.status) === stage.value);
      return acc;
    }, {});
  }, [items]);

  const selectedLead = useMemo(() => {
    return items.find((item) => String(item.id) === String(selectedLeadId)) || null;
  }, [items, selectedLeadId]);

  async function loadActivities(leadId = selectedLeadId) {
    if (!leadId) {
      setActivities([]);
      return;
    }

    setLoadingActivities(true);
    try {
      const result = await getLeadActivities(leadId);
      setActivities(result.data || []);
    } catch (e) {
      setError(e.error || e.message || 'Could not load lead activity timeline');
    } finally {
      setLoadingActivities(false);
    }
  }

  useEffect(() => {
    loadActivities(selectedLeadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateCustomField(field, value) {
    setForm((current) => ({ ...current, customFields: { ...current.customFields, [field]: value } }));
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm(formFromEntry(entry));
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
    setDuplicateWarning(null);
    try {
      if (editingId) {
        await updateAdmission(editingId, toPayload(form));
        setMessage('Lead updated.');
      } else {
        await createAdmission(toPayload(form));
        setMessage('Lead added to pipeline.');
      }
      resetForm();
      await load();
    } catch (e) {
      if (e.code === 'DUPLICATE_LEAD_WARNING') {
        setDuplicateWarning({
          warning: e.warning || e.message || 'Possible duplicate lead',
          duplicates: e.duplicates || [],
        });
        setDuplicatePayload(toPayload(form));
        return;
      }
      setError(e.error || e.message || 'Save failed');
    }
  }

  async function createDuplicateAnyway() {
    if (!duplicatePayload) return;
    setError('');
    setDuplicateWarning(null);
    try {
      await createAdmission({ ...duplicatePayload, ignoreDuplicateWarning: true });
      setDuplicatePayload(null);
      resetForm();
      setMessage('Lead added to pipeline.');
      await load();
    } catch (e) {
      setError(e.error || e.message || 'Save failed');
    }
  }

  async function updateStage(entry, status) {
    await updateAdmission(entry.id, { status });
    setMessage(`${entry.studentName || entry.name} moved to ${stageLabel(status)}.`);
    await load();
    if (String(entry.id) === String(selectedLeadId)) await loadActivities(entry.id);
  }

  async function handleConvert(entry) {
    setMessage('');
    setError('');
    try {
      const structure = feeStructures.find((item) => String(item.id) === String(selectedFeeStructureId))
        || feeStructures.find((item) => item.courseName === entry.courseInterested)
        || feeStructures[0];
      const branch = branches.find((item) => String(item.id) === String(entry.branchId))
        || branches.find((item) => item.name === entry.branchId || item.code === entry.branchId);
      const course = courses.find((item) => item.name === entry.courseInterested)
        || courses.find((item) => String(item.classLevel || '') === String(entry.className || ''));
      const batch = batches.find((item) => String(item.branchId) === String(branch?.id)
        && String(item.courseId) === String(course?.id)
        && item.status === 'ACTIVE');
      if (!branch || !course || !batch) {
        throw new Error('Set up an active branch, course, and matching batch before converting this lead');
      }
      const student = await createStudent({
        name: entry.studentName || entry.name,
        grade: entry.className || '',
        batch: batch.name,
        attendance: '',
        branchId: branch.id,
        primaryCourseId: course.id,
        primaryBatchId: batch.id,
        parentName: entry.parentName || '',
        parentPhone: entry.parentPhone || '',
        schoolName: entry.school || '',
        admissionId: entry.id,
        convertedFromLeadId: entry.id,
        status: 'ACTIVE',
        data: {
          primaryPhone: entry.parentPhone || '',
          whatsapp: entry.parentPhone || '',
          school: entry.school || '',
          branch: branch.name,
          course: course.name,
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
          totalAmount: Number(structure.feeAmount || entry.estimatedRevenue || 0),
          dueDate: today(),
          installmentLabel: 'Admission fee plan',
          notes: `Created from admission lead ${entry.studentName || entry.name}`,
        });
      }
      await updateAdmission(entry.id, {
        status: 'WON',
        convertedStudentId: student.id,
        convertedAt: today(),
        customFields: { ...(entry.data || {}), feeStructureId: structure?.id || '' },
      });
      setMessage(`${entry.studentName || entry.name} converted to student${structure?.id ? ' with fee plan' : ''}.`);
      await load();
      if (String(entry.id) === String(selectedLeadId)) await loadActivities(entry.id);
    } catch (e) {
      setError(e.error || e.message || 'Conversion failed');
    }
  }

  async function handleDelete(id) {
    await deleteAdmission(id);
    setMessage('Lead deleted.');
    await load();
  }

  async function handleCreateActivity(leadId, payload) {
    setError('');
    await createLeadActivity(leadId, payload);
    await loadActivities(leadId);
    setMessage('Lead activity added.');
  }

  async function handleAssignCounsellor(entry, counsellorId) {
    await assignLeadCounsellor(entry.id, counsellorId);
    setMessage('Counsellor assigned.');
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
      {duplicateWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">{duplicateWarning.warning}</p>
          {duplicateWarning.duplicates?.length ? (
            <div className="mt-2 space-y-1">
              {duplicateWarning.duplicates.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="block text-left underline"
                >
                  View existing lead: {lead.studentName || lead.parentPhone} ({lead.status})
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={createDuplicateAnyway} className="rounded-md bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Create anyway</button>
            <button type="button" onClick={() => { setDuplicateWarning(null); setDuplicatePayload(null); }} className="rounded-md border px-3 py-1 text-xs">Cancel</button>
          </div>
        </div>
      ) : null}

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
            <input value={form.studentName} onChange={(e) => updateField('studentName', e.target.value)} placeholder="Student name" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={form.parentName} onChange={(e) => updateField('parentName', e.target.value)} placeholder="Parent name" className="rounded-md border px-3 py-2 text-sm" />
            <input value={form.parentPhone} onChange={(e) => updateField('parentPhone', e.target.value)} placeholder="Parent phone / WhatsApp" className="rounded-md border px-3 py-2 text-sm" required />
            <select value={form.courseInterested} onChange={(e) => updateField('courseInterested', e.target.value)} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Course interested</option>
              {courses.filter((course) => course.isActive).map((course) => <option key={course.id} value={course.name}>{course.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.className} onChange={(e) => updateField('className', e.target.value)} placeholder="Class" className="rounded-md border px-3 py-2 text-sm" required />
              <input value={form.targetExam} onChange={(e) => updateField('targetExam', e.target.value)} placeholder="Target exam" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <input value={form.school} onChange={(e) => updateField('school', e.target.value)} placeholder="School" className="rounded-md border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.branchId} onChange={(e) => updateField('branchId', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                <option value="">Select branch</option>
                {branches.filter((branch) => branch.isActive).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <input value={form.customFields.academicYear} onChange={(e) => updateCustomField('academicYear', e.target.value)} placeholder="Academic year" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.source} onChange={(e) => updateField('source', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                <option value="">Source</option>
                {leadSources.map((source) => <option key={source} value={source}>{source.replace(/_/g, ' ')}</option>)}
              </select>
              <input value={form.subSource} onChange={(e) => updateField('subSource', e.target.value)} placeholder="Sub-source" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.campaign} onChange={(e) => updateField('campaign', e.target.value)} placeholder="Campaign" className="rounded-md border px-3 py-2 text-sm" />
              <select value={form.counsellorId} onChange={(e) => updateField('counsellorId', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                <option value="">Assign counsellor</option>
                {counsellors.map((counsellor) => <option key={counsellor.id} value={counsellor.id}>{counsellor.fullName}</option>)}
              </select>
            </div>
            <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              {pipelineStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.leadTemperature} onChange={(e) => updateField('leadTemperature', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                {leadTemperatures.map((temperature) => <option key={temperature}>{temperature}</option>)}
              </select>
              <select value={form.customFields.callOutcome} onChange={(e) => updateCustomField('callOutcome', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
                {callOutcomes.map((outcome) => <option key={outcome}>{outcome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={form.nextFollowUpAt} onChange={(e) => updateField('nextFollowUpAt', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
              <input type="date" value={form.lastContactedAt} onChange={(e) => updateField('lastContactedAt', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <textarea value={form.customFields.followUpNotes} onChange={(e) => updateCustomField('followUpNotes', e.target.value)} placeholder="Follow-up notes" className="h-20 rounded-md border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.customFields.demoSubject} onChange={(e) => updateCustomField('demoSubject', e.target.value)} placeholder="Demo subject" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.demoTeacherId} onChange={(e) => updateField('demoTeacherId', e.target.value)} placeholder="Demo teacher" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <input type="date" value={form.demoDate} onChange={(e) => updateField('demoDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <textarea value={form.customFields.parentFeedback} onChange={(e) => updateCustomField('parentFeedback', e.target.value)} placeholder="Parent feedback after demo" className="h-16 rounded-md border px-3 py-2 text-sm" />
            <input type="number" value={form.estimatedRevenue} onChange={(e) => updateField('estimatedRevenue', e.target.value)} placeholder="Estimated revenue" className="rounded-md border px-3 py-2 text-sm" />
            {form.status === 'LOST' ? (
              <textarea value={form.lostReason} onChange={(e) => updateField('lostReason', e.target.value)} placeholder="Lost reason" className="h-16 rounded-md border px-3 py-2 text-sm" />
            ) : null}
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
                <div key={stage.value} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">{stage.label}</h4>
                    <span className="rounded-full bg-white px-2 py-1 text-xs">{grouped[stage.value]?.length || 0}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(grouped[stage.value] || []).slice(0, 8).map((entry) => (
                      <LeadCard
                        key={entry.id}
                        entry={entry}
                        onEdit={() => startEdit(entry)}
                        onSelect={() => setSelectedLeadId(entry.id)}
                        selected={String(entry.id) === String(selectedLeadId)}
                        counsellors={counsellors}
                        onAssignCounsellor={(counsellorId) => handleAssignCounsellor(entry, counsellorId)}
                        onStage={(status) => updateStage(entry, status)}
                        onConvert={() => handleConvert(entry)}
                        onDelete={isAdmin ? () => handleDelete(entry.id) : null}
                        feeStructures={feeStructures}
                        selectedFeeStructureId={selectedFeeStructureId}
                        setSelectedFeeStructureId={setSelectedFeeStructureId}
                      />
                    ))}
                    {!grouped[stage.value]?.length ? <p className="text-xs text-slate-500">No leads.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
            {selectedLead ? (
              <>
                <AddLeadActivityForm leadId={selectedLead.id} onCreate={handleCreateActivity} />
                {loadingActivities ? (
                  <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Loading activity timeline...
                  </div>
                ) : (
                  <LeadActivityTimeline activities={activities} />
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 xl:col-span-2">
                Select a lead to view the activity timeline.
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <List title="Missed Follow-ups" icon={PhoneCall} rows={dashboard.missedFollowUps} empty="No missed follow-ups." render={(entry) => (
              <span><strong>{entry.studentName || entry.name}</strong> - {dateOnly(entry.nextFollowUpAt || entry.data?.nextFollowUpDate)} - {entry.data?.callOutcome || 'Not called'}</span>
            )} />
            <List title="Demo Scheduled Today" icon={CalendarDays} rows={dashboard.demoToday} empty="No demos today." render={(entry) => (
              <span><strong>{entry.studentName || entry.name}</strong> - {entry.data?.demoSubject || entry.courseInterested} - {entry.demoTeacherId || '-'}</span>
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

function LeadCard({ entry, onEdit, onSelect, selected, counsellors, onAssignCounsellor, onStage, onConvert, onDelete, feeStructures, selectedFeeStructureId, setSelectedFeeStructureId }) {
  const data = entry.data || {};
  const temperature = normalizeTemperature(entry.leadTemperature || data.leadTemperature);
  return (
    <div className={`rounded-xl bg-white p-3 shadow-sm ${selected ? 'ring-2 ring-slate-900' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{entry.studentName || entry.name}</p>
          <p className="text-xs text-slate-500">{entry.courseInterested || '-'} - {entry.parentPhone || data.phone || '-'}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${temperature === 'HOT' ? 'bg-rose-50 text-rose-700' : temperature === 'COLD' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
          {temperature}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">Follow-up: {dateOnly(entry.nextFollowUpAt || data.nextFollowUpDate) || '-'} - {data.callOutcome || 'Not Called'}</p>
      <p className="text-xs text-slate-600">Demo: {dateOnly(entry.demoDate || data.demoDate) || '-'} {data.demoSubject ? `- ${data.demoSubject}` : ''}</p>
      {data.followUpNotes ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{data.followUpNotes}</p> : null}
      <div className="mt-3 grid gap-2">
        <select value={normalizeStatus(entry.status)} onChange={(e) => onStage(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
          {pipelineStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
        </select>
        <select value={entry.counsellorId || ''} onChange={(e) => onAssignCounsellor(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
          <option value="">Assign counsellor</option>
          {counsellors.map((counsellor) => <option key={counsellor.id} value={counsellor.id}>{counsellor.fullName}</option>)}
        </select>
        {entry.status !== 'WON' ? (
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
          <button onClick={onSelect} className="rounded-md border px-3 py-1 text-xs">Timeline</button>
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
