const db = require('../db');

let activeTransactionClient = null;

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
  if (!activeTransactionClient) return db.run(sql, params);
  const result = await activeTransactionClient.query(toPostgresSql(withReturningId(sql)), params);
  return {
    changes: result.rowCount,
    lastID: result.rows?.[0]?.id,
    rowCount: result.rowCount,
  };
}

async function get(sql, params = []) {
  if (!activeTransactionClient) return db.get(sql, params);
  const result = await activeTransactionClient.query(toPostgresSql(sql), params);
  return normalizePostgresRows(result.rows)[0];
}

async function all(sql, params = []) {
  if (!activeTransactionClient) return db.all(sql, params);
  const result = await activeTransactionClient.query(toPostgresSql(sql), params);
  return normalizePostgresRows(result.rows);
}

async function transaction(callback) {
  if (activeTransactionClient) {
    return callback();
  }

  if (!db.isPostgres) {
    await db.run('BEGIN TRANSACTION');
    try {
      const result = await callback();
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  const client = await db.db.connect();
  activeTransactionClient = client;

  try {
    await client.query('BEGIN');
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    activeTransactionClient = null;
    client.release();
  }
}

module.exports = {
  run,
  get,
  all,
  transaction,
};
