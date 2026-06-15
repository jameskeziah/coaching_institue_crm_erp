import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  IndianRupee,
  Receipt,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  completeFollowUp,
  fetchAdmissions,
  fetchAttendanceDashboard,
  fetchAttendanceReports,
  fetchExpenseReports,
  fetchFeePlans,
  fetchFeesSummary,
  fetchFollowUps,
  fetchStudents,
  fetchTeacherReviews,
  fetchTeachers,
} from '../api';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const KPI_AREAS = [
  { key: 'attendance', weight: 15 },
  { key: 'syllabus', weight: 20 },
  { key: 'classQuality', weight: 20 },
  { key: 'studentImprovement', weight: 20 },
  { key: 'discipline', weight: 15 },
  { key: 'documentation', weight: 10 },
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

function calculateReviewScore(scores = {}) {
  const finalScore = KPI_AREAS.reduce((sum, item) => {
    const entry = scores[item.key] || {};
    const rawScore = Math.min(10, Math.max(0, Number(entry.score || 0)));
    const hasEvidence = Boolean(entry.evidence?.trim());
    const effectiveScore = hasEvidence ? rawScore : rawScore * 0.8;
    return sum + (effectiveScore / 10) * item.weight;
  }, 0);

  if (finalScore >= 85) return { finalScore, grade: 'A' };
  if (finalScore >= 70) return { finalScore, grade: 'B' };
  if (finalScore >= 55) return { finalScore, grade: 'C' };
  return { finalScore, grade: 'D' };
}

function latestReviewsByTeacher(reviews) {
  const latest = new Map();
  reviews.forEach((review) => {
    const existing = latest.get(review.teacher_id);
    const reviewDate = new Date(review.updatedAt || review.createdAt || 0);
    const existingDate = new Date(existing?.updatedAt || existing?.createdAt || 0);
    if (!existing || reviewDate > existingDate) latest.set(review.teacher_id, review);
  });
  return Array.from(latest.values());
}

export default function Dashboard() {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [fees, setFees] = useState({ totals: {} });
  const [feePlans, setFeePlans] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [attendanceReports, setAttendanceReports] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard(nextMonth = month) {
    setLoading(true);
    setError('');
    try {
      const [
        teacherRows,
        studentRows,
        admissionRows,
        reviewRows,
        feeRows,
        planRows,
        followUpRows,
        attendanceRows,
        attendanceReportRows,
        expenseRows,
      ] = await Promise.all([
        fetchTeachers(),
        fetchStudents(),
        fetchAdmissions(),
        fetchTeacherReviews(),
        fetchFeesSummary(),
        fetchFeePlans(),
        fetchFollowUps({ status: 'Open' }).catch(() => []),
        fetchAttendanceDashboard(today()),
        fetchAttendanceReports(nextMonth),
        fetchExpenseReports(nextMonth),
      ]);
      setTeachers(teacherRows);
      setStudents(studentRows);
      setAdmissions(admissionRows);
      setReviews(reviewRows);
      setFees(feeRows);
      setFeePlans(planRows);
      setFollowUps(followUpRows);
      setAttendance(attendanceRows);
      setAttendanceReports(attendanceReportRows);
      setExpenses(expenseRows);
    } catch (err) {
      setError(err.error || 'Could not load dashboard data. Sign in and make sure the API server is running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    const latestReviews = latestReviewsByTeacher(reviews).map((review) => ({
      ...review,
      result: calculateReviewScore(review.scores),
    }));
    const weakReviews = latestReviews.filter((review) => ['C', 'D'].includes(review.result.grade));
    const openAdmissions = admissions.filter((item) => !['Converted', 'Lost', 'Rejected'].includes(item.status)).length;
    const overduePlans = feePlans
      .filter((plan) => Number(plan.dueAmount || 0) > 0 && (plan.feeStatus === 'Overdue' || plan.nextDueDate < today()))
      .sort((a, b) => Number(b.dueAmount || 0) - Number(a.dueAmount || 0));
    const lowAttendance = (attendanceReports?.irregularStudents || []).slice().sort((a, b) => a.attendancePercent - b.attendancePercent);
    const repeatedAbsentees = (attendanceReports?.irregularStudents || []).filter((row) => row.absent >= 3);
    const teacherPending = (attendanceReports?.teacherCompletion || []).filter((row) => Number(row.pending || 0) > 0);
    const billPending = expenses?.billPending || [];
    const todayFollowUps = followUps
      .filter((task) => task.status === 'Overdue' || !task.dueDate || task.dueDate <= today())
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));

    return {
      openAdmissions,
      weakReviews,
      overduePlans,
      lowAttendance,
      repeatedAbsentees,
      teacherPending,
      billPending,
      todayFollowUps,
      overdueFollowUps: followUps.filter((task) => task.status === 'Overdue'),
      cashPosition: Number(fees.totals?.collected || 0) - Number(expenses?.totals?.totalExpenses || 0),
    };
  }, [admissions, attendanceReports, expenses, feePlans, fees, followUps, reviews]);

  async function handleMonthChange(value) {
    setMonth(value);
    await loadDashboard(value);
  }

  async function handleCompleteFollowUp(taskId) {
    await completeFollowUp(taskId);
    await loadDashboard(month);
  }

  if (loading) {
    return (
      <PageShell title="Today's Institute Dashboard" description="Loading operations, cash, risk, and action items.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-5">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="mt-4 h-8 w-20 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Today's Institute Dashboard" description="Operations, cash, risk, and action items.">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => loadDashboard()} className="w-fit">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Today's Institute Dashboard"
      description="Operations, cash, risk, and action items in one owner view."
      actions={<Input type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} className="w-[170px]" />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Users} label="Students" value={students.length} />
        <Metric icon={CalendarCheck} label="Absent Today" value={attendance?.totalStudentsAbsentToday || 0} tone="risk" />
        <Metric icon={Bell} label="Alert Failed" value={attendance?.alertFailed || 0} tone="risk" />
        <Metric icon={ClipboardCheck} label="Pending Attendance" value={attendance?.pendingAttendance || 0} />
        <Metric icon={UserPlus} label="Open Admissions" value={metrics.openAdmissions} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={CreditCard} label="Fees Collected" value={money(fees.totals?.collected)} />
        <Metric icon={AlertTriangle} label="Fees Pending" value={money(fees.totals?.pending)} tone="risk" />
        <Metric icon={AlertTriangle} label="Overdue Fees" value={money(fees.totals?.overdue)} tone="risk" />
        <Metric icon={Receipt} label="Monthly Expenses" value={money(expenses?.totals?.totalExpenses)} />
        <Metric icon={CheckCircle2} label="Due Follow-ups" value={metrics.todayFollowUps.length} tone={metrics.overdueFollowUps.length ? 'risk' : 'neutral'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-6 lg:grid-cols-2">
          <RiskList title="Low Attendance Students" rows={metrics.lowAttendance} empty="No low-attendance students for this month." render={(row) => (
            <span><strong>{row.studentName}</strong> - {row.batch} - {row.attendancePercent}% - {row.reason}</span>
          )} />
          <RiskList title="Overdue Fee Students" rows={metrics.overduePlans} empty="No overdue fee plans." render={(row) => (
            <span><strong>{row.studentName}</strong> - {money(row.dueAmount)} due - next due {row.nextDueDate || '-'}</span>
          )} />
          <RiskList title="Teacher Attendance Pending" rows={metrics.teacherPending} empty="No pending teacher attendance for this month." render={(row) => (
            <span><strong>{row.teacherName}</strong> - {row.subject} - {row.pending} pending of {row.lecturesAssigned}</span>
          )} />
          <RiskList title="Bill Pending Expenses" rows={metrics.billPending} empty="No bill-pending expenses." render={(row) => (
            <span><strong>{row.expenseId}</strong> - {row.category} - {money(row.amount)} - {row.paidTo}</span>
          )} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription>Common daily tasks</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <QuickAction to="/students" label="Add student" />
              <QuickAction to="/fees" label="Collect fee / print receipt" />
              <QuickAction to="/attendance" label="Mark attendance" />
              <QuickAction to="/expenses" label="Generate monthly expenses" />
              <QuickAction to="/teacher-performance" label="Create teacher review" />
            </CardContent>
          </Card>

          <SideList title="Today's Follow-ups" rows={metrics.todayFollowUps} empty="No follow-ups due today." render={(task) => (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong>{task.studentName || 'Student'}</strong>
                  <p className="mt-1 text-muted-foreground">{task.taskType} - due {task.dueDate || '-'}</p>
                </div>
                <Badge variant={task.status === 'Overdue' ? 'destructive' : 'secondary'}>{task.status}</Badge>
              </div>
              {task.notes ? <p className="mt-2 text-muted-foreground">{task.notes}</p> : null}
              <Button size="sm" variant="outline" className="mt-3" onClick={() => handleCompleteFollowUp(task.id)}>
                Mark Done
              </Button>
            </>
          )} />

          <SideList title="Teacher Performance Risk" rows={metrics.weakReviews} empty="No weak latest teacher reviews." render={(review) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <strong>{review.teacherName || 'Teacher'}</strong>
                <Badge variant={review.result.grade === 'D' ? 'destructive' : 'secondary'}>Grade {review.result.grade}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{review.teacherSubject || '-'} - {review.result.finalScore.toFixed(1)}%</p>
            </>
          )} />

          <SideList title="Repeated Absentees" rows={metrics.repeatedAbsentees} empty="No repeated absentees for this month." render={(row) => (
            <>
              <strong>{row.studentName}</strong>
              <p className="mt-1 text-muted-foreground">{row.batch} - {row.absent} absences, {row.late} late marks</p>
            </>
          )} />
        </div>
      </div>
    </PageShell>
  );
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }) {
  const toneClass = tone === 'risk' ? 'text-destructive' : tone === 'good' ? 'text-emerald-600' : 'text-foreground';
  const badgeVariant = tone === 'risk' ? 'destructive' : tone === 'good' ? 'secondary' : 'outline';
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Badge variant={badgeVariant} className="h-7 w-7 justify-center rounded-md p-0">
            <Icon className="h-4 w-4" />
          </Badge>
        </div>
        <p className={`mt-3 text-2xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function RiskList({ title, rows, empty, render }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 pr-3">
          <div className="space-y-3 text-sm">
            {rows.slice(0, 7).map((row, index) => (
              <div key={index} className="rounded-md border bg-muted/35 p-3">{render(row)}</div>
            ))}
            {!rows.length ? <p className="text-muted-foreground">{empty}</p> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SideList({ title, rows, empty, render }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          {rows.slice(0, 5).map((row, index) => (
            <div key={row.id || `${row.studentName}-${index}`} className="rounded-md border bg-muted/35 p-3">{render(row)}</div>
          ))}
          {!rows.length ? <p className="text-muted-foreground">{empty}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, label }) {
  return (
    <Button asChild variant="outline" className="justify-start">
      <Link to={to}>{label}</Link>
    </Button>
  );
}
