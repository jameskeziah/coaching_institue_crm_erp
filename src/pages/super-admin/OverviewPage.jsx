import React, { useEffect, useState } from 'react';
import { fetchPlatformSummary } from '@/api';
import { StatCard, formatMoney } from './SuperAdminLayout';

export default function OverviewPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlatformSummary()
      .then((result) => setSummary(result.data))
      .catch((err) => setError(err.message || 'Failed to load summary'));
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Overview</h1>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="All institutes" value={summary?.totalInstitutes ?? '-'} />
        <StatCard label="Active trials" value={summary?.activeTrials ?? '-'} />
        <StatCard label="Paid customers" value={summary?.paidCustomers ?? '-'} />
        <StatCard label="Expired trials" value={summary?.expiredTrials ?? '-'} />
        <StatCard label="Suspended tenants" value={summary?.suspendedTenants ?? '-'} />
        <StatCard label="Monthly recurring revenue" value={summary ? formatMoney(summary.monthlyRecurringRevenue) : '-'} />
      </div>
    </section>
  );
}
