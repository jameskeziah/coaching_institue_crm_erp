import React, { useEffect, useState } from 'react';
import { fetchPlatformInstitutes, getStoredPlatformAdmin, invitePlatformTenantOwner, revokePlatformTenantOwnerInvite, updatePlatformTenantStatus } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InstitutesPage({ status = '', title = 'Institutes' }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ownerEmails, setOwnerEmails] = useState({});
  const [ownerReasons, setOwnerReasons] = useState({});
  const [busyTenantId, setBusyTenantId] = useState(null);
  const canManage = getStoredPlatformAdmin()?.role === 'super_admin';

  async function load() {
    setError('');
    try {
      const result = await fetchPlatformInstitutes({ status, search });
      setRows(result.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load institutes');
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function changeStatus(tenantId, nextStatus) {
    await updatePlatformTenantStatus(tenantId, nextStatus);
    await load();
  }

  async function inviteOwner(tenantId) {
    const email = String(ownerEmails[tenantId] || '').trim();
    setError(''); setMessage(''); setBusyTenantId(tenantId);
    try {
      const result = await invitePlatformTenantOwner(tenantId, email, ownerReasons[tenantId]);
      setMessage(`Owner invitation created (${result.deliveryStatus}).`);
      setOwnerEmails({ ...ownerEmails, [tenantId]: '' });
      setOwnerReasons({ ...ownerReasons, [tenantId]: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to invite tenant owner');
    } finally {
      setBusyTenantId(null);
    }
  }

  async function revokeOwnerInvite(tenantId, requestId) {
    setError(''); setMessage(''); setBusyTenantId(tenantId);
    try {
      await revokePlatformTenantOwnerInvite(tenantId, requestId);
      setMessage('Owner recovery invitation revoked.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to revoke owner invitation');
    } finally {
      setBusyTenantId(null);
    }
  }

  return (
    <section className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
        >
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search institute" />
          <Button type="submit">Search</Button>
        </form>
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Institute</th>
              <th className="p-3">Status</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Billing</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.slug}</div>
                </td>
                <td className="p-3">{row.status}</td>
                <td className="p-3">{row.plan || 'trial'}</td>
                <td className="p-3">{row.subscription_status || '-'}</td>
                <td className="p-3">{row.contact_email || '-'}</td>
                <td className="p-3">{row.owner_email ? <div><div>{row.owner_email}</div><div className={`text-xs ${row.owner_verified_at ? 'text-emerald-700' : 'text-amber-700'}`}>{row.owner_verified_at ? 'Verified' : 'Pending verification'}</div></div> : <div><span className="text-amber-700">Missing</span>{row.owner_recovery_request_id ? <div className="mt-1 text-xs text-muted-foreground"><div>Invited: {row.owner_recovery_email}</div><div>{row.owner_recovery_delivery_status || 'pending'} · expires {new Date(row.owner_recovery_expires_at).toLocaleString()}</div></div> : null}</div>}</td>
                <td className="p-3">
                  {canManage ? <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => changeStatus(row.id, 'active')}>Activate</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus(row.id, 'suspended')}>Suspend</Button>
                    {!row.owner_email ? <div className="grid min-w-80 gap-2"><Input type="email" value={ownerEmails[row.id] || ''} onChange={(event) => setOwnerEmails({ ...ownerEmails, [row.id]: event.target.value })} placeholder="Legitimate owner email" /><Input value={ownerReasons[row.id] || ''} onChange={(event) => setOwnerReasons({ ...ownerReasons, [row.id]: event.target.value })} placeholder="Recovery reason (required)" /><Button size="sm" disabled={busyTenantId === row.id || !ownerEmails[row.id] || String(ownerReasons[row.id] || '').trim().length < 10} onClick={() => inviteOwner(row.id)}>{busyTenantId === row.id ? 'Saving...' : row.owner_recovery_request_id ? 'Replace invite' : 'Invite owner'}</Button>{row.owner_recovery_request_id ? <Button size="sm" variant="destructive" disabled={busyTenantId === row.id} onClick={() => revokeOwnerInvite(row.id, row.owner_recovery_request_id)}>Revoke invite</Button> : null}</div> : null}
                  </div> : <span className="text-muted-foreground">-</span>}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={7}>No institutes found</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
