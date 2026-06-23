import { useState } from 'react';
import { Button } from '@/components/ui/button';

const activityTypes = [
  { value: 'CALL_NOTE', label: 'Call note' },
  { value: 'WHATSAPP_NOTE', label: 'WhatsApp note' },
  { value: 'VISIT_NOTE', label: 'Visit note' },
  { value: 'COUNSELLING_NOTE', label: 'Counselling note' },
  { value: 'DEMO_SCHEDULED', label: 'Demo scheduled' },
  { value: 'DEMO_COMPLETED', label: 'Demo completed' },
  { value: 'FEE_DISCUSSED', label: 'Fee discussed' },
  { value: 'FOLLOW_UP_CREATED', label: 'Follow-up' },
];

export default function AddLeadActivityForm({ leadId, onCreate }) {
  const [type, setType] = useState('CALL_NOTE');
  const [note, setNote] = useState('');
  const [demoDate, setDemoDate] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!note.trim()) return;

    setSaving(true);
    try {
      await onCreate(leadId, {
        type,
        note,
        metadata: {
          demoDate: demoDate || null,
          followUpAt: followUpAt || null,
        },
      });

      setNote('');
      setDemoDate('');
      setFollowUpAt('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-950">Add activity</h3>

      <div className="mt-4 grid gap-3">
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {activityTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <textarea
          required
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Write note here..."
          className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        {type === 'DEMO_SCHEDULED' ? (
          <input
            type="datetime-local"
            value={demoDate}
            onChange={(event) => setDemoDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        ) : null}

        <input
          type="datetime-local"
          value={followUpAt}
          onChange={(event) => setFollowUpAt(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          aria-label="Next follow-up"
        />

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Add activity'}
        </Button>
      </div>
    </form>
  );
}
