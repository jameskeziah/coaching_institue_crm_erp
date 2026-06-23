const crypto = require('crypto');

const { run, get } = require('./db.service');
const { env } = require('../config/env');

const SECRET_FIELDS = [
  'razorpayKeySecret',
  'razorpayWebhookSecret',
];

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.FEE_CREDENTIAL_SECRET || env.JWT_SECRET)
    .digest();
}

function encryptSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  if (!value || !String(value).startsWith('v1:')) return null;
  const [, iv, tag, encrypted] = String(value).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function serializeSettings(row, { includeSecrets = false } = {}) {
  if (!row) return null;
  const result = {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    academicYear: row.academic_year ?? row.academicYear,
    currency: row.currency,
    defaultInstallmentCount: Number(row.default_installment_count ?? row.defaultInstallmentCount ?? 3),
    defaultInstallmentGapDays: Number(row.default_installment_gap_days ?? row.defaultInstallmentGapDays ?? 30),
    receiptPrefix: row.receipt_prefix ?? row.receiptPrefix,
    nextReceiptNumber: Number(row.next_receipt_number ?? row.nextReceiptNumber ?? 1),
    razorpayEnabled: Number(row.razorpay_enabled ?? row.razorpayEnabled ?? 0) === 1,
    razorpayKeyId: row.razorpay_key_id ?? row.razorpayKeyId,
    hasRazorpayKeySecret: Boolean(row.razorpay_key_secret_encrypted ?? row.razorpayKeySecretEncrypted),
    hasRazorpayWebhookSecret: Boolean(row.razorpay_webhook_secret_encrypted ?? row.razorpayWebhookSecretEncrypted),
    paymentLinkExpiryDays: Number(row.payment_link_expiry_days ?? row.paymentLinkExpiryDays ?? 7),
    autoSendPaymentLink: Number(row.auto_send_payment_link ?? row.autoSendPaymentLink ?? 0) === 1,
    discountApprovalRequired: Number(row.discount_approval_required ?? row.discountApprovalRequired ?? 1) === 1,
    maxAutoDiscountAmount: Number(row.max_auto_discount_amount ?? row.maxAutoDiscountAmount ?? 0),
    maxAutoDiscountPercent: Number(row.max_auto_discount_percent ?? row.maxAutoDiscountPercent ?? 0),
    authorizedSignatureUrl: row.authorized_signature_url ?? row.authorizedSignatureUrl,
    receiptFooterNote: row.receipt_footer_note ?? row.receiptFooterNote,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };

  if (includeSecrets) {
    result.razorpayKeySecret = decryptSecret(row.razorpay_key_secret_encrypted ?? row.razorpayKeySecretEncrypted);
    result.razorpayWebhookSecret = decryptSecret(row.razorpay_webhook_secret_encrypted ?? row.razorpayWebhookSecretEncrypted);
  }

  return result;
}

async function ensureTenantFeeSettings(tenantId) {
  let row = await get(`SELECT * FROM tenant_fee_settings WHERE tenant_id = ?`, [tenantId]);
  if (row) return row;

  await run(
    `INSERT INTO tenant_fee_settings
      (id, tenant_id, academic_year, currency, created_at, updated_at)
     VALUES (?, ?, '2026-27', 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [crypto.randomUUID(), tenantId]
  );
  row = await get(`SELECT * FROM tenant_fee_settings WHERE tenant_id = ?`, [tenantId]);
  return row;
}

async function getTenantFeeSettings(tenantId, options = {}) {
  const row = await ensureTenantFeeSettings(tenantId);
  return serializeSettings(row, options);
}

function normalizeUpdate(payload = {}) {
  const updates = {};
  const fieldMap = {
    academicYear: 'academic_year',
    currency: 'currency',
    defaultInstallmentCount: 'default_installment_count',
    defaultInstallmentGapDays: 'default_installment_gap_days',
    receiptPrefix: 'receipt_prefix',
    nextReceiptNumber: 'next_receipt_number',
    razorpayEnabled: 'razorpay_enabled',
    razorpayKeyId: 'razorpay_key_id',
    paymentLinkExpiryDays: 'payment_link_expiry_days',
    autoSendPaymentLink: 'auto_send_payment_link',
    discountApprovalRequired: 'discount_approval_required',
    maxAutoDiscountAmount: 'max_auto_discount_amount',
    maxAutoDiscountPercent: 'max_auto_discount_percent',
    authorizedSignatureUrl: 'authorized_signature_url',
    receiptFooterNote: 'receipt_footer_note',
  };

  Object.entries(fieldMap).forEach(([inputKey, column]) => {
    if (payload[inputKey] === undefined) return;
    if (typeof payload[inputKey] === 'boolean') {
      updates[column] = payload[inputKey] ? 1 : 0;
    } else {
      updates[column] = payload[inputKey];
    }
  });

  if (payload.razorpayKeySecret) {
    updates.razorpay_key_secret_encrypted = encryptSecret(payload.razorpayKeySecret);
  }
  if (payload.razorpayWebhookSecret) {
    updates.razorpay_webhook_secret_encrypted = encryptSecret(payload.razorpayWebhookSecret);
  }

  return updates;
}

async function updateTenantFeeSettings(tenantId, payload = {}) {
  await ensureTenantFeeSettings(tenantId);
  const updates = normalizeUpdate(payload);
  delete updates.tenant_id;
  delete updates.id;

  if (updates.max_auto_discount_percent !== undefined && Number(updates.max_auto_discount_percent) > 100) {
    throw new Error('maxAutoDiscountPercent cannot exceed 100');
  }

  const entries = Object.entries(updates);
  if (entries.length) {
    await run(
      `UPDATE tenant_fee_settings
       SET ${entries.map(([column]) => `${column} = ?`).join(', ')},
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?`,
      [...entries.map(([, value]) => value), tenantId]
    );
  }

  return getTenantFeeSettings(tenantId);
}

module.exports = {
  SECRET_FIELDS,
  decryptSecret,
  encryptSecret,
  ensureTenantFeeSettings,
  getTenantFeeSettings,
  updateTenantFeeSettings,
};
