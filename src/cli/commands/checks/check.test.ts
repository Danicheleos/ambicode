import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { AmbicodeError } from '#util/errors';
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
  return { check, steps, checks, root };
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

  it('a failing run is recorded and prints the path of its whole output file, with no "Not done yet" hint and no route text, and the route stays at change', async () => {
    const t = await atChange('node -e "console.log(\'boom 1 failed\');process.exit(1)"');
    const before = await t.steps();
    const out = await t.check();
    assert.equal(out.next, undefined);
    const [entry] = await t.checks();
    const shown = renderCheck(out).split('\n')[1];
    assert.equal(shown, `exit 1; ${String(entry?.['bytes'])} bytes of output in ${String(entry?.['output'])}`);
    assert.doesNotMatch(renderCheck(out), /boom 1 failed/, 'the output is in the file, not in the text');
    const saved = await readFile(path.join(t.root, String(entry?.['output'])), 'utf8');
    assert.match(saved, /boom 1 failed/);
    assert.equal(entry?.['bytes'], Buffer.byteLength(saved));
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

/** A headless task route on a repository of two projects, `dashboard` and `engine`, whose `lint` runs `true {file}` in each. */
async function atTwoProjects(engineLint = '"true {file}"') {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-check-'));
  scratches.push(scratch);
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-feature-boundary'), root, { ambicodeInit: true });
  const config = path.join(root, '.ambicode', 'config.yaml');
  const project = (id: string, lint: string) => [`  - id: ${id}`, `    root: ${id}`, '    paths: []', '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }', '    checks:', `      lint: { all: null, file: ${lint} }`].join('\n');
  const text = await readFile(config, 'utf8');
  await writeFile(config, `${text.slice(0, text.indexOf('projects:'))}projects:\n${project('dashboard', '"true {file}"')}\n${project('engine', engineLint)}\n`);
  // A check runs in its project's root, so the roots must exist.
  for (const id of ['dashboard', 'engine']) await mkdir(path.join(root, id), { recursive: true });
  const runtime = await createRuntime({ cwd: root });
  await runRouteStart(runtime, parseArgs('route start', ['task', '--task', TASK, '--headless', 'make the total ignore negatives'], ROUTE_START_OPTIONS));
  const check = (...argv: string[]) => runCheckCommand(runtime, parseArgs('check', ['--task', TASK, '--name', 'lint', '--phase', 'green', ...argv], CHECK_OPTIONS));
  const checks = async () => (await readLedger(nodeFileSystem, path.join(root, '.ambicode', 'tasks', TASK))).filter((entry) => entry.kind === 'check');
  return { check, checks };
}

describe('a check whose files span projects', () => {
  it('runs the key once per project, each on its own files, and prints both results', async () => {
    const t = await atTwoProjects();
    const out = await t.check('--file', 'dashboard/src/app.ts', '--file', 'engine/crates/units/src/lib.rs');
    assert.deepEqual((await t.checks()).map((entry) => [entry['key'], entry['files']]), [['dashboard/lint', ['dashboard/src/app.ts']], ['engine/lint', ['engine/crates/units/src/lib.rs']]]);
    assert.equal(out.results.length, 2);
    const text = renderCheck(out);
    assert.match(text, /check dashboard\/lint green: exit 0 .* as expected/);
    assert.match(text, /check engine\/lint green: exit 0 .* as expected/);
  });

  it('a project whose key has no file command refuses the whole call before any project runs', async () => {
    const t = await atTwoProjects('null');
    await assert.rejects(t.check('--file', 'dashboard/src/app.ts', '--file', 'engine/crates/units/src/lib.rs'), (error: unknown) => error instanceof AmbicodeError && error.code === 'bad-argument' && /Project "engine" check "lint" has no `file` command/.test(error.message));
    assert.equal((await t.checks()).length, 0);
  });

  it('a project that hits the step limit prints its own refusal after the earlier project ran, and the call exits nonzero', async () => {
    const t = await atTwoProjects();
    for (let run = 0; run < 4; run += 1) await t.check('--project', 'dashboard', '--file', 'dashboard/src/app.ts');
    const out = await t.check('--file', 'dashboard/src/app.ts', '--file', 'engine/crates/units/src/lib.rs');
    assert.equal((await t.checks()).length, 5);
    const text = renderCheck(out);
    assert.match(text, /check dashboard\/lint green: exit 0 .* as expected/);
    assert.match(text, /check engine\/lint: not run \(check-limit\): 5 green checks already ran in this step; nothing was run\./);
    assert.equal(out.failed, true);
  });

  it('--project still runs one project', async () => {
    const t = await atTwoProjects();
    const out = await t.check('--project', 'dashboard', '--file', 'dashboard/src/app.ts');
    assert.equal(out.results.length, 1);
    assert.deepEqual((await t.checks()).map((entry) => entry['key']), ['dashboard/lint']);
  });

  it('a file in no project still refuses as ambiguous-project and runs nothing', async () => {
    const t = await atTwoProjects();
    await assert.rejects(t.check('--file', 'dashboard/src/app.ts', '--file', 'tools/x.sh'), (error: unknown) => error instanceof AmbicodeError && error.code === 'ambiguous-project');
    assert.equal((await t.checks()).length, 0);
  });
});
