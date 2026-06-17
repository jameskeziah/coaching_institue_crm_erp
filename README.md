# ProTrack Institute OS

Vite + React + Tailwind frontend with an Express + SQLite API for institute CRM/ERP workflows, admissions, counselling, teacher performance, reports, and operations.

## Setup

1. Install frontend dependencies:

   ```bash
   npm install
   ```

2. Install backend dependencies:

   ```bash
   cd server
   npm install
   cd ..
   ```

3. Create `.env` from `.env.example` and set at least:

   ```text
   JWT_SECRET=replace-with-a-long-random-secret
   ALLOW_REGISTRATION=false
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=replace-with-a-strong-initial-admin-password
   PORT=4000
   DATABASE_URL=
   DATABASE_SSL=false
   ```

   `JWT_SECRET` is required. `ADMIN_USERNAME` and `ADMIN_PASSWORD` are only used to seed a first admin if that user does not already exist.

   Leave `DATABASE_URL` empty for local SQLite. Set it to a Postgres connection string for multi-user deployments.

4. In PowerShell, load the environment before starting the backend:

   ```powershell
   $env:JWT_SECRET="replace-with-a-long-random-secret"
   $env:ALLOW_REGISTRATION="false"
   $env:ADMIN_USERNAME="admin"
   $env:ADMIN_PASSWORD="replace-with-a-strong-initial-admin-password"
   npm run start:server
   ```

5. Start the frontend in another terminal:

   ```bash
   npm run dev
   ```

## Commands

* `npm run dev` - start the Vite frontend
* `npm run build` - build production frontend assets
* `npm run preview` - preview production frontend build
* `npm run start:server` - start the Express API
* `npm run test:smoke` - run API smoke tests against a running backend

## Smoke Tests

Run the backend first, then run:

```powershell
$env:JWT_SECRET="replace-with-a-long-random-secret"
$env:SMOKE_USERNAME="admin"
$env:SMOKE_PASSWORD="your-admin-password"
npm run test:smoke
```

The smoke test covers login, teacher CRUD, teacher review save/load, dashboard source endpoints, and admin-only user access.

## Data

The backend supports two database modes:

* **SQLite fallback:** default local mode when `DATABASE_URL` is empty. The database file is `server/data.sqlite` and is ignored by Git.
* **Postgres:** production/staging mode when `DATABASE_URL` is set, for example:

  ```text
  DATABASE_URL=postgresql://username:password@localhost:5432/teacher_scorecard
  DATABASE_SSL=false
  ```

  Use `DATABASE_SSL=true` for hosted Postgres providers that require SSL.

SQLite is fine for local/single-user use. Use Postgres before deploying this as a shared multi-user system.
