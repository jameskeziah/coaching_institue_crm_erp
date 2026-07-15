const crypto = require('crypto');
const { env } = require('../config/env');
const { generateId } = require('./token.service');
const { run, get, all, transaction } = require('./db.service');
const {
  sendInviteEmail,
  sendOwnerRecoveryEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  MailDeliveryError,
  isMailDeliveryError,
} = require('./mail.service');

const MAX_ATTEMPTS = 5;
const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000;
const DEFAULT_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFICATION_EMAIL_TYPES = new Set(['owner_email_verification', 'user_email_verification']);

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function encryptionKey() {
  return crypto.createHash('sha256').update(String(env.JWT_SECRET)).digest();
}

function encryptPayload(payload) {
  if (!payload) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return JSON.stringify({
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptPayload(envelope) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(envelope.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

function readPayload(value) {
  const parsed = safeJsonParse(value);
  if (parsed?.v === 1 && parsed?.alg === 'aes-256-gcm') {
    return decryptPayload(parsed);
  }
  return parsed;
}

function changesCount(result) {
  return Number(result?.changes ?? result?.rowCount ?? 0);
}

function toSqlTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function addRetryDelay(attemptCount) {
  const delayMinutes = Math.min(60, 2 ** Math.max(Number(attemptCount || 1) - 1));
  const date = new Date();
  date.setMinutes(date.getMinutes() + delayMinutes);
  return toSqlTimestamp(date);
}

function deliveryErrorCode(error) {
  const code = String(error?.code || '');
  return code.startsWith('MAIL_') ? code : 'MAIL_TRANSPORT_ERROR';
}

function isVerificationEmailRecord(record) {
  return VERIFICATION_EMAIL_TYPES.has(record?.type);
}

function shouldRetry(error, attemptCount) {
  return deliveryErrorCode(error) === 'MAIL_TRANSPORT_ERROR' && Number(attemptCount || 0) < MAX_ATTEMPTS;
}

function linkedDeliveryTarget(record) {
  if (record.owner_recovery_request_id || record.ownerRecoveryRequestId) {
    return {
      table: 'tenant_owner_recovery_requests',
      id: record.owner_recovery_request_id || record.ownerRecoveryRequestId,
    };
  }
  if (record.token_id || record.tokenId) {
    const type = record.type;
    return {
      table: type === 'password_reset' ? 'password_reset_tokens' : 'email_verification_tokens',
      id: record.token_id || record.tokenId,
    };
  }

  if (record.invite_id || record.inviteId) {
    return {
      table: 'user_invites',
      id: record.invite_id || record.inviteId,
    };
  }

  return null;
}

async function updateLinkedDelivery(record, status, { messageId = null, errorCode = null } = {}) {
  const target = linkedDeliveryTarget(record);
  if (!target) return;

  if (status === 'sending') {
    await run(
      `UPDATE ${target.table}
       SET delivery_status = 'sending',
           delivery_attempt_count = COALESCE(delivery_attempt_count, 0) + 1,
           delivery_last_attempt_at = CURRENT_TIMESTAMP,
           delivery_last_error_code = NULL
       WHERE id = ?`,
      [target.id]
    );
    return;
  }

  if (status === 'sent') {
    await run(
      `UPDATE ${target.table}
       SET delivery_status = 'sent',
           delivery_sent_at = CURRENT_TIMESTAMP,
           delivery_provider_message_id = ?,
           delivery_last_error_code = NULL
       WHERE id = ?`,
      [messageId, target.id]
    );
    return;
  }

  await run(
    `UPDATE ${target.table}
     SET delivery_status = ?,
         delivery_last_error_code = ?
     WHERE id = ?`,
    [status, errorCode, target.id]
  );
}

async function createEmailOutboxRecord({
  id = generateId('eml'),
  tenantId,
  userId,
  tokenId = null,
  inviteId = null,
  ownerRecoveryRequestId = null,
  type,
  recipient,
  payload,
}) {
  await run(
    `INSERT INTO email_outbox
      (id, tenant_id, user_id, token_id, invite_id, owner_recovery_request_id, type, recipient, payload, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      id,
      tenantId || null,
      userId || null,
      tokenId,
      inviteId,
      ownerRecoveryRequestId,
      type,
      recipient,
      encryptPayload(payload || {}),
    ]
  );

  return id;
}

async function claimEmailOutboxRecord(id, workerId = `inline-${process.pid}`) {
  const now = toSqlTimestamp();
  const claimed = await run(
    `UPDATE email_outbox
     SET status = 'processing',
         attempt_count = COALESCE(attempt_count, 0) + 1,
         last_attempt_at = CURRENT_TIMESTAMP,
         locked_at = CURRENT_TIMESTAMP,
         locked_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND status IN ('pending', 'retry')
       AND (next_attempt_at IS NULL OR REPLACE(next_attempt_at, 'T', ' ') <= ?)`,
    [workerId, id, now]
  );

  if (changesCount(claimed) !== 1) {
    return null;
  }

  const record = await get(`SELECT * FROM email_outbox WHERE id = ?`, [id]);
  await updateLinkedDelivery(record, 'sending');
  return record;
}

async function ensureRecordSendable(record) {
  if (record.owner_recovery_request_id || record.ownerRecoveryRequestId) {
    const request = await get(`SELECT * FROM tenant_owner_recovery_requests WHERE id = ?`, [record.owner_recovery_request_id || record.ownerRecoveryRequestId]);
    if (!request) return { sendable: false, reason: 'OWNER_RECOVERY_NOT_FOUND' };
    if (request.accepted_at || request.acceptedAt) return { sendable: false, reason: 'OWNER_RECOVERY_ACCEPTED' };
    if (request.revoked_at || request.revokedAt) return { sendable: false, reason: 'OWNER_RECOVERY_REVOKED' };
    if (new Date(request.expires_at || request.expiresAt).getTime() <= Date.now()) return { sendable: false, reason: 'OWNER_RECOVERY_EXPIRED' };
    return { sendable: true, request };
  }

  if (record.invite_id || record.inviteId) {
    const invite = await get(`SELECT * FROM user_invites WHERE id = ?`, [record.invite_id || record.inviteId]);
    if (!invite) return { sendable: false, reason: 'INVITE_NOT_FOUND' };
    if (invite.accepted_at || invite.acceptedAt) return { sendable: false, reason: 'INVITE_ACCEPTED' };
    if (invite.revoked_at || invite.revokedAt) return { sendable: false, reason: 'INVITE_REVOKED' };
    if (new Date(invite.expires_at || invite.expiresAt).getTime() <= Date.now()) return { sendable: false, reason: 'INVITE_EXPIRED' };
    return { sendable: true, invite };
  }

  if (!isVerificationEmailRecord(record)) return { sendable: true };

  const token = await get(
    `SELECT tokens.*,
            users.email_verified_at,
            users.deleted_at AS user_deleted_at
     FROM email_verification_tokens tokens
     JOIN users
       ON users.id = tokens.user_id
      AND users.tenant_id = tokens.tenant_id
     WHERE tokens.id = ?`,
    [record.token_id || record.tokenId]
  );

  if (!token) return { sendable: false, reason: 'TOKEN_NOT_FOUND' };
  if (token.user_deleted_at) return { sendable: false, reason: 'USER_DELETED' };
  if (token.email_verified_at) return { sendable: false, reason: 'USER_ALREADY_VERIFIED' };
  if (token.used_at || token.usedAt) return { sendable: false, reason: 'TOKEN_USED' };
  if (token.superseded_at || token.supersededAt) return { sendable: false, reason: 'TOKEN_SUPERSEDED' };
  if (token.revoked_at || token.revokedAt) return { sendable: false, reason: 'TOKEN_REVOKED' };
  if (new Date(token.expires_at || token.expiresAt).getTime() <= Date.now()) {
    return { sendable: false, reason: 'TOKEN_EXPIRED' };
  }

  return { sendable: true, token };
}

async function sendRecord(record, mailService = {}) {
  const payload = readPayload(record.payload);
  const type = record.type;
  const verificationSender = mailService.sendVerificationEmail || sendVerificationEmail;
  const passwordResetSender = mailService.sendPasswordResetEmail || sendPasswordResetEmail;
  const inviteSender = mailService.sendInviteEmail || sendInviteEmail;
  const ownerRecoverySender = mailService.sendOwnerRecoveryEmail || sendOwnerRecoveryEmail;

  if (type === 'owner_email_verification' || type === 'user_email_verification') {
    return verificationSender({
      email: record.recipient,
      token: payload.token,
    });
  }

  if (type === 'password_reset') {
    return passwordResetSender({
      email: record.recipient,
      token: payload.token,
    });
  }

  if (type === 'user_invite') {
    return inviteSender({
      email: record.recipient,
      token: payload.token,
    });
  }

  if (type === 'owner_recovery_invite') {
    return ownerRecoverySender({
      email: record.recipient,
      token: payload.token,
      instituteName: payload.instituteName,
      expiresAt: payload.expiresAt,
    });
  }

  throw new MailDeliveryError('Unsupported email outbox type', {
    code: 'MAIL_CONFIGURATION_ERROR',
  });
}

async function markOutboxSent(record, result) {
  await transaction(async () => {
    await run(
      `UPDATE email_outbox
       SET status = 'sent',
           payload = NULL,
           sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
           provider_message_id = COALESCE(provider_message_id, ?),
           last_error_code = NULL,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result?.messageId || null, record.id]
    );
    await updateLinkedDelivery(record, 'sent', { messageId: result?.messageId || null });

    if (!isVerificationEmailRecord(record)) return;

    const currentToken = await get(
      `SELECT id, user_id, tenant_id, created_at
       FROM email_verification_tokens
       WHERE id = ?`,
      [record.token_id || record.tokenId]
    );
    if (!currentToken) return;

    await run(
      `UPDATE email_verification_tokens
       SET superseded_at = CURRENT_TIMESTAMP,
           superseded_by_token_id = ?
       WHERE user_id = ?
         AND tenant_id = ?
         AND id != ?
         AND used_at IS NULL
         AND superseded_at IS NULL
         AND revoked_at IS NULL
         AND created_at < ?`,
      [
        currentToken.id,
        currentToken.user_id || currentToken.userId,
        currentToken.tenant_id || currentToken.tenantId,
        currentToken.id,
        currentToken.created_at || currentToken.createdAt,
      ]
    );
  });
}

async function markOutboxSkipped(record) {
  await run(
    `UPDATE email_outbox
     SET status = 'skipped',
         payload = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [record.id]
  );
  await updateLinkedDelivery(record, 'skipped');
}

async function markOutboxCancelled(record, reason) {
  await transaction(async () => {
    await run(
      `UPDATE email_outbox
       SET status = 'cancelled',
           payload = NULL,
           locked_at = NULL,
           locked_by = NULL,
           last_error_code = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, record.id]
    );
    await updateLinkedDelivery(record, 'cancelled', { errorCode: reason });

    if (!isVerificationEmailRecord(record)) return;

    await run(
      `UPDATE email_verification_tokens
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, ?),
           revocation_reason = COALESCE(revocation_reason, ?)
       WHERE id = ?
         AND used_at IS NULL
         AND superseded_at IS NULL
         AND revoked_at IS NULL`,
      [reason, reason, record.token_id || record.tokenId]
    );
  });
}

