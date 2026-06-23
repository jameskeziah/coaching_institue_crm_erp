import React, { useEffect, useState } from 'react';
import { fetchPlatformInstitutes, updatePlatformTenantStatus } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InstitutesPage({ status = '', title = 'Institutes' }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

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
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Institute</th>
              <th className="p-3">Status</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Billing</th>
              <th className="p-3">Contact</th>
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
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => changeStatus(row.id, 'active')}>Activate</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus(row.id, 'suspended')}>Suspend</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={6}>No institutes found</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
