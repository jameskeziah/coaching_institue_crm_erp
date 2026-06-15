import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { completeFollowUp, createFollowUp, deleteFollowUp, fetchFollowUps, fetchStudents, runFollowUpEscalation, updateFollowUp } from '../api';
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
import { Textarea } from '@/components/ui/textarea';

const taskTypes = ['Fee Payment Promise', 'Parent Call Follow-up', 'Attendance Risk', 'Test Result Remedial', 'Admission Follow-up', 'Complaint Resolution'];
const priorities = ['Medium', 'High', 'Urgent', 'Low'];
const statuses = ['Open', 'Overdue', 'Done'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate = today()) {
  if (!fromDate) return 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function emptyForm() {
  return {
    student_id: '',
    taskType: 'Parent Call Follow-up',
    dueDate: today(),
    priority: 'Medium',
    assignedTo: '',
    status: 'Open',
    notes: '',
  };
}

function priorityVariant(priority) {
  if (priority === 'Urgent') return 'destructive';
  if (priority === 'High') return 'secondary';
  return 'outline';
}

function statusVariant(status) {
  if (status === 'Overdue') return 'destructive';
  if (status === 'Done') return 'secondary';
  return 'outline';
}

export default function FollowUps() {
  const { permissions } = useAuth();
  const { canDelete } = permissions;
  const [tasks, setTasks] = useState([]);
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({ status: 'Open', search: '', assignedTo: '' });
  const [form, setForm] = useState(emptyForm);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completionOutcome, setCompletionOutcome] = useState('');
  const [escalation, setEscalation] = useState({ minAgeDays: 3, assignedTo: '', running: false, result: null });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [taskRows, studentRows] = await Promise.all([
        fetchFollowUps(filters.status === 'All' ? {} : { status: filters.status }),
        fetchStudents(),
      ]);
      setTasks(taskRows);
      setStudents(studentRows);
    } catch (err) {
      setError(err.error || 'Could not load follow-up tasks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status]);

  const visibleTasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const assignedQuery = filters.assignedTo.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch = !query || [task.studentName, task.taskType, task.priority, task.status, task.notes, task.assignedTo]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesAssigned = !assignedQuery || String(task.assignedTo || '').toLowerCase().includes(assignedQuery);
      return matchesSearch && matchesAssigned;
    });
  }, [filters.assignedTo, filters.search, tasks]);

  const metrics = useMemo(() => ({
    open: tasks.filter((task) => task.status === 'Open').length,
    overdue: tasks.filter((task) => task.status === 'Overdue').length,
    done: tasks.filter((task) => task.status === 'Done').length,
    dueToday: tasks.filter((task) => task.status !== 'Done' && task.dueDate === today()).length,
  }), [tasks]);

  const report = useMemo(() => {
    const active = tasks.filter((task) => task.status !== 'Done');
    const overdue = active.filter((task) => task.status === 'Overdue');
    const dueSoon = active.filter((task) => task.dueDate > today() && daysBetween(today(), task.dueDate) <= 7);
    const urgent = active.filter((task) => ['Urgent', 'High'].includes(task.priority));
    const aging = {
      oneToTwo: overdue.filter((task) => daysBetween(task.dueDate) <= 2).length,
      threeToSeven: overdue.filter((task) => {
        const age = daysBetween(task.dueDate);
        return age >= 3 && age <= 7;
      }).length,
      overSeven: overdue.filter((task) => daysBetween(task.dueDate) > 7).length,
    };

    const countBy = (key, fallback) => Object.entries(active.reduce((acc, task) => {
      const label = task[key] || fallback;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {}))
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      active,
      overdue,
      dueSoon,
      urgent,
      aging,
      byAssignee: countBy('assignedTo', 'Unassigned'),
      byType: countBy('taskType', 'Other'),
    };
  }, [tasks]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setEditingTask(null);
    setForm(emptyForm());
  }

  function startEdit(task) {
    setEditingTask(task);
    setForm({
      student_id: task.student_id || task.studentId || '',
      taskType: task.taskType || 'Parent Call Follow-up',
      dueDate: task.dueDate || today(),
      priority: task.priority || 'Medium',
      assignedTo: task.assignedTo || '',
      status: task.status === 'Overdue' ? 'Open' : task.status || 'Open',
      notes: task.notes || '',
      linkedType: task.linkedType,
      linkedId: task.linkedId,
    });
  }

  async function saveTask(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editingTask) {
        await updateFollowUp(editingTask.id, form);
        setMessage('Follow-up task updated.');
      } else {
        await createFollowUp(form);
        setMessage('Follow-up task created.');
      }
      setEditingTask(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err.error || 'Could not save follow-up task');
    }
  }

  function startComplete(task) {
    setCompleteTarget(task);
    setCompletionOutcome('');
  }

  async function markDone() {
    if (!completeTarget) return;
    setMessage('');
    setError('');
    try {
      await completeFollowUp(completeTarget.id, { outcome: completionOutcome });
      setCompleteTarget(null);
      setCompletionOutcome('');
      setMessage('Follow-up task completed.');
      await load();
    } catch (err) {
      setError(err.error || 'Could not complete follow-up task');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setMessage('');
    setError('');
    try {
      await deleteFollowUp(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('Follow-up task deleted.');
      await load();
    } catch (err) {
      setError(err.error || 'Could not delete follow-up task');
    }
  }

  function exportVisibleCsv() {
    const headers = ['Student', 'Task Type', 'Due Date', 'Age Days', 'Priority', 'Assigned To', 'Status', 'Escalation Count', 'Last Escalated', 'Notes', 'Outcome'];
    const rows = visibleTasks.map((task) => [
      task.studentName || '',
      task.taskType || '',
      task.dueDate || '',
      task.status === 'Overdue' ? daysBetween(task.dueDate) : '',
      task.priority || '',
      task.assignedTo || '',
      task.status || '',
      task.escalationCount || 0,
      task.lastEscalatedAt || '',
      task.notes || '',
      task.completionOutcome || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `follow-ups-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runEscalation() {
    setMessage('');
    setError('');
    setEscalation((current) => ({ ...current, running: true, result: null }));
    try {
      const result = await runFollowUpEscalation({
        minAgeDays: escalation.minAgeDays,
        assignedTo: escalation.assignedTo,
      });
      setEscalation((current) => ({ ...current, result, running: false }));
      setMessage(`Escalation logged for ${result.escalated || 0} overdue follow-up(s). ${result.skipped || 0} already escalated today.`);
      await load();
    } catch (err) {
      setEscalation((current) => ({ ...current, running: false }));
      setError(err.error || 'Could not run follow-up escalation');
    }
  }

  return (
    <PageShell
      title="Follow-ups"
      description="Daily task control for fee promises, parent calls, attendance risk, remedial actions, admissions, and complaints."
      actions={(
        <>
          <Button variant="outline" onClick={exportVisibleCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button onClick={startCreate}><Plus className="h-4 w-4" /> New Task</Button>
        </>
      )}
    >
      {message ? <Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete follow-up task?</DialogTitle>
            <DialogDescription>This removes the task from the staff queue.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completeTarget)} onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete follow-up</DialogTitle>
            <DialogDescription>Record what happened so it appears in the student timeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/35 p-3 text-sm">
              <p className="font-medium">{completeTarget?.studentName}</p>
              <p className="text-muted-foreground">{completeTarget?.taskType} - due {completeTarget?.dueDate || '-'}</p>
            </div>
            <Textarea
              value={completionOutcome}
              onChange={(e) => setCompletionOutcome(e.target.value)}
              placeholder="Outcome note, e.g. parent promised payment on Monday or remedial class scheduled."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button onClick={markDone}>Mark Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Open" value={metrics.open} />
        <Metric label="Overdue" value={metrics.overdue} tone="risk" />
        <Metric label="Due Today" value={metrics.dueToday} />
        <Metric label="Done" value={metrics.done} tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue Aging</CardTitle>
            <CardDescription>Escalate tasks that remain open past the due date.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="1-2 days" value={report.aging.oneToTwo} />
            <MiniStat label="3-7 days" value={report.aging.threeToSeven} tone="risk" />
            <MiniStat label="7+ days" value={report.aging.overSeven} tone="risk" />
          </CardContent>
        </Card>

        <BreakdownCard title="By Assignee" rows={report.byAssignee} empty="No active assignees." />
        <BreakdownCard title="By Task Type" rows={report.byType} empty="No active task types." />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Overdue Escalation
            </CardTitle>
            <CardDescription>Write escalation entries into student history for old overdue follow-ups.</CardDescription>
          </div>
          {escalation.result ? <Badge variant="secondary">{escalation.result.escalated || 0} escalated, {escalation.result.skipped || 0} skipped</Badge> : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
            <label className="text-sm">
              <span className="font-medium">Minimum age</span>
              <Input
                type="number"
                min="1"
                value={escalation.minAgeDays}
                onChange={(e) => setEscalation((current) => ({ ...current, minAgeDays: e.target.value }))}
                className="mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Assignee filter</span>
              <Input
                value={escalation.assignedTo}
                onChange={(e) => setEscalation((current) => ({ ...current, assignedTo: e.target.value }))}
                placeholder="Optional staff name"
                className="mt-1"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" variant="destructive" onClick={runEscalation} disabled={escalation.running}>
                {escalation.running ? 'Escalating...' : 'Run Escalation'}
              </Button>
            </div>
          </div>
          {escalation.result?.candidates?.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {escalation.result.candidates.slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-md border bg-muted/35 p-3 text-sm">
                  <p className="font-medium">{task.studentName}</p>
                  <p className="text-muted-foreground">{task.taskType} - {task.ageDays} day(s) overdue</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingTask ? 'Edit Follow-up' : 'Create Follow-up'}</CardTitle>
            <CardDescription>Assign one clear next action to a student.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveTask} className="grid gap-3">
              <label className="text-sm">
                <span className="font-medium">Student</span>
                <select value={form.student_id} onChange={(e) => updateForm('student_id', e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" required disabled={Boolean(editingTask)}>
                  <option value="">Select student</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium">Task Type</span>
                <select value={form.taskType} onChange={(e) => updateForm('taskType', e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {taskTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="font-medium">Due Date</span>
                  <Input type="date" value={form.dueDate} onChange={(e) => updateForm('dueDate', e.target.value)} required className="mt-1" />
                </label>
                <label className="text-sm">
                  <span className="font-medium">Priority</span>
                  <select value={form.priority} onChange={(e) => updateForm('priority', e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                    {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                  </select>
                </label>
              </div>
              {editingTask ? (
                <label className="text-sm">
                  <span className="font-medium">Status</span>
                  <select value={form.status} onChange={(e) => updateForm('status', e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                    {statuses.filter((status) => status !== 'Overdue').map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
              ) : null}
              <Input value={form.assignedTo} onChange={(e) => updateForm('assignedTo', e.target.value)} placeholder="Assigned to" />
              <Textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Notes" rows={4} />
              <div className="flex flex-wrap gap-2">
                <Button>{editingTask ? 'Save Changes' : 'Create Task'}</Button>
                {editingTask ? <Button type="button" variant="outline" onClick={startCreate}>Cancel Edit</Button> : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Queue</CardTitle>
            <CardDescription>Filter, edit, complete, or delete staff follow-ups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))} className="rounded-md border bg-background px-3 py-2 text-sm">
                <option>Open</option>
                <option>Overdue</option>
                <option>Done</option>
                <option>All</option>
              </select>
              <Input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Search student, task, notes" />
              <Input value={filters.assignedTo} onChange={(e) => setFilters((current) => ({ ...current, assignedTo: e.target.value }))} placeholder="Assigned to" />
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Escalation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.studentName || '-'}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{task.taskType}</p>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={priorityVariant(task.priority)}>{task.priority || 'Medium'}</Badge>
                            {task.notes ? <Badge variant="outline">Has note</Badge> : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{task.dueDate || '-'}</TableCell>
                      <TableCell>{task.assignedTo || '-'}</TableCell>
                      <TableCell><Badge variant={statusVariant(task.status)}>{task.status}</Badge></TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{Number(task.escalationCount || 0)} time(s)</p>
                          <p className="text-xs text-muted-foreground">{task.lastEscalatedAt ? String(task.lastEscalatedAt).slice(0, 10) : '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {task.status !== 'Done' ? (
                            <Button size="icon" variant="outline" onClick={() => startComplete(task)} title="Mark done">
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button size="icon" variant="outline" onClick={() => startEdit(task)} title="Edit task">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canDelete ? (
                            <Button size="icon" variant="destructive" onClick={() => setDeleteTarget(task)} title="Delete task">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visibleTasks.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        {loading ? 'Loading follow-ups...' : 'No follow-up tasks match this view.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'risk' && Number(value || 0) > 0 ? 'text-destructive' : tone === 'good' ? 'text-emerald-600' : '';
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'risk' && Number(value || 0) > 0 ? 'text-destructive' : '';
  return (
    <div className="rounded-md border bg-muted/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({ title, rows, empty }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Active task distribution</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.slice(0, 5).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted/35 px-3 py-2 text-sm">
              <span className="truncate">{row.label}</span>
              <Badge variant="secondary">{row.count}</Badge>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
