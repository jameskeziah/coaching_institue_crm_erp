import React, { useEffect, useState } from 'react';
import {
  createOmrUpload,
  createParentReport,
  createPerformanceResult,
  createPerformanceTest,
  createQuestionAnalysis,
  createRemedialStudent,
  createTeacherImpact,
  deleteOmrUpload,
  deleteParentReport,
  deletePerformanceResult,
  deletePerformanceTest,
  deleteQuestionAnalysis,
  deleteRemedialStudent,
  deleteTeacherImpact,
  fetchOmrUploads,
  fetchParentReports,
  fetchPerformanceResults,
  fetchPerformanceTests,
  fetchQuestionAnalysis,
  fetchRemedialStudents,
  fetchStudents,
  fetchTeacherImpact,
  fetchTeachers,
  fetchTestPerformanceDashboard,
} from '../api';
import { useAuth } from '../AuthContext';

const testTypes = ['Daily Practice Test', 'Chapter Test', 'Subject Test', 'Unit Test', 'Weekly Test', 'Monthly Test', 'Full Syllabus Test', 'Mock Test', 'Scholarship Test', 'Retest', 'AI Lab Skill Test'];
const modes = ['Offline', 'Online', 'OMR'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function TestPerformance() {
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [parentReports, setParentReports] = useState([]);
  const [teacherImpact, setTeacherImpact] = useState([]);
  const [remedials, setRemedials] = useState([]);
  const [omrUploads, setOmrUploads] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [testForm, setTestForm] = useState({ testName: '', testType: 'Weekly Test', courseName: 'NEET', batchName: 'NEET 2026 Morning', branch: 'Tembhurni', subject: 'Biology', chapters: '', testDate: today(), duration: '1 Hour', totalQuestions: 50, totalMarks: 200, negativeMarking: true, testMode: 'Offline', resultDate: today(), status: 'Scheduled' });
  const [resultForm, setResultForm] = useState({ test_id: '', student_id: '', studentName: '', rollNumber: '', courseName: 'NEET', batchName: 'NEET 2026 Morning', branch: 'Tembhurni', status: 'Present', physicsMarks: 0, chemistryMarks: 0, biologyMarks: 0, mathsMarks: 0, totalMarks: 720, attemptedQuestions: 0, correctAnswers: 0, wrongAnswers: 0, blankQuestions: 0, strongSubject: '', weakSubject: '', weakChapter: '', suggestedAction: '', teacherRemark: '' });
  const [questionForm, setQuestionForm] = useState({ test_id: '', student_id: '', questionNumber: 1, subject: 'Biology', chapter: '', topic: '', correctOption: 'A', selectedOption: 'A', resultStatus: 'Correct', marksAwarded: 4 });
  const [parentForm, setParentForm] = useState({ test_id: '', student_id: '', studentName: '', parentPhone: '', marksObtained: 0, totalMarks: 720, batchRank: 1, strongSubject: '', weakSubject: '', attendancePercent: 0, homeworkCompletion: 0, teacherRemark: '', requiredAction: '', sentVia: 'WhatsApp', status: 'Draft' });
  const [impactForm, setImpactForm] = useState({ test_id: '', teacher_id: '', teacherName: '', subject: 'Biology', batchName: 'NEET 2026 Morning', previousAverage: 0, currentAverage: 0, weakChapterCount: 0, homeworkCompletion: 0, doubtResolution: 0, remarks: '' });
  const [remedialForm, setRemedialForm] = useState({ test_id: '', student_id: '', studentName: '', batchName: 'NEET 2026', weakSubject: '', weakChapter: '', issue: 'Low accuracy', assignedTeacher: '', remedialDate: today(), status: 'Pending', followUpTest: 'Required' });
  const [omrForm, setOmrForm] = useState({ test_id: '', omrFileName: '', processedCount: 0, errorCount: 0, status: 'Uploaded', notes: '' });

  async function load() {
    setError('');
    try {
      const [dash, testRows, resultRows, questionRows, reportRows, impactRows, remedialRows, omrRows, studentRows, teacherRows] = await Promise.all([
        fetchTestPerformanceDashboard(), fetchPerformanceTests(), fetchPerformanceResults(), fetchQuestionAnalysis(), fetchParentReports(), fetchTeacherImpact(), fetchRemedialStudents(), fetchOmrUploads(), fetchStudents(), fetchTeachers(),
      ]);
      setDashboard(dash); setTests(testRows); setResults(resultRows); setQuestions(questionRows); setParentReports(reportRows); setTeacherImpact(impactRows); setRemedials(remedialRows); setOmrUploads(omrRows); setStudents(studentRows); setTeachers(teacherRows);
    } catch (err) {
      setError(err.error || 'Could not load test performance data');
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(label, fn) {
    setMessage(''); setError('');
    try {
      await fn();
      setMessage(`${label} saved.`);
      await load();
    } catch (err) {
      setError(err.error || `${label} could not be saved`);
    }
  }

  async function remove(label, fn) {
    setMessage(''); setError('');
    try {
      await fn();
      setMessage(`${label} deleted.`);
      await load();
    } catch (err) {
      setError(err.error || `${label} could not be deleted`);
    }
  }

  function syncStudent(id, setter, form) {
    const student = students.find((item) => String(item.id) === String(id));
    setter({ ...form, student_id: id, studentName: student?.name || '', batchName: student?.batch || form.batchName, parentPhone: student?.data?.primaryPhone || student?.data?.whatsapp || form.parentPhone });
  }

  function syncTeacher(id) {
    const teacher = teachers.find((item) => String(item.id) === String(id));
    setImpactForm({ ...impactForm, teacher_id: id, teacherName: teacher?.name || '' });
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
  const input = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500';

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Test and Performance</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Exam Analytics Control</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Create tests, enter marks, generate ranks, analyze weak areas, inform parents, track teacher impact, and plan remedial action.</p>
          </div>
          <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={load}>Refresh</button>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['Tests Scheduled', dashboard?.totals?.testsScheduled],
          ['Average Score', `${dashboard?.totals?.averageScore || 0}%`],
          ['Test Attendance', `${dashboard?.totals?.testAttendance || 0}%`],
          ['Weak Students', dashboard?.totals?.weakStudentCount],
          ['Toppers', dashboard?.totals?.topperCount],
          ['Remedial Completion', `${dashboard?.totals?.remedialCompletion || 0}%`],
          ['Parent Reports Sent', `${dashboard?.totals?.parentReportSent || 0}%`],
          ['OMR Accuracy', `${dashboard?.totals?.omrProcessingAccuracy || 0}%`],
        ].map(([label, value]) => (
          <div className={card} key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value || 0}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <FormCard title="Create Test" onSubmit={() => submit('Test', () => createPerformanceTest(testForm))} button="Create Test">
          <input className={input} placeholder="Test name" value={testForm.testName} onChange={(e) => setTestForm({ ...testForm, testName: e.target.value })} required />
          <select className={input} value={testForm.testType} onChange={(e) => setTestForm({ ...testForm, testType: e.target.value })}>{testTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <input className={input} placeholder="Course" value={testForm.courseName} onChange={(e) => setTestForm({ ...testForm, courseName: e.target.value })} required />
          <input className={input} placeholder="Batch" value={testForm.batchName} onChange={(e) => setTestForm({ ...testForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Branch" value={testForm.branch} onChange={(e) => setTestForm({ ...testForm, branch: e.target.value })} />
          <input className={input} placeholder="Subject" value={testForm.subject} onChange={(e) => setTestForm({ ...testForm, subject: e.target.value })} />
          <input className={input} placeholder="Chapters" value={testForm.chapters} onChange={(e) => setTestForm({ ...testForm, chapters: e.target.value })} />
          <input className={input} type="date" value={testForm.testDate} onChange={(e) => setTestForm({ ...testForm, testDate: e.target.value })} />
          <input className={input} placeholder="Duration" value={testForm.duration} onChange={(e) => setTestForm({ ...testForm, duration: e.target.value })} />
          <input className={input} type="number" placeholder="Questions" value={testForm.totalQuestions} onChange={(e) => setTestForm({ ...testForm, totalQuestions: e.target.value })} />
          <input className={input} type="number" placeholder="Marks" value={testForm.totalMarks} onChange={(e) => setTestForm({ ...testForm, totalMarks: e.target.value })} />
          <select className={input} value={testForm.testMode} onChange={(e) => setTestForm({ ...testForm, testMode: e.target.value })}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select>
        </FormCard>

        <FormCard title="Marks Entry" onSubmit={() => submit('Marks', () => createPerformanceResult(resultForm))} button="Save Marks">
          <select className={input} value={resultForm.test_id} onChange={(e) => setResultForm({ ...resultForm, test_id: e.target.value })} required><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <select className={input} value={resultForm.student_id} onChange={(e) => syncStudent(e.target.value, setResultForm, resultForm)}><option value="">Student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input className={input} placeholder="Student name" value={resultForm.studentName} onChange={(e) => setResultForm({ ...resultForm, studentName: e.target.value })} required />
          <input className={input} placeholder="Roll number" value={resultForm.rollNumber} onChange={(e) => setResultForm({ ...resultForm, rollNumber: e.target.value })} />
          <input className={input} type="number" placeholder="Physics" value={resultForm.physicsMarks} onChange={(e) => setResultForm({ ...resultForm, physicsMarks: e.target.value })} />
          <input className={input} type="number" placeholder="Chemistry" value={resultForm.chemistryMarks} onChange={(e) => setResultForm({ ...resultForm, chemistryMarks: e.target.value })} />
          <input className={input} type="number" placeholder="Biology" value={resultForm.biologyMarks} onChange={(e) => setResultForm({ ...resultForm, biologyMarks: e.target.value })} />
          <input className={input} type="number" placeholder="Maths" value={resultForm.mathsMarks} onChange={(e) => setResultForm({ ...resultForm, mathsMarks: e.target.value })} />
          <input className={input} type="number" placeholder="Total marks" value={resultForm.totalMarks} onChange={(e) => setResultForm({ ...resultForm, totalMarks: e.target.value })} />
          <input className={input} type="number" placeholder="Attempted" value={resultForm.attemptedQuestions} onChange={(e) => setResultForm({ ...resultForm, attemptedQuestions: e.target.value })} />
          <input className={input} type="number" placeholder="Correct" value={resultForm.correctAnswers} onChange={(e) => setResultForm({ ...resultForm, correctAnswers: e.target.value })} />
          <input className={input} placeholder="Weak chapter" value={resultForm.weakChapter} onChange={(e) => setResultForm({ ...resultForm, weakChapter: e.target.value })} />
        </FormCard>

        <FormCard title="Question / Chapter Analysis" onSubmit={() => submit('Question analysis', () => createQuestionAnalysis(questionForm))} button="Save Analysis">
          <select className={input} value={questionForm.test_id} onChange={(e) => setQuestionForm({ ...questionForm, test_id: e.target.value })} required><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <input className={input} type="number" placeholder="Question number" value={questionForm.questionNumber} onChange={(e) => setQuestionForm({ ...questionForm, questionNumber: e.target.value })} />
          <input className={input} placeholder="Subject" value={questionForm.subject} onChange={(e) => setQuestionForm({ ...questionForm, subject: e.target.value })} />
          <input className={input} placeholder="Chapter" value={questionForm.chapter} onChange={(e) => setQuestionForm({ ...questionForm, chapter: e.target.value })} required />
          <input className={input} placeholder="Topic" value={questionForm.topic} onChange={(e) => setQuestionForm({ ...questionForm, topic: e.target.value })} />
          <select className={input} value={questionForm.resultStatus} onChange={(e) => setQuestionForm({ ...questionForm, resultStatus: e.target.value })}>{['Correct', 'Wrong', 'Blank', 'Multiple', 'Invalid'].map((status) => <option key={status}>{status}</option>)}</select>
        </FormCard>

        <FormCard title="Parent Report" onSubmit={() => submit('Parent report', () => createParentReport(parentForm))} button="Save Report">
          <select className={input} value={parentForm.test_id} onChange={(e) => setParentForm({ ...parentForm, test_id: e.target.value })} required><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <select className={input} value={parentForm.student_id} onChange={(e) => syncStudent(e.target.value, setParentForm, parentForm)}><option value="">Student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input className={input} placeholder="Student name" value={parentForm.studentName} onChange={(e) => setParentForm({ ...parentForm, studentName: e.target.value })} required />
          <input className={input} placeholder="Parent phone" value={parentForm.parentPhone} onChange={(e) => setParentForm({ ...parentForm, parentPhone: e.target.value })} />
          <input className={input} type="number" placeholder="Marks" value={parentForm.marksObtained} onChange={(e) => setParentForm({ ...parentForm, marksObtained: e.target.value })} />
          <input className={input} placeholder="Required action" value={parentForm.requiredAction} onChange={(e) => setParentForm({ ...parentForm, requiredAction: e.target.value })} />
        </FormCard>

        <FormCard title="Teacher Impact" onSubmit={() => submit('Teacher impact', () => createTeacherImpact(impactForm))} button="Save Impact">
          <select className={input} value={impactForm.teacher_id} onChange={(e) => syncTeacher(e.target.value)}><option value="">Teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
          <input className={input} placeholder="Teacher name" value={impactForm.teacherName} onChange={(e) => setImpactForm({ ...impactForm, teacherName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={impactForm.subject} onChange={(e) => setImpactForm({ ...impactForm, subject: e.target.value })} required />
          <input className={input} placeholder="Batch" value={impactForm.batchName} onChange={(e) => setImpactForm({ ...impactForm, batchName: e.target.value })} required />
          <input className={input} type="number" placeholder="Previous avg" value={impactForm.previousAverage} onChange={(e) => setImpactForm({ ...impactForm, previousAverage: e.target.value })} />
          <input className={input} type="number" placeholder="Current avg" value={impactForm.currentAverage} onChange={(e) => setImpactForm({ ...impactForm, currentAverage: e.target.value })} />
        </FormCard>

        <FormCard title="Remedial Student" onSubmit={() => submit('Remedial student', () => createRemedialStudent(remedialForm))} button="Add Remedial">
          <select className={input} value={remedialForm.test_id} onChange={(e) => setRemedialForm({ ...remedialForm, test_id: e.target.value })}><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <select className={input} value={remedialForm.student_id} onChange={(e) => syncStudent(e.target.value, setRemedialForm, remedialForm)}><option value="">Student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input className={input} placeholder="Student name" value={remedialForm.studentName} onChange={(e) => setRemedialForm({ ...remedialForm, studentName: e.target.value })} required />
          <input className={input} placeholder="Issue" value={remedialForm.issue} onChange={(e) => setRemedialForm({ ...remedialForm, issue: e.target.value })} required />
          <input className={input} placeholder="Assigned teacher" value={remedialForm.assignedTeacher} onChange={(e) => setRemedialForm({ ...remedialForm, assignedTeacher: e.target.value })} />
          <input className={input} type="date" value={remedialForm.remedialDate} onChange={(e) => setRemedialForm({ ...remedialForm, remedialDate: e.target.value })} />
        </FormCard>

        <FormCard title="OMR Upload Log" onSubmit={() => submit('OMR upload', () => createOmrUpload(omrForm))} button="Log OMR">
          <select className={input} value={omrForm.test_id} onChange={(e) => setOmrForm({ ...omrForm, test_id: e.target.value })} required><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <input className={input} placeholder="OMR file name" value={omrForm.omrFileName} onChange={(e) => setOmrForm({ ...omrForm, omrFileName: e.target.value })} required />
          <input className={input} type="number" placeholder="Processed" value={omrForm.processedCount} onChange={(e) => setOmrForm({ ...omrForm, processedCount: e.target.value })} />
          <input className={input} type="number" placeholder="Errors" value={omrForm.errorCount} onChange={(e) => setOmrForm({ ...omrForm, errorCount: e.target.value })} />
          <select className={input} value={omrForm.status} onChange={(e) => setOmrForm({ ...omrForm, status: e.target.value })}>{['Uploaded', 'Processed', 'Error'].map((status) => <option key={status}>{status}</option>)}</select>
          <input className={input} placeholder="Notes" value={omrForm.notes} onChange={(e) => setOmrForm({ ...omrForm, notes: e.target.value })} />
        </FormCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecordList title="Tests" rows={tests} fields={['testCode', 'testName', 'testType', 'batchName', 'status']} onDelete={isAdmin ? (id) => remove('Test', () => deletePerformanceTest(id)) : null} />
        <RecordList title="Rank List" rows={results} fields={['overallRank', 'studentName', 'batchName', 'marksObtained', 'percentage']} onDelete={isAdmin ? (id) => remove('Marks', () => deletePerformanceResult(id)) : null} />
        <RecordList title="Question Analysis" rows={questions} fields={['questionNumber', 'subject', 'chapter', 'resultStatus', 'marksAwarded']} onDelete={isAdmin ? (id) => remove('Question analysis', () => deleteQuestionAnalysis(id)) : null} />
        <RecordList title="Parent Reports" rows={parentReports} fields={['studentName', 'marksObtained', 'batchRank', 'weakSubject', 'status']} onDelete={isAdmin ? (id) => remove('Parent report', () => deleteParentReport(id)) : null} />
        <RecordList title="Teacher Impact" rows={teacherImpact} fields={['teacherName', 'subject', 'batchName', 'improvementPercent', 'remarks']} onDelete={isAdmin ? (id) => remove('Teacher impact', () => deleteTeacherImpact(id)) : null} />
        <RecordList title="Remedial List" rows={remedials} fields={['studentName', 'weakSubject', 'issue', 'remedialDate', 'status']} onDelete={isAdmin ? (id) => remove('Remedial student', () => deleteRemedialStudent(id)) : null} />
        <RecordList title="OMR Uploads" rows={omrUploads} fields={['omrFileName', 'processedCount', 'errorCount', 'status']} onDelete={isAdmin ? (id) => remove('OMR upload', () => deleteOmrUpload(id)) : null} />
      </section>
    </div>
  );
}

function FormCard({ title, onSubmit, button, children }) {
  return (
    <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
      <button className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{button}</button>
    </form>
  );
}

function RecordList({ title, rows, fields, onDelete }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{rows.length}</span>
      </div>
      <div className="mt-4 max-h-96 overflow-auto">
        {rows.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No records yet.</p> : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{field}</p>
                      <p className="break-words text-sm font-semibold text-slate-800">{String(row[field] ?? '-')}</p>
                    </div>
                  ))}
                </div>
                {onDelete && <button className="mt-3 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onDelete(row.id)}>Delete</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
