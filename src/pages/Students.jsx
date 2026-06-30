import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { completeFollowUp, createFollowUp, createStudent, createStudentHistory, deleteStudent, deleteStudentHistory, fetchBatches, fetchBranches, fetchCourses, fetchFeePlans, fetchStudent360, fetchStudentFeePlans, fetchStudentHistory, fetchStudents, updateStudent } from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const classes = ['6th', '7th', '8th', '9th', '10th', '11th', '12th', 'Repeater'];
const academicYears = ['2026-27', '2027-28', '2028-29'];
const statuses = ['Enquiry', 'Admitted', 'Active', 'Inactive', 'Dropout', 'Completed'];
const historyTypes = ['Test', 'Complaint', 'Parent Meeting', 'Attendance', 'Fee', 'Note'];
const followUpTypes = ['Fee Payment Promise', 'Parent Call Follow-up', 'Attendance Risk', 'Test Result Remedial', 'Admission Follow-up', 'Complaint Resolution'];
const followUpPriorities = ['Medium', 'High', 'Urgent', 'Low'];
const profileTabs = ['Profile', 'Fees', 'Attendance', 'Academic', 'Communication'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getAttendancePercent(student) {
  const raw = student?.data?.attendancePercent ?? student?.attendance;
  if (raw === undefined || raw === null || raw === '') return 0;
  const match = String(raw).match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function emptyStudentForm() {
  return {
    name: '',
    grade: '',
    batch: 'Morning',
    attendance: '',
    branchId: '',
    primaryCourseId: '',
    primaryBatchId: '',
    data: {
      status: 'Enquiry',
      school: '',
      examTarget: '',
      academicYear: '2026-27',
      branch: 'Tembhurni',
      photoUrl: '',
      address: '',
      fatherName: '',
      motherName: '',
      primaryPhone: '',
      secondaryPhone: '',
      whatsapp: '',
      course: 'Foundation',
      joiningDate: today(),
      counsellor: '',
      documents: {
        aadhaar: '',
        marksheet: '',
        photo: '',
        admissionForm: '',
      },
    },
  };
}

function normalizeStudentForForm(student) {
  const base = emptyStudentForm();
  return {
    ...base,
    name: student?.name || '',
    grade: student?.grade || '',
    batch: student?.batch || '',
    attendance: student?.attendance || '',
    branchId: student?.branch_id || student?.branchId || '',
    primaryCourseId: student?.primary_course_id || student?.primaryCourseId || '',
    primaryBatchId: student?.primary_batch_id || student?.primaryBatchId || '',
    data: {
      ...base.data,
      ...(student?.data || {}),
      documents: {
        ...base.data.documents,
        ...(student?.data?.documents || {}),
      },
    },
  };
}

export default function Students() {
  const { permissions } = useAuth();
  const { canDelete } = permissions;
  const [students, setStudents] = useState([]);
  const [branchMasters, setBranchMasters] = useState([]);
  const [courseMasters, setCourseMasters] = useState([]);
  const [batchMasters, setBatchMasters] = useState([]);
  const [allFeePlans, setAllFeePlans] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyStudentForm);
  const [history, setHistory] = useState([]);
  const [feePlans, setFeePlans] = useState([]);
  const [student360, setStudent360] = useState(null);
  const [activeTab, setActiveTab] = useState('Profile');
  const [historyForm, setHistoryForm] = useState({ type: 'Note', title: '', detail: '', eventDate: today() });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    course: 'All',
    grade: 'All',
    batch: 'All',
    status: 'All',
    branch: 'All',
    fee: 'All',
    attendance: 'All',
  });

  const selectedStudent = students.find((student) => String(student.id) === String(selectedId));

  const feeByStudent = useMemo(() => {
    return allFeePlans.reduce((acc, plan) => {
      const studentId = String(plan.student_id || plan.studentId || '');
      if (!studentId) return acc;
      if (!acc[studentId]) acc[studentId] = { due: 0, paid: 0, net: 0, plans: 0 };
      acc[studentId].due += Number(plan.dueAmount || 0);
      acc[studentId].paid += Number(plan.paidAmount || 0);
      acc[studentId].net += Number(plan.netAmount || 0);
      acc[studentId].plans += 1;
      return acc;
    }, {});
  }, [allFeePlans]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const data = student.data || {};
      const fee = feeByStudent[String(student.id)] || {};
      const attendancePercent = getAttendancePercent(student);
      const matchesSearch = !query || [student.name, student.grade, student.batch, data.course, data.academicYear, data.branch, data.school, data.examTarget, data.status, data.primaryPhone, data.whatsapp]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesCourse = filters.course === 'All' || data.course === filters.course;
      const matchesGrade = filters.grade === 'All' || student.grade === filters.grade;
      const matchesBatch = filters.batch === 'All' || student.batch === filters.batch;
      const matchesStatus = filters.status === 'All' || data.status === filters.status;
      const matchesBranch = filters.branch === 'All' || data.branch === filters.branch;
      const matchesFee = filters.fee === 'All' || (filters.fee === 'Pending' ? Number(fee.due || 0) > 0 : Number(fee.due || 0) <= 0 && Number(fee.net || 0) > 0);
      const matchesAttendance = filters.attendance === 'All' || (filters.attendance === 'Risk' ? attendancePercent > 0 && attendancePercent < 75 : attendancePercent >= 75);
      return matchesSearch && matchesCourse && matchesGrade && matchesBatch && matchesStatus && matchesBranch && matchesFee && matchesAttendance;
    });
  }, [students, search, filters, feeByStudent]);

  const studentMetrics = useMemo(() => {
    const active = students.filter((student) => ['Admitted', 'Active'].includes(student.data?.status)).length;
    const pendingFees = students.filter((student) => Number(feeByStudent[String(student.id)]?.due || 0) > 0).length;
    const attendanceRisk = students.filter((student) => {
      const percent = getAttendancePercent(student);
      return percent > 0 && percent < 75;
    }).length;
    return { total: students.length, active, pendingFees, attendanceRisk, filtered: filteredStudents.length };
  }, [students, filteredStudents.length, feeByStudent]);

  const feeTotals = useMemo(() => {
    return feePlans.reduce(
      (acc, plan) => {
        acc.net += Number(plan.netAmount || 0);
        acc.paid += Number(plan.paidAmount || 0);
        acc.due += Number(plan.dueAmount || 0);
        return acc;
      },
      { net: 0, paid: 0, due: 0 }
    );
  }, [feePlans]);

  async function loadStudents(preferredId = selectedId) {
    setError('');
    try {
      const [rows, feeRows, branchRows, courseRows, batchRows] = await Promise.all([
        fetchStudents(),
        fetchFeePlans().catch(() => []),
        fetchBranches(),
        fetchCourses(),
        fetchBatches(),
      ]);
      setStudents(rows);
      setAllFeePlans(feeRows);
      setBranchMasters(branchRows);
      setCourseMasters(courseRows);
      setBatchMasters(batchRows);
      const next = rows.find((student) => String(student.id) === String(preferredId)) || rows[0];
      if (next) {
        setSelectedId(String(next.id));
        setForm(normalizeStudentForForm(next));
        await loadStudentDetails(next.id);
      } else {
        setSelectedId('');
        setForm(emptyStudentForm());
        setHistory([]);
        setFeePlans([]);
        setStudent360(null);
      }
    } catch (err) {
      setError(err.error || 'Could not load students');
    }
  }

  async function loadStudentDetails(studentId) {
    try {
      const [historyRows, feeRows] = await Promise.all([
        fetchStudentHistory(studentId),
        fetchStudentFeePlans(studentId),
      ]);
      const profileRows = await fetchStudent360(studentId).catch(() => null);
      setHistory(historyRows);
      setFeePlans(feeRows);
      setStudent360(profileRows);
    } catch (err) {
      setError(err.error || 'Could not load student history');
    }
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectStudent(student) {
    setSelectedId(String(student.id));
    setForm(normalizeStudentForForm(student));
    setFieldErrors({});
    setMessage('');
    setError('');
    loadStudentDetails(student.id);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateData(field, value) {
    setForm((current) => ({ ...current, data: { ...current.data, [field]: value } }));
  }

  function updateDocument(field, value) {
    setForm((current) => ({
      ...current,
      data: {
        ...current.data,
        documents: { ...current.data.documents, [field]: value },
      },
    }));
  }

  function validate() {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    if (!form.data.status.trim()) nextErrors.status = 'Status is required';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveStudent(e) {
    e.preventDefault();
    if (!validate()) return;
    setMessage('');
    setError('');
    try {
      if (selectedStudent) {
        await updateStudent(selectedStudent.id, form);
        setMessage('Student profile updated.');
        await loadStudents(selectedStudent.id);
      } else {
        const created = await createStudent(form);
        setMessage('Student profile created.');
        await loadStudents(created.id);
      }
    } catch (err) {
      setError(err.error || 'Save failed');
    }
  }

  async function addStudent() {
    setSelectedId('');
    setForm(emptyStudentForm());
    setHistory([]);
    setFeePlans([]);
    setStudent360(null);
    setFieldErrors({});
    setMessage('Creating a new student profile.');
    setError('');
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setSearch('');
    setFilters({
      course: 'All',
      grade: 'All',
      batch: 'All',
      status: 'All',
      branch: 'All',
      fee: 'All',
      attendance: 'All',
    });
  }

  function exportStudentsCsv() {
    const headers = ['Name', 'Phone', 'WhatsApp', 'Course', 'Class', 'Batch', 'Branch', 'Academic Year', 'Status', 'Fee Due', 'Attendance'];
    const rows = filteredStudents.map((student) => {
      const data = student.data || {};
      const fee = feeByStudent[String(student.id)] || {};
      return [
        student.name,
        data.primaryPhone || data.secondaryPhone || '',
        data.whatsapp || '',
        data.course || '',
        student.grade || '',
        student.batch || '',
        data.branch || '',
        data.academicYear || '',
        data.status || '',
        Number(fee.due || 0),
        student.attendance || data.attendancePercent || '',
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function addHistory(e) {
    e.preventDefault();
    if (!selectedStudent) return;
    setMessage('');
    setError('');
    try {
      await createStudentHistory(selectedStudent.id, historyForm);
      setHistoryForm({ type: 'Note', title: '', detail: '', eventDate: today() });
      setMessage('Student history added.');
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err.error || 'Could not add history');
    }
  }

  async function addFollowUpTask(payload) {
    if (!selectedStudent) return;
    setMessage('');
    setError('');
    try {
      await createFollowUp({ ...payload, student_id: selectedStudent.id });
      setMessage('Follow-up task created.');
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err.error || 'Could not create follow-up task');
    }
  }

  async function completeStudentFollowUp(taskId) {
    if (!selectedStudent) return;
    setMessage('');
    setError('');
    try {
      await completeFollowUp(taskId);
      setMessage('Follow-up task completed.');
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err.error || 'Could not complete follow-up task');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setMessage('');
    setError('');
    try {
      if (deleteTarget.type === 'student') {
        await deleteStudent(deleteTarget.id);
        setMessage('Student deleted.');
        setDeleteTarget(null);
        await loadStudents();
      } else {
        await deleteStudentHistory(deleteTarget.id);
        setMessage('History record deleted.');
        setDeleteTarget(null);
        if (selectedStudent) await loadStudentDetails(selectedStudent.id);
      }
    } catch (err) {
      setError(err.error || 'Delete failed');
    }
  }

  return (
    <PageShell
      title="Student Management"
      description="Central student database with profile, parent, admission, document, fee, and history records."
      actions={(
        <>
          <Button variant="outline" onClick={exportStudentsCsv}>Export CSV</Button>
          <Button onClick={addStudent}>Add Student</Button>
        </>
      )}
    >

      {message ? <Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === 'student' ? 'student' : 'history record'}?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StudentMetric label="Total Students" value={studentMetrics.total} />
        <StudentMetric label="Active / Admitted" value={studentMetrics.active} />
        <StudentMetric label="Fee Pending" value={studentMetrics.pendingFees} tone="risk" />
        <StudentMetric label="Attendance Risk" value={studentMetrics.attendanceRisk} tone="risk" />
        <StudentMetric label="Current View" value={studentMetrics.filtered} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student Filters</CardTitle>
          <CardDescription>Filter by operational categories used across admissions, fees, attendance, and academics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, school, target" />
            <FilterSelect value={filters.course} onChange={(value) => updateFilter('course', value)} options={courseMasters.map((item) => item.name)} label="Course" />
            <FilterSelect value={filters.grade} onChange={(value) => updateFilter('grade', value)} options={classes} label="Class" />
            <FilterSelect value={filters.batch} onChange={(value) => updateFilter('batch', value)} options={batchMasters.map((item) => item.name)} label="Batch" />
            <FilterSelect value={filters.status} onChange={(value) => updateFilter('status', value)} options={statuses} label="Status" />
            <FilterSelect value={filters.branch} onChange={(value) => updateFilter('branch', value)} options={branchMasters.map((item) => item.name)} label="Branch" />
            <FilterSelect value={filters.fee} onChange={(value) => updateFilter('fee', value)} options={['Pending', 'Paid']} label="Fee" />
            <FilterSelect value={filters.attendance} onChange={(value) => updateFilter('attendance', value)} options={['Risk', 'Healthy']} label="Attendance" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={clearFilters}>Clear Filters</Button>
            <Badge variant="secondary">{filteredStudents.length} matching students</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Students</CardTitle>
            <CardDescription>Search and select a student profile.</CardDescription>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {filteredStudents.map((student) => (
              <div key={student.id} role="button" tabIndex={0} onClick={() => selectStudent(student)} onKeyDown={(event) => { if (event.key === 'Enter') selectStudent(student); }} className={`w-full rounded-md border p-4 text-left transition ${String(selectedId) === String(student.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{student.name}</p>
                  <Badge variant={String(selectedId) === String(student.id) ? 'secondary' : 'outline'}>{student.data?.status || 'Active'}</Badge>
                </div>
                <p className={String(selectedId) === String(student.id) ? 'text-sm text-primary-foreground/75' : 'text-sm text-muted-foreground'}>
                  {student.grade || 'Class'} - {student.batch || 'Batch'} - {student.data?.status || 'Active'}
                </p>
                <Link
                  to={`/students/${student.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className={`mt-3 inline-block text-xs font-semibold underline ${String(selectedId) === String(student.id) ? 'text-primary-foreground' : 'text-primary'}`}
                >
                  View 360 profile
                </Link>
              </div>
            ))}
            {!filteredStudents.length ? <p className="text-sm text-muted-foreground">No students yet.</p> : null}
          </div>
          </CardContent>
        </Card>

        <form onSubmit={saveStudent}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectedStudent ? 'Edit Student' : 'Create Student'}</CardTitle>
              <CardDescription>Update profile, parent, admission, and document details from one compact editor.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="profile" className="space-y-5">
                <TabsList className="flex h-auto flex-wrap justify-start">
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="parents">Parents</TabsTrigger>
                  <TabsTrigger value="admission">Admission</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
                {fieldErrors.name ? <span className="text-xs text-rose-700">{fieldErrors.name}</span> : null}
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <select value={form.data.status} onChange={(e) => updateData('status', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Course</span>
                <select value={form.primaryCourseId} onChange={(e) => {
                  const course = courseMasters.find((item) => String(item.id) === e.target.value);
                  setForm((current) => ({ ...current, primaryCourseId: e.target.value, primaryBatchId: '', grade: course?.classLevel || current.grade, data: { ...current.data, course: course?.name || '' } }));
                }} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" required>
                  <option value="">Select course</option>
                  {courseMasters.filter((course) => course.isActive).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Class</span>
                <select value={form.grade} onChange={(e) => updateField('grade', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                  <option value="">Select class</option>
                  {classes.map((className) => <option key={className}>{className}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Batch</span>
                <select value={form.primaryBatchId} onChange={(e) => {
                  const selectedBatch = batchMasters.find((item) => String(item.id) === e.target.value);
                  setForm((current) => ({ ...current, primaryBatchId: e.target.value, batch: selectedBatch?.name || '' }));
                }} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" required>
                  <option value="">Select batch</option>
                  {batchMasters.filter((batch) => batch.status === 'ACTIVE'
                    && (!form.branchId || String(batch.branchId) === String(form.branchId))
                    && (!form.primaryCourseId || String(batch.courseId) === String(form.primaryCourseId)))
                    .map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Academic Year</span>
                <select value={form.data.academicYear} onChange={(e) => updateData('academicYear', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                  {academicYears.map((year) => <option key={year}>{year}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Branch</span>
                <select value={form.branchId} onChange={(e) => {
                  const branch = branchMasters.find((item) => String(item.id) === e.target.value);
                  setForm((current) => ({ ...current, branchId: e.target.value, primaryBatchId: '', data: { ...current.data, branch: branch?.name || '' } }));
                }} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" required>
                  <option value="">Select branch</option>
                  {branchMasters.filter((branch) => branch.isActive).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <input value={form.data.school} onChange={(e) => updateData('school', e.target.value)} placeholder="School" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.examTarget} onChange={(e) => updateData('examTarget', e.target.value)} placeholder="Exam target" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.attendance} onChange={(e) => updateField('attendance', e.target.value)} placeholder="Attendance summary" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.photoUrl} onChange={(e) => updateData('photoUrl', e.target.value)} placeholder="Photo URL" className="rounded-md border px-3 py-2 text-sm" />
              <textarea value={form.data.address} onChange={(e) => updateData('address', e.target.value)} placeholder="Address" rows={3} className="rounded-md border px-3 py-2 text-sm md:col-span-2" />
                  </div>
                </TabsContent>

                <TabsContent value="parents" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
              <input value={form.data.fatherName} onChange={(e) => updateData('fatherName', e.target.value)} placeholder="Father name" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.motherName} onChange={(e) => updateData('motherName', e.target.value)} placeholder="Mother name" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.primaryPhone} onChange={(e) => updateData('primaryPhone', e.target.value)} placeholder="Primary phone" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.secondaryPhone} onChange={(e) => updateData('secondaryPhone', e.target.value)} placeholder="Secondary phone" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.whatsapp} onChange={(e) => updateData('whatsapp', e.target.value)} placeholder="WhatsApp number" className="rounded-md border px-3 py-2 text-sm" />
                  </div>
                </TabsContent>

                <TabsContent value="admission" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
              <input value={form.data.course} readOnly className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600" />
              <input type="date" value={form.data.joiningDate} onChange={(e) => updateData('joiningDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.counsellor} onChange={(e) => updateData('counsellor', e.target.value)} placeholder="Counsellor" className="rounded-md border px-3 py-2 text-sm" />
                  </div>
                </TabsContent>

                <TabsContent value="documents" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
              <input value={form.data.documents.aadhaar} onChange={(e) => updateDocument('aadhaar', e.target.value)} placeholder="Aadhaar link / status" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.documents.marksheet} onChange={(e) => updateDocument('marksheet', e.target.value)} placeholder="Previous marksheet link / status" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.documents.photo} onChange={(e) => updateDocument('photo', e.target.value)} placeholder="Photo document link / status" className="rounded-md border px-3 py-2 text-sm" />
              <input value={form.data.documents.admissionForm} onChange={(e) => updateDocument('admissionForm', e.target.value)} placeholder="Admission form link / status" className="rounded-md border px-3 py-2 text-sm" />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
                <Button>{selectedStudent ? 'Save Student' : 'Create Student'}</Button>
            {selectedStudent && canDelete ? (
              <Button type="button" variant="destructive" onClick={() => setDeleteTarget({ type: 'student', id: selectedStudent.id })}>Delete Student</Button>
            ) : null}
              </div>
            </CardContent>
          </Card>
        </form>
      </div>

      {selectedStudent ? (
        <Card>
          <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardDescription>Student 360</CardDescription>
              <CardTitle className="mt-1">{selectedStudent.name}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{selectedStudent.data?.course || selectedStudent.batch || '-'}</Badge>
                <Badge variant="secondary">{selectedStudent.grade || '-'}</Badge>
                <Badge variant="outline">{selectedStudent.data?.branch || '-'}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href="/fees">Collect Fee</a></Button>
              <Button asChild variant="outline"><a href="/parent-portal">Parent Portal</a></Button>
              <Button type="button" onClick={() => window.print()}>Print Summary</Button>
            </div>
          </div>
          </CardHeader>

          <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              {profileTabs.map((tab) => <TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="Profile"><ProfileTab student={selectedStudent} form={form} /></TabsContent>
            <TabsContent value="Fees"><FeesTab feePlans={feePlans} student360={student360} feeTotals={feeTotals} /></TabsContent>
            <TabsContent value="Attendance"><AttendanceTab student360={student360} /></TabsContent>
            <TabsContent value="Academic"><AcademicTab student360={student360} /></TabsContent>
            <TabsContent value="Communication">
              <CommunicationTab
                student360={student360}
                history={history}
                historyForm={historyForm}
                setHistoryForm={setHistoryForm}
                addHistory={addHistory}
                canDelete={canDelete}
                setDeleteTarget={setDeleteTarget}
                addFollowUpTask={addFollowUpTask}
                completeStudentFollowUp={completeStudentFollowUp}
              />
            </TabsContent>
          </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}

function ProfileTab({ student, form }) {
  const data = student.data || {};
  const documents = data.documents || {};
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Info label="Status" value={data.status} />
      <Info label="Course" value={data.course} />
      <Info label="Class / Batch" value={`${student.grade || '-'} / ${student.batch || '-'}`} />
      <Info label="Academic Year" value={data.academicYear} />
      <Info label="School" value={data.school} />
      <Info label="Exam Target" value={data.examTarget} />
      <Info label="Joining Date" value={data.joiningDate} />
      <Info label="Counsellor" value={data.counsellor} />
      <Info label="Father" value={data.fatherName} />
      <Info label="Mother" value={data.motherName} />
      <Info label="Primary Phone" value={data.primaryPhone} />
      <Info label="WhatsApp" value={data.whatsapp} />
      <Info label="Aadhaar" value={documents.aadhaar} />
      <Info label="Marksheet" value={documents.marksheet} />
      <Info label="Photo" value={documents.photo} />
      <Info label="Admission Form" value={documents.admissionForm} />
      <div className="rounded-xl bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
        <p className="text-sm text-slate-500">Address</p>
        <p className="mt-1 font-semibold">{form.data.address || '-'}</p>
      </div>
    </div>
  );
}

function FeesTab({ feePlans, student360, feeTotals }) {
  const payments = student360?.fees?.payments || [];
  const reminders = student360?.fees?.reminders || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Info label="Total Payable" value={money(feeTotals.net)} />
        <Info label="Paid" value={money(feeTotals.paid)} />
        <Info label="Pending" value={money(feeTotals.due)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <RecordList title="Fee Plans" rows={feePlans} empty="No fee plans yet." render={(plan) => (
          <span><strong>{plan.courseProgram || plan.feeCategory}</strong> - {plan.feeStatus} - {money(plan.dueAmount)} due</span>
        )} />
        <PaymentTable payments={payments} />
        <RecordList title="Fee Reminder History" rows={reminders} empty="No reminders sent." render={(reminder) => (
          <span><strong>{reminder.reminderType}</strong> - {reminder.sentVia} - {reminder.sentAt}</span>
        )} />
      </div>
    </div>
  );
}

function AttendanceTab({ student360 }) {
  const totals = student360?.attendance?.totals || {};
  const rows = student360?.attendance?.rows || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Attendance %" value={`${totals.attendancePercent || 0}%`} />
        <Info label="Total Lectures" value={totals.total || 0} />
        <Info label="Absent" value={totals.absent || 0} />
        <Info label="Late" value={totals.late || 0} />
      </div>
      <RecordList title="Absent / Late Records" rows={rows.filter((row) => ['Absent', 'Late'].includes(row.status))} empty="No absent or late records." render={(row) => (
        <span><strong>{row.date}</strong> - {row.subject} - {row.status} - Alert {row.alertStatus}</span>
      )} />
    </div>
  );
}

function AcademicTab({ student360 }) {
  const academics = student360?.academics || {};
  const results = [...(academics.performanceResults || []), ...(academics.academicResults || [])];
  const remedials = [...(academics.remedialActions || []), ...(academics.remedialStudents || [])];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <RecordList title="Test Scores" rows={results} empty="No test results yet." render={(row) => (
        <span><strong>{row.testName || row.subject || row.courseName || 'Test'}</strong> - {row.marksObtained || 0}/{row.totalMarks || 0} - {row.weakSubject || row.weakChapter || row.actionNeeded || '-'}</span>
      )} />
      <RecordList title="Remedial Actions" rows={remedials} empty="No remedial records." render={(row) => (
        <span><strong>{row.issue || row.weakSubject || 'Remedial'}</strong> - {row.status} - {row.deadline || row.remedialDate || '-'}</span>
      )} />
    </div>
  );
}

function CommunicationTab({ student360, history, historyForm, setHistoryForm, addHistory, canDelete, setDeleteTarget, addFollowUpTask, completeStudentFollowUp }) {
  const [followUpForm, setFollowUpForm] = useState({
    taskType: 'Parent Call Follow-up',
    dueDate: today(),
    priority: 'Medium',
    assignedTo: '',
    notes: '',
  });
  const communication = student360?.communication || {};
  const followUps = communication.followUps || [];
  const openFollowUps = followUps.filter((task) => task.status !== 'Done');
  const timeline = communication.timeline?.length
    ? communication.timeline
    : [
      ...(communication.parentAlerts || []).map((item) => ({ ...item, type: 'Attendance Alert', date: item.sentAt, title: item.alertType, detail: item.message, channel: item.channel, status: item.status })),
      ...(communication.parentCalls || []).map((item) => ({ ...item, type: 'Parent Call', date: item.calledAt, title: item.callOutcome, detail: item.notes, channel: 'Phone', status: item.callOutcome })),
      ...(communication.feeReminders || []).map((item) => ({ ...item, type: 'Fee Reminder', date: item.sentAt, title: item.reminderType, detail: item.message, channel: item.sentVia, status: item.status })),
      ...history.map((item) => ({ ...item, type: item.type, date: item.eventDate, title: item.title, detail: item.detail, channel: 'Internal', status: '' })),
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  async function submitFollowUp(e) {
    e.preventDefault();
    await addFollowUpTask(followUpForm);
    setFollowUpForm({
      taskType: 'Parent Call Follow-up',
      dueDate: today(),
      priority: 'Medium',
      assignedTo: '',
      notes: '',
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="space-y-6">
        <div>
        <h3 className="font-semibold">Add Communication / Note</h3>
        <form onSubmit={addHistory} className="mt-4 grid gap-3">
          <select value={historyForm.type} onChange={(e) => setHistoryForm({ ...historyForm, type: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
            {historyTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
          <Input type="date" value={historyForm.eventDate} onChange={(e) => setHistoryForm({ ...historyForm, eventDate: e.target.value })} />
          <Input value={historyForm.title} onChange={(e) => setHistoryForm({ ...historyForm, title: e.target.value })} placeholder="Title" required />
          <Textarea value={historyForm.detail} onChange={(e) => setHistoryForm({ ...historyForm, detail: e.target.value })} placeholder="Details" rows={3} />
          <Button>Add to Timeline</Button>
        </form>
        </div>

        <div className="rounded-xl border p-4">
          <h3 className="font-semibold">Create Follow-up Task</h3>
          <form onSubmit={submitFollowUp} className="mt-4 grid gap-3">
            <select value={followUpForm.taskType} onChange={(e) => setFollowUpForm({ ...followUpForm, taskType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {followUpTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <Input type="date" value={followUpForm.dueDate} onChange={(e) => setFollowUpForm({ ...followUpForm, dueDate: e.target.value })} required />
            <select value={followUpForm.priority} onChange={(e) => setFollowUpForm({ ...followUpForm, priority: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {followUpPriorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
            <Input value={followUpForm.assignedTo} onChange={(e) => setFollowUpForm({ ...followUpForm, assignedTo: e.target.value })} placeholder="Assigned to" />
            <Textarea value={followUpForm.notes} onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })} placeholder="Notes" rows={3} />
            <Button>Create Follow-up</Button>
          </form>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Open Follow-ups</h3>
        <div className="mt-4 space-y-3">
          {openFollowUps.map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={task.status === 'Overdue' ? 'destructive' : 'secondary'}>{task.status}</Badge>
                    <Badge variant="outline">{task.priority || 'Medium'}</Badge>
                    <Badge variant="outline">Due {task.dueDate || '-'}</Badge>
                  </div>
                  <p className="mt-2 font-semibold">{task.taskType}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.notes || '-'}</p>
                  <p className="mt-2 text-xs text-slate-500">Assigned to: {task.assignedTo || 'Staff'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => completeStudentFollowUp(task.id)}>Done</Button>
              </div>
            </div>
          ))}
          {!openFollowUps.length ? <p className="text-sm text-slate-500">No open follow-up tasks.</p> : null}
        </div>

        <h3 className="font-semibold">Communication Timeline</h3>
        <div className="mt-4 space-y-3">
          {timeline.map((entry, index) => (
            <div key={entry.id || `${entry.type}-${entry.sourceId || index}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{entry.type} - {entry.date || 'No date'}</Badge>
                    {entry.channel ? <Badge variant="secondary">{entry.channel}</Badge> : null}
                    {entry.status ? <Badge variant={entry.status === 'Failed' || entry.status === 'Missing Phone' ? 'destructive' : 'outline'}>{entry.status}</Badge> : null}
                  </div>
                  <p className="mt-2 font-semibold">{entry.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{entry.detail}</p>
                  <p className="mt-2 text-xs text-slate-500">Triggered by: {entry.triggeredBy || 'Staff'}</p>
                </div>
                {canDelete && String(entry.id || '').startsWith('history-') ? (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget({ type: 'history', id: entry.sourceId })}>Delete</Button>
                ) : null}
              </div>
            </div>
          ))}
          {!timeline.length ? <p className="text-sm text-slate-500">No communication records yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value || '-'}</p>
      </CardContent>
    </Card>
  );
}

function StudentMetric({ label, value, tone = 'neutral' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-bold ${tone === 'risk' && Number(value || 0) > 0 ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm"
      aria-label={label}
    >
      <option value="All">All {label}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function RecordList({ title, rows, empty, render }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.slice(0, 10).map((row, index) => (
          <div key={row.id || index} className="rounded-md border bg-muted/35 p-3">{render(row)}</div>
        ))}
        {!rows.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      </CardContent>
    </Card>
  );
}

function PaymentTable({ payments }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment History</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.slice(0, 10).map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.receiptNumber}</TableCell>
                  <TableCell>{payment.paymentDate}</TableCell>
                  <TableCell>{payment.paymentMethod}</TableCell>
                  <TableCell className="text-right font-semibold">{money(payment.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
