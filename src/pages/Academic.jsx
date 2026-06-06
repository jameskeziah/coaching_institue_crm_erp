import React, { useEffect, useState } from 'react';
import {
  createAcademicCalendar,
  createAcademicSyllabus,
  createAcademicTest,
  createAcademicTimetable,
  createClassDeliveryLog,
  createDoubtSession,
  createHomeworkAssignment,
  createLecturePlan,
  createRemedialAction,
  createRevisionPlan,
  createStudentTestResult,
  deleteAcademicCalendar,
  deleteAcademicSyllabus,
  deleteAcademicTest,
  deleteAcademicTimetable,
  deleteClassDeliveryLog,
  deleteDoubtSession,
  deleteHomeworkAssignment,
  deleteLecturePlan,
  deleteRemedialAction,
  deleteRevisionPlan,
  deleteStudentTestResult,
  fetchAcademicCalendar,
  fetchAcademicDashboard,
  fetchAcademicSyllabus,
  fetchAcademicTests,
  fetchAcademicTimetable,
  fetchClassDeliveryLogs,
  fetchDoubtSessions,
  fetchHomeworkAssignments,
  fetchLecturePlans,
  fetchRemedialActions,
  fetchRevisionPlans,
  fetchStudentTestResults,
  fetchStudents,
  fetchTeachers,
} from '../api';
import { useAuth } from '../AuthContext';

