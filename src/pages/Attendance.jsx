import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarCheck, CheckCircle2, Clock, Copy, MessageCircle, Save, Send, Trash2 } from 'lucide-react';
import {
  approveAttendanceCorrection,
  approveLeaveRequest,
  createParentCallLog,
  createAttendanceSession,
  createAttendanceCorrection,
  createLeaveRequest,
  deleteAttendanceSession,
  fetchAttendanceCorrections,
  fetchAttendanceDashboard,
  fetchAttendanceReports,
  fetchAttendanceSession,
  fetchAttendanceSessions,
  fetchLeaveRequests,
  fetchParentAlertLogs,
  fetchParentCallLogs,
  fetchStaffAttendanceMonthly,
  fetchStaffAttendanceToday,
  fetchStudents,
  fetchTeachers,
  markAllAttendancePresent,
  rejectAttendanceCorrection,
  rejectLeaveRequest,
  saveAttendanceRecords,
  staffCheckIn,
  staffCheckOut,
  updateAttendanceAlert,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const attendanceStatuses = ['Present', 'Absent', 'Late', 'Excused'];
const lectureTypes = ['Regular', 'Test', 'Doubt', 'Revision'];
const leaveTypes = ['Casual Leave', 'Sick Leave', 'Emergency Leave', 'Academic Duty', 'Unpaid Leave', 'Diwali Leave'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function defaultSessionForm() {
  return {
    date: today(),
    batch: '',
    course: '',
    subject: '',
    teacher_id: '',
    startTime: '07:00',
    endTime: '08:30',
    lectureType: 'Regular',
    remarks: '',
  };
}

function alertMessage(record, session) {
  if (record.status === 'Late') {
    return `Dear Parent,\n\nYour child ${record.studentName} came late for ${session.subject} lecture today at ProTrack Kaizen.\n\nLecture Time: ${session.startTime}\nArrival Time: ${record.arrivalTime || record.markedTime || '-'}\n\nPlease ensure punctuality.\n\n- ProTrack Kaizen`;
  }
  return `Dear Parent,\n\nYour child ${record.studentName} was absent for ${session.subject} lecture of ${session.batch} batch on ${session.date}.\n\nPlease contact ProTrack Kaizen office if there is any reason for absence.\n\n- ProTrack Kaizen`;
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function whatsappLink(record, session) {
  const phone = normalizePhone(record.parentPhone);
  const text = encodeURIComponent(alertMessage(record, session));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export default function Attendance() {
  const { permissions } = useAuth();
  const { canDelete, canApproveCorrections } = permissions;
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [parentAlertLogs, setParentAlertLogs] = useState([]);
  const [parentCallLogs, setParentCallLogs] = useState([]);
  const [staffToday, setStaffToday] = useState([]);
  const [staffMonthly, setStaffMonthly] = useState({ rows: [], summary: [] });
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [reportMonth, setReportMonth] = useState(monthNow());
  const [sessionForm, setSessionForm] = useState(defaultSessionForm);
  const [staffForm, setStaffForm] = useState({ staff_id: '', branchName: 'Tembhurni', scheduledStart: '07:00', scheduledLectures: '4', lecturesTaken: '4', remarks: '' });
  const [leaveForm, setLeaveForm] = useState({ staff_id: '', leaveType: 'Casual Leave', fromDate: today(), toDate: today(), replacementTeacher: '', reason: '' });
  const [callNotes, setCallNotes] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const batches = useMemo(() => {
    return [...new Set(students.map((student) => student.batch).filter(Boolean))].sort();
  }, [students]);

  async function load(preferredSessionId = selectedSession?.id) {
    setError('');
    try {
      const [studentRows, teacherRows, sessionRows, dashboardRows, reportRows, alertRows, callRows, staffRows, staffMonthRows, leaveRows, correctionRows] = await Promise.all([
        fetchStudents(),
        fetchTeachers(),
        fetchAttendanceSessions(),
        fetchAttendanceDashboard(today()),
        fetchAttendanceReports(reportMonth),
        fetchParentAlertLogs(),
        fetchParentCallLogs(),
        fetchStaffAttendanceToday(today()),
        fetchStaffAttendanceMonthly(reportMonth),
        fetchLeaveRequests(),
        fetchAttendanceCorrections(),
      ]);
      setStudents(studentRows);
      setTeachers(teacherRows);
      setSessions(sessionRows);
      setDashboard(dashboardRows);
      setReports(reportRows);
      setParentAlertLogs(alertRows);
      setParentCallLogs(callRows);
      setStaffToday(staffRows);
      setStaffMonthly(staffMonthRows);
      setLeaveRequests(leaveRows);
      setCorrections(correctionRows);
      const nextSession = sessionRows.find((session) => String(session.id) === String(preferredSessionId)) || sessionRows[0];
      if (nextSession) {
        setSelectedSession(await fetchAttendanceSession(nextSession.id));
      } else {
        setSelectedSession(null);
      }
    } catch (err) {
      setError(err.error || 'Could not load attendance data');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadReports(month = reportMonth) {
    setReportMonth(month);
    setReports(await fetchAttendanceReports(month));
  }

  async function handleCreateSession(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const created = await createAttendanceSession(sessionForm);
      setSelectedSession(created);
      setSessionForm(defaultSessionForm());
      setMessage('Attendance session created.');
      await load(created.id);
    } catch (err) {
      setError(err.error || 'Could not create attendance session');
    }
  }

  function updateRecord(recordId, patch) {
    setSelectedSession((current) => ({
      ...current,
      records: current.records.map((record) => (record.id === recordId ? { ...record, ...patch } : record)),
    }));
  }

  async function handleMarkAllPresent() {
    if (!selectedSession) return;
    const updated = await markAllAttendancePresent(selectedSession.id);
    setSelectedSession(updated);
    setMessage('All students marked present.');
  }

  async function handleSave(submit = false) {
    if (!selectedSession) return;
    setMessage('');
    setError('');
    try {
      const updated = await saveAttendanceRecords(selectedSession.id, {
        submit,
        records: selectedSession.records.map((record) => ({
          student_id: record.student_id || record.studentId,
          status: record.status,
          arrivalTime: record.arrivalTime,
          alertStatus: record.alertStatus,
          remarks: record.remarks,
        })),
      });
      setSelectedSession(updated);
      setMessage(submit ? 'Attendance submitted and locked.' : 'Attendance draft saved.');
      await load(updated.id);
    } catch (err) {
      setError(err.error || 'Could not save attendance');
    }
  }

  async function handleAlert(record, alertStatus = 'Sent') {
    await updateAttendanceAlert(record.id, alertStatus);
    updateRecord(record.id, { alertStatus });
    setMessage(`Parent alert marked ${alertStatus.toLowerCase()} for ${record.studentName}.`);
  }

  async function handleCopyAlert(record) {
    if (!selectedSession) return;
    const text = alertMessage(record, selectedSession);
    await navigator.clipboard.writeText(text);
    setMessage(`WhatsApp message copied for ${record.studentName}.`);
  }

  async function handleParentCall(record, callOutcome) {
    await createParentCallLog({
      student_id: record.student_id || record.studentId,
      attendance_record_id: record.id,
      parentPhone: record.parentPhone,
      callOutcome,
      notes: callNotes[record.id] || '',
    });
    setCallNotes((current) => ({ ...current, [record.id]: '' }));
    setMessage(`Parent call recorded for ${record.studentName}.`);
    await load();
  }

  async function handleStaffCheckIn(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await staffCheckIn(staffForm);
      setMessage('Staff check-in recorded.');
      await load();
    } catch (err) {
      setError(err.error || 'Could not record check-in');
    }
  }

  async function handleStaffCheckOut() {
    setMessage('');
    setError('');
    try {
      await staffCheckOut(staffForm);
      setMessage('Staff check-out recorded.');
      await load();
    } catch (err) {
      setError(err.error || 'Could not record check-out');
    }
  }

  async function handleLeaveRequest(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await createLeaveRequest(leaveForm);
      setMessage('Leave request created.');
      setLeaveForm({ staff_id: '', leaveType: 'Casual Leave', fromDate: today(), toDate: today(), replacementTeacher: '', reason: '' });
      await load();
    } catch (err) {
      setError(err.error || 'Could not create leave request');
    }
  }

  async function handleCorrection(record, newStatus) {
    const requestReason = window.prompt('Reason for correction request');
    if (!requestReason) return;
    await createAttendanceCorrection({ record_id: record.id, newStatus, requestReason });
    setMessage('Correction request submitted for admin approval.');
    await load();
  }

  async function handleDeleteSession(id) {
    await deleteAttendanceSession(id);
    setMessage('Attendance session deleted.');
    await load();
  }

  const absentRecords = selectedSession?.records?.filter((record) => ['Absent', 'Late'].includes(record.status)) || [];

  return (
    <PageShell
      title="Attendance"
      description="Track lecture-wise student attendance, parent alerts, batch discipline, and teacher accountability."
    >
      {message ? <Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-4 md:grid-cols-6">
        {[
          ['Lectures Today', dashboard?.totalLecturesToday || 0],
          ['Marked', dashboard?.attendanceMarked || 0],
          ['Pending', dashboard?.pendingAttendance || 0],
          ['Absent Today', dashboard?.totalStudentsAbsentToday || 0],
          ['Alerts Sent', dashboard?.parentAlertsSent || 0],
          ['Alert Failed', dashboard?.alertFailed || 0],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>

      {dashboard?.lowestAttendanceBatch ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Lowest attendance batch today: <strong>{dashboard.lowestAttendanceBatch}</strong></div>
      ) : null}

      <Tabs defaultValue="student-attendance" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="student-attendance">Student Attendance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="staff">Staff Attendance</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
          <TabsTrigger value="proof">Proof Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="student-attendance" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <form onSubmit={handleCreateSession} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold">Create Lecture Session</h3>
            </div>
            <div className="mt-4 grid gap-3">
              <input type="date" value={sessionForm.date} onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
              <select value={sessionForm.batch} onChange={(e) => setSessionForm({ ...sessionForm, batch: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
                <option value="">Select batch</option>
                {batches.map((batch) => <option key={batch}>{batch}</option>)}
              </select>
              <input value={sessionForm.course} onChange={(e) => setSessionForm({ ...sessionForm, course: e.target.value })} placeholder="Course, e.g. NEET" className="rounded-md border px-3 py-2 text-sm" />
              <input value={sessionForm.subject} onChange={(e) => setSessionForm({ ...sessionForm, subject: e.target.value })} placeholder="Subject" className="rounded-md border px-3 py-2 text-sm" required />
              <select value={sessionForm.teacher_id} onChange={(e) => setSessionForm({ ...sessionForm, teacher_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                <option value="">Select teacher</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} - {teacher.subject || 'Teacher'}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="time" value={sessionForm.startTime} onChange={(e) => setSessionForm({ ...sessionForm, startTime: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
                <input type="time" value={sessionForm.endTime} onChange={(e) => setSessionForm({ ...sessionForm, endTime: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required />
              </div>
              <select value={sessionForm.lectureType} onChange={(e) => setSessionForm({ ...sessionForm, lectureType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                {lectureTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
              <input value={sessionForm.remarks} onChange={(e) => setSessionForm({ ...sessionForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm" />
            </div>
            <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Create Session</button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Sessions</h3>
            <div className="mt-4 space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className={`rounded-xl border p-3 ${selectedSession?.id === session.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200'}`}>
                  <button onClick={async () => setSelectedSession(await fetchAttendanceSession(session.id))} className="w-full text-left">
                    <p className="font-semibold">{session.batch} - {session.subject}</p>
                    <p className={selectedSession?.id === session.id ? 'text-sm text-slate-300' : 'text-sm text-slate-500'}>{session.date} {session.startTime}-{session.endTime} - {session.status}</p>
                    <p className={selectedSession?.id === session.id ? 'text-sm text-slate-300' : 'text-sm text-slate-500'}>{session.markedCount}/{session.studentCount} marked, {session.absentCount} absent</p>
                  </button>
                  {canDelete ? <button onClick={() => handleDeleteSession(session.id)} className="mt-2 rounded-md bg-rose-500 px-3 py-1 text-sm text-white"><Trash2 className="inline h-4 w-4" /> Delete</button> : null}
                </div>
              ))}
              {!sessions.length ? <p className="text-sm text-slate-500">No attendance sessions yet.</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-semibold">Teacher Attendance Screen</h3>
              {selectedSession ? (
                <p className="mt-1 text-sm text-slate-600">{selectedSession.date} - {selectedSession.batch} - {selectedSession.subject} - {selectedSession.lectureType} - {selectedSession.startTime} to {selectedSession.endTime}</p>
              ) : <p className="mt-1 text-sm text-slate-600">Select or create a session.</p>}
            </div>
            {selectedSession && !selectedSession.lockedAt ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={handleMarkAllPresent} className="rounded-md border px-3 py-2 text-sm"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Mark All Present</button>
                <button onClick={() => handleSave(false)} className="rounded-md border px-3 py-2 text-sm"><Save className="mr-1 inline h-4 w-4" /> Save Draft</button>
                <button onClick={() => handleSave(true)} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Send className="mr-1 inline h-4 w-4" /> Submit</button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {(selectedSession?.records || []).map((record) => (
              <div key={record.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold">{record.studentName}</p>
                    <p className="text-sm text-slate-500">{record.grade || '-'} - Parent {record.parentPhone || '-'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attendanceStatuses.map((status) => (
                      <button
                        key={status}
                        disabled={Boolean(selectedSession.lockedAt)}
                        onClick={() => updateRecord(record.id, { status, alertStatus: ['Absent', 'Late'].includes(status) ? 'Not Sent' : 'Not Required' })}
                        className={`rounded-md px-3 py-1 text-sm ${record.status === status ? 'bg-slate-950 text-white' : 'border'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[150px_1fr]">
                  <input type="time" value={record.arrivalTime || ''} onChange={(e) => updateRecord(record.id, { arrivalTime: e.target.value })} disabled={Boolean(selectedSession.lockedAt)} className="rounded-md border px-3 py-2 text-sm" />
                  <input value={record.remarks || ''} onChange={(e) => updateRecord(record.id, { remarks: e.target.value })} disabled={Boolean(selectedSession.lockedAt)} placeholder="Remarks, e.g. came 20 minutes late" className="rounded-md border px-3 py-2 text-sm" />
                </div>
                {selectedSession.lockedAt ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attendanceStatuses.filter((status) => status !== record.status).map((status) => (
                      <button key={status} onClick={() => handleCorrection(record, status)} className="rounded-md border px-2 py-1 text-xs">Request {status}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {selectedSession && !selectedSession.records?.length ? <p className="text-sm text-slate-500">No students found for this batch.</p> : null}
          </div>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold">Parent Alert Screen</h3>
        </div>
        <div className="mt-4 space-y-3">
          {absentRecords.map((record) => (
            <div key={record.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold">{record.studentName} - {record.status}</p>
                  <p className="text-sm text-slate-500">{selectedSession.batch} - {selectedSession.subject} - Alert: {record.alertStatus}</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{alertMessage(record, selectedSession)}</pre>
                </div>
                <div className="min-w-[220px] space-y-2">
                  <textarea
                    value={callNotes[record.id] || ''}
                    onChange={(e) => setCallNotes((current) => ({ ...current, [record.id]: e.target.value }))}
                    placeholder="Call notes"
                    className="h-20 w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <a href={whatsappLink(record, selectedSession)} target="_blank" rel="noreferrer" onClick={() => handleAlert(record, 'Sent')} className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white">
                      <MessageCircle className="mr-1 inline h-4 w-4" /> WhatsApp
                    </a>
                    <button onClick={() => handleCopyAlert(record)} className="rounded-md border px-3 py-1 text-sm">
                      <Copy className="mr-1 inline h-4 w-4" /> Copy
                    </button>
                    <button onClick={() => handleParentCall(record, 'Connected')} className="rounded-md border px-3 py-1 text-sm">Call Connected</button>
                    <button onClick={() => handleParentCall(record, 'No Answer')} className="rounded-md border px-3 py-1 text-sm">No Answer</button>
                    <button onClick={() => handleAlert(record, 'Failed')} className="rounded-md border px-3 py-1 text-sm">Failed</button>
                    <button onClick={() => updateRecord(record.id, { status: 'Excused', alertStatus: 'Not Required' })} className="rounded-md border px-3 py-1 text-sm">Mark Excused</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!absentRecords.length ? <p className="text-sm text-slate-500">No absent or late students in selected session.</p> : null}
        </div>
      </div>

        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="font-semibold">Attendance Reports</h3>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <input type="month" value={reportMonth} onChange={(e) => reloadReports(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <ReportList title="Daily Absent Report" rows={reports?.dailyAbsent || []} empty="No absent students today." render={(row) => (
            <p><strong>{row.studentName}</strong> - {row.batch} - {row.subject} - {row.teacherName || '-'} - {row.alertStatus}</p>
          )} />
          <ReportList title="Monthly Attendance Percentage" rows={reports?.monthlyStudentAttendance || []} empty="No monthly rows yet." render={(row) => (
            <p><strong>{row.studentName}</strong> - {row.batch}: {row.attendancePercent}% ({row.present} present, {row.absent} absent, {row.late} late)</p>
          )} />
          <ReportList title="Irregular Student List" rows={reports?.irregularStudents || []} empty="No irregular students for this month." render={(row) => (
            <p><strong>{row.studentName}</strong> - {row.batch}: {row.attendancePercent}% - {row.reason}</p>
          )} />
          <ReportList title="Batch Attendance Report" rows={reports?.batchAttendance || []} empty="No batch rows yet." render={(row) => (
            <p><strong>{row.batch}</strong> - Avg {row.averageAttendance}% - {row.irregularStudents} irregular students</p>
          )} />
          <ReportList title="Subject-Wise Attendance" rows={reports?.subjectAttendance || []} empty="No subject rows yet." render={(row) => (
            <p><strong>{row.subject}</strong> - {row.batch}: {row.averageAttendance}% across {row.totalLectures} lectures</p>
          )} />
          <ReportList title="Teacher Attendance Completion" rows={reports?.teacherCompletion || reports?.teacherWise || []} empty="No teacher completion rows yet." render={(row) => (
            <p><strong>{row.teacherName}</strong> - {row.subject}: {row.attendanceMarked}/{row.lecturesAssigned} marked, {row.pending} pending, avg student attendance {row.averageStudentAttendance}%</p>
          )} />
          <ReportList title="Parent Alert Log" rows={reports?.parentAlertLogs || []} empty="No parent alert logs yet." render={(row) => (
            <p><strong>{row.studentName}</strong> - {row.alertType} - {row.channel} - {row.delivery || row.status} - {row.sentAt}</p>
          )} />
        </div>
      </div>

        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleStaffCheckIn} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Teacher / Staff Attendance</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={staffForm.staff_id} onChange={(e) => setStaffForm({ ...staffForm, staff_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select staff</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} - {teacher.subject || 'Teacher'}</option>)}
            </select>
            <input value={staffForm.branchName} onChange={(e) => setStaffForm({ ...staffForm, branchName: e.target.value })} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
            <input type="time" value={staffForm.scheduledStart} onChange={(e) => setStaffForm({ ...staffForm, scheduledStart: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input type="number" value={staffForm.scheduledLectures} onChange={(e) => setStaffForm({ ...staffForm, scheduledLectures: e.target.value })} placeholder="Scheduled lectures" className="rounded-md border px-3 py-2 text-sm" />
            <input type="number" value={staffForm.lecturesTaken} onChange={(e) => setStaffForm({ ...staffForm, lecturesTaken: e.target.value })} placeholder="Lectures taken" className="rounded-md border px-3 py-2 text-sm" />
            <input value={staffForm.remarks} onChange={(e) => setStaffForm({ ...staffForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Check In</button>
            <button type="button" onClick={handleStaffCheckOut} className="rounded-md border px-4 py-2 text-sm">Check Out</button>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {staffToday.map((row) => (
              <div key={row.id} className="rounded-lg bg-slate-50 p-3">
                <strong>{row.staffName}</strong> - {row.status} - In {row.checkIn || '-'} Out {row.checkOut || '-'} - Late {row.lateMinutes || 0} min
              </div>
            ))}
            {!staffToday.length ? <p className="text-slate-500">No staff attendance today.</p> : null}
          </div>
        </form>

        <form onSubmit={handleLeaveRequest} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Teacher Leave Management</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={leaveForm.staff_id} onChange={(e) => setLeaveForm({ ...leaveForm, staff_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select staff</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
            <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {leaveTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="date" value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input type="date" value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input value={leaveForm.replacementTeacher} onChange={(e) => setLeaveForm({ ...leaveForm, replacementTeacher: e.target.value })} placeholder="Replacement teacher" className="rounded-md border px-3 py-2 text-sm" />
            <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason" className="rounded-md border px-3 py-2 text-sm" required />
          </div>
          <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Apply Leave</button>
          <div className="mt-4 space-y-2 text-sm">
            {leaveRequests.slice(0, 5).map((leave) => (
              <div key={leave.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span><strong>{leave.staffName}</strong> - {leave.leaveType} - {leave.status}</span>
                  {canApproveCorrections && leave.status === 'Pending' ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={async () => { await approveLeaveRequest(leave.id); await load(); }} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button>
                      <button type="button" onClick={async () => { await rejectLeaveRequest(leave.id); await load(); }} className="rounded-md bg-rose-500 px-2 py-1 text-xs text-white">Reject</button>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </form>
      </div>

        </TabsContent>

        <TabsContent value="corrections" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ReportList title="Staff Monthly Summary" rows={staffMonthly.summary || []} empty="No staff monthly rows yet." render={(row) => (
          <p><strong>{row.staffName}</strong> - {row.presentDays} present days, {row.lateMarks} late marks, {row.missedLectures} missed lectures, salary half-day deductions {row.salaryHalfDayDeductions}</p>
        )} />
        <ReportList title="Attendance Corrections" rows={corrections || []} empty="No correction requests yet." render={(row) => (
          <div>
            <p><strong>{row.studentName || 'Student'}</strong> - {row.oldStatus} to {row.newStatus} - {row.status} - {row.requestReason}</p>
            {canApproveCorrections && row.status === 'Pending' ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={async () => { await approveAttendanceCorrection(row.id); await load(); }} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button>
                <button type="button" onClick={async () => { await rejectAttendanceCorrection(row.id); await load(); }} className="rounded-md bg-rose-500 px-2 py-1 text-xs text-white">Reject</button>
              </div>
            ) : null}
          </div>
        )} />
      </div>

        </TabsContent>

        <TabsContent value="proof" className="space-y-6">
      <ReportList title="Latest Parent Alert Proof Logs" rows={parentAlertLogs || []} empty="No parent alert proof logs yet." render={(row) => (
        <p><strong>{row.studentName}</strong> - {row.alertType} - {row.channel} - {row.delivery || row.status} - {row.sentAt}</p>
      )} />

      <ReportList title="Parent Call Records" rows={parentCallLogs || []} empty="No parent calls recorded yet." render={(row) => (
        <p><strong>{row.studentName}</strong> - {row.callOutcome} - {row.parentPhone || '-'} - by {row.calledBy || '-'} - {row.calledAt}</p>
      )} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ReportList({ title, rows, empty, render }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.slice(0, 8).map((row, index) => (
          <div key={index} className="rounded-lg bg-muted/40 p-3">{render(row)}</div>
        ))}
        {!rows.length ? <p className="text-muted-foreground">{empty}</p> : null}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
