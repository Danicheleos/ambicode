import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from '../contracts/config.ts';
import { loadPacksForProject } from './load.ts';
import { decisionFor, explainRefusal, resolvePolicy } from './resolve.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { toPosix } from '../util/glob.ts';

const BUILTIN_DIRECTORY = path.join(import.meta.dirname, '..', '..', 'policies');

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: 'web',
    root: 'apps/web',
    ecosystem: 'typescript',
    packs: [],
    policyFiles: [],
    commands: { lint: null, unit: null, e2e: null },
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
    project: project({ packs: ['builtin/common-quality'] }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });

  assert.deepEqual(diagnostics, []);
  assert.equal(packs.length, 1);
  assert.equal(packs[0]?.pack.authority, 'inherited');
  assert.ok(packs[0]?.pack.source.location.includes('grahpt'));

  const resolved = resolvePolicy({
    activity: 'review',
    project: project({ packs: ['builtin/common-quality'] }),
    packs,
    paths: ['apps/web/src/a.ts'],
  });
  assert.ok(resolved.rules.every((rule) => rule.qualifiedId.startsWith('common-quality/')));
  assert.ok(resolved.rules.some((rule) => rule.qualifiedId === 'common-quality/reuse-before-reimplementing'));
  assert.equal(resolved.prompts.length, 1);
  // `absolutePath` is a host path: it is handed to `fs.readText` and printed
  // in diagnostics for an operator to open, so it keeps the platform's own
  // separator and is `...\policies\prompts\...` on Windows. The assertion
  // normalizes to compare; production is not reshaped to suit a test (R1
  // defect 3).
  assert.ok(toPosix(resolved.prompts[0]?.absolutePath ?? '').endsWith('policies/prompts/review-smells.md'));
});

test('comment-reasons defaults to no comment, bounds its length, and refuses the same reason in several places', async () => {
  // Run 3c2188c8 added 38 comment lines to 161 code lines, 4 of them for a
  // 2-line change in a file that had none, and restated one reason in four
  // files. "Comment the non-obvious reason" read as an obligation to add them.
  const { packs } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ packs: ['builtin/common-quality'] }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });
  const rule = packs[0]?.pack.rules.find((candidate) => candidate.id === 'comment-reasons');
  assert.ok(rule, 'common-quality must still declare comment-reasons');
  const instruction = rule.instruction.replace(/\s+/g, ' ');
  assert.match(instruction, /default to no comment/i, 'must make no comment the default');
  assert.match(instruction, /fewest words|shortest/i, 'must bound how long a comment may be');
  assert.match(instruction, /once rather than|once, not/i, 'must forbid restating one reason in several places');
  // It rides every `prepare` call and the reviewer prompt.
  assert.ok(
    instruction.length < 320,
    `comment-reasons is ${instruction.length} characters; it is re-sent on every call and should stay short`,
  );
});

test('U26 every built-in pack loads and its referenced prompt files exist', async () => {
  const ids = [
    'common-quality', 'common-checks', 'python-quality',
    'angular-components', 'angular-architecture', 'angular-state', 'angular-http', 'angular-style',
    'express-http', 'express-persistence', 'express-errors', 'express-style',
  ];
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({
      packs: ids.map((id) => `builtin/${id}`),
      commands: { lint: null, unit: null, e2e: null },
    }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: '/nowhere',
  });
  assert.deepEqual(diagnostics.map((d) => d.message), []);
  assert.equal(packs.length, ids.length);
});

test('U03 a missing prompt file and an unknown command id are diagnosed, not ignored', async (t) => {
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
      'prompts: [{ stage: before-review, file: "./missing.md" }]',
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
  assert.ok(diagnostics.some((d) => d.code === 'path-missing'));
  assert.ok(diagnostics.some((d) => d.code === 'pack-unknown-command'));
});

