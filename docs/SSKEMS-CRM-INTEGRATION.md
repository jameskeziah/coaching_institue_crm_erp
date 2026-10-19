# SSKEMS website → ProTrack CRM integration

This is a **server-to-server admissions enquiry bridge**, not a merger of the two repositories.
The school website calls its own `POST /api/admissions/enquiry` route; that route verifies Cloudflare Turnstile and calls the authenticated CRM endpoint `POST /api/integrations/school/enquiry`.
No shared secret or CRM database credentials are exposed to the browser.

## CRM setup

1. Deploy the **Express API** on a persistent Node host with a durable PostgreSQL database. This is not a static Vite-only deployment. Complete the repo's other required production configuration first.
2. In the CRM, create/identify the SSKEMS tenant and a branch belonging to it. For an already provisioned tenant, `GET /api/public/branches?tenant=<slug>` returns the available branch IDs. Do not guess a tenant slug or branch ID.
3. Generate a random 32-byte or longer shared secret (example: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Keep it out of Git.
4. Configure server-side CRM environment variables:

   ```text
   SCHOOL_INTEGRATION_KEY=<shared-secret>
   SCHOOL_TENANT_SLUG=<actual-sskem-tenant-slug>
   SCHOOL_BRANCH_ID=<actual-branch-id>
   ```

5. Restart the Express API. The endpoint returns 503 until all three values are present. Requests without the correct `x-school-bridge-key` get 401. Duplicate mobile numbers return a generic 409; no existing lead details are returned.

The admissions lead gets `source=WEBSITE` and `subSource=SSKEMS`. Its `customFields` JSON carries academic year, enquiry topic, contact preference, email, question, and recorded consent timestamp. Formal applications, student enrolment, fees and records are **not** synced by this first phase.

## School website setup

Configure on the **school website's server deployment** (not as NEXT_PUBLIC variables):

```text
SSKEMS_CRM_API_BASE_URL=https://<crm-api-host>/api/
SSKEMS_CRM_BRIDGE_KEY=<same-shared-secret>
TURNSTILE_SECRET_KEY=<turnstile-server-secret>
ADMISSIONS_ENQUIRY_ENABLED=false
```

Configure these public build-time variables after creating a Cloudflare Turnstile site widget for the real school domain and authorised preview domain:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile-site-key>
NEXT_PUBLIC_ADMISSIONS_ENQUIRY_ENABLED=false
```

Both enable flags must be set to `true` **only when** the CRM is reachable over HTTPS, tenant/branch are confirmed, Turnstile works on the deployment hostname, the privacy notice and school staff handling process are approved, and a complete enquiry is found in the correct tenant's admissions dashboard. Redeploy the school website after changing the public build-time flag.

## Acceptance check

- While flags are false, `/admissions/enquire` stays a non-submitting preview.
- With a correctly configured staging environment, submit a test child/parent name, mobile, class, and topic with consent. Verify that exactly one `NEW` lead appears in the SSKEMS CRM tenant and correct branch with its question in `customFields`.
- Resubmit the same mobile: the website should return the generic duplicate message, without identifying another family.
- Submit without consent or without a valid Turnstile token: the website must reject it.
- Disable the flags immediately if routing or privacy checks fail.
- Test the school website's `npm run build`, `npm run test` and the CRM's `npm run test:school-integration` before merging.

Do not store credentials in Git, do not copy student data into public site logs, and do not enable the form on production just by merging the PR.
