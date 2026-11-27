
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { failOnErrors, featureIdPattern, git, isMainModule, readRegistry, registryPath, shaPattern, statuses } from './product-governance.mjs';

const requiredSections = ['Changed functionality', 'Acceptance criteria', 'Verification evidence', 'Remaining limitations',
  'Security and privacy impact'];
const placeholders = /^(?:(?:[-*]\s+)?(?:todo|tbd|n\/a|replace me|placeholder|none)\.?|\s*)$/i;

function sectionsOf(body) {
  const parts = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n').split(/^##[ \t]+(.+)$/m);
  const sections = new Map();
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    if (sections.has(title)) throw new Error('Duplicate pull request heading: ' + title);
    sections.set(title, parts[i + 1].trim());
  }
  return sections;
}

export function verifyCoverage({ baseRegistry, registry, body, changedFiles }) {
  const errors = [];
  const before = new Map((baseRegistry?.features || []).map(f => [f.id, f]));
  const after = new Map(registry.features.map(f => [f.id, f]));
  const changed = new Set();
  for (const id of before.keys()) {
    if (!after.has(id)) errors.push(id + ': permanent IDs cannot be removed or renamed');
  }
  for (const [id, feature] of after) {
    if (!isDeepStrictEqual(before.get(id), feature)) changed.add(id);
  }

  const oldHistory = baseRegistry?.history || [];
  if (!isDeepStrictEqual(registry.history.slice(0, oldHistory.length), oldHistory)) {
    errors.push('Feature history is append-only');
  }
  const updates = registry.history.slice(oldHistory.length);
  for (const entry of updates) {
    if (!changed.has(entry.featureId)) errors.push(entry.featureId + ': history entry has no feature change');
  }
  for (const id of changed) {
    const previous = before.get(id);
    const current = after.get(id);
    const events = updates.filter(entry => entry.featureId === id);
    if (events.length !== 1 || events[0].from !== (previous?.status ?? null) || events[0].to !== current.status) {
      errors.push(id + ': append one history entry with the exact previous and proposed status');
    }
    const acceptanceChanged = previous && !isDeepStrictEqual(previous.acceptanceCriteria,
      current.acceptanceCriteria);
    if (previous && current.status === 'COMPLETE'
        && (previous.status !== 'COMPLETE' || acceptanceChanged)
        && isDeepStrictEqual(previous.verification, current.verification)) {
      errors.push(id + ': new completion or changed criteria require new acceptance evidence');
    }
    if (previous && previous.productionReadiness !== 'COMPLETE' && current.productionReadiness === 'COMPLETE'
        && isDeepStrictEqual(previous.verification, current.verification)) {
      errors.push(id + ': readiness transition requires new staging evidence');
    }
  }

  let sections;
  try { sections = sectionsOf(body || ''); }
  catch (error) { return [...errors, error.message]; }
  for (const section of requiredSections) {
    if (placeholders.test(sections.get(section) || '')) errors.push('Explain “' + section + '” in the pull request');
  }

  const declarations = new Map();
  for (const line of (sections.get('Feature status changes') || '').split('\n')) {
    if (!line.startsWith('|')) continue;
    const [id, from, to, ...extra] = line.split('|').slice(1, -1).map(value => value.trim().replace(/^~|^~$/g, ''));
    if (id === 'Feature ID' || /^:?-+:?$/.test(id || '')) continue;
    if (!featureIdPattern.test(id || '') || extra.length || !(from === 'NEW' || statuses.includes(from)) || !statuses.includes(to)) {
      errors.push('Invalid feature status row: ' + line);
      continue;
    }
    if (declarations.has(id)) errors.push(id + ': duplicate pull request declaration');
    declarations.set(id, { from, to });
  }

  if (!changed.size) {
    if (declarations.size) errors.push('Feature declarations require matching updated records');
    const explanation = sections.get('No feature impact') || '';
    if (placeholders.test(explanation) || explanation.length < 20) {
      const candidates = registry.features.filter(f => f.sourceEvidence.some(e => changedFiles.includes(e.path))).map(f => f.id);
      errors.push('No feature records changed. Explain why under “No feature impact”.'
        + (candidates.length ? ' Review these records whose evidence changed: ' + candidates.join(', ') : ''));
    }
  } else {
    if (!placeholders.test(sections.get('No feature impact') || '')) {
      errors.push('Remove the no-impact explanation when feature records change');
    }
    for (const id of changed) {
      const declared = declarations.get(id);
      if (!declared || declared.from !== (before.get(id)?.status ?? 'NEW') || declared.to !== after.get(id).status) {
        errors.push(id + ': pull request must declare the exact previous and proposed status');
      }
    }
    for (const id of declarations.keys()) {
      if (!changed.has(id)) errors.push(id + ': declared feature record did not change');
    }
  }
  return errors;
}

function options(args) {
  const entries = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!['--base', '--body-file'].includes(args[index]) || !args[index + 1]) throw new Error('Use --base SHA --body-file FILE or a GitHub pull request event');
    entries.set(args[index], args[index + 1]);
  }
  if (entries.size) return { base: entries.get('--base'), body: readFileSync(entries.get('--body-file'), 'utf8') };
  if (!process.env.GITHUB_EVENT_PATH) throw new Error('A pull request event or --base SHA --body-file FILE is required');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  return { base: event.pull_request?.base?.sha, body: event.pull_request?.body };
}

if (isMainModule(import.meta.url)) {
  const { base, body } = options(process.argv.slice(2));
  if (!shaPattern.test(base || '')) throw new Error('Coverage requires an exact base commit SHA');
  const baseFiles = git(['ls-tree', '--name-only', base, '--', registryPath]).trim();
  const baseRegistry = baseFiles ? JSON.parse(git(['show', base + ':' + registryPath])) : null;
  const changedFiles = git(['diff', '--name-only', base, 'HEAD', '--']).trim().split('\n').filter(Boolean);
  const errors = verifyCoverage({ baseRegistry, registry: readRegistry(), body, changedFiles });
  if (errors.length) failOnErrors(errors);
  else console.log('Pull request declarations and append-only history match the registry diff.');
}