test('U03 an unsupported prompt stage is a configuration error', async (t) => {
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
      'prompts: [{ stage: whenever, file: "./x.md" }]',
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

test('U07 a prompt reference that leaves the pack directory through a link is rejected', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(path.join(directory, 'outside.md'), 'secret guidance', 'utf8');
  await symlink(path.join(directory, 'outside.md'), path.join(packDirectory, 'linked.md'));
  await writeFile(
    path.join(packDirectory, 'escape.yaml'),
    [
      'schemaVersion: 1',
      'id: escape',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [review]',
      'source: { location: "test" }',
      'prompts:',
      '  - { stage: before-review, file: "./linked.md" }',
      '  - { stage: before-review, file: "../../outside.md" }',
    ].join('\n'),
    'utf8',
  );

  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: project({ policyFiles: ['.ambicode/policies/escape.yaml'] }),
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });

  assert.equal(packs[0]?.resolvedPrompts.length, 0);
  assert.equal(diagnostics.filter((d) => d.code === 'path-escape').length, 2);
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
    commands: { lint: null, unit: null, e2e: null },
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

  // common-checks says run; the project pack says forbid. Forbid wins.
  assert.equal(decisionFor(resolved, 'unit').action, 'forbid');
  assert.equal(decisionFor(resolved, 'e2e').action, 'propose');
  assert.equal(decisionFor(resolved, 'lint').action, 'run');
  // A command nothing mentions is never run just because nothing forbade it.
  assert.equal(decisionFor(resolved, 'architecture-report').action, 'undeclared');

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
  assert.equal(first.packs[0]?.replacedReference, 'builtin/python-quality');

  const resolved = resolvePolicy({ activity: 'review', project: replacing, packs: first.packs, paths: [] });
  // Whole-pack replacement: none of the built-in rules survive.
  assert.deepEqual(resolved.rules.map((rule) => rule.qualifiedId), ['python-quality/only-rule']);
  assert.equal(resolved.packs[0]?.replacedReference, 'builtin/python-quality');

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

  // An Express controller in the API project must not pick up Angular rules,
  // and a path belonging to the other project resolves to nothing here.
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
  assert.equal(decisionFor(review, 'lint').action, 'run');

  const investigate = resolvePolicy({ activity: 'investigate', project: config, packs, paths: ['apps/web/a.ts'] });
  assert.equal(decisionFor(investigate, 'lint').action, 'undeclared');
});

test('U06 output ordering is deterministic and independent of declaration order', async () => {
  const forward = project({ packs: ['builtin/common-quality', 'builtin/python-quality'] });
  const reverse = project({ packs: ['builtin/python-quality', 'builtin/common-quality'] });

  const a = await loadPacksForProject({ fs: nodeFileSystem, project: forward, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: '/x' });
  const b = await loadPacksForProject({ fs: nodeFileSystem, project: reverse, builtinDirectory: BUILTIN_DIRECTORY, repositoryRoot: '/x' });

  const resolveWith = (config: ProjectConfig, packs: Awaited<ReturnType<typeof loadPacksForProject>>['packs']) =>
    resolvePolicy({ activity: 'review', project: config, packs, paths: ['apps/web/a.py'] }).rules.map(
      (rule) => rule.qualifiedId,
    );

  assert.deepEqual(resolveWith(forward, a.packs), resolveWith(reverse, b.packs));
});

// doc 04 P2.4 correction B6/B7: an error in an applicable rule/prompt/command
// decision blocks; the same error in a valid pack that simply does not match
// this request's activity/path does not — though it may remain visible.

