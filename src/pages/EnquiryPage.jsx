import { useEffect, useMemo, useState } from 'react';
import { getPublicBranches, submitPublicEnquiry } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const leadSources = ['FACEBOOK', 'WALK_IN', 'REFERRAL', 'SCHOOL_VISIT', 'BANNER', 'SEMINAR', 'GOOGLE_ADS', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'OTHER'];

export default function EnquiryPage() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const tenant = query.get('tenant') || 'miraku';
  const source = leadSources.includes(query.get('source')) ? query.get('source') : 'WEBSITE';
  const campaign = query.get('campaign') || '';

  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    studentName: '',
    parentName: '',
    parentPhone: '',
    className: '',
    targetExam: '',
    branchId: '',
    website: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [duplicatePayload, setDuplicatePayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadBranches() {
      try {
        const result = await getPublicBranches(tenant);
        setBranches(result.data || []);
        if (result.data?.length === 1) {
          setForm((current) => ({ ...current, branchId: result.data[0].id }));
        }
      } catch (err) {
        setError(err.message || err.error || 'Failed to load branches');
      }
    }
    loadBranches();
  }, [tenant]);

  async function submit(event, overridePayload = null) {
    event?.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');
    setDuplicateWarning('');

    const payload = overridePayload || { tenant, source, campaign, ...form };
    try {
      await submitPublicEnquiry(payload);
      setMessage('Thank you. Our counsellor will contact you soon.');
      setDuplicatePayload(null);
      setForm({
        studentName: '',
        parentName: '',
        parentPhone: '',
        className: '',
        targetExam: '',
        branchId: branches.length === 1 ? branches[0].id : '',
        website: '',
      });
    } catch (err) {
      if (err.code === 'DUPLICATE_LEAD_WARNING') {
        setDuplicateWarning(err.warning || err.message || 'Possible duplicate enquiry');
        setDuplicatePayload(payload);
      } else {
        setError(err.message || err.error || 'Failed to submit enquiry');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function createAnyway() {
    if (!duplicatePayload) return;
    await submit(null, { ...duplicatePayload, ignoreDuplicateWarning: true });
  }

  return (
    <main className="min-h-screen bg-[#f8faf7] px-5 py-10 text-slate-950">
      <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <div className="inline-flex rounded-md bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            Admission Enquiry
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-normal">Start your admission enquiry</h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Fill the form and our counsellor will contact you with batch details, fees, demo class availability, and admission guidance.
          </p>
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Source: <strong>{source}</strong>
            {campaign ? (
              <>
                <br />
                Campaign: <strong>{campaign}</strong>
              </>
            ) : null}
          </div>
        </div>

        <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4">
            <Input required placeholder="Student name" value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} />
            <Input placeholder="Parent name" value={form.parentName} onChange={(event) => setForm({ ...form, parentName: event.target.value })} />
            <Input required placeholder="Parent phone" value={form.parentPhone} onChange={(event) => setForm({ ...form, parentPhone: event.target.value })} />
            <Input required placeholder="Class" value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} />
            <Input placeholder="Target exam, for example JEE, NEET, Foundation, MHT-CET" value={form.targetExam} onChange={(event) => setForm({ ...form, targetExam: event.target.value })} />
            <select required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}{branch.city ? ` - ${branch.city}` : ''}
                </option>
              ))}
            </select>

            <input tabIndex="-1" autoComplete="off" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} className="hidden" placeholder="Website" />

            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit enquiry'}</Button>

            {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
            {duplicateWarning ? (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                <p>{duplicateWarning}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={createAnyway}>Create anyway</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setDuplicateWarning(''); setDuplicatePayload(null); }}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          </div>
        </form>
      </section>
    </main>
  );
}
