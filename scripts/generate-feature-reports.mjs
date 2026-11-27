
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { featureWorkbook } from './feature-workbook.mjs';
import { failOnErrors, isMainModule, readRegistry, root, statuses } from './product-governance.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const compact = items => items.join('; ') || '—';
const cell = value => String(value ?? '—').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n');
const bullets = items => items.length ? items.map(item => '- ' + cell(item)).join('\n') : '—';
const phaseOrder = ['A', 'B', '3', '4', '5', '6', '7', '8', 'UNSCHEDULED'];
const statusCounts = items => statuses.map(status => items.filter(item => item.status === status).length);
const format = (title, registry, sections) => [
  '# ' + title,
  'Generated from [feature-registry.json](feature-registry.json). Application baseline audited '
    + registry.baseline.date + ' at [' + registry.baseline.commit.slice(0, 7) + ']('
    + registry.repository + '/commit/' + registry.baseline.commit + ').',
  ...sections,
].join('\n\n') + '\n';
const prLink = (number, repository) => '[#' + number + '](' + repository + '/pull/' + number + ')';

export function buildReports(registry) {
  const features = [...registry.features].sort((a, b) => compare(a.id, b.id));
  const repository = registry.repository;
  const parents = new Set(features.map(feature => feature.parentId));
  const leaves = features.filter(feature => !parents.has(feature.id));
  const make = (title, ...sections) => format(title, registry, sections);
  const matrixHeaders = ['ID', 'Parent', 'Domain', 'Subdomain', 'Module', 'Feature', 'Approval', 'Status',
    'Frontend', 'Backend', 'Database', 'Security', 'RBAC', 'Integration', 'Testing', 'Production readiness',
    'Priority', 'Phase', 'Dependencies', 'Verified date', 'Verified commit'];
  const matrixRows = features.map(f => [f.id, f.parentId, f.domain, f.subdomain, f.module, f.name, f.requirementSource.approval,
    f.status, f.frontend, f.backend, f.database, f.security, f.rbac, f.integration, f.testing, f.productionReadiness,
    f.priority, f.targetReleasePhase, compact(f.dependencies), f.lastVerifiedDate, f.lastVerifiedCommit]);
  const evidence = f => f.sourceEvidence.map(e => '[' + e.path + '](../../' + e.path + ') · ' + e.kind + ' · ' + e.detail);
  const backlog = features.filter(f => f.status !== 'COMPLETE' || f.productionReadiness !== 'COMPLETE').sort(
    (a, b) => phaseOrder.indexOf(a.targetReleasePhase) - phaseOrder.indexOf(b.targetReleasePhase)
      || compare(a.priority, b.priority) || compare(a.id, b.id));
  const groupRows = prop => [...new Set(leaves.map(prop))].sort(compare).map(group => {
    const members = leaves.filter(f => prop(f) === group);
    return [group, members.length, ...statusCounts(members),
      members.filter(f => f.security === 'COMPLETE' && f.rbac === 'COMPLETE').length,
      members.filter(f => f.testing === 'COMPLETE').length,
      members.filter(f => f.productionReadiness === 'COMPLETE').length];
  });
  const approved = backlog.filter(f => f.requirementSource.approval === 'APPROVED');
  const other = backlog.filter(f => f.requirementSource.approval !== 'APPROVED');
  const readinessHeaders = ['ID', 'Feature', 'Approval', 'Phase', 'Priority', 'Security', 'RBAC', 'Testing', 'Readiness', 'Evidence gaps'];
  const readinessRows = items => items.map(f => [f.id, f.name, f.requirementSource.approval, f.targetReleasePhase,
    f.priority, f.security, f.rbac, f.testing, f.productionReadiness,
    compact(f.knownLimitations.length ? f.knownLimitations : f.remainingImplementation)]);
  const blockedDependencies = f => f.dependencies.filter(id => features.find(d => d.id === id)?.status !== 'COMPLETE');
  const backlogHeaders = ['ID', 'Phase', 'Priority', 'Feature', 'Status', 'Readiness', 'Open dependencies', 'Remaining implementation'];
  const backlogRows = items => items.map(f => [f.id, f.targetReleasePhase, f.priority, f.name, f.status, f.productionReadiness,
    compact(blockedDependencies(f)), compact(f.remainingImplementation)]);
  const assessed = leaves.flatMap(feature => feature.acceptanceCriteria);
  const velocity = new Map();
  for (const entry of registry.history.filter(entry => entry.from !== null)) {
    const month = entry.date.slice(0, 7);
    const counts = velocity.get(month) || { updates: 0, completions: 0, reopened: 0 };
    counts.updates++;
    if (entry.from !== 'COMPLETE' && entry.to === 'COMPLETE') counts.completions++;
    if (entry.from === 'COMPLETE' && entry.to !== 'COMPLETE') counts.reopened++;
    velocity.set(month, counts);
  }
  const catalog = [];
  function appendChildren(parent, depth) {
    for (const f of features.filter(feature => feature.parentId === parent)) {
      catalog.push('#'.repeat(Math.min(2 + depth, 6)) + ' ' + f.id + ' · ' + f.name,
        f.description + '\n\n**' + f.domain + ' / ' + f.subdomain + ' / ' + f.module + '** · ' + f.status
        + ' · ' + f.requirementSource.approval,
        '**Source evidence**\n\n' + bullets(evidence(f)),
        '**Related pull requests**\n\n' + compact(f.relatedPullRequests.map(number => prLink(number, repository))));
      appendChildren(f.id, depth + 1);
    }
  }
  appendChildren(null, 0);
  const files = {
    'feature-implementation-matrix.md': make('Master Feature Implementation Matrix', table(matrixHeaders, matrixRows)),
    'feature-catalog.md': make('Feature Catalog', ...catalog),
    'requirements-traceability.md': make('Requirements Traceability Matrix', table(
      ['ID', 'Approval', 'Requirement source', 'Criterion', 'Acceptance condition', 'Result', 'Verification'],
      features.flatMap(f => f.acceptanceCriteria.map(c => [f.id, f.requirementSource.approval, f.requirementSource.reference, c.id,
        c.description, c.result, compact(f.verification.filter(v => v.criterionId === c.id)
          .map(v => v.kind + ' · ' + v.commit.slice(0, 7) + ' · ' + v.date + ' · ' + v.reference))])))),
    'product-gap-analysis.md': make('Product Gap Analysis', table(
      ['ID', 'Feature', 'Status', 'Known limitations', 'Remaining implementation or verification'],
      features.filter(f => f.knownLimitations.length || f.remainingImplementation.length)
        .map(f => [f.id, f.name, f.status, compact(f.knownLimitations), compact(f.remainingImplementation)]))),
    'development-dashboard.md': make('Module Completion Dashboard',
      'Inventory totals include parents and leaves. Module and phase metrics use leaf records so parent summaries do not double count work.',
      table(['Records', ...statuses], [[features.length, ...statusCounts(features)]]),
      '## Modules', table(['Module', 'Leaves', ...statuses, 'Security and RBAC complete', 'Testing complete', 'Production ready'],
        groupRows(f => f.domain + ' / ' + f.module)),
      '## Release phases and workflows', table(['Phase', 'Leaves', ...statuses, 'Security and RBAC complete', 'Testing complete', 'Production ready'],
        groupRows(f => f.targetReleasePhase)), table(['Workflow', 'Status', 'Readiness', 'Open dependencies'],
        features.filter(f => f.id.startsWith('WFL-')).map(f => [f.name, f.status, f.productionReadiness, compact(blockedDependencies(f))])),
      '## Acceptance and technical debt', table(['Passed criteria', 'Failed criteria', 'Unverified criteria', 'Leaves with known limitations'],
        [[...['PASSED', 'FAILED', 'UNVERIFIED'].map(result => assessed.filter(c => c.result === result).length),
          leaves.filter(f => f.knownLimitations.length).length]]),
      '## Development history by month',
      'Counts use recorded updates after baseline registration. They measure registry activity and status changes.',
      table(['Month', 'Updates', 'Newly complete', 'Reopened'], [...velocity.entries()].sort(([a], [b]) => compare(a, b))
        .map(([month, v]) => [month, v.updates, v.completions, v.reopened]))),
    'development-backlog.md': make('Development Backlog', '## Approved requirements', table(backlogHeaders, backlogRows(approved)),
      '## Observed and proposed work', 'These items require product review before scope is added.',
      table(['Approval', ...backlogHeaders], other
        .map(f => [f.requirementSource.approval, ...backlogRows([f])[0]]))),
    'release-readiness.md': make('Security and Release Readiness Report',
      'Baseline CI evidence: ' + registry.baseline.verificationRun,
      '## Audit scope', bullets(registry.baseline.auditNotes),
      '## Open approved release gates', table(readinessHeaders, readinessRows(approved)),
      '## Observed and proposed features with open evidence', table(readinessHeaders, readinessRows(other))),
    'change-history.md': make('Feature Change History', table(['Date', 'Feature', 'Previous', 'Recorded', 'Change', 'Reference'],
      [...registry.history].reverse().map(h => [h.date, h.featureId, h.from, h.to, h.summary, h.reference]))),
  };
  const workbookHeaders = [...matrixHeaders, 'Description', 'Requirement', 'Evidence', 'Pull requests', 'Known limitations',
    'Remaining implementation', 'Criteria and results', 'Verification evidence'];
  const workbookRows = features.map((f, index) => [...matrixRows[index], f.description, f.requirementSource.reference,
    compact(f.sourceEvidence.map(e => e.path + ' · ' + e.detail)), compact(f.relatedPullRequests.map(n => repository + '/pull/' + n)),
    compact(f.knownLimitations), compact(f.remainingImplementation),
    compact(f.acceptanceCriteria.map(c => c.id + ': ' + c.description + ' (' + c.result + ')')),
    compact(f.verification.map(v => v.criterionId + ' · ' + v.commit + ' · ' + v.reference))]);
  files['feature-implementation-matrix.xlsx'] = featureWorkbook([workbookHeaders, ...workbookRows]);
  return files;
}

if (isMainModule(import.meta.url)) {
  const check = process.argv.includes('--check');
  const errors = [];
  const reports = buildReports(readRegistry());
  for (const [file, data] of Object.entries(reports)) {
    const filename = path.join(root, 'docs/product', file);
    if (!check) {
      writeFileSync(filename, data);
      continue;
    }
    const binary = Buffer.isBuffer(data);
    const actual = existsSync(filename) ? readFileSync(filename, binary ? undefined : 'utf8') : null;
    const identical = binary ? actual && data.equals(actual) : actual?.replace(/\r\n/g, '\n') === data;
    if (!identical) errors.push('Stale or missing report: docs/product/' + file);
  }
  if (errors.length) failOnErrors([...errors, 'Run npm run product:generate and commit generated reports.']);
  else console.log((check ? 'Validated ' : 'Generated ') + Object.keys(reports).length + ' registry reports.');
}
