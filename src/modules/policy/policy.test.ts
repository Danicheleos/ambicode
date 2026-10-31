import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ProjectConfig } from '#types/modules/config';
import { loadPacksForProject } from './packs/load.ts';
import { parse as parseYaml } from 'yaml';
import { PolicyPack } from '#types/modules/policy';
import { listBuiltinPackFiles } from './packs/builtin.ts';
import { decisionFor, explainRefusal, resolvePolicy } from './packs/resolve.ts';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { toPosix } from '#util/glob';
import { REPO_ROOT } from '#testing/paths';

const BUILTIN_DIRECTORY = path.join(REPO_ROOT, 'policies');
const COMMON_PACKS = ['common-design', 'common-code', 'common-errors', 'common-security', 'common-verification'];
const COMMON_REFERENCES = COMMON_PACKS.map((id) => `builtin/${id}`);

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: 'web',
    root: 'apps/web',
    paths: [],
    ecosystem: { languages: ['typescript'], frameworks: [], packageManager: null },
    include: [],
    exclude: [],
    ignored: [],
    packs: [],
    policyFiles: [],
    commands: { lint: 'lint', unit: 'unit', e2e: 'e2e' },
    checks: {},
    ...overrides,
  };
}

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-policy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('U03 built-in packs parse, keep authority and provenance, and qualify rule ids', async () => {
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ packs: COMMON_REFERENCES }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });

  assert.deepEqual(diagnostics, []);
  assert.equal(packs.length, COMMON_PACKS.length);
  for (const loaded of packs) {
    assert.equal(loaded.pack.authority, 'inherited', loaded.pack.id);
    assert.ok(loaded.pack.source.location.includes('grahpt'), loaded.pack.id);
  }

  const resolved = resolvePolicy({
    activity: 'review',
    project: project({ packs: COMMON_REFERENCES }),
    packs,
    paths: ['apps/web/src/a.ts'],
  });
  assert.ok(resolved.rules.every((rule) => COMMON_PACKS.some((id) => rule.qualifiedId.startsWith(`${id}/`))));
  assert.ok(resolved.rules.some((rule) => rule.qualifiedId === 'common-design/need'));
});

test('comment-reasons defaults to no comment, bounds its length, and refuses the same reason in several places', async () => {
  const { packs } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ packs: COMMON_REFERENCES }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });
  const rule = packs.flatMap((loaded) => loaded.pack.rules).find((candidate) => candidate.id === 'comment-reasons');
  assert.ok(rule, 'the common packs must still declare comment-reasons');
  const instruction = rule.instruction.replace(/\s+/g, ' ');
  assert.match(instruction, /default to no comment/i, 'must make no comment the default');
  assert.match(instruction, /fewest words|shortest/i, 'must bound how long a comment may be');
  assert.match(instruction, /once rather than|once, not/i, 'must forbid restating one reason in several places');
  assert.ok(
    instruction.length < 320,
    `comment-reasons is ${instruction.length} characters; it is re-sent on every call and should stay short`,
  );
});

test('U26 every built-in pack loads', async () => {
  const ids = [
    ...COMMON_PACKS, 'common-checks', 'python-quality',
    'angular-components', 'angular-architecture', 'angular-state', 'angular-http', 'angular-style',
    'express-http', 'express-persistence', 'express-errors',
  ];
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({
      packs: ids.map((id) => `builtin/${id}`),
      commands: { lint: 'lint', unit: 'unit', e2e: 'e2e' },
    }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });
  assert.deepEqual(diagnostics.map((d) => d.message), []);
  assert.equal(packs.length, ids.length);
});

test('U03 an unknown command id is diagnosed, not ignored', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'broken.yaml'),
    [
      'schemaVersion: 1',
      'id: broken',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [review]',
      'source: { location: "test" }',
      'commandPolicy: [{ command: not-declared, action: run }]',
    ].join('\n'),
    'utf8',
  );

  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ policyFiles: ['.ambicode/policies/broken.yaml'] }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });

  assert.equal(packs.length, 1);
  assert.ok(diagnostics.some((d) => d.code === 'pack-unknown-command'));
});

