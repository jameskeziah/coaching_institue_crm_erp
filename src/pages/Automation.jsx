import React, { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Send } from 'lucide-react';
import { fetchAutomationLogs, fetchBatchDiscipline, markAutomationSent, runAttendanceAutomation } from '../api';

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export default function Automation() {
  const [month, setMonth] = useState(monthNow());
  const [logs, setLogs] = useState([]);
  const [batchDiscipline, setBatchDiscipline] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(nextMonth = month) {
    setError('');
    try {
      const [logRows, batchRows] = await Promise.all([
        fetchAutomationLogs(),
        fetchBatchDiscipline(nextMonth),
      ]);
      setLogs(logRows);
      setBatchDiscipline(batchRows);
    } catch (err) {
      setError(err.error || 'Could not load automation data');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRun() {
    setMessage('');
    setError('');
    try {
      const result = await runAttendanceAutomation(month);
      setMessage(`Queued ${result.absenteeAlerts.length} repeated absentee alerts and ${result.teacherLateAlerts.length} teacher late alerts.`);
      await load(month);
    } catch (err) {
      setError(err.error || 'Could not run automation');
    }
  }

  async function handleMarkSent(id) {
    await markAutomationSent(id);
    setMessage('WhatsApp automation log marked sent.');
    await load(month);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Automation</h2>
        <p className="mt-1 text-sm text-slate-600">Queue WhatsApp reminders, repeated absentee alerts, teacher late alerts, and batch discipline actions.</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold">WhatsApp Automation Queue</h3>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }} className="rounded-md border px-3 py-2 text-sm" />
            <button onClick={handleRun} className="inline-flex items-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              <RefreshCw className="mr-2 h-4 w-4" /> Run
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {logs.slice(0, 12).map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold">{log.automationType} - {log.status}</p>
                  <p className="text-sm text-slate-500">{log.targetType} #{log.targetId} - {log.sentVia} - {log.createdAt}</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{log.message}</pre>
                </div>
                {log.status !== 'Sent' ? (
                  <button onClick={() => handleMarkSent(log.id)} className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1 text-sm text-white">
                    <Send className="mr-1 h-4 w-4" /> Mark Sent
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!logs.length ? <p className="text-sm text-slate-500">No automation logs yet.</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Batch Discipline Dashboard</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {batchDiscipline.map((row) => (
            <div key={row.batch} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold">{row.batch || 'Unassigned Batch'}</p>
              <p className="mt-2 text-2xl font-bold">{row.averageAttendance}%</p>
              <p className="text-sm text-slate-500">Absent rows {row.absentRows}, late rows {row.lateRows}</p>
              <p className="mt-2 text-sm font-semibold">Risk: {row.riskLevel}</p>
              <p className="text-sm text-slate-600">{row.action}</p>
            </div>
          ))}
          {!batchDiscipline.length ? <p className="text-sm text-slate-500">No batch discipline rows for this month.</p> : null}
        </div>
      </div>
    </div>
  );
}
