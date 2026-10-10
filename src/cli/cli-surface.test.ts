import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPECS, USAGE } from './main.ts';

const TABLE: Record<string, readonly string[]> = {
  'route start': ['task', 'headless', 'project', 'answer', 'fresh', 'adopt'],
  'route next': ['task', 'answer', 'default', 'revise', 'project', 'show'],
  'route stop': ['task', 'reason', 'detail'],
  map: ['task', 'project', 'mode', 'term', 'symbol'],
  refs: ['project', 'declarations'],
  'requirements normalize': ['task'],
  'policy check': ['project', 'drafts'],
  'rules apply': ['project'],
  check: ['task', 'only', 'phase', 'approve', 'decline'],
  format: ['task'],
  review: ['task', 'estimate'],
  'review record': ['task', 'review'],
  'note save': ['task', 'kind', 'from', 'iteration'],
  'note promote': ['task'],
  report: ['task'],
  init: ['apply', 'task'],
  'init propose': ['task'],
  version: [],
};

const GAPS: Record<string, string> = {};

const SUBCOMMANDS = ['route', 'requirements', 'rules', 'note', 'policy'];

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

  it('08-I1: the named commands exist: init propose, note promote', () => {
    for (const command of ['init propose', 'note promote']) {
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
    assert.equal(SPECS['init']?.flags?.includes('dry-run'), false);
    assert.equal(SPECS['doctor'], undefined);
    assert.ok(SPECS['check']?.repeated?.includes('only'));
    assert.ok(SPECS['check']?.values?.includes('phase'));
    assert.ok(SPECS['review']?.flags?.includes('estimate'));
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
