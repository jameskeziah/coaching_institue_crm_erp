import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  archiveStudent,
  createFollowUp,
  createStudentDocument,
  createStudentGuardian,
  fetchStudentAcademic,
  fetchStudentAttendance,
  fetchStudentCommunications,
  fetchStudentDocuments,
  fetchStudentFees,
  fetchStudentFollowups,
  fetchStudentHistory,
  fetchStudentProfile,
  fetchStudentTests,
  updateStudentDocument,
  updateStudentStatus,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const tabs = ['overview', 'academic', 'fees', 'attendance', 'tests', 'followups', 'communication', 'documents', 'history', 'settings'];
const statuses = ['ACTIVE', 'INACTIVE', 'PROVISIONAL', 'DROPPED', 'COMPLETED', 'TRANSFERRED', 'ALUMNI', 'ARCHIVED'];

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateText(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN');
}

function Summary({ label, value }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value ?? '-'}</p></CardContent></Card>;
}

export default function StudentProfilePage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions, role } = useAuth();
  const canManageProfile = ['owner', 'director', 'admin', 'counsellor'].includes(role);
  const canManageStatus = ['owner', 'director', 'admin'].includes(role);
  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState({});
  const [activeTab, setActiveTab] = useState(tabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [guardian, setGuardian] = useState({ name: '', relationship: 'FATHER', phone: '', email: '', occupation: '', isPrimary: false, isEmergencyContact: false, canReceiveNotifications: true });
  const [documentForm, setDocumentForm] = useState({ documentType: 'AADHAAR', title: '', fileUrl: '', fileName: '', mimeType: '', fileSize: 0, notes: '' });
  const [followup, setFollowup] = useState({ taskType: 'Academic Follow-up', dueDate: new Date().toISOString().slice(0, 10), priority: 'Medium', assignedTo: '', notes: '' });
  const [status, setStatus] = useState('ACTIVE');
  const [archiveReason, setArchiveReason] = useState('');

  async function loadProfile() {
    try {
      const result = await fetchStudentProfile(id);
      setProfile(result);
      setStatus(result.status || 'ACTIVE');
    } catch (err) {
      setError(err.error || 'Could not load student profile');
    }
  }

  async function loadTab(tab, force = false) {
    if (!force && details[tab]) return;
    try {
      const loaders = {
        academic: fetchStudentAcademic,
        fees: fetchStudentFees,
        attendance: fetchStudentAttendance,
        tests: fetchStudentTests,
        followups: fetchStudentFollowups,
        communication: fetchStudentCommunications,
        documents: fetchStudentDocuments,
        history: fetchStudentHistory,
      };
      if (loaders[tab]) {
        const result = await loaders[tab](id);
        setDetails((current) => ({ ...current, [tab]: result }));
      }
    } catch (err) {
      setError(err.error || `Could not load ${tab}`);
    }
  }

  useEffect(() => { loadProfile(); }, [id]);
  useEffect(() => { loadTab(activeTab); }, [activeTab, id]);

  function changeTab(value) {
    setActiveTab(value);
    setSearchParams(value === 'overview' ? {} : { tab: value });
  }

  async function addGuardian(event) {
    event.preventDefault();
    try {
      await createStudentGuardian(id, guardian);
      setGuardian({ name: '', relationship: 'FATHER', phone: '', email: '', occupation: '', isPrimary: false, isEmergencyContact: false, canReceiveNotifications: true });
      setMessage('Guardian added.');
      await loadProfile();
    } catch (err) { setError(err.error || 'Could not add guardian'); }
  }

  async function addDocument(event) {
    event.preventDefault();
    try {
      await createStudentDocument(id, documentForm);
      setDocumentForm({ documentType: 'AADHAAR', title: '', fileUrl: '', fileName: '', mimeType: '', fileSize: 0, notes: '' });
      setMessage('Document added.');
      await Promise.all([loadProfile(), loadTab('documents', true)]);
    } catch (err) { setError(err.error || 'Could not add document'); }
  }

  async function addFollowup(event) {
    event.preventDefault();
    try {
      await createFollowUp({ ...followup, student_id: id });
      setMessage('Follow-up created.');
      await Promise.all([loadProfile(), loadTab('followups', true)]);
    } catch (err) { setError(err.error || 'Could not add follow-up'); }
  }

  if (!profile) return <PageShell title="Student Profile">{error || 'Loading...'}</PageShell>;
  const student = profile.student;
  const primaryGuardian = profile.guardians.find((item) => item.isPrimary) || profile.guardians[0];

  return (
    <PageShell
      title={student.displayName || student.studentName || student.name}
      description={`${student.studentCode || 'No student code'} · ${profile.branch?.name || 'No branch'} · ${profile.course?.name || 'No course'}`}
      actions={<Button asChild variant="outline"><Link to="/students">Back to Students</Link></Button>}
    >
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-4 xl:grid-cols-8">
          <div className="md:col-span-2"><p className="text-2xl font-bold">{student.displayName || student.name}</p><div className="mt-2 flex gap-2"><Badge>{profile.status}</Badge><Badge variant="outline">{student.classLevel || 'Class not set'}</Badge></div></div>
          <Summary label="Primary batch" value={profile.primaryBatch?.name || 'Not assigned'} />
          <Summary label="Parent phone" value={primaryGuardian?.phone || student.parentPhone || 'Missing'} />
          <Summary label="Pending fee" value={money(profile.feeSummary.pendingAmount)} />
          <Summary label="Attendance" value={`${profile.attendanceSummary.attendancePercentage || 0}%`} />
          <Summary label="Latest test" value={`${profile.testSummary.latestScore || 0}%`} />
          <Summary label="Next follow-up" value={dateText(profile.nextFollowup)} />
        </CardContent>
      </Card>

      {profile.alerts.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{profile.alerts.map((alert) => <Alert key={alert.type} variant={alert.severity === 'HIGH' || alert.severity === 'CRITICAL' ? 'destructive' : 'default'}><AlertDescription><span className="font-semibold">{alert.type.replaceAll('_', ' ')}</span><br />{alert.message}</AlertDescription></Alert>)}</div> : null}

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="h-auto flex-wrap justify-start">{tabs.map((tab) => <TabsTrigger key={tab} value={tab}>{tab[0].toUpperCase() + tab.slice(1)}</TabsTrigger>)}</TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Student Details</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
              <Summary label="Student code" value={student.studentCode} /><Summary label="Status" value={student.status} />
              <Summary label="Gender" value={student.gender} /><Summary label="Date of birth" value={dateText(student.dateOfBirth)} />
              <Summary label="Class" value={student.classLevel} /><Summary label="School" value={student.schoolName} />
              <Summary label="Student phone" value={student.studentPhone} /><Summary label="Student email" value={student.studentEmail} />
              <div className="md:col-span-2"><Summary label="Address" value={student.address} /></div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Guardians</CardTitle></CardHeader><CardContent className="space-y-3">
              {profile.guardians.map((item) => <div key={item.id} className="rounded-md border p-3"><div className="flex justify-between"><p className="font-semibold">{item.name}</p>{item.isPrimary ? <Badge>Primary</Badge> : null}</div><p className="text-sm text-muted-foreground">{item.relationship} · {item.phone || 'No phone'} · {item.email || 'No email'}</p></div>)}
              {canManageProfile ? <form onSubmit={addGuardian} className="grid gap-2 md:grid-cols-2">
                <Input value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} placeholder="Guardian name" required />
                <select value={guardian.relationship} onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })} className="rounded-md border px-3 text-sm">{['FATHER', 'MOTHER', 'GUARDIAN', 'BROTHER', 'SISTER', 'OTHER'].map((item) => <option key={item}>{item}</option>)}</select>
                <Input value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} placeholder="Phone" />
                <Input value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })} placeholder="Email" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={guardian.isPrimary} onChange={(e) => setGuardian({ ...guardian, isPrimary: e.target.checked })} /> Primary guardian</label>
                <Button>Add Guardian</Button>
              </form> : null}
            </CardContent></Card>
          </div>
          <div className="grid gap-3 md:grid-cols-3"><Summary label="Net payable" value={money(profile.feeSummary.netPayable)} /><Summary label="Paid" value={money(profile.feeSummary.paidAmount)} /><Summary label="Open follow-ups" value={profile.recentFollowups.filter((item) => !['Done', 'Completed'].includes(item.status)).length} /></div>
        </TabsContent>

        <TabsContent value="academic"><Academic data={details.academic || profile} /></TabsContent>
        <TabsContent value="fees"><Fees data={details.fees} /></TabsContent>
        <TabsContent value="attendance"><Attendance data={details.attendance} /></TabsContent>
        <TabsContent value="tests"><Tests data={details.tests} /></TabsContent>
        <TabsContent value="followups"><Followups rows={details.followups || []} form={followup} setForm={setFollowup} submit={addFollowup} /></TabsContent>
        <TabsContent value="communication"><Communication rows={details.communication || []} /></TabsContent>
        <TabsContent value="documents"><Documents canManage={canManageProfile} canVerify={canManageStatus} rows={details.documents || profile.documents} form={documentForm} setForm={setDocumentForm} submit={addDocument} verify={async (documentId, nextStatus) => { await updateStudentDocument(id, documentId, { status: nextStatus }); await loadTab('documents', true); }} /></TabsContent>
        <TabsContent value="history"><Timeline rows={details.history || []} /></TabsContent>
        <TabsContent value="settings"><Card><CardContent className="space-y-5 p-5">{canManageStatus ? <div className="flex flex-wrap gap-2"><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border px-3 py-2 text-sm">{statuses.map((item) => <option key={item}>{item}</option>)}</select><Button onClick={async () => { await updateStudentStatus(id, status); setMessage('Status updated.'); await loadProfile(); }}>Change Status</Button></div> : <p className="text-muted-foreground">Status changes require administrator access.</p>}{permissions.canDelete ? <div className="max-w-xl space-y-2"><Textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Archive reason" /><Button variant="destructive" onClick={async () => { await archiveStudent(id, archiveReason); setMessage('Student archived.'); }}>Archive Student</Button></div> : null}</CardContent></Card></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Academic({ data }) {
  return <div className="grid gap-5 xl:grid-cols-2"><DataTable title="Batch Memberships" headers={['Batch', 'Course', 'Branch', 'Joined', 'Left', 'Status']} rows={(data.batchMemberships || []).map((row) => [row.batchName, row.courseName, row.branchName, dateText(row.joinedAt), dateText(row.leftAt), row.status])} /><DataTable title="Assigned Teachers" headers={['Teacher', 'Subject', 'Role', 'Batch']} rows={(data.teachers || []).map((row) => [row.teacherName, row.subjectName, row.role, row.batchName])} /></div>;
}

