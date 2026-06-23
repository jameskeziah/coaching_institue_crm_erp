import React, { useEffect, useState } from 'react';
import { fetchPlatformRevenue } from '@/api';
import { StatCard, formatMoney } from './SuperAdminLayout';

export default function RevenuePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlatformRevenue()
      .then((result) => setData(result.data))
      .catch((err) => setError(err.message || 'Failed to load revenue'));
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Revenue</h1>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="MRR" value={data ? formatMoney(data.summary.monthlyRecurringRevenue) : '-'} />
        <StatCard label="Paid customers" value={data?.summary.paidCustomers ?? '-'} />
        <StatCard label="Active trials" value={data?.summary.activeTrials ?? '-'} />
        <StatCard label="Overdue accounts" value={data?.summary.overdueAccounts ?? '-'} />
      </div>
      <div className="mt-6 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Tenant</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Paid At</th>
            </tr>
          </thead>
          <tbody>
            {(data?.payments || []).map((payment) => (
              <tr key={payment.id} className="border-t">
                <td className="p-3">{payment.tenant_name}</td>
                <td className="p-3">{formatMoney(payment.amount)}</td>
                <td className="p-3">{payment.status}</td>
                <td className="p-3">{payment.provider}</td>
                <td className="p-3">{payment.paid_at || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
