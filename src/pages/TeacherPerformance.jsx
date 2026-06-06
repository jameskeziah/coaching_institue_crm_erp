import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save, Download, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  createTeacher,
  deleteTeacherReview,
  deleteTeacher as removeTeacher,
  fetchTeacherReviews,
  fetchTeachers,
  saveTeacherReview,
  updateTeacher,
} from '../api';
import { useAuth } from '../AuthContext';

const KPI_AREAS = [
  {
    key: 'attendance',
    area: 'Attendance & Punctuality',
    kpi: 'Late marks, absenteeism, replacement needed',
    weight: 15,
  },
  {
    key: 'syllabus',
    area: 'Syllabus Completion',
    kpi: 'Topic completion as per academic plan',
    weight: 20,
  },
  {
    key: 'classQuality',
    area: 'Class Quality',
    kpi: 'Observation by academic head',
    weight: 20,
  },
  {
    key: 'studentImprovement',
    area: 'Student Improvement',
    kpi: 'Test-score improvement, homework completion',
    weight: 20,
  },
  {
    key: 'discipline',
    area: 'Discipline & Conduct',
    kpi: 'Behaviour with students, parents, staff',
    weight: 15,
  },
  {
    key: 'documentation',
    area: 'Documentation',
    kpi: 'Attendance, test marks, lecture plan submission',
    weight: 10,
  },
];

const emptyScores = KPI_AREAS.reduce((acc, item) => {
  acc[item.key] = { score: 7, evidence: '', remarks: '' };
  return acc;
}, {});

function cloneEmptyScores() {
  return JSON.parse(JSON.stringify(emptyScores));
}

function normalizeScores(scores) {
  const normalized = cloneEmptyScores();
  Object.entries(scores || {}).forEach(([key, value]) => {
    normalized[key] = {
      ...normalized[key],
      ...(value || {}),
    };
  });
  return normalized;
}

