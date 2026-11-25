const assert = require('node:assert/strict');

async function dropOwnedFixtureDatabase(administrator, databaseName) {
  assert.match(databaseName, /^institute_(academic|payment|receipt)_test_[a-f0-9]{16}$/);
  // Pool.end() can resolve before PostgreSQL has observed every socket close.
  // Wait for server-side disconnects rather than forcibly terminating clients
  // and emitting idle-pool errors after the test's assertions have completed.
  const deadline = Date.now() + 10000;
  for (;;) {
    const { rows } = await administrator.query(
      'SELECT pid FROM pg_stat_activity WHERE datname = $1', [databaseName]
    );
    if (rows.length === 0) break;
    if (Date.now() >= deadline) throw new Error(`Fixture connections did not close: ${databaseName}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await administrator.query(`DROP DATABASE "${databaseName}"`);
}

module.exports = { dropOwnedFixtureDatabase };
