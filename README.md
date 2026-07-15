# ProTrack Institute OS

ProTrack Institute OS is a Vite + React frontend with an Express API and a raw-SQL SQLite/PostgreSQL data layer for admissions, student operations, fees, attendance, communication, and teacher-performance workflows.

## Local setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and replace the placeholder secrets.

3. Start the frontend and API together:

   ```bash
   npm run dev
   ```

To start only the API on port `4000`, run:

```bash
npm run start:server
```

The default local URLs are:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## Required environment variables

The server validates environment variables during startup. The local minimum is:

```text
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:5173
API_URL=http://localhost:4000/api
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
TRUST_PROXY=false
JSON_BODY_LIMIT=1mb
URLENCODED_BODY_LIMIT=100kb
RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_MAX=30
PLATFORM_LOGIN_RATE_LIMIT_MAX=10
PASSWORD_RESET_RATE_LIMIT_MAX=5
ONBOARDING_RATE_LIMIT_MAX=3
PUBLIC_ENQUIRY_RATE_LIMIT_MAX=20
DATABASE_URL=./server/data.sqlite
DATABASE_SSL=false
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=30
RESET_PASSWORD_TOKEN_MINUTES=30
EMAIL_VERIFICATION_TOKEN_HOURS=24
INVITE_TOKEN_DAYS=7
OWNER_RECOVERY_TOKEN_HOURS=24
TRIAL_DAYS=14
ALLOW_REGISTRATION=false
WHATSAPP_WEBHOOK_VERIFY_TOKEN=replace-with-a-random-webhook-token
WHATSAPP_APP_SECRET=replace-with-the-meta-app-secret
RAZORPAY_WEBHOOK_SECRET=replace-with-the-razorpay-webhook-secret
```

`APP_URL` is the public frontend origin used by email links and Playwright. `API_URL` is the API base URL used by the frontend, Playwright, and smoke tests. Keep its path ending in `/api`. The local API listens on `PORT=4000`; a production reverse proxy may expose `API_URL` on a different public port.

`JWT_ACCESS_EXPIRES_IN` controls the short-lived access JWT and accepts durations such as `15m` or `1h`. Refresh tokens are opaque, stored tokens rather than JWTs, so `REFRESH_TOKEN_DAYS` controls their database expiry. `EMAIL_VERIFICATION_TOKEN_HOURS`, `INVITE_TOKEN_DAYS`, and `OWNER_RECOVERY_TOKEN_HOURS` control the corresponding one-time-token lifetimes. `ALLOW_REGISTRATION` controls the legacy public registration endpoint; institute onboarding remains a separate flow.

`CORS_ORIGINS` is a comma-separated allowlist and must contain every trusted browser origin. Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy so rate limiting receives the real client IP.

For PostgreSQL, replace `DATABASE_URL` with a PostgreSQL connection string. Set `DATABASE_SSL=true` only when the provider requires TLS with the current compatibility mode.

Production startup also requires the email, WhatsApp, Razorpay, webhook-verification, and tenant-bootstrap variables listed in `.env.example`. WhatsApp is configured by its access token, phone-number ID, API version, webhook verification token, and app secret; it has no separate feature-enable flag or configurable provider base URL. Runtime data and backup paths remain repository-managed under the ignored `storage/` directory rather than an environment-configured storage path.

## Security behavior

- New institute owners must verify their email before the tenant changes from `pending_verification` to an active trial.
- Login, platform login, password-reset, onboarding, and public-enquiry endpoints are rate limited with environment-configured ceilings.
- CORS is allowlist-based.
- Helmet security headers are enabled and Express request bodies are size limited.
- Only an existing owner can create or promote another owner.
- Teachers and counsellors receive a reduced student payload and cannot access student fees, guardian identity records, documents, or private communications.
- Public duplicate-enquiry responses disclose only that a duplicate exists, not the matching lead records.

## Commands

- `npm run dev` — start the Vite frontend and Express API
- `npm run build` — build the frontend
- `npm run preview` — preview the production frontend build
- `npm run start:server` — start the Express API
- `npm run start:server:production` — start the API with `NODE_ENV=production`
- `npm run test:smoke` — run API smoke tests; for a local `API_URL`, the test starts the API when needed
- `npm run test:ui` — run Playwright UI tests; Playwright starts both local services
- `npm run verify` — run the complete clean-checkout verification gate

## Tests

Smoke tests read `API_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` from `.env`. When `API_URL` targets localhost and the API is not already healthy, the smoke runner starts and later stops it automatically:

```powershell
npm run test:smoke
```

Playwright uses the same `API_URL` and `APP_URL`. With `.env.example`, it starts the API at `http://localhost:4000/api` and the frontend at `http://localhost:5173`.

## Data-store policy

- SQLite is for local development and single-process testing only. The default file is `server/data.sqlite`.
- PostgreSQL is required before storing real shared multi-tenant data.
- The transaction service uses request-scoped PostgreSQL clients. SQLite operations are serialized to avoid interleaving statements inside a transaction.

## Stack decision

This repository remains on its existing stack:

- Frontend: Vite + React
- Backend: Express
- Database: SQLite/PostgreSQL with raw SQL
- Authentication: JWT username/password

Do not migrate this repository to Next.js, NestJS, Prisma, or Clerk as part of stabilization work.
