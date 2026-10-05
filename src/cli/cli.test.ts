import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, type OptionSpec } from './args.ts';
import { BUNDLE_OPTIONS } from './commands/bundle.ts';
import { CONFIG_OPTIONS } from './commands/config.ts';
import { INIT_OPTIONS } from './commands/init.ts';
import { LOCATE_OPTIONS } from './commands/locate.ts';
import { POLICY_OPTIONS } from './commands/policy.ts';
import { POLICY_CHECK_OPTIONS } from './commands/policy-check.ts';
import { PREPARE_OPTIONS } from './commands/prepare.ts';
import { REVIEW_OPTIONS } from './commands/review.ts';
import { SPECS as COMMAND_SPECS, USAGE } from './main.ts';
import { isAmbicodeError } from '../util/errors.ts';

const SPECS: Record<string, OptionSpec> = {
  init: INIT_OPTIONS,
  config: CONFIG_OPTIONS,
  locate: LOCATE_OPTIONS,
  policy: POLICY_OPTIONS,
  'policy check': POLICY_CHECK_OPTIONS,
  prepare: PREPARE_OPTIONS,
  review: REVIEW_OPTIONS,
  bundle: BUNDLE_OPTIONS,
};

const GLOBAL = 'Global:';

/**
 * The options each help-text command block names, with the options every command takes under
 * `GLOBAL`. The help text is authored, so this keeps it from documenting an option the parser
 * would reject. `policy check` is its own block: read as `policy`, it hid policy's options.
 */
function documentedOptions(): Map<string, string[]> {
  const documented = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of USAGE.split('\n')) {
    if (line === GLOBAL) documented.set((current = GLOBAL), []);
    const command = /^  ([a-z]+(?: check| save| promote| list)?)(?: |$)/.exec(line);
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

  it('accepts every option the help text documents', () => {
    for (const [command, options] of documentedOptions()) {
      if (command === GLOBAL) continue;
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

  it('documents every option each command accepts', () => {
    const documented = documentedOptions();
    const missing: string[] = [];
    for (const [command, spec] of Object.entries(COMMAND_SPECS)) {
      assert.ok(spec !== undefined, `${command} has no option spec`);
      const names = [...(documented.get(command) ?? []), ...(documented.get(GLOBAL) ?? [])];
      for (const option of [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])]) {
        if (!names.includes(option)) missing.push(`${command} --${option}`);
      }
    }
    assert.deepEqual(missing, [], 'an option only the parser knows is one no agent will use');
  });

  it('rejects an operand on a command that takes none', () => {
    for (const command of ['init', 'config', 'review', 'bundle', 'version']) {
      const spec = COMMAND_SPECS[command];
      assert.ok(spec !== undefined);
      const error = failure(command, ['src/app.ts'], spec);
      assert.equal(error.code, 'bad-argument');
      assert.match(error.message, /takes no positional arguments/);
    }
    assert.deepEqual(parseArgs('policy', ['src/app.ts'], POLICY_OPTIONS).positionals, ['src/app.ts']);
    assert.deepEqual(parseArgs('prepare', ['src/app.ts'], PREPARE_OPTIONS).positionals, ['src/app.ts']);
    const locate = parseArgs('locate', ['--limit', '5', 'invoice', 'negative amount'], LOCATE_OPTIONS);
    assert.deepEqual(locate.positionals, ['invoice', 'negative amount']);
    assert.equal(locate.value('limit'), '5');
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

  it('collects repeated approvals in order and keeps them apart from values', () => {
    const args = parseArgs('bundle', ['--approve', 'web/unit', '--approve', 'api/lint'], BUNDLE_OPTIONS);
    assert.deepEqual(args.all('approve'), ['web/unit', 'api/lint']);
    assert.deepEqual(parseArgs('bundle', [], BUNDLE_OPTIONS).all('approve'), []);
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
    // main parses before createRuntime, so a rejected argument cannot have spawned a process or
    // written a file.
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
