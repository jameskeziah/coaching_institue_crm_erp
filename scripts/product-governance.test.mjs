
import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { verifyCoverage } from './check-feature-coverage.mjs';
import { buildReports } from './generate-feature-reports.mjs';
import { validateRegistry } from './validate-feature-registry.mjs';

const revision = '1234567890abcdef1234567890abcdef12345678';
const repository = 'https://github.com/example/institute';
const date = '2026-11-27';
const refs = { sourceExists: file => file === 'server/tests/fixture.test.js', commitExists: sha => sha === revision };
const feature = {
  id: 'ATT-001',
  parentId: null,
  domain: 'Operations',
  subdomain: 'Academic operations',
  module: 'Attendance',
  name: 'Attendance & roll call',
  description: 'Record attendance.',
  requirementSource: { approval: 'APPROVED', reference: 'Phase B' },
  status: 'PARTIAL',
  frontend: 'PARTIAL',
  backend: 'PARTIAL',
  database: 'PARTIAL',
  security: 'UNVERIFIED',
  rbac: 'UNVERIFIED',
  integration: 'UNVERIFIED',
  testing: 'UNVERIFIED',
  productionReadiness: 'UNVERIFIED',
  dependencies: [],
  sourceEvidence: [{ path: 'server/tests/fixture.test.js', kind: 'test', detail: 'Attendance fixture checks session creation.' }],
  relatedPullRequests: [],
  knownLimitations: ['Acceptance is pending.'],
  remainingImplementation: ['Confirm teachers can submit attendance.'],
  acceptanceCriteria: [{ id: 'AC-1', description: 'Teacher submits attendance.', result: 'UNVERIFIED' }],
  verification: [],
  priority: 'P1',
  targetReleasePhase: 'B',
  lastVerifiedCommit: null,
  lastVerifiedDate: null,
};

function registry() {
  return structuredClone({
    schemaVersion: 1,
    repository,
    baseline: { commit: revision, date, auditNotes: ['Initial fixtures.'], verificationRun: repository + '/actions/runs/1' },
    features: [feature],
    history: [{ featureId: feature.id, from: null, to: feature.status, date, summary: 'First inventory', reference: revision }],
  });
}

function complete(reg) {
  const f = reg.features[0];
  f.status = 'COMPLETE';
  f.remainingImplementation = [];
  f.acceptanceCriteria[0].result = 'PASSED';
  f.verification = [{ criterionId: 'AC-1', kind: 'acceptance-test', commit: revision, date,
    reference: 'Teacher submits attendance / ' + repository + '/actions/runs/1' }];
  f.lastVerifiedCommit = revision;
  f.lastVerifiedDate = date;
  reg.history.push({ featureId: f.id, from: 'PARTIAL', to: f.status, date, summary: 'Confirmed role behavior through API', reference: revision });
  return reg;
}

function body(rows, explanation = '') {
  return [
    '## Feature status changes', rows, '## No feature impact', explanation,
    '## Changed functionality', 'Attendance submissions are verified.',
    '## Acceptance criteria', 'AC-1 confirms teacher attendance submission.',
    '## Verification evidence', 'Attendance acceptance test passed against the stated revision.',
    '## Remaining limitations', 'Staging acceptance remains pending.',
    '## Security and privacy impact', 'Synthetic attendance records were used to check teacher scope.',
  ].join('\n\n');
}

test('schema rejects invalid statuses and required fields', () => {
  const reg = registry();
  reg.features[0].status = 'DONE';
  delete reg.features[0].dependencies;
  const errors = validateRegistry(reg, refs).join('\n');
  assert.match(errors, /allowed values/);
  assert.match(errors, /required property 'dependencies'/);
});