const syllabusStatuses = ['Pending', 'In Progress', 'Completed', 'Revised', 'Tested', 'Weak', 'Re-teach Required'];
const lectureTypes = ['Regular', 'Test', 'Doubt', 'Revision'];
const testTypes = ['Daily Practice Test', 'Weekly Test', 'Monthly Test', 'Unit Test', 'Full-Length Test', 'Scholarship Exam', 'AI Lab Skill Test'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function percent(value) {
  return `${Number(value || 0)}%`;
}

export default function Academic() {
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [syllabus, setSyllabus] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [lecturePlans, setLecturePlans] = useState([]);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [homework, setHomework] = useState([]);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [remedials, setRemedials] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [syllabusForm, setSyllabusForm] = useState({ courseName: 'NEET 2026', subject: 'Biology', chapter: '', topic: '', subTopic: '', difficulty: 'Basic', estimatedLectures: 1, requiredTest: true, status: 'Pending' });
  const [calendarForm, setCalendarForm] = useState({ academicYear: '2026-27', calendarType: 'Yearly Calendar', title: '', courseName: 'NEET 2026', startDate: today(), endDate: today(), targetDate: today(), notes: '', status: 'Planned' });
  const [timetableForm, setTimetableForm] = useState({ batchName: 'NEET 2026 Morning', courseName: 'NEET', subject: 'Biology', teacher_id: '', teacherName: '', dayOfWeek: 'Monday', timeSlot: '8:00 AM - 9:30 AM', room: 'Classroom 1', lectureType: 'Regular', status: 'Scheduled' });
  const [lectureForm, setLectureForm] = useState({ date: today(), batchName: 'NEET 2026 Morning', courseName: 'NEET', subject: 'Biology', chapter: '', topic: '', subTopic: '', teacher_id: '', teacherName: '', lectureType: 'Regular', homeworkPlanned: '', testLinked: '', teachingMaterial: 'Notes / PPT / Board', status: 'Planned' });
  const [deliveryForm, setDeliveryForm] = useState({ lecture_plan_id: '', date: today(), batchName: 'NEET 2026 Morning', subject: 'Biology', teacher_id: '', teacherName: '', plannedTopic: '', actualTopic: '', lectureCompleted: true, classAttendance: '', homeworkGiven: true, doubtsSolved: 'Partial', notesProvided: true, teacherRemark: '', academicHeadRemark: '', status: 'Delivered' });
  const [homeworkForm, setHomeworkForm] = useState({ date: today(), batchName: 'Foundation 9th', courseName: 'Foundation', subject: 'Maths', topic: '', homework: '', dueDate: today(), submittedCount: 0, totalCount: 0, checkedBy: '', parentAlert: 'Not Sent', status: 'Assigned' });
  const [testForm, setTestForm] = useState({ testName: '', date: today(), courseName: 'NEET', batchName: 'NEET 2026 Morning', subjects: 'Physics, Chemistry, Biology', syllabusCovered: '', totalMarks: 720, duration: '3 hours', resultDate: today(), analysisRequired: true, status: 'Scheduled' });
  const [resultForm, setResultForm] = useState({ test_id: '', student_id: '', studentName: '', batchName: 'NEET 2026 Morning', subject: 'Biology', marksObtained: 0, totalMarks: 360, testRank: 1, weakChapter: '', actionNeeded: 'Doubt session' });
  const [doubtForm, setDoubtForm] = useState({ date: today(), batchName: 'NEET 2026', subject: 'Physics', topic: '', teacher_id: '', teacherName: '', studentsAssigned: 0, reason: 'Low test score', sessionType: 'Weak Student Doubt', status: 'Scheduled', improvementChecked: false });
  const [revisionForm, setRevisionForm] = useState({ revisionDate: today(), batchName: 'NEET 2027', subject: 'Biology', chapter: '', teacher_id: '', teacherName: '', revisionType: 'Chapter Revision', material: 'Short notes + MCQ', testAfterRevision: true, status: 'Planned' });
  const [remedialForm, setRemedialForm] = useState({ targetType: 'Student', targetName: '', student_id: '', batchName: 'NEET Batch', issue: '', reason: '', action: 'Doubt session + assignment', assignedTeacher: '', deadline: today(), followUpTest: true, status: 'Open' });

  async function load() {
    setError('');
    try {
      const [dash, syllabusRows, calendarRows, timetableRows, lectureRows, deliveryRows, homeworkRows, testRows, resultRows, doubtRows, revisionRows, remedialRows, studentRows, teacherRows] = await Promise.all([
        fetchAcademicDashboard(), fetchAcademicSyllabus(), fetchAcademicCalendar(), fetchAcademicTimetable(), fetchLecturePlans(), fetchClassDeliveryLogs(), fetchHomeworkAssignments(), fetchAcademicTests(), fetchStudentTestResults(), fetchDoubtSessions(), fetchRevisionPlans(), fetchRemedialActions(), fetchStudents(), fetchTeachers(),
      ]);
      setDashboard(dash); setSyllabus(syllabusRows); setCalendar(calendarRows); setTimetable(timetableRows); setLecturePlans(lectureRows); setDeliveryLogs(deliveryRows); setHomework(homeworkRows); setTests(testRows); setResults(resultRows); setDoubts(doubtRows); setRevisions(revisionRows); setRemedials(remedialRows); setStudents(studentRows); setTeachers(teacherRows);
    } catch (err) {
      setError(err.error || 'Could not load academic data');
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(label, fn) {
    setMessage('');
    setError('');
    try {
      await fn();
      setMessage(`${label} saved.`);
      await load();
    } catch (err) {
      setError(err.error || `${label} could not be saved`);
    }
  }

  async function remove(label, fn) {
    setMessage('');
    setError('');
    try {
      await fn();
      setMessage(`${label} deleted.`);
      await load();
    } catch (err) {
      setError(err.error || `${label} could not be deleted`);
    }
  }

  function teacherSelect(value, setter, form) {
    const teacher = teachers.find((item) => String(item.id) === String(value));
    setter({ ...form, teacher_id: value, teacherName: teacher?.name || '' });
  }

  function studentSelect(value) {
    const student = students.find((item) => String(item.id) === String(value));
    setResultForm({ ...resultForm, student_id: value, studentName: student?.name || '', batchName: student?.batch || resultForm.batchName });
    setRemedialForm({ ...remedialForm, student_id: value, targetName: student?.name || remedialForm.targetName, batchName: student?.batch || remedialForm.batchName });
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
  const input = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500';
  const button = 'rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800';

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Academic Management</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Teaching Control System</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Plan syllabus, timetable, lecture delivery, homework, tests, doubt sessions, revision, and remedial action.</p>
          </div>
          <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={load}>Refresh</button>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['Syllabus Completion', percent(dashboard?.totals?.syllabusCompletion)],
          ['Lecture Completion', percent(dashboard?.totals?.lectureCompletion)],
          ['Homework Submission', percent(dashboard?.totals?.homeworkSubmission)],
          ['Average Test Score', percent(dashboard?.totals?.averageTestScore)],
          ['Weak Students', dashboard?.totals?.weakStudentCount || 0],
          ['Pending Lectures', dashboard?.totals?.pendingLectures || 0],
          ['Pending Homework', dashboard?.totals?.pendingHomework || 0],
          ['Open Remedial', dashboard?.totals?.openRemedialActions || 0],
        ].map(([label, value]) => (
          <div className={card} key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <FormCard title="Course Syllabus" onSubmit={() => submit('Syllabus topic', () => createAcademicSyllabus(syllabusForm))} button="Add Topic">
          <input className={input} placeholder="Course name" value={syllabusForm.courseName} onChange={(e) => setSyllabusForm({ ...syllabusForm, courseName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={syllabusForm.subject} onChange={(e) => setSyllabusForm({ ...syllabusForm, subject: e.target.value })} required />
          <input className={input} placeholder="Chapter" value={syllabusForm.chapter} onChange={(e) => setSyllabusForm({ ...syllabusForm, chapter: e.target.value })} required />
          <input className={input} placeholder="Topic" value={syllabusForm.topic} onChange={(e) => setSyllabusForm({ ...syllabusForm, topic: e.target.value })} required />
          <input className={input} placeholder="Sub-topic" value={syllabusForm.subTopic} onChange={(e) => setSyllabusForm({ ...syllabusForm, subTopic: e.target.value })} />
          <select className={input} value={syllabusForm.status} onChange={(e) => setSyllabusForm({ ...syllabusForm, status: e.target.value })}>{syllabusStatuses.map((status) => <option key={status}>{status}</option>)}</select>
          <input className={input} type="number" placeholder="Estimated lectures" value={syllabusForm.estimatedLectures} onChange={(e) => setSyllabusForm({ ...syllabusForm, estimatedLectures: e.target.value })} />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={syllabusForm.requiredTest} onChange={(e) => setSyllabusForm({ ...syllabusForm, requiredTest: e.target.checked })} />Required test</label>
        </FormCard>

        <FormCard title="Academic Calendar" onSubmit={() => submit('Calendar item', () => createAcademicCalendar(calendarForm))} button="Add Calendar">
          <input className={input} placeholder="Academic year" value={calendarForm.academicYear} onChange={(e) => setCalendarForm({ ...calendarForm, academicYear: e.target.value })} required />
          <select className={input} value={calendarForm.calendarType} onChange={(e) => setCalendarForm({ ...calendarForm, calendarType: e.target.value })}>{['Yearly Calendar', 'Monthly Calendar', 'Weekly Calendar', 'Test Calendar', 'Revision Calendar', 'Event Calendar'].map((type) => <option key={type}>{type}</option>)}</select>
          <input className={input} placeholder="Title" value={calendarForm.title} onChange={(e) => setCalendarForm({ ...calendarForm, title: e.target.value })} required />
          <input className={input} placeholder="Course" value={calendarForm.courseName} onChange={(e) => setCalendarForm({ ...calendarForm, courseName: e.target.value })} />
          <input className={input} type="date" value={calendarForm.startDate} onChange={(e) => setCalendarForm({ ...calendarForm, startDate: e.target.value })} />
          <input className={input} type="date" value={calendarForm.targetDate} onChange={(e) => setCalendarForm({ ...calendarForm, targetDate: e.target.value })} />
        </FormCard>

        <FormCard title="Batch Timetable" onSubmit={() => submit('Timetable', () => createAcademicTimetable(timetableForm))} button="Schedule Class">
          <input className={input} placeholder="Batch" value={timetableForm.batchName} onChange={(e) => setTimetableForm({ ...timetableForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Course" value={timetableForm.courseName} onChange={(e) => setTimetableForm({ ...timetableForm, courseName: e.target.value })} />
          <input className={input} placeholder="Subject" value={timetableForm.subject} onChange={(e) => setTimetableForm({ ...timetableForm, subject: e.target.value })} required />
          <select className={input} value={timetableForm.teacher_id} onChange={(e) => teacherSelect(e.target.value, setTimetableForm, timetableForm)}><option value="">Teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
          <select className={input} value={timetableForm.dayOfWeek} onChange={(e) => setTimetableForm({ ...timetableForm, dayOfWeek: e.target.value })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => <option key={day}>{day}</option>)}</select>
          <input className={input} placeholder="Time" value={timetableForm.timeSlot} onChange={(e) => setTimetableForm({ ...timetableForm, timeSlot: e.target.value })} required />
          <input className={input} placeholder="Room" value={timetableForm.room} onChange={(e) => setTimetableForm({ ...timetableForm, room: e.target.value })} />
          <select className={input} value={timetableForm.lectureType} onChange={(e) => setTimetableForm({ ...timetableForm, lectureType: e.target.value })}>{lectureTypes.map((type) => <option key={type}>{type}</option>)}</select>
        </FormCard>

        <FormCard title="Lecture Plan" onSubmit={() => submit('Lecture plan', () => createLecturePlan(lectureForm))} button="Plan Lecture">
          <input className={input} type="date" value={lectureForm.date} onChange={(e) => setLectureForm({ ...lectureForm, date: e.target.value })} />
          <input className={input} placeholder="Batch" value={lectureForm.batchName} onChange={(e) => setLectureForm({ ...lectureForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={lectureForm.subject} onChange={(e) => setLectureForm({ ...lectureForm, subject: e.target.value })} required />
          <input className={input} placeholder="Chapter" value={lectureForm.chapter} onChange={(e) => setLectureForm({ ...lectureForm, chapter: e.target.value })} />
          <input className={input} placeholder="Topic" value={lectureForm.topic} onChange={(e) => setLectureForm({ ...lectureForm, topic: e.target.value })} required />
          <select className={input} value={lectureForm.teacher_id} onChange={(e) => teacherSelect(e.target.value, setLectureForm, lectureForm)}><option value="">Teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
          <input className={input} placeholder="Homework planned" value={lectureForm.homeworkPlanned} onChange={(e) => setLectureForm({ ...lectureForm, homeworkPlanned: e.target.value })} />
          <input className={input} placeholder="Test linked" value={lectureForm.testLinked} onChange={(e) => setLectureForm({ ...lectureForm, testLinked: e.target.value })} />
        </FormCard>

        <FormCard title="Class Delivery Log" onSubmit={() => submit('Class delivery', () => createClassDeliveryLog(deliveryForm))} button="Save Delivery">
          <select className={input} value={deliveryForm.lecture_plan_id} onChange={(e) => {
            const plan = lecturePlans.find((item) => String(item.id) === e.target.value);
            setDeliveryForm({ ...deliveryForm, lecture_plan_id: e.target.value, date: plan?.date || deliveryForm.date, batchName: plan?.batchName || deliveryForm.batchName, subject: plan?.subject || deliveryForm.subject, teacher_id: plan?.teacher_id || '', teacherName: plan?.teacherName || '', plannedTopic: plan?.topic || '' });
          }}><option value="">Lecture plan</option>{lecturePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.date} - {plan.batchName} - {plan.topic}</option>)}</select>
          <input className={input} placeholder="Actual topic taught" value={deliveryForm.actualTopic} onChange={(e) => setDeliveryForm({ ...deliveryForm, actualTopic: e.target.value })} required />
          <input className={input} placeholder="Class attendance, e.g. 42 / 50" value={deliveryForm.classAttendance} onChange={(e) => setDeliveryForm({ ...deliveryForm, classAttendance: e.target.value })} />
          <input className={input} placeholder="Doubts solved" value={deliveryForm.doubtsSolved} onChange={(e) => setDeliveryForm({ ...deliveryForm, doubtsSolved: e.target.value })} />
          <textarea className={`${input} md:col-span-2`} placeholder="Teacher remark" value={deliveryForm.teacherRemark} onChange={(e) => setDeliveryForm({ ...deliveryForm, teacherRemark: e.target.value })} />
        </FormCard>

        <FormCard title="Homework Tracker" onSubmit={() => submit('Homework', () => createHomeworkAssignment(homeworkForm))} button="Assign Homework">
          <input className={input} type="date" value={homeworkForm.date} onChange={(e) => setHomeworkForm({ ...homeworkForm, date: e.target.value })} />
          <input className={input} placeholder="Batch" value={homeworkForm.batchName} onChange={(e) => setHomeworkForm({ ...homeworkForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={homeworkForm.subject} onChange={(e) => setHomeworkForm({ ...homeworkForm, subject: e.target.value })} required />
          <input className={input} placeholder="Topic" value={homeworkForm.topic} onChange={(e) => setHomeworkForm({ ...homeworkForm, topic: e.target.value })} />
          <input className={input} placeholder="Homework" value={homeworkForm.homework} onChange={(e) => setHomeworkForm({ ...homeworkForm, homework: e.target.value })} required />
          <input className={input} type="date" value={homeworkForm.dueDate} onChange={(e) => setHomeworkForm({ ...homeworkForm, dueDate: e.target.value })} />
          <input className={input} type="number" placeholder="Submitted" value={homeworkForm.submittedCount} onChange={(e) => setHomeworkForm({ ...homeworkForm, submittedCount: e.target.value })} />
          <input className={input} type="number" placeholder="Total" value={homeworkForm.totalCount} onChange={(e) => setHomeworkForm({ ...homeworkForm, totalCount: e.target.value })} />
        </FormCard>

        <FormCard title="Test Calendar" onSubmit={() => submit('Test', () => createAcademicTest(testForm))} button="Schedule Test">
          <input className={input} placeholder="Test name" value={testForm.testName} onChange={(e) => setTestForm({ ...testForm, testName: e.target.value })} required />
          <input className={input} type="date" value={testForm.date} onChange={(e) => setTestForm({ ...testForm, date: e.target.value })} />
          <select className={input} value={testForm.status} onChange={(e) => setTestForm({ ...testForm, status: e.target.value })}>{['Scheduled', 'Conducted', 'Result Published', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select>
          <select className={input} value={testForm.duration} onChange={(e) => setTestForm({ ...testForm, duration: e.target.value })}>{testTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <input className={input} placeholder="Batch" value={testForm.batchName} onChange={(e) => setTestForm({ ...testForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Subjects" value={testForm.subjects} onChange={(e) => setTestForm({ ...testForm, subjects: e.target.value })} />
          <input className={input} placeholder="Syllabus covered" value={testForm.syllabusCovered} onChange={(e) => setTestForm({ ...testForm, syllabusCovered: e.target.value })} />
          <input className={input} type="number" placeholder="Total marks" value={testForm.totalMarks} onChange={(e) => setTestForm({ ...testForm, totalMarks: e.target.value })} />
        </FormCard>

        <FormCard title="Performance Analysis" onSubmit={() => submit('Test result', () => createStudentTestResult(resultForm))} button="Save Result">
          <select className={input} value={resultForm.test_id} onChange={(e) => setResultForm({ ...resultForm, test_id: e.target.value })}><option value="">Test</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.testName}</option>)}</select>
          <select className={input} value={resultForm.student_id} onChange={(e) => studentSelect(e.target.value)}><option value="">Student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input className={input} placeholder="Student name" value={resultForm.studentName} onChange={(e) => setResultForm({ ...resultForm, studentName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={resultForm.subject} onChange={(e) => setResultForm({ ...resultForm, subject: e.target.value })} required />
          <input className={input} type="number" placeholder="Marks" value={resultForm.marksObtained} onChange={(e) => setResultForm({ ...resultForm, marksObtained: e.target.value })} />
          <input className={input} type="number" placeholder="Total" value={resultForm.totalMarks} onChange={(e) => setResultForm({ ...resultForm, totalMarks: e.target.value })} />
          <input className={input} placeholder="Weak chapter" value={resultForm.weakChapter} onChange={(e) => setResultForm({ ...resultForm, weakChapter: e.target.value })} />
          <input className={input} placeholder="Action needed" value={resultForm.actionNeeded} onChange={(e) => setResultForm({ ...resultForm, actionNeeded: e.target.value })} />
        </FormCard>

        <FormCard title="Doubt Session" onSubmit={() => submit('Doubt session', () => createDoubtSession(doubtForm))} button="Plan Doubt">
          <input className={input} type="date" value={doubtForm.date} onChange={(e) => setDoubtForm({ ...doubtForm, date: e.target.value })} />
          <input className={input} placeholder="Batch" value={doubtForm.batchName} onChange={(e) => setDoubtForm({ ...doubtForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={doubtForm.subject} onChange={(e) => setDoubtForm({ ...doubtForm, subject: e.target.value })} required />
          <input className={input} placeholder="Topic" value={doubtForm.topic} onChange={(e) => setDoubtForm({ ...doubtForm, topic: e.target.value })} required />
          <select className={input} value={doubtForm.teacher_id} onChange={(e) => teacherSelect(e.target.value, setDoubtForm, doubtForm)}><option value="">Teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
          <input className={input} type="number" placeholder="Students assigned" value={doubtForm.studentsAssigned} onChange={(e) => setDoubtForm({ ...doubtForm, studentsAssigned: e.target.value })} />
        </FormCard>

        <FormCard title="Revision Planner" onSubmit={() => submit('Revision plan', () => createRevisionPlan(revisionForm))} button="Plan Revision">
          <input className={input} type="date" value={revisionForm.revisionDate} onChange={(e) => setRevisionForm({ ...revisionForm, revisionDate: e.target.value })} />
          <input className={input} placeholder="Batch" value={revisionForm.batchName} onChange={(e) => setRevisionForm({ ...revisionForm, batchName: e.target.value })} required />
          <input className={input} placeholder="Subject" value={revisionForm.subject} onChange={(e) => setRevisionForm({ ...revisionForm, subject: e.target.value })} required />
          <input className={input} placeholder="Chapter" value={revisionForm.chapter} onChange={(e) => setRevisionForm({ ...revisionForm, chapter: e.target.value })} required />
          <select className={input} value={revisionForm.teacher_id} onChange={(e) => teacherSelect(e.target.value, setRevisionForm, revisionForm)}><option value="">Teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
          <input className={input} placeholder="Material" value={revisionForm.material} onChange={(e) => setRevisionForm({ ...revisionForm, material: e.target.value })} />
        </FormCard>

        <FormCard title="Remedial Action" onSubmit={() => submit('Remedial action', () => createRemedialAction(remedialForm))} button="Create Action">
          <select className={input} onChange={(e) => studentSelect(e.target.value)}><option value="">Link student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input className={input} placeholder="Student / batch" value={remedialForm.targetName} onChange={(e) => setRemedialForm({ ...remedialForm, targetName: e.target.value })} required />
          <input className={input} placeholder="Issue" value={remedialForm.issue} onChange={(e) => setRemedialForm({ ...remedialForm, issue: e.target.value })} required />
          <input className={input} placeholder="Reason" value={remedialForm.reason} onChange={(e) => setRemedialForm({ ...remedialForm, reason: e.target.value })} />
          <input className={input} placeholder="Action" value={remedialForm.action} onChange={(e) => setRemedialForm({ ...remedialForm, action: e.target.value })} required />
          <input className={input} type="date" value={remedialForm.deadline} onChange={(e) => setRemedialForm({ ...remedialForm, deadline: e.target.value })} />
        </FormCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecordList title="Syllabus Tracker" rows={syllabus} fields={['courseName', 'subject', 'chapter', 'topic', 'status']} onDelete={isAdmin ? (id) => remove('Syllabus topic', () => deleteAcademicSyllabus(id)) : null} />
        <RecordList title="Calendar" rows={calendar} fields={['academicYear', 'calendarType', 'title', 'targetDate', 'status']} onDelete={isAdmin ? (id) => remove('Calendar item', () => deleteAcademicCalendar(id)) : null} />
        <RecordList title="Timetable" rows={timetable} fields={['batchName', 'subject', 'teacherName', 'dayOfWeek', 'timeSlot']} onDelete={isAdmin ? (id) => remove('Timetable', () => deleteAcademicTimetable(id)) : null} />
        <RecordList title="Lecture Plans" rows={lecturePlans} fields={['date', 'batchName', 'subject', 'topic', 'status']} onDelete={isAdmin ? (id) => remove('Lecture plan', () => deleteLecturePlan(id)) : null} />
        <RecordList title="Delivery Logs" rows={deliveryLogs} fields={['date', 'batchName', 'actualTopic', 'classAttendance', 'status']} onDelete={isAdmin ? (id) => remove('Delivery log', () => deleteClassDeliveryLog(id)) : null} />
        <RecordList title="Homework Pending" rows={homework} fields={['date', 'batchName', 'subject', 'pendingStudents', 'status']} onDelete={isAdmin ? (id) => remove('Homework', () => deleteHomeworkAssignment(id)) : null} />
        <RecordList title="Tests" rows={tests} fields={['testName', 'date', 'batchName', 'totalMarks', 'status']} onDelete={isAdmin ? (id) => remove('Test', () => deleteAcademicTest(id)) : null} />
        <RecordList title="Test Results" rows={results} fields={['studentName', 'testName', 'subject', 'marksObtained', 'accuracy']} onDelete={isAdmin ? (id) => remove('Test result', () => deleteStudentTestResult(id)) : null} />
        <RecordList title="Doubt Sessions" rows={doubts} fields={['date', 'batchName', 'subject', 'topic', 'status']} onDelete={isAdmin ? (id) => remove('Doubt session', () => deleteDoubtSession(id)) : null} />
        <RecordList title="Revision Plans" rows={revisions} fields={['revisionDate', 'batchName', 'subject', 'chapter', 'status']} onDelete={isAdmin ? (id) => remove('Revision plan', () => deleteRevisionPlan(id)) : null} />
        <RecordList title="Remedial Actions" rows={remedials} fields={['targetName', 'issue', 'action', 'deadline', 'status']} onDelete={isAdmin ? (id) => remove('Remedial action', () => deleteRemedialAction(id)) : null} />
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