function Fees({ data }) {
  if (!data) return <p>Loading fees...</p>;
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Summary label="Total fee" value={money(data.summary.totalFee)} /><Summary label="Discount" value={money(data.summary.discountAmount)} /><Summary label="Net payable" value={money(data.summary.netPayable)} /><Summary label="Paid" value={money(data.summary.paidAmount)} /><Summary label="Pending" value={money(data.summary.pendingAmount)} /><Summary label="Overdue" value={money(data.summary.overdueAmount)} /></div><DataTable title="Payments" headers={['Date', 'Amount', 'Mode', 'Receipt', 'Status']} rows={(data.payments || []).map((row) => [dateText(row.paid_at || row.paymentDate), money(row.amount), row.payment_mode || row.paymentMethod, row.receipt_number || row.receiptNumber, row.status])} /><DataTable title="Installments" headers={['Title', 'Due date', 'Amount', 'Pending', 'Status']} rows={(data.installments || []).map((row) => [row.title, dateText(row.due_date), money(row.amount), money(row.pending_amount), row.status])} /></div>;
}

function Attendance({ data }) {
  if (!data) return <p>Loading attendance...</p>;
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-6"><Summary label="Overall" value={`${data.summary.attendancePercentage}%`} /><Summary label="This month" value={`${data.summary.monthlyAttendancePercentage || 0}%`} /><Summary label="Sessions" value={data.summary.totalSessions} /><Summary label="Present" value={data.summary.presentCount} /><Summary label="Absent" value={data.summary.absentCount} /><Summary label="Risk" value={data.risk?.riskLevel || 'Not calculated'} /></div><DataTable title="Subject-wise Attendance" headers={['Subject', 'Sessions', 'Present', 'Attendance']} rows={(data.subjectWise || []).map((row) => [row.subject, row.totalSessions, row.presentCount, `${row.attendancePercentage}%`])} /><DataTable title="Attendance Records" headers={['Date', 'Batch', 'Subject', 'Status', 'Marked by']} rows={data.rows.map((row) => [dateText(row.date), row.batch, row.subject, row.status, row.markedBy || row.teacherName])} /><DataTable title="ParentPulse Alerts" headers={['Date', 'Event', 'Channel', 'Status', 'Message']} rows={(data.parentAlerts || []).map((row) => [dateText(row.sentAt || row.createdAt), row.eventType, row.channel, row.status, row.message])} /><DataTable title="Attendance Follow-ups" headers={['Created', 'Reason', 'Priority', 'Due', 'Status']} rows={(data.followups || []).map((row) => [dateText(row.createdAt), row.riskReason || row.taskType, row.priority, dateText(row.dueDate), row.status])} /></div>;
}

