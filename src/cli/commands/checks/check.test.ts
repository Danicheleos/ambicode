import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../../fixtures/materialize.mjs';
import { createRuntime } from '#composition/root';
import { readLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { ROUTE_START_OPTIONS } from '#types/cli';
import { parseArgs } from '#util/args';
import { runRouteStart } from '../route/route.ts';
import { runCheckCommand, renderCheck, CHECK_OPTIONS } from './check.ts';

const TASK = 'delegated';
const scratches: string[] = [];
afterEach(async () => {
  for (const scratch of scratches.splice(0)) await rm(scratch, { recursive: true, force: true });
});

/** A headless task route stopped at `change`, whose unit check runs `unit` instead of the project's own tests. */
async function atChange(unit: string) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-check-'));
  scratches.push(scratch);
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-feature-boundary'), root, { ambicodeInit: true });
  const config = path.join(root, '.ambicode', 'config.yaml');
  await writeFile(config, (await readFile(config, 'utf8')).replace('      unit:\n        all: null\n        file: null', `      unit:\n        all: ${JSON.stringify(unit)}\n        file: ${JSON.stringify(`${unit} {file}`)}`));
  const runtime = await createRuntime({ cwd: root });
  await runRouteStart(runtime, parseArgs('route start', ['task', '--task', TASK, '--headless', 'make the total ignore negatives'], ROUTE_START_OPTIONS));
  const check = (...extra: string[]) => runCheckCommand(runtime, parseArgs('check', ['--task', TASK, '--name', 'unit', '--file', 'tests/users.test.ts', '--phase', 'green', ...extra], CHECK_OPTIONS));
  const steps = async () => (await readLedger(nodeFileSystem, path.join(root, '.ambicode', 'tasks', TASK))).filter((entry) => entry.kind === 'step').map((entry) => `${entry['step']}:${entry['status']}`);
  const checks = async () => (await readLedger(nodeFileSystem, path.join(root, '.ambicode', 'tasks', TASK))).filter((entry) => entry.kind === 'check');
  return { check, steps, checks };
}

const ROUTE_TEXT = /\[ambicode\]|Then:|Route:|\[ambicode gate /;

describe('a check made while the route stands at a delegated step', () => {
  it('records a green run, leaves the route at change and prints the result with no route text', async () => {
    const t = await atChange('node -e 0');
    const before = await t.steps();
    const out = await t.check();
    assert.equal(out.next, undefined);
    assert.doesNotMatch(renderCheck(out), ROUTE_TEXT);
    assert.match(renderCheck(out), /^check app\/unit green: exit 0 .* as expected/);
    assert.equal((await t.checks()).length, 1);
    assert.deepEqual(await t.steps(), before);
  });

  it('a red run is recorded and prints its tail, with no "Not done yet" hint and no route text, and the route stays at change', async () => {
    const t = await atChange('node -e "console.log(\'boom 1 failed\');process.exit(1)"');
    const before = await t.steps();
    const out = await t.check();
    assert.equal(out.next, undefined);
    assert.match(renderCheck(out), /exit 1 .* not as expected[\s\S]*boom 1 failed/);
    assert.doesNotMatch(renderCheck(out), /Not done yet|Produce it with/);
    assert.doesNotMatch(renderCheck(out), ROUTE_TEXT);
    assert.equal((await t.checks())[0]?.['exit'], 1);
    assert.deepEqual(await t.steps(), before);
  });

  it('a second check after a green one is held too: the fold already stands past change, the subagent is still in flight', async () => {
    const t = await atChange('node -e 0');
    const before = await t.steps();
    await t.check();
    const out = await t.check();
    assert.equal(out.next, undefined);
    assert.doesNotMatch(renderCheck(out), ROUTE_TEXT);
    assert.deepEqual(await t.steps(), before);
  });

  it('--approve and --decline print no route text either', async () => {
    const t = await atChange('node -e 0');
    const before = await t.steps();
    for (const extra of [['--approve', 'unit'], ['--decline', 'unit']]) {
      const out = await t.check(...extra);
      assert.doesNotMatch(renderCheck(out), ROUTE_TEXT, extra.join(' '));
      assert.equal(out.next, undefined);
    }
    assert.deepEqual(await t.steps(), before);
  });
});
