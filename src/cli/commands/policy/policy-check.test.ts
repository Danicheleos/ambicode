import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import type { Diagnostic } from '#types/modules/policy';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { isAmbicodeError } from '#util/errors';
import { parseArgs } from '#util/args';
import { openWorkspace, projectById, toRepositoryRelative } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { runPolicyCheck, POLICY_CHECK_OPTIONS, type PolicyCheckOutput } from './policy-check.ts';
import { REPO_ROOT } from '#testing/paths';
import { CONFIG_HEAD } from '#testing/fixtures/route-fixture';
import type { Runtime } from '#types/composition';

function configYaml(projects: readonly string[]): string {
  return [CONFIG_HEAD, ...projects, ''].join('\n');
}

const ONE_PROJECT = [
  '  - id: web',
  '    root: .',
  '    paths: []',
  '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
  '    packs: []',
  '    policyFiles: []',
  '    commands: {}',
  '    checks: { lint: { all: null, file: null } }',
];

async function repoWithLayout(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  await repo.write('src/orders/order-list.component.ts', 'export class OrderListComponent {}\n');
  await repo.write('src/orders/order-detail.component.ts', 'export class OrderDetailComponent {}\n');
  await repo.write('src/orders/orders.service.ts', 'export class OrdersService {}\n');
  await repo.write('.ambicode/config.yaml', configYaml(ONE_PROJECT));
  await repo.commitAll('layout');
  return repo;
}

function pack(lines: readonly string[]): string {
  return `${lines.join('\n')}\n`;
}

const COMPONENT_PACK = pack([
  'schemaVersion: 1',
  'id: team-components',
  'authority: team',
  'appliesTo: ["src/**/*.component.ts"]',
  'activities: [review, task]',
  'source: { location: "CLAUDE.md, section \'Components\'" }',
  'rules:',
  '  - id: no-transport-in-components',
  '    category: architecture',
  '    instruction: A component must not call HTTP directly; the service layer owns transport.',
  '    check: { kind: reviewer, explanation: "Judged from the changed component and its service." }',
]);

async function check(runtime: Runtime, argv: readonly string[]): Promise<PolicyCheckOutput> {
  return runPolicyCheck(runtime, parseArgs('policy check', argv, POLICY_CHECK_OPTIONS));
}

function codes(diagnostics: readonly Diagnostic[], severity?: Diagnostic['severity']): string[] {
  return diagnostics
    .filter((diagnostic) => severity === undefined || diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code)
    .sort();
}

