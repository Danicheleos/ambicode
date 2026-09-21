import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime, openWorkspace, projectById, resolvePolicyFor, type Runtime } from '../composition/root.ts';
import type { Diagnostic } from '../contracts/policy.ts';
import { loadPacksForProject } from '../policy/load.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { builtinPoliciesDirectory } from '../util/plugin-root.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';
import { POLICY_OPTIONS, runPolicy } from './commands/policy.ts';
import { POLICY_CHECK_OPTIONS, renderPolicyCheck, runPolicyCheck, type PolicyCheckOutput } from './commands/policy-check.ts';

/**
 * R3 part 1: `ambicode policy check` on a candidate pack file that nothing in
 * `.ambicode/config.yaml` references yet, and the proof that it and the loader
 * apply one set of rules rather than two copies of them.
 */

const CONFIG_TAIL = [
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'page: { idleTimeoutSeconds: 1800 }',
  'requirements: { mcpServer: null }',
  'remoteChecks: { image: null }',
].join('\n');

function configYaml(projects: readonly string[]): string {
  return ['schemaVersion: 1', 'baseline: ""', CONFIG_TAIL, 'projects:', ...projects, ''].join('\n');
}

const ONE_PROJECT = [
  '  - id: web',
  '    root: .',
  '    ecosystem: typescript',
  '    packs: []',
  '    policyFiles: []',
  '    commands: { lint: null }',
  '    checks: {}',
];

