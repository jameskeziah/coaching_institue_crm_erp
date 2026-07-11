import { readFileSync } from 'node:fs';

const indexSource = readFileSync('server/index.js', 'utf8');
const legacyImport = "const legacyRoutes = require('./routes/legacy.routes');";
const legacyMount = 'app.use(legacyRoutes);';

const importIndex = indexSource.indexOf(legacyImport);
const mountIndex = indexSource.indexOf(legacyMount);

if (importIndex === -1) {
  throw new Error('server/index.js must keep legacy.routes imported while routes are migrated module by module.');
}

if (mountIndex === -1) {
  throw new Error('server/index.js must keep legacy.routes mounted as the fallback route set.');
}

const laterMount = indexSource.slice(mountIndex + legacyMount.length).match(/\bapp\.use\(/);
if (laterMount) {
  throw new Error('legacy.routes must remain the final app.use mount so migrated modules take precedence.');
}

console.log('Legacy freeze check passed');
