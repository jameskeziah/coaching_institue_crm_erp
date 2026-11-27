
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const registryPath = 'docs/product/feature-registry.json';
export const schemaPath = 'docs/product/feature-registry.schema.json';
export const statuses = ['COMPLETE', 'PARTIAL', 'INCOMPLETE', 'NOT_BUILT', 'UNVERIFIED'];
export const dimensions = ['frontend', 'backend', 'database', 'security', 'rbac', 'integration', 'testing', 'productionReadiness'];
export const featureIdPattern = /^[A-Z]{2,12}-[0-9]{3}$/;
export const shaPattern = /^[a-f0-9]{40}$/;

export function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

export function readRegistry() {
  return readJson(registryPath);
}

export function failOnErrors(errors) {
  if (errors.length) {
    console.error(errors.map(error => '- ' + error).join('\n'));
    process.exitCode = 1;
  }
}

export function isMainModule(url) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(url);
}
