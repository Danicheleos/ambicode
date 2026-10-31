import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { scriptHandler } from './script.ts';
import type { AmbicodeError } from '#util/errors';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'script-task';

const ROUTE = (name: string): string => `skill: inv
version: 3
steps:
  - id: collect
    actor: code
    run: ["script(${name})"]
    onError: "stop:blocked"
  - id: read
    actor: model
    instruction: "Read, then answer."
    payload: ["script:${name}"]
`;

const ECHO = `
let text = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { text += chunk; });
process.stdin.on('end', () => {
  const input = JSON.parse(text);
  process.stdout.write(JSON.stringify({
    payload: 'hello ' + input.task + ' from ' + input.skill + ' in ' + input.cwd,
    record: { collected: 2 },
    entries: [{ kind: 'search', command: 'refs', names: ['x'], hits: 1, bytes: 3 }],
  }));
});
`;

async function scripts(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-scripts-'));
  const dir = path.join(root, 'skills', 'inv', 'scripts');
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, `${name}.mjs`), body);
  return root;
}

describe('run: script(<name>) (C7)', () => {
  it('runs skills/<skill>/scripts/<name>.mjs, delivers its payload, merges its record and appends its entries', async () => {
    const pluginRoot = await scripts({ echo: ECHO });
    const fx = await routeFixture({ routes: { inv: ROUTE('echo') }, pluginRoot });
    try {
      const first = await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      assert.equal(first.position, 'read');
      assert.ok(first.text.includes(`hello script-task from inv in ${fx.repo.root}`), 'the script is told the session directory');
      const search = await fx.kinds(TASK, 'search');
      assert.equal(search.length, 1);
      assert.equal(search[0]?.['command'], 'refs');
      const completed = (await fx.kinds(TASK, 'step')).find((entry) => entry['step'] === 'collect' && entry['status'] === 'completed');
      assert.equal(completed?.['collected'], 2);
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it('a script that exits non-zero or prints no JSON fails the step with the script named, and onError stops the route', async () => {
    const pluginRoot = await scripts({ boom: "process.stderr.write('no input\\n'); process.exit(3);", prose: "process.stdout.write('not json');" });
    for (const [name, code] of [['boom', 'script-failed'], ['prose', 'script-output-invalid']] as const) {
      const fx = await routeFixture({ routes: { inv: ROUTE(name) }, pluginRoot });
      try {
        await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
        const failed = (await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed');
        assert.equal(failed?.['code'], code);
        assert.match(String(failed?.['message']), new RegExp(`skills/inv/scripts/${name}.mjs`));
        assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), ['blocked']);
      } finally {
        await fx.dispose();
      }
    }
    await rm(pluginRoot, { recursive: true, force: true });
  });

  it('a crashing script keeps its error and stack in the failure message, not the last three lines of stderr', async () => {
    const crash = "function deep(n) { if (n === 0) throw new Error('cause-marker'); deep(n - 1); }\ndeep(6);";
    const pluginRoot = await scripts({ crash });
    const fx = await routeFixture({ routes: { inv: ROUTE('crash') }, pluginRoot });
    try {
      await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const message = String((await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed')?.['message']);
      assert.match(message, /Error: cause-marker/);
      assert.ok((message.match(/at deep/g) ?? []).length >= 5, message);
      assert.doesNotMatch(message, /\|  \|/, 'blank stderr lines are dropped');
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it('a very long stderr is bounded, keeping its start', async () => {
    const pluginRoot = await scripts({ noisy: "process.stderr.write('first-line\\n' + 'x'.repeat(50000)); process.exit(2);" });
    const fx = await routeFixture({ routes: { inv: ROUTE('noisy') }, pluginRoot });
    try {
      await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const message = String((await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed')?.['message']);
      assert.match(message, /exited 2: first-line/);
      assert.ok(message.length <= 2000, String(message.length));
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it('a crash on a step with onFail revise sends the model back with the reason, leaves no completed entry, and past the repeat limit is released as a recorded gap', async () => {
    const pluginRoot = await scripts({ crash: "process.stderr.write('Error: cause-marker\\n'); process.exit(1);" });
    const route = `skill: inv
version: 3
steps:
  - id: draft
    actor: model
    instruction: "Draft, then check."
    repeat: 2
  - id: verify
    actor: code
    run: ["script(crash)"]
    onFail: revise draft
  - id: finish
    actor: model
    instruction: "Finish."
`;
    const fx = await routeFixture({ routes: { inv: route }, pluginRoot });
    try {
      await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const sent = await fx.engine.advance({ task: TASK, cause: 'route-next', scratchpadDir: fx.scratchpad });
      assert.equal(sent.position, 'draft');
      assert.match(sent.text, /## verify\n.*exited 1: Error: cause-marker/s);
      const verify = async (status: string) => (await fx.kinds(TASK, 'step')).filter((entry) => entry['step'] === 'verify' && entry['status'] === status);
      assert.equal((await verify('completed')).length, 0, 'a crash is not a result: the step has not completed');
      const released = await fx.engine.advance({ task: TASK, cause: 'route-next', scratchpadDir: fx.scratchpad });
      assert.equal(released.position, 'finish', 'past the limit the route goes on');
      assert.equal((await verify('completed')).length, 1);
      assert.equal((await verify('failed')).filter((entry) => entry['recorded'] === true).length, 1);
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it('a script name outside letters, digits, "_" and "-" is refused before anything runs', async () => {
    const fx = await routeFixture({ routes: { inv: ROUTE('../x') } });
    try {
      await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const failed = (await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed');
      assert.equal(failed?.['code'], 'script-name-invalid');
    } finally {
      await fx.dispose();
    }
  });

  it('a script the engine had to kill names its stage: the last line it wrote to stderr', async () => {
    const run = async (stderr: string) => {
      const input = { params: ['brief'], view: { skill: 'review', task: 't', mode: 'interactive' }, dir: { repositoryRoot: '/r', root: '/r/t', steps: '/r/t/steps' }, args: {}, runtime: { pluginRoot: '/p', cwd: '/r', runner: { run: async () => ({ kind: 'timed-out', stdout: '', stderr, exitCode: null, failure: null }) } } };
      return scriptHandler(input as never);
    };
    const named = await run('brief: listing the checkout files with git ls-files\nbrief: scanning 8000 files for the 300 names the diff shares with them\n');
    assert.match(String((named as { message: string }).message), /timed-out after 100 s, last stage: brief: scanning 8000 files/);
    const silent = await run('');
    assert.match(String((silent as { message: string }).message), /timed-out after 100 s \(it wrote no stage line\)/);
  });
  // The user's route stuck at a timed-out brief step: the error was the only output and named no way out; `route start` on the same task is the restart.
  it('a failing step with no onError leaves the route open and its error prints the retry and the stop command; starting the same task again replaces the stuck route', async () => {
    const pluginRoot = await scripts({ boom: "process.stderr.write('slow'); process.exit(3);" });
    const route = ROUTE('boom').replace('    onError: "stop:blocked"\n', '');
    const fx = await routeFixture({ routes: { inv: route }, pluginRoot });
    try {
      const begin = () => fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'cli', scratchpadDir: fx.scratchpad });
      const stuck = await begin().then(() => null, (error: unknown) => error as AmbicodeError);
      assert.equal(stuck?.code, 'script-failed');
      assert.match(stuck?.details.join('\n') ?? '', /Retry: .*route next --task script-task\n.*Give up: .*route stop --task script-task --reason blocked/);
      assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), [], 'the route is still open');
      const again = await fx.engine.advance({ task: TASK, cause: 'route-next' }).then(() => null, (error: unknown) => error as AmbicodeError);
      assert.equal(again?.code, 'script-failed', 'the retry command re-runs the step');
      await begin().catch(() => undefined);
      assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), ['interrupted'], 'a second start ends the stuck route instead of duplicating it');
      await fx.engine.stop(TASK, 'blocked', 'gave up');
      assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), ['interrupted', 'blocked'], 'the stop command closes what the second start opened');
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });
});