test('a replaces copy may name the commands its built-in names, and a typo in any other is still an error', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  const copy = (command: string): string => [
    'schemaVersion: 1', 'id: common-code', 'replaces: builtin/common-code', 'authority: team', 'appliesTo: ["**/*"]', 'activities: [review]',
    'source: { location: "copy" }', 'rules:', '  - id: lint-rule', '    category: correctness', '    instruction: "Lint."', `    check: { kind: command, command: ${command}, explanation: "x" }`,
  ].join('\n');
  const load = async (command: string) => {
    await writeFile(path.join(packDirectory, 'copy.yaml'), copy(command), 'utf8');
    return loadPacksForProject({ fs: nodeFileSystem, project: project({ commands: {}, checks: {}, policyFiles: ['.ambicode/policies/copy.yaml'] }), builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: directory });
  };
  assert.deepEqual((await load('lint')).diagnostics, [], 'the built-in names lint, so the copy may');
  const typo = (await load('lnt')).diagnostics;
  assert.ok(typo.some((d) => d.code === 'pack-unknown-command' && /"lnt"/.test(d.message)), JSON.stringify(typo));
});

test('a pack declaring `prompts` is rejected: the field no longer exists', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode', 'policies'), { recursive: true });
  await writeFile(
    path.join(directory, '.ambicode', 'policies', 'stage.yaml'),
    [
      'schemaVersion: 1',
      'id: stage',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [review]',
      'source: { location: "test" }',
      'prompts: []',
    ].join('\n'),
    'utf8',
  );

  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ policyFiles: ['.ambicode/policies/stage.yaml'] }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.equal(packs.length, 0);
  assert.ok(diagnostics.some((d) => d.code === 'pack-invalid' && d.message.includes('prompts')));
});

test('U04 command precedence is forbid over propose over run, and silence is not permission', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'orders.yaml'),
    [
      'schemaVersion: 1',
      'id: orders-operations',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [review, task]',
      'source: { location: "Project engineering policy: orders" }',
      'commandPolicy:',
      '  - { command: unit, action: forbid, reason: "Snapshots must not be rewritten here." }',
      '  - { command: e2e, action: propose, reason: "Needs a running environment." }',
    ].join('\n'),
    'utf8',
  );

  const config = project({
    packs: ['builtin/common-checks'],
    policyFiles: ['.ambicode/policies/orders.yaml'],
    commands: { lint: 'lint', unit: 'unit', e2e: 'e2e' },
  });
  const { packs } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });

  const resolved = resolvePolicy({
    activity: 'review',
    project: config,
    packs,
    paths: ['apps/web/src/orders/create.ts'],
  });

  assert.equal(decisionFor(resolved, 'unit').action, 'forbid');
  assert.equal(decisionFor(resolved, 'e2e').action, 'propose');
  assert.equal(decisionFor(resolved, 'lint').action, 'run');
  assert.equal(decisionFor(resolved, 'architecture-report').action, 'run');

  assert.ok(explainRefusal(resolved, 'unit').includes('Snapshots must not be rewritten here.'));
  assert.ok(explainRefusal(resolved, 'unit').includes('.ambicode/policies/orders.yaml'));
});

test('U04 a scoped pack does not apply to paths outside its globs', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'orders.yaml'),
    [
      'schemaVersion: 1',
      'id: orders-operations',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [review]',
      'source: { location: "test" }',
      'commandPolicy: [{ command: unit, action: forbid }]',
    ].join('\n'),
    'utf8',
  );

  const config = project({
    packs: ['builtin/common-checks'],
    policyFiles: ['.ambicode/policies/orders.yaml'],
  });
  const { packs } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });

  const elsewhere = resolvePolicy({
    activity: 'review',
    project: config,
    packs,
    paths: ['apps/web/src/billing/create.ts'],
  });
  assert.equal(decisionFor(elsewhere, 'unit').action, 'run');
});