test('B6/B7 a broken review-only prompt/command does not block plan or investigate, but does block review', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'review-only.yaml'),
    [
      'schemaVersion: 1',
      'id: review-only',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [review]',
      'source: { location: "test" }',
      'prompts: [{ stage: before-review, file: "./missing.md" }]',
      'commandPolicy: [{ command: not-declared, action: run }]',
    ].join('\n'),
    'utf8',
  );

  const config = project({ policyFiles: ['.ambicode/policies/review-only.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.ok(diagnostics.some((d) => d.code === 'path-missing' && d.severity === 'error'));
  assert.ok(diagnostics.some((d) => d.code === 'pack-unknown-command' && d.severity === 'error'));

  // Not applicable to "plan" (the pack only declares activities: [review]):
  // both diagnostics become nonblocking, but stay visible.
  const forPlan = resolvePolicy({ activity: 'plan', project: config, packs, paths: [], diagnostics });
  assert.equal(forPlan.diagnostics.filter((d) => d.severity === 'error').length, 0);
  assert.ok(forPlan.diagnostics.some((d) => d.code === 'path-missing' && d.severity === 'notice'));
  assert.ok(forPlan.diagnostics.some((d) => d.code === 'pack-unknown-command' && d.severity === 'notice'));

  // Not applicable to "investigate" either, for the same reason.
  const forInvestigate = resolvePolicy({ activity: 'investigate', project: config, packs, paths: [], diagnostics });
  assert.equal(forInvestigate.diagnostics.filter((d) => d.severity === 'error').length, 0);

  // Applicable to "review": both diagnostics keep blocking.
  const forReview = resolvePolicy({ activity: 'review', project: config, packs, paths: [], diagnostics });
  assert.equal(forReview.diagnostics.filter((d) => d.severity === 'error').length, 2);
});

test('B6/B7 a broken prompt in a pack scoped to another path does not block a request outside that path, but does block one inside it', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'scoped.yaml'),
    [
      'schemaVersion: 1',
      'id: scoped',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [task]',
      'source: { location: "test" }',
      'prompts: [{ stage: before-work, file: "./missing.md" }]',
    ].join('\n'),
    'utf8',
  );

  const config = project({ policyFiles: ['.ambicode/policies/scoped.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.ok(diagnostics.some((d) => d.code === 'path-missing'));

  // A nonmatching path pack: applicable activity, but the path is elsewhere.
  const outside = resolvePolicy({
    activity: 'task',
    project: config,
    packs,
    paths: ['apps/web/a.ts'],
    diagnostics,
  });
  assert.equal(outside.diagnostics.filter((d) => d.severity === 'error').length, 0);

  // An applicable task whose broken task prompt actually matches this path
  // still blocks.
  const inside = resolvePolicy({
    activity: 'task',
    project: config,
    packs,
    paths: ['apps/web/src/orders/service.ts'],
    diagnostics,
  });
  assert.equal(inside.diagnostics.filter((d) => d.severity === 'error').length, 1);
});

// doc 04 P2.4 correction F: remindOnEdit defaults to false, and is only
// allowed on a path-specific pack.

test('F remindOnEdit defaults to false for a rule that does not declare it', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'scoped.yaml'),
    [
      'schemaVersion: 1',
      'id: scoped',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [task]',
      'source: { location: "test" }',
      'rules:',
      '  - id: no-secrets-in-logs',
      '    category: security',
      '    instruction: "Do not log secrets."',
      '    check: { kind: reviewer, explanation: "manual read" }',
      '  - id: reminder-rule',
      '    category: architecture',
      '    instruction: "Keep orders logic in the service layer."',
      '    check: { kind: reviewer, explanation: "manual read" }',
      '    remindOnEdit: true',
    ].join('\n'),
    'utf8',
  );

  const config = project({ policyFiles: ['.ambicode/policies/scoped.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.deepEqual(diagnostics, []);
  const resolved = resolvePolicy({ activity: 'task', project: config, packs, paths: ['apps/web/src/orders/x.ts'] });
  const noSecrets = resolved.rules.find((r) => r.qualifiedId === 'scoped/no-secrets-in-logs');
  const reminder = resolved.rules.find((r) => r.qualifiedId === 'scoped/reminder-rule');
  assert.equal(noSecrets?.remindOnEdit, false);
  assert.equal(reminder?.remindOnEdit, true);
});

test('F a broadly-applying pack ("**/*") cannot mark a rule as remindOnEdit', async (t) => {
  const directory = await sandbox(t);
  const packDirectory = path.join(directory, '.ambicode', 'policies');
  await mkdir(packDirectory, { recursive: true });
  await writeFile(
    path.join(packDirectory, 'broad.yaml'),
    [
      'schemaVersion: 1',
      'id: broad',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [task]',
      'source: { location: "test" }',
      'rules:',
      '  - id: reminder-rule',
      '    category: architecture',
      '    instruction: "Keep it simple."',
      '    check: { kind: reviewer, explanation: "manual read" }',
      '    remindOnEdit: true',
    ].join('\n'),
    'utf8',
  );

  const config = project({ policyFiles: ['.ambicode/policies/broad.yaml'] });
  const { packs, diagnostics } = await loadPacksForProject({
    fs: nodeFileSystem,
    project: config,
    builtinDirectory: BUILTIN_DIRECTORY,
    repositoryRoot: directory,
  });
  assert.ok(diagnostics.some((d) => d.code === 'remind-on-edit-broad-pack' && d.severity === 'error'));

  // Applicable to "task": blocks. Not applicable to "plan": downgraded (B6/B7).
  const forTask = resolvePolicy({ activity: 'task', project: config, packs, paths: [], diagnostics });
  assert.ok(forTask.diagnostics.some((d) => d.code === 'remind-on-edit-broad-pack' && d.severity === 'error'));
  const forPlan = resolvePolicy({ activity: 'plan', project: config, packs, paths: [], diagnostics });
  assert.ok(forPlan.diagnostics.every((d) => d.code !== 'remind-on-edit-broad-pack' || d.severity !== 'error'));
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

  // Its applicability can never be established (it never parsed), so it
  // keeps blocking every activity, not only the ones it might have declared.
  for (const activity of ['review', 'task', 'plan', 'investigate'] as const) {
    const resolved = resolvePolicy({ activity, project: config, packs, paths: [], diagnostics });
    assert.ok(
      resolved.diagnostics.some((d) => d.severity === 'error'),
      `activity "${activity}" must still be blocked by an unparsable pack`,
    );
  }
});
