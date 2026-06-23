import React, { useEffect, useState } from 'react';
import { fetchPlatformAuditLogs } from '@/api';

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlatformAuditLogs()
      .then((result) => setRows(result.data || []))
      .catch((err) => setError(err.message || 'Failed to load audit logs'));
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Audit Logs</h1>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Action</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Target</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.action}</td>
                <td className="p-3">{row.platform_admin_name || row.platform_admin_id || '-'}</td>
                <td className="p-3">{row.target_type || '-'} {row.target_id || ''}</td>
                <td className="p-3">{row.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
