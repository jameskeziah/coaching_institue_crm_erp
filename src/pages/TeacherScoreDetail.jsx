import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  addTeacherScoreReviewNote,
  createTeacherImprovementPlan,
  fetchTeacherScoreAuditLog,
  fetchTeacherScorecard,
  fetchTeacherScoreHistory,
  recalculateTeacherScore,
  updateTeacherImprovementPlan,
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

function score(value) { return Number(value || 0).toFixed(1); }
function date(value) { return value ? new Date(value).toLocaleDateString('en-IN') : '-'; }
function label(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
const categories = {
  attendance: ['ATTENDANCE'], syllabus: ['SYLLABUS', 'PLANNING'], homework: ['HOMEWORK_DOCUMENTATION'],
  improvement: ['STUDENT_IMPROVEMENT'], doubts: ['DOUBT_SUPPORT'], complaints: ['COMPLAINT_PENALTY'],
  feedback: ['FEEDBACK_CLASS_QUALITY'],
};

export default function TeacherScoreDetail() {
  const { teacherId } = useParams();
  const { isAdmin } = useAuth();
  const [card, setCard] = useState(null);
  const [history, setHistory] = useState([]);
  const [audits, setAudits] = useState([]);
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState({ problemArea: 'DOCUMENTATION', goal: '', actionPlan: '', reviewDate: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(snapshotId) {
    try {
      const [scorecard, historyRows, auditRows] = await Promise.all([
        fetchTeacherScorecard(teacherId, snapshotId ? { snapshotId } : {}), fetchTeacherScoreHistory(teacherId), fetchTeacherScoreAuditLog(teacherId),
      ]);
      setCard(scorecard); setHistory(historyRows); setAudits(auditRows);
    } catch (err) { setError(err.error || 'Could not load TeacherScore'); }
  }
  useEffect(() => { load(); }, [teacherId]);
  async function run(work, success) {
    try { setBusy(true); setError(''); await work(); setMessage(success); await load(); }
    catch (err) { setError(err.error || 'Action failed'); }
    finally { setBusy(false); }
  }
  const positive = useMemo(() => (card?.components || []).filter((item) => Number(item.weight) > 0), [card]);
  const best = positive.length ? [...positive].sort((a, b) => Number(b.score) - Number(a.score))[0] : null;
  const weakest = positive.length ? [...positive].sort((a, b) => Number(a.score) - Number(b.score))[0] : null;
  if (!card) return <PageShell title="TeacherScore"><p>{error || 'Loading...'}</p></PageShell>;

  return (
    <PageShell title={card.teacherName} description={`${card.teacherSubject || 'Teacher'} · Evidence-based TeacherScore`}>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/teacher-score">Back to dashboard</Link></Button>{isAdmin ? <Button disabled={busy} onClick={() => run(() => recalculateTeacherScore(teacherId, { periodStart: card.periodStart, periodEnd: card.periodEnd, periodType: card.periodType }), 'TeacherScore recalculated.')}>Recalculate</Button> : null}</div>
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[['TeacherScore', `${score(card.finalScore)}/100`], ['Grade', card.grade], ['Confidence', `${score(card.confidenceScore)}%`], ['Trend', trend(history)], ['Best KPI', best ? label(best.category) : '-'], ['Needs focus', weakest ? label(weakest.category) : '-'], ['Complaint penalty', `-${score(card.complaintPenalty)}`], ['Open alerts', card.alerts?.filter((item) => item.status === 'OPEN').length || 0]].map(([name, value]) => <Card key={name}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 font-semibold">{value}</p></CardContent></Card>)}
      </div>
      {(card.alerts || []).length ? <div className="grid gap-2 md:grid-cols-2">{card.alerts.map((alert) => <Alert key={alert.id} variant={alert.severity === 'HIGH' ? 'destructive' : 'default'}><AlertDescription><strong>{label(alert.alertType)}:</strong> {alert.message}</AlertDescription></Alert>)}</div> : null}

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {['overview', 'breakdown', 'attendance', 'syllabus', 'homework', 'improvement', 'doubts', 'complaints', 'feedback', 'history', 'plan', 'audit'].map((item) => <TabsTrigger key={item} value={item}>{label(item)}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Score explanation</CardTitle></CardHeader><CardContent className="space-y-3">{positive.map((item) => <div key={item.id}><div className="flex justify-between text-sm"><span>{label(item.category)}</span><span>{score(item.score)} × {item.weight}% = {score(item.weightedScore)}</span></div><div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, item.score)}%` }} /></div></div>)}<div className="border-t pt-3 font-semibold">Weighted positives {score(positive.reduce((sum, item) => sum + Number(item.weightedScore || 0), 0))} − complaint penalty {score(card.complaintPenalty)} = {score(card.finalScore)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Reliability and recommendation</CardTitle></CardHeader><CardContent className="space-y-3"><p>Confidence is <strong>{score(card.confidenceScore)}%</strong>. Missing or insufficient evidence affects confidence, not an invented zero-performance judgment.</p><p><strong>Recommended focus:</strong> {weakest ? `${label(weakest.category)} — ${weakest.calculationNote}` : 'Collect more source data.'}</p><p className="text-sm text-muted-foreground">Period: {date(card.periodStart)} to {date(card.periodEnd)} · Calculated {date(card.calculatedAt)}</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="breakdown"><EvidenceTable rows={card.components || []} /></TabsContent>
        {Object.entries(categories).map(([tab, allowed]) => <TabsContent key={tab} value={tab}><EvidenceTable rows={(card.components || []).filter((item) => allowed.includes(item.category))} /></TabsContent>)}
        <TabsContent value="history"><Card><CardContent className="p-4"><Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Score</TableHead><TableHead>Grade</TableHead><TableHead>Confidence</TableHead><TableHead>Calculated</TableHead><TableHead /></TableRow></TableHeader><TableBody>{history.map((item) => <TableRow key={item.id}><TableCell>{date(item.periodStart)} – {date(item.periodEnd)}</TableCell><TableCell>{score(item.finalScore)}</TableCell><TableCell><Badge>{item.grade}</Badge></TableCell><TableCell>{score(item.confidenceScore)}%</TableCell><TableCell>{date(item.calculatedAt)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => load(item.id)}>View</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
        <TabsContent value="plan" className="grid gap-4 lg:grid-cols-2">
          {isAdmin ? <Card><CardHeader><CardTitle>Create improvement plan</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => createTeacherImprovementPlan(teacherId, { ...plan, snapshotId: card.id, branchId: card.branchId, periodStart: card.periodStart, periodEnd: card.periodEnd }), 'Improvement plan created.'); }}><select className="w-full rounded-md border px-3 py-2 text-sm" value={plan.problemArea} onChange={(e) => setPlan({ ...plan, problemArea: e.target.value })}>{['ATTENDANCE', 'SYLLABUS_DELAY', 'HOMEWORK_CHECKING', 'LOW_STUDENT_IMPROVEMENT', 'PARENT_COMPLAINTS', 'LOW_FEEDBACK', 'DOCUMENTATION'].map((item) => <option key={item}>{item}</option>)}</select><Input value={plan.goal} onChange={(e) => setPlan({ ...plan, goal: e.target.value })} placeholder="Measurable goal" required /><Textarea value={plan.actionPlan} onChange={(e) => setPlan({ ...plan, actionPlan: e.target.value })} placeholder="Action plan" required /><Input type="date" value={plan.reviewDate} onChange={(e) => setPlan({ ...plan, reviewDate: e.target.value })} /><Button disabled={busy}>Create plan</Button></form></CardContent></Card> : null}
          <Card><CardHeader><CardTitle>Improvement plans</CardTitle></CardHeader><CardContent className="space-y-3">{(card.improvementPlans || []).map((item) => <div key={item.id} className="rounded-md border p-3"><div className="flex justify-between"><strong>{label(item.problemArea)}</strong><Badge>{item.status}</Badge></div><p className="mt-2 text-sm"><strong>Goal:</strong> {item.goal}</p><p className="text-sm text-muted-foreground">{item.actionPlan}</p><p className="mt-2 text-xs">Review {date(item.reviewDate)}</p>{isAdmin && item.status !== 'COMPLETED' ? <Button className="mt-2" size="sm" variant="outline" onClick={() => run(() => updateTeacherImprovementPlan(item.id, { status: 'COMPLETED' }), 'Improvement plan completed.')}>Mark completed</Button> : null}</div>)}{!card.improvementPlans?.length ? <p className="text-sm text-muted-foreground">No improvement plans.</p> : null}</CardContent></Card>
          {isAdmin ? <Card className="lg:col-span-2"><CardHeader><CardTitle>Add review note</CardTitle></CardHeader><CardContent><div className="flex gap-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note; this does not alter the score." /><Button disabled={busy || !note.trim()} onClick={() => run(async () => { await addTeacherScoreReviewNote(teacherId, { snapshotId: card.id, note }); setNote(''); }, 'Review note added.')}>Add note</Button></div><div className="mt-4 space-y-2">{(card.reviewNotes || []).map((item) => <div key={item.id} className="rounded border p-2 text-sm">{item.note}<p className="text-xs text-muted-foreground">{item.reviewedByName || 'Reviewer'} · {date(item.createdAt)}</p></div>)}</div></CardContent></Card> : null}
        </TabsContent>
        <TabsContent value="audit"><Card><CardContent className="space-y-2 p-4">{audits.map((item) => <div key={item.id} className="rounded border p-3 text-sm"><strong>{label(item.action)}</strong><p className="text-xs text-muted-foreground">{date(item.createdAt)}</p></div>)}{!audits.length ? <p className="text-muted-foreground">No TeacherScore audit events.</p> : null}</CardContent></Card></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function EvidenceTable({ rows }) {
  return <Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow><TableHead>Component</TableHead><TableHead>Raw value</TableHead><TableHead>Score</TableHead><TableHead>Weight</TableHead><TableHead>Weighted</TableHead><TableHead>Evidence</TableHead><TableHead>Explanation</TableHead></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{label(item.metricKey)}</TableCell><TableCell>{item.rawDisplay || item.rawValue}</TableCell><TableCell>{item.category === 'COMPLAINT_PENALTY' ? '-' : score(item.score)}</TableCell><TableCell>{item.weight || '-'}</TableCell><TableCell>{item.category === 'COMPLAINT_PENALTY' ? '-' : score(item.weightedScore)}</TableCell><TableCell><Badge variant={!item.evidenceAvailable ? 'destructive' : !item.minimumDataMet ? 'secondary' : 'outline'}>{!item.evidenceAvailable ? 'Missing' : item.minimumDataMet ? 'Sufficient' : 'Limited'}</Badge><p className="mt-1 text-xs">{item.sourceEntityType} · {(item.sourceEntityIds || []).length} records</p></TableCell><TableCell className="min-w-72 text-sm text-muted-foreground">{item.calculationNote}</TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <p className="py-4 text-sm text-muted-foreground">No evidence components.</p> : null}</CardContent></Card>;
}
function trend(history) {
  if (history.length < 2) return 'No prior period';
  const change = Number(history[0].finalScore || 0) - Number(history[1].finalScore || 0);
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}`;
}
