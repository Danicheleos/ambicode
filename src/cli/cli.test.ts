import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { SPECS as COMMAND_SPECS } from './main.ts';
import { MAP_OPTIONS, REFS_OPTIONS } from './commands/search/search.ts';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { isAmbicodeError } from '#util/errors';
import type { OptionSpec } from './types/cli.ts';
import { POLICY_CHECK_OPTIONS } from './commands/policy/policy-check.ts';
import { CHECK_OPTIONS } from './commands/checks/check.ts';
import { REVIEW_OPTIONS } from './commands/review/review.ts';

const SPECS: Record<string, OptionSpec> = {
  map: MAP_OPTIONS,
  refs: REFS_OPTIONS,
  'policy check': POLICY_CHECK_OPTIONS,
  review: REVIEW_OPTIONS,
};

function failure(command: string, argv: readonly string[], spec: OptionSpec): { code: string; message: string } {
  try {
    parseArgs(command, argv, spec);
  } catch (error) {
    assert.ok(isAmbicodeError(error));
    return { code: error.code, message: error.message };
  }
  assert.fail(`expected ${command} ${argv.join(' ')} to be rejected`);
}

describe('U27 command line arguments', () => {
  it('accepts every option the usage text documents', () => {
    assert.equal(parseArgs('check', ['--name', 'unit', '--file', 'a.ts', '--file', 'b.ts', '--phase', 'red'], CHECK_OPTIONS).all('file').length, 2);

    const review = parseArgs('review', ['--branch', '--base', 'main'], REVIEW_OPTIONS);
    assert.equal(review.flag('branch'), true);
    assert.equal(review.value('base'), 'main');

    // `main` strips the `policy check` subcommand before parsing, so the spec sees only what follows it.
    const policyCheck = parseArgs(
      'policy check',
      ['--project', 'web', '--json', '.ambicode/policies/a.yaml'],
      POLICY_CHECK_OPTIONS,
    );
    assert.equal(policyCheck.value('project'), 'web');
    assert.equal(policyCheck.flag('json'), true);
    assert.deepEqual(policyCheck.positionals, ['.ambicode/policies/a.yaml']);
  });

  it('offers --json on every command, so no command needs a second parse', () => {
    for (const [command, spec] of Object.entries(SPECS)) {
      assert.ok((spec.flags ?? []).includes('json'), `${command} must accept --json`);
    }
  });

  it('rejects an operand on a command that takes none', () => {
    for (const command of ['review', 'version']) {
      const spec = COMMAND_SPECS[command];
      assert.ok(spec !== undefined);
      const error = failure(command, ['src/app.ts'], spec);
      assert.equal(error.code, 'bad-argument');
      assert.match(error.message, /takes no positional arguments/);
    }
    assert.deepEqual(parseArgs('policy check', ['a.yaml'], POLICY_CHECK_OPTIONS).positionals, ['a.yaml']);
    const refs = parseArgs('refs', ['--declarations', 'invoice', 'refund'], REFS_OPTIONS);
    assert.deepEqual(refs.positionals, ['invoice', 'refund']);
    assert.equal(refs.flag('declarations'), true);
  });

  it('collects repeatable requirement URLs in the order they were given', () => {
    const args = parseArgs(
      'review',
      ['--requirement', 'https://example.atlassian.net/browse/A-1', '--requirement', 'https://example.atlassian.net/wiki/x', '--evidence', 'e.json'],
      REVIEW_OPTIONS,
    );
    assert.deepEqual(args.all('requirement'), [
      'https://example.atlassian.net/browse/A-1',
      'https://example.atlassian.net/wiki/x',
    ]);
    assert.equal(args.value('evidence'), 'e.json');
  });

  it('has no flag that turns checks or the requirement mode off', () => {
    for (const spec of Object.values(SPECS)) {
      const declared = [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
      for (const banned of ['quality-only', 'no-checks', 'skip-checks', 'no-review']) {
        assert.ok(!declared.includes(banned), `--${banned} must not exist`);
      }
    }
  });

  it('collects repeated values in order and keeps them apart from single values', () => {
    const args = parseArgs('review', ['--only', 'src/**', '--only', 'lib/**'], REVIEW_OPTIONS);
    assert.deepEqual(args.all('only'), ['src/**', 'lib/**']);
    assert.deepEqual(parseArgs('review', [], REVIEW_OPTIONS).all('only'), []);
    assert.deepEqual(parseArgs('review', ['--base', 'main'], REVIEW_OPTIONS).all('base'), []);
  });

  it('accepts inline values and stops at --', () => {
    assert.equal(parseArgs('review', ['--base=release/1.2'], REVIEW_OPTIONS).value('base'), 'release/1.2');
    const args = parseArgs('policy check', ['--', '--not-an-option'], POLICY_CHECK_OPTIONS);
    assert.deepEqual(args.positionals, ['--not-an-option']);
  });

  it('names the command and its own options when an option is unknown', () => {
    const error = failure('refs', ['--branch'], REFS_OPTIONS);
    assert.equal(error.code, 'bad-argument');
    assert.match(error.message, /refs/);
    assert.match(error.message, /--branch/);
  });

  it('rejects a missing value and a value given to a flag', () => {
    assert.equal(failure('review', ['--base'], REVIEW_OPTIONS).code, 'bad-argument');
    assert.equal(failure('refs', ['--declarations=yes'], REFS_OPTIONS).code, 'bad-argument');
  });

  it('rejects an unknown option before the command can do anything', async () => {
    // main parses before createRuntime, so a rejected argument cannot have spawned a process or
    // written a file.
    const { main } = await import('./main.ts');
    const written: string[] = [];
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stderr.write;
    try {
      assert.equal(await main(['refs', '--no-such-option']), 2);
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    assert.match(written.join(''), /bad-argument/);
  });

  it('reports an unknown command without parsing its arguments', async () => {
    const { main } = await import('./main.ts');
    const stderr = process.stderr.write.bind(process.stderr);
    let text = '';
    process.stderr.write = ((chunk: string) => ((text += String(chunk)), true)) as typeof process.stderr.write;
    try {
      assert.equal(await main(['nope', '--whatever']), 2);
    } finally {
      process.stderr.write = stderr;
    }
    assert.match(text, /Unknown command "nope"/);
  });
});

describe('search commands', () => {
  it('map and refs are registered and take --json; the index, locate, find, relates and read commands are gone', () => {
    for (const command of ['map', 'refs']) assert.ok((COMMAND_SPECS[command]?.flags ?? []).includes('json'), command);
    assert.equal(COMMAND_SPECS['map'], MAP_OPTIONS);
    assert.equal(COMMAND_SPECS['refs'], REFS_OPTIONS);
    for (const command of ['locate', 'find', 'relates', 'read', 'index build', 'index status']) assert.equal(COMMAND_SPECS[command], undefined, command);
  });
});

describe('a --task command runs in the task\'s repository', () => {
  const MAIN = path.join(import.meta.dirname, 'main.ts');
  const git = (cwd: string, ...argv: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...argv], { cwd });

  it('reads the task repository\'s files from a shell started above it, inside another work tree', async () => {
    const session = await mkdtemp(path.join(tmpdir(), 'ambicode-task-cwd-'));
    try {
      const repo = path.join(session, 'repo');
      git(session, 'init', '-q');
      await mkdir(path.join(repo, '.ambicode', 'tasks', 't'), { recursive: true });
      git(repo, 'init', '-q');
      await writeFile(path.join(repo, '.ambicode', 'config.yaml'), CONFIG);
      await writeFile(path.join(repo, '.ambicode', 'tasks', 't', 'ledger.jsonl'), '');
      await mkdir(path.join(repo, 'src'));
      await writeFile(path.join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
      git(repo, 'add', 'src/a.ts');
      git(repo, 'commit', '-q', '-m', 'base');

      const run = (cwd: string) => spawnSync(process.execPath, [MAIN, 'refs', '--task', 't', 'a'], { cwd, encoding: 'utf8' });
      const above = run(session);
      assert.equal(above.status, 0, above.stderr);
      assert.match(above.stdout, /src\/a\.ts:1:/);
      const inside = run(path.join(repo, 'src'));
      assert.equal(inside.status, 0, inside.stderr);
      assert.match(inside.stdout, /src\/a\.ts:1:/);
    } finally {
      await rm(session, { recursive: true, force: true });
    }
  });
});
