# Institute OS — Phase A Build Backlog

**Created:** 2026-11-20 | **Source:** remote GitHub main `354a291` | **Status:** A01 remote inventory completed; local workspace reconciliation pending.

This document implements the A01 traceability requirement. **Only A01 documentation changes belong to this pull request.** No endpoint remediation, migrations, deployments, or PR merges are authorized by it.

## Rules for subsequent Codex tasks

- Start each task by inspecting the actual local working tree and any active uncommitted work. Preserve changes; do not reset, stash, or discard automatically.
- Compare against current remote main and open drafts before modifying overlapping files. Do not duplicate PR #4.
- Scope each follow-on PR to one item and add negative-role/cross-tenant/concurrency/rollback tests as relevant.
- Prefer transactions through the existing `server/services/db.service.js`; never read tenant IDs from request bodies in place of authenticated context.
- Do not add secrets to code, logs, tests, fixtures or documentation. Use disposable databases and fake people.
- Full testing and staging acceptance are independent gates. A GitHub-hosted CI pass does not verify live PostgreSQL, external email, payment gateways, or school publication approval.

## Classified work (P0 first)

| ID | Priority | Current status | Required implementation / review (not an assertion that everything is absent) | Key files | Dependencies | Acceptance and verification |
|---|---|---|---|---|---|---|
| **A01 — remote reconciliation inventory** | P0 | **Partially complete**; remote documented, user's local workspace inaccessible | Validate actual local `git status`, untracked/stashed work, current branch, main and competing #5/#7 integration; classify modules; record evidence | `docs/architecture/current-state.md`, `docs/development/build-backlog.md`, `docs/development/verification-baseline.md` | None | Three documents accurate, source-linked, preserve code; actual local reconciliation separately signed off before merging |
| **A02 — baseline and CI repair** | P0 | **Blocked by CI runner compatibility**, fix unblocked | Fix Playwright Chromium installation on `ubuntu-latest` (resolved to ubuntu-26.04); prefer reviewed supported runner or compatible Playwright; run clean lockfile install and `npm run verify`, recording per-stage failures | `.github/workflows/verify.yml`, `package.json`, `package-lock.json`, `playwright.config.js`, `scripts/verify.mjs` | A01 handoff | Fresh PR CI on main-derived branch passes all stages without skipping; failing tests converted to reproducible issues |
| **A03 — PostgreSQL fixture and migration verification** | P0 | **Partial / unverified on isolated real PostgreSQL** | Disposable PostgreSQL provisioning, clean creation, existing-data upgrade and transactional rollback tests; migration ordering and DDL behavior | `server/db.js`, `server/migrations/*`, `scripts/postgres-data-safety.mjs`, test fixtures | A02 | Schema and data constraints pass on fresh and upgraded isolated DB; zero production-data access |
| **A04 — tenant-isolation and legacy SQL audit** | P0 | **Unsafe: sensitive legacy exposure confirmed** | Audit all active endpoints, SQL reads, writes, joins and exports; explicitly tenant-scope resources and dependent tables; eliminate unauthenticated parent lookup; test two tenants | `server/routes/legacy.routes.js`, `server/routes/*.js`, `server/services/tenant-query.service.js`, `server/middleware/tenant.js` | A02–A03; parent-portal mitigation should be treated as urgent before any exposure | All cross-tenant read/write/list/delete attempts fail closed with no existence leaks; automated negative tests |
| **A05 — transaction and concurrency safety** | P0 | **Implemented code, runtime tests pending** | Verify merged AsyncLocalStorage, nested operations, direct DB bypasses, transaction abort and concurrent tenant writes | `server/services/db.service.js`, `server/db.js`, domain services, concurrent tests | A03–A04 | No interleaving, partial onboarding, partial fee postings or wrong-tenant writes |
| **A06 — atomic onboarding and identity lifecycle** | P0 | **Implemented code, full lifecycle unverified** | Exercise pending verification, owner activation, invite, reset, refresh/logout, token revocation, suspension and trial-state restrictions; fix demonstrated failures | `server/routes/auth.routes.js`, `onboarding.routes.js`, `users.routes.js`, `tenant-onboarding.service.js` | A03, A05 | No unauthorized activation, replay, partial tenant or privilege escalation; tests are deterministic |
| **A07 — RBAC/student/guardian privacy matrix** | P0 | **Partial / unsafe due parent lookup** | Define and enforce role+relationship permissions, guardian authentication and field-level exposure; audit reports, exports and support access | `server/middleware/rbac.js`, `student-data-access.js`, `server/routes/students.routes.js`, `legacy.routes.js` | A04, A06 | Owner/principal/staff/teacher/guardian/student negative test matrix; unrelated-child access denied |
| **A08 — legacy route remediation** | P0 | **Partial** | Remove shadowed duplicates only after mapping canonical behavior; fix indirect-ownership child record updates/deletes and unsafe parent portal; preserve compatibility if needed | `server/index.js`, `server/routes/legacy.routes.js`, domain routers and route-contract tests | A04, A07 | No legacy bypass, no route collision regressions, no tenant-unsafe mutations |
| **A09 — SMTP, outbox and email resilience** | P0 | **Code implemented; provider/worker behavior unverified** | Prove SMTP transport, delivery states, bounded retry, dead letters, lost-worker recovery, idempotence and privacy-safe logs; configure on private staging host | `server/services/mail.service.js`, `email-outbox.service.js`, `scripts/process-email-outbox.mjs`, `server/tests/*mail*` | A02, A06, staging credentials privately | Test SMTP delivery succeeds, provider failures recover, retries cannot silently duplicate messages, no secrets logged |
| **A10 — API transport and abuse controls** | P0 | **Code present; deployment not verified** | Review HTTPS termination, proxy trust, secure cookie/token handling, rate limiting, request validation, CORS and webhook auth; add tests | `server/index.js`, `server/config/env.js`, `server/middleware/rate-limit.js`, webhook routes | A02, A07, actual staging host | Untrusted origins/inputs and spoofed webhooks denied; proxy settings safe |
| **A11 — backup and recoverability** | P0 | **Scripts present; operational proof absent** | Automated backup scheduling, retention, encryption/access, restore-to-disposable-DB drill, corruption and RPO/RTO documentation | `scripts/postgres-data-safety.mjs`, `scripts/pilot-readiness.mjs`, staging operations | A03 and isolated staging Postgres | Fresh backup and integrity-confirmed restore; credentials never in output |
| **A12 — security release gate** | P0 | **Not complete** | Extend `npm run verify` to include real Postgres, tenant/parent negative tests, mail, roles, concurrent writes and imports; evaluate readiness | `scripts/verify.mjs`, `.github/workflows/verify.yml`, tests, `pilot-readiness.mjs` | A02–A11 | CI green, current evidence, `pilot:readiness=READY`; independent review and staged release approval |

