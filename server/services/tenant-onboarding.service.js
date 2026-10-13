const { env } = require('../config/env');
const {
  generateId,
  generateRawToken,
  hashToken,
  getFutureDate,
} = require('./token.service');
const { hashPassword, validatePasswordStrength } = require('./password.service');
const {
  createEmailOutboxRecord,
  processEmailOutboxRecord,
} = require('./email-outbox.service');
const { transaction, run, get } = require('./db.service');
const { createDefaultFeeStructures, DEFAULT_ACADEMIC_YEAR } = require('./defaultFeeStructures.service');
const {
  DEFAULT_ROLES,
  DEFAULT_FEE_PLANS,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_DASHBOARD_METRICS,
  DEFAULT_CHECKLIST_ITEMS,
} = require('../config/onboarding-defaults');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureUniqueTenantSlug(baseSlug) {
  let slug = baseSlug || `institute-${Date.now()}`;
  let counter = 1;

  while (true) {
    const existing = await get(
      `SELECT id
       FROM tenants
       WHERE slug = ?
       AND deleted_at IS NULL`,
      [slug]
    );

    if (!existing) return slug;

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

async function validateOnboardingInput(input) {
  const requiredFields = [
    'instituteName',
    'ownerName',
    'ownerEmail',
    'ownerPassword',
    'branchName',
  ];

  for (const field of requiredFields) {
    if (!input[field] || String(input[field]).trim() === '') {
      throw new Error(`${field} is required`);
    }
  }

  validatePasswordStrength(input.ownerPassword);
  return normalizeEmail(input.ownerEmail);
}

async function assertEmailAvailableForOnboarding(ownerEmail) {
  const existingUser = await get(
    `SELECT users.id, users.role, users.email_verified_at, tenants.status AS tenant_status
     FROM users
     LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE LOWER(users.email) = ?
     AND users.deleted_at IS NULL`,
    [ownerEmail]
  );

  if (!existingUser) return;

  const isPendingOwner =
    existingUser.role === 'owner' &&
    !existingUser.email_verified_at &&
    String(existingUser.tenant_status || '').toLowerCase() === 'pending_verification';

  if (!isPendingOwner) {
    throw new Error('A user with this email already exists');
  }
}

async function findPendingOwnerOnboarding(ownerEmail) {
  return get(
    `SELECT
       users.*,
       tenants.id AS tenant_id,
       tenants.name AS tenant_name,
       tenants.slug AS tenant_slug,
       tenants.status AS tenant_status,
       tenants.subscriptionStatus AS tenant_subscription_status,
       tenants.plan AS tenant_plan
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE LOWER(users.email) = ?
       AND users.role = 'owner'
       AND users.email_verified_at IS NULL
       AND LOWER(COALESCE(tenants.status, '')) = 'pending_verification'
       AND users.deleted_at IS NULL
       AND tenants.deleted_at IS NULL`,
    [ownerEmail]
  );
}

async function createTenant(input, tenantSlug, ownerEmail, ownerPhone) {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO tenants
      (
        name,
        slug,
        subscriptionPlan,
        subscriptionStatus,
        billingEmail,
        status,
        createdAt,
        updatedAt,
        plan,
        contact_email,
        contact_phone,
        created_at,
        updated_at,
        deleted_at
      )
     VALUES (?, ?, 'trial', 'pending_verification', ?, 'pending_verification', ?, ?, 'trial', ?, ?, ?, ?, NULL)`,
    [
      String(input.instituteName).trim(),
      tenantSlug,
      ownerEmail,
      now,
      now,
      ownerEmail,
      ownerPhone || null,
      now,
      now,
    ]
  );

  return get(`SELECT * FROM tenants WHERE id = ?`, [result.lastID]);
}

async function createOwnerUser({ tenantId, input, ownerEmail, passwordHash }) {
  const result = await run(
    `INSERT INTO users
      (
        username,
        tenant_id,
        name,
        email,
        password,
        password_hash,
        role,
        email_verified_at,
        is_active,
        created_at,
        updated_at,
        deleted_at
      )
     VALUES (?, ?, ?, ?, ?, ?, 'owner', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [
      ownerEmail,
      tenantId,
      String(input.ownerName).trim(),
      ownerEmail,
      passwordHash,
      passwordHash,
    ]
  );

  const owner = await get(`SELECT * FROM users WHERE id = ?`, [result.lastID]);

  await run(
    `UPDATE users
     SET created_by = ?
     WHERE id = ?`,
    [owner.id, owner.id]
  );

  return owner;
}

async function createPendingSubscription({ tenantId }) {
  await run(
    `INSERT INTO tenant_subscriptions
      (
        id,
        tenant_id,
        plan,
        status,
        monthly_amount,
        currency,
        trial_started_at,
        trial_ends_at,
        current_period_start,
        current_period_end,
        created_at,
        updated_at,
        deleted_at
      )
     VALUES (?, ?, 'trial', 'pending_verification', 0, 'INR', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [generateId('sub'), tenantId]
  );
}

async function createBranch({ tenant, input, owner }) {
  const branchId = generateId('brn');
  await run(
    `INSERT INTO branches
      (
        id,
        tenant_id,
        name,
        code,
        city,
        address,
        is_default,
        created_by,
        created_at,
        updated_at,
        deleted_at
      )
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [
      branchId,
      tenant.id,
      String(input.branchName).trim(),
      input.branchCode || 'MAIN',
      input.city || null,
      input.address || null,
      owner.id,
    ]
  );

  return {
    id: branchId,
    name: String(input.branchName).trim(),
    isDefault: true,
  };
}

async function createVerificationTokenForOwner(owner) {
  const rawToken = generateRawToken();
  const tokenId = generateId('evt');

  await run(
    `INSERT INTO email_verification_tokens
      (id, user_id, tenant_id, token_hash, expires_at, created_at, delivery_status, delivery_attempt_count)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending', 0)`,
    [
      tokenId,
      owner.id,
      owner.tenant_id || owner.tenantId,
      hashToken(rawToken),
      getFutureDate({ hours: env.EMAIL_VERIFICATION_TOKEN_HOURS }),
    ]
  );

  const outboxId = await createEmailOutboxRecord({
    tenantId: owner.tenant_id || owner.tenantId,
    userId: owner.id,
    tokenId,
    type: 'owner_email_verification',
    recipient: owner.email,
    payload: { token: rawToken },
  });

  return { id: tokenId, outboxId };
}

async function seedTenantDefaults({ tenant, owner, branchId, tenantSlug }) {
  for (const role of DEFAULT_ROLES) {
    await run(
      `INSERT INTO tenant_roles
        (id, tenant_id, role_key, display_name, description, is_system, created_by, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [generateId('rol'), tenant.id, role.roleKey, role.displayName, role.description, owner.id]
    );
  }

  for (const feePlan of DEFAULT_FEE_PLANS) {
    await run(
      `INSERT INTO fee_plans
        (
          tenant_id,
          student_id,
          courseProgram,
          feeCategory,
          paymentType,
          totalAmount,
          discountAmount,
          feeStatus,
          name,
          course_type,
          amount,
          billing_cycle,
          duration_months,
          is_default,
          created_by,
          createdAt,
          updatedAt,
          created_at,
          updated_at,
          deleted_at
        )
       VALUES (?, NULL, ?, 'Course', ?, ?, 0, 'Default', ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [
        tenant.id,
        feePlan.name,
        feePlan.billingCycle,
        feePlan.amount,
        feePlan.name,
        feePlan.courseType,
        feePlan.amount,
        feePlan.billingCycle,
        feePlan.durationMonths,
        owner.id,
      ]
    );
  }

  await createDefaultFeeStructures({
    tenantId: tenant.id,
    branchId,
    academicYear: DEFAULT_ACADEMIC_YEAR,
  });

  for (const template of DEFAULT_MESSAGE_TEMPLATES) {
    await run(
      `INSERT INTO message_templates
        (
          tenant_id,
          templateKey,
          displayName,
          name,
          channel,
          category,
          body,
          variables,
          status,
          is_default,
          updatedBy,
          created_by,
          createdAt,
          updatedAt,
          deleted_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [
        tenant.id,
        `${tenant.slug || tenantSlug}_${slugify(template.name)}`,
        template.name,
        template.name,
        template.channel,
        template.category,
        template.body,
        JSON.stringify(template.variables || []),
        owner.email,
        owner.id,
      ]
    );
  }

  for (const metric of DEFAULT_DASHBOARD_METRICS) {
    await run(
      `INSERT INTO dashboard_sample_metrics
        (id, tenant_id, metric_key, metric_label, metric_value, created_by, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [generateId('met'), tenant.id, metric.metricKey, metric.metricLabel, metric.metricValue, owner.id]
    );
  }

  for (const item of DEFAULT_CHECKLIST_ITEMS) {
    await run(
      `INSERT INTO tenant_onboarding_checklist
        (id, tenant_id, checklist_key, label, is_completed, created_by, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [generateId('chk'), tenant.id, item.key, item.label, owner.id]
    );
  }
}

function publicOnboardingResult({ tenant, owner, branch, deliveryStatus, resumed = false }) {
  return {
    tenant: {
      id: tenant.tenant_id || tenant.id,
      name: tenant.name || tenant.tenant_name,
      slug: tenant.slug || tenant.tenant_slug,
      status: tenant.status || tenant.tenant_status || 'pending_verification',
      subscriptionStatus: tenant.subscriptionStatus || tenant.tenant_subscription_status || 'pending_verification',
      plan: tenant.plan || tenant.tenant_plan || 'trial',
    },
    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
    },
    ...(branch ? { branch } : {}),
    deliveryStatus,
    ...(resumed ? { resumed: true } : {}),
  };
}

async function processOwnerOutbox(token) {
  const delivery = await processEmailOutboxRecord(token.outboxId);
  return delivery.status;
}

async function createNewPendingOnboarding({ input, tenantSlug, ownerEmail, ownerPhone, passwordHash }) {
  return transaction(async () => {
    const insertedTenant = await createTenant(input, tenantSlug, ownerEmail, ownerPhone);
    const owner = await createOwnerUser({
      tenantId: insertedTenant.id,
      input,
      ownerEmail,
      passwordHash,
    });

    await run(
      `UPDATE tenants
       SET created_by = ?
       WHERE id = ?`,
      [owner.id, insertedTenant.id]
    );

    await createPendingSubscription({ tenantId: insertedTenant.id });
    const branch = await createBranch({ tenant: insertedTenant, input, owner });
    await seedTenantDefaults({ tenant: insertedTenant, owner, branchId: branch.id, tenantSlug });
    const verificationToken = await createVerificationTokenForOwner(owner);
    const tenant = await get(`SELECT * FROM tenants WHERE id = ?`, [insertedTenant.id]);

    return {
      tenant,
      owner,
      branch,
      verificationToken,
    };
  });
}

async function createReplacementTokenForPendingOwner(pendingOwner) {
  return transaction(async () => createVerificationTokenForOwner(pendingOwner));
}

async function createTenantOnboarding(input) {
  const ownerEmail = await validateOnboardingInput(input);
  await assertEmailAvailableForOnboarding(ownerEmail);

  const pendingOwner = await findPendingOwnerOnboarding(ownerEmail);
  if (pendingOwner) {
    const token = await createReplacementTokenForPendingOwner(pendingOwner);
    const deliveryStatus = await processOwnerOutbox(token);
    return publicOnboardingResult({
      tenant: pendingOwner,
      owner: pendingOwner,
      deliveryStatus,
      resumed: true,
    });
  }

  const ownerPhone = input.ownerPhone ? String(input.ownerPhone).trim() : null;
  const tenantSlug = await ensureUniqueTenantSlug(slugify(input.instituteName));
  const passwordHash = await hashPassword(input.ownerPassword);
  const onboarding = await createNewPendingOnboarding({
    input,
    tenantSlug,
    ownerEmail,
    ownerPhone,
    passwordHash,
  });

  const deliveryStatus = await processOwnerOutbox(onboarding.verificationToken);
  return publicOnboardingResult({
    tenant: onboarding.tenant,
    owner: onboarding.owner,
    branch: onboarding.branch,
    deliveryStatus,
  });
}

module.exports = {
  createTenantOnboarding,
  createVerificationTokenForOwner,
};