async function markOutboxFailed(record, error) {
  const errorCode = deliveryErrorCode(error);
  const status = shouldRetry(error, record.attempt_count) ? 'retry' : 'failed';
  const nextAttemptAt = status === 'retry' ? addRetryDelay(record.attempt_count) : null;
  const clearPayload = status === 'failed' ? 1 : 0;

  await transaction(async () => {
    await run(
      `UPDATE email_outbox
       SET status = ?,
           next_attempt_at = ?,
           last_error_code = ?,
           payload = CASE WHEN ? = 1 THEN NULL ELSE payload END,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, nextAttemptAt, errorCode, clearPayload, record.id]
    );
    await updateLinkedDelivery(record, status, { errorCode });

    if (status !== 'failed' || !isVerificationEmailRecord(record)) return;

    await run(
      `UPDATE email_verification_tokens
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, ?),
           revocation_reason = COALESCE(revocation_reason, ?)
       WHERE id = ?
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      [errorCode, errorCode, record.token_id || record.tokenId]
    );
  });
}

async function processEmailOutboxRecord(id, options = {}) {
  const record = await claimEmailOutboxRecord(id, options.workerId);
  if (!record) {
    return {
      processed: false,
      status: 'not_claimed',
    };
  }

  try {
    const sendable = await ensureRecordSendable(record);
    if (!sendable.sendable) {
      await markOutboxCancelled(record, sendable.reason);
      return {
        processed: true,
        status: 'cancelled',
        reason: sendable.reason,
      };
    }

    const result = await sendRecord(record, options.mailService);
    if (result?.skipped) {
      await markOutboxSkipped(record);
      return {
        processed: true,
        status: 'skipped',
        result,
      };
    }

    await markOutboxSent(record, result);
    return {
      processed: true,
      status: 'sent',
      result,
    };
  } catch (error) {
    await markOutboxFailed(record, error);
    throw error;
  }
}

