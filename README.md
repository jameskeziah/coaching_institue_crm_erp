# ProTrack Institute OS

ProTrack Institute OS is a Vite + React frontend with an Express API and a raw-SQL SQLite/PostgreSQL data layer for admissions, student operations, fees, attendance, communication, and teacher-performance workflows.

## Local setup

1. Install frontend dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and replace the placeholder secrets.

3. Start the API on port `4000`:

   ```bash
   npm run start:server
   ```

4. Start the Vite frontend on port `5173` in another terminal:

   ```bash
   npm run dev
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
TRIAL_DAYS=14
ALLOW_REGISTRATION=false
```

Use `MAIL_FROM`, not `SMTP_FROM`. Use `JWT_ACCESS_EXPIRES_IN`, not `JWT_EXPIRES_IN`. `CORS_ORIGINS` is a comma-separated allowlist and must contain every trusted browser origin. Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy so rate limiting receives the real client IP.

For PostgreSQL, replace `DATABASE_URL` with a PostgreSQL connection string. Set `DATABASE_SSL=true` only when the provider requires TLS with the current compatibility mode.

Production startup also requires the email, WhatsApp, Razorpay, and tenant-bootstrap variables listed in `.env.example`.

## Security behavior

- New institute owners must verify their email before the tenant changes from `pending_verification` to an active trial.
- Login, platform login, password-reset, onboarding, and public-enquiry endpoints are rate limited with environment-configured ceilings.
- CORS is allowlist-based.
- Helmet security headers are enabled and Express request bodies are size limited.
- Only an existing owner can create or promote another owner.
- Teachers and counsellors receive a reduced student payload and cannot access student fees, guardian identity records, documents, or private communications.
- Public duplicate-enquiry responses disclose only that a duplicate exists, not the matching lead records.

## Commands

- `npm run dev` — start the Vite frontend
- `npm run build` — build the frontend
- `npm run preview` — preview the production frontend build
- `npm run start:server` — start the Express API
- `npm run start:server:production` — start the API with `NODE_ENV=production`
- `npm run test:smoke` — run API smoke tests against a running backend
- `npm run test:ui` — run Playwright UI tests

## Tests

For smoke tests, start the API first and provide valid administrator credentials:

```powershell
$env:SMOKE_USERNAME="admin"
$env:SMOKE_PASSWORD="your-admin-password"
npm run test:smoke
```

Playwright starts the API at `http://127.0.0.1:4000` and the frontend at `http://127.0.0.1:5173` unless the corresponding test environment variables override them.

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