function Tests({ data }) {
  if (!data) return <p>Loading tests...</p>;
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-5"><Summary label="Tests" value={data.summary.testsAttempted} /><Summary label="Average" value={`${data.summary.averagePercentage}%`} /><Summary label="Latest" value={`${data.summary.latestScore}%`} /><Summary label="Best" value={`${data.summary.bestScore}%`} /><Summary label="Weak subject" value={data.summary.weakestSubject} /></div><DataTable title="Test Results" headers={['Date', 'Test', 'Subject', 'Marks', 'Percentage', 'Rank']} rows={data.rows.map((row) => [dateText(row.testDate), row.testName, row.subject || row.weakSubject, `${row.marksObtained || 0}/${row.totalMarks || 0}`, `${row.percentage || 0}%`, row.rank || '-'])} /></div>;
}

function Followups({ rows, form, setForm, submit }) {
  return <div className="grid gap-5 xl:grid-cols-[360px_1fr]"><Card><CardHeader><CardTitle className="text-base">Add Follow-up</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3"><Input value={form.taskType} onChange={(e) => setForm({ ...form, taskType: e.target.value })} placeholder="Follow-up type" /><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /><Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Assigned to" /><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" /><Button>Add Follow-up</Button></form></CardContent></Card><DataTable title="Follow-ups" headers={['Type', 'Due', 'Priority', 'Assigned', 'Status', 'Outcome']} rows={rows.map((row) => [row.taskType, dateText(row.dueDate), row.priority, row.assignedTo, row.status, row.completionOutcome])} /></div>;
}