/** A repository with one project, a component and a service, and no packs yet. */
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
  '    remindOnEdit: true',
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
  it('validates a candidate pack nothing references yet, and reports what its globs match', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('.ambicode/policies/team-components.yaml', COMPONENT_PACK);
      const runtime = await createRuntime({ cwd: repo.root });

      const output = await check(runtime, ['.ambicode/policies/team-components.yaml']);

      assert.equal(output.ok, true, renderPolicyCheck(output));
      assert.equal(output.projectId, 'web');
      assert.equal(output.files.length, 1);
      const file = output.files[0];
      assert.equal(file?.packId, 'team-components');
      assert.equal(file?.authority, 'team');
      assert.equal(file?.rules, 1);
      // The count and the examples are the project's real files, which the
      // schema cannot see.
      assert.deepEqual(file?.appliesTo.map((glob) => glob.glob), ['src/**/*.component.ts']);
      assert.equal(file?.appliesTo[0]?.matched, 2);
      assert.deepEqual(file?.appliesTo[0]?.examples, [
        'src/orders/order-detail.component.ts',
        'src/orders/order-list.component.ts',
      ]);
      // `.ambicode/config.yaml` still says nothing about the file.
      const workspace = await openWorkspace(runtime);
      assert.deepEqual(projectById(workspace.config, 'web').policyFiles, []);
    } finally {
      await repo.dispose();
    }
  });

  it('flags a glob that matches nothing, which is the mistake a schema cannot see', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write(
        '.ambicode/policies/ghost.yaml',
        pack([
          'schemaVersion: 1',
          'id: ghost',
          'authority: team',
          'appliesTo: ["src/components/**/*.ts", "src/**/*.component.ts"]',
          'activities: [review]',
          'source: { location: "CONTRIBUTING.md" }',
          'rules: []',
        ]),
      );
      const runtime = await createRuntime({ cwd: repo.root });

      const output = await check(runtime, ['.ambicode/policies/ghost.yaml']);

      // A warning, not an error: the pack is valid, it simply applies to
      // nothing, so the command still exits zero.
      assert.equal(output.ok, true);
      const warning = output.diagnostics.find((diagnostic) => diagnostic.code === 'pack-glob-matches-nothing');
      assert.ok(warning !== undefined, renderPolicyCheck(output));
      assert.match(warning.message, /src\/components\/\*\*\/\*\.ts/);
      assert.equal(output.files[0]?.appliesTo[0]?.matched, 0);
      assert.equal(output.files[0]?.appliesTo[1]?.matched, 2);
    } finally {
      await repo.dispose();
    }
  });

  it('catches every load-time rule the schema does not carry', async () => {
    const repo = await repoWithLayout();
    try {
      // remindOnEdit on a pack that applies broadly, a prompt file that is not
      // there, and a command the project does not declare.
      await repo.write(
        '.ambicode/policies/broad.yaml',
        pack([
          'schemaVersion: 1',
          'id: broad',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'prompts: [{ stage: before-review, file: "./missing.md" }]',
          'commandPolicy: [{ command: not-declared, action: run }]',
          'rules:',
          '  - id: remind',
          '    category: workflow',
          '    instruction: Something.',
          '    remindOnEdit: true',
          '    check: { kind: none, explanation: "Nothing verifies this." }',
        ]),
      );
      // `replaces` must name `builtin/<id>`.
      await repo.write(
        '.ambicode/policies/bad-replaces.yaml',
        pack([
          'schemaVersion: 1',
          'id: bad-replaces',
          'authority: team',
          'appliesTo: ["src/**/*.ts"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'replaces: common-quality',
          'rules: []',
        ]),
      );
      // Not YAML at all.
      await repo.write('.ambicode/policies/broken.yaml', 'appliesTo: [\n');

      const runtime = await createRuntime({ cwd: repo.root });
      const output = await check(runtime, [
        '.ambicode/policies/broad.yaml',
        '.ambicode/policies/bad-replaces.yaml',
        '.ambicode/policies/broken.yaml',
        '.ambicode/policies/not-there.yaml',
      ]);

      assert.equal(output.ok, false);
      const found = new Set(codes(output.diagnostics, 'error'));
      for (const expected of [
        'remind-on-edit-broad-pack',
        'path-missing',
        'pack-unknown-command',
        'pack-invalid',
        'pack-unparsable',
        'pack-missing',
      ]) {
        assert.ok(found.has(expected), `expected a ${expected} diagnostic, got ${[...found].join(', ')}`);
      }
      // A file that produced no usable pack is still listed, so the report
      // accounts for every operand.
      assert.equal(output.files.length, 4);
      assert.deepEqual(
        output.files.filter((file) => file.packId === null).map((file) => path.posix.basename(file.path)),
        ['bad-replaces.yaml', 'broken.yaml', 'not-there.yaml'],
      );
    } finally {
      await repo.dispose();
    }
  });

  it('reports a candidate whose id collides with a pack the project already enables', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.write(
        '.ambicode/config.yaml',
        configYaml([
          '  - id: web',
          '    root: .',
          '    ecosystem: typescript',
          '    packs: [builtin/common-quality]',
          '    policyFiles: []',
          '    commands: { lint: null, unit: null }',
          '    checks: {}',
        ]),
      );
      await repo.write(
        '.ambicode/policies/mine.yaml',
        pack([
          'schemaVersion: 1',
          'id: common-quality',
          'authority: team',
          'appliesTo: ["src/**/*.ts"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'rules: []',
        ]),
      );
      await repo.commitAll('collision');
      const runtime = await createRuntime({ cwd: repo.root });

      const collision = await check(runtime, ['.ambicode/policies/mine.yaml']);
      assert.equal(collision.ok, false);
      const duplicate = collision.diagnostics.find((diagnostic) => diagnostic.code === 'pack-duplicate-id');
      assert.ok(duplicate !== undefined, renderPolicyCheck(collision));
      assert.match(duplicate.message, /replaces: builtin\/common-quality/);

      // Saying so explicitly resolves it, and the candidate becomes usable.
      await repo.write(
        '.ambicode/policies/mine.yaml',
        pack([
          'schemaVersion: 1',
          'id: common-quality',
          'authority: team',
          'appliesTo: ["src/**/*.ts"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'replaces: builtin/common-quality',
          'rules: []',
        ]),
      );
      const resolved = await check(runtime, ['.ambicode/policies/mine.yaml']);
      assert.equal(resolved.ok, true, renderPolicyCheck(resolved));
      assert.deepEqual(codes(resolved.diagnostics, 'error'), []);
    } finally {
      await repo.dispose();
    }
  });

  it('warns when a candidate replaces a built-in the project does not enable', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write(
        '.ambicode/policies/mine.yaml',
        pack([
          'schemaVersion: 1',
          'id: angular-components',
          'authority: team',
          'appliesTo: ["src/**/*.component.ts"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'replaces: builtin/angular-components',
          'rules: []',
        ]),
      );
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await check(runtime, ['.ambicode/policies/mine.yaml']);

      assert.equal(output.ok, true);
      assert.ok(output.diagnostics.some((diagnostic) => diagnostic.code === 'pack-replaces-unused'));
    } finally {
      await repo.dispose();
    }
  });

  /**
   * R3 acceptance 2. The rules a schema cannot express used to live inside the
   * loader, so a candidate check could only re-implement them. Both paths now
   * call `src/policy/validate.ts`: for the same file, the loader (with the pack
   * wired into `policyFiles`) and `policy check` (with it not wired in) must
   * report the same diagnostic codes. A rule added to only one of them breaks
   * this.
   */
  it('holds a candidate pack to exactly the rules the loader applies', async () => {
    const repo = await repoWithLayout();
    try {
      const offending = pack([
        'schemaVersion: 1',
        'id: drift',
        'authority: team',
        'appliesTo: ["**/*"]',
        'activities: [review]',
        'source: { location: "CLAUDE.md" }',
        'prompts: [{ stage: before-review, file: "./nowhere.md" }]',
        'commandPolicy: [{ command: never-declared, action: run }]',
        'rules:',
        '  - id: remind',
        '    category: workflow',
        '    instruction: Something.',
        '    remindOnEdit: true',
        '    check: { kind: command, command: also-never-declared, explanation: "x" }',
      ]);
      await repo.write('.ambicode/policies/drift.yaml', offending);
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
      assert.ok(codes(fromLoader.diagnostics, 'error').length >= 4);
    } finally {
      await repo.dispose();
    }
  });

  it('does not measure scope against a guessed project when the repository has several', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('web/src/a.component.ts', 'export class A {}\n');
      await repo.write('api/app.py', 'x = 1\n');
      await repo.write(
        '.ambicode/config.yaml',
        configYaml([
          '  - id: web',
          '    root: web',
          '    ecosystem: typescript',
          '    packs: []',
          '    policyFiles: []',
          '    commands: {}',
          '    checks: {}',
          '  - id: api',
          '    root: api',
          '    ecosystem: python',
          '    packs: []',
          '    policyFiles: []',
          '    commands: {}',
          '    checks: {}',
        ]),
      );
      await repo.write(
        '.ambicode/policies/team-components.yaml',
        pack([
          'schemaVersion: 1',
          'id: team-components',
          'authority: team',
          'appliesTo: ["src/**/*.component.ts"]',
          'activities: [review]',
          'source: { location: "CLAUDE.md" }',
          'rules: []',
        ]),
      );
      await repo.commitAll('two projects');
      const runtime = await createRuntime({ cwd: repo.root });

      const undetermined = await check(runtime, ['.ambicode/policies/team-components.yaml']);
      assert.equal(undetermined.projectId, null);
      assert.ok(undetermined.diagnostics.some((diagnostic) => diagnostic.code === 'project-not-determined'));
      // No glob count is claimed, rather than one measured against the wrong root.
      assert.equal(undetermined.files[0]?.appliesTo[0]?.matched, 0);
      assert.equal(undetermined.ok, true);

      const named = await check(runtime, ['--project', 'web', '.ambicode/policies/team-components.yaml']);
      assert.equal(named.projectId, 'web');
      assert.equal(named.files[0]?.appliesTo[0]?.matched, 1);

      assert.equal(
        await failureCode(check(runtime, ['--project', 'nope', '.ambicode/policies/team-components.yaml'])),
        'unknown-project',
      );
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
      const { main } = await import('./main.ts');

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
      // The report is still the deliverable: the findings are printed, not
      // swallowed by the status.
      const parsed = JSON.parse(printed) as PolicyCheckOutput;
      assert.equal(parsed.command, 'policy-check');
      assert.equal(parsed.ok, false);
      assert.ok(parsed.diagnostics.length > 0);
    } finally {
      await repo.dispose();
    }
  });

  it('keeps a path literally named "check" reachable through the operand terminator', async () => {
    const repo = await repoWithLayout();
    try {
      await repo.write('check/a.ts', 'export const a = 1;\n');
      await repo.commitAll('a directory named check');
      const runtime = await createRuntime({ cwd: repo.root });

      // `policy -- check` is the plain policy command with one path operand.
      const output = await runPolicy(runtime, parseArgs('policy', ['--', 'check'], POLICY_OPTIONS));
      assert.deepEqual(output.paths, ['check']);
    } finally {
      await repo.dispose();
    }
  });
});

