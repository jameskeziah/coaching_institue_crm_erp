
import Ajv from 'ajv';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { failOnErrors, git, isMainModule, readJson, readRegistry, root, schemaPath } from './product-governance.mjs';

const schema = new Ajv({ allErrors: true }).compile(readJson(schemaPath));

function isDate(value) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().startsWith(value + 'T');
}

function collectCycles(features, edges, name, errors) {
  const checked = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(name + ' cycle includes ' + id);
      return;
    }
    if (!features.has(id) || checked.has(id)) return;
    visiting.add(id);
    for (const related of edges(features.get(id))) visit(related);
    visiting.delete(id);
    checked.add(id);
  }
  for (const id of features.keys()) visit(id);
}

function normalizedSourcePath(file) {
  const parts = file.split('/');
  return !file.includes('\\') && !file.includes(':')
    && !parts.some(part => ['', '.', '..'].includes(part) || /^\.env(?:\.|$)/.test(part) && part !== '.env.example');
}

function hasEvidenceLink(reference, commit, repository) {
  const links = [...reference.matchAll(/https:\/\/[^\s|<>]+/g)].map(match => match[0].replace(/[),.;]+$/, ''));
  const explanation = reference.replace(/https:\/\/[^\s|<>]+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  return explanation.length >= 12 && links.some(link => {
    const url = URL.parse(link);
    return url?.hostname === 'github.com' && (
      (link.startsWith(repository + '/actions/')
        && /^\/[^/]+\/[^/]+\/actions\/runs\/\d+(?:\/(?:job|artifacts)\/\d+)?\/?$/.test(url.pathname))
      || url.pathname.split('/').includes(commit)
    );
  });
}

function inspectFeature(feature, features, registry, errors, sourceExists, commitExists) {
  const { id, parentId, dependencies, sourceEvidence, acceptanceCriteria, verification } = feature;
  const reject = message => errors.push(id + ': ' + message);
  if (parentId && !features.has(parentId)) reject('unknown parent ' + parentId);
  for (const dependency of dependencies) {
    if (!features.has(dependency)) reject('unknown dependency ' + dependency);
  }
  if (['COMPLETE', 'PARTIAL'].includes(feature.status) && !sourceEvidence.length) reject('implemented work requires source evidence');
  if (feature.status !== 'COMPLETE' && !feature.remainingImplementation.length) reject('record remaining implementation or verification');
  for (const evidence of sourceEvidence) {
    if (!normalizedSourcePath(evidence.path) || !sourceExists(evidence.path)) reject('missing or unsafe source file ' + evidence.path);
  }

  const byCriterion = new Map(acceptanceCriteria.map(criterion => [criterion.id, criterion]));
  if (byCriterion.size !== acceptanceCriteria.length) reject('duplicate acceptance criterion ID');
  for (const item of verification) {
    const criterion = byCriterion.get(item.criterionId);
    if (!criterion || criterion.result === 'UNVERIFIED') reject('verification must target an assessed criterion: ' + item.criterionId);
    if (!isDate(item.date)) reject('invalid verification date ' + item.date);
    if (!commitExists(item.commit)) reject('unknown verified commit ' + item.commit);
    if (!hasEvidenceLink(item.reference, item.commit, registry.repository)) {
      reject('verification reference must describe the specific check and link to a GitHub Actions run or commit-pinned evidence');
    }
    if (feature.lastVerifiedDate && item.date > feature.lastVerifiedDate) reject('verification is newer than lastVerifiedDate');
  }
  for (const criterion of acceptanceCriteria) {
    if (criterion.result !== 'UNVERIFIED' && !verification.some(item => item.criterionId === criterion.id)) {
      reject(criterion.id + ' has a result without evidence');
    }
  }
  const hasLatest = verification.some(item => item.commit === feature.lastVerifiedCommit && item.date === feature.lastVerifiedDate);
  if (verification.length ? !hasLatest : feature.lastVerifiedDate !== null || feature.lastVerifiedCommit !== null) {
    reject('last verified commit/date must match criterion evidence or both be null');
  }

  const allPassed = acceptanceCriteria.every(criterion => criterion.result === 'PASSED'
    && verification.some(item => item.criterionId === criterion.id && item.commit === feature.lastVerifiedCommit));
  if (feature.status === 'COMPLETE') {
    if (!allPassed || !sourceEvidence.some(item => ['test', 'ops', 'ci'].includes(item.kind))) {
      reject('COMPLETE requires passing feature-specific evidence for every criterion at the verified revision');
    }
    if (feature.remainingImplementation.length) reject('COMPLETE cannot have remaining implementation');
    if (feature.requirementSource.approval === 'PROPOSED') reject('a proposed requirement cannot be marked COMPLETE');
  }
  if (feature.productionReadiness === 'COMPLETE') {
    const staged = acceptanceCriteria.some(criterion => criterion.result === 'PASSED'
      && verification.some(item => item.criterionId === criterion.id && item.kind === 'staging-verification'
        && item.commit === feature.lastVerifiedCommit));
    if (feature.status !== 'COMPLETE' || !staged || dependencies.some(dependency => features.get(dependency)?.status !== 'COMPLETE')) {
      reject('production readiness requires completed implementation, fulfilled dependencies and staging evidence');
    }
  }
}

