import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeDir = 'server/routes';
const exemptFiles = new Set([
  'auth.routes.js',
  'platform-auth.routes.js',
  'publicEnquiry.routes.js',
  'razorpayWebhook.routes.js',
  'super-admin.routes.js',
  'whatsappWebhook.routes.js',
]);

const failures = [];

for (const file of readdirSync(routeDir).filter((name) => name.endsWith('.routes.js'))) {
  if (exemptFiles.has(file)) continue;

  const source = readFileSync(join(routeDir, file), 'utf8');
  if (!source.includes('authMiddleware')) continue;

  if (!source.includes('requireTenant')) {
    failures.push(`${file}: authenticated route module does not import/use requireTenant`);
  }
}

if (failures.length) {
  throw new Error(`Tenant enforcement check failed:\n${failures.join('\n')}`);
}

console.log('Tenant enforcement check passed');