/**
 * R3 acceptance 4, on the machinery the `/ambicode:rules` skill targets: the
 * packs a `CLAUDE.md` migration produces are ordinary project packs, so the
 * resolver must scope them by path exactly as it scopes a built-in. What the
 * skill itself decides — which paragraph is a rule, whether it is `team` or
 * `observed`, which glob it belongs to — is a judgement with a human in the
 * loop and is not asserted here.
 */
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
          '    ecosystem: typescript',
          '    packs: []',
          '    policyFiles: [.ambicode/policies/team-global.yaml, .ambicode/policies/team-components.yaml]',
          '    commands: { lint: null }',
          '    checks: {}',
        ]),
      );
      await repo.commitAll('migrated packs');
      const runtime = await createRuntime({ cwd: repo.root });

      // Clean before it is wired in, and still clean once it is.
      const checked = await check(runtime, [
        '--project',
        'web',
        '.ambicode/policies/team-global.yaml',
        '.ambicode/policies/team-components.yaml',
      ]);
      assert.equal(checked.ok, true, renderPolicyCheck(checked));
      // Two packs with distinct globs, one of them not `**/*`.
      const globs = checked.files.map((file) => file.appliesTo.map((glob) => glob.glob).join(','));
      assert.deepEqual(globs, ['**/*', 'src/**/*.component.ts']);

      const onComponent = await runPolicy(
        runtime,
        parseArgs('policy', ['--project', 'web', 'src/orders/order-list.component.ts'], POLICY_OPTIONS),
      );
      assert.deepEqual(
        onComponent.policy.rules.map((rule) => rule.qualifiedId).sort(),
        ['team-components/no-transport-in-components', 'team-global/no-console'],
      );
      // Provenance survives the migration: the rule still names where it came from.
      assert.match(
        onComponent.policy.rules.find((rule) => rule.packId === 'team-components')?.sourceLocation ?? '',
        /CLAUDE\.md/,
      );

      const onService = await runPolicy(
        runtime,
        parseArgs('policy', ['--project', 'web', 'src/orders/orders.service.ts'], POLICY_OPTIONS),
      );
      assert.deepEqual(onService.policy.rules.map((rule) => rule.qualifiedId), ['team-global/no-console']);
    } finally {
      await repo.dispose();
    }
  });

  it('resolves policy from the YAML packs alone, with no Markdown source in reach', async () => {
    const repo = await repoWithLayout();
    try {
      // The source document the migration was authored from stays in the
      // repository, and stays inert: deleting the pack removes the rule, and
      // the CLAUDE.md that states it in prose contributes nothing.
      await repo.write('CLAUDE.md', '# Rules\n\n- Components must not call HTTP directly.\n');
      await repo.write(
        '.ambicode/config.yaml',
        configYaml([
          '  - id: web',
          '    root: .',
          '    ecosystem: typescript',
          '    packs: []',
          '    policyFiles: []',
          '    commands: { lint: null }',
          '    checks: {}',
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
 * R3 acceptance 6. Markdown is an input to a setup-time skill and never a
 * runtime format, so no shipped module may name a rule source at all —
 * `src/config/init.ts` excepted, and there only to test for its existence.
 * Asserted over the source text because the defect it guards against is a
 * future loader someone adds "just for CLAUDE.md", which no behavioural test
 * of today's code would catch.
 */
describe('R3 no runtime path reads a Markdown rule source', () => {
  const RULE_SOURCE_NAMES = ['CLAUDE.md', 'CONTRIBUTING.md', '.cursor', 'copilot-instructions', '.github/instructions'];

  it('names a rule source in exactly one module, which only asks whether it exists', async () => {
    const { readFile } = await import('node:fs/promises');
    const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
    const sources = (await nodeFileSystem.glob('src/**/*.ts', repositoryRoot))
      .filter((relative) => !relative.endsWith('.test.ts'))
      .sort();

    // `src/config/init.ts` detects them; the reviewer names CLAUDE.md to say
    // its sandbox refuses to load one, which is asserted below rather than
    // exempted silently.
    const allowed = new Set(['src/config/init.ts', 'src/review/claude-reviewer.ts']);
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

    const reviewer = await readFile(path.join(repositoryRoot, 'src', 'review', 'claude-reviewer.ts'), 'utf8');
    assert.match(reviewer, /No CLAUDE\.md[^\n]*\n\s*'--safe-mode'/, 'the reviewer must run with CLAUDE.md loading off');

    // And in the one module that names them, the only thing done with them.
    const init = await readFile(path.join(repositoryRoot, 'src', 'config', 'init.ts'), 'utf8');
    const detector = /export async function detectRuleSources[\s\S]*?\n}/.exec(init)?.[0] ?? '';
    assert.ok(detector !== '', 'detectRuleSources not found');
    assert.match(detector, /fs\.exists\(/);
    for (const forbidden of ['readText', 'readBytes', 'parseYaml', 'writeText']) {
      assert.ok(!detector.includes(forbidden), `detectRuleSources must not ${forbidden}`);
    }
  });

  it('resolves prompt Markdown only from a path a pack declared', async () => {
    const { readFile } = await import('node:fs/promises');
    const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
    // The single place a pack's Markdown is opened: inside the pack directory,
    // after `resolveInsideBoundary`, for a `prompts[].file` the pack itself
    // declared. Nothing derives a Markdown path from a repository convention.
    const validate = await readFile(path.join(repositoryRoot, 'src', 'policy', 'validate.ts'), 'utf8');
    assert.match(validate, /resolveInsideBoundary\(/);
    assert.equal((validate.match(/fs\.readText\(/g) ?? []).length, 2, 'the pack file and its declared prompts, nothing else');
  });
});

describe('R3 init names rule sources without reading them', () => {
  it('reports the candidates it found and opens none of them', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.write('CLAUDE.md', '# Rules\n\n- Never log secrets.\n');
      await repo.write('CONTRIBUTING.md', '# Contributing\n');
      await repo.write('.cursor/rules/style.mdc', 'Prefer named exports.\n');
      await repo.write('docs/architecture.md', '# Architecture\n');
      await repo.commitAll('rule sources');

      const reads: string[] = [];
      const fs: FileSystem = {
        ...nodeFileSystem,
        readText: async (absolutePath) => {
          reads.push(absolutePath);
          return nodeFileSystem.readText(absolutePath);
        },
        readBytes: async (absolutePath) => {
          reads.push(absolutePath);
          return nodeFileSystem.readBytes(absolutePath);
        },
      };
      const runtime = await createRuntime({ cwd: repo.root, fs });

      const output = await runInit(runtime, parseArgs('init', ['--dry-run'], INIT_OPTIONS));

      assert.deepEqual(output.ruleSources, ['CLAUDE.md', 'CONTRIBUTING.md', 'docs', '.cursor/rules']);
      const notice = output.notices.find((candidate) => candidate.includes('/ambicode:rules'));
      assert.ok(notice !== undefined, output.notices.join('\n'));
      assert.match(notice, /Nothing above was read, classified, or migrated by init\./);

      // Existence only: no rule source was opened.
      const opened = reads.filter((absolutePath) =>
        ['CLAUDE.md', 'CONTRIBUTING.md', 'style.mdc', 'architecture.md'].some((name) => absolutePath.endsWith(name)),
      );
      assert.deepEqual(opened, []);
    } finally {
      await repo.dispose();
    }
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