test('U05 replacement is explicit and whole-pack, and an implicit duplicate fails', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });

  const write = async (name: string, body: string[]): Promise<void> => {
    await writeFile(path.join(packDirectory, name), body.join('\n'), 'utf8');
  };

  await write('replacement.yaml', [
    'schemaVersion: 1',
    'id: python-quality',
    'authority: team',
    'appliesTo: ["**/*.py"]',
    'activities: [review]',
    'source: { location: "Project policy: python" }',
    'replaces: builtin/python-quality',
    'rules:',
    '  - id: only-rule',
    '    category: correctness',
    '    instruction: "The project owns this pack now."',
    '    check: { kind: reviewer, explanation: "reviewer" }',
  ]);
  await write('duplicate.yaml', [
    'schemaVersion: 1',
    'id: python-quality',
    'authority: team',
    'appliesTo: ["**/*.py"]',
    'activities: [review]',
    'source: { location: "Accidental copy" }',
  ]);

  const replacing = project({
    packs: ['builtin/python-quality'],
    policyFiles: ['.ambicode/policies/replacement.yaml'],
  });
  const first = await loadPacksForProject({
    fs: nodeFileSystem,
    project: replacing,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.deepEqual(first.diagnostics, []);
  assert.equal(first.packs.length, 1);
  assert.equal(first.packs[0]?.origin, 'project');

  const resolved = resolvePolicy({ activity: 'review', project: replacing, packs: first.packs, paths: [] });
  assert.deepEqual(resolved.rules.map((rule) => rule.qualifiedId), ['python-quality/only-rule']);

  const duplicating = project({
    packs: ['builtin/python-quality'],
    policyFiles: ['.ambicode/policies/duplicate.yaml'],
  });
  const second = await loadPacksForProject({
    fs: nodeFileSystem,
    project: duplicating,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.ok(second.diagnostics.some((d) => d.code === 'pack-duplicate-id'));
});

test('a policy file replacing a built-in this release lacks is an error pointing at the migration guide, and so is naming that built-in in packs', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode', 'policies'), { recursive: true });
  await writeFile(path.join(directory, '.ambicode', 'policies', 'old.yaml'), ['schemaVersion: 1', 'id: common-quality', 'replaces: builtin/common-quality', 'authority: team', 'appliesTo: ["**/*"]', 'activities: [review]', 'source: { location: "old copy" }'].join('\n'));
  const loaded = await loadPacksForProject({ fs: nodeFileSystem, project: project({ packs: ['builtin/common-quality'], policyFiles: ['.ambicode/policies/old.yaml'] }), builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: directory });
  const replaced = loaded.diagnostics.find((d) => d.code === 'pack-replaces-missing');
  assert.match(replaced?.message ?? '', /builtin\/common-quality.*docs\/rule-migration\.md/);
  assert.match(loaded.diagnostics.find((d) => d.code === 'pack-missing')?.message ?? '', /docs\/rule-migration\.md/);
});

test('two built-in packs with one id are refused', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'group'));
  await writeFile(path.join(directory, 'one.yaml'), '');
  await writeFile(path.join(directory, 'group', 'one.yaml'), '');
  await assert.rejects(listBuiltinPackFiles(nodeFileSystem, directory), (error: { code?: string }) => error.code === 'builtin-pack-duplicate');
});

test('U06 framework packs stay in their own scope', async () => {
  const angular = project({
    id: 'web',
    root: 'apps/web',
    packs: ['builtin/angular-components'],
  });
  const express = project({
    id: 'api',
    root: 'services/api',
    packs: ['builtin/express-http'],
  });

  const angularPacks = await loadPacksForProject({
    fs: nodeFileSystem,
    project: angular,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });
  const expressPacks = await loadPacksForProject({
    fs: nodeFileSystem,
    project: express,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });

  const angularResolved = resolvePolicy({
    activity: 'review',
    project: angular,
    packs: angularPacks.packs,
    paths: ['services/api/src/order.controller.ts'],
  });
  assert.deepEqual(angularResolved.rules, []);

  const expressResolved = resolvePolicy({
    activity: 'review',
    project: express,
    packs: expressPacks.packs,
    paths: ['services/api/src/order.controller.ts'],
  });
  assert.ok(expressResolved.rules.every((rule) => rule.packId === 'express-http'));
  assert.ok(expressResolved.rules.length > 0);
});

test('U06 activity filtering keeps read-only work out of check decisions', async () => {
  const config = project({ packs: ['builtin/common-checks'] });
  const { packs } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });

  const review = resolvePolicy({ activity: 'review', project: config, packs, paths: ['apps/web/a.ts'] });
  assert.equal(decisionFor(review, 'e2e').action, 'propose');

  const investigate = resolvePolicy({ activity: 'investigate', project: config, packs, paths: ['apps/web/a.ts'] });
  assert.equal(decisionFor(investigate, 'e2e').action, 'run');
});

test('U06 output ordering is deterministic and independent of declaration order', async () => {
  const forward = project({ packs: [...COMMON_REFERENCES, 'builtin/python-quality'] });
  const reverse = project({ packs: ['builtin/python-quality', ...COMMON_REFERENCES.toReversed()] });

  const a = await loadPacksForProject({ fs: nodeFileSystem, project: forward, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: '/x' });
  const b = await loadPacksForProject({ fs: nodeFileSystem, project: reverse, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: '/x' });

  const resolveWith = (config: ProjectConfig, packs: Awaited<ReturnType<typeof loadPacksForProject>>['packs']) =>
    resolvePolicy({ activity: 'review', project: config, packs, paths: ['apps/web/a.py'] }).rules.map(
      (rule) => rule.qualifiedId,
    );

  assert.deepEqual(resolveWith(forward, a.packs), resolveWith(reverse, b.packs));
});

