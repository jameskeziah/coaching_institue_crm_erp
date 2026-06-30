import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchBatches,
  fetchBranches,
  fetchCourses,
  fetchSubjects,
  fetchTeacherScoreConfig,
  fetchTeacherScorecards,
  fetchTeachers,
  recalculateAllTeacherScores,
  recalculateTeacherScore,
  updateTeacherScoreConfig,
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

function monthPeriod(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthIndex, 0));
  return { periodStart: `${month}-01`, periodEnd: end.toISOString().slice(0, 10), periodType: 'MONTHLY' };
}
function gradeVariant(grade) {
  if (['A_PLUS', 'A'].includes(grade)) return 'default';
  if (grade === 'NEEDS_REVIEW') return 'destructive';
  return 'secondary';
}
function score(value) { return value === null || value === undefined ? '-' : Number(value).toFixed(1); }

export default function TeacherScoreDashboard() {
  const { isAdmin } = useAuth();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [config, setConfig] = useState(null);
  const [filters, setFilters] = useState({ branchId: '', teacherId: '', courseId: '', batchId: '', subjectId: '', month: currentMonth, grade: '', scoreMin: '', scoreMax: '', lowConfidenceOnly: false, needsReviewOnly: false });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setRows(await fetchTeacherScorecards(filters)); }
    catch (err) { setError(err.error || 'Could not load TeacherScore dashboard'); }
  }
  useEffect(() => {
    Promise.all([fetchBranches(), fetchTeachers(), fetchCourses(), fetchBatches(), fetchSubjects(), fetchTeacherScoreConfig()])
      .then(([branchRows, teacherRows, courseRows, batchRows, subjectRows, configuration]) => {
        setBranches(branchRows || []); setTeachers(teacherRows || []); setCourses(courseRows || []);
        setBatches(batchRows || []); setSubjects(subjectRows || []); setConfig(configuration);
      }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [filters.branchId, filters.teacherId, filters.courseId, filters.batchId, filters.subjectId, filters.grade, filters.scoreMin, filters.scoreMax, filters.lowConfidenceOnly, filters.needsReviewOnly]);

  async function run(work, success) {
    try { setBusy(true); setError(''); await work(); setMessage(success); await load(); }
    catch (err) { setError(err.error || 'TeacherScore action failed'); }
    finally { setBusy(false); }
  }
  const scored = rows.filter((row) => row.finalScore !== null && row.finalScore !== undefined);
  const average = scored.length ? scored.reduce((sum, row) => sum + Number(row.finalScore || 0), 0) / scored.length : 0;
  const lowConfidence = scored.filter((row) => Number(row.confidenceScore || 0) < 60).length;
  const needsReview = rows.filter((row) => !row.id || row.grade === 'NEEDS_REVIEW').length;

  return (
    <PageShell title="TeacherScore" description="Automatic, evidence-based teacher performance with transparent calculations, confidence, alerts, and improvement plans.">
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {[['Teachers', rows.length], ['Average TeacherScore', score(average)], ['Needs review', needsReview], ['Low confidence', lowConfidence]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </div>

      <Tabs defaultValue="scorecards">
        <TabsList><TabsTrigger value="scorecards">Scorecards</TabsTrigger>{isAdmin ? <TabsTrigger value="config">Scoring Config</TabsTrigger> : null}</TabsList>
        <TabsContent value="scorecards" className="space-y-4">
          <Card><CardContent className="grid gap-2 p-4 md:grid-cols-3 xl:grid-cols-6">
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}><option value="">All branches</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.teacherId} onChange={(e) => setFilters({ ...filters, teacherId: e.target.value })}><option value="">All teachers</option>{teachers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.courseId} onChange={(e) => setFilters({ ...filters, courseId: e.target.value })}><option value="">All courses</option>{courses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.batchId} onChange={(e) => setFilters({ ...filters, batchId: e.target.value })}><option value="">All batches</option>{batches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.subjectId} onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}><option value="">All subjects</option>{subjects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <Input type="month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} />
            <select className="rounded-md border px-3 py-2 text-sm" value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}><option value="">All grades</option>{['A_PLUS', 'A', 'B', 'C', 'D', 'NEEDS_REVIEW'].map((item) => <option key={item}>{item}</option>)}</select>
            <Input type="number" min="0" max="100" placeholder="Min score" value={filters.scoreMin} onChange={(e) => setFilters({ ...filters, scoreMin: e.target.value })} />
            <Input type="number" min="0" max="100" placeholder="Max score" value={filters.scoreMax} onChange={(e) => setFilters({ ...filters, scoreMax: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.lowConfidenceOnly} onChange={(e) => setFilters({ ...filters, lowConfidenceOnly: e.target.checked })} />Low confidence only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.needsReviewOnly} onChange={(e) => setFilters({ ...filters, needsReviewOnly: e.target.checked })} />Needs review only</label>
            {isAdmin ? <Button disabled={busy} onClick={() => run(() => recalculateAllTeacherScores({ ...monthPeriod(filters.month), branchId: filters.branchId || undefined }), 'All TeacherScores recalculated.')}>Recalculate all</Button> : null}
          </CardContent></Card>
          <Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow><TableHead>Teacher</TableHead><TableHead>Branch / Assignment</TableHead><TableHead>Final</TableHead><TableHead>Grade</TableHead><TableHead>Attendance</TableHead><TableHead>Syllabus</TableHead><TableHead>Improvement</TableHead><TableHead>Homework</TableHead><TableHead>Feedback</TableHead><TableHead>Complaints</TableHead><TableHead>Confidence</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.teacherId}><TableCell><Link className="font-semibold underline" to={`/teacher-score/${row.teacherId}`}>{row.teacherName}</Link><p className="text-xs text-muted-foreground">{row.teacherSubject}</p></TableCell><TableCell><p>{row.branchName || '-'}</p><p className="text-xs text-muted-foreground">{row.subjects || row.batches || 'No active assignment'}</p></TableCell><TableCell className="font-semibold">{score(row.finalScore)}</TableCell><TableCell><Badge variant={gradeVariant(row.grade)}>{row.grade || 'NOT_CALCULATED'}</Badge></TableCell><TableCell>{score(row.attendanceScore)}</TableCell><TableCell>{score(row.syllabusScore)}</TableCell><TableCell>{score(row.studentImprovementScore)}</TableCell><TableCell>{score(row.homeworkScore)}</TableCell><TableCell>{score(row.feedbackScore)}</TableCell><TableCell>{row.complaintCount || 0} / -{score(row.complaintPenalty || 0)}</TableCell><TableCell><Badge variant={Number(row.confidenceScore || 0) < 60 ? 'destructive' : 'outline'}>{score(row.confidenceScore)}%</Badge></TableCell><TableCell><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to={`/teacher-score/${row.teacherId}`}>View</Link></Button>{isAdmin ? <Button size="sm" disabled={busy} onClick={() => run(() => recalculateTeacherScore(row.teacherId, monthPeriod(filters.month)), `${row.teacherName} recalculated.`)}>Recalculate</Button> : null}</div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>
        {isAdmin ? <TabsContent value="config">{config ? <ConfigForm config={config} setConfig={setConfig} save={() => run(() => updateTeacherScoreConfig(config), 'TeacherScore config updated.')} busy={busy} /> : null}</TabsContent> : null}
      </Tabs>
    </PageShell>
  );
}