## Immediate P0 findings

1. **Confirmed application exposure:** `POST /api/parent-portal/lookup` in `server/routes/legacy.routes.js` (~line 3290) is unauthenticated; reads student by ID and associated attendance/fees/payments without tenant predicates. It must be disabled/replaced with verified guardian relationship checks before any real student data is served. See A04/A07/A08. This cannot be ruled safe by the existing static `requireTenant` scanner.
2. **Confirmed infrastructure failure:** main CI run [44540980492](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/44540980492) failed at `npx playwright install --with-deps chromium` because the runner image was ubuntu-26.04. The application verification stage was skipped. See A02.
3. **Production staging is not established:** do not confuse the independent SSKEMS Next.js website or its preview with the Express CRM staging backend; use isolated PostgreSQL, private SMTP config, and HTTPS when provisioned.
4. **PR overlap:** #5 and #7 both provide school-to-CRM enquiry functionality; choose one compatible implementation after comparing with merged #4 and current main. Do not merge competing bridges automatically.
5. **Operational proof:** backup scripts and `pilot:readiness` checks exist, but successful restoration, verified owner and current full verification proof were not inspected.

## Handoff checklist for A01 local sign-off

In the developer's actual Institute OS checkout, capture **metadata only** (do not cat `.env`):

```powershell
git status --short
git branch --show-current
git log -1 --oneline
git stash list
git diff --stat
git diff --stat origin/main
git ls-files --others --exclude-standard
```

Review any unexpected files with the owner; do not print private contents. Compare local work against the inventory and update classification where necessary. If any active local work affects security, coordinate its ownership before starting A02.

## Recommended next task

**A02 — repair baseline CI and execute the full verification suite.** The first observed failure is the Playwright operating-system/browser compatibility issue. Do not assume tests pass merely because PR #4 passed on its earlier branch. A04's parent-portal issue is a release-blocking P0 and should be triaged immediately; if service is publicly reachable, mitigation takes precedence over normal sequence.

**Stop after A01 in this PR.** Do not silently perform A02 or later tasks.
