import React, { useEffect, useMemo, useState } from 'react';
import {
  createTeacher,
  createTeacherManagementAction,
  createTeacherWorkControl,
  deleteTeacher,
  deleteTeacherManagementAction,
  deleteTeacherWorkControl,
  fetchTeacherManagementActions,
  fetchTeacherWorkControls,
  fetchTeachers,
  updateTeacher,
  updateTeacherWorkControl,
} from '../api';
import { useAuth } from '../AuthContext';

const teacherStatuses = ['Active', 'Notice', 'Removed'];
const workTypes = ['Subject + Batch Assignment', 'Timetable', 'Monthly Lecture Plan', 'Daily Lecture Tracking', 'Syllabus Completion', 'Student Result Link', 'Student Feedback', 'Test Performance', 'Parent Complaint', 'Conduct', 'Documentation'];
const workStatuses = ['Open', 'In Progress', 'Completed', 'Issue', 'Escalated'];
const actionTypes = ['Salary Decision', 'Warning', 'Bonus / Appreciation', 'Replacement Planning'];
const warningLevels = ['', 'Level 1 - Verbal warning', 'Level 2 - Written warning', 'Level 3 - Final warning', 'Level 4 - Replacement / termination process'];
const salaryDecisions = ['', 'Salary released normally', 'Salary released + improvement note', 'Warning issued', 'Replacement planning', 'Deduction as per contract', 'Bonus / appreciation possible'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultTeacherForm() {
  return {
    name: '',
    subject: '',
    month: '',
    data: {
      course: '',
        qualification: '',
        experience: '',
        branch: 'Tembhurni',
        salary: '',
        accommodation: 'No',
      joiningDate: today(),
      contractPeriod: '',
        documents: { aadhaar: '', pan: '', certificates: '', experienceLetter: '', previousInstituteProof: '', addressProof: '', bankDetails: '', signedOfferLetter: '', appointmentLetter: '', policeVerification: '', demoLectureFeedback: '' },
      status: 'Active',
    },
  };
}

function defaultActionForm(teacherId = '') {
  return {
    teacher_id: teacherId,
    month: '',
    actionType: 'Salary Decision',
    warningLevel: '',
    reason: '',
    decision: '',
    salaryDecision: '',
    status: 'Open',
  };
}

function defaultControlForm(teacherId = '') {
  return {
    teacher_id: teacherId,
    controlType: 'Timetable',
    title: '',
    plannedValue: '',
    actualValue: '',
    status: 'Open',
    dueDate: today(),
    evidenceUrl: '',
    remarks: '',
  };
}

export default function Teachers() {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [controls, setControls] = useState([]);
  const [actions, setActions] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [teacherForm, setTeacherForm] = useState(defaultTeacherForm);
  const [controlForm, setControlForm] = useState(defaultControlForm);
  const [actionForm, setActionForm] = useState(defaultActionForm);
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editingControlId, setEditingControlId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(preferredId = selectedTeacherId) {
    setError('');
    try {
      const [teacherRows, controlRows, actionRows] = await Promise.all([fetchTeachers(), fetchTeacherWorkControls(), fetchTeacherManagementActions()]);
      setTeachers(teacherRows);
      setControls(controlRows);
      setActions(actionRows);
      const next = teacherRows.find((teacher) => String(teacher.id) === String(preferredId)) || teacherRows[0];
      if (next) {
        setSelectedTeacherId(String(next.id));
        setControlForm((current) => ({ ...current, teacher_id: String(next.id) }));
        setActionForm((current) => ({ ...current, teacher_id: String(next.id) }));
      }
    } catch (err) {
      setError(err.error || 'Could not load teachers');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTeacher = teachers.find((teacher) => String(teacher.id) === String(selectedTeacherId));
  const selectedControls = useMemo(() => (
    controls.filter((control) => String(control.teacher_id || control.teacherId) === String(selectedTeacherId))
  ), [controls, selectedTeacherId]);
  const selectedActions = useMemo(() => (
    actions.filter((action) => String(action.teacher_id || action.teacherId) === String(selectedTeacherId))
  ), [actions, selectedTeacherId]);

  function setDataField(field, value) {
    setTeacherForm((current) => ({ ...current, data: { ...current.data, [field]: value } }));
  }

  function setDocumentField(field, value) {
    setTeacherForm((current) => ({
      ...current,
      data: {
        ...current.data,
        documents: { ...(current.data.documents || {}), [field]: value },
      },
    }));
  }

  function startEditTeacher(teacher) {
    setEditingTeacherId(teacher.id);
    setSelectedTeacherId(String(teacher.id));
    setTeacherForm({
      name: teacher.name || '',
      subject: teacher.subject || '',
      month: teacher.month || '',
      data: {
        course: teacher.data?.course || '',
        qualification: teacher.data?.qualification || '',
        experience: teacher.data?.experience || '',
        branch: teacher.data?.branch || 'Tembhurni',
        salary: teacher.data?.salary || '',
        accommodation: teacher.data?.accommodation || 'No',
        joiningDate: teacher.data?.joiningDate || today(),
        contractPeriod: teacher.data?.contractPeriod || '',
        documents: {
          aadhaar: teacher.data?.documents?.aadhaar || '',
          pan: teacher.data?.documents?.pan || '',
          certificates: teacher.data?.documents?.certificates || '',
          experienceLetter: teacher.data?.documents?.experienceLetter || '',
          previousInstituteProof: teacher.data?.documents?.previousInstituteProof || '',
          addressProof: teacher.data?.documents?.addressProof || '',
          bankDetails: teacher.data?.documents?.bankDetails || '',
          signedOfferLetter: teacher.data?.documents?.signedOfferLetter || '',
          appointmentLetter: teacher.data?.documents?.appointmentLetter || '',
          policeVerification: teacher.data?.documents?.policeVerification || '',
          demoLectureFeedback: teacher.data?.documents?.demoLectureFeedback || '',
        },
        status: teacher.data?.status || 'Active',
      },
    });
  }

  function resetTeacherForm() {
    setEditingTeacherId(null);
    setTeacherForm(defaultTeacherForm());
  }

  async function handleSaveTeacher(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editingTeacherId) {
        await updateTeacher(editingTeacherId, teacherForm);
        setMessage('Teacher profile updated.');
        await load(editingTeacherId);
      } else {
        const created = await createTeacher(teacherForm);
        setMessage('Teacher profile created.');
        await load(created.id);
      }
      resetTeacherForm();
    } catch (err) {
      setError(err.error || 'Could not save teacher');
    }
  }

  function startEditControl(control) {
    setEditingControlId(control.id);
    setControlForm({
      teacher_id: control.teacher_id || control.teacherId,
      controlType: control.controlType || 'Timetable',
      title: control.title || '',
      plannedValue: control.plannedValue || '',
      actualValue: control.actualValue || '',
      status: control.status || 'Open',
      dueDate: control.dueDate || today(),
      evidenceUrl: control.evidenceUrl || '',
      remarks: control.remarks || '',
    });
  }

  function resetControlForm() {
    setEditingControlId(null);
    setControlForm(defaultControlForm(selectedTeacherId));
  }

  async function handleSaveControl(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      if (editingControlId) {
        await updateTeacherWorkControl(editingControlId, controlForm);
        setMessage('Work control updated.');
      } else {
        await createTeacherWorkControl(controlForm);
        setMessage('Work control added.');
      }
      resetControlForm();
      await load(selectedTeacherId);
    } catch (err) {
      setError(err.error || 'Could not save work control');
    }
  }

  async function handleDeleteTeacher() {
    if (!deleteId) return;
    await deleteTeacher(deleteId);
    setDeleteId(null);
    setMessage('Teacher deleted.');
    await load();
  }

  async function handleDeleteControl(id) {
    await deleteTeacherWorkControl(id);
    setMessage('Work control deleted.');
    await load(selectedTeacherId);
  }

  async function handleSaveAction(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await createTeacherManagementAction(actionForm);
      setMessage('Management action recorded.');
      setActionForm(defaultActionForm(selectedTeacherId));
      await load(selectedTeacherId);
    } catch (err) {
      setError(err.error || 'Could not save management action');
    }
  }

  async function handleDeleteAction(id) {
    await deleteTeacherManagementAction(id);
    setMessage('Management action deleted.');
    await load(selectedTeacherId);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Teacher Management</h2>
        <p className="mt-1 text-sm text-slate-600">Control teacher profile, salary, contract, conduct, lecture work, documents, and accountability.</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleSaveTeacher} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">{editingTeacherId ? 'Edit Teacher Profile' : 'Add Teacher Profile'}</h3>
          <div className="mt-4 grid gap-3">
            <input value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="Name" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={teacherForm.subject} onChange={(e) => setTeacherForm({ ...teacherForm, subject: e.target.value })} placeholder="Subject" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.course} onChange={(e) => setDataField('course', e.target.value)} placeholder="Course, e.g. NEET / Foundation" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.branch} onChange={(e) => setDataField('branch', e.target.value)} placeholder="Branch" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.qualification} onChange={(e) => setDataField('qualification', e.target.value)} placeholder="Qualification" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.experience} onChange={(e) => setDataField('experience', e.target.value)} placeholder="Experience" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.salary} onChange={(e) => setDataField('salary', e.target.value)} placeholder="Salary, e.g. Rs 30,000 + accommodation" className="rounded-md border px-3 py-2 text-sm" />
            <select value={teacherForm.data.accommodation} onChange={(e) => setDataField('accommodation', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option>Yes</option>
              <option>No</option>
            </select>
            <input type="date" value={teacherForm.data.joiningDate} onChange={(e) => setDataField('joiningDate', e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.contractPeriod} onChange={(e) => setDataField('contractPeriod', e.target.value)} placeholder="Contract period" className="rounded-md border px-3 py-2 text-sm" />
            <select value={teacherForm.data.status} onChange={(e) => setDataField('status', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              {teacherStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <input value={teacherForm.data.documents.aadhaar} onChange={(e) => setDocumentField('aadhaar', e.target.value)} placeholder="Aadhaar document status/link" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.pan} onChange={(e) => setDocumentField('pan', e.target.value)} placeholder="PAN document status/link" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.certificates} onChange={(e) => setDocumentField('certificates', e.target.value)} placeholder="Certificates status/link" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.experienceLetter} onChange={(e) => setDocumentField('experienceLetter', e.target.value)} placeholder="Experience letter" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.previousInstituteProof} onChange={(e) => setDocumentField('previousInstituteProof', e.target.value)} placeholder="Previous institute proof" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.addressProof} onChange={(e) => setDocumentField('addressProof', e.target.value)} placeholder="Address proof" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.bankDetails} onChange={(e) => setDocumentField('bankDetails', e.target.value)} placeholder="Bank details" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.signedOfferLetter} onChange={(e) => setDocumentField('signedOfferLetter', e.target.value)} placeholder="Signed offer letter" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.appointmentLetter} onChange={(e) => setDocumentField('appointmentLetter', e.target.value)} placeholder="Appointment letter" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.policeVerification} onChange={(e) => setDocumentField('policeVerification', e.target.value)} placeholder="Police verification" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.data.documents.demoLectureFeedback} onChange={(e) => setDocumentField('demoLectureFeedback', e.target.value)} placeholder="Demo lecture feedback" className="rounded-md border px-3 py-2 text-sm" />
            <input value={teacherForm.month} onChange={(e) => setTeacherForm({ ...teacherForm, month: e.target.value })} placeholder="Review month" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{editingTeacherId ? 'Update Teacher' : 'Add Teacher'}</button>
            {editingTeacherId ? <button type="button" onClick={resetTeacherForm} className="rounded-md border px-4 py-2 text-sm">Cancel</button> : null}
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Teacher Profiles</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {teachers.map((teacher) => (
              <div key={teacher.id} className={`rounded-xl border p-4 ${String(selectedTeacherId) === String(teacher.id) ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200'}`}>
                <button onClick={() => { setSelectedTeacherId(String(teacher.id)); setControlForm((current) => ({ ...current, teacher_id: String(teacher.id) })); }} className="w-full text-left">
                  <p className="text-sm opacity-75">{teacher.subject || '-'}</p>
                  <h4 className="mt-1 font-semibold">{teacher.name}</h4>
                  <p className="mt-1 text-sm opacity-75">{teacher.data?.course || '-'} - {teacher.data?.status || 'Active'}</p>
                  <p className="mt-1 text-sm opacity-75">{teacher.data?.branch || '-'} | {teacher.data?.qualification || '-'} | {teacher.data?.experience || '-'}</p>
                </button>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => startEditTeacher(teacher)} className={`rounded-md px-3 py-1 text-sm ${String(selectedTeacherId) === String(teacher.id) ? 'border border-slate-600' : 'border'}`}>Edit</button>
                  {isAdmin ? <button onClick={() => setDeleteId(teacher.id)} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button> : null}
                </div>
              </div>
            ))}
            {!teachers.length ? <p className="text-sm text-slate-500">No teachers yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleSaveControl} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">{editingControlId ? 'Edit Work Control' : 'Add Work Control'}</h3>
          <div className="mt-4 grid gap-3">
            <select value={controlForm.teacher_id} onChange={(e) => setControlForm({ ...controlForm, teacher_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select teacher</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
            <select value={controlForm.controlType} onChange={(e) => setControlForm({ ...controlForm, controlType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {workTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input value={controlForm.title} onChange={(e) => setControlForm({ ...controlForm, title: e.target.value })} placeholder="Title" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={controlForm.plannedValue} onChange={(e) => setControlForm({ ...controlForm, plannedValue: e.target.value })} placeholder="Planned" className="rounded-md border px-3 py-2 text-sm" />
            <input value={controlForm.actualValue} onChange={(e) => setControlForm({ ...controlForm, actualValue: e.target.value })} placeholder="Actual" className="rounded-md border px-3 py-2 text-sm" />
            <select value={controlForm.status} onChange={(e) => setControlForm({ ...controlForm, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {workStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <input type="date" value={controlForm.dueDate} onChange={(e) => setControlForm({ ...controlForm, dueDate: e.target.value })} className="rounded-md border px-3 py-2 text-sm" />
            <input value={controlForm.evidenceUrl} onChange={(e) => setControlForm({ ...controlForm, evidenceUrl: e.target.value })} placeholder="Evidence link / document" className="rounded-md border px-3 py-2 text-sm" />
            <input value={controlForm.remarks} onChange={(e) => setControlForm({ ...controlForm, remarks: e.target.value })} placeholder="Remarks" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{editingControlId ? 'Update Control' : 'Add Control'}</button>
            {editingControlId ? <button type="button" onClick={resetControlForm} className="rounded-md border px-4 py-2 text-sm">Cancel</button> : null}
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Work Control: {selectedTeacher?.name || 'Select teacher'}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedControls.map((control) => (
              <div key={control.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">{control.controlType} - {control.status}</p>
                <h4 className="mt-1 font-semibold">{control.title}</h4>
                <p className="mt-2 text-sm text-slate-600">Planned: {control.plannedValue || '-'}</p>
                <p className="text-sm text-slate-600">Actual: {control.actualValue || '-'}</p>
                <p className="text-sm text-slate-500">Due: {control.dueDate || '-'}</p>
                {control.remarks ? <p className="mt-2 text-sm text-slate-600">{control.remarks}</p> : null}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => startEditControl(control)} className="rounded-md border px-3 py-1 text-sm">Edit</button>
                  {isAdmin ? <button onClick={() => handleDeleteControl(control.id)} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button> : null}
                </div>
              </div>
            ))}
            {!selectedControls.length ? <p className="text-sm text-slate-500">No work controls for this teacher yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={handleSaveAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Warning / Bonus / Salary Decision</h3>
          <div className="mt-4 grid gap-3">
            <select value={actionForm.teacher_id} onChange={(e) => setActionForm({ ...actionForm, teacher_id: e.target.value })} className="rounded-md border px-3 py-2 text-sm" required>
              <option value="">Select teacher</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
            <input value={actionForm.month} onChange={(e) => setActionForm({ ...actionForm, month: e.target.value })} placeholder="Month, e.g. July 2026" className="rounded-md border px-3 py-2 text-sm" />
            <select value={actionForm.actionType} onChange={(e) => setActionForm({ ...actionForm, actionType: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {actionTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={actionForm.warningLevel} onChange={(e) => setActionForm({ ...actionForm, warningLevel: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {warningLevels.map((level) => <option key={level} value={level}>{level || 'No warning level'}</option>)}
            </select>
            <select value={actionForm.salaryDecision} onChange={(e) => setActionForm({ ...actionForm, salaryDecision: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {salaryDecisions.map((decision) => <option key={decision} value={decision}>{decision || 'No salary decision'}</option>)}
            </select>
            <input value={actionForm.reason} onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })} placeholder="Reason" className="rounded-md border px-3 py-2 text-sm" required />
            <input value={actionForm.decision} onChange={(e) => setActionForm({ ...actionForm, decision: e.target.value })} placeholder="Decision / next action" className="rounded-md border px-3 py-2 text-sm" />
            <select value={actionForm.status} onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              <option>Open</option>
              <option>Closed</option>
              <option>Monitoring</option>
            </select>
          </div>
          <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Record Action</button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Management Decisions: {selectedTeacher?.name || 'Select teacher'}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedActions.map((action) => (
              <div key={action.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">{action.month || '-'} - {action.actionType} - {action.status}</p>
                <h4 className="mt-1 font-semibold">{action.reason}</h4>
                {action.warningLevel ? <p className="mt-2 text-sm text-slate-600">{action.warningLevel}</p> : null}
                {action.salaryDecision ? <p className="text-sm text-slate-600">{action.salaryDecision}</p> : null}
                {action.decision ? <p className="text-sm text-slate-600">{action.decision}</p> : null}
                <p className="mt-2 text-xs text-slate-500">By {action.decidedBy || '-'} on {action.decidedAt || '-'}</p>
                {isAdmin ? <button onClick={() => handleDeleteAction(action.id)} className="mt-3 rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button> : null}
              </div>
            ))}
            {!selectedActions.length ? <p className="text-sm text-slate-500">No management decisions for this teacher yet.</p> : null}
          </div>
        </div>
      </div>

      {deleteId ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-950">Delete this teacher?</p>
          <p className="mt-1 text-sm text-slate-600">This removes linked reviews, staff attendance, leave requests, and work controls.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={handleDeleteTeacher} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">Delete</button>
            <button onClick={() => setDeleteId(null)} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
