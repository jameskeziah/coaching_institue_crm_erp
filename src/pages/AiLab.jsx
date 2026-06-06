import React, { useEffect, useMemo, useState } from 'react';
import {
  createAiLabAssignment,
  createAiLabAttendance,
  createAiLabCertificate,
  createAiLabCourse,
  createAiLabDevice,
  createAiLabDeviceAllocation,
  createAiLabFeedback,
  createAiLabPortfolio,
  createAiLabProject,
  createAiLabStudent,
  deleteAiLabAssignment,
  deleteAiLabAttendance,
  deleteAiLabCertificate,
  deleteAiLabCourse,
  deleteAiLabDevice,
  deleteAiLabDeviceAllocation,
  deleteAiLabFeedback,
  deleteAiLabPortfolio,
  deleteAiLabProject,
  deleteAiLabStudent,
  fetchAiLabAssignments,
  fetchAiLabAttendance,
  fetchAiLabCertificates,
  fetchAiLabCourses,
  fetchAiLabDashboard,
  fetchAiLabDevices,
  fetchAiLabFeedback,
  fetchAiLabPortfolios,
  fetchAiLabProjects,
  fetchAiLabStudents,
  fetchStudents,
  fetchTeachers,
} from '../api';
import { useAuth } from '../AuthContext';