test('B6/B7 an invalid pack whose applicability cannot be established keeps blocking regardless of activity', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(path.join(packDirectory, 'invalid.yaml'), 'not: [valid, yaml', 'utf8');

  const config = project({ policyFiles: ['.ambicode/policies/invalid.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.equal(packs.length, 0);
  assert.ok(diagnostics.some((d) => d.severity === 'error' && (d.code === 'pack-unparsable' || d.code === 'pack-invalid')));

  for (const activity of ['review', 'task', 'plan', 'investigate'] as const) {
    const resolved = resolvePolicy({ activity, project: config, packs, paths: [], diagnostics });
    assert.ok(
      resolved.diagnostics.some((d) => d.severity === 'error'),
      `activity "${activity}" must still be blocked by an unparsable pack`,
    );
  }
});

async function writePack(directory: string, name: string, lines: string[]): Promise<void> {
  await mkdir(path.join(directory, '.ambicode', 'policies'), { recursive: true });
  await writeFile(path.join(directory, '.ambicode', 'policies', name), [...lines, ''].join('\n'));
}

const SCOPED_PACK = [
  'schemaVersion: 1', 'id: scoped', 'authority: team', 'appliesTo: ["**/*"]', 'activities: [review, task, plan]', 'source: { location: "test" }', 'rules:',
  '  - { id: any, category: architecture, instruction: Applies everywhere., check: { kind: reviewer, explanation: x } }',
  '  - { id: plan-only, category: architecture, instruction: Plan only., activities: [plan], check: { kind: reviewer, explanation: x } }',
];

test('a rule narrows its pack: per-rule activities resolve, and an absent one keeps the pack value', async (t) => {
  const directory = await sandbox(t);
  await writePack(directory, 'scoped.yaml', SCOPED_PACK);
  const scoped = project({ root: '.', policyFiles: ['.ambicode/policies/scoped.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({ fs: nodeFileSystem, project: scoped, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: directory });
  assert.deepEqual(diagnostics, []);
  const ids = (activity: 'plan' | 'task', paths: string[]): string[] => resolvePolicy({ activity, project: scoped, packs, paths }).rules.map((rule) => rule.qualifiedId);
  assert.deepEqual(ids('plan', ['src/a.ts']), ['scoped/any', 'scoped/plan-only']);
  assert.deepEqual(ids('task', ['src/a.ts']), ['scoped/any']);
  assert.deepEqual(ids('task', []), ['scoped/any']);
});

test('a rule that lists an activity its pack does not carry is a pack error', async (t) => {
  const directory = await sandbox(t);
  await writePack(directory, 'wide.yaml', SCOPED_PACK.map((line) => line.replace('activities: [review, task, plan]', 'activities: [review]').replace('activities: [plan],', 'activities: [plan, task],')));
  const { diagnostics } = await loadPacksForProject({ fs: nodeFileSystem, project: project({ root: '.', policyFiles: ['.ambicode/policies/wide.yaml'] }), builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: directory });
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'pack-invalid' && /plan-only/.test(diagnostic.message)), JSON.stringify(diagnostics));
});

test('the 23 common rules each name their activities; review carries 20: the reviewer agent covers three of the other rules (deliberate) and reuse-before-reimplementing is cited by its findings; only fix-the-cause and reuse-before-reimplementing sit in both plan and task, the review-only rules never reach plan or task', async () => {
  const config = project({ packs: COMMON_REFERENCES });
  const { packs } = await loadPacksForProject({ fs: nodeFileSystem, project: config, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: '/nowhere' });
  const ruleIds = (activity: 'plan' | 'task' | 'review') => resolvePolicy({ activity, project: config, packs, paths: ['apps/web/src/a.ts'] }).rules.map((rule) => rule.qualifiedId.split('/')[1]!);
  const plan = ruleIds('plan');
  const task = ruleIds('task');
  const review = ruleIds('review');
  assert.equal(packs.flatMap((loaded) => loaded.pack.rules).length, 23);
  assert.equal(review.length, 20, 'deliberate: 23 rules minus the three the reviewer agent restates');
  for (const id of ['dead-surface', 'callers', 'error-honesty']) assert.ok(!review.includes(id), `${id} is absent from review`);
  assert.ok(review.includes('reuse-before-reimplementing'), 'a duplication finding can cite the rule');
  const reviewOnly = ['honest-gaps', 'no-secret-exposure', 'untrusted-input-allowlist', 'outbound-timeouts', 'configured-logger'];
  for (const id of reviewOnly) assert.ok(!plan.includes(id) && !task.includes(id), id);
  assert.deepEqual(plan.filter((id) => task.includes(id)).sort(), ['fix-the-cause', 'reuse-before-reimplementing']);
  assert.ok(plan.includes('scope') && !task.includes('scope'));
  for (const id of ['callers', 'no-check-evasion', 'unobserved-async']) assert.ok(task.includes(id) && !plan.includes(id), id);
  assert.equal(plan.length + task.length, 20);
});

test('two built-in files with one id, in different folders, are refused', async (t) => {
  const directory = await sandbox(t);
  for (const folder of ['one', 'two']) {
    await mkdir(path.join(directory, folder), { recursive: true });
    await writeFile(path.join(directory, folder, 'same.yaml'), 'id: same\n');
  }
  await assert.rejects(
    loadPacksForProject({ fs: nodeFileSystem, project: project({ packs: ['builtin/same'] }), builtinDirectory: directory, repositoryRoot: '/nowhere' }),
    /share the id "same"/,
  );
  assert.deepEqual((await listBuiltinPackFiles(nodeFileSystem, BUILTIN_DIRECTORY)).map((file) => file.id).filter((id, index, all) => all.indexOf(id) !== index), [], 'the shipped policies have unique ids');
});

test('every built-in pack carries a one-line description, and no pack marker key is accepted', async () => {
  for (const file of await listBuiltinPackFiles(nodeFileSystem, BUILTIN_DIRECTORY)) {
    const parsed = PolicyPack.parse(parseYaml(await nodeFileSystem.readText(file.filePath)));
    assert.ok(parsed.description !== undefined && !parsed.description.includes('\n'), `${file.id} needs a one-line description`);
  }
  const text = await nodeFileSystem.readText(path.join(BUILTIN_DIRECTORY, 'common', 'common-checks.yaml'));
  for (const key of ['detect', 'unless']) assert.equal(PolicyPack.safeParse({ ...parseYaml(text), [key]: [{ file: 'manifest' }] }).success, false, key);
});

test('U03 a project declaring no commands still loads the command-naming built-ins, and runs nothing', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), '{"name":"x"}\n');
  const bare = project({ root: '.', commands: {}, checks: {} });
  const { packs, diagnostics } = await loadPacksForProject({ fs: nodeFileSystem, project: { ...bare, packs: [...COMMON_REFERENCES, 'builtin/common-checks'] }, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: directory });
  assert.deepEqual(diagnostics, []);
  assert.equal(packs.length, COMMON_PACKS.length + 1);
});

