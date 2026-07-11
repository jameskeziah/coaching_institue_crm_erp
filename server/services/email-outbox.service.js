const { generateId } = require('./token.service');
const { run, get, all } = require('./db.service');
const {
  sendInviteEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  MailDeliveryError,
  isMailDeliveryError,
} = require('./mail.service');

const MAX_ATTEMPTS = 5;
const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000;

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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

function shouldRetry(error, attemptCount) {
  return deliveryErrorCode(error) === 'MAIL_TRANSPORT_ERROR' && Number(attemptCount || 0) < MAX_ATTEMPTS;
}

function linkedDeliveryTarget(record) {
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
  type,
  recipient,
  payload,
}) {
  await run(
    `INSERT INTO email_outbox
      (id, tenant_id, user_id, token_id, invite_id, type, recipient, payload, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      id,
      tenantId || null,
      userId || null,
      tokenId,
      inviteId,
      type,
      recipient,
      JSON.stringify(payload || {}),
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

async function sendRecord(record, mailService = {}) {
  const payload = safeJsonParse(record.payload);
  const type = record.type;
  const verificationSender = mailService.sendVerificationEmail || sendVerificationEmail;
  const passwordResetSender = mailService.sendPasswordResetEmail || sendPasswordResetEmail;
  const inviteSender = mailService.sendInviteEmail || sendInviteEmail;

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

  throw new MailDeliveryError('Unsupported email outbox type', {
    code: 'MAIL_CONFIGURATION_ERROR',
  });
}

async function markOutboxSent(record, result) {
  await run(
    `UPDATE email_outbox
     SET status = 'sent',
         payload = NULL,
         sent_at = CURRENT_TIMESTAMP,
         provider_message_id = ?,
         last_error_code = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [result?.messageId || null, record.id]
  );
  await updateLinkedDelivery(record, 'sent', { messageId: result?.messageId || null });
}

async function markOutboxSkipped(record) {
  await run(
    `UPDATE email_outbox
     SET status = 'skipped',
         locked_at = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [record.id]
  );
  await updateLinkedDelivery(record, 'skipped');
}

async function markOutboxFailed(record, error) {
  const errorCode = deliveryErrorCode(error);
  const status = shouldRetry(error, record.attempt_count) ? 'retry' : 'failed';
  const nextAttemptAt = status === 'retry' ? addRetryDelay(record.attempt_count) : null;
  const clearPayload = status === 'failed' ? 1 : 0;

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

async function processDueEmailOutboxRecords({
  limit = 20,
  workerId = `worker-${process.pid}`,
  staleAfterMs = DEFAULT_STALE_LOCK_MS,
  mailService,
} = {}) {
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
  deliveryErrorCode,
};