const courseCategories = ['Python Programming', 'Web Development', 'Data Science', 'Machine Learning', 'Artificial Intelligence', 'Robotics', 'LLM / GenAI', 'Computer Basics'];
const studentStatuses = ['Active', 'Completed', 'Dropout'];
const attendanceStatuses = ['Present', 'Absent', 'Late'];
const projectStatuses = ['Idea Stage', 'Planning', 'Development', 'Mentor Review', 'Correction Needed', 'Demo Ready', 'Completed'];
const assignmentStatuses = ['Assigned', 'Submitted', 'Late', 'Resubmit'];
const deviceTypes = ['Desktop Computer', 'Laptop', 'Tablet', 'Robotics Kit', 'Projector', 'Camera', 'Headphones', 'Internet Device'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function metric(value, suffix = '') {
  return `${Number(value || 0)}${suffix}`;
}

function emptyCourse() {
  return {
    courseName: '',
    category: 'Python Programming',
    suitableFor: 'Class 6th onwards',
    duration: '3 months',
    exampleTopics: '',
    status: 'Active',
    modulesText: 'Module 1: Computer basics, IDE setup\nModule 2: Variables, loops\nModule 3: Mini project',
  };
}

export default function AiLab() {
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [courses, setCourses] = useState([]);
  const [labStudents, setLabStudents] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [deviceData, setDeviceData] = useState({ devices: [], allocations: [] });
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [courseForm, setCourseForm] = useState(emptyCourse());
  const [studentForm, setStudentForm] = useState({
    student_id: '',
    studentName: '',
    grade: '8th',
    school: '',
    parentName: '',
    mobileNumber: '',
    course_id: '',
    courseName: '',
    batch: 'AI Lab Weekend',
    joiningDate: today(),
    courseDuration: '3 months',
    feeType: 'Monthly',
    deviceRequired: true,
    previousCodingExperience: 'Beginner',
    skillLevel: 1,
    skillAssessment: 'Computer basics, typing, logic, maths basics, coding exposure',
    status: 'Active',
  });
  const [attendanceForm, setAttendanceForm] = useState({ ai_lab_student_id: '', course_id: '', date: today(), sessionType: 'Practical', mentor_id: '', mentorName: '', status: 'Present', deviceUsed: '', topicPracticed: '', assignmentGiven: true, parentAlert: 'Not Sent', remarks: '' });
  const [deviceForm, setDeviceForm] = useState({ deviceId: '', deviceType: 'Desktop Computer', name: '', branch: 'Tembhurni', condition: 'Working', status: 'Available', purchaseDate: today(), notes: '' });
  const [allocationForm, setAllocationForm] = useState({ device_id: '', ai_lab_student_id: '', course_id: '', date: today(), sessionTime: '5 PM - 6 PM', conditionBefore: 'Working', conditionAfter: 'Working', damageReported: false, mentorVerified: true, remarks: '' });
  const [projectForm, setProjectForm] = useState({ ai_lab_student_id: '', course_id: '', mentor_id: '', projectName: '', projectType: 'Mini Project', startDate: today(), deadline: today(), status: 'Idea Stage', githubLink: '', demoVideo: '', finalScore: 0, finalDemoStatus: 'Pending', remarks: '' });
  const [assignmentForm, setAssignmentForm] = useState({ ai_lab_student_id: '', course_id: '', assignmentName: '', assignmentType: 'Code File', dueDate: today(), submissionDate: '', fileUploaded: false, githubLink: '', mentorFeedback: '', score: 0, status: 'Assigned' });
  const [feedbackForm, setFeedbackForm] = useState({ ai_lab_student_id: '', course_id: '', mentor_id: '', date: today(), logic: 0, coding: 0, debugging: 0, creativity: 0, presentation: 0, discipline: 0, independence: 0, projectWork: 0, remarks: '' });
  const [portfolioForm, setPortfolioForm] = useState({ ai_lab_student_id: '', githubUsername: '', projectRepository: '', demoVideo: '', portfolioPage: '', certificateLink: '', linkedinProfile: '', status: 'Pending' });
  const [certificateForm, setCertificateForm] = useState({ ai_lab_student_id: '', course_id: '', projectName: '', issueDate: today(), directorSignature: 'Yes', qrVerification: 'Yes', status: 'Pending' });

  async function load() {
    setError('');
    try {
      const [dash, courseRows, labStudentRows, studentRows, teacherRows, attendanceRows, devices, projectRows, assignmentRows, feedbackRows, portfolioRows, certificateRows] = await Promise.all([
        fetchAiLabDashboard(),
        fetchAiLabCourses(),
        fetchAiLabStudents(),
        fetchStudents(),
        fetchTeachers(),
        fetchAiLabAttendance(),
        fetchAiLabDevices(),
        fetchAiLabProjects(),
        fetchAiLabAssignments(),
        fetchAiLabFeedback(),
        fetchAiLabPortfolios(),
        fetchAiLabCertificates(),
      ]);
      setDashboard(dash);
      setCourses(courseRows);
      setLabStudents(labStudentRows);
      setStudents(studentRows);
      setTeachers(teacherRows);
      setAttendance(attendanceRows);
      setDeviceData(devices);
      setProjects(projectRows);
      setAssignments(assignmentRows);
      setFeedback(feedbackRows);
      setPortfolios(portfolioRows);
      setCertificates(certificateRows);
    } catch (err) {
      setError(err.error || 'Could not load AI Lab data');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedCourseName = useMemo(() => courses.find((course) => String(course.id) === String(studentForm.course_id))?.courseName || studentForm.courseName, [courses, studentForm.course_id, studentForm.courseName]);
  const selectedStudent = useMemo(() => students.find((student) => String(student.id) === String(studentForm.student_id)), [students, studentForm.student_id]);

  function parseModules(text) {
    return String(text || '')
      .split('\n')
      .map((line, index) => {
        const parts = line.split(':');
        return { moduleOrder: index + 1, moduleName: (parts[0] || `Module ${index + 1}`).trim(), topics: parts.slice(1).join(':').trim(), status: index === 0 ? 'In Progress' : 'Pending' };
      })
      .filter((module) => module.moduleName || module.topics);
  }

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

  async function handleCourse(e) {
    e.preventDefault();
    await submit('Course', async () => {
      await createAiLabCourse({ ...courseForm, modules: parseModules(courseForm.modulesText) });
      setCourseForm(emptyCourse());
    });
  }

  async function handleStudent(e) {
    e.preventDefault();
    await submit('AI Lab student', async () => {
      await createAiLabStudent({ ...studentForm, courseName: selectedCourseName });
      setStudentForm({ ...studentForm, student_id: '', studentName: '', school: '', parentName: '', mobileNumber: '', skillAssessment: '', status: 'Active' });
    });
  }

  function syncStudent(id) {
    const student = students.find((item) => String(item.id) === String(id));
    setStudentForm({
      ...studentForm,
      student_id: id,
      studentName: student?.name || '',
      grade: student?.grade || studentForm.grade,
      school: student?.data?.school || '',
      parentName: student?.data?.fatherName || student?.data?.motherName || '',
      mobileNumber: student?.data?.primaryPhone || student?.data?.whatsapp || '',
    });
  }

  function bindCourse(id, setter, form) {
    const course = courses.find((item) => String(item.id) === String(id));
    setter({ ...form, course_id: id, courseName: course?.courseName || form.courseName });
  }

  const cardClass = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
  const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500';
  const buttonClass = 'rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800';
  const ghostButton = 'rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100';

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">AI Lab Management</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">AI / ML / Robotics Lab</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Manage AI Lab enrollments, practical attendance, projects, devices, assignments, mentor feedback, certificates, and portfolios.</p>
          </div>
          <button className={ghostButton} onClick={load}>Refresh</button>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['AI Lab Students', dashboard?.totals?.students],
          ['Attendance', dashboard?.totals?.attendancePercent, '%'],
          ['Assignment Completion', dashboard?.totals?.assignmentCompletion, '%'],
          ['Portfolio Completion', dashboard?.totals?.portfolioCompletion, '%'],
          ['Projects Complete', dashboard?.totals?.projectCompletion, '%'],
          ['Devices In Use', dashboard?.totals?.devicesInUse],
          ['Certificates Pending', dashboard?.totals?.certificatesPending],
          ['Dropout Rate', dashboard?.totals?.dropoutRate, '%'],
        ].map(([label, value, suffix]) => (
          <div className={cardClass} key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{metric(value, suffix)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <form className={cardClass} onSubmit={handleStudent}>
          <h2 className="text-lg font-bold text-slate-950">Student Enrollment</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select className={inputClass} value={studentForm.student_id} onChange={(e) => syncStudent(e.target.value)}>
              <option value="">Manual student</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
            <input className={inputClass} placeholder="Student name" value={studentForm.studentName} onChange={(e) => setStudentForm({ ...studentForm, studentName: e.target.value })} required />
            <input className={inputClass} placeholder="Class" value={studentForm.grade} onChange={(e) => setStudentForm({ ...studentForm, grade: e.target.value })} />
            <input className={inputClass} placeholder="School" value={studentForm.school} onChange={(e) => setStudentForm({ ...studentForm, school: e.target.value })} />
            <input className={inputClass} placeholder="Parent name" value={studentForm.parentName} onChange={(e) => setStudentForm({ ...studentForm, parentName: e.target.value })} />
            <input className={inputClass} placeholder="Mobile number" value={studentForm.mobileNumber} onChange={(e) => setStudentForm({ ...studentForm, mobileNumber: e.target.value })} />
            <select className={inputClass} value={studentForm.course_id} onChange={(e) => bindCourse(e.target.value, setStudentForm, studentForm)}>
              <option value="">Select course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.courseName}</option>)}
            </select>
            <input className={inputClass} placeholder="Course name" value={studentForm.courseName} onChange={(e) => setStudentForm({ ...studentForm, courseName: e.target.value })} required={!studentForm.course_id} />
            <input className={inputClass} placeholder="Batch" value={studentForm.batch} onChange={(e) => setStudentForm({ ...studentForm, batch: e.target.value })} />
            <input className={inputClass} type="date" value={studentForm.joiningDate} onChange={(e) => setStudentForm({ ...studentForm, joiningDate: e.target.value })} />
            <input className={inputClass} placeholder="Course duration" value={studentForm.courseDuration} onChange={(e) => setStudentForm({ ...studentForm, courseDuration: e.target.value })} />
            <select className={inputClass} value={studentForm.feeType} onChange={(e) => setStudentForm({ ...studentForm, feeType: e.target.value })}>
              <option>Monthly</option>
              <option>Course-wise</option>
            </select>
            <select className={inputClass} value={studentForm.previousCodingExperience} onChange={(e) => setStudentForm({ ...studentForm, previousCodingExperience: e.target.value })}>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
            <input className={inputClass} type="number" min="0" max="5" value={studentForm.skillLevel} onChange={(e) => setStudentForm({ ...studentForm, skillLevel: e.target.value })} />
            <select className={inputClass} value={studentForm.status} onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value })}>
              {studentStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={studentForm.deviceRequired} onChange={(e) => setStudentForm({ ...studentForm, deviceRequired: e.target.checked })} />
              Device required
            </label>
            <textarea className={`${inputClass} md:col-span-2`} placeholder="Skill assessment notes" value={studentForm.skillAssessment} onChange={(e) => setStudentForm({ ...studentForm, skillAssessment: e.target.value })} />
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Enroll Student</button>
          {selectedStudent && <p className="mt-3 text-xs text-slate-500">Linked to student record: {selectedStudent.name}</p>}
        </form>

        <form className={cardClass} onSubmit={handleCourse}>
          <h2 className="text-lg font-bold text-slate-950">Course And Modules</h2>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} placeholder="Course name" value={courseForm.courseName} onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })} required />
            <select className={inputClass} value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}>
              {courseCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input className={inputClass} placeholder="Suitable for" value={courseForm.suitableFor} onChange={(e) => setCourseForm({ ...courseForm, suitableFor: e.target.value })} />
              <input className={inputClass} placeholder="Duration" value={courseForm.duration} onChange={(e) => setCourseForm({ ...courseForm, duration: e.target.value })} />
            </div>
            <input className={inputClass} placeholder="Example topics" value={courseForm.exampleTopics} onChange={(e) => setCourseForm({ ...courseForm, exampleTopics: e.target.value })} />
            <textarea className={inputClass} rows="5" value={courseForm.modulesText} onChange={(e) => setCourseForm({ ...courseForm, modulesText: e.target.value })} />
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Create Course</button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Lab attendance', async () => createAiLabAttendance(attendanceForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Lab Attendance</h2>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={attendanceForm.ai_lab_student_id} onChange={(e) => setAttendanceForm({ ...attendanceForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <select className={inputClass} value={attendanceForm.course_id} onChange={(e) => setAttendanceForm({ ...attendanceForm, course_id: e.target.value })}>
              <option value="">Course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.courseName}</option>)}
            </select>
            <input className={inputClass} type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })} />
            <select className={inputClass} value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}>
              {attendanceStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select className={inputClass} value={attendanceForm.mentor_id} onChange={(e) => {
              const teacher = teachers.find((item) => String(item.id) === e.target.value);
              setAttendanceForm({ ...attendanceForm, mentor_id: e.target.value, mentorName: teacher?.name || '' });
            }}>
              <option value="">Mentor</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
            <input className={inputClass} placeholder="Device used" value={attendanceForm.deviceUsed} onChange={(e) => setAttendanceForm({ ...attendanceForm, deviceUsed: e.target.value })} />
            <input className={inputClass} placeholder="Topic practiced" value={attendanceForm.topicPracticed} onChange={(e) => setAttendanceForm({ ...attendanceForm, topicPracticed: e.target.value })} />
            <select className={inputClass} value={attendanceForm.parentAlert} onChange={(e) => setAttendanceForm({ ...attendanceForm, parentAlert: e.target.value })}>
              <option>Not Sent</option>
              <option>Sent</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Mark Attendance</button>
        </form>

        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Device', async () => createAiLabDevice(deviceForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Device Register</h2>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} placeholder="Device ID, e.g. PC-001" value={deviceForm.deviceId} onChange={(e) => setDeviceForm({ ...deviceForm, deviceId: e.target.value })} required />
            <select className={inputClass} value={deviceForm.deviceType} onChange={(e) => setDeviceForm({ ...deviceForm, deviceType: e.target.value })}>
              {deviceTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input className={inputClass} placeholder="Device name" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} />
            <input className={inputClass} placeholder="Branch" value={deviceForm.branch} onChange={(e) => setDeviceForm({ ...deviceForm, branch: e.target.value })} />
            <input className={inputClass} placeholder="Condition" value={deviceForm.condition} onChange={(e) => setDeviceForm({ ...deviceForm, condition: e.target.value })} />
            <select className={inputClass} value={deviceForm.status} onChange={(e) => setDeviceForm({ ...deviceForm, status: e.target.value })}>
              <option>Available</option>
              <option>In Use</option>
              <option>Repair</option>
              <option>Retired</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Add Device</button>
        </form>

        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Device allocation', async () => createAiLabDeviceAllocation(allocationForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Device Allocation</h2>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={allocationForm.device_id} onChange={(e) => setAllocationForm({ ...allocationForm, device_id: e.target.value })} required>
              <option value="">Device</option>
              {deviceData.devices.map((device) => <option key={device.id} value={device.id}>{device.deviceId} - {device.deviceType}</option>)}
            </select>
            <select className={inputClass} value={allocationForm.ai_lab_student_id} onChange={(e) => setAllocationForm({ ...allocationForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <input className={inputClass} type="date" value={allocationForm.date} onChange={(e) => setAllocationForm({ ...allocationForm, date: e.target.value })} />
            <input className={inputClass} placeholder="Session time" value={allocationForm.sessionTime} onChange={(e) => setAllocationForm({ ...allocationForm, sessionTime: e.target.value })} />
            <input className={inputClass} placeholder="Condition before" value={allocationForm.conditionBefore} onChange={(e) => setAllocationForm({ ...allocationForm, conditionBefore: e.target.value })} />
            <input className={inputClass} placeholder="Condition after" value={allocationForm.conditionAfter} onChange={(e) => setAllocationForm({ ...allocationForm, conditionAfter: e.target.value })} />
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Allocate Device</button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Project', async () => createAiLabProject(projectForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Project Tracking</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select className={inputClass} value={projectForm.ai_lab_student_id} onChange={(e) => setProjectForm({ ...projectForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <select className={inputClass} value={projectForm.course_id} onChange={(e) => setProjectForm({ ...projectForm, course_id: e.target.value })}>
              <option value="">Course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.courseName}</option>)}
            </select>
            <input className={inputClass} placeholder="Project name" value={projectForm.projectName} onChange={(e) => setProjectForm({ ...projectForm, projectName: e.target.value })} required />
            <select className={inputClass} value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}>
              {projectStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <input className={inputClass} type="date" value={projectForm.startDate} onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })} />
            <input className={inputClass} type="date" value={projectForm.deadline} onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })} />
            <input className={inputClass} placeholder="GitHub link" value={projectForm.githubLink} onChange={(e) => setProjectForm({ ...projectForm, githubLink: e.target.value })} />
            <input className={inputClass} placeholder="Demo video" value={projectForm.demoVideo} onChange={(e) => setProjectForm({ ...projectForm, demoVideo: e.target.value })} />
            <input className={inputClass} type="number" placeholder="Final score" value={projectForm.finalScore} onChange={(e) => setProjectForm({ ...projectForm, finalScore: e.target.value })} />
            <select className={inputClass} value={projectForm.finalDemoStatus} onChange={(e) => setProjectForm({ ...projectForm, finalDemoStatus: e.target.value })}>
              <option>Pending</option>
              <option>Demo Ready</option>
              <option>Completed</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Save Project</button>
        </form>

        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Assignment', async () => createAiLabAssignment(assignmentForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Assignment Upload Log</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select className={inputClass} value={assignmentForm.ai_lab_student_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <input className={inputClass} placeholder="Assignment name" value={assignmentForm.assignmentName} onChange={(e) => setAssignmentForm({ ...assignmentForm, assignmentName: e.target.value })} required />
            <select className={inputClass} value={assignmentForm.assignmentType} onChange={(e) => setAssignmentForm({ ...assignmentForm, assignmentType: e.target.value })}>
              <option>Code File</option>
              <option>Notebook</option>
              <option>Report</option>
              <option>Screenshot</option>
              <option>Video</option>
              <option>GitHub Link</option>
              <option>Dataset</option>
              <option>Circuit Diagram</option>
            </select>
            <select className={inputClass} value={assignmentForm.status} onChange={(e) => setAssignmentForm({ ...assignmentForm, status: e.target.value })}>
              {assignmentStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <input className={inputClass} type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} />
            <input className={inputClass} type="date" value={assignmentForm.submissionDate} onChange={(e) => setAssignmentForm({ ...assignmentForm, submissionDate: e.target.value })} />
            <input className={inputClass} placeholder="GitHub/file link" value={assignmentForm.githubLink} onChange={(e) => setAssignmentForm({ ...assignmentForm, githubLink: e.target.value })} />
            <input className={inputClass} type="number" placeholder="Score" value={assignmentForm.score} onChange={(e) => setAssignmentForm({ ...assignmentForm, score: e.target.value })} />
            <textarea className={`${inputClass} md:col-span-2`} placeholder="Mentor feedback" value={assignmentForm.mentorFeedback} onChange={(e) => setAssignmentForm({ ...assignmentForm, mentorFeedback: e.target.value })} />
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Save Assignment</button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Mentor feedback', async () => createAiLabFeedback(feedbackForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Mentor Feedback</h2>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={feedbackForm.ai_lab_student_id} onChange={(e) => setFeedbackForm({ ...feedbackForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <input className={inputClass} type="date" value={feedbackForm.date} onChange={(e) => setFeedbackForm({ ...feedbackForm, date: e.target.value })} />
            {['logic', 'coding', 'debugging', 'creativity', 'presentation', 'discipline', 'independence', 'projectWork'].map((field) => (
              <input key={field} className={inputClass} type="number" min="0" max="10" placeholder={field} value={feedbackForm[field]} onChange={(e) => setFeedbackForm({ ...feedbackForm, [field]: e.target.value })} />
            ))}
            <textarea className={inputClass} placeholder="Remarks" value={feedbackForm.remarks} onChange={(e) => setFeedbackForm({ ...feedbackForm, remarks: e.target.value })} />
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Save Feedback</button>
        </form>

        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Portfolio', async () => createAiLabPortfolio(portfolioForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Portfolio Builder</h2>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={portfolioForm.ai_lab_student_id} onChange={(e) => setPortfolioForm({ ...portfolioForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <input className={inputClass} placeholder="GitHub username" value={portfolioForm.githubUsername} onChange={(e) => setPortfolioForm({ ...portfolioForm, githubUsername: e.target.value })} />
            <input className={inputClass} placeholder="Project repository" value={portfolioForm.projectRepository} onChange={(e) => setPortfolioForm({ ...portfolioForm, projectRepository: e.target.value })} />
            <input className={inputClass} placeholder="Demo video" value={portfolioForm.demoVideo} onChange={(e) => setPortfolioForm({ ...portfolioForm, demoVideo: e.target.value })} />
            <input className={inputClass} placeholder="Portfolio page" value={portfolioForm.portfolioPage} onChange={(e) => setPortfolioForm({ ...portfolioForm, portfolioPage: e.target.value })} />
            <select className={inputClass} value={portfolioForm.status} onChange={(e) => setPortfolioForm({ ...portfolioForm, status: e.target.value })}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Complete</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Save Portfolio</button>
        </form>

        <form className={cardClass} onSubmit={(e) => { e.preventDefault(); submit('Certificate', async () => createAiLabCertificate(certificateForm)); }}>
          <h2 className="text-lg font-bold text-slate-950">Certificate Control</h2>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={certificateForm.ai_lab_student_id} onChange={(e) => setCertificateForm({ ...certificateForm, ai_lab_student_id: e.target.value })} required>
              <option value="">Student</option>
              {labStudents.map((student) => <option key={student.id} value={student.id}>{student.studentName}</option>)}
            </select>
            <select className={inputClass} value={certificateForm.course_id} onChange={(e) => setCertificateForm({ ...certificateForm, course_id: e.target.value })} required>
              <option value="">Course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.courseName}</option>)}
            </select>
            <input className={inputClass} placeholder="Project name" value={certificateForm.projectName} onChange={(e) => setCertificateForm({ ...certificateForm, projectName: e.target.value })} />
            <input className={inputClass} type="date" value={certificateForm.issueDate} onChange={(e) => setCertificateForm({ ...certificateForm, issueDate: e.target.value })} />
            <select className={inputClass} value={certificateForm.status} onChange={(e) => setCertificateForm({ ...certificateForm, status: e.target.value })}>
              <option>Pending</option>
              <option>Eligible</option>
              <option>Issued</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-4`} type="submit">Generate Certificate ID</button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecordList title="AI Lab Students" rows={labStudents} fields={['studentName', 'courseName', 'batch', 'skillLevel', 'status']} onDelete={isAdmin ? (id) => remove('AI Lab student', () => deleteAiLabStudent(id)) : null} />
        <RecordList title="Courses" rows={courses} fields={['courseName', 'category', 'duration', 'status']} onDelete={isAdmin ? (id) => remove('Course', () => deleteAiLabCourse(id)) : null} />
        <RecordList title="Attendance" rows={attendance} fields={['studentName', 'courseName', 'date', 'status', 'deviceUsed']} onDelete={isAdmin ? (id) => remove('Attendance', () => deleteAiLabAttendance(id)) : null} />
        <RecordList title="Devices" rows={deviceData.devices} fields={['deviceId', 'deviceType', 'condition', 'status']} onDelete={isAdmin ? (id) => remove('Device', () => deleteAiLabDevice(id)) : null} />
        <RecordList title="Device Usage" rows={deviceData.allocations} fields={['deviceId', 'studentName', 'date', 'sessionTime', 'conditionAfter']} onDelete={isAdmin ? (id) => remove('Device allocation', () => deleteAiLabDeviceAllocation(id)) : null} />
        <RecordList title="Projects" rows={projects} fields={['projectName', 'studentName', 'status', 'finalDemoStatus', 'finalScore']} onDelete={isAdmin ? (id) => remove('Project', () => deleteAiLabProject(id)) : null} />
        <RecordList title="Assignments" rows={assignments} fields={['assignmentName', 'studentName', 'status', 'score', 'dueDate']} onDelete={isAdmin ? (id) => remove('Assignment', () => deleteAiLabAssignment(id)) : null} />
        <RecordList title="Mentor Feedback" rows={feedback} fields={['studentName', 'date', 'totalScore', 'remarks']} onDelete={isAdmin ? (id) => remove('Feedback', () => deleteAiLabFeedback(id)) : null} />
        <RecordList title="Portfolios" rows={portfolios} fields={['studentName', 'githubUsername', 'projectRepository', 'status']} onDelete={isAdmin ? (id) => remove('Portfolio', () => deleteAiLabPortfolio(id)) : null} />
        <RecordList title="Certificates" rows={certificates} fields={['certificateId', 'studentName', 'courseName', 'issueDate', 'status']} onDelete={isAdmin ? (id) => remove('Certificate', () => deleteAiLabCertificate(id)) : null} />
      </section>
    </div>
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
        {rows.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No records yet.</p>
        ) : (
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