async function recoverStaleEmailOutboxRecords({
  staleAfterMs = DEFAULT_STALE_LOCK_MS,
  staleBefore,
} = {}) {
  const cutoff = staleBefore
    ? toSqlTimestamp(new Date(staleBefore))
    : toSqlTimestamp(new Date(Date.now() - staleAfterMs));

  const recovered = await run(
    `UPDATE email_outbox
     SET status = 'retry',
         locked_at = NULL,
         locked_by = NULL,
         next_attempt_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'processing'
       AND locked_at IS NOT NULL
       AND REPLACE(locked_at, 'T', ' ') < ?`,
    [cutoff]
  );

  return changesCount(recovered);
}

async function cleanupEmailOutboxRecords({
  terminalRetentionMs = DEFAULT_TERMINAL_RETENTION_MS,
} = {}) {
  const now = toSqlTimestamp();
  const terminalCutoff = toSqlTimestamp(new Date(Date.now() - terminalRetentionMs));

  await run(
    `UPDATE email_verification_tokens
     SET revoked_at = CURRENT_TIMESTAMP,
         revoke_reason = COALESCE(revoke_reason, 'expired'),
         revocation_reason = COALESCE(revocation_reason, 'expired')
     WHERE used_at IS NULL
       AND superseded_at IS NULL
       AND revoked_at IS NULL
       AND REPLACE(expires_at, 'T', ' ') <= ?`,
    [now]
  );

  await run(
    `UPDATE email_outbox
     SET status = 'cancelled',
         payload = NULL,
         locked_at = NULL,
         locked_by = NULL,
         last_error_code = 'TOKEN_EXPIRED',
         updated_at = CURRENT_TIMESTAMP
     WHERE status IN ('pending', 'retry')
       AND token_id IN (
         SELECT id
         FROM email_verification_tokens
         WHERE revoked_at IS NOT NULL
           AND revocation_reason = 'expired'
       )`,
  );

  const deleted = await run(
    `DELETE FROM email_outbox
     WHERE status IN ('sent', 'failed', 'cancelled', 'skipped')
       AND REPLACE(updated_at, 'T', ' ') < ?`,
    [terminalCutoff]
  );

  return {
    terminalDeleted: changesCount(deleted),
  };
}

async function processDueEmailOutboxRecords({
  limit = 20,
  workerId = `worker-${process.pid}`,
  staleAfterMs = DEFAULT_STALE_LOCK_MS,
  mailService,
} = {}) {
  await cleanupEmailOutboxRecords();
  await recoverStaleEmailOutboxRecords({ staleAfterMs });

  const now = toSqlTimestamp();
  const records = await all(
    `SELECT id
     FROM email_outbox
     WHERE status IN ('pending', 'retry')
       AND (next_attempt_at IS NULL OR REPLACE(next_attempt_at, 'T', ' ') <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [now, limit]
  );

  const results = [];

  for (const record of records) {
    try {
      results.push(await processEmailOutboxRecord(record.id, { workerId, mailService }));
    } catch (error) {
      const current = await get(`SELECT status FROM email_outbox WHERE id = ?`, [record.id]);
      results.push({
        processed: true,
        status: current?.status || 'failed',
        errorCode: deliveryErrorCode(error),
      });
    }
  }

  return results;
}

module.exports = {
  createEmailOutboxRecord,
  processEmailOutboxRecord,
  processDueEmailOutboxRecords,
  recoverStaleEmailOutboxRecords,
  cleanupEmailOutboxRecords,
  deliveryErrorCode,
};
