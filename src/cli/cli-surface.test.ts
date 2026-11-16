import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRuntime } from '#composition/root';
import { FIXTURE_CONFIG, initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { contextIndexCommand, contextTreeCommand } from './commands/context/context.ts';
import { COMMANDS, CLI_HELP_TEXT } from './commands/registry.ts';
import type { OptionSpec } from './types/cli.ts';

const SPECS: Record<string, OptionSpec | undefined> = Object.fromEntries([...COMMANDS].map(([name, entry]) => [name, entry.options]));

const TABLE: Record<string, readonly string[]> = {
  'route start': ['task', 'headless', 'project', 'answer'],
  'route next': ['task', 'answer', 'project'],
  'route stop': ['task', 'reason', 'detail'],
  map: ['task', 'project', 'term', 'symbol'],
  refs: ['project', 'declarations'],
  'requirements normalize': ['task'],
  'policy check': ['project', 'drafts'],
  'rules apply': ['project'],
  check: ['task', 'phase', 'name', 'project', 'file', 'approve', 'decline'],
  review: ['estimate'],
  'review page': ['task'],
  'note save': ['task', 'kind'],
  report: ['task'],
  'config validate': ['task'],
  'init record': ['task', 'what', 'outcome'],
  'config packs': ['list', 'task'],
  'context tree': ['root'],
  'context index': ['root', 'task'],
  'context evidence': ['root'],
  version: [],
};

const GAPS: Record<string, string> = {};

const SUBCOMMANDS = ['init', 'route', 'requirements', 'rules', 'note', 'policy', 'context', 'config'];

const declared = (command: string): string[] => {
  const spec = SPECS[command];
  return spec === undefined ? [] : [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
};

/** The generated usage line for a command: its name, padded, then its summary. */
const line = (command: string): string | undefined => CLI_HELP_TEXT.split('\n').find((candidate) => candidate.startsWith('  ') && candidate.slice(2, 25).trimEnd() === command);

describe('CLI surface (08-I1)', () => {
  for (const [command, flags] of Object.entries(TABLE)) {
    const name = `08-I1: ${command} is a command with --json, ${flags.length === 0 ? 'its unchanged options' : flags.map((flag) => `--${flag}`).join(' ')}, all in SPECS, and the command is in CLI_HELP_TEXT`;
    it(name, GAPS[command] === undefined ? {} : { todo: GAPS[command] }, () => {
      assert.ok(SPECS[command] !== undefined, `${command} has no spec`);
      assert.ok(line(command) !== undefined, `${command} is not in CLI_HELP_TEXT`);
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

  // Raised from 2048 to 2176 for `context index`: the help text stood at 2034 B, so any new command line (25 B of name column alone) crossed 2 KiB.
  it('C5: CLI_HELP_TEXT is generated, one line per command, under 2176 B', () => {
    const commands = Object.keys(SPECS);
    assert.equal(CLI_HELP_TEXT.split('\n').filter((candidate) => candidate.startsWith('  ')).length, commands.length);
    assert.ok(Buffer.byteLength(CLI_HELP_TEXT) < 2176, `${Buffer.byteLength(CLI_HELP_TEXT)} B`);
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
    assert.doesNotMatch(CLI_HELP_TEXT, /--(?:channel|trusted)\b/);
  });

  it('08-I1: every command family in the table is a family of SPECS, and SPECS holds no command the table lacks', () => {
    const known = new Set(Object.keys(TABLE));
    const extra = Object.keys(SPECS).filter((command) => !known.has(command) && !SUBCOMMANDS.includes(command.split(' ')[0]!));
    assert.deepEqual(extra, []);
    const unlisted = Object.keys(SPECS).filter((command) => !known.has(command));
    assert.deepEqual(unlisted, []);
  });
});

describe('context tree', () => {
  it('walks a deep source folder from git, skips tests, and names the directory and submodules of each module', async () => {
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
      assert.match(out.text, /^dir src\/app\/features {2}depth 3 {2}files 6 {2}submodules: src\/app\/features\/dashboard\/widgets$/m);
      assert.match(out.text, /\ndir src\/app\/features\/dashboard\/widgets {2}depth 5 {2}files 3\n/);
      assert.doesNotMatch(out.text, /modules\/|\.md\)/, 'no note paths');
      assert.doesNotMatch(out.text, /onlyInTest/);
      assert.match(out.text, /\ndocumentation files \(path, bytes\): docs\/guide\.md 8\n/);
      assert.match(out.text, /\nlevel 1: 1 folders, 3 base names\n- src\/app\/features\n {2}- a: makea/);
      assert.match(out.text, /\nlevel 2: 1 folders, 3 base names\n {2}- src\/app\/features\/dashboard\/widgets\n {4}- d: Widgetd/);
      assert.deepEqual((out.data as { modules: { parent: string | null }[] }).modules.map((module) => module.parent), [null, 'src/app/features']);
      assert.match((await run('--root', 'docs')).text, /^source files 0, modules 0 /);
    } finally {
      await repo.dispose();
    }
  });
});

describe('context index', () => {
  it('writes the search index on demand', async () => {
    const repo = await TempRepo.create();
    try {
      for (const name of ['a', 'b', 'c']) await repo.write(`src/app/${name}.ts`, `export function make${name}() {}\n`);
      await repo.commitAll('base');
      const runtime = await createRuntime({ cwd: repo.root });
      await initConfig(runtime, FIXTURE_CONFIG);
      const out = await contextIndexCommand.run(runtime, parseArgs('context index', [], contextIndexCommand.options));
      assert.match(out.text, /^\{"kind":"meta","head":"[0-9a-f]{40}","roots":\[\],"folders":1,"files":3,/);
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
