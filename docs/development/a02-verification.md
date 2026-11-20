# A02 - Baseline verification gate

Scope: the existing Vite/React, Express and raw-SQL application, based on main `354a291`. Continue the existing runner-fix PR #9; preserve the separate A01 documentation and uncommitted security/workflow worktrees.

## Runner correction

The locked Playwright 1.60.0 failed installing Chromium on the Ubuntu 26.04 image selected by `ubuntu-latest` in [main run 44540980492](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/44540980492). The subsequent verification step was skipped. Pinning `ubuntu-24.04` keeps the existing dependency lockfile, Node 24, browser installer and all verification stages.

The existing fix commit `cd6f742` already passed on the pinned runner in [run 44687727273](https://github.com/jameskeziah/coaching_institue_crm_erp/actions/runs/44687727273). Its job logs show all 11 stages executed and no failed tests: 26 mail/outbox, 13 authorization, 3 import and 3 browser cases, plus build, static checks, data-safety self-tests and API smoke.

This follow-up retains the stable job name and records a downloadable JSON artifact and job summary after verification succeeds. Evidence includes all completed stages, verification time, tested commit, PR head, run URL and attempt. Missing/failed proof, omission of any of the 11 required stages, or artifact upload failure fails the job. No stage skips, path filters or `continue-on-error` are added. Only the evidence JSON is uploaded; databases, email payloads, environment files and student records are excluded.

## Required merge check

Workflow success and merge enforcement are separate settings. Initial inspection found main unprotected and an old disabled ruleset. The authenticated repository owner has administration permission. The narrowly scoped desired main protection is versioned in `ops/github-main-protection.json`:

- Require **Build, security, data safety, and end-to-end tests**, bound to GitHub Actions app ID 15368.
- Require the branch to be up to date with main before merging.
- Apply the check to administrators and require the pull-request path.
- Require zero human approvals: this does not impose a self-approval deadlock on the single-owner repository. Independent security review remains a separate later release gate.

An administrator applies this reversible repository setting using the already authenticated GitHub CLI, without printing credentials:

```powershell
gh api --method PUT repos/jameskeziah/coaching_institue_crm_erp/branches/main/protection --input ops/github-main-protection.json
gh api repos/jameskeziah/coaching_institue_crm_erp/branches/main/protection
```

Review the resulting settings before reporting enforcement. The disabled historical ruleset is left intact. Changing workflow YAML alone cannot activate branch protection; the JSON is configuration-as-documentation rather than an automatic privileged CI operation.

Applied on 20 November 2026 and read back through GitHub: `protected=true`, strict/up-to-date checks enabled, the exact GitHub Actions context bound to app 15368, administrator enforcement enabled, required approvals zero. Main's commit remained `354a291`; enabling protection did not merge or change application source. The returned settings are saved locally in ignored `storage/a02-evidence/protection-after.json`.

## Verification and evidence

From this isolated worktree:

```powershell
npm.cmd ci
npm.cmd run verify
git diff --check
```

`verify` overrides the environment with synthetic data in its own temporary SQLite database, starts only its test services, runs all 11 stages and cleans its database. It refuses to reuse an unknown API on port 4000. There is no separate lint/TypeScript command. Detailed local results and the final remote run are recorded in PR #9; the remote artifact identifies the exact tested revision. CI results are evidence for that commit, not staging acceptance.

Executed locally on 20 November 2026 with Node 24.13.1 / npm 11.8.0: clean install passed; all 11 `verify` stages passed (26 mail, 13 authorization, 3 import, 3 browser cases, plus build/static checks/data-safety/API smoke); no required tests failed. Workflow YAML and embedded JavaScript were parsed separately. The evidence recorder also receives negative validation for failed or incomplete proofs before the final push. The final GitHub run validates Ubuntu installation and artifact creation on the pushed revision.

The install-time dependency audit still reports 30 advisories (2 low, 8 moderate, 17 high, 3 critical). A02 does not change the lockfile or claim those dependencies are repaired.

## Boundaries and next task

PostgreSQL initialization still needs A03: unchanged main fails on a fresh isolated database because `ai_lab_students` references `students` before that table exists. The data-safety PostgreSQL self-test checks guardrails rather than executing an actual restore. Existing business integration tests use SQLite.

The A01 findings in unauthenticated parent lookup, legacy tenant SQL, session/role revocation, transactions and webhook tenant binding remain open. Passing this baseline does not satisfy the Phase A security exit gate. Remote CRM staging and SMTP provider acceptance remain unavailable, as previously confirmed. A03 is the next task; no feature work, migration, merge or deployment is performed by A02.
