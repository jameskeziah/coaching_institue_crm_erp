# Institute OS — Current State and Repository Reconciliation

**Snapshot:** 2026-11-20 (remote GitHub review)  
**Repository:** `jameskeziah/coaching_institue_crm_erp`  
**Baseline main:** `354a29192e63efdd70353ea1065fe554e5797005` (PR #4 merge, 2026-11-19)  
**Purpose:** Phase A / A01 inventory and preservation plan. This is **not** an application security certification or staging sign-off.

## Evidence and scope

- GitHub main commit, complete non-truncated Git tree (238 entries, including directories), workflow history, PR metadata, diff comparisons, and selected route/service source files were examined remotely.
- There was **no checkout of the user's actual local development workspace** available to this review. Uncommitted/untracked/stashed files, local .env contents, and in-progress code changes **cannot be inspected or certified** from GitHub. Before merging this PR, the developer working in the actual checkout must record `git status --short`, `git branch --show-current`, `git log -1 --oneline`, `git stash list`, and the diff against origin/main, without printing secrets.
- No local build, test, migration, SMTP delivery, remote API call, backup restoration, or staging acceptance test was performed by this review. GitHub Actions runs are evidence of **their own** past execution only.
- Security hardening in [PR #4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4) is **merged** into main. Do not reapply the original patch blindly.

## Branches and integration state

| Work | Remote state on review | Reconciliation needed |
|---|---|---|
| `main` | HEAD `354a291`, contains PR #4 | Baseline for all new changes |
| [PR #4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4) | Merged on 2026-11-19 | Verify behavior; do not repeat implementation |
| [PR #5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5) | Open draft; head `feat/sskem-website-enquiry-bridge-20261013`; base still `agent/integrate-security-atomic-onboarding` | Old stacked base; review actual delta and rebase/retarget carefully after security gate |
| [PR #7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7) | Open draft; head `feat/sskem-crm-enquiry-bridge-20261019`; base main | Competing school-enquiry implementation; reconcile against #5 and current main, avoid duplicate endpoint implementation |
| PRs #1, #2, #3 | Closed, not merged | Read only if necessary to recover distinct functionality; do not automatically cherry-pick |
| [Issue #6](https://github.com/jameskeziah/coaching_institue_crm_erp/issues/6) | Open release gate for SSKEMS pilot | Staging operational evidence and authorization outstanding |

Both #5 and #7 diverge from current main. Compared with main, #5 has 34 commits ahead and 1 behind, and #7 has 12 commits ahead and 1 behind; these comparison counts **do not** mean every diff is new functionality, as #5 includes ancestry from the already-merged security branch. Identify genuinely unique changes before any integration. No bridge release flag should be enabled during reconciliation.

## Architecture snapshot

- UI: Vite + React, `src/pages/` and `src/App.jsx`.
- API: Express, `server/index.js`; domain-specific routers plus a large `server/routes/legacy.routes.js` (~4,641 lines).
- Database: SQLite for local/single-process tests; PostgreSQL required for shared multi-tenant data. `server/db.js` owns substantial schema initialization; `server/migrations/` contains incremental migrations; `server/services/db.service.js` provides a request/async-context-aware transactional API.
- Authentication and authorization: `server/routes/auth.routes.js`, `server/middleware/auth.js`, `tenant.js`, `rbac.js`, `student-data-access.js`, `platform-auth.js`.
- Verification: `.github/workflows/verify.yml`, `scripts/verify.mjs`, `scripts/check-*.mjs`, `scripts/pilot-readiness.mjs`, integration tests, smoke tests and Playwright.

**Architecture decision:** preserve the existing modular-monolith stack. Do not migrate to NestJS, Next.js, Prisma, Clerk or microservices as part of A01/A02.

## Security baseline status (code presence is not runtime verification)

| Capability | A01 classification | Evidence / outstanding check |
|---|---|---|
| Tenant authentication and requireTenant middleware | **Implemented; audit required** | `server/middleware/tenant.js`, active router registration in `server/index.js`; per-query isolation still requires testing |
| Request-scoped PostgreSQL transactions | **Implemented; verification required** | `AsyncLocalStorage` in `server/services/db.service.js`; legacy write paths and concurrency still require full audit |
| Owner email verification and atomic onboarding | **Implemented; verification required** | `auth.routes.js`, `tenant-onboarding.service.js`, email outbox; test failure modes end to end |
| SMTP and durable email outbox | **Implemented; operationally unverified** | `mail.service.js` uses Nodemailer; `email-outbox.service.js` and processing scripts exist; no live provider/delivery proof inspected |
| CORS/Helmet/rate limit/proxy config | **Implemented; deployment unverified** | `server/index.js`, `server/config/env.js`; test production settings behind real proxy |
| Backups/restore/readiness tooling | **Implemented as scripts; restore proof unverified** | `scripts/postgres-data-safety.mjs`, `pilot-readiness.mjs`; no remote Postgres proof inspected |
| Server-side RBAC/field-level student controls | **Partially implemented; audit required** | Middleware and scoped student routes exist, but legacy parent endpoint below bypasses authenticated-guardian identity |
| Full tenant isolation across all active routes | **Unsafe until remediated and proven** | `server/routes/legacy.routes.js` and mixed indirect tenant ownership checks need endpoint-level tests |
| Production-ready CRM staging deployment | **Not verified** | No CRM staging URLs, SMTP provider, or staging database credentials/proofs were available to this review |

### Confirmed P0: legacy parent data lookup

`server/routes/legacy.routes.js` contains `POST /api/parent-portal/lookup` (around line 3290 on this main commit), with no `authMiddleware` or `requireTenant`. It accepts `student_id` and `parentPhone`, selects the student by ID without tenant constraint, then loads attendance, fees and payment records via unscoped student references. Knowledge of an ID and phone number is not an authenticated guardian session or safe multi-tenant authorization.

**Required remediation in A04/A07/A08:** fail closed; replace this lookup with verified guardian identity and authorized student relationship, apply tenant predicates on every query and related record, enforce rate limits and privacy-preserving responses, and add negative tests for tenant/guardian mismatches. Until fixed, **do not expose the service to real child or guardian data**.

The static scanner `scripts/check-tenant-enforcement.mjs` looks for `requireTenant` in authenticated route definitions; it cannot prove SQL tenant isolation or detect every unauthenticated sensitive route. A passing static check is necessary but insufficient.

### Other inspected gaps

- Legacy teacher work-control operations rely in some places on tenant-aware parent joins but update or delete child records by globally unique ID alone; validate entire read/write ownership and cascading deletes.
- `server/routes/students.routes.js` document creation stores caller-supplied `fileUrl` metadata. Secure file ingestion/storage and retrieval were not established by this inspection.
- `src/pages/TestPerformance.jsx` includes an OMR upload **log** with filename and counts; actual image processing was not established.
- Several route stubs are empty: `academic.routes.js`, `attendance.routes.js`, `automation.routes.js`, `expenses.routes.js`, `teachers.routes.js`, `tests.routes.js`. **Do not infer their business functionality is absent**: corresponding logic also exists in the legacy router and other domain routers.

## Functional module inventory

The statuses below indicate inspected source/API/UI presence, **not** end-to-end proof.

| Business area | Evidence in main | Classification |
|---|---|---|
| Tenant/platform onboarding | `onboarding.routes.js`, `super-admin.routes.js`, owner verification, tenant lifecycle | **Partial** (staging and production lifecycle unverified) |
| Admissions/leads/follow-ups | `admissions.routes.js`, `leadManagement.routes.js`, `leadActivities.routes.js`, `Admissions.jsx` | **Partial** (website bridge unmerged; full conversion not proven) |
| Students/guardians/imports | `students.routes.js`, `imports.routes.js`, `Students.jsx`, `StudentProfile.jsx` | **Partial** (secure documents, academic-year transitions not proven) |
| Academics/timetable/homework | `academicMaster.routes.js`, `Academic.jsx`, legacy academic routes | **Partial** (workflow and tenancy require testing) |
| Attendance | `attendanceOperations.routes.js`, `AttendanceOperations.jsx` | **Partial** (session workflows present; complete operational proof pending) |
| Fees/receipts/payment links | `fees.routes.js`, `feeStructures.routes.js`, Razorpay routes, `Fees.jsx` | **Partial** (real reconciliation and staging payment tests pending) |
| Parent communication/portal | `parentCommunication.routes.js`, `ParentCommunicationCenter.jsx`, `ParentPortal.jsx` | **Unsafe** (unauthenticated parent lookup) |
| Exams/performance/OMR | `TestPerformance.jsx`, legacy test routes | **Partial** (OMR log is not scanner) |
| Teachers/HR/expenses | `TeacherScoreDashboard.jsx`, `Teachers.jsx`, `Expenses.jsx`, legacy operations | **Partial** (payroll and wider staff lifecycle not verified) |
| WhatsApp and email | provider services, webhook routes, `mail.service.js`, outbox | **Partial** (provider integration and delivery proofs pending) |
| SaaS billing and entitlements | `src/pages/super-admin/*`, subscription and usage services | **Partial** (full platform revenue workflow unverified) |
| AI Lab | `AiLab.jsx`, legacy AI-lab operations | **Partial** (specialized production fitness unverified) |

## Operational release gates

Production/pilot remains **BLOCKED** until all hold:

1. A01 local workspace reconciliation is signed off without loss of uncommitted work.
2. A02 verification CI reliably executes the test suite on main; failing checks are investigated.
3. The parent-portal exposure and other tenant/RBAC findings are remediated, reviewed and regression tested with two distinct tenants.
4. Dedicated isolated PostgreSQL staging, real HTTPS API/frontend, safe SMTP and verified owner are provisioned.
5. Backup and isolated restore evidence, latest full verification proof, and `pilot:readiness` result are `READY`.
6. SSKEMS website enquiry is accepted only after private staging and school publication approvals; public form flag stays off.

See `docs/development/build-backlog.md` and `docs/development/verification-baseline.md` for follow-on tasks and evidence.
