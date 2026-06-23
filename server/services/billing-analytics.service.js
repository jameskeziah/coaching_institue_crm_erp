const { get, all } = require('./db.service');

async function getRevenueSummary() {
  const mrr = await get(
    `SELECT COALESCE(SUM(monthly_amount), 0) as amount
     FROM tenant_subscriptions
     WHERE status = 'active'
     AND deleted_at IS NULL`
  );

  const paidCustomers = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status = 'active'
     AND monthly_amount > 0
     AND deleted_at IS NULL`
  );

  const trialing = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status = 'trialing'
     AND deleted_at IS NULL`
  );

  const overdue = await get(
    `SELECT COUNT(*) as count
     FROM tenant_subscriptions
     WHERE status IN ('past_due', 'unpaid')
     AND deleted_at IS NULL`
  );

  return {
    monthlyRecurringRevenue: Number(mrr?.amount || 0),
    paidCustomers: Number(paidCustomers?.count || 0),
    activeTrials: Number(trialing?.count || 0),
    overdueAccounts: Number(overdue?.count || 0),
  };
}

async function getRecentPayments() {
  return all(
    `SELECT
       p.id,
       p.tenant_id,
       t.name as tenant_name,
       p.amount,
       p.currency,
       p.status,
       p.provider,
       p.provider_payment_id,
       p.paid_at,
       p.created_at
     FROM tenant_payments p
     JOIN tenants t
       ON t.id = p.tenant_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT 100`
  );
}

module.exports = {
  getRevenueSummary,
  getRecentPayments,
};
