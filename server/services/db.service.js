const { AsyncLocalStorage } = require('async_hooks');
const db = require('../db');

const transactionContext = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();

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

function currentTransaction() {
  return transactionContext.getStore() || null;
}

async function withSqliteLock(callback) {
  const previous = sqliteQueue;
  let release;
  sqliteQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

async function run(sql, params = []) {
  const context = currentTransaction();

  if (context?.client) {
    const result = await context.client.query(toPostgresSql(withReturningId(sql)), params);
    return {
      changes: result.rowCount,
      lastID: result.rows?.[0]?.id,
      rowCount: result.rowCount,
    };
  }

  if (!db.isPostgres && !context?.inTransaction) {
    return withSqliteLock(() => db.run(sql, params));
  }

  return db.run(sql, params);
}

async function get(sql, params = []) {
  const context = currentTransaction();

  if (context?.client) {
    const result = await context.client.query(toPostgresSql(sql), params);
    return normalizePostgresRows(result.rows)[0];
  }

  if (!db.isPostgres && !context?.inTransaction) {
    return withSqliteLock(() => db.get(sql, params));
  }

  return db.get(sql, params);
}

async function all(sql, params = []) {
  const context = currentTransaction();

  if (context?.client) {
    const result = await context.client.query(toPostgresSql(sql), params);
    return normalizePostgresRows(result.rows);
  }

  if (!db.isPostgres && !context?.inTransaction) {
    return withSqliteLock(() => db.all(sql, params));
  }

  return db.all(sql, params);
}

async function transaction(callback) {
  if (currentTransaction()?.inTransaction) return callback();

  if (!db.isPostgres) {
    return withSqliteLock(async () => {
      await db.run('BEGIN TRANSACTION');
      try {
        const result = await transactionContext.run({ dialect: 'sqlite', inTransaction: true }, callback);
        await db.run('COMMIT');
        return result;
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    });
  }

  const client = await db.db.connect();

  try {
    await client.query('BEGIN');
    const result = await transactionContext.run({ dialect: 'postgres', client, inTransaction: true }, callback);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  run,
  get,
  all,
  transaction,
};
