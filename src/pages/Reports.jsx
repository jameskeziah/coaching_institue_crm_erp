import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  Download,
  IndianRupee,
  Printer,
  Receipt,
  RefreshCw,
  Users,
} from 'lucide-react';

import {
  fetchAttendanceReports,
  fetchExpenseReports,
  fetchFeePlans,
  fetchFeeReports,
  fetchFeesSummary,
  fetchSourceAnalytics,
  fetchStaffAttendanceMonthly,
  fetchStudents,
} from '@/api';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value || 0));
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function normalizeText(value, fallback = 'Unassigned') {
  return String(value || fallback).trim() || fallback;
}

function getStudentData(student) {
  return student?.data || {};
}

function groupCount(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = normalizeText(keyFn(row));
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  return Array.from(groups, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    students: [],
    feesSummary: { totals: {} },
    feePlans: [],
    feeReports: {},
    expenses: { totals: {} },
    attendance: {},
    sourceAnalytics: [],
    staff: { summary: [] },
  });

  async function loadReports(nextMonth = month) {
    setLoading(true);
    setError('');
    try {
      const [
        students,
        feesSummary,
        feePlans,
        feeReports,
        expenses,
        attendance,
        sourceAnalytics,
        staff,
      ] = await Promise.all([
        fetchStudents(),
        fetchFeesSummary(),
        fetchFeePlans(),
        fetchFeeReports(),
        fetchExpenseReports(nextMonth),
        fetchAttendanceReports(nextMonth),
        fetchSourceAnalytics({ from: `${nextMonth}-01`, to: `${nextMonth}-31` }),
        fetchStaffAttendanceMonthly(nextMonth),
      ]);

      setData({ students, feesSummary, feePlans, feeReports, expenses, attendance, sourceAnalytics: sourceAnalytics.data || [], staff });
    } catch (err) {
      setError(err.error || 'Could not load reports. Sign in with a finance/admin role and make sure the API server is running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useMemo(() => {
    const feeTotals = data.feesSummary?.totals || {};
    const expenseTotals = data.expenses?.totals || {};
    const collected = Number(feeTotals.collected || 0);
    const pending = Number(feeTotals.pending || 0);
    const overdue = Number(feeTotals.overdue || 0);
    const expenses = Number(expenseTotals.totalExpenses || 0);
    const pendingLiabilities = Number(expenseTotals.pendingLiabilities || 0);
    const salaryRows = (data.expenses?.categoryWise || [])
      .filter((row) => /salary/i.test(row.category || row.name || ''));
    const salaryPaid = salaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const salaryPending = (data.expenses?.approvalPending || [])
      .filter((row) => /salary/i.test(row.category || ''))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const netCash = collected - expenses;

    const activeStudents = data.students.filter((student) => {
      const status = normalizeText(getStudentData(student).status || student.status, 'Active').toLowerCase();
      return !['inactive', 'dropout', 'completed'].includes(status);
    }).length;

    const overduePlans = data.feePlans
      .filter((plan) => Number(plan.dueAmount || 0) > 0 && (plan.feeStatus === 'Overdue' || Number(plan.overdueAmount || 0) > 0))
      .sort((a, b) => Number(b.dueAmount || 0) - Number(a.dueAmount || 0));

    const attendanceRows = data.attendance?.monthlyStudentAttendance || [];
    const averageAttendance = attendanceRows.length
      ? attendanceRows.reduce((sum, row) => sum + Number(row.attendancePercent || 0), 0) / attendanceRows.length
      : 0;

    return {
      collected,
      pending,
      overdue,
      expenses,
      pendingLiabilities,
      salaryPaid,
      salaryPending,
      netCash,
      activeStudents,
      totalStudents: data.students.length,
      courseGroups: groupCount(data.students, (student) => getStudentData(student).course || student.grade),
      classGroups: groupCount(data.students, (student) => student.grade || getStudentData(student).className),
      statusGroups: groupCount(data.students, (student) => getStudentData(student).status || student.status || 'Active'),
      branchGroups: groupCount(data.students, (student) => getStudentData(student).branch),
      overduePlans,
      averageAttendance,
      irregularStudents: data.attendance?.irregularStudents || [],
      teacherCompletion: data.attendance?.teacherCompletion || [],
      dailyCollection: data.feeReports?.dailyCollection || [],
      categoryWiseExpenses: data.expenses?.categoryWise || [],
      billPending: data.expenses?.billPending || [],
      staffSummary: data.staff?.summary || [],
      sourceAnalytics: data.sourceAnalytics || [],
    };
  }, [data]);

  function handleExport() {
    downloadCsv(`protrack-report-${month}.csv`, [
      ['Metric', 'Value'],
      ['Month', month],
      ['Fees collected', report.collected],
      ['Fees pending', report.pending],
      ['Fees overdue', report.overdue],
      ['Monthly expenses', report.expenses],
      ['Pending liabilities', report.pendingLiabilities],
      ['Teacher salary paid', report.salaryPaid],
      ['Teacher salary pending', report.salaryPending],
      ['Net cash position', report.netCash],
      ['Total students', report.totalStudents],
      ['Active students', report.activeStudents],
      ['Average attendance', percent(report.averageAttendance)],
      [],
      ['Overdue student', 'Course', 'Due amount', 'Next due date'],
      ...report.overduePlans.map((plan) => [plan.studentName, plan.courseProgram, plan.dueAmount, plan.nextDueDate || '']),
    ]);
  }

  if (loading) {
    return (
      <PageShell title="Reports" description="Loading finance, student, attendance, and salary reports.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-5">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="mt-4 h-8 w-24 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Reports" description="Owner/admin finance and operations reporting.">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reports unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => loadReports()} className="w-fit">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Reports"
      description="Owner/admin report for fees, expenses, salaries, students, and attendance."
      actions={(
        <div className="flex flex-wrap gap-2 print:hidden">
          <Input type="month" value={month} onChange={(event) => { setMonth(event.target.value); loadReports(event.target.value); }} className="w-[170px]" />
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      )}
    >
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Report month</p>
            <h3 className="text-xl font-semibold">{month}</h3>
          </div>
          <Badge variant={report.netCash >= 0 ? 'secondary' : 'destructive'}>
            Net cash {money(report.netCash)}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={IndianRupee} label="Fees Collected" value={money(report.collected)} tone="good" />
          <Metric icon={AlertTriangle} label="Pending Fees" value={money(report.pending)} tone="risk" />
          <Metric icon={Receipt} label="Monthly Expenses" value={money(report.expenses)} />
          <Metric icon={Users} label="Active Students" value={`${number(report.activeStudents)} / ${number(report.totalStudents)}`} />
          <Metric icon={AlertTriangle} label="Overdue Fees" value={money(report.overdue)} tone="risk" />
          <Metric icon={Receipt} label="Teacher Salary Paid" value={money(report.salaryPaid)} />
          <Metric icon={AlertTriangle} label="Salary Pending" value={money(report.salaryPending)} tone={report.salaryPending ? 'risk' : 'good'} />
          <Metric icon={CalendarCheck} label="Average Attendance" value={percent(report.averageAttendance)} />
        </div>
      </section>

      <Separator />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <ReportCard title="Overdue Students" description="Highest pending fee balances first.">
            <DataTable
              columns={['Student', 'Course', 'Due', 'Next due', 'Status']}
              rows={report.overduePlans.slice(0, 10).map((plan) => [
                plan.studentName,
                plan.courseProgram,
                money(plan.dueAmount),
                plan.nextDueDate || '-',
                plan.feeStatus || '-',
              ])}
              empty="No overdue fee plans."
            />
          </ReportCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Source-wise Conversion" description="Admissions, conversion, revenue, and cost per admission by source.">
              <DataTable
                columns={['Source', 'Leads', 'Admissions', 'Conversion', 'Spend', 'Cost/admission', 'Revenue']}
                rows={report.sourceAnalytics.map((row) => [
                  String(row.source || 'UNKNOWN').replace(/_/g, ' '),
                  number(row.totalLeads),
                  number(row.convertedLeads),
                  percent(row.conversionRate),
                  money(row.campaignSpend),
                  money(row.costPerAdmission),
                  money(row.revenue),
                ])}
                empty="No source analytics yet."
              />
            </ReportCard>

            <ReportCard title="Fee Collection Trend" description="Recent daily collections.">
              <DataTable
                columns={['Date', 'Collected', 'Payments']}
                rows={report.dailyCollection.slice(0, 8).map((row) => [
                  row.paymentDate || row.date || '-',
                  money(row.amount),
                  number(row.count),
                ])}
                empty="No collection rows yet."
              />
            </ReportCard>

            <ReportCard title="Expense Categories" description="Monthly spend by category.">
              <DataTable
                columns={['Category', 'Amount', 'Count']}
                rows={report.categoryWiseExpenses.map((row) => [
                  row.category || row.name || '-',
                  money(row.amount),
                  number(row.count),
                ])}
                empty="No expense rows yet."
              />
            </ReportCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Attendance Risk" description="Irregular students for the selected month.">
              <DataTable
                columns={['Student', 'Batch', 'Attendance', 'Reason']}
                rows={report.irregularStudents.slice(0, 8).map((row) => [
                  row.studentName,
                  row.batch || '-',
                  percent(row.attendancePercent),
                  row.reason || '-',
                ])}
                empty="No irregular attendance rows."
              />
            </ReportCard>

            <ReportCard title="Teacher Attendance Completion" description="Lecture attendance status by teacher.">
              <DataTable
                columns={['Teacher', 'Subject', 'Assigned', 'Pending']}
                rows={report.teacherCompletion.slice(0, 8).map((row) => [
                  row.teacherName,
                  row.subject || '-',
                  number(row.lecturesAssigned),
                  number(row.pending),
                ])}
                empty="No teacher completion rows."
              />
            </ReportCard>
          </div>
        </div>

        <aside className="space-y-6">
          <GroupCard title="Students By Course" rows={report.courseGroups} />
          <GroupCard title="Students By Class" rows={report.classGroups} />
          <GroupCard title="Students By Status" rows={report.statusGroups} />
          <GroupCard title="Students By Branch" rows={report.branchGroups} />
          <ReportCard title="Bill Pending" description="Expenses still missing bills.">
            <DataTable
              columns={['Expense', 'Category', 'Amount']}
              rows={report.billPending.slice(0, 6).map((row) => [
                row.expenseId,
                row.category,
                money(row.amount),
              ])}
              empty="No bill-pending expenses."
            />
          </ReportCard>
        </aside>
      </div>
    </PageShell>
  );
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }) {
  const toneClass = tone === 'risk' ? 'text-destructive' : tone === 'good' ? 'text-emerald-600' : 'text-foreground';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Badge variant={tone === 'risk' ? 'destructive' : 'secondary'} className="h-7 w-7 justify-center rounded-md p-0">
            <Icon className="h-4 w-4" />
          </Badge>
        </div>
        <p className={`mt-3 text-2xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ReportCard({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => <TableHead key={column}>{column}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className={cellIndex === 0 ? 'font-medium' : ''}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupCard({ title, rows }) {
  return (
    <ReportCard title={title}>
      <div className="space-y-3">
        {rows.slice(0, 8).map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-3 rounded-md border bg-muted/35 px-3 py-2 text-sm">
            <span className="truncate">{row.name}</span>
            <Badge variant="outline">{number(row.count)}</Badge>
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted-foreground">No rows yet.</p> : null}
      </div>
    </ReportCard>
  );
}
