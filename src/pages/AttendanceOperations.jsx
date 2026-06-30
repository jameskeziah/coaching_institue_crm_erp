import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import {
  createAttendanceSession,
  fetchAttendanceCalendar,
  fetchAttendanceRisk,
  fetchAttendanceSession,
  fetchBatches,
  fetchBranches,
  fetchSubjects,
  fetchTeacherAttendanceCompletion,
  fetchTeacherAttendanceToday,
  recalculateAttendanceRisk,
  recalculateTeacherAttendanceCompletion,
  runAttendanceAutoFollowups,
  saveAttendanceDraft,
  submitAttendanceSession,
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

const statuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const sessionTypes = ['REGULAR_CLASS', 'EXTRA_CLASS', 'TEST', 'DOUBT_SESSION', 'REVISION', 'PRACTICAL', 'OTHER'];

function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function dateText(value) { return value ? new Date(value).toLocaleDateString('en-IN') : '-'; }

export default function AttendanceOperations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { role } = useAuth();
  const pathTab = location.pathname.includes('attendance-risk') ? 'risk'
    : location.pathname.includes('teacher-attendance-completion') ? 'completion'
      : location.pathname.includes('calendar') ? 'calendar' : 'mobile';
  const [tab, setTab] = useState(searchParams.get('tab') || pathTab);
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(currentMonth());
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [batches, setBatches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [risk, setRisk] = useState([]);
  const [scores, setScores] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [form, setForm] = useState({ batchId: '', subjectId: '', sessionDate: today(), startTime: '18:00', endTime: '20:00', sessionType: 'REGULAR_CLASS' });
  const [filters, setFilters] = useState({ branchId: '', batchId: '', riskLevel: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canManageReports = ['owner', 'director', 'admin'].includes(role);

  async function loadBase() {
    try {
      const [sessionRows, batchRows, branchRows, subjectRows] = await Promise.all([
        fetchTeacherAttendanceToday(date),
        fetchBatches(),
        fetchBranches(),
        fetchSubjects(),
      ]);
      setSessions(sessionRows);
      setBatches(batchRows);
      setBranches(branchRows);
      setSubjects(subjectRows);
      if (sessionRows.length && !selected) setSelected(await fetchAttendanceSession(sessionRows[0].id));
    } catch (err) { setError(err.error || 'Could not load attendance workspace'); }
  }

  async function loadCalendar() {
    const [year, monthNumber] = month.split('-');
    setCalendar((await fetchAttendanceCalendar({ ...filters, month: monthNumber, year })).sessions || []);
  }

  async function loadRisk() {
    setRisk(await fetchAttendanceRisk(filters));
  }

  async function loadScores() {
    setScores(await fetchTeacherAttendanceCompletion({ month }));
  }

  useEffect(() => { loadBase(); }, [date]);
  useEffect(() => {
    if (tab === 'calendar') loadCalendar().catch((err) => setError(err.error || 'Calendar failed'));
    if (tab === 'risk') loadRisk().catch((err) => setError(err.error || 'Risk report failed'));
    if (tab === 'completion') loadScores().catch((err) => setError(err.error || 'Completion report failed'));
  }, [tab, month, filters.branchId, filters.batchId, filters.riskLevel]);

  const visibleRecords = useMemo(() => (selected?.records || []).filter((record) => {
    const matchesSearch = !search || record.studentName.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (!onlyUnmarked || record.status === 'NOT_MARKED');
  }), [selected, search, onlyUnmarked]);

  const counts = useMemo(() => {
    const rows = selected?.records || [];
    return statuses.reduce((acc, status) => ({ ...acc, [status]: rows.filter((row) => row.status === status).length }), { NOT_MARKED: rows.filter((row) => row.status === 'NOT_MARKED').length, total: rows.length });
  }, [selected]);

  function updateRecord(recordId, patch) {
    setSelected((current) => ({ ...current, records: current.records.map((record) => record.id === recordId ? { ...record, ...patch } : record) }));
  }

  function recordPayload() {
    return selected.records.map((record) => ({
      studentId: record.studentId,
      status: record.status,
      absenceReason: record.absenceReason,
      lateMinutes: record.lateMinutes,
      remarks: record.remarks,
    }));
  }

  async function createSession(event) {
    event.preventDefault();
    try {
      const created = await createAttendanceSession(form);
      setSelected(created);
      setMessage('Attendance session created.');
      await loadBase();
    } catch (err) { setError(err.error || 'Could not create session'); }
  }

  async function saveDraft() {
    try {
      setSelected(await saveAttendanceDraft(selected.id, recordPayload()));
      setMessage('Draft saved.');
    } catch (err) { setError(err.error || 'Could not save draft'); }
  }

  async function submit() {
    if (counts.NOT_MARKED) return setError(`${counts.NOT_MARKED} students are still unmarked`);
    if (!window.confirm(`Submit attendance? Present ${counts.PRESENT}, absent ${counts.ABSENT}, late ${counts.LATE}, excused ${counts.EXCUSED}. ParentPulse alerts will be created.`)) return;
    try {
      setSelected(await submitAttendanceSession(selected.id, recordPayload()));
      setMessage('Attendance submitted. ParentPulse and risk workflows completed.');
      await loadBase();
    } catch (err) { setError(err.error || 'Could not submit attendance'); }
  }

  function changeTab(value) {
    setTab(value);
    setSearchParams(value === 'mobile' ? {} : { tab: value });
  }

  return (
    <PageShell title="Attendance + ParentPulse" description="Mobile marking, parent alerts, risk detection, follow-ups, and teacher completion.">
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="mobile">Mobile Attendance</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="risk">Attendance Risk</TabsTrigger><TabsTrigger value="completion">Teacher Completion</TabsTrigger></TabsList>

        <TabsContent value="mobile" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <div className="space-y-5">
              <Card><CardHeader><CardTitle className="text-base">Create Session</CardTitle></CardHeader><CardContent><form onSubmit={createSession} className="grid gap-3">
                <Input type="date" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} />
                <select value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required><option value="">Select batch</option>{batches.filter((item) => item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">Select subject</option>{subjects.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-2"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
                <select value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">{sessionTypes.map((item) => <option key={item}>{item}</option>)}</select>
                <Button>Create Session</Button>
              </form></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Today's Classes</CardTitle></CardHeader><CardContent className="space-y-2"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />{sessions.map((session) => <button key={session.id} onClick={async () => setSelected(await fetchAttendanceSession(session.id))} className={`w-full rounded-md border p-3 text-left ${selected?.id === session.id ? 'border-primary bg-primary text-primary-foreground' : ''}`}><p className="font-semibold">{session.batchName || session.batch}</p><p className="text-sm opacity-75">{session.subjectName || session.subject} · {session.startTime}-{session.endTime}</p><Badge variant="secondary" className="mt-2">{session.status}</Badge></button>)}{!sessions.length ? <p className="text-sm text-muted-foreground">No classes for this date.</p> : null}</CardContent></Card>
            </div>

            <Card><CardHeader><CardTitle className="text-base">{selected ? `${selected.batchName || selected.batch} · ${selected.subject}` : 'Select a session'}</CardTitle></CardHeader><CardContent className="space-y-4">
              {selected ? <>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">{[['Total', counts.total], ['Present', counts.PRESENT], ['Absent', counts.ABSENT], ['Late', counts.LATE], ['Excused', counts.EXCUSED], ['Unmarked', counts.NOT_MARKED]].map(([label, value]) => <div key={label} className="rounded-md border p-2 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
                <div className="flex flex-wrap gap-2"><Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student" /><Button variant="outline" onClick={() => setOnlyUnmarked(!onlyUnmarked)}>{onlyUnmarked ? 'Show all' : 'Only unmarked'}</Button><Button variant="outline" disabled={selected.status !== 'DRAFT'} onClick={() => setSelected({ ...selected, records: selected.records.map((record) => record.status === 'NOT_MARKED' ? { ...record, status: 'PRESENT' } : record) })}>Mark all present</Button><Button variant="outline" disabled={selected.status !== 'DRAFT'} onClick={() => setSelected({ ...selected, records: selected.records.map((record) => record.status === 'NOT_MARKED' ? { ...record, status: 'ABSENT' } : record) })}>Unmarked absent</Button></div>
                <div className="space-y-3">{visibleRecords.map((record) => <div key={record.id} className="rounded-xl border p-4"><div><p className="font-semibold">{record.studentName}</p><p className="text-sm text-muted-foreground">{record.grade || 'Class'} · Parent {record.parentPhone || 'phone missing'}</p></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{statuses.map((status) => <Button key={status} type="button" variant={record.status === status ? 'default' : 'outline'} disabled={selected.status !== 'DRAFT'} className="h-11" onClick={() => updateRecord(record.id, { status })}>{status}</Button>)}</div>{record.status === 'LATE' ? <Input className="mt-3" type="number" min="0" value={record.lateMinutes || ''} onChange={(e) => updateRecord(record.id, { lateMinutes: e.target.value })} placeholder="Late minutes" /> : null}{record.status === 'ABSENT' ? <Input className="mt-3" value={record.absenceReason || ''} onChange={(e) => updateRecord(record.id, { absenceReason: e.target.value })} placeholder="Optional absence reason" /> : null}</div>)}</div>
                {selected.status === 'DRAFT' ? <div className="sticky bottom-3 flex gap-2 rounded-xl border bg-background p-3 shadow-lg"><Button variant="outline" className="flex-1" onClick={saveDraft}>Save Draft</Button><Button className="flex-1" onClick={submit}>Submit Attendance</Button></div> : <Alert><AlertDescription>Attendance submitted. Changes require a correction request.</AlertDescription></Alert>}
              </> : <p className="text-muted-foreground">Choose or create a session.</p>}
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Filters month={month} setMonth={setMonth} filters={filters} setFilters={setFilters} branches={branches} batches={batches} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{calendar.map((session) => <Card key={session.id} className={session.status === 'SUBMITTED' ? 'border-emerald-300' : session.status === 'DRAFT' ? 'border-amber-300' : session.status === 'CANCELLED' ? 'border-slate-300' : 'border-rose-300'}><CardContent className="p-4"><div className="flex justify-between"><p className="font-semibold">{dateText(session.date)}</p><Badge>{session.status}</Badge></div><p className="mt-2 font-medium">{session.batch} · {session.subject}</p><p className="text-sm text-muted-foreground">Teacher: {session.teacher || '-'}</p><p className="mt-2 text-sm">Present {session.presentCount}/{session.totalStudents} · Absent {session.absentCount} · Late {session.lateCount}</p><p className="text-sm font-semibold">Attendance {session.attendancePercentage}%</p></CardContent></Card>)}</div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <Filters filters={filters} setFilters={setFilters} branches={branches} batches={batches} risk />
          {canManageReports ? <div className="flex gap-2"><Button onClick={async () => { await recalculateAttendanceRisk(); await loadRisk(); setMessage('Risk snapshots recalculated.'); }}>Recalculate Risk</Button><Button variant="outline" onClick={async () => { const result = await runAttendanceAutoFollowups(); setMessage(`${result.length} follow-up results processed.`); await loadRisk(); }}>Run Auto Follow-ups</Button></div> : null}
          <DataTable headers={['Student', 'Parent', 'Branch', 'Course', 'Batch', 'Attendance', 'Consecutive', '7 days', '30 days', 'Risk', 'Action']} rows={risk.map((row) => [row.studentName, row.parentPhone, row.branchName, row.courseName, row.batchName, `${row.attendancePercentage}%`, row.consecutiveAbsences, row.absencesLast7Days, row.absencesLast30Days, <Badge key={row.id} variant={['HIGH', 'CRITICAL'].includes(row.riskLevel) ? 'destructive' : 'secondary'}>{row.riskLevel}</Badge>, <Link key={`profile-${row.id}`} className="underline" to={`/students/${row.studentId}?tab=attendance`}>Profile</Link>])} />
        </TabsContent>

        <TabsContent value="completion" className="space-y-4">
          <div className="flex flex-wrap gap-2"><Input className="max-w-48" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />{canManageReports ? <Button onClick={async () => { await recalculateTeacherAttendanceCompletion({ month }); await loadScores(); setMessage('Teacher completion scores recalculated.'); }}>Recalculate</Button> : null}</div>
          <DataTable headers={['Teacher', 'Scheduled', 'Submitted', 'On time', 'Missed', 'Corrections', 'Completion', 'Final score']} rows={scores.map((row) => [row.teacherName, row.scheduledSessions, row.submittedSessions, row.onTimeSubmissions, row.missedSessions, row.correctionRequests, `${row.completionPercentage}%`, row.finalScore])} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Filters({ month, setMonth, filters, setFilters, branches, batches, risk }) {
  return <div className="grid gap-2 md:grid-cols-4">{month !== undefined ? <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /> : null}<select value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={filters.batchId} onChange={(e) => setFilters({ ...filters, batchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All batches</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{risk ? <select value={filters.riskLevel} onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All risk levels</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((item) => <option key={item}>{item}</option>)}</select> : null}</div>;
}

function DataTable({ headers, rows }) {
  return <Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell ?? '-'}</TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length ? <p className="py-4 text-sm text-muted-foreground">No records.</p> : null}</CardContent></Card>;
}
