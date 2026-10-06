import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPECS, USAGE } from './main.ts';

const TABLE: Record<string, readonly string[]> = {
  'route start': ['task', 'headless', 'project', 'answer', 'fresh', 'adopt'],
  'route next': ['task', 'answer', 'default', 'revise', 'conflict', 'sources', 'project', 'show'],
  'route status': ['task'],
  'route stop': ['task', 'reason', 'detail'],
  map: ['task', 'project', 'mode', 'term', 'symbol', 'show'],
  refs: ['project', 'show'],
  find: ['kind', 'project'],
  relates: ['project'],
  'index build': ['project'],
  'index status': ['project'],
  locate: [],
  'requirements template': ['requirement', 'task'],
  'requirements normalize': ['task'],
  'requirements acs': ['task'],
  policy: ['project', 'activity', 'rule', 'stage', 'show'],
  'policy check': ['project', 'drafts'],
  'rules discover': ['project'],
  'rules apply': ['project'],
  'rules revert': ['project'],
  prepare: [],
  check: ['task', 'only', 'phase', 'approve', 'decline'],
  format: ['task'],
  review: ['task', 'estimate'],
  bundle: [],
  view: [],
  'note save': ['task', 'kind', 'from', 'iteration'],
  'note promote': ['task'],
  'note list': ['task'],
  report: ['task'],
  'plan check': ['task', 'from'],
  'worker run': ['task'],
  init: ['dry-run', 'apply', 'set'],
  doctor: ['project'],
  config: [],
  version: [],
};

const GAPS: Record<string, string> = {};

const SUBCOMMANDS = ['route', 'index', 'requirements', 'rules', 'note', 'policy', 'plan', 'worker'];

const declared = (command: string): string[] => {
  const spec = SPECS[command];
  return spec === undefined ? [] : [...(spec.values ?? []), ...(spec.repeated ?? []), ...(spec.flags ?? [])];
};

/** The help text's block for a command: its header line up to the next command header. */
function block(command: string): string | null {
  const lines = USAGE.split('\n');
  const start = lines.findIndex((line) => line === `  ${command}` || line.startsWith(`  ${command} `));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-z]/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('CLI surface (08-I1)', () => {
  for (const [command, flags] of Object.entries(TABLE)) {
    const name = `08-I1: ${command} is a command with --json, ${flags.length === 0 ? 'its unchanged options' : flags.map((flag) => `--${flag}`).join(' ')}, all in SPECS and USAGE`;
    it(name, GAPS[command] === undefined ? {} : { todo: GAPS[command] }, () => {
      assert.ok(SPECS[command] !== undefined, `${command} has no spec`);
      const text = block(command);
      assert.ok(text !== null, `${command} is not in USAGE`);
      for (const flag of ['json', ...flags]) {
        assert.ok(declared(command).includes(flag), `${command} does not accept --${flag}`);
        if (flag !== 'json') assert.ok(new RegExp(`(?:^|[\\s|\\[])--${flag}(?![a-z-])`).test(text), `${command} does not document --${flag}`);
      }
    });
  }

  it('08-I1: the named commands exist: worker run, doctor, note list, note promote', () => {
    for (const command of ['worker run', 'doctor', 'note list', 'note promote']) {
      assert.ok(SPECS[command] !== undefined, command);
      assert.ok(block(command) !== null, command);
    }
  });

  it('08-I1: init takes --set repeatably, check takes --only repeatably and --phase, review takes --estimate as a flag', () => {
    assert.ok(SPECS['init']?.repeated?.includes('set'));
    assert.ok(SPECS['check']?.repeated?.includes('only'));
    assert.ok(SPECS['check']?.values?.includes('phase'));
    assert.ok(SPECS['review']?.flags?.includes('estimate'));
  });

  it('08-I1: the route and requirements --answer, --requirement and --conflict options repeat as the table says', () => {
    assert.ok(SPECS['route start']?.repeated?.includes('answer'));
    assert.ok(SPECS['route next']?.repeated?.includes('answer'));
    assert.ok(SPECS['requirements template']?.repeated?.includes('requirement'));
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
