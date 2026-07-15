const { AsyncLocalStorage } = require('async_hooks');
const db = require('../db');

const transactionContext = new AsyncLocalStorage();
let sqliteTransactionQueue = Promise.resolve();

function currentTransaction() {
  return transactionContext.getStore() || null;
}

async function waitForSqliteTransaction(context) {
  if (!db.isPostgres && !context?.inTransaction) {
    await sqliteTransactionQueue;
  }
}

function normalizePostgresRows(rows) {
  return rows.map((row) => {
    const normalized = { ...row };
    Object.keys(normalized).forEach((key) => {
      if (!key.includes('_')) return;
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      if (normalized[camelKey] === undefined) normalized[camelKey] = normalized[key];
    });
    return normalized;
  });
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  if (!/^\s*insert\s+/i.test(sql) || /\breturning\b/i.test(sql)) return sql;
  return `${sql} RETURNING id`;
}

async function run(sql, params = []) {
  const context = currentTransaction();
  const client = context?.client;
  if (!client) {
    await waitForSqliteTransaction(context);
    return db.run(sql, params);
  }
  const result = await client.query(toPostgresSql(withReturningId(sql)), params);
  return {
    changes: result.rowCount,
    lastID: result.rows?.[0]?.id,
    rowCount: result.rowCount,
  };
}

async function get(sql, params = []) {
  const context = currentTransaction();
  const client = context?.client;
  if (!client) {
    await waitForSqliteTransaction(context);
    return db.get(sql, params);
  }
  const result = await client.query(toPostgresSql(sql), params);
  return normalizePostgresRows(result.rows)[0];
}

async function all(sql, params = []) {
  const context = currentTransaction();
  const client = context?.client;
  if (!client) {
    await waitForSqliteTransaction(context);
    return db.all(sql, params);
  }
  const result = await client.query(toPostgresSql(sql), params);
  return normalizePostgresRows(result.rows);
}

async function transaction(callback) {
  if (currentTransaction()?.inTransaction) {
    return callback();
  }

  if (!db.isPostgres) {
    let releaseQueue;
    const previousTransaction = sqliteTransactionQueue;
    sqliteTransactionQueue = new Promise((resolve) => {
      releaseQueue = resolve;
    });

    await previousTransaction;
    try {
      await db.run('BEGIN TRANSACTION');
      return await transactionContext.run({ inTransaction: true }, async () => {
        try {
          const result = await callback();
          await db.run('COMMIT');
          return result;
        } catch (error) {
          await db.run('ROLLBACK');
          throw error;
        }
      });
    } finally {
      releaseQueue();
    }
  }

  const client = await db.db.connect();
  return transactionContext.run({ client, inTransaction: true }, async () => {
    try {
      await client.query('BEGIN');
      const result = await callback();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}

module.exports = {
  run,
  get,
  all,
  transaction,
};
