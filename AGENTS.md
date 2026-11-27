
# Institute OS development

Before changing application functionality, read [the feature registry](docs/product/feature-registry.json) and [the governance workflow](docs/product/README.md). Identify the permanent feature ID and inspect its existing source and acceptance criteria. Implement approved remaining work for that ID. Ask for product direction before expanding beyond an approved requirement.

Use the existing Institute OS checkout and preserve unrelated local edits. Keep the existing Vite, React, Express and PostgreSQL architecture. Use isolated synthetic fixtures for verification.

Update affected feature records, append their change history, regenerate reports and run the product checks. In the pull request, declare the prior and proposed status for each updated record, or explain why the change has no feature impact. Record feature-specific evidence before claiming completion. Merged code and general CI do not establish production readiness.