function currentMonthLabel() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatDate(value) {
  if (!value) return 'Not saved';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function nextMonthLabel(label) {
  const [monthName, year] = label.split(' ');
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const nextDate = new Date(Number(year), monthIndex + 1, 1);
  return `${nextDate.toLocaleString('en-US', { month: 'long' })} ${nextDate.getFullYear()}`;
}

function calculateTeacherScore(scores) {
  const weighted = KPI_AREAS.map((item) => {
    const entry = scores?.[item.key] || { score: 0, evidence: '', remarks: '' };
    const rawScore = Math.min(10, Math.max(0, Number(entry.score || 0)));
    const hasEvidence = Boolean(entry.evidence?.trim());
    const effectiveScore = hasEvidence ? rawScore : rawScore * 0.8;
    return {
      ...item,
      rawScore,
      effectiveScore,
      evidenceMissing: !hasEvidence,
      weightedScore: (effectiveScore / 10) * item.weight,
    };
  });

  const finalScore = weighted.reduce((sum, item) => sum + item.weightedScore, 0);

  let grade = 'Risk';
  let action = 'Replacement planning or salary hold decision if contract allows';
  let tone = 'Risk Teacher';

  if (finalScore >= 90) {
    grade = 'Excellent';
    action = 'Bonus, appreciation, and strong retention';
    tone = 'Excellent Teacher';
  } else if (finalScore >= 75) {
    grade = 'Good';
    action = 'Continue with minor improvement feedback';
    tone = 'Good Teacher';
  } else if (finalScore >= 60) {
    grade = 'Average';
    action = 'Improvement plan required';
    tone = 'Average Teacher';
  } else if (finalScore >= 45) {
    grade = 'Weak';
    action = 'Warning and close monitoring';
    tone = 'Weak Performance';
  }

  return { weighted, finalScore, grade, action, tone };
}

function getGradeBadgeClass(grade) {
  if (grade === 'Excellent') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (grade === 'Good') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (grade === 'Average') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (grade === 'Weak') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-rose-100 text-rose-800 border-rose-200';
}

function getTeacherReviews(reviews, teacherId) {
  return reviews
    .filter((review) => String(review.teacher_id) === String(teacherId))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

export default function TeacherPerformance() {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [draftMonth, setDraftMonth] = useState(currentMonthLabel());
  const [draftScores, setDraftScores] = useState(cloneEmptyScores);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteTeacher, setConfirmDeleteTeacher] = useState(false);
  const [reviewDeleteId, setReviewDeleteId] = useState(null);

  const selectedTeacher = teachers.find((teacher) => String(teacher.id) === String(selectedTeacherId));
  const selectedReview = reviews.find(
    (review) => String(review.teacher_id) === String(selectedTeacherId) && review.month === draftMonth
  );
  const selectedTeacherReviews = selectedTeacher ? getTeacherReviews(reviews, selectedTeacher.id) : [];
  const selectedHistory = selectedTeacherReviews.filter((review) => review.id !== selectedReview?.id);
  const selectedResult = calculateTeacherScore(draftScores);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return teachers;
    return teachers.filter(
      (teacher) =>
        teacher.name?.toLowerCase().includes(query) ||
        teacher.subject?.toLowerCase().includes(query) ||
        String(teacher.month || '').toLowerCase().includes(query)
    );
  }, [teachers, search]);

  const dashboard = useMemo(() => {
    const latestReviews = teachers
      .map((teacher) => getTeacherReviews(reviews, teacher.id)[0])
      .filter(Boolean);
    const scored = latestReviews.map((review) => calculateTeacherScore(review.scores));
    const average = scored.length
      ? scored.reduce((sum, result) => sum + result.finalScore, 0) / scored.length
      : 0;
    const weakCount = scored.filter((result) => result.grade === 'Average' || result.grade === 'Weak' || result.grade === 'Risk').length;
    return { average, weakCount, reviewedCount: latestReviews.length };
  }, [teachers, reviews]);

  function selectTeacher(teacherId, reviewSource = reviews, teacherSource = teachers) {
    const teacher = teacherSource.find((item) => String(item.id) === String(teacherId));
    if (!teacher) {
      setSelectedTeacherId('');
      setDraftMonth(currentMonthLabel());
      setDraftScores(cloneEmptyScores());
      return;
    }

    const latestReview = getTeacherReviews(reviewSource, teacher.id)[0];
    setSelectedTeacherId(String(teacher.id));
    setDraftMonth(latestReview?.month || teacher.month || currentMonthLabel());
    setDraftScores(normalizeScores(latestReview?.scores));
  }

  async function loadData(preferredTeacherId = selectedTeacherId) {
    setLoading(true);
    setError('');
    try {
      const [teacherRows, reviewRows] = await Promise.all([fetchTeachers(), fetchTeacherReviews()]);
      setTeachers(teacherRows);
      setReviews(reviewRows);

      const preferred = teacherRows.find((teacher) => String(teacher.id) === String(preferredTeacherId));
      const nextTeacher = preferred || teacherRows[0];
      if (nextTeacher) {
        selectTeacher(nextTeacher.id, reviewRows, teacherRows);
      } else {
        selectTeacher('', reviewRows, teacherRows);
      }
    } catch (err) {
      setError(err.error || 'Could not load teacher performance data. Sign in and make sure the API server is running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateTeacherField(field, value) {
    setTeachers((current) =>
      current.map((teacher) =>
        String(teacher.id) === String(selectedTeacherId)
          ? { ...teacher, [field]: value }
          : teacher
      )
    );
  }

  function updateScore(areaKey, field, value) {
    setDraftScores((current) => ({
      ...current,
      [areaKey]: {
        ...current[areaKey],
        [field]: field === 'score' ? Number(value) : value,
      },
    }));
  }

  async function addTeacher() {
    setSaving(true);
    setError('');
    try {
      const month = currentMonthLabel();
      const created = await createTeacher({
        name: 'New Teacher',
        subject: 'Subject',
        month,
        data: {},
      });
      await saveTeacherReview({
        teacher_id: created.id,
        month,
        scores: cloneEmptyScores(),
      });
      await loadData(created.id);
    } catch (err) {
      setError(err.error || 'Could not add teacher');
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrentReview() {
    if (!selectedTeacher) return;
    setSaving(true);
    setError('');
    try {
      await updateTeacher(selectedTeacher.id, {
        name: selectedTeacher.name,
        subject: selectedTeacher.subject,
        month: draftMonth,
        data: selectedTeacher.data || {},
      });
      const saved = await saveTeacherReview({
        teacher_id: selectedTeacher.id,
        month: draftMonth,
        scores: draftScores,
      });
      setReviews((current) => {
        const exists = current.some((review) => review.id === saved.id);
        if (exists) {
          return current.map((review) => (review.id === saved.id ? { ...review, ...saved } : review));
        }
        return [{ ...saved, teacherName: selectedTeacher.name, teacherSubject: selectedTeacher.subject }, ...current];
      });
      setTeachers((current) =>
        current.map((teacher) =>
          teacher.id === selectedTeacher.id
            ? { ...teacher, month: draftMonth, updatedAt: new Date().toISOString() }
            : teacher
        )
      );
    } catch (err) {
      setError(err.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedTeacher() {
    if (!selectedTeacher || !isAdmin) return;
    setSaving(true);
    setError('');
    try {
      await removeTeacher(selectedTeacher.id);
      setConfirmDeleteTeacher(false);
      await loadData();
    } catch (err) {
      setError(err.error || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview(reviewId) {
    if (!reviewId || !isAdmin) return;
    setSaving(true);
    setError('');
    try {
      await deleteTeacherReview(reviewId);
      setReviewDeleteId(null);
      const nextReviews = reviews.filter((review) => review.id !== reviewId);
      setReviews(nextReviews);
      selectTeacher(selectedTeacherId, nextReviews, teachers);
    } catch (err) {
      setError(err.error || 'Review delete failed');
    } finally {
      setSaving(false);
    }
  }

  async function copyToNextMonth() {
    if (!selectedTeacher) return;
    setSaving(true);
    setError('');
    try {
      const nextMonth = nextMonthLabel(draftMonth);
      const saved = await saveTeacherReview({
        teacher_id: selectedTeacher.id,
        month: nextMonth,
        scores: draftScores,
      });
      setReviews((current) => {
        const exists = current.some((review) => review.id === saved.id);
        if (exists) {
          return current.map((review) => (review.id === saved.id ? { ...review, ...saved } : review));
        }
        return [{ ...saved, teacherName: selectedTeacher.name, teacherSubject: selectedTeacher.subject }, ...current];
      });
      setDraftMonth(nextMonth);
      setDraftScores(normalizeScores(saved.scores));
    } catch (err) {
      setError(err.error || 'Could not copy review');
    } finally {
      setSaving(false);
    }
  }

  function exportJSON() {
    const payload = teachers.map((teacher) => ({
      ...teacher,
      reviews: getTeacherReviews(reviews, teacher.id),
    }));
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'teacher-performance-scorecard.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const header = [
      'Teacher',
      'Subject',
      'Month',
      'Area',
      'KPI',
      'Weight',
      'Score Out Of 10',
      'Weighted Score',
      'Evidence',
      'Remarks',
      'Final Score',
      'Grade',
      'Action',
    ];

    const rows = teachers.flatMap((teacher) =>
      getTeacherReviews(reviews, teacher.id).flatMap((review) => {
        const result = calculateTeacherScore(review.scores);
        return result.weighted.map((item) => [
          teacher.name,
          teacher.subject,
          review.month,
          item.area,
          item.kpi,
          item.weight,
          item.rawScore,
          item.weightedScore.toFixed(2),
          review.scores[item.key]?.evidence || '',
          review.scores[item.key]?.remarks || '',
          result.finalScore.toFixed(2),
          result.grade,
          result.action,
        ]);
      })
    );

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'teacher-performance-scorecard.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Loading teacher performance data...
      </div>
    );
  }

  if (!selectedTeacher) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Teacher Performance Control System</h1>
        <p className="mt-2 text-sm text-slate-600">
          {error || 'No teacher records exist yet. Add a teacher to start the first monthly review.'}
        </p>
        <button
          onClick={addTeacher}
          disabled={saving}
          className="mt-5 inline-flex items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Teacher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      {confirmDeleteTeacher ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-950">Delete this teacher?</p>
          <p className="mt-1 text-sm text-slate-600">This also removes linked teacher reviews and cannot be undone.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={deleteSelectedTeacher} disabled={saving} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white disabled:opacity-60">Delete</button>
            <button onClick={() => setConfirmDeleteTeacher(false)} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : null}

      {reviewDeleteId ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-950">Delete this monthly review?</p>
          <p className="mt-1 text-sm text-slate-600">Only this saved review will be removed. The teacher profile stays.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => deleteReview(reviewDeleteId)} disabled={saving} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white disabled:opacity-60">Delete</button>
            <button onClick={() => setReviewDeleteId(null)} className="rounded-md border px-3 py-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-300">
              ProTrack Kaizen / Miraku Education Foundation
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              Teacher Performance Control System
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              Monthly scorecards are now saved to the backend and linked to teacher profile records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={addTeacher}
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Teacher
            </button>
            <button
              onClick={saveCurrentReview}
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save Review'}
            </button>
            <button
              onClick={exportCSV}
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </button>
            <button
              onClick={exportJSON}
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </button>
            <button
              onClick={copyToNextMonth}
              disabled={saving}
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="mr-2 h-4 w-4" /> Copy to next month
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Teacher Records</p>
              <p className="mt-1 text-3xl font-bold">{teachers.length}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-slate-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Average Latest Score</p>
              <p className="mt-1 text-3xl font-bold">{dashboard.average.toFixed(1)}%</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-slate-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Latest Reviews Needing Action</p>
              <p className="mt-1 text-3xl font-bold">{dashboard.weakCount}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-slate-500" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Teacher List</h2>
              <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Backend
              </span>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teacher, subject, month"
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
            />
            <div className="space-y-3">
              {filteredTeachers.map((teacher) => {
                const latestReview = getTeacherReviews(reviews, teacher.id)[0];
                const result = calculateTeacherScore(latestReview?.scores || {});
                return (
                  <button
                    key={teacher.id}
                    onClick={() => selectTeacher(teacher.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      String(selectedTeacherId) === String(teacher.id)
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{teacher.name || 'Unnamed Teacher'}</p>
                        <p className={`text-sm ${String(selectedTeacherId) === String(teacher.id) ? 'text-slate-300' : 'text-slate-500'}`}>
                          {teacher.subject || 'Subject'} - {latestReview?.month || teacher.month || 'No review'}
                        </p>
                      </div>
                      {latestReview ? (
                        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${
                          String(selectedTeacherId) === String(teacher.id)
                            ? 'border-white/20 bg-white/10 text-white'
                            : getGradeBadgeClass(result.grade)
                        }`}>
                          {result.grade}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200/60">
                      <div
                        className="h-2 rounded-full bg-current"
                        style={{ width: `${Math.min(100, result.finalScore)}%` }}
                      />
                    </div>
                    <p className={`mt-2 text-sm ${String(selectedTeacherId) === String(teacher.id) ? 'text-slate-300' : 'text-slate-600'}`}>
                      {latestReview ? `${result.finalScore.toFixed(1)}%` : 'No saved review'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="grid flex-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Teacher Name</label>
                    <input
                      value={selectedTeacher.name || ''}
                      onChange={(event) => updateTeacherField('name', event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Subject</label>
                    <input
                      value={selectedTeacher.subject || ''}
                      onChange={(event) => updateTeacherField('subject', event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Review Month</label>
                    <input
                      value={draftMonth}
                      onChange={(event) => setDraftMonth(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
                    />
                  </div>
                </div>
                {isAdmin ? (
                  <button
                    onClick={() => setConfirmDeleteTeacher(true)}
                    disabled={saving}
                    className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="mr-2 inline h-4 w-4" /> Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-[1fr_260px] md:items-center">
                <div>
                  <h2 className="text-2xl font-bold">Monthly Score Summary</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Formula: score out of 10 divided by 10, multiplied by KPI weight. Final score is the sum of all weighted scores.
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    Rule: missing evidence caps that KPI at 80% of the entered score.
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Last saved: {formatDate(selectedReview?.updatedAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-5 text-center">
                  <p className="text-sm text-slate-500">Final Score</p>
                  <p className="mt-1 text-5xl font-black tracking-tight">{selectedResult.finalScore.toFixed(1)}%</p>
                  <span className={`mt-3 inline-flex rounded-full border px-4 py-1 text-sm font-semibold ${getGradeBadgeClass(selectedResult.grade)}`}>
                    Grade {selectedResult.grade} - {selectedResult.tone}
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Recommended Action</p>
                <p className="mt-1 font-medium text-slate-900">{selectedResult.action}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Review History</h2>
                  <p className="mt-1 text-sm text-slate-600">Saved backend review records for this teacher.</p>
                </div>
                <span className="text-sm text-slate-500">
                  {selectedTeacherReviews.length} review{selectedTeacherReviews.length === 1 ? '' : 's'}
                </span>
              </div>
              {selectedHistory.length ? (
                <div className="mt-4 space-y-3">
                  {selectedHistory.slice(0, 4).map((entry) => {
                    const result = calculateTeacherScore(entry.scores);
                    return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <button
                            onClick={() => {
                              setDraftMonth(entry.month);
                              setDraftScores(normalizeScores(entry.scores));
                            }}
                            className="text-left"
                          >
                            <p className="font-semibold">{entry.month}</p>
                            <p className="text-sm text-slate-500">{formatDate(entry.updatedAt)}</p>
                          </button>
                          <div className="flex items-center gap-3">
                            {isAdmin ? (
                              <button onClick={() => setReviewDeleteId(entry.id)} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">
                                Delete
                              </button>
                            ) : null}
                            <div className="text-right">
                              <p className="text-lg font-bold">{result.finalScore.toFixed(1)}%</p>
                              <p className={`text-sm font-semibold ${
                                result.grade === 'A'
                                  ? 'text-emerald-700'
                                  : result.grade === 'B'
                                    ? 'text-blue-700'
                                    : result.grade === 'C'
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                              }`}>
                                {result.grade}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No previous saved reviews yet. Save this review, then copy it to the next month when ready.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {KPI_AREAS.map((item) => {
              const entry = draftScores[item.key] || { score: 0, evidence: '', remarks: '' };
              const score = Math.min(10, Math.max(0, Number(entry.score || 0)));
              const hasEvidence = Boolean(entry.evidence?.trim());
              const effectiveScore = hasEvidence ? score : score * 0.8;
              const weightedScore = (effectiveScore / 10) * item.weight;
              return (
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="p-5">
                    <div className="grid gap-4 lg:grid-cols-[1.25fr_120px_1fr] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold">{item.area}</h3>
                          <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500">
                            Weight {item.weight}%
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.kpi}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          Weighted Score: {weightedScore.toFixed(2)} / {item.weight}
                        </p>
                        {!hasEvidence ? (
                          <p className="mt-2 text-sm font-medium text-amber-700">
                            Missing evidence: score capped to 80% for this KPI.
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-600">Score / 10</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={entry.score}
                          onChange={(event) => updateScore(item.key, 'score', event.target.value)}
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-900 focus:border-slate-950 focus:outline-none"
                        />
                      </div>
                      <div className="grid gap-3">
                        <div>
                          <label className="text-sm font-medium text-slate-600">Evidence / Proof</label>
                          <input
                            value={entry.evidence}
                            onChange={(event) => updateScore(item.key, 'evidence', event.target.value)}
                            placeholder="Attendance register, test data, observation report..."
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-600">Remarks</label>
                          <input
                            value={entry.remarks}
                            onChange={(event) => updateScore(item.key, 'remarks', event.target.value)}
                            placeholder="Specific issue or positive note"
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-950 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 md:p-6">
              <div className="flex items-center gap-2">
                <Save className="h-5 w-5 text-slate-600" />
                <h2 className="text-xl font-bold">Monthly Review Decision</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">85%+</p>
                  <p className="mt-1 font-bold">A Grade</p>
                  <p className="mt-1 text-sm text-slate-600">Appreciation / incentive</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">70-84%</p>
                  <p className="mt-1 font-bold">B Grade</p>
                  <p className="mt-1 text-sm text-slate-600">Continue monitoring</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">55-69%</p>
                  <p className="mt-1 font-bold">C Grade</p>
                  <p className="mt-1 text-sm text-slate-600">Improvement plan</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-500">Below 55%</p>
                  <p className="mt-1 font-bold">D Grade</p>
                  <p className="mt-1 text-sm text-slate-600">Warning / exit review</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
