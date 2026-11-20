# Institute OS — Phase A Verification Baseline

**Captured:** 2026-11-20  
**Commit under examination:** main `354a29192e63efdd70353ea1065fe554e5797005`  
**Evidence class:** read-only GitHub inspection; **no local checkout/test execution by this review**.

## Summary of observed execution

| Execution | Commit / branch | Result | Meaning |
|---|---|---|---|
| [Main CI run 44540980492](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/44540980492) | `354a291` / main, 2026-11-19 | **FAILURE / incomplete** | `npm ci` finished; Playwright browser installation failed; `npm run verify` was **skipped** |
| [PR #4 CI run 38395762390](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/38395762390) | `fd82d00` / `agent/integrate-security-atomic-onboarding`, 2026-10-13 | **SUCCESS** | Historical branch pipeline pass only, not a post-merge main pass |
| [PR #5 CI run 38396611095](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/38396611095) | `58c0831` / school enquiry draft, 2026-10-13 | **SUCCESS** | Historical draft branch CI pass; does not certify current main or deployed SSKEMS integration |
| Local developer checkout | Not accessible | **NOT RUN / NOT VERIFIED** | Cannot claim actual local install, tree cleanliness, SMTP, database or browser tests |
| CRM PostgreSQL staging / email / restore / tenant owners | No execution evidence provided | **NOT VERIFIED** | Required for pilot readiness |

### Root-cause details of latest main CI failure

Workflow: `.github/workflows/verify.yml`, job **Build, security, data safety, and end-to-end tests**. Job 135618916649, 2026-11-19:
- Checkout: success
- Node setup: success
- Install from lockfile (`npm ci`): success
- Browser installation (`npx playwright install --with-deps chromium`): **failed**
- Error: `ERROR: Playwright does not support chromium on ubuntu26.04-x64`
- GitHub runner: Ubuntu 26.04 (`ubuntu-latest` selected a newer image)
- `npm run verify`: skipped, therefore **no result** for build/security/mail/import/smoke/UI checks on main.

**A02 proposed remedy:** use a supported runner such as `ubuntu-24.04` for the workflow if compatible with the installed Playwright version, or upgrade and validate the Playwright/tooling compatibility as a separate reviewed change. Prove the full verification stage actually executes before reporting success. Avoid broad dependency upgrades without risk analysis.

## Verified code-defined test commands (not executed in this A01 review)

Existing root `package.json` contains:

```bash
npm ci
npm run build
npm run check:env
npm run check:legacy
npm run check:tenant
npm run check:security
npm run test:data-safety
npm run test:mail
npm run test:authz
npm run test:imports
npm run test:smoke
npm run test:ui
npm run verify
```

`scripts/verify.mjs` orchestrates a local isolated SQLite fixture and the 11 stages: `build`, `check:env`, `check:legacy`, `check:tenant`, `check:security`, `test:data-safety`, `test:mail`, `test:authz`, `test:imports`, `test:smoke`, `test:ui`.

**Scope caveat:** the orchestrator uses a local temporary SQLite database for its main test process. A passing `npm run verify` does **not alone** prove end-to-end behavior or concurrency on a persistent isolated PostgreSQL database. PostgreSQL-specific tests and a staging release gate must be tracked separately.

### Current test surface

| Area | Existing files / scripts | A01 observation | A02/A03 required proof |
|---|---|---|---|
| Environment contract | `scripts/check-environment-contract.mjs`, `server/config/env.js` | Source exists | Tests execute in current CI; invalid production config fails closed |
| Tenant route scanner | `scripts/check-tenant-enforcement.mjs` | Static scanner exists | Negative tenant query tests and unauthenticated route coverage, not only middleware pattern checks |
| Security configuration | `scripts/check-security-baseline.mjs` | Source exists | Current CI pass and live staging proxy/CORS/auth tests |
| Onboarding | `scripts/audit-onboarding-lifecycle.mjs`, `auth.routes.js` | Code present | Full verification/invite/login/logout/recovery tests |
| Mail and outbox | `server/tests/mail.service.integration.test.js`, `server/tests/email-outbox.lifecycle.test.js` | Tests exist | Current CI plus private test SMTP delivery and worker/retry drills |
| Imports/rollback | `server/tests/imports.transaction.test.js`, `scripts/sqlite-data-safety.mjs` | Tests exist | Current CI and real PostgreSQL rollback/constraints |
| Student follow-up authorization | `server/tests/student-followups.authorization.test.js` | Tests exist | Extend to all sensitive student/guardian routes |
| API smoke | `scripts/smoke-test.mjs` | Source exists | Current CI pass; staging API test after deployment |
| Browser E2E | `tests/ui/app.spec.js`, `playwright.config.js` | Source exists | Install browser on supported runner; run and record results |
| PostgreSQL backup and restore | `scripts/postgres-data-safety.mjs` | Scripts exist | Fresh backup/restore proof against disposable target |
| Pilot readiness | `scripts/pilot-readiness.mjs` | Reads tenant, verified owner, audit, Postgres backup, restore and verification evidence | `READY` on an actual nonproduction tenant before pilot |

## Local developer reproduction (safe)

Run from the **actual checkout**, with no secrets in output and only disposable test environments. Do not execute migrations or destructive tests against shared/prod databases.

```powershell
git status --short
git log -1 --oneline
npm ci
npx playwright install chromium
npm run verify
```

For POSIX hosts, analogous commands apply. `verify` attempts to use ports 4000 and 5173 and may fail safely if an unknown API process is already bound to them. Do not redirect test execution to production servers.

Once isolated PostgreSQL staging is configured, separately execute **with approved private environment variables**:

```powershell
npm run backup:postgres
npm run restore:verify:postgres
npm run pilot:readiness -- --tenant-id <DISPOSABLE_STAGING_TENANT_ID>
```

The readiness report must include: an active or trialing tenant, active verified owner, audit records, schema/constraints, a recent valid backup, matching recent restore proof, and a recent complete verification proof. Merely generating a report file is not equivalent to `READY`.

## Outstanding release-gate evidence register

| Proof | Status as of A01 review | Evidence required |
|---|---|---|
| Exact local changes and uncommitted security patches | UNKNOWN | Actual checkout `git status`, diff, stash and inventory; do not reveal secrets |
| Full CI on merged main | FAIL / INCOMPLETE | Green `npm run verify` execution on commit containing fixes |
| Separate tenant A and tenant B records; negative cross-access | NOT VERIFIED | Repeatable API/DB tests across major modules |
| Unauthenticated parent lookup closed | OPEN P0 | Route code fix, unauthorized/authorized negative tests |
| SMTP provider test | NOT VERIFIED | Private SMTP host configuration and successful test delivery |
| Staging PostgreSQL connection, TLS, owner/branch | NOT VERIFIED | Deployment/DB metadata and test tenant records |
| PostgreSQL backup/restore | NOT VERIFIED | Checksum, restore proof and recovery drill |
| Readiness | NOT VERIFIED | `pilot:readiness` exit code 0 with `READY` |
| SSKEMS website-to-CRM bridge | NOT VERIFIED / draft | PR reconciliation, disabled-by-default flags, synthetic staging form acceptance |

No secret values, passwords or connection strings are recorded in these documents.

## Recommendation after A01

1. Validate the actual developer checkout and resolve any uncommitted changes that might conflict with this inventory.
2. **A02:** repair the GitHub Actions Playwright runner compatibility and require a current green `npm run verify` including the full test list.
3. Treat the parent-portal endpoint as an urgent P0 and do **not** expose the CRM publicly with real student records. Plan a focused remediation/negative-test PR under A04/A07/A08 (or emergency mitigation immediately if already exposed).
4. Then use an isolated PostgreSQL staging environment, never production, to establish A03 onward.

This file records historical verification evidence, not test results produced by this documentation-only A01 change.
