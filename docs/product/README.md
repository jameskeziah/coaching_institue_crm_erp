
# Institute OS feature governance

[The feature registry](feature-registry.json) is the authoritative product inventory. Read the [Master Feature Implementation Matrix](feature-implementation-matrix.md) or use its [filterable Excel export](feature-implementation-matrix.xlsx). The JSON Schema defines the data contract.

| Report | Use |
| --- | --- |
| [Feature catalog](feature-catalog.md) | Browse the hierarchy and inspect code and PR evidence. |
| [Requirements traceability](requirements-traceability.md) | Review requirement approval, acceptance criteria and evidence. |
| [Product gap analysis](product-gap-analysis.md) | Find known limitations and the remaining implementation or verification. |
| [Module dashboard](development-dashboard.md) | Track progress, evidence coverage, open workflow dependencies and historical activity. |
| [Development backlog](development-backlog.md) | Sequence approved work and review observed or proposed work separately. |
| [Security and release readiness](release-readiness.md) | Review open security and release gates and the baseline audit. |
| [Feature change history](change-history.md) | Trace all registered feature updates. |

## Choose the work

1. Find the existing feature ID, read its linked implementation and acceptance criteria, and check dependent records.
2. Work on approved remaining scope for that ID. Repository-observed work records what exists. Proposed work records options that need approval. Create a permanent ID for a newly approved feature or newly inventoried capability. Preserve old IDs and record changes in history.
3. Update affected records with the result. Keep application layers, testing, integration, and production readiness independent. A narrow headless capability may be complete after its own acceptance criteria pass, even when the relevant product release has open gates.

| Status | Meaning |
| --- | --- |
| COMPLETE | Every scoped acceptance criterion has passing evidence tied to the verified revision. |
| PARTIAL | A working implementation covers part of the scope and concrete work or verification remains. |
| INCOMPLETE | Implementation exists or was attempted, with a blocked, missing, or intentionally disabled core path. |
| NOT_BUILT | The scoped capability is absent from the audited main branch. |
| UNVERIFIED | Available evidence cannot establish the scoped behavior or readiness. |

Source evidence points to tracked files. A verified criterion names the specific check and links to a GitHub Actions run or a commit-pinned report, with the tested commit and date. Record untested criteria as UNVERIFIED, with null last-verified fields when there is no assessed criterion. Production readiness requires staging evidence, completed implementation and fulfilled feature dependencies. Reviewers inspect that the result proves the criterion, and reassess prior evidence when behavior changes. CI validates the structure and consistency of the claim.

## Update and verify

For each changed feature, append one history event with its previous status, current status, date, change summary and reference. Use a null previous status for a new ID. Keep prior history entries intact. Record revisions that downgrade status when verification exposes a gap. Enter the exact previous and proposed status in the PR status table, including same-status evidence changes. If every record is unchanged, explain why under **No feature impact**. Reviewers assess that explanation against the affected files.

Run these commands in the existing checkout. In Windows PowerShell use npm.cmd in place of npm if required.

    npm run product:generate
    npm run product:check
    npm run product:test

Commit both the registry and generated reports. The PR's required integration job checks the registry, report bytes, transition history, and description against the base revision. It reruns when the PR description is edited. For local PR description validation after staging and committing the branch changes:

    npm run product:coverage -- --base <40-character-base-sha> --body-file <pr-description.md>

Main's snapshot workflow validates and regenerates the exact commit's reports, then records the merged revision, registry blob and digest in a downloadable artifact. The integration CI proof also includes the registry digest alongside the tested commit. Git retains the registry, reports and append-only history permanently. Workflow snapshots are retained for 90 days. The audited baseline describes the source audit, while the snapshot revision identifies the current merged registry. The merge and snapshot steps never promote feature statuses.

Coverage is at the level of logical features. Individual routes, components, and tables appear as evidence for those features. External deployments, production records, and private configuration need separate authorized acceptance evidence.
