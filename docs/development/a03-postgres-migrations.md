# A03: PostgreSQL initialization and migration safety

The canonical `migrate()` entry point now creates a fresh PostgreSQL schema, upgrades an existing schema, and seeds defaults in one transaction on one dedicated client. It acquires a transaction advisory lock before inspecting or changing the schema, so simultaneous API startups cannot race table creation or seed records. Commit, rollback, or connection loss releases that lock. Queries outside this migration context continue to use the pool.

The `students` table is created before the seven tables with foreign keys referencing it. PostgreSQL column additions use `ADD COLUMN IF NOT EXISTS`; a caught duplicate-column error would otherwise leave the enclosing transaction aborted. SQLite's canonical startup also uses one transaction, with same-process calls sharing a single migration promise.

Default tenant ownership is established before per-tenant academic and settings backfills. Seeded administrator metadata is populated at creation and its email remains unverified across restarts. Message templates receive their tenant and creator metadata immediately. Existing legacy users retain the earlier migration policy; that policy still requires the focused A06 identity review.

## Reproducible verification

Use PostgreSQL 18 on a disposable local cluster and a fixture administrator with permission to create and drop databases. Never supply an institution database connection. The harness requires an explicit loopback connection to the `postgres` maintenance database and does not read `.env`. It creates random `institute_migration_test_` databases, confines child migrations to those names, and drops only databases that this run created.

```powershell
$env:POSTGRES_TEST_ADMIN_URL='postgresql://fixture_user@127.0.0.1:55479/postgres'
npm.cmd run test:postgres:migrations
npm.cmd run verify
```

The five real PostgreSQL cases cover:

1. Fresh initialization and repeated startup, including schema, every row, indexes, constraints, triggers, default branch/settings, template ownership, and the seed administrator's unverified state.
2. Two independent startup processes, with the second observed waiting for the first process's advisory lock.
3. An older two-tenant schema upgrade preserving student IDs, original values, custom columns/indexes, and identity allocation; repeated startup must preserve the upgraded records.
4. A late seed failure after schema changes and backfills, proving that the entire earlier schema and data are restored, followed by a successful retry.
5. A failure during initial schema creation, proving that no partial tables, columns, indexes, or constraints remain, followed by a successful retry.

The required GitHub Actions job runs the complete 12-stage verification gate with a PostgreSQL 18 service. Missing PostgreSQL test configuration fails verification; the migration suite is never silently skipped. The revision-linked CI evidence includes `test:postgres:migrations` alongside the existing build, SQLite, authorization, mail, import, API smoke, and browser stages.

## Scope and release boundary

The atomic guarantee applies to canonical startup through `migrate()`. Individually exported maintenance migration functions are not independently wrapped. PostgreSQL sequences can advance during a rolled-back transaction; existing IDs are preserved and gaps are expected. Successful upgrades are not automatically downgraded; restore a verified backup for a deliberate rollback of a committed deployment.

This task does not certify tenant isolation, identity recovery, provider SMTP delivery, payment correctness, scheduled backups, or staging readiness. A04-A12 remain required. The dependency audit's existing advisories and uncommitted experimental implementations in other worktrees are separate follow-up work. No institutional database or deployment is used by these tests.