describe('R3 ambicode policy check', () => {
  it('validates a candidate pack nothing references yet', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('.ambicode/policies/team-components.yaml', COMPONENT_PACK);
      const runtime = await createRuntime({ cwd: repo.root });

      const output = await check(runtime, ['.ambicode/policies/team-components.yaml']);

      assert.equal(output.ok, true, JSON.stringify(output.diagnostics));
      assert.deepEqual(output.files, [{ path: '.ambicode/policies/team-components.yaml', packId: 'team-components' }]);
      const workspace = await openWorkspace(runtime);
      assert.deepEqual(projectById(workspace.config, 'web').policyFiles, []);
    } finally {
      await repo.dispose();
    }
  });

  it('catches the load-time rules the schema does not carry', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write(
        '.ambicode/policies/drift.yaml',
        pack([
          'schemaVersion: 1',
          'id: drift',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'prompts: [{ stage: before-review, file: "./missing.md" }]',
          'commandPolicy: [{ command: not-declared, action: run }]',
          'rules: []',
        ]),
      );
      await repo.write('.ambicode/policies/broken.yaml', 'appliesTo: [\n');
      await repo.write('.ambicode/policies/invalid.yaml', 'schemaVersion: 2\n');

      const runtime = await createRuntime({ cwd: repo.root });
      const output = await check(runtime, [
        '.ambicode/policies/drift.yaml',
        '.ambicode/policies/broken.yaml',
        '.ambicode/policies/invalid.yaml',
        '.ambicode/policies/not-there.yaml',
      ]);

      assert.equal(output.ok, false);
      const found = new Set(codes(output.diagnostics, 'error'));
      for (const expected of ['path-missing', 'pack-unknown-command', 'pack-invalid', 'pack-unparsable', 'pack-missing']) {
        assert.ok(found.has(expected), `expected a ${expected} diagnostic, got ${[...found].join(', ')}`);
      }
      assert.deepEqual(
        output.files.filter((file) => file.packId === null).map((file) => path.posix.basename(file.path)),
        ['broken.yaml', 'invalid.yaml', 'not-there.yaml'],
      );
    } finally {
      await repo.dispose();
    }
  });

  /** Both paths call `packs/validate.ts`; a rule added to only one of them breaks this. */
  it('holds a candidate pack to exactly the rules the loader applies', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write(
        '.ambicode/policies/drift.yaml',
        pack([
          'schemaVersion: 1',
          'id: drift',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'prompts: [{ stage: before-review, file: "./nowhere.md" }]',
          'commandPolicy: [{ command: never-declared, action: run }]',
          'rules:',
          '  - id: verify',
          '    category: workflow',
          '    instruction: Something.',
          '    check: { kind: command, command: also-never-declared, explanation: "x" }',
        ]),
      );
      const runtime = await createRuntime({ cwd: repo.root });

      const fromCommand = await check(runtime, ['--project', 'web', '.ambicode/policies/drift.yaml']);

      const workspace = await openWorkspace(runtime);
      const fromLoader = await loadPacksForProject({
        fs: runtime.fs,
        project: { ...projectById(workspace.config, 'web'), policyFiles: ['.ambicode/policies/drift.yaml'] },
        builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot),
        repositoryRoot: workspace.repositoryRoot,
      });

      assert.deepEqual(codes(fromCommand.diagnostics, 'error'), codes(fromLoader.diagnostics, 'error'));
      assert.ok(codes(fromLoader.diagnostics, 'error').length >= 3);
    } finally {
      await repo.dispose();
    }
  });

  it('names an unknown --project instead of guessing one', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('.ambicode/policies/team-components.yaml', COMPONENT_PACK);
      const runtime = await createRuntime({ cwd: repo.root });
      assert.equal(await failureCode(check(runtime, ['--project', 'nope', '.ambicode/policies/team-components.yaml'])), 'unknown-project');
    } finally {
      await repo.dispose();
    }
  });

  it('needs at least one candidate file', async () => {
    const repo = await repoWithLayout();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      assert.equal(await failureCode(check(runtime, [])), 'bad-argument');
    } finally {
      await repo.dispose();
    }
  });

  it('exits nonzero on an error and zero on a clean file, with --json either way', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('.ambicode/policies/team-components.yaml', COMPONENT_PACK);
      await repo.write('.ambicode/policies/broken.yaml', 'schemaVersion: 2\n');
      const { main } = await import('../../main.ts');

      const previousCwd = process.cwd();
      const stdout = process.stdout.write.bind(process.stdout);
      let printed = '';
      process.chdir(repo.root);
      process.stdout.write = ((chunk: string) => ((printed += String(chunk)), true)) as typeof process.stdout.write;
      let clean: number;
      let dirty: number;
      try {
        clean = await main(['policy', 'check', '--json', '.ambicode/policies/team-components.yaml']);
        printed = '';
        dirty = await main(['policy', 'check', '--json', '.ambicode/policies/broken.yaml']);
      } finally {
        process.stdout.write = stdout;
        process.chdir(previousCwd);
      }

      assert.equal(clean, 0);
      assert.equal(dirty, 1, 'an error diagnostic must exit nonzero');
      const parsed = JSON.parse(printed) as PolicyCheckOutput;
      assert.equal(parsed.command, 'policy-check');
      assert.equal(parsed.ok, false);
      assert.ok(parsed.diagnostics.length > 0);
    } finally {
      await repo.dispose();
    }
  });
});

/** What the removed `policy` command printed: the resolver's answer for one project and path. */
async function policyFor(runtime: Awaited<ReturnType<typeof createRuntime>>, projectId: string, file: string) {
  const workspace = await openWorkspace(runtime);
  const paths = [await toRepositoryRelative(workspace, file)];
  return { policy: await resolvePolicyFor({ workspace, project: projectById(workspace.config, projectId), activity: 'review', paths }) };
}

