import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRuntime } from '#composition/root';
import { FIXTURE_CONFIG, initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { contextTreeCommand } from './commands/context/context.ts';
import { COMMANDS, USAGE } from './commands/registry.ts';
import type { OptionSpec } from './types/cli.ts';
import { STEP_PRINTING } from '../hook/guard/rules/output.ts';

const SPECS: Record<string, OptionSpec | undefined> = Object.fromEntries([...COMMANDS].map(([name, entry]) => [name, entry.options]));

const TABLE: Record<string, readonly string[]> = {
  'route start': ['task', 'headless', 'project', 'answer'],
  'route next': ['task', 'answer', 'project'],
  'route stop': ['task', 'reason', 'detail'],
  map: ['task', 'project', 'mode', 'term', 'symbol'],
  refs: ['project', 'declarations'],
  'requirements normalize': ['task'],
  'policy check': ['project', 'drafts'],
  'rules apply': ['project'],
  check: ['task', 'phase', 'name', 'project', 'file', 'approve', 'decline'],
  review: ['estimate'],
  'note save': ['task', 'kind'],
  report: ['task'],
  'config validate': ['task'],
  'init record': ['task', 'what', 'outcome'],
  'config packs': ['list', 'task'],
  'context list': [],
  'context write': ['task'],
  'context tree': ['root'],
  version: [],
};

const GAPS: Record<string, string> = {};

const SUBCOMMANDS = ['init', 'route', 'requirements', 'rules', 'note', 'policy', 'context', 'config'];

const declared = (command: string): string[] => {
  const spec = SPECS[command];
  return spec === undefined ? [] : [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
};

/** The generated usage line for a command: its name, padded, then its summary. */
const line = (command: string): string | undefined => USAGE.split('\n').find((candidate) => candidate.startsWith('  ') && candidate.slice(2, 25).trimEnd() === command);

describe('CLI surface (08-I1)', () => {
  for (const [command, flags] of Object.entries(TABLE)) {
    const name = `08-I1: ${command} is a command with --json, ${flags.length === 0 ? 'its unchanged options' : flags.map((flag) => `--${flag}`).join(' ')}, all in SPECS, and the command is in USAGE`;
    it(name, GAPS[command] === undefined ? {} : { todo: GAPS[command] }, () => {
      assert.ok(SPECS[command] !== undefined, `${command} has no spec`);
      assert.ok(line(command) !== undefined, `${command} is not in USAGE`);
      for (const flag of ['json', ...flags]) assert.ok(declared(command).includes(flag), `${command} does not accept --${flag}`);
    });
  }

  it('08-I1: the named commands exist: config validate', () => {
    for (const command of ['config validate']) {
      assert.ok(SPECS[command] !== undefined, command);
      assert.ok(line(command) !== undefined, command);
    }
  });

  it('C5: the removed commands are not registered or listed', () => {
    for (const command of ['route status', 'rules revert', 'note list', 'worker run', 'prepare', 'config', 'bundle', 'policy']) {
      assert.equal(SPECS[command], undefined, command);
      assert.equal(line(command), undefined, command);
    }
  });

  it('C5: USAGE is generated, one line per command, under 2 KiB', () => {
    const commands = Object.keys(SPECS);
    assert.equal(USAGE.split('\n').filter((candidate) => candidate.startsWith('  ')).length, commands.length);
    assert.ok(Buffer.byteLength(USAGE) < 2048, `${Buffer.byteLength(USAGE)} B`);
  });

  it('08-I1: init is gone as a dry run and doctor as a command; check takes --only repeatably and --phase, review takes --estimate as a flag', () => {
    assert.equal(SPECS['init'], undefined);
    assert.equal(SPECS['doctor'], undefined);
    assert.ok(SPECS['check']?.repeated?.includes('file'));
    assert.ok(SPECS['check']?.values?.includes('phase'));
    assert.ok(SPECS['review']?.flags?.includes('estimate'));
    assert.ok(!declared('review').includes('task'), 'a route pins its own review; the command takes no task');
  });

  it('08-I1: the route and requirements --answer, --requirement options repeat as the table says', () => {
    assert.ok(SPECS['route start']?.repeated?.includes('answer'));
    assert.ok(SPECS['route next']?.repeated?.includes('answer'));
  });

  it('08-I1: no command has a channel or trusted flag, and the help text names none', () => {
    for (const command of Object.keys(SPECS)) {
      for (const forbidden of ['channel', 'trusted']) assert.ok(!declared(command).includes(forbidden), `${command} accepts --${forbidden}`);
    }
    assert.doesNotMatch(USAGE, /--(?:channel|trusted)\b/);
  });

  it('08-I1: every command family in the table is a family of SPECS, and SPECS holds no command the table lacks', () => {
    const known = new Set(Object.keys(TABLE));
    const extra = Object.keys(SPECS).filter((command) => !known.has(command) && !SUBCOMMANDS.includes(command.split(' ')[0]!));
    assert.deepEqual(extra, []);
    const unlisted = Object.keys(SPECS).filter((command) => !known.has(command));
    assert.deepEqual(unlisted, []);
  });
});

describe('the guard knows which commands print a route step', () => {
  const dir = new URL('./commands/', import.meta.url);
  const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  const text = sources.map((name) => readFileSync(new URL(name, dir), 'utf8')).join('\n');

  it('lists every command that runs a command tail, plus route start and next', () => {
    const causes = [...text.matchAll(/cause: '([^']+)'/g)].map((match) => match[1]!).filter((cause) => cause !== 'route-next');
    assert.ok(causes.length >= 5, `found ${causes.length} command tails`);
    assert.deepEqual([...STEP_PRINTING].sort(), [...new Set([...causes, 'route start', 'route next'])].sort());
  });
  it('names only registered commands', () => {
    for (const name of STEP_PRINTING) assert.ok(name.replace(' --drafts', '') in SPECS, name);
  });
});

describe('context tree', () => {
  it('walks a deep source folder from git, skips tests, and names the mirrored note and submodules of each module', async () => {
    const repo = await TempRepo.create();
    try {
      for (const name of ['a', 'b', 'c']) await repo.write(`src/app/features/${name}.ts`, `export function make${name}() {}\n`);
      for (const name of ['d', 'e', 'f']) await repo.write(`src/app/features/dashboard/widgets/${name}.ts`, `export class Widget${name} {}\n`);
      await repo.write('src/app/features/a.test.ts', 'export function onlyInTest() {}\n');
      await repo.write('docs/guide.md', '# guide\n');
      await repo.commitAll('base');
      const runtime = await createRuntime({ cwd: repo.root });
      await initConfig(runtime, FIXTURE_CONFIG);
      const run = (...argv: string[]) => contextTreeCommand.run(runtime, parseArgs('context tree', argv, contextTreeCommand.options));
      const out = await run('--root', 'src');
      assert.match(out.text, /^source files 6, modules 2 /);
      assert.match(out.text, /modules\/src\/app\/features\/overview\.md {2}dir src\/app\/features {2}depth 3 {2}files 6 {2}submodules: modules\/src\/app\/features\/dashboard\/widgets\.md/);
      assert.match(out.text, /modules\/src\/app\/features\/dashboard\/widgets\.md {2}dir src\/app\/features\/dashboard\/widgets {2}depth 5 {2}files 3\n/);
      assert.doesNotMatch(out.text, /onlyInTest/);
      assert.match(out.text, /\ndocumentation files \(path, bytes\): docs\/guide\.md 8\n/);
      assert.match(out.text, /\nlevel 1: 1 folders, 3 base names\n- \[src\/app\/features\]\(modules\/src\/app\/features\/overview\.md\)\n {2}- a: makea/);
      assert.match(out.text, /\nlevel 2: 1 folders, 3 base names\n {2}- \[src\/app\/features\/dashboard\/widgets\]\(modules\/src\/app\/features\/dashboard\/widgets\.md\)\n {4}- d: Widgetd/);
      assert.deepEqual((out.data as { modules: { parent: string | null }[] }).modules.map((module) => module.parent), [null, 'src/app/features']);
      assert.match((await run('--root', 'docs')).text, /^source files 0, modules 0 /);
    } finally {
      await repo.dispose();
    }
  });
});

describe('error texts do not hand the user a flag to type', () => {
  const root = new URL('../', import.meta.url);
  const sources = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.startsWith('testing'));
  // --task is the model's own slug, never a choice put to the user.
  const MODEL_HELD = new Set(['task']);

  it('a text that says to pass a flag asks the user with AskUserQuestion, unless the flag is model-held', () => {
    const offenders: string[] = [];
    for (const name of sources) {
      readFileSync(new URL(name, root), 'utf8').split('\n').forEach((text, index) => {
        for (const match of text.matchAll(/\b[Pp]ass `?--([a-z-]+)/g)) {
          if (!MODEL_HELD.has(match[1]!) && !/AskUserQuestion/.test(text)) offenders.push(`${name}:${index + 1} ${text.trim()}`);
        }
      });
    }
    assert.deepEqual(offenders, []);
  });
});
