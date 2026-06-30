import React, { useEffect, useState } from 'react';

import {
  fetchBranches,
  fetchOfficialWhatsAppTemplates,
  fetchWhatsAppMessageEvents,
  fetchWhatsAppMessages,
  fetchWhatsAppWebhookEvents,
  reprocessWhatsAppWebhookEvent,
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

function dateTime(value) { return value ? new Date(value).toLocaleString('en-IN') : '-'; }

export default function WhatsAppSendHistoryPage() {
  const { isAdmin } = useAuth();
  const [messages, setMessages] = useState([]);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({ templateKey: '', status: '', branchId: '', dateFrom: '', dateTo: '', failedOnly: false, repliedOnly: false, unreadUnreplied: false });
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const [rows, templateRows, branchRows] = await Promise.all([
        fetchWhatsAppMessages(filters), fetchOfficialWhatsAppTemplates(), fetchBranches(),
      ]);
      setMessages(rows); setTemplates(templateRows); setBranches(branchRows);
      if (isAdmin) setWebhookEvents(await fetchWhatsAppWebhookEvents());
    } catch (err) { setError(err.error || 'Could not load WhatsApp send history'); }
  }
  useEffect(() => { load(); }, [filters.templateKey, filters.status, filters.branchId, filters.dateFrom, filters.dateTo, filters.failedOnly, filters.repliedOnly, filters.unreadUnreplied]);

  return (
    <PageShell title="WhatsApp Send History" description="Outbound delivery lifecycle, inbound replies, failures, and raw webhook diagnostics.">
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Tabs defaultValue="messages">
        <TabsList><TabsTrigger value="messages">Messages</TabsTrigger>{isAdmin ? <TabsTrigger value="webhooks">Webhook Events</TabsTrigger> : null}</TabsList>
        <TabsContent value="messages" className="space-y-4">
          <Card><CardContent className="grid gap-2 p-4 md:grid-cols-4">
            <select value={filters.templateKey} onChange={(e) => setFilters({ ...filters, templateKey: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All templates</option>{templates.map((item) => <option key={item.id} value={item.templateKey}>{item.templateKey}</option>)}</select>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All statuses</option>{['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLIED'].map((item) => <option key={item}>{item}</option>)}</select>
            <select value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} className="rounded-md border px-3 py-2 text-sm"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /><Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
            {['failedOnly', 'repliedOnly', 'unreadUnreplied'].map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />{key.replace(/([A-Z])/g, ' $1')}</label>)}
          </CardContent></Card>
          <Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Template</TableHead><TableHead>Student / Lead</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead>Delivered</TableHead><TableHead>Read</TableHead><TableHead>Failed</TableHead><TableHead>Replied</TableHead><TableHead>Error</TableHead><TableHead /></TableRow></TableHeader><TableBody>{messages.map((row) => <TableRow key={row.id}><TableCell>{dateTime(row.createdAt)}</TableCell><TableCell>{row.templateKey}</TableCell><TableCell>{row.studentName || row.leadName || '-'}</TableCell><TableCell>{row.recipientPhone}</TableCell><TableCell><Badge variant={row.status === 'FAILED' ? 'destructive' : row.status === 'REPLIED' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell><TableCell>{dateTime(row.sentAt)}</TableCell><TableCell>{dateTime(row.deliveredAt)}</TableCell><TableCell>{dateTime(row.readAt)}</TableCell><TableCell>{dateTime(row.failedAt)}</TableCell><TableCell>{dateTime(row.repliedAt)}</TableCell><TableCell>{row.errorCode ? `${row.errorCode}: ${row.errorMessage}` : '-'}</TableCell><TableCell><Button size="sm" variant="outline" onClick={async () => setSelectedEvents(await fetchWhatsAppMessageEvents(row.id))}>Events</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          {selectedEvents.length ? <Card><CardHeader><CardTitle className="text-base">Message Webhook Events</CardTitle></CardHeader><CardContent className="space-y-2">{selectedEvents.map((event) => <div key={event.id} className="rounded-md border p-3 text-sm"><Badge>{event.processingStatus}</Badge> {event.eventType} · {event.status || '-'} · {dateTime(event.createdAt)}</div>)}</CardContent></Card> : null}
        </TabsContent>
        {isAdmin ? <TabsContent value="webhooks"><Card><CardContent className="overflow-x-auto p-4"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Message ID</TableHead><TableHead>Status</TableHead><TableHead>Processing</TableHead><TableHead>Error</TableHead><TableHead /></TableRow></TableHeader><TableBody>{webhookEvents.map((event) => <TableRow key={event.id}><TableCell>{dateTime(event.createdAt)}</TableCell><TableCell>{event.eventType}</TableCell><TableCell>{event.providerMessageId || event.providerInboundMessageId || '-'}</TableCell><TableCell>{event.status || '-'}</TableCell><TableCell><Badge variant={event.processingStatus === 'FAILED' ? 'destructive' : 'secondary'}>{event.processingStatus}</Badge></TableCell><TableCell>{event.errorMessage || '-'}</TableCell><TableCell>{['FAILED', 'IGNORED'].includes(event.processingStatus) ? <Button size="sm" onClick={async () => { await reprocessWhatsAppWebhookEvent(event.id); setMessage('Webhook event reprocessed.'); await load(); }}>Reprocess</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent> : null}
      </Tabs>
    </PageShell>
  );
}
