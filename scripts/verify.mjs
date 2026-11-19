import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verificationDatabasePath = path.join(workspaceRoot, 'storage', 'verification', `verify-${process.pid}.sqlite`);
const apiBase = 'http://localhost:4000/api';
const stages = [
  'build',
  'check:env',
  'check:legacy',
  'check:tenant',
  'check:security',
  'test:data-safety',
  'test:mail',
  'test:authz',
  'test:imports',
  'test:smoke',
  'test:ui',
];
const verificationEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: verificationDatabasePath,
  DATABASE_SSL: 'false',
  APP_URL: 'http://localhost:5173',
  API_URL: apiBase,
  CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  JWT_SECRET: 'verification-only-jwt-secret-at-least-32-characters',
  JWT_ACCESS_EXPIRES_IN: '15m',
  REFRESH_TOKEN_DAYS: '30',
  RESET_PASSWORD_TOKEN_MINUTES: '30',
  EMAIL_VERIFICATION_TOKEN_HOURS: '24',
  INVITE_TOKEN_DAYS: '7',
  OWNER_RECOVERY_TOKEN_HOURS: '24',
  TRIAL_DAYS: '14',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'MirakuAdmin2026!',
  JSON_BODY_LIMIT: '1mb',
  URLENCODED_BODY_LIMIT: '100kb',
  RATE_LIMIT_WINDOW_MINUTES: '15',
  LOGIN_RATE_LIMIT_MAX: '30',
  PLATFORM_LOGIN_RATE_LIMIT_MAX: '10',
  PASSWORD_RESET_RATE_LIMIT_MAX: '5',
  ONBOARDING_RATE_LIMIT_MAX: '3',
  PUBLIC_ENQUIRY_RATE_LIMIT_MAX: '20',
  EMAIL_OUTBOX_WORKER_ENABLED: 'false',
  EMAIL_OUTBOX_WORKER_INTERVAL_MS: '60000',
  EMAIL_OUTBOX_WORKER_LIMIT: '20',
  EMAIL_OUTBOX_STALE_LOCK_MS: '600000',
  ALLOW_REGISTRATION: 'false',
  TRUST_PROXY: 'false',
  TENANT_BOOTSTRAP_SECRET: '',
  MAIL_FROM: 'verify@example.com',
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASS: '',
  WHATSAPP_ACCESS_TOKEN: '',
  WHATSAPP_PHONE_NUMBER_ID: '',
  WHATSAPP_API_VERSION: 'v22.0',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: '',
  WHATSAPP_APP_SECRET: '',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: '',
};
let apiServer = null;

function hasApiExited() {
  return !apiServer || apiServer.exitCode !== null || apiServer.signalCode !== null;
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function assertApiPortAvailable() {
  const url = new URL(apiBase);
  const port = Number(url.port || 80);
  const hosts = url.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [url.hostname];
  const occupied = await Promise.all(hosts.map((host) => isPortOpen(port, host)));
  if (occupied.some(Boolean)) {
    throw new Error(
      `Cannot run verification safely: ${url.hostname}:${port} is already in use. `
      + 'Stop the existing API before running npm run verify; verification never reuses an unknown server.',
    );
  }
}

function removeVerificationDatabase() {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    fs.rmSync(`${verificationDatabasePath}${suffix}`, { force: true });
  }
}

async function waitForApi() {
  const deadline = Date.now() + 90_000;
  const healthUrl = `${apiBase}/health`;

  while (Date.now() < deadline) {
    if (hasApiExited()) {
      const outcome = apiServer.signalCode ? `signal ${apiServer.signalCode}` : `exit ${apiServer.exitCode}`;
      throw new Error(`Verification API exited before becoming healthy (${outcome}).`);
    }

    try {
      const response = await fetch(healthUrl);
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status === 'ok') return;
    } catch {
      // The API is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Verification API did not become healthy at ${healthUrl}.`);
}

async function startApi() {
  await assertApiPortAvailable();
  fs.mkdirSync(path.dirname(verificationDatabasePath), { recursive: true });
  removeVerificationDatabase();
  console.log('\n=== preparing isolated verification fixture ===\n');
  const fixtureResult = spawnSync(process.execPath, ['scripts/prepare-verification-fixture.mjs'], {
    cwd: workspaceRoot,
    env: verificationEnv,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (fixtureResult.error) throw fixtureResult.error;
  if (fixtureResult.status !== 0) {
    throw Object.assign(new Error('verification fixture preparation failed'), { exitCode: fixtureResult.status || 1 });
  }
  console.log('\n=== starting isolated verification API ===\n');
  apiServer = spawn(process.execPath, ['server/index.js'], {
    cwd: workspaceRoot,
    env: verificationEnv,
    stdio: 'inherit',
    windowsHide: true,
  });
  await waitForApi();
}

async function stopApi() {
  if (hasApiExited()) return;
  apiServer.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => apiServer.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);

  if (!hasApiExited()) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(apiServer.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      apiServer.kill('SIGKILL');
    }
  }
}

function runStage(stage) {
  console.log(`\n=== npm run ${stage} ===\n`);
  const stageEnv = { ...verificationEnv };
  // Build the browser bundle in production mode; runtime and test stages stay isolated.
  if (stage === 'build') stageEnv.NODE_ENV = 'production';
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `npm.cmd run ${stage}`] : ['run', stage];
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: stageEnv,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Object.assign(new Error(`${stage} failed`), { exitCode: result.status || 1 });
}

try {
  for (const stage of stages) {
    if (stage === 'test:smoke') await startApi();
    runStage(stage);
    if (stage === 'test:smoke') await stopApi();
  }
} catch (error) {
  process.exitCode = error.exitCode || 1;
  throw error;
} finally {
  await stopApi();
  removeVerificationDatabase();
}

const proofDirectory = path.join(workspaceRoot, 'storage', 'readiness');
const proofPath = path.join(proofDirectory, 'latest-verification-proof.json');
const proof = {
  formatVersion: 1,
  verifiedAt: new Date().toISOString(),
  nodeVersion: process.version,
  stages,
  status: 'PASSED',
};
fs.mkdirSync(proofDirectory, { recursive: true });
const temporaryPath = `${proofPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
fs.renameSync(temporaryPath, proofPath);
console.log(`Verification proof created: ${proofPath}`);