test('a rule is cut by pack appliesTo and activities only; a rule with kinds is refused, not ignored', () => {
  const rule = (id: string, extra: object = {}) => ({ id, category: 'architecture', instruction: 'x', check: { kind: 'reviewer', explanation: 'x' }, ...extra });
  const pack = PolicyPack.parse({
    schemaVersion: 1, id: 'scoped', authority: 'team', appliesTo: ['src/**'], activities: ['task', 'plan'], source: { location: 't' },
    rules: [rule('everywhere'), rule('review-only', { activities: ['review'] })],
  });
  const packs = [{ pack, reference: 'p.yaml', origin: 'project' as const, filePath: '/p.yaml' }];
  const ids = (activity: 'task' | 'plan' | 'review', paths: string[]) => resolvePolicy({ activity, project: project({ root: '.' }), packs, paths }).rules.map((entry) => entry.qualifiedId.split('/')[1]);
  assert.deepEqual(ids('task', ['src/a.component.ts']), ['everywhere']);
  assert.deepEqual(ids('task', ['src/a.html']), ['everywhere'], 'no file type narrows a rule');
  assert.deepEqual(ids('task', ['lib/a.ts']), [], 'outside the pack appliesTo nothing is staged');
  assert.deepEqual(ids('task', []), ['everywhere'], 'no paths: every pack of the activity contributes');
  assert.deepEqual(ids('review', []), [], 'the pack is not a review pack');
  assert.equal(PolicyPack.safeParse({ ...pack, rules: [rule('bound', { kinds: ['component'] })] }).success, false);
});
