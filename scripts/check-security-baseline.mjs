import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

function requireMatch(source, pattern, description) {
  if (!pattern.test(source)) {
    throw new Error(`Security baseline check failed: ${description}`);
  }
}

const server = read('server/index.js');
const rateLimits = read('server/middleware/rate-limit.js');

const serverChecks = [
  [/require\(['"]helmet['"]\)/, 'Helmet must remain installed in the API'],
  [/app\.use\(helmet\(\)\)/, 'Helmet must remain enabled globally'],
  [/new Set\(env\.CORS_ORIGINS\)/, 'CORS must use the configured origin allowlist'],
  [/allowedOrigins\.has\(origin\)/, 'CORS must reject origins outside the allowlist'],
  [/app\.use\(express\.json\(\{\s*limit:\s*env\.JSON_BODY_LIMIT\s*\}\)\)/, 'JSON requests must retain a configured size limit'],
  [/express\.urlencoded\(\{[^}]*limit:\s*env\.URLENCODED_BODY_LIMIT[^}]*\}\)/, 'URL-encoded requests must retain a configured size limit'],
  [/REQUEST_BODY_TOO_LARGE/, 'Oversized requests must retain the explicit 413 response'],
  [/app\.post\(['"]\/api\/auth\/login['"],\s*loginRateLimit\)/, 'Tenant login must remain rate limited'],
  [/app\.post\(['"]\/api\/platform-auth\/login['"],\s*platformLoginRateLimit\)/, 'Platform login must remain rate limited'],
  [/app\.post\(['"]\/api\/onboarding\/institute['"],\s*onboardingRateLimit\)/, 'Public onboarding must remain rate limited'],
  [/app\.post\(['"]\/api\/public\/enquiries['"],\s*publicEnquiryRateLimit\)/, 'Public enquiries must remain rate limited'],
];

for (const [pattern, description] of serverChecks) requireMatch(server, pattern, description);

const rateLimitChecks = [
  [/env\.RATE_LIMIT_WINDOW_MINUTES/, 'rate-limit windows must come from validated environment configuration'],
  [/env\.LOGIN_RATE_LIMIT_MAX/, 'tenant login limits must come from validated environment configuration'],
  [/env\.PLATFORM_LOGIN_RATE_LIMIT_MAX/, 'platform login limits must come from validated environment configuration'],
  [/env\.PASSWORD_RESET_RATE_LIMIT_MAX/, 'password reset limits must come from validated environment configuration'],
  [/env\.ONBOARDING_RATE_LIMIT_MAX/, 'onboarding limits must come from validated environment configuration'],
  [/env\.PUBLIC_ENQUIRY_RATE_LIMIT_MAX/, 'public enquiry limits must come from validated environment configuration'],
  [/code:\s*['"]RATE_LIMIT_EXCEEDED['"]/, 'rate-limited responses must retain a stable error code'],
];

for (const [pattern, description] of rateLimitChecks) requireMatch(rateLimits, pattern, description);

console.log('Security baseline check passed: Helmet, CORS allowlist, request limits, and route rate limits are enabled.');
