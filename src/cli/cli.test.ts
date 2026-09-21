import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, type OptionSpec } from './args.ts';
import { BUNDLE_OPTIONS } from './commands/bundle.ts';
import { CONFIG_OPTIONS } from './commands/config.ts';
import { INIT_OPTIONS } from './commands/init.ts';
import { POLICY_OPTIONS } from './commands/policy.ts';
import { PREPARE_OPTIONS } from './commands/prepare.ts';
import { REVIEW_OPTIONS } from './commands/review.ts';
import { SPECS as COMMAND_SPECS, USAGE } from './main.ts';
import { isAmbicodeError } from '../util/errors.ts';

const SPECS: Record<string, OptionSpec> = {
  init: INIT_OPTIONS,
  config: CONFIG_OPTIONS,
  policy: POLICY_OPTIONS,
  prepare: PREPARE_OPTIONS,
  review: REVIEW_OPTIONS,
  bundle: BUNDLE_OPTIONS,
};

/**
 * The options each command block in the help text names. The help text is
 * authored, so this is what keeps it from documenting an option the parser
 * would reject (doc 11).
 */
function documentedOptions(): Map<string, string[]> {
  const documented = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of USAGE.split('\n')) {
    const command = /^  ([a-z]+)(?: |$)/.exec(line);
    if (command !== null) {
      current = command[1] ?? null;
      if (current !== null) documented.set(current, []);
    }
    if (current === null) continue;
    for (const [, name] of line.matchAll(/(?:^|\s)--([a-z][a-z-]*)/g)) {
      if (name !== undefined) documented.get(current)?.push(name);
    }
  }
  return documented;
}

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
    // The regression: `init --dry-run` parsed against one spec and then failed
    // against another, so a documented option ran the command and then errored.
    assert.equal(parseArgs('init', ['--dry-run'], INIT_OPTIONS).flag('dry-run'), true);
    assert.equal(parseArgs('init', ['--dry-run', '--json'], INIT_OPTIONS).flag('json'), true);

    const policy = parseArgs('policy', ['--project', 'web', '--activity', 'review', 'src/a.ts'], POLICY_OPTIONS);
    assert.equal(policy.value('project'), 'web');
    assert.equal(policy.value('activity'), 'review');
    assert.deepEqual(policy.positionals, ['src/a.ts']);

    const bundle = parseArgs('bundle', ['--branch', '--base', 'main'], BUNDLE_OPTIONS);
    assert.equal(bundle.flag('branch'), true);
    assert.equal(bundle.value('base'), 'main');

    assert.equal(parseArgs('config', ['--json'], CONFIG_OPTIONS).flag('json'), true);
  });

  it('offers --json on every command, so no command needs a second parse', () => {
    for (const [command, spec] of Object.entries(SPECS)) {
      assert.ok((spec.flags ?? []).includes('json'), `${command} must accept --json`);
    }
  });

  it('accepts every option the help text documents', () => {
    for (const [command, options] of documentedOptions()) {
      const spec = COMMAND_SPECS[command];
      assert.ok(spec !== undefined, `the help text documents "${command}", which is not a command`);
      for (const option of options) {
        const declared = [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
        assert.ok(
          declared.includes(option),
          `"${command}" documents --${option} but does not accept it`,
        );
      }
    }
  });

  it('rejects an operand on a command that takes none', () => {
    for (const command of ['init', 'config', 'review', 'bundle', 'version']) {
      const spec = COMMAND_SPECS[command];
      assert.ok(spec !== undefined);
      const error = failure(command, ['src/app.ts'], spec);
      assert.equal(error.code, 'bad-argument');
      assert.match(error.message, /takes no positional arguments/);
    }
    // Policy and prepare are the commands whose operands are data.
    assert.deepEqual(parseArgs('policy', ['src/app.ts'], POLICY_OPTIONS).positionals, ['src/app.ts']);
    assert.deepEqual(parseArgs('prepare', ['src/app.ts'], PREPARE_OPTIONS).positionals, ['src/app.ts']);
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
    // D03: the mode follows from whether a requirement URL was supplied.
    for (const spec of Object.values(SPECS)) {
      const declared = [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
      for (const banned of ['quality-only', 'no-checks', 'skip-checks', 'no-review']) {
        assert.ok(!declared.includes(banned), `--${banned} must not exist`);
      }
    }
  });

  it('collects repeated approvals in order and keeps them apart from values', () => {
    const args = parseArgs('bundle', ['--approve', 'web/unit', '--approve', 'api/lint'], BUNDLE_OPTIONS);
    assert.deepEqual(args.all('approve'), ['web/unit', 'api/lint']);
    assert.deepEqual(parseArgs('bundle', [], BUNDLE_OPTIONS).all('approve'), []);
    // A single-valued option never answers `all`, so approvals cannot be faked.
    assert.deepEqual(parseArgs('bundle', ['--base', 'main'], BUNDLE_OPTIONS).all('base'), []);
  });

  it('accepts inline values and stops at --', () => {
    assert.equal(parseArgs('bundle', ['--base=release/1.2'], BUNDLE_OPTIONS).value('base'), 'release/1.2');
    const args = parseArgs('policy', ['--', '--not-an-option'], POLICY_OPTIONS);
    assert.deepEqual(args.positionals, ['--not-an-option']);
  });

  it('names the command and its own options when an option is unknown', () => {
    const error = failure('init', ['--branch'], INIT_OPTIONS);
    assert.equal(error.code, 'bad-argument');
    assert.match(error.message, /init/);
    assert.match(error.message, /--branch/);
  });

  it('rejects a missing value and a value given to a flag', () => {
    assert.equal(failure('bundle', ['--base'], BUNDLE_OPTIONS).code, 'bad-argument');
    assert.equal(failure('init', ['--dry-run=yes'], INIT_OPTIONS).code, 'bad-argument');
  });

  it('rejects an unknown option before the command can do anything', async () => {
    // Nothing is constructed on this path: main parses before createRuntime, so
    // a rejected argument cannot have spawned a process or written a file.
    const { main } = await import('./main.ts');
    const written: string[] = [];
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stderr.write;
    try {
      assert.equal(await main(['init', '--no-such-option']), 2);
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
