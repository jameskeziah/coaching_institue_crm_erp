import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageShell } from '@/components/page-shell';
import { useAuth } from '@/AuthContext';
import { commitImportBatch, dryRunFeeOpeningBalanceImport, dryRunGuardianImport, dryRunStudentImport, fetchImportBatches, rollbackImportBatch } from '@/api';
import { isAdminRole } from '@/rbac';

const studentFields = [
  { key: 'studentCode', label: 'Student code', required: true, aliases: ['studentcode', 'studentid', 'admissionid', 'rollnumber'] },
  { key: 'name', label: 'Student name', required: true, aliases: ['name', 'studentname', 'fullname'] },
  { key: 'classLevel', label: 'Class / grade', aliases: ['classlevel', 'class', 'grade'] },
  { key: 'studentEmail', label: 'Student email', aliases: ['studentemail', 'email'] },
  { key: 'studentPhone', label: 'Student phone', aliases: ['studentphone', 'phone', 'mobile'] },
  { key: 'parentName', label: 'Parent name', aliases: ['parentname', 'guardianname', 'fathername', 'mothername'] },
  { key: 'parentPhone', label: 'Parent phone', aliases: ['parentphone', 'guardianphone', 'whatsapp'] },
  { key: 'dateOfBirth', label: 'Date of birth', aliases: ['dateofbirth', 'dob'] },
  { key: 'admissionDate', label: 'Admission date', aliases: ['admissiondate', 'joiningdate'] },
  { key: 'status', label: 'Status', aliases: ['status'] },
];

const guardianFields = [
  { key: 'studentCode', label: 'Student code', required: true, aliases: ['studentcode', 'studentid', 'admissionid', 'rollnumber'] },
  { key: 'name', label: 'Guardian name', required: true, aliases: ['guardianname', 'name', 'parentname'] },
  { key: 'relationship', label: 'Relationship', aliases: ['relationship', 'relation'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'guardianphone', 'parentphone', 'mobile'] },
  { key: 'alternatePhone', label: 'Alternate phone', aliases: ['alternatephone', 'secondaryphone'] },
  { key: 'email', label: 'Email', aliases: ['email', 'guardianemail', 'parentemail'] },
  { key: 'occupation', label: 'Occupation', aliases: ['occupation'] },
  { key: 'address', label: 'Address', aliases: ['address'] },
  { key: 'isPrimary', label: 'Primary guardian', aliases: ['isprimary', 'primaryguardian', 'primary'] },
  { key: 'isEmergencyContact', label: 'Emergency contact', aliases: ['isemergencycontact', 'emergencycontact'] },
  { key: 'canReceiveNotifications', label: 'Receive notifications', aliases: ['canreceivenotifications', 'notifications'] },
];

const feeOpeningBalanceFields = [
  { key: 'studentCode', label: 'Student code', required: true, aliases: ['studentcode', 'studentid', 'admissionid', 'rollnumber'] },
  { key: 'courseName', label: 'Course name', required: true, aliases: ['coursename', 'course', 'program'] },
  { key: 'academicYear', label: 'Academic year', required: true, aliases: ['academicyear', 'year', 'session'] },
  { key: 'openingBalance', label: 'Opening balance', required: true, aliases: ['openingbalance', 'balance', 'outstandingamount', 'pendingamount'] },
  { key: 'dueDate', label: 'Due date', required: true, aliases: ['duedate', 'date'] },
];

function headerKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row.');
  const headers = rows[0].map((cell) => cell.trim());
  if (headers.some((header) => !header)) throw new Error('Every CSV column must have a header.');
  return { headers, records: rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))) };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadErrors(result) {
  const lines = ['row_number,status,errors,student_code,name,course_name,academic_year,opening_balance,due_date'];
  for (const row of result.rows || []) {
    lines.push([row.rowNumber, row.status, (row.errors || []).join('|'), row.normalized?.studentCode, row.normalized?.name,
      row.normalized?.courseName, row.normalized?.academicYear, row.normalized?.openingBalance, row.normalized?.dueDate].map(csvCell).join(','));
  }
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `student-import-${result.batchId}-errors.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusTone(status) {
  if (status === 'COMMITTED') return 'default';
  if (status === 'VALIDATED') return 'secondary';
  return 'outline';
}

export default function StudentImport() {
  const { role } = useAuth();
  const [entityType, setEntityType] = useState('STUDENT');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [records, setRecords] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canManage = isAdminRole(role);
  const fields = entityType === 'GUARDIAN' ? guardianFields : entityType === 'FEE_OPENING_BALANCE' ? feeOpeningBalanceFields : studentFields;
  const requiredMapped = fields.filter((field) => field.required).every((field) => mapping[field.key]);
  const mappedRows = useMemo(() => records.map((record) => Object.fromEntries(fields
    .filter((field) => mapping[field.key])
    .map((field) => [field.key, record[mapping[field.key]]]))), [records, mapping, entityType]);

  function changeEntityType(value) {
    setEntityType(value); setFileName(''); setHeaders([]); setRecords([]); setMapping({}); setResult(null); setConfirmed(false); setError(''); setMessage('');
  }

  async function loadHistory() {
    if (!canManage) return;
    try { setBatches(await fetchImportBatches()); } catch (err) { setError(err.error || 'Could not load import history.'); }
  }

  useEffect(() => { loadHistory(); }, [canManage]);

  async function selectFile(event) {
    setError(''); setMessage(''); setResult(null); setConfirmed(false);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('CSV files are limited to 5 MB.'); return; }
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.records.length > 5000) throw new Error('A single import is limited to 5000 rows.');
      const autoMapping = {};
      for (const field of fields) {
        const match = parsed.headers.find((header) => field.aliases.includes(headerKey(header)));
        if (match) autoMapping[field.key] = match;
      }
      setFileName(file.name); setHeaders(parsed.headers); setRecords(parsed.records); setMapping(autoMapping);
    } catch (err) { setHeaders([]); setRecords([]); setError(err.message || 'Could not parse CSV.'); }
  }

  async function runDryRun() {
    setBusy(true); setError(''); setMessage(''); setConfirmed(false);
    try {
      const response = entityType === 'GUARDIAN'
        ? await dryRunGuardianImport({ sourceName: fileName, rows: mappedRows })
        : entityType === 'FEE_OPENING_BALANCE'
          ? await dryRunFeeOpeningBalanceImport({ sourceName: fileName, rows: mappedRows })
          : await dryRunStudentImport({ sourceName: fileName, rows: mappedRows });
      setResult(response);
      setMessage(response.status === 'VALIDATED' ? 'Validation passed. Review the summary before committing.' : 'Validation found errors. Download the report, correct the CSV, and try again.');
      await loadHistory();
    } catch (err) { setError(err.error || 'Dry run failed.'); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setError(''); setMessage('');
    try {
      await commitImportBatch(result.batchId);
      setResult((current) => ({ ...current, status: 'COMMITTED' }));
      setMessage(`${result.validRows} ${entityType === 'GUARDIAN' ? 'guardians' : entityType === 'FEE_OPENING_BALANCE' ? 'opening balances' : 'students'} imported successfully.`);
      setConfirmed(false);
      await loadHistory();
    } catch (err) { setError(err.error || 'Commit failed. Run a new dry run if the data changed.'); }
    finally { setBusy(false); }
  }

  async function rollback(batchId) {
    if (!window.confirm('Rollback this batch? Only students created by this import will be removed.')) return;
    setBusy(true); setError(''); setMessage('');
    try { const response = await rollbackImportBatch(batchId); setMessage(`${response.rolledBackRows} imported students rolled back.`); await loadHistory(); }
    catch (err) { setError(err.error || 'Rollback failed.'); }
    finally { setBusy(false); }
  }

  if (!canManage) return <Navigate to="/students" replace />;

  return (
    <PageShell title="Student & Guardian Import Center" description="Validate, review, commit, and roll back dependency-aware tenant CSV imports."
      actions={<Button asChild variant="outline"><Link to="/students">Back to Students</Link></Button>}>
      {message ? <Alert className="mb-4 border-emerald-200 text-emerald-800"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert className="mb-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>1. Upload and map CSV</CardTitle><CardDescription>{entityType === 'GUARDIAN' ? 'Guardians link to an existing student code in this tenant.' : entityType === 'FEE_OPENING_BALANCE' ? 'Opening balances create preserved ledger plans and one outstanding installment per student. Dates use YYYY-MM-DD.' : 'Required columns: student code and student name. Dates must use YYYY-MM-DD.'}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-1 text-sm"><span>Import type</span><select value={entityType} onChange={(event) => changeEntityType(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2"><option value="STUDENT">Students</option><option value="GUARDIAN">Guardians</option><option value="FEE_OPENING_BALANCE">Fee opening balances</option></select></label>
            <input aria-label="Student CSV file" type="file" accept=".csv,text/csv" onChange={selectFile} className="block w-full rounded-md border p-2 text-sm" />
            {records.length ? <p className="text-sm text-muted-foreground">{fileName} · {records.length} data rows · {headers.length} columns</p> : null}
            {headers.length ? <div className="grid gap-3 md:grid-cols-2">{fields.map((field) => (
              <label key={field.key} className="space-y-1 text-sm"><span>{field.label}{field.required ? ' *' : ''}</span>
                <select value={mapping[field.key] || ''} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="">Do not import</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}</div> : null}
            <Button disabled={busy || !records.length || !requiredMapped} onClick={runDryRun}>{busy ? 'Validating…' : 'Run dry validation'}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Validation result</CardTitle><CardDescription>No records are written until a validated batch is explicitly committed.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {!result ? <p className="text-sm text-muted-foreground">Upload a CSV and run validation to see row-level results.</p> : <>
              <div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-md border p-3"><p className="text-2xl font-semibold">{result.totalRows}</p><p className="text-xs text-muted-foreground">Total</p></div><div className="rounded-md border p-3"><p className="text-2xl font-semibold text-emerald-700">{result.validRows}</p><p className="text-xs text-muted-foreground">Valid</p></div><div className="rounded-md border p-3"><p className="text-2xl font-semibold text-destructive">{result.invalidRows}</p><p className="text-xs text-muted-foreground">Invalid</p></div></div>
              {result.entityType === 'FEE_OPENING_BALANCE' ? <Alert><AlertDescription>Total receivable to post: ₹{Number(result.totalAmount || 0).toLocaleString('en-IN')}</AlertDescription></Alert> : null}
              <div className="max-h-72 overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Student code</TableHead><TableHead>{result.entityType === 'FEE_OPENING_BALANCE' ? 'Course / balance' : 'Name'}</TableHead><TableHead>Result</TableHead></TableRow></TableHeader><TableBody>{result.rows?.map((row) => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell>{row.normalized?.studentCode || '-'}</TableCell><TableCell>{result.entityType === 'FEE_OPENING_BALANCE' ? `${row.normalized?.courseName || '-'} · ₹${Number(row.normalized?.openingBalance || 0).toLocaleString('en-IN')}` : row.normalized?.name || '-'}</TableCell><TableCell>{row.errors?.length ? row.errors.join(', ') : <Badge variant="secondary">Valid</Badge>}</TableCell></TableRow>)}</TableBody></Table></div>
              <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={() => downloadErrors(result)}>Download result CSV</Button>{result.status === 'VALIDATED' ? <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this batch and confirm import</label><Button disabled={busy || !confirmed} onClick={commit}>Commit {result.validRows} {entityType === 'GUARDIAN' ? 'guardians' : entityType === 'FEE_OPENING_BALANCE' ? 'opening balances' : 'students'}</Button></> : null}</div>
            </>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle>Import history</CardTitle><CardDescription>Latest 100 batches. Rollback is available only for committed batches.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Rows</TableHead><TableHead>Status</TableHead><TableHead>Checksum</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>{batches.map((batch) => <TableRow key={batch.id}><TableCell>{new Date(batch.createdAt).toLocaleString()}</TableCell><TableCell>{batch.entityType}</TableCell><TableCell>{batch.sourceName || '-'}</TableCell><TableCell>{batch.validRows}/{batch.totalRows} valid</TableCell><TableCell><Badge variant={statusTone(batch.status)}>{batch.status}</Badge></TableCell><TableCell className="font-mono text-xs">{batch.checksum?.slice(0, 12)}…</TableCell><TableCell>{batch.status === 'COMMITTED' ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => rollback(batch.id)}>Rollback</Button> : '-'}</TableCell></TableRow>)}</TableBody></Table>{!batches.length ? <p className="py-6 text-center text-sm text-muted-foreground">No imports yet.</p> : null}</CardContent></Card>
    </PageShell>
  );
}
