import React, { useEffect, useState } from 'react';
import { createSupportAccess, fetchSupportAccessSessions, revokeSupportAccess } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SupportAccessPage() {
  const [rows, setRows] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const result = await fetchSupportAccessSessions();
    setRows(result.data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Failed to load support access'));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await createSupportAccess({ tenantId, reason, accessType: 'read_only' });
      setTenantId('');
      setReason('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create support access');
    }
  }

  async function revoke(id) {
    await revokeSupportAccess(id);
    await load();
  }

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Support Access</h1>
      <form onSubmit={submit} className="mt-6 grid gap-3 rounded-md border p-4 md:grid-cols-[160px_1fr_auto]">
        <Input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Tenant ID" />
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for access" />
        <Button type="submit">Create read-only access</Button>
      </form>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Institute</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Expires</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.tenant_name}</td>
                <td className="p-3">{row.platform_admin_name}</td>
                <td className="p-3">{row.reason}</td>
                <td className="p-3">{row.expires_at}</td>
                <td className="p-3">
                  <Button size="sm" variant="outline" disabled={Boolean(row.revoked_at)} onClick={() => revoke(row.id)}>
                    {row.revoked_at ? 'Revoked' : 'Revoke'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
