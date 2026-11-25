# A04: Legacy academics, payment webhooks, and receipt containment

This change closes a bounded part of the tenant-isolation audit. It does not certify every legacy endpoint or complete Phase A.

## Enforced ownership

The legacy academic dashboard and syllabus, calendar, timetable, lecture-plan, delivery-log, and homework routes select the authenticated user's tenant. List, aggregate, insert, update, and delete SQL carries that tenant. Teacher and lecture-plan references must belong to the same institution before a row can be created. Request headers, query parameters, and JSON tenant fields cannot change ownership. Missing and foreign records return the same denial response. The retired public parent lookup remains closed with HTTP 403 and `PARENT_PORTAL_UNAVAILABLE`.

Razorpay callbacks select verification credentials from locally registered payment-link/payment ownership, rather than trusting provider notes to select a tenant. Conflicting local references or tenant notes fail with the same response as an invalid signature. Credential lookup before signature verification is read-only. Mutations carry the resolved tenant, payment duplicate lookup is scoped to that tenant, and stored event identifiers include the tenant so two institutions cannot suppress each other's events. Existing global-secret fallback remains for registered tenants without a per-tenant override; that secret is an operator credential and must never be shared with institution users. Configure distinct tenant webhook secrets for separate provider accounts.

Receipt PDFs use a tenant directory and a random file name opened without overwrite. Display receipt numbers, including custom prefixes, never form filesystem paths. Downloads require both an owned receipt row and a file within that tenant's receipt directory. Signature images are accepted only from the owning tenant's asset directory; canonical paths prevent traversal through symlinks into another tenant's directory.

## Existing receipt compatibility

Old `storage/receipts/<receiptNumber>.pdf` files used one shared namespace. They may already have been overwritten by another institution, so their bytes cannot establish ownership. They remain on disk, but the PDF download endpoint returns 404 for these untrusted shared paths. Do not bulk move or relabel them by receipt number. Reissue only after reconciling an institution's owned payment and receipt snapshot, then generate a new tenant-bound PDF.

The legacy global `fee_receipts.receiptNumber` uniqueness constraint is unchanged. Institutions sharing a prefix/counter can still receive a transaction failure; that failure can no longer overwrite another institution's PDF. Until the separate schema/numbering migration is complete, configure distinct receipt prefixes. Legacy signature files outside `storage/tenants/<tenantId>/` must be reviewed and placed in the institution's own asset directory before they can be embedded.

## Verification

Use the disposable PostgreSQL 18 cluster described in [A03](a03-postgres-migrations.md). The database tests require an explicit loopback administrator URL pointing to `postgres`, disable `.env` loading, create random databases, and remove only the databases they created. They never use institution data or deployed payment accounts.

```powershell
$env:POSTGRES_TEST_ADMIN_URL='postgresql://fixture_user@127.0.0.1:55479/postgres'
npm.cmd run test:tenant-isolation
npm.cmd run verify
```

The regressions exercise real HTTP routes and PostgreSQL with two synthetic institutions. They assert each institution's successful operations, denial in both cross-tenant directions, absence of private response data, spoofed ownership/reference rejection, and unchanged foreign rows after denied mutations. Payment cases use distinct synthetic signing credentials and cover payment status, posting, refunds, replay, and event-ID collisions. Receipt cases cover file collisions, traversal, signatures, and authorized downloads. CI and pilot readiness now require `test:tenant-isolation` in the complete 13-stage verification evidence.

## Remaining release gates

A04 still requires the remaining legacy/domain SQL and relationship audit, including ontology ownership and student aggregates. Provider IDs still have global uniqueness constraints; account-scoped callback routing and provider-ID uniqueness need further review so a malicious tenant cannot reserve another account's future ID. A05-A12 cover transaction integration/concurrency, identity lifecycle, RBAC/privacy, legacy bypasses, SMTP reliability, transport/secrets, scheduled backups with restoration, and staging acceptance. Local/CI passes establish only the tested behavior. Final acceptance still requires two independently provisioned verified institutions on a confirmed staging deployment and its isolated persistent PostgreSQL database.
