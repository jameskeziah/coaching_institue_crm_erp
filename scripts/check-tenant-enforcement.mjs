import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const routesDirectory = path.join(process.cwd(), 'server', 'routes');
const routeStartPattern = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
const handlerBoundaryPattern = /(?:async\s*)?\([^)]*\)\s*=>\s*\{|async\s+function\s*\([^)]*\)\s*\{/;

// Keep exemptions narrow, explicit, and reviewed. Public routes do not use
// authMiddleware and therefore do not need entries here.
const exemptions = new Set([
  // Example: 'some.routes.js:GET:/health'
]);

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function routeIdentity(fileName, method, header) {
  const pathMatch = header.match(/router\.(?:get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\1/);
  return `${fileName}:${method.toUpperCase()}:${pathMatch?.[2] || '<dynamic-path>'}`;
}

function inspectFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const starts = [...source.matchAll(routeStartPattern)];
  const violations = [];
  let authenticatedRoutes = 0;

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const nextStart = starts[index + 1]?.index ?? source.length;
    const routeSource = source.slice(match.index, nextStart);
    const handlerBoundary = routeSource.search(handlerBoundaryPattern);
    const header = handlerBoundary >= 0 ? routeSource.slice(0, handlerBoundary) : routeSource.slice(0, 1500);

    if (!/\bauthMiddleware\b/.test(header)) continue;
    authenticatedRoutes += 1;

    const identity = routeIdentity(fileName, match[1], header);
    if (/\brequireTenant\b/.test(header) || exemptions.has(identity)) continue;

    violations.push({
      fileName,
      line: lineNumberAt(source, match.index),
      identity,
    });
  }

  return { authenticatedRoutes, violations };
}

if (!fs.existsSync(routesDirectory)) {
  console.error(`Route directory not found: ${routesDirectory}`);
  process.exit(1);
}

const routeFiles = fs.readdirSync(routesDirectory)
  .filter((fileName) => fileName.endsWith('.js'))
  .sort();

let authenticatedRoutes = 0;
const violations = [];

for (const fileName of routeFiles) {
  const result = inspectFile(path.join(routesDirectory, fileName));
  authenticatedRoutes += result.authenticatedRoutes;
  violations.push(...result.violations);
}

if (violations.length) {
  console.error('Tenant enforcement check failed. Authenticated routes missing requireTenant:');
  for (const violation of violations) {
    console.error(`- ${violation.fileName}:${violation.line} (${violation.identity})`);
  }
  process.exit(1);
}

if (authenticatedRoutes === 0) {
  console.error('Tenant enforcement check found no authenticated routes; scanner configuration is likely broken.');
  process.exit(1);
}

console.log(`Tenant enforcement check passed: ${authenticatedRoutes} authenticated routes inspected across ${routeFiles.length} route files.`);
