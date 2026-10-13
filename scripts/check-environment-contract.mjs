import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const requiredExampleVariables = [
  'NODE_ENV',
  'PORT',
  'APP_URL',
  'API_URL',
  'CORS_ORIGINS',
  'DATABASE_URL',
  'DATABASE_SSL',
  'JWT_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'REFRESH_TOKEN_DAYS',
  'RESET_PASSWORD_TOKEN_MINUTES',
  'EMAIL_VERIFICATION_TOKEN_HOURS',
  'INVITE_TOKEN_DAYS',
  'OWNER_RECOVERY_TOKEN_HOURS',
  'TRIAL_DAYS',
  'ALLOW_REGISTRATION',
  'TENANT_BOOTSTRAP_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'MAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

const requiredSchemaVariables = [
  'PORT',
  'APP_URL',
  'API_URL',
  'DATABASE_URL',
  'DATABASE_SSL',
  'JWT_ACCESS_EXPIRES_IN',
  'REFRESH_TOKEN_DAYS',
  'EMAIL_VERIFICATION_TOKEN_HOURS',
  'ALLOW_REGISTRATION',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

const obsoleteExactVariables = new Set([
  'CLIENT_URL',
  'JWT_EXPIRES_IN',
  'WHATSAPP_ENABLED',
  'WHATSAPP_API_URL',
  'STORAGE_DIR',
  'API_BASE',
  'PLAYWRIGHT_BASE_URL',
  'VITE_API_URL',
]);

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
  } catch (error) {
    failures.push(`${relativePath}: could not be read (${error.message})`);
    return '';
  }
}

function parseEnvironmentExample(source) {
  const variables = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) variables.set(match[1], match[2].trim());
  }
  return variables;
}

function requirePattern(relativePath, source, pattern, description) {
  if (!pattern.test(source)) failures.push(`${relativePath}: ${description}`);
}

function environmentReads(source) {
  const keys = new Set();
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) keys.add(match[1]);
  }
  return keys;
}

function isObsoleteVariable(name) {
  return obsoleteExactVariables.has(name) || name.startsWith('SMOKE_');
}

const exampleSource = read('.env.example');
const exampleVariables = parseEnvironmentExample(exampleSource);

for (const name of requiredExampleVariables) {
  if (!exampleVariables.has(name)) failures.push(`.env.example: missing ${name}`);
}

if (exampleVariables.get('PORT') !== '4000') {
  failures.push(`.env.example: PORT must be 4000, found ${exampleVariables.get('PORT') || 'missing'}`);
}

if (exampleVariables.get('API_URL') !== 'http://localhost:4000/api') {
  failures.push('.env.example: API_URL must be http://localhost:4000/api');
}

for (const name of exampleVariables.keys()) {
  if (isObsoleteVariable(name)) failures.push(`.env.example: obsolete environment variable ${name}`);
}

const envSchemaSource = read('server/config/env.js');
for (const name of requiredSchemaVariables) {
  requirePattern(
    'server/config/env.js',
    envSchemaSource,
    new RegExp(`\\b${name}\\s*:`),
    `environment schema does not declare ${name}`
  );
}

const consumerFiles = [
  'server/config/env.js',
  'playwright.config.js',
  'scripts/smoke-test.mjs',
  'tests/ui/app.spec.js',
  'vite.config.js',
  'src/api.js',
];

for (const relativePath of consumerFiles) {
  const source = read(relativePath);
  for (const name of obsoleteExactVariables) {
    if (new RegExp(`\\b${name}\\b`).test(source)) failures.push(`${relativePath}: contains obsolete alias ${name}`);
  }
  for (const name of environmentReads(source)) {
    if (isObsoleteVariable(name)) failures.push(`${relativePath}: reads obsolete environment variable ${name}`);
  }
}

const documentationFiles = ['.env.example', 'README.md'];
for (const relativePath of documentationFiles) {
  const source = read(relativePath);
  for (const name of obsoleteExactVariables) {
    if (new RegExp(`\\b${name}\\b`).test(source)) failures.push(`${relativePath}: documents obsolete environment variable ${name}`);
  }
  if (/\bSMOKE_[A-Z0-9_]*\b/.test(source)) failures.push(`${relativePath}: documents an obsolete SMOKE_* environment variable`);
}