function ConfigForm({ config, setConfig, save, busy }) {
  const fields = [
    ['attendanceWeight', 'Attendance'], ['planningWeight', 'Planning'], ['syllabusWeight', 'Syllabus'],
    ['homeworkWeight', 'Homework'], ['studentImprovementWeight', 'Student improvement'],
    ['doubtSupportWeight', 'Doubt support'], ['feedbackWeight', 'Feedback'],
    ['maxComplaintPenalty', 'Maximum complaint penalty'], ['minimumFeedbackResponses', 'Minimum feedback responses'],
    ['minimumAttendanceSessions', 'Minimum attendance sessions'], ['minimumImprovementTests', 'Minimum improvement tests'],
    ['onTimeAttendanceBufferMinutes', 'Attendance buffer minutes'],
  ];
  const total = fields.slice(0, 7).reduce((sum, [key]) => sum + Number(config[key] || 0), 0);
  return <Card><CardHeader><CardTitle>Tenant TeacherScore configuration</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{fields.map(([key, label]) => <label key={key} className="text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><Input type="number" value={config[key] ?? ''} onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })} /></label>)}<div className="md:col-span-3 flex items-center justify-between"><p className={total === 100 ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>Positive weights total: {total}/100</p><Button disabled={busy || total !== 100} onClick={save}>Save configuration</Button></div></CardContent></Card>;
}
