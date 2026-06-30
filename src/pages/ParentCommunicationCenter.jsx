import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  assignParentCommunication,
  createParentCommunicationFollowup,
  createParentManualNote,
  fetchBranches,
  fetchOfficialWhatsAppTemplates,
  fetchParentCommunication,
  fetchParentCommunications,
  fetchStudents,
  fetchUsers,
  logParentCall,
  markParentCommunicationReviewed,
  sendParentWhatsApp,
} from '../api';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const statuses = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLIED', 'LOGGED', 'COMPLETED', 'OPEN'];
const channels = ['WHATSAPP', 'CALL', 'NOTE', 'TASK', 'SMS', 'EMAIL'];
const eventTypes = ['ATTENDANCE_ABSENT_ALERT', 'FEE_DUE_REMINDER', 'FEE_OVERDUE_REMINDER', 'PAYMENT_RECEIPT_SENT', 'TEST_RESULT_SENT', 'WEEKLY_REPORT_SENT', 'ADMISSION_FOLLOWUP', 'PARENT_CALL', 'MANUAL_NOTE', 'PARENT_REPLY', 'FOLLOWUP_CREATED'];

function dateTime(value) { return value ? new Date(value).toLocaleString('en-IN') : '-'; }
function nameOf(student) { return student?.displayName || student?.studentName || student?.name || `Student ${student?.id}`; }
function statusVariant(status) {
  if (status === 'FAILED') return 'destructive';
  if (['READ', 'REPLIED', 'COMPLETED'].includes(status)) return 'default';
  return 'secondary';
}

function SummaryCard({ label, value }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value || 0}</p></CardContent></Card>;
}

