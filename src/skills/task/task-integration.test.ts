import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../fixtures/materialize.mjs';
import { runCheckOnly } from '#modules/checks/run/check-command';
import { runFormat } from '#modules/checks/run/format';
import { runHook } from '#hook/events/run-hook';
import { commandContext } from '#harness/engine/context';
import { runCommandTail } from '#harness/engine/command-tail';
import { skillHandlers } from '#skills/handlers';
import { assembleEngine } from '#testing/fixtures/route-fixture';
import { COMMAND_PACK, SplitRunner } from '#testing/fixtures/check-fixture';
import { readLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { REPO_ROOT } from '#testing/paths';
import type { CheckDeps } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HookDeps } from '#types/hook';
import { SESSION_A } from '#testing/fixtures/ids';

const TASK = 'page-last';
const SPEC = 'tests/page-last.test.js';
const FAILING = 'Tests:       1 failed, 1 total\n';
const PASSING = 'Tests:       1 passed, 1 total\n';

/** `ts-off-by-one` with jest wired by hand (no install: the runner's output is scripted) and no format command. */
async function offByOne() {
  const root = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-task-int-')), 'repo');
  await materialize(fixtureByName('ts-off-by-one'), root, { ambicodeInit: true });
  const configPath = path.join(root, '.ambicode', 'config.yaml');
  const config = parse(await readFile(configPath, 'utf8'));
  const app = config.projects[0];
  app.commands.unit = { argv: ['jest', '{files}'] };
  app.checks.unit = { command: 'unit', adapter: 'jest' };
  app.policyFiles = ['.ambicode/policies/cmds.yaml'];
  await writeFile(configPath, stringify(config));
  await mkdir(path.join(root, '.ambicode', 'policies'), { recursive: true });
  await writeFile(path.join(root, '.ambicode', 'policies', 'cmds.yaml'), COMMAND_PACK);
  execFileSync('git', ['add', '.ambicode'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'wire jest'], { cwd: root });

  const step: Record<string, string> = {};
  for (const name of ['plan/fetch', 'task/red', 'task/green', 'task/fix', 'task/write']) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  const assembled = await assembleEngine({ root, routes: { task: await readFile(path.join(REPO_ROOT, 'routes', 'task', 'task.yaml'), 'utf8') }, step });
  const engine = assembled.build(skillHandlers());
  const scratchpad = await assembled.runtime.fs.temporaryDirectory('ambicode-scratch-');
  const runner = new SplitRunner(assembled.runtime.runner);
  const runtime: Runtime = { ...assembled.runtime, runner };
  const deps: CheckDeps = { runtime, session: SESSION_A, context: commandContext({ runtime, routes: assembled.routes }), warm: async () => undefined };
  const tail = (cause: 'check' | 'format', produced: string[]) =>
    runCommandTail({ engine }, { task: TASK, cause, session: { state: 'bound', session: SESSION_A } as never, produced, scratchpadDir: scratchpad });
  const check = async (phase: 'red' | 'green') => {
    const result = await runCheckOnly(deps, { task: TASK, key: 'app/unit', only: [SPEC], phase, approve: [], decline: [] });
    assert.equal(result.outcome, 'ran');
    return tail('check', result.outcome === 'ran' ? [result.entry.id] : []);
  };
  const format = async () => tail('format', (await runFormat(deps, { task: TASK, paths: [] })).map((entry) => entry.id));
  const hookDeps: HookDeps = { pointer: assembled.pointer, load: async () => ({ engine, routes: assembled.routes, pointer: assembled.pointer }) };
  const stop = async (text: string) => {
    const transcript = path.join(scratchpad, 'transcript.jsonl');
    await writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`);
    return runHook(runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: root, scratchpad_dir: scratchpad, transcript_path: transcript }), hookDeps) as Promise<{ decision?: string; reason?: string } | null>;
  };
  const ledger = (): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'task', TASK));
  return {
    root, engine, runner, check, format, stop,
    start: () => engine.start({ skill: 'task', text: 'Fix the defect: `page` drops the last item of every page.', requirements: [], task: TASK, cwd: root, session: SESSION_A, channel: 'hook', scratchpadDir: scratchpad }),
    ledger,
    skip: async () => {
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === 'review-offer');
      return engine.advance({ task: TASK, session: SESSION_A, cause: 'gate-hook', answers: [{ gate: 'review-offer', option: 'skip — verification incomplete', instance: print!.id }], scratchpadDir: scratchpad });
    },
    write: (file: string, text: string) => writeFile(path.join(root, file), text),
    dispose: async () => {
      await rm(path.dirname(root), { recursive: true, force: true });
      await rm(scratchpad, { recursive: true, force: true });
    },
  };
}

const trail = (ledger: readonly LedgerEntry[]): string =>
  ledger.map((entry) => {
    const what = entry['step'] ?? entry['stage'] ?? entry['gate'] ?? entry['which'] ?? entry['reason'] ?? entry['phase'] ?? entry['outcome'] ?? '';
    return `${entry.kind}${what === '' ? '' : `:${String(what)}`}${entry['status'] === undefined ? '' : `:${String(entry['status'])}`}`;
  }).join(' · ');

describe('task route on ts-off-by-one (integration, test 18)', () => {
  it('07-R4/07-C4/07-F2/07-R7/07-S1: ground → red → green → unconfigured format → offer → skip → report; Stop holds a claim to the evidence', async () => {
    const t = await offByOne();
    try {
      const red = await t.start();
      assert.equal(red.position, 'red');
      assert.match(red.text, /1 file\(s\) already changed stay out of this task's review/);
      assert.match(red.text, /^ {2}page — \d+ refs/m);

      await t.write(SPEC, "const { page } = require('../src/page');\n\ntest('full page', () => {\n  expect(page([1, 2, 3, 4], 0, 2)).toEqual([1, 2]);\n});\n");
      t.runner.out = { exitCode: 1, stdout: FAILING };
      assert.equal((await t.check('red'))?.position, 'green');

      await t.write('src/page.js', 'module.exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);\n');
      t.runner.out = { exitCode: 0, stdout: PASSING };
      assert.equal((await t.check('green'))?.position, 'green', 'green also needs format');
      const offer = await t.format();
      assert.equal(offer?.position, 'review-offer');
      assert.match(offer?.text ?? '', /Review estimate: working tree/);

      const write = await t.skip();
      assert.equal(write.position, 'write');
      assert.match(write.text, /^Evidence$/m);
      assert.match(write.text, /^Not verified$/m);
      assert.match(write.text, /independent review skipped — verification incomplete/);
      assert.match(write.text, /not formatted: app\/format \(unconfigured\)/);

      const ledger = await t.ledger();
      const checks = ledger.filter((entry) => entry.kind === 'check');
      assert.deepEqual(checks.map((entry) => [entry['phase'], entry['summary']]), [['red', { ran: 1, failed: 1 }], ['green', { ran: 1, failed: 0 }]]);
      assert.deepEqual(ledger.filter((entry) => entry.kind === 'baseline').map((entry) => (entry['dirty'] as { path: string }[]).map((dirty) => dirty.path)), [['src/page.js']]);
      const report = write.text.split('## report\n')[1]!.split('\n\n## ')[0]!;
      const allowed = await t.stop(`# Task report\n\n**Done**: the last item stays on its page. All tests pass.\n\n**Remaining**: none\n\n${report}`);
      assert.notEqual(allowed?.decision, 'block', allowed?.reason);
      console.log(`[test 18 ledger] ${trail(await t.ledger())}`);
    } finally {
      await t.dispose();
    }
  });

  it('07-S1: on the same fixture, a "tests pass" report with no green check that ran a test is blocked once', async () => {
    const t = await offByOne();
    try {
      await t.start();
      await t.write(SPEC, "test('full page', () => {});\n");
      t.runner.out = { exitCode: 1, stdout: FAILING };
      await t.check('red');
      t.runner.out = { exitCode: 0, stdout: 'Tests:       0 total\n' };
      await t.check('green');
      assert.equal((await t.format())?.position, 'review-offer', 'an unproven green still completes green (D4)');
      await t.skip();
      const blocked = await t.stop('# Task report\n\nDone: the last item stays on its page. All tests pass.');
      assert.equal(blocked?.decision, 'block');
      assert.ok((await t.ledger()).some((entry) => entry.kind === 'limit' && entry['which'] === 'stop-block'));
    } finally {
      await t.dispose();
    }
  });
});
