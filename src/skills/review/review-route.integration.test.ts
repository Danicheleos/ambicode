import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../fixtures/materialize.mjs';
import { parseArgs } from '#util/args';
import { routeTools, runRouteStart } from '#cli/commands/route/route';
import { createRuntime } from '#composition/root';
import { ReviewResult } from '#types/modules/review';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { readLedger } from '#platform/ledger/ledger';
import { SplitRunner } from '#testing/fixtures/check-fixture';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';

const TASK = 'src-regression';

/** `ts-source-regression` with the runner scripted, so a check the review ran would show in `runner.calls`. */
async function regression() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-review-int-'));
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-source-regression'), root, { ambicodeInit: true });
  const configPath = path.join(root, '.ambicode', 'config.yaml');
  const config = parse(await readFile(configPath, 'utf8'));
  await writeFile(configPath, stringify(config));
  execFileSync('git', ['add', '-f', '.ambicode'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'wire config', '--allow-empty'], { cwd: root });

  const base = await createRuntime({ cwd: root });
  const runner = new SplitRunner(base.runner);
  runner.out = { exitCode: 0, stdout: '' };
  const runtime: Runtime = { ...base, runner };
  const tools = await routeTools(runtime);
  const dir = path.join(root, '.ambicode', 'reviews', TASK);
  const ledger = (): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, dir);
  return {
    root, runtime, runner, ledger,
    answerNext: () => tools.engine.advance({ task: TASK, cause: 'route-next' }),
    start: (...argv: string[]) => runRouteStart(runtime, parseArgs('route start', ['review', '--task', TASK, ...argv, 'review my change'], ROUTE_START_OPTIONS)),
    /** The user's answer to the latest print of `gate`, as the AskUserQuestion hook records it. */
    answer: async (gate: string, option: string) => {
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === gate);
      return tools.engine.advance({ task: TASK, cause: 'gate-hook', answers: [{ gate, option, ...(print === undefined ? {} : { instance: print.id }) }] });
    },
    dispose: () => rm(scratch, { recursive: true, force: true }),
  };
}

describe('review route on ts-source-regression (08-I3)', () => {
  it('08-I3: start → estimate → run (pin and brief in code) → brief → one reviewer run → readback; the report keeps part 4', async () => {
    const t = await regression();
    try {
      const started = await t.start();
      assert.equal(started.position, 'estimate');
      assert.match(started.text, /Review estimate: working tree · 1 file\(s\)/);
      assert.doesNotMatch(started.text, /waiting:/);
      assert.ok(Buffer.byteLength(started.text) <= 3072, `${Buffer.byteLength(started.text)}`);

      const done = await t.answer('estimate', 'run');
      assert.equal(done.position, 'review-agent');
      assert.equal(t.runner.calls.length, 0, 'the fixture configures no check with a file form, so the route runs none');
      assert.doesNotMatch(done.text, /review --task/);
      const brief = (await readFile(path.join(t.root, '.ambicode', 'reviews', TASK, 'steps', 'work-review-agent.md'), 'utf8')).match(/brief: (.*brief\.md)/)![1]!;
      assert.match(await readFile(brief, 'utf8'), /No check recorded for this task/);

      await writeFile(path.join(path.dirname(brief), 'answer.json'), '```json\n{"findings":[],"coverageNotes":["read src/index.ts"]}\n```');
      const readback = await t.answerNext();
      assert.match(readback.text, /step readback/);
      assert.match(readback.text, /## review\.record\n1\. WHAT WAS REVIEWED[\s\S]*read src\/index\.ts/);
      const entries = (await t.ledger()).filter((entry) => entry.kind === 'review');
      assert.deepEqual(entries.map((entry) => entry['stage']), ['pending', 'recorded']);

      const result = ReviewResult.parse(JSON.parse(await readFile(path.join(t.root, String(entries.at(-1)!['result'])), 'utf8')));
      assert.match(await readFile(path.join(path.dirname(path.join(t.root, String(entries.at(-1)!['result']))), 'report.txt'), 'utf8'), /4\. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE/);
      assert.deepEqual([result.reviewer?.status, result.status], ['ok', 'partial']);
      assert.equal(result.checks.length, 0);
    } finally {
      await t.dispose();
    }
  });
});
