import React, { useEffect, useState } from 'react';

import {
  archiveOfficialWhatsAppTemplate,
  fetchOfficialWhatsAppTemplate,
  fetchOfficialWhatsAppTemplates,
  fetchStudents,
  fetchWhatsAppTemplateSettings,
  previewOfficialWhatsAppTemplate,
  sendOfficialWhatsAppTemplate,
  submitOfficialWhatsAppTemplate,
  syncOfficialWhatsAppTemplates,
  updateOfficialWhatsAppTemplate,
  updateWhatsAppTemplateSettings,
} from '../api';
import { useAuth } from '../AuthContext';
import { PageShell } from '@/components/page-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export default function WhatsAppTemplatesPage() {
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [students, setStudents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(null);
  const [previewRequest, setPreviewRequest] = useState({ templateKey: 'attendance_absent', studentId: '', attendanceSessionId: '', feeInstallmentId: '', paymentId: '', testResultId: '' });
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [templateRows, studentRows, settingRows] = await Promise.all([
        fetchOfficialWhatsAppTemplates(), fetchStudents(), fetchWhatsAppTemplateSettings(),
      ]);
      setTemplates(templateRows); setStudents(studentRows); setSettings(settingRows);
    } catch (err) { setError(err.error || 'Could not load official WhatsApp templates'); }
  }
  useEffect(() => { load(); }, []);

  async function openTemplate(id) {
    const detail = await fetchOfficialWhatsAppTemplate(id);
    setSelected(detail); setEdit({ ...detail });
  }
  async function saveTemplate() {
    try {
      await updateOfficialWhatsAppTemplate(edit.id, {
        providerTemplateName: edit.providerTemplateName, languageCode: edit.languageCode,
        category: edit.category, headerType: edit.headerType, headerText: edit.headerText,
        bodyText: edit.bodyText, footerText: edit.footerText,
        variableSchema: edit.variableSchema, sampleValues: edit.sampleValues,
      });
      setMessage('Official template updated.'); await load(); await openTemplate(edit.id);
    } catch (err) { setError(err.error || 'Could not update template'); }
  }
  async function runPreview() {
    try {
      setPreview(await previewOfficialWhatsAppTemplate(Object.fromEntries(Object.entries(previewRequest).filter(([, value]) => value))));
    } catch (err) { setError(err.error || 'Preview failed'); }
  }
  async function sendPreview() {
    try {
      const result = await sendOfficialWhatsAppTemplate(Object.fromEntries(Object.entries(previewRequest).filter(([, value]) => value)));
      setMessage(`Template sent. Provider message: ${result.provider?.providerMessageId || result.messageId}`); await load();
    } catch (err) { setError(err.error || 'Send failed'); }
  }

  return (
    <PageShell title="Official WhatsApp Templates" description="Approved WhatsApp Business assets, strict variables, delivery logs, and timeline integration." actions={isAdmin ? <Button onClick={async () => { await syncOfficialWhatsAppTemplates(); setMessage('Provider statuses synchronized.'); await load(); }}>Sync Provider Status</Button> : null}>
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card><CardHeader><CardTitle className="text-base">Official Templates</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Template key</TableHead><TableHead>Provider name</TableHead><TableHead>Language</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Last synced</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{templates.map((template) => <TableRow key={template.id}><TableCell className="font-semibold">{template.templateKey}</TableCell><TableCell>{template.providerTemplateName}</TableCell><TableCell>{template.languageCode}</TableCell><TableCell>{template.category}</TableCell><TableCell><Badge variant={template.status === 'APPROVED' ? 'default' : template.status === 'REJECTED' ? 'destructive' : 'secondary'}>{template.status}</Badge></TableCell><TableCell>{template.lastSyncedAt || '-'}</TableCell><TableCell className="space-x-2"><Button size="sm" variant="outline" onClick={() => openTemplate(template.id)}>View</Button>{isAdmin && template.status === 'LOCAL_DRAFT' ? <Button size="sm" onClick={async () => { await submitOfficialWhatsAppTemplate(template.id); await load(); }}>Submit</Button> : null}{isAdmin && template.status !== 'ARCHIVED' ? <Button size="sm" variant="destructive" onClick={async () => { await archiveOfficialWhatsAppTemplate(template.id); await load(); }}>Archive</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Preview and Send</CardTitle></CardHeader><CardContent className="space-y-3">
          <select value={previewRequest.templateKey} onChange={(e) => { setPreview(null); setPreviewRequest({ ...previewRequest, templateKey: e.target.value }); }} className="w-full rounded-md border px-3 py-2 text-sm">{templates.map((item) => <option key={item.id} value={item.templateKey}>{item.templateKey}</option>)}</select>
          <select value={previewRequest.studentId} onChange={(e) => setPreviewRequest({ ...previewRequest, studentId: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm"><option value="">Select student when required</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Input value={previewRequest.attendanceSessionId} onChange={(e) => setPreviewRequest({ ...previewRequest, attendanceSessionId: e.target.value })} placeholder="Attendance session ID" />
          <Input value={previewRequest.feeInstallmentId} onChange={(e) => setPreviewRequest({ ...previewRequest, feeInstallmentId: e.target.value })} placeholder="Fee installment ID" />
          <Input value={previewRequest.paymentId} onChange={(e) => setPreviewRequest({ ...previewRequest, paymentId: e.target.value })} placeholder="Payment ID" />
          <Input value={previewRequest.testResultId} onChange={(e) => setPreviewRequest({ ...previewRequest, testResultId: e.target.value })} placeholder="Test result ID" />
          <div className="flex gap-2"><Button variant="outline" onClick={runPreview}>Preview</Button><Button disabled={!preview || preview.missing?.length || preview.template?.status !== 'APPROVED'} onClick={sendPreview}>Send Approved Template</Button></div>
          {preview ? <div className="rounded-md border p-3"><p className="text-sm font-semibold">Recipient: {preview.recipientPhone || 'Missing'}</p><p className="mt-2 whitespace-pre-wrap text-sm">{preview.preview}</p>{preview.missing?.length ? <p className="mt-2 text-sm text-destructive">Missing: {preview.missing.map((item) => item.name).join(', ')}</p> : null}<div className="mt-3 space-y-1">{preview.resolved?.map((item) => <p key={item.position} className="text-xs text-muted-foreground">{`{{${item.position}}}`} {item.name}: {item.value || 'Missing'}</p>)}</div></div> : null}
        </CardContent></Card>
      </div>
      {selected && edit ? <Card><CardHeader><CardTitle className="text-base">{selected.templateKey}</CardTitle></CardHeader><CardContent className="grid gap-4 xl:grid-cols-2"><div className="space-y-3"><Input value={edit.providerTemplateName || ''} onChange={(e) => setEdit({ ...edit, providerTemplateName: e.target.value })} disabled={selected.status === 'APPROVED'} placeholder="Provider template name" /><div className="grid grid-cols-2 gap-2"><Input value={edit.languageCode} onChange={(e) => setEdit({ ...edit, languageCode: e.target.value })} disabled={selected.status === 'APPROVED'} /><select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} disabled={selected.status === 'APPROVED'} className="rounded-md border px-3 py-2 text-sm">{['UTILITY', 'MARKETING', 'AUTHENTICATION'].map((item) => <option key={item}>{item}</option>)}</select></div><Textarea rows={6} value={edit.bodyText} onChange={(e) => setEdit({ ...edit, bodyText: e.target.value })} disabled={selected.status === 'APPROVED'} />{isAdmin && selected.status !== 'APPROVED' ? <Button onClick={saveTemplate}>Save Template</Button> : null}</div><div><p className="font-semibold">Variables</p><div className="mt-2 space-y-2">{selected.variableSchema.map((item) => <div key={item.position} className="rounded-md border p-2 text-sm">{`{{${item.position}}}`} · {item.name}<br /><span className="text-muted-foreground">{item.source}</span></div>)}</div><p className="mt-5 font-semibold">Recent sends</p><div className="mt-2 space-y-2">{(selected.sends || []).slice(0, 10).map((send) => <div key={send.id} className="rounded-md border p-2 text-sm"><Badge variant={send.status === 'FAILED' ? 'destructive' : 'secondary'}>{send.status}</Badge> {send.recipientPhone}<br /><span className="text-muted-foreground">{send.renderedPreview}</span></div>)}</div></div></CardContent></Card> : null}
      {isAdmin && settings ? <Card><CardHeader><CardTitle className="text-base">Tenant Template Settings</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{['attendanceAbsentEnabled', 'feeDueEnabled', 'feeOverdueEnabled', 'paymentReceiptEnabled', 'testResultEnabled', 'weeklyReportEnabled', 'admissionFollowupEnabled', 'sendToPrimaryGuardianOnly', 'allowBulkSend', 'requireManualApprovalBeforeBulkSend'].map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />{key.replace(/([A-Z])/g, ' $1')}</label>)}<Input value={settings.defaultLanguageCode} onChange={(e) => setSettings({ ...settings, defaultLanguageCode: e.target.value })} placeholder="Default language" /><Button onClick={async () => { await updateWhatsAppTemplateSettings(settings); setMessage('Template settings saved.'); await load(); }}>Save Settings</Button></CardContent></Card> : null}
    </PageShell>
  );
}