function Communication({ rows }) {
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const filtered = rows.filter((row) => (!channel || row.channel === channel) && (!status || row.status === status));
  const counts = rows.reduce((result, row) => {
    result.total += 1;
    if (row.status === 'FAILED') result.failed += 1;
    if (row.status === 'REPLIED') result.replied += 1;
    if (row.channel === 'CALL') result.calls += 1;
    return result;
  }, { total: 0, failed: 0, replied: 0, calls: 0 });
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-4"><Summary label="Total communication" value={counts.total} /><Summary label="Replies" value={counts.replied} /><Summary label="Failed" value={counts.failed} /><Summary label="Calls" value={counts.calls} /></div>
    <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-2"><select className="rounded-md border px-3 py-2 text-sm" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">All channels</option>{[...new Set(rows.map((row) => row.channel).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select><select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(rows.map((row) => row.status).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></CardContent></Card>
    <Timeline rows={filtered.map((row) => ({ ...row, eventDate: row.date, title: `${row.channel || 'SYSTEM'} · ${row.eventType || row.subject}`, detail: row.message, type: row.status }))} />
  </div>;
}

function Documents({ rows, form, setForm, submit, verify, canManage, canVerify }) {
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]">{canManage ? <Card><CardHeader><CardTitle className="text-base">Add Document Record</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3"><select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">{['PHOTO', 'AADHAAR', 'BIRTH_CERTIFICATE', 'SCHOOL_ID', 'MARKSHEET', 'TRANSFER_CERTIFICATE', 'CASTE_CERTIFICATE', 'SCHOLARSHIP_DOCUMENT', 'FEE_PROOF', 'OTHER'].map((item) => <option key={item}>{item}</option>)}</select><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required /><Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="File URL" required /><Input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="File name" /><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" /><Button>Add Document</Button></form></CardContent></Card> : null}<Card><CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader><CardContent className="space-y-3">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><a className="font-semibold underline" href={row.fileUrl} target="_blank" rel="noreferrer">{row.title}</a><p className="text-sm text-muted-foreground">{row.documentType} · {row.status}</p></div>{canVerify ? <div className="flex gap-2">{row.status !== 'VERIFIED' ? <Button size="sm" onClick={() => verify(row.id, 'VERIFIED')}>Verify</Button> : null}{row.status !== 'REJECTED' ? <Button size="sm" variant="outline" onClick={() => verify(row.id, 'REJECTED')}>Reject</Button> : null}</div> : null}</div>)}{!rows.length ? <p className="text-muted-foreground">No documents.</p> : null}</CardContent></Card></div>;
}

function Timeline({ rows }) {
  return <Card><CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader><CardContent className="space-y-3">{rows.map((row, index) => <div key={row.id || index} className="border-l-2 border-primary pl-4"><p className="text-xs text-muted-foreground">{dateText(row.eventDate || row.createdAt)}</p><p className="font-semibold">{row.title || row.action || row.type}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.detail || row.message || ''}</p>{row.type ? <Badge variant="outline" className="mt-2">{row.type}</Badge> : null}</div>)}{!rows.length ? <p className="text-muted-foreground">No records.</p> : null}</CardContent></Card>;
}

function DataTable({ title, headers, rows }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell ?? '-'}</TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length ? <p className="py-4 text-sm text-muted-foreground">No records.</p> : null}</CardContent></Card>;
}
