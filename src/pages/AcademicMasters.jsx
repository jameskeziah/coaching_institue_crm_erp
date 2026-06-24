import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  addBatchStudent,
  addBatchTeacher,
  createBatch,
  createBranch,
  createCourse,
  createSubject,
  deleteBatch,
  deleteBranch,
  deleteCourse,
  deleteSubject,
  fetchBatch,
  fetchBatchAudit,
  fetchBatches,
  fetchBranches,
  fetchCourses,
  fetchStudents,
  fetchSubjects,
  fetchTeachers,
  removeBatchStudent,
  removeBatchTeacher,
  replaceBatchTimings,
  transferBatchStudent,
  updateBatch,
  updateBatchStatus,
  updateBranch,
  updateCourse,
  updateSubject,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function MasterPage({ type }) {
  const { permissions } = useAuth();
  const config = {
    branches: {
      title: 'Branch Master',
      description: 'Physical and operational institute locations.',
      load: fetchBranches,
      create: createBranch,
      update: updateBranch,
      remove: deleteBranch,
      canManage: permissions.canManageBranches,
      empty: { name: '', code: '', city: '', address: '', phone: '', email: '', isActive: true },
      fields: ['name', 'code', 'city', 'phone'],
    },
    courses: {
      title: 'Course Master',
      description: 'Programs and products students can join.',
      load: fetchCourses,
      create: createCourse,
      update: updateCourse,
      remove: deleteCourse,
      canManage: permissions.canManageCourses,
      empty: { name: '', code: '', courseType: 'FOUNDATION', classLevel: '', durationMonths: 12, defaultFee: 0, description: '', isActive: true },
      fields: ['name', 'code', 'courseType', 'classLevel', 'durationMonths', 'defaultFee'],
    },
    subjects: {
      title: 'Subject Master',
      description: 'Subjects used by faculty allocation, batches, attendance, and tests.',
      load: fetchSubjects,
      create: createSubject,
      update: updateSubject,
      remove: deleteSubject,
      canManage: permissions.canManageSubjects,
      empty: { name: '', code: '', description: '', isActive: true },
      fields: ['name', 'code'],
    },
  }[type];
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(config.empty);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try { setRows(await config.load()); } catch (err) { setError(err.error || 'Could not load master data'); }
  }
  useEffect(() => { load(); }, [type]);

  async function save(e) {
    e.preventDefault();
    try {
      if (editingId) await config.update(editingId, form);
      else await config.create(form);
      setMessage(`${config.title.replace(' Master', '')} saved.`);
      setEditingId(null);
      setForm(config.empty);
      await load();
    } catch (err) { setError(err.error || 'Save failed'); }
  }

  return (
    <PageShell title={config.title} description={config.description}>
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {config.canManage ? (
          <Card>
            <CardHeader><CardTitle className="text-base">{editingId ? 'Edit' : 'Add'} {config.title.replace(' Master', '')}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={save} className="grid gap-3">
                {Object.keys(config.empty).filter((key) => !['isActive', 'description', 'address', 'email'].includes(key)).map((key) => (
                  key === 'courseType' ? (
                    <select key={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
                      {['FOUNDATION', 'JEE', 'NEET', 'BOARD', 'AI_DS', 'OLYMPIAD', 'SCHOLARSHIP', 'OTHER'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                  ) : (
                    <Input key={key} type={['durationMonths', 'defaultFee'].includes(key) ? 'number' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={key.replace(/([A-Z])/g, ' $1')} required={['name', 'code'].includes(key)} />
                  )
                ))}
                {'address' in form ? <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" /> : null}
                {'email' in form ? <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" /> : null}
                {'description' in form ? <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" /> : null}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
                <div className="flex gap-2">
                  <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                  {editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(config.empty); }}>Cancel</Button> : null}
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader><CardTitle className="text-base">{config.title}</CardTitle><CardDescription>{rows.length} records</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>{config.fields.map((field) => <TableHead key={field}>{field.replace(/([A-Z])/g, ' $1')}</TableHead>)}<TableHead>Status</TableHead>{config.canManage ? <TableHead>Actions</TableHead> : null}</TableRow></TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {config.fields.map((field) => <TableCell key={field}>{field === 'defaultFee' ? `₹${Number(row[field] || 0).toLocaleString('en-IN')}` : row[field] || '-'}</TableCell>)}
                    <TableCell><Badge variant={row.isActive ? 'default' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    {config.canManage ? <TableCell className="space-x-2"><Button size="sm" variant="outline" onClick={() => { setEditingId(row.id); setForm({ ...config.empty, ...row }); }}>Edit</Button><Button size="sm" variant="destructive" onClick={async () => { try { await config.remove(row.id); await load(); } catch (err) { setError(err.error || 'Delete failed'); } }}>Delete</Button></TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

export function BranchesPage() { return <MasterPage type="branches" />; }
export function CoursesPage() { return <MasterPage type="courses" />; }
export function SubjectsPage() { return <MasterPage type="subjects" />; }

export function BatchesPage() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const emptyBatch = { branchId: '', courseId: '', name: '', code: '', academicYear: '2026-27', startDate: '2026-06-01', endDate: '2027-03-31', capacity: 40, status: 'ACTIVE', timings: [{ dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '20:00', roomName: '' }] };
  const [form, setForm] = useState(emptyBatch);
  const [filters, setFilters] = useState({ branchId: '', courseId: '', academicYear: '', status: '', search: '' });
  const [error, setError] = useState('');

  async function load() {
    const [batchRows, branchRows, courseRows] = await Promise.all([fetchBatches(filters), fetchBranches(), fetchCourses()]);
    setRows(batchRows); setBranches(branchRows); setCourses(courseRows);
  }
  useEffect(() => { load().catch((err) => setError(err.error || 'Could not load batches')); }, [filters.branchId, filters.courseId, filters.academicYear, filters.status]);

  async function save(e) {
    e.preventDefault();
    try {
      if (editingId) await updateBatch(editingId, form); else await createBatch(form);
      setEditingId(null);
      setForm(emptyBatch);
      await load();
    } catch (err) { setError(err.error || 'Save failed'); }
  }

  return (
    <PageShell title="Batch Master" description="Teaching groups linked to branches and courses.">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {permissions.canManageBatches ? (
        <Card className="mb-6"><CardContent className="p-5"><form onSubmit={save} className="grid gap-3 md:grid-cols-4">
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required><option value="">Branch</option>{branches.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required><option value="">Course</option>{courses.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {['name', 'code', 'academicYear', 'startDate', 'endDate', 'capacity'].map((key) => <Input key={key} type={key.includes('Date') ? 'date' : key === 'capacity' ? 'number' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={key.replace(/([A-Z])/g, ' $1')} required />)}
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">{['PLANNED', 'ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'].map((item) => <option key={item}>{item}</option>)}</select>
          <div className="md:col-span-4 space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Timings</p><Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, timings: [...(form.timings || []), { dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '20:00', roomName: '' }] })}>Add timing</Button></div>
            {(form.timings || []).map((timing, index) => <div key={index} className="grid gap-2 md:grid-cols-5">
              <select value={timing.dayOfWeek} onChange={(e) => setForm({ ...form, timings: form.timings.map((item, itemIndex) => itemIndex === index ? { ...item, dayOfWeek: e.target.value } : item) })} className="rounded-md border px-2 py-2 text-sm">{['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => <option key={day}>{day}</option>)}</select>
              <Input type="time" value={timing.startTime} onChange={(e) => setForm({ ...form, timings: form.timings.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item) })} />
              <Input type="time" value={timing.endTime} onChange={(e) => setForm({ ...form, timings: form.timings.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item) })} />
              <Input value={timing.roomName} onChange={(e) => setForm({ ...form, timings: form.timings.map((item, itemIndex) => itemIndex === index ? { ...item, roomName: e.target.value } : item) })} placeholder="Room" />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, timings: form.timings.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button>
            </div>)}
          </div>
          <Button>{editingId ? 'Update Batch' : 'Create Batch'}</Button>
        </form></CardContent></Card>
      ) : null}
      <Card><CardContent className="p-5">
        <div className="mb-4 grid gap-2 md:grid-cols-5">
          <Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} placeholder="Search name or code" />
          <select value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={filters.courseId} onChange={(e) => setFilters({ ...filters, courseId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All courses</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Input value={filters.academicYear} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })} placeholder="Academic year" />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All statuses</option>{['PLANNED', 'ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED'].map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Branch</TableHead><TableHead>Course</TableHead><TableHead>Academic year</TableHead><TableHead>Capacity</TableHead><TableHead>Students</TableHead><TableHead>Teachers</TableHead><TableHead>Timings</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
        {rows.map((row) => <TableRow key={row.id}><TableCell><Link className="font-semibold underline" to={`/academic/batches/${row.id}`}>{row.name}</Link><p className="text-xs text-muted-foreground">{row.code}</p></TableCell><TableCell>{row.branchName}</TableCell><TableCell>{row.courseName}</TableCell><TableCell>{row.academicYear}</TableCell><TableCell>{row.capacity}</TableCell><TableCell>{row.studentCount}</TableCell><TableCell>{row.teacherCount}</TableCell><TableCell>{row.timingCount}</TableCell><TableCell><Badge>{row.status}</Badge></TableCell><TableCell className="space-x-2">{permissions.canManageBatches ? <><Button size="sm" variant="outline" onClick={async () => { const detail = await fetchBatch(row.id); setEditingId(row.id); setForm(detail); }}>Edit</Button><Button size="sm" variant="outline" onClick={async () => { await updateBatchStatus(row.id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'); await load(); }}>{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button><Button size="sm" variant="destructive" onClick={async () => { try { await deleteBatch(row.id); await load(); } catch (err) { setError(err.error || 'Archive failed'); } }}>Archive</Button></> : <Link to={`/academic/batches/${row.id}`}>View</Link>}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
    </PageShell>
  );
}

export function BatchDetailPage() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatus, setStudentStatus] = useState('');
  const [transferTargets, setTransferTargets] = useState({});
  const [teacherForm, setTeacherForm] = useState({ teacherId: '', subjectId: '', role: 'PRIMARY' });
  const [timingDraft, setTimingDraft] = useState([]);
  const [error, setError] = useState('');
  async function load() {
    const [detail, studentRows, teacherRows, subjectRows, batchRows, audits] = await Promise.all([
      fetchBatch(id), fetchStudents(), fetchTeachers(), fetchSubjects(), fetchBatches(), fetchBatchAudit(id),
    ]);
    setBatch(detail); setStudents(studentRows); setTeachers(teacherRows); setSubjects(subjectRows);
    setAllBatches(batchRows.filter((item) => item.id !== id && item.status === 'ACTIVE'));
    setTimingDraft(detail.timings || []);
    setAuditRows(audits);
  }
  useEffect(() => { load().catch((err) => setError(err.error || 'Could not load batch')); }, [id]);
  if (!batch) return <PageShell title="Batch Detail">{error || 'Loading...'}</PageShell>;
  return (
    <PageShell title={batch.name} description={`${batch.branchName} · ${batch.courseName} · ${batch.academicYear}`}>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Tabs defaultValue="overview">
        <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="students">Students</TabsTrigger><TabsTrigger value="teachers">Teachers</TabsTrigger><TabsTrigger value="timings">Timings</TabsTrigger><TabsTrigger value="attendance">Attendance</TabsTrigger><TabsTrigger value="tests">Tests</TabsTrigger><TabsTrigger value="fees">Fees</TabsTrigger><TabsTrigger value="audit">Audit Log</TabsTrigger></TabsList>
        <TabsContent value="overview"><Card><CardContent className="grid gap-4 p-5 md:grid-cols-5"><div><p className="text-sm text-muted-foreground">Status</p><Badge>{batch.status}</Badge></div><div><p className="text-sm text-muted-foreground">Capacity</p><p className="text-2xl font-bold">{batch.studentCount}/{batch.capacity}</p></div><div><p className="text-sm text-muted-foreground">Available seats</p><p className="text-2xl font-bold">{batch.availableSeats}</p></div><div><p className="text-sm text-muted-foreground">Teachers</p><p className="text-2xl font-bold">{batch.teacherCount}</p></div><div><p className="text-sm text-muted-foreground">Dates</p><p>{batch.startDate} — {batch.endDate}</p></div><div className="md:col-span-5"><p className="text-sm text-muted-foreground">Timings</p><p>{batch.timings.length ? batch.timings.map((item) => `${item.dayOfWeek.slice(0, 3)} ${item.startTime}-${item.endTime}${item.roomName ? ` (${item.roomName})` : ''}`).join(', ') : 'No timings configured'}</p></div></CardContent></Card></TabsContent>
        <TabsContent value="students"><Card><CardContent className="p-5">
          {permissions.canManageBatchStudents ? <div className="mb-4 flex gap-2"><select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="rounded-md border px-3 py-2 text-sm"><option value="">Select eligible student</option>{students.filter((student) => String(student.status || student.data?.status || 'ACTIVE').toUpperCase() !== 'INACTIVE' && !batch.students.some((mapping) => String(mapping.studentId) === String(student.id) && mapping.status === 'ACTIVE')).map((student) => <option key={student.id} value={student.id}>{student.name}{String(student.branch_id || student.branchId) === String(batch.branchId) ? '' : ' (other branch)'}</option>)}</select><Button disabled={batch.status !== 'ACTIVE' || !studentId} onClick={async () => { try { await addBatchStudent(batch.id, { studentIds: [studentId] }); setStudentId(''); await load(); } catch (err) { setError(err.error || 'Assignment failed'); } }}>Add Student</Button></div> : null}
          <div className="mb-3 flex gap-2"><Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search assigned students" /><select value={studentStatus} onChange={(e) => setStudentStatus(e.target.value)} className="rounded-md border px-3 py-2 text-sm"><option value="">All statuses</option>{['ACTIVE', 'TRANSFERRED', 'LEFT', 'COMPLETED', 'REMOVED'].map((item) => <option key={item}>{item}</option>)}</select></div>
          <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Joined</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{batch.students.filter((item) => (!studentStatus || item.status === studentStatus) && (!studentSearch || item.studentName.toLowerCase().includes(studentSearch.toLowerCase()))).map((item) => <TableRow key={item.id}><TableCell>{item.studentName}</TableCell><TableCell>{item.classLevel}</TableCell><TableCell>{item.joinedAt}</TableCell><TableCell>{item.status}</TableCell><TableCell>{item.status === 'ACTIVE' && permissions.canManageBatchStudents ? <div className="flex gap-2"><Button size="sm" variant="destructive" onClick={async () => { await removeBatchStudent(batch.id, item.studentId); await load(); }}>Remove</Button><select value={transferTargets[item.studentId] || ''} onChange={(e) => setTransferTargets({ ...transferTargets, [item.studentId]: e.target.value })} className="rounded-md border px-2 text-xs"><option value="">Transfer to...</option>{allBatches.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select><Button size="sm" variant="outline" disabled={!transferTargets[item.studentId]} onClick={async () => { await transferBatchStudent(batch.id, item.studentId, { targetBatchId: transferTargets[item.studentId] }); await load(); }}>Transfer</Button></div> : null}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card></TabsContent>
        <TabsContent value="teachers"><Card><CardContent className="p-5">
          {permissions.canManageBatchTeachers ? <div className="mb-4 grid gap-2 md:grid-cols-5"><select value={teacherForm.teacherId} onChange={(e) => setTeacherForm({ ...teacherForm, teacherId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">Teacher</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={teacherForm.subjectId} onChange={(e) => setTeacherForm({ ...teacherForm, subjectId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">Subject</option>{subjects.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={teacherForm.role} onChange={(e) => setTeacherForm({ ...teacherForm, role: e.target.value })} className="rounded-md border px-3 py-2 text-sm">{['PRIMARY', 'ASSISTANT', 'DOUBT_SOLVER', 'TEST_INCHARGE', 'MENTOR'].map((item) => <option key={item}>{item}</option>)}</select><Input type="date" value={teacherForm.assignedFrom || ''} onChange={(e) => setTeacherForm({ ...teacherForm, assignedFrom: e.target.value })} /><Button disabled={batch.status !== 'ACTIVE'} onClick={async () => { try { await addBatchTeacher(batch.id, teacherForm); await load(); } catch (err) { setError(err.error || 'Assignment failed'); } }}>Assign Teacher</Button></div> : null}
          <Table><TableHeader><TableRow><TableHead>Teacher</TableHead><TableHead>Subject</TableHead><TableHead>Role</TableHead><TableHead>Assigned from</TableHead><TableHead>Assigned to</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{batch.teachers.map((item) => <TableRow key={item.id}><TableCell>{item.teacherName}</TableCell><TableCell>{item.subjectName}</TableCell><TableCell>{item.role}</TableCell><TableCell>{item.assignedFrom}</TableCell><TableCell>{item.assignedTo || '-'}</TableCell><TableCell>{item.status}</TableCell><TableCell>{item.status === 'ACTIVE' && permissions.canManageBatchTeachers ? <Button size="sm" variant="destructive" onClick={async () => { await removeBatchTeacher(batch.id, item.teacherId, item.subjectId); await load(); }}>Remove</Button> : null}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent></Card></TabsContent>
        <TabsContent value="timings"><Card><CardContent className="space-y-3 p-5">{timingDraft.map((timing, index) => <div key={index} className="grid gap-2 md:grid-cols-5"><select value={timing.dayOfWeek} onChange={(e) => setTimingDraft(timingDraft.map((item, itemIndex) => itemIndex === index ? { ...item, dayOfWeek: e.target.value } : item))} className="rounded-md border px-2 py-2 text-sm">{['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => <option key={day}>{day}</option>)}</select><Input type="time" value={timing.startTime} onChange={(e) => setTimingDraft(timingDraft.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: e.target.value } : item))} /><Input type="time" value={timing.endTime} onChange={(e) => setTimingDraft(timingDraft.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: e.target.value } : item))} /><Input value={timing.roomName || ''} onChange={(e) => setTimingDraft(timingDraft.map((item, itemIndex) => itemIndex === index ? { ...item, roomName: e.target.value } : item))} placeholder="Room" /><Button variant="outline" onClick={() => setTimingDraft(timingDraft.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div>)}{permissions.canManageBatches ? <div className="flex gap-2"><Button variant="outline" onClick={() => setTimingDraft([...timingDraft, { dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '20:00', roomName: '' }])}>Add timing</Button><Button onClick={async () => { await replaceBatchTimings(batch.id, timingDraft); await load(); }}>Save timings</Button></div> : null}</CardContent></Card></TabsContent>
        {['attendance', 'tests', 'fees'].map((tab) => <TabsContent key={tab} value={tab}><Card><CardContent className="p-5 text-muted-foreground">{tab[0].toUpperCase() + tab.slice(1)} integrations use this batch identity. New records are blocked while the batch is inactive.</CardContent></Card></TabsContent>)}
        <TabsContent value="audit"><Card><CardContent className="space-y-2 p-5">{auditRows.map((row) => <div key={row.id} className="rounded-md border p-3"><p className="font-semibold">{row.action}</p><p className="text-xs text-muted-foreground">{row.createdAt || row.created_at}</p></div>)}{!auditRows.length ? <p className="text-muted-foreground">No batch audit events.</p> : null}</CardContent></Card></TabsContent>
      </Tabs>
    </PageShell>
  );
}