describe('R3 migrated packs resolve as scoped project policy', () => {
  it('applies a component pack to a component path and not to a service path', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('.ambicode/policies/team-components.yaml', COMPONENT_PACK);
      await repo.write(
        '.ambicode/policies/team-global.yaml',
        pack([
          'schemaVersion: 1',
          'id: team-global',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [review, task, plan, investigate]',
          'source: { location: "CLAUDE.md, section \'General rules\'" }',
          'rules:',
          '  - id: no-console',
          '    category: correctness',
          '    instruction: Use the configured logger, never console.',
          '    check: { kind: reviewer, explanation: "Judged from the changed code." }',
        ]),
      );
      await repo.write(
        '.ambicode/config.yaml',
        configYaml([
          '  - id: web',
          '    root: .',
          '    paths: []',
          '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
          '    packs: []',
          '    policyFiles: [.ambicode/policies/team-global.yaml, .ambicode/policies/team-components.yaml]',
          '    commands: {}',
          '    checks: { lint: { all: null, file: null } }',
        ]),
      );
      await repo.commitAll('migrated packs');
      const runtime = await createRuntime({ cwd: repo.root });

      const checked = await check(runtime, [
        '--project',
        'web',
        '.ambicode/policies/team-global.yaml',
        '.ambicode/policies/team-components.yaml',
      ]);
      assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
      assert.deepEqual(checked.files.map((file) => file.packId), ['team-global', 'team-components']);

      const onComponent = await policyFor(runtime, 'web', 'src/orders/order-list.component.ts');
      assert.deepEqual(
        onComponent.policy.rules.map((rule) => rule.qualifiedId).sort(),
        ['team-components/no-transport-in-components', 'team-global/no-console'],
      );
      assert.match(
        onComponent.policy.rules.find((rule) => rule.packId === 'team-components')?.sourceLocation ?? '',
        /CLAUDE\.md/,
      );

      const onService = await policyFor(runtime, 'web', 'src/orders/orders.service.ts');
      assert.deepEqual(onService.policy.rules.map((rule) => rule.qualifiedId), ['team-global/no-console']);
    } finally {
      await repo.dispose();
    }
  });

  it('resolves policy from the YAML packs alone, with no Markdown source in reach', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('CLAUDE.md', '# Rules\n\n- Components must not call HTTP directly.\n');
      await repo.write(
        '.ambicode/config.yaml',
        configYaml([
          '  - id: web',
          '    root: .',
          '    paths: []',
          '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
          '    packs: []',
          '    policyFiles: []',
          '    commands: {}',
          '    checks: { lint: { all: null, file: null } }',
        ]),
      );
      await repo.commitAll('a CLAUDE.md nobody wired in');

      const runtime = await createRuntime({ cwd: repo.root });
      const workspace = await openWorkspace(runtime);
      const policy = await resolvePolicyFor({
        workspace,
        project: projectById(workspace.config, 'web'),
        activity: 'review',
        paths: ['src/orders/order-list.component.ts'],
      });

      assert.deepEqual(policy.rules, []);
      assert.deepEqual(policy.packs, []);
    } finally {
      await repo.dispose();
    }
  });
});

/**
 * Asserted over the source text: the defect guarded against is a future loader
 * added "just for CLAUDE.md", which no behavioural test of today's code catches.
 */
describe('R3 no runtime path reads a Markdown rule source', () => {
  const RULE_SOURCE_NAMES = ['CLAUDE.md', 'CONTRIBUTING.md', '.cursor', 'copilot-instructions', '.github/instructions'];

  it('names a rule source in exactly one module, which only asks whether it exists', async () => {
    const { readFile } = await import('node:fs/promises');
    const repositoryRoot = REPO_ROOT;
    const sources = (await nodeFileSystem.glob('src/**/*.ts', repositoryRoot))
      .filter((relative) => !relative.endsWith('.test.ts'))
      .sort();

    const allowed = new Set(['src/modules/config/init/init.ts']);
    const offenders: string[] = [];
    for (const relative of sources) {
      if (allowed.has(relative)) continue;
      const text = await readFile(path.join(repositoryRoot, relative), 'utf8');
      for (const name of RULE_SOURCE_NAMES) {
        if (text.includes(name)) offenders.push(`${relative} names ${name}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a rule source belongs to the setup-time /ambicode:rules skill; the runtime resolves policy from YAML packs only',
    );
  });

  it('resolves prompt Markdown only from a path a pack declared', async () => {
    const { readFile } = await import('node:fs/promises');
    const repositoryRoot = REPO_ROOT;
    // The single place a pack's Markdown is opened: a `prompts[].file` the pack
    // declared, after `resolveInsideBoundary`.
    const validate = await readFile(path.join(repositoryRoot, 'src', 'modules', 'policy', 'packs', 'validate.ts'), 'utf8');
    assert.match(validate, /resolveInsideBoundary\(/);
    assert.equal((validate.match(/fs\.readText\(/g) ?? []).length, 2, 'the pack file and its declared prompts, nothing else');
  });
});

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(isAmbicodeError(error), `expected an AmbicodeError, got ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the call to fail');
}
