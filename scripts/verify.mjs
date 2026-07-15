import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stages = ['build', 'check:tenant', 'test:data-safety', 'test:mail', 'test:authz', 'test:smoke', 'test:ui'];

for (const stage of stages) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `npm.cmd run ${stage}`] : ['run', stage];
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
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