export function validateRegistry(registry, { sourceExists, commitExists } = {}) {
  if (!schema(registry)) return schema.errors.map(error => (error.instancePath || '/') + ' ' + error.message);
  const errors = [];
  if (!sourceExists) {
    const tracked = new Set(git(['ls-files', '-z']).split('\0'));
    const canonicalRoot = realpathSync(root);
    sourceExists = file => {
      const candidate = path.join(root, file);
      if (!tracked.has(file) || !existsSync(candidate) || !statSync(candidate).isFile()) return false;
      const relative = path.relative(canonicalRoot, realpathSync(candidate));
      return !path.isAbsolute(relative) && !relative.split(path.sep).includes('..');
    };
  }
  if (!commitExists) {
    const commits = new Map();
    commitExists = sha => {
      if (!commits.has(sha)) {
        try { commits.set(sha, git(['cat-file', '-t', sha]).trim() === 'commit'); }
        catch { commits.set(sha, false); }
      }
      return commits.get(sha);
    };
  }
  if (!isDate(registry.baseline.date)) errors.push('invalid baseline audit date');
  if (!commitExists(registry.baseline.commit)) errors.push('unknown baseline commit ' + registry.baseline.commit);
  const features = new Map();
  for (const feature of registry.features) {
    if (features.has(feature.id)) errors.push('duplicate feature ID ' + feature.id);
    features.set(feature.id, feature);
  }
  collectCycles(features, feature => feature.parentId ? [feature.parentId] : [], 'Parent', errors);
  collectCycles(features, feature => feature.dependencies, 'Dependency', errors);
  for (const feature of features.values()) inspectFeature(feature, features, registry, errors, sourceExists, commitExists);

  const snapshots = new Map();
  for (const entry of registry.history) {
    const previous = snapshots.get(entry.featureId);
    if (!features.has(entry.featureId)) errors.push('history references unknown ID ' + entry.featureId);
    if ((previous?.to ?? null) !== entry.from) errors.push(entry.featureId + ': history does not start from prior status');
    if (!isDate(entry.date) || (previous && entry.date < previous.date)) errors.push(entry.featureId + ': invalid history date/order');
    snapshots.set(entry.featureId, entry);
  }
  for (const feature of features.values()) {
    if (snapshots.get(feature.id)?.to !== feature.status) errors.push(feature.id + ': latest history must match current status');
  }
  return errors;
}

if (isMainModule(import.meta.url)) {
  const registry = readRegistry();
  const errors = validateRegistry(registry);
  if (errors.length) failOnErrors(errors);
  else console.log('Feature registry valid: ' + registry.features.length + ' features, ' + registry.history.length + ' history entries.');
}
