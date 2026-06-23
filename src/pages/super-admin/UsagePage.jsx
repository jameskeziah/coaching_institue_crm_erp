import React, { useEffect, useState } from 'react';
import { fetchPlatformUsage } from '@/api';

export default function UsagePage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlatformUsage()
      .then((result) => setRows(result.data || []))
      .catch((err) => setError(err.message || 'Failed to load usage'));
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Usage</h1>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Institute</th>
              <th className="p-3">Metric</th>
              <th className="p-3">Value</th>
              <th className="p-3">Period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.tenant_name}</td>
                <td className="p-3">{row.metric_key}</td>
                <td className="p-3">{row.metric_value}</td>
                <td className="p-3">{row.period_start} to {row.period_end}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