export default function ParentCommunicationCenter() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({});
  const [branches, setBranches] = useState([]);
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ search: '', branchId: '', channel: '', eventType: '', status: '', assignedToUserId: '', reviewed: '', dateFrom: '', dateTo: '', page: 1, pageSize: 25 });
  const [whatsapp, setWhatsapp] = useState({ studentId: '', templateKey: '', languageCode: 'en' });
  const [call, setCall] = useState({ studentId: '', purpose: '', summary: '', outcome: '', nextAction: '', nextFollowupAt: '' });
  const [note, setNote] = useState({ studentId: '', subject: '', note: '', noteType: 'GENERAL' });
  const [followup, setFollowup] = useState({ taskType: 'Parent communication follow-up', dueDate: new Date().toISOString().slice(0, 10), priority: 'Medium', assignedToUserId: '', notes: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setError('');
      const result = await fetchParentCommunications(filters);
      setRows(result.data || []); setSummary(result.summary || {}); setPagination(result.pagination || {});
    } catch (err) { setError(err.error || 'Could not load parent communication'); }
  }
  async function loadDetail(id) {
    try { setSelected(await fetchParentCommunication(id)); }
    catch (err) { setError(err.error || 'Could not load communication detail'); }
  }
  useEffect(() => {
    Promise.all([fetchBranches(), fetchStudents(), fetchUsers(), fetchOfficialWhatsAppTemplates()])
      .then(([branchRows, studentRows, userRows, templateRows]) => {
        setBranches(branchRows || []); setStudents(studentRows?.data || studentRows || []);
        setUsers(userRows?.data || userRows || []); setTemplates((templateRows || []).filter((item) => item.status === 'APPROVED'));
      }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [filters.branchId, filters.channel, filters.eventType, filters.status, filters.assignedToUserId, filters.reviewed, filters.dateFrom, filters.dateTo, filters.page, filters.pageSize]);
  const selectedEvent = selected?.event;
  const studentOptions = useMemo(() => students.map((student) => ({ id: String(student.id), name: nameOf(student) })), [students]);

  async function action(work, success) {
    try {
      setError(''); await work(); setMessage(success); await load();
      if (selectedEvent?.id) await loadDetail(selectedEvent.id);
    } catch (err) { setError(err.error || err.message || 'Action failed'); }
  }

  return (
    <PageShell title="Parent Communication Center" description="One tenant-scoped inbox for WhatsApp, calls, notes, replies, delivery status, and parent follow-ups.">
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <SummaryCard label="Today" value={summary.todayTotal} /><SummaryCard label="Sent" value={summary.sent} />
        <SummaryCard label="Delivered" value={summary.delivered} /><SummaryCard label="Read" value={summary.read} />
        <SummaryCard label="Replies" value={summary.replied} /><SummaryCard label="Failed" value={summary.failed} />
        <SummaryCard label="Pending follow-ups" value={summary.pendingFollowups} /><SummaryCard label="No contact 30d" value={summary.noRecentContact} />
      </div>

      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList><TabsTrigger value="inbox">Inbox</TabsTrigger><TabsTrigger value="whatsapp">Send WhatsApp</TabsTrigger><TabsTrigger value="call">Log Call</TabsTrigger><TabsTrigger value="note">Add Note</TabsTrigger></TabsList>
        <TabsContent value="inbox" className="space-y-4">
          <Card><CardContent className="grid gap-2 p-4 md:grid-cols-3 xl:grid-cols-5">
            <div className="flex gap-2 xl:col-span-2"><Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Student, guardian, phone, message" /><Button onClick={() => { setFilters({ ...filters, page: 1 }); load(); }}>Search</Button></div>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value, page: 1 })}><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value, page: 1 })}><option value="">All channels</option>{channels.map((item) => <option key={item}>{item}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.eventType} onChange={(e) => setFilters({ ...filters, eventType: e.target.value, page: 1 })}><option value="">All event types</option>{eventTypes.map((item) => <option key={item}>{item}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.assignedToUserId} onChange={(e) => setFilters({ ...filters, assignedToUserId: e.target.value, page: 1 })}><option value="">All assignees</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name || item.username}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.reviewed} onChange={(e) => setFilters({ ...filters, reviewed: e.target.value, page: 1 })}><option value="">Any review state</option><option value="false">Needs review</option><option value="true">Reviewed</option></select>
            <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, page: 1 })} />
            <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, page: 1 })} />
          </CardContent></Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Student / Guardian</TableHead><TableHead>Context</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Assigned</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className={selectedEvent?.id === row.id ? 'bg-muted/60' : ''}><TableCell>{dateTime(row.loggedAt || row.sentAt || row.createdAt)}</TableCell><TableCell><Link className="font-medium underline" to={row.studentId ? `/students/${row.studentId}?tab=communication` : '#'}>{row.studentName || 'Unknown student'}</Link><p className="text-xs text-muted-foreground">{row.guardianName || row.guardianPhone || '-'}</p></TableCell><TableCell>{[row.branchName, row.courseName, row.batchName].filter(Boolean).join(' · ') || '-'}</TableCell><TableCell><Badge variant="outline">{row.channel}</Badge><p className="mt-1 text-xs">{row.eventType}</p></TableCell><TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge>{!row.reviewedAt ? <p className="mt-1 text-xs text-amber-700">Needs review</p> : null}</TableCell><TableCell>{row.assignedToName || '-'}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => loadDetail(row.id)}>Open</Button></TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">No communication matches these filters.</p> : null}<div className="mt-4 flex items-center justify-between text-sm"><span>{pagination.total || 0} records</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(pagination.page || 1) <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</Button><Button size="sm" variant="outline" disabled={(pagination.page || 1) >= (pagination.pages || 1)} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button></div></div></CardContent></Card>

            <Card className="h-fit xl:sticky xl:top-4"><CardHeader><CardTitle className="text-base">Communication Detail</CardTitle></CardHeader><CardContent className="space-y-4">{selectedEvent ? <>
              <div><div className="flex flex-wrap gap-2"><Badge>{selectedEvent.channel}</Badge><Badge variant={statusVariant(selectedEvent.status)}>{selectedEvent.status}</Badge>{selectedEvent.reviewedAt ? <Badge variant="outline">Reviewed</Badge> : null}</div><h3 className="mt-3 font-semibold">{selectedEvent.subject || selectedEvent.eventType}</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedEvent.message}</p></div>
              <div className="rounded-md border p-3 text-sm"><p className="font-medium">{selectedEvent.studentName || 'Unknown student'}</p><p>{selectedEvent.guardianName || '-'} · {selectedEvent.guardianPhone || selectedEvent.parentPhone || '-'}</p><p className="text-muted-foreground">{[selectedEvent.branchName, selectedEvent.courseName, selectedEvent.batchName].filter(Boolean).join(' · ')}</p></div>
              <div><p className="mb-2 text-sm font-medium">Delivery lifecycle</p>{(selected.lifecycle || []).map((item) => <div key={`${item.status}-${item.at}`} className="flex justify-between border-l-2 border-primary py-1 pl-3 text-xs"><span>{item.status}</span><span>{dateTime(item.at)}</span></div>)}</div>
              {selectedEvent.errorMessage ? <Alert variant="destructive"><AlertDescription>{selectedEvent.errorCode ? `${selectedEvent.errorCode}: ` : ''}{selectedEvent.errorMessage}</AlertDescription></Alert> : null}
              <div className="grid grid-cols-2 gap-2"><select className="rounded-md border px-2 py-2 text-sm" value={selectedEvent.assignedToUserId || ''} onChange={(e) => action(() => assignParentCommunication(selectedEvent.id, e.target.value || null), 'Assignment updated.')}><option value="">Unassigned</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name || item.username}</option>)}</select><Button variant="outline" onClick={() => action(() => markParentCommunicationReviewed(selectedEvent.id, !selectedEvent.reviewedAt), selectedEvent.reviewedAt ? 'Marked for review.' : 'Marked reviewed.')}>{selectedEvent.reviewedAt ? 'Reopen' : 'Mark reviewed'}</Button></div>
              <form className="space-y-2 rounded-md border p-3" onSubmit={(e) => { e.preventDefault(); action(() => createParentCommunicationFollowup(selectedEvent.id, followup), 'Follow-up created.'); }}><p className="text-sm font-medium">Create follow-up</p><Input value={followup.taskType} onChange={(e) => setFollowup({ ...followup, taskType: e.target.value })} /><div className="grid grid-cols-2 gap-2"><Input type="date" value={followup.dueDate} onChange={(e) => setFollowup({ ...followup, dueDate: e.target.value })} required /><select className="rounded-md border px-2 text-sm" value={followup.priority} onChange={(e) => setFollowup({ ...followup, priority: e.target.value })}>{['Low', 'Medium', 'High', 'Urgent'].map((item) => <option key={item}>{item}</option>)}</select></div><select className="w-full rounded-md border px-2 py-2 text-sm" value={followup.assignedToUserId} onChange={(e) => setFollowup({ ...followup, assignedToUserId: e.target.value })}><option value="">Unassigned</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name || item.username}</option>)}</select><Textarea value={followup.notes} onChange={(e) => setFollowup({ ...followup, notes: e.target.value })} placeholder="Next action" /><Button size="sm">Create follow-up</Button></form>
              <Tabs defaultValue="replies"><TabsList className="grid grid-cols-4"><TabsTrigger value="replies">Replies</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="calls">Calls</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger></TabsList>{[['replies', selected.replies], ['notes', selected.notes], ['calls', selected.calls], ['tasks', selected.followups]].map(([key, items]) => <TabsContent key={key} value={key} className="max-h-56 space-y-2 overflow-auto">{(items || []).map((item) => <div key={item.id} className="rounded border p-2 text-xs"><p>{item.message || item.note || item.summary || item.notes || item.outcome || item.taskType}</p><p className="mt-1 text-muted-foreground">{dateTime(item.loggedAt || item.createdAt || item.callStartedAt || item.calledAt || item.dueDate)}</p></div>)}{!items?.length ? <p className="text-sm text-muted-foreground">No records.</p> : null}</TabsContent>)}</Tabs>
            </> : <p className="text-sm text-muted-foreground">Open an inbox item to inspect the full timeline and take action.</p>}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="whatsapp"><Card><CardHeader><CardTitle className="text-base">Send approved WhatsApp template</CardTitle></CardHeader><CardContent><form className="grid max-w-2xl gap-3" onSubmit={(e) => { e.preventDefault(); action(() => sendParentWhatsApp(whatsapp), 'WhatsApp message submitted.'); }}><select className="rounded-md border px-3 py-2 text-sm" value={whatsapp.studentId} onChange={(e) => setWhatsapp({ ...whatsapp, studentId: e.target.value })} required><option value="">Select student</option>{studentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="rounded-md border px-3 py-2 text-sm" value={whatsapp.templateKey} onChange={(e) => setWhatsapp({ ...whatsapp, templateKey: e.target.value })} required><option value="">Select approved template</option>{templates.map((item) => <option key={item.id} value={item.templateKey}>{item.templateKey} · {item.languageCode}</option>)}</select><Button>Send WhatsApp</Button></form></CardContent></Card></TabsContent>
        <TabsContent value="call"><Card><CardHeader><CardTitle className="text-base">Log parent call</CardTitle></CardHeader><CardContent><form className="grid max-w-2xl gap-3" onSubmit={(e) => { e.preventDefault(); action(() => logParentCall(call), 'Parent call logged.'); }}><select className="rounded-md border px-3 py-2 text-sm" value={call.studentId} onChange={(e) => setCall({ ...call, studentId: e.target.value })} required><option value="">Select student</option>{studentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Input value={call.purpose} onChange={(e) => setCall({ ...call, purpose: e.target.value })} placeholder="Purpose" /><Textarea value={call.summary} onChange={(e) => setCall({ ...call, summary: e.target.value })} placeholder="Call summary" required /><Input value={call.outcome} onChange={(e) => setCall({ ...call, outcome: e.target.value })} placeholder="Outcome" /><Input value={call.nextAction} onChange={(e) => setCall({ ...call, nextAction: e.target.value })} placeholder="Next action" /><Input type="datetime-local" value={call.nextFollowupAt} onChange={(e) => setCall({ ...call, nextFollowupAt: e.target.value })} /><Button>Log call</Button></form></CardContent></Card></TabsContent>
        <TabsContent value="note"><Card><CardHeader><CardTitle className="text-base">Add manual communication note</CardTitle></CardHeader><CardContent><form className="grid max-w-2xl gap-3" onSubmit={(e) => { e.preventDefault(); action(() => createParentManualNote(note), 'Note added.'); }}><select className="rounded-md border px-3 py-2 text-sm" value={note.studentId} onChange={(e) => setNote({ ...note, studentId: e.target.value })} required><option value="">Select student</option>{studentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Input value={note.subject} onChange={(e) => setNote({ ...note, subject: e.target.value })} placeholder="Subject" /><Textarea value={note.note} onChange={(e) => setNote({ ...note, note: e.target.value })} placeholder="Internal note" required /><Button>Add note</Button></form></CardContent></Card></TabsContent>
      </Tabs>
    </PageShell>
  );
}