test('semantic checks reject duplicate IDs, dangling dependencies and cycles', () => {
  const reg = registry();
  reg.features.push({ ...reg.features[0], name: 'Duplicate' });
  reg.features[1].dependencies = ['ATT-404', 'ATT-001'];
  reg.features[1].parentId = 'ATT-001';
  const errors = validateRegistry(reg, refs).join('\n');
  assert.match(errors, /duplicate feature ID/);
  assert.match(errors, /unknown dependency/);
  assert.match(errors, /Dependency cycle/);
  assert.match(errors, /Parent cycle/);
});

test('completion requires tracked evidence and proof tied to an exact criterion and revision', () => {
  const reg = complete(registry());
  assert.deepEqual(validateRegistry(reg, refs), []);
  reg.features[0].sourceEvidence[0].path = '../untracked';
  reg.features[0].verification[0].reference = repository + '/actions/runs/1';
  assert.match(validateRegistry(reg, refs).join('\n'), /unsafe source/);
  assert.match(validateRegistry(reg, refs).join('\n'), /specific check/);
  reg.features[0].verification = [];
  const missing = validateRegistry(reg, refs).join('\n');
  assert.match(missing, /AC-1 has a result without evidence/);
  assert.match(missing, /COMPLETE requires passing/);
});

test('production readiness requires staging evidence and satisfied dependencies', () => {
  const reg = complete(registry());
  reg.features[0].productionReadiness = 'COMPLETE';
  assert.match(validateRegistry(reg, refs).join('\n'), /staging evidence/);
  reg.features[0].verification[0].kind = 'staging-verification';
  assert.deepEqual(validateRegistry(reg, refs), []);
});

test('PR must match status transitions and preserve permanent IDs and prior history', () => {
  const baseRegistry = registry();
  const reg = complete(registry());
  const metadata = { baseRegistry, registry: reg, changedFiles: ['server/routes/attendance.routes.js'] };
  assert.deepEqual(verifyCoverage({ ...metadata, body: body('| ATT-001 | PARTIAL | COMPLETE |') }), []);
  assert.match(verifyCoverage({ ...metadata, body: body('| ATT-001 | UNVERIFIED | COMPLETE |') }).join('\n'), /exact previous/);
  reg.history[0].summary = 'History rewritten';
  reg.history[1].from = 'UNVERIFIED';
  assert.match(verifyCoverage({ ...metadata, body: body('| ATT-001 | PARTIAL | COMPLETE |') }).join('\n'), /append-only/);
  assert.match(verifyCoverage({ ...metadata, body: body('| ATT-001 | PARTIAL | COMPLETE |') }).join('\n'), /one history entry/);
  reg.features = [];
  assert.match(verifyCoverage({ ...metadata, body: body('') }).join('\n'), /cannot be removed/);
});

test('unmapped changes require a documented no-impact explanation', () => {
  const reg = registry();
  const metadata = { baseRegistry: reg, registry: reg, changedFiles: ['server/tests/fixture.test.js'] };
  assert.match(verifyCoverage({ ...metadata, body: body('') }).join('\n'), /Review these records.*ATT-001/);
  assert.deepEqual(verifyCoverage({ ...metadata, body: body('', 'Comment-only cleanup leaves the attendance assertions and application unchanged.') }), []);
  assert.match(verifyCoverage({ ...metadata, body: '' }).join('\n'), /Verification evidence/);
});

test('reports and filterable workbook are deterministic and contain the registry evidence', () => {
  const reg = registry();
  const first = buildReports(reg);
  const second = buildReports(reg);
  assert.deepEqual(first, second);
  assert.equal(Object.keys(first).length, 9);
  assert.match(first['requirements-traceability.md'], /Teacher submits attendance/);
  const entries = unzipSync(first['feature-implementation-matrix.xlsx']);
  const sheet = strFromU8(entries['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /autoFilter ref="A1:AC2"/);
  assert.match(sheet, /Attendance &amp; roll call/);
  assert.match(sheet, /ATT-001/);
  assert.match(sheet, /Confirm teachers can submit attendance/);
});