const readmeSource = read('README.md');
for (const name of [
  'PORT',
  'APP_URL',
  'API_URL',
  'DATABASE_SSL',
  'JWT_ACCESS_EXPIRES_IN',
  'REFRESH_TOKEN_DAYS',
  'EMAIL_VERIFICATION_TOKEN_HOURS',
  'ALLOW_REGISTRATION',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
]) {
  requirePattern('README.md', readmeSource, new RegExp(`\\b${name}\\b`), `does not document ${name}`);
}
requirePattern('README.md', readmeSource, /\bPORT\s*=\s*4000\b/, 'does not document the canonical backend port 4000');
requirePattern('README.md', readmeSource, /http:\/\/localhost:4000\/api\b/, 'does not document the canonical local API URL');

const playwrightSource = read('playwright.config.js');
requirePattern('playwright.config.js', playwrightSource, /process\.env\.APP_URL\b/, 'must consume APP_URL');
requirePattern('playwright.config.js', playwrightSource, /process\.env\.API_URL\b/, 'must consume API_URL');
requirePattern('playwright.config.js', playwrightSource, /http:\/\/localhost:5173\b/, 'must use the canonical local APP_URL fallback');
requirePattern('playwright.config.js', playwrightSource, /http:\/\/localhost:4000\/api\b/, 'must use the canonical local API_URL fallback');

const smokeSource = read('scripts/smoke-test.mjs');
requirePattern('scripts/smoke-test.mjs', smokeSource, /process\.env\.API_URL\b/, 'must consume API_URL');
requirePattern('scripts/smoke-test.mjs', smokeSource, /process\.env\.ADMIN_USERNAME\b/, 'must consume ADMIN_USERNAME');
requirePattern('scripts/smoke-test.mjs', smokeSource, /process\.env\.ADMIN_PASSWORD\b/, 'must consume ADMIN_PASSWORD');
requirePattern('scripts/smoke-test.mjs', smokeSource, /http:\/\/localhost:4000\/api\b/, 'must use the canonical local API_URL fallback');

const uiTestSource = read('tests/ui/app.spec.js');
requirePattern('tests/ui/app.spec.js', uiTestSource, /process\.env\.API_URL\b/, 'must consume API_URL');
requirePattern('tests/ui/app.spec.js', uiTestSource, /process\.env\.ADMIN_USERNAME\b/, 'must consume ADMIN_USERNAME');
requirePattern('tests/ui/app.spec.js', uiTestSource, /process\.env\.ADMIN_PASSWORD\b/, 'must consume ADMIN_PASSWORD');

const viteSource = read('vite.config.js');
const frontendSource = read('src/api.js');
requirePattern('vite.config.js', viteSource, /\bloadEnv\s*\(/, 'must load the shared environment contract');
requirePattern('vite.config.js', viteSource, /\.API_URL\b/, 'must consume API_URL');
const frontendUsesCanonicalApi = /\b__API_URL__\b/.test(frontendSource)
  || /\bimport\.meta\.env\.API_URL\b/.test(frontendSource);
if (!frontendUsesCanonicalApi) failures.push('src/api.js: must receive the canonical API_URL from Vite');

const portMismatchFiles = ['.env.example', 'README.md', 'playwright.config.js', 'scripts/smoke-test.mjs', 'tests/ui/app.spec.js', 'vite.config.js', 'src/api.js'];
for (const relativePath of portMismatchFiles) {
  const source = read(relativePath);
  if (/(?:localhost|127\.0\.0\.1):5000\b|\bPORT\s*=\s*5000\b/.test(source)) {
    failures.push(`${relativePath}: still references backend port 5000`);
  }
}

if (failures.length > 0) {
  console.error('Environment contract check failed:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Environment contract check passed (${requiredExampleVariables.length} canonical variables, backend port 4000).`);
}
