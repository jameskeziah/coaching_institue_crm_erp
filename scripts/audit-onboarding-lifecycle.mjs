import db from '../server/db.js';

const { all, close, migrate, run } = db;

const shouldFix = process.argv.includes('--fix');

function hasUnsafeLifecycle(row) {
  const tenantStatus = String(row.tenant_status || '').toLowerCase();
  const subscriptionStatus = String(row.subscription_status || '').toLowerCase();
  return (
    ['trialing', 'active'].includes(tenantStatus) ||
    ['trialing', 'active'].includes(subscriptionStatus) ||
    Boolean(row.trial_started_at) ||
    Boolean(row.trial_ends_at) ||
    Boolean(row.current_period_start) ||
    Boolean(row.current_period_end)
  );
}

async function main() {
  await migrate();

  const rows = await all(
    `SELECT
       tenants.id AS tenant_id,
       tenants.name AS tenant_name,
       tenants.slug AS tenant_slug,
       tenants.status AS tenant_status,
       tenants.subscriptionStatus AS tenant_subscription_status,
       users.id AS owner_id,
       users.email AS owner_email,
       users.email_verified_at AS owner_email_verified_at,
       tenant_subscriptions.id AS subscription_id,
       tenant_subscriptions.status AS subscription_status,
       tenant_subscriptions.trial_started_at,
       tenant_subscriptions.trial_ends_at,
       tenant_subscriptions.current_period_start,
       tenant_subscriptions.current_period_end
     FROM tenants
     JOIN users
       ON users.tenant_id = tenants.id
      AND users.role = 'owner'
      AND users.deleted_at IS NULL
     LEFT JOIN tenant_subscriptions
       ON tenant_subscriptions.tenant_id = tenants.id
      AND tenant_subscriptions.deleted_at IS NULL
     WHERE users.email_verified_at IS NULL
       AND tenants.deleted_at IS NULL`
  );

  const unsafe = rows.filter(hasUnsafeLifecycle);

  if (unsafe.length === 0) {
    console.log('No unsafe pending-owner lifecycle records found.');
    return;
  }

  console.log(JSON.stringify({
    unsafeCount: unsafe.length,
    records: unsafe.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantStatus: row.tenant_status,
      tenantSubscriptionStatus: row.tenant_subscription_status,
      ownerId: row.owner_id,
      ownerEmail: row.owner_email,
      subscriptionId: row.subscription_id,
      subscriptionStatus: row.subscription_status,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
    })),
  }, null, 2));

  if (!shouldFix) {
    process.exitCode = 1;
    return;
  }

  for (const row of unsafe) {
    await run(
      `UPDATE tenants
       SET status = 'pending_verification',
           subscriptionStatus = 'pending_verification',
           updatedAt = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [row.tenant_id]
    );

    await run(
      `UPDATE tenant_subscriptions
       SET status = 'pending_verification',
           trial_started_at = NULL,
           trial_ends_at = NULL,
           current_period_start = NULL,
           current_period_end = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?
       AND deleted_at IS NULL`,
      [row.tenant_id]
    );

    await run(
      `UPDATE user_sessions
       SET revoked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?
       AND revoked_at IS NULL`,
      [row.tenant_id]
    );
  }

  console.log(`Fixed ${unsafe.length} unsafe pending-owner lifecycle record(s).`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
