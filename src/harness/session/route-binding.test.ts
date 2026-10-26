import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runRouteNext, runRouteStart, ROUTE_NEXT_OPTIONS } from '#cli/commands/route/route';
import { liveRouteOf } from './active-route.ts';
import { appendLedger } from '#platform/ledger/ledger';
import { hookRunner } from '#testing/fixtures/owner-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { CHECK_TASK, checkFixture } from '#testing/fixtures/check-fixture';
import { ROUTE_START_OPTIONS } from '#types/cli';
import { parseArgs } from '#util/args';
import type { Runtime } from '#types/composition';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const CLAUDE_1 = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLAUDE_2 = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PLAN = `.ambicode/tasks/${CHECK_TASK}/plan.md`;

async function withTask(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await taskFixture();
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const hooked = (t: Fixture) => hookRunner(t.fx, t.fx.runtime, { load: async () => ({ engine: t.fx.engine, routes: t.fx.routes }) });
const launch = (t: Fixture, text: string, session: string) => hooked(t).event({ hook_event_name: 'UserPromptSubmit', prompt: text }, session);
/** The shell of a Claude session: Claude Code exports its id to every Bash tool call. */
const shell = (t: Fixture, session: string): Runtime => ({ ...t.fx.runtime, env: { ...t.fx.runtime.env, CLAUDE_CODE_SESSION_ID: session } });
const cliStart = (t: Fixture, session: string, argv: string[]) => runRouteStart(shell(t, session), parseArgs('route start', argv, ROUTE_START_OPTIONS));
const cliNext = (t: Fixture, session: string, task: string) => runRouteNext(shell(t, session), parseArgs('route next', ['--task', task], ROUTE_NEXT_OPTIONS));
const SKIP = 'skip — verification incomplete';
const answer = (t: Fixture, session: string, gate: string, option: string, instance: string) => {
  const question = `Run the independent review of this change? [ambicode gate ${gate} ${instance}]`;
  return hooked(t).event({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, options: [{ label: 'run' }, { label: SKIP }] }] }, tool_response: { answers: { [question]: option } } }, session);
};
/** A green check on the task's live route: its change is done, so the route stops at the review-offer gate. */
const toOffer = async (t: Fixture, task: string): Promise<void> => {
  await t.edit();
  const route = (await t.fx.kinds(task, 'route')).at(-1)!;
  const dir = path.join(t.fx.repo.root, '.ambicode', 'tasks', task);
  const { entry } = await appendLedger(t.fx.runtime.fs, dir, t.fx.runtime.clock.now(), 'test-writer', { route: route.id, session: route['session'], kind: 'check', key: 'app/unit', files: ['src/a.spec.ts'], exit: 0, phase: 'green', ms: 3 });
  await t.fx.engine.advance({ task, cause: 'check', produced: [entry.id], scratchpadDir: t.fx.scratchpad });
};
const codeOf = (promise: Promise<unknown>): Promise<string> => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'unknown');
const exits = async (t: Fixture, task = CHECK_TASK) => (await t.fx.kinds(task, 'exit')).map((entry) => [entry['route'], entry['reason']]);
const tasks = async (t: Fixture): Promise<string[]> => (await readdir(path.join(t.fx.repo.root, '.ambicode', 'tasks'))).sort();

describe('a route belongs to the Claude session that started it, from a hook or from Bash', { concurrency: 4 }, () => {
  it('a route the model starts with `route start` takes its gate answers from the hook of the same session', async () => {
    await withTask(async (t) => {
      await launch(t, `/ambicode:task --task ${CHECK_TASK} fix total iteration 1`, CLAUDE_1);
      await cliStart(t, CLAUDE_2, ['task', '--task', CHECK_TASK, 'fix total iteration 1']);
      await toOffer(t, CHECK_TASK);
      const [first, second] = await t.kinds('route');
      assert.equal(second!['session'], CLAUDE_2);
      assert.equal(second!['channel'], 'cli');
      const print = (await t.kinds('gate')).findLast((entry) => entry['gate'] === 'review-offer')!;
      assert.equal(print['route'], second!.id);

      await answer(t, CLAUDE_2, 'review-offer', SKIP, print.id);
      const accepted = (await t.kinds('acceptance')).filter((entry) => entry['gate'] === 'review-offer');
      assert.deepEqual(accepted.map((entry) => [entry['route'], entry['via'], entry['instance'], entry['answer']]), [[second!.id, 'hook', print.id, SKIP]]);
      assert.notEqual(first!.id, second!.id);
    });
  });
});

describe('a task has one live route', { concurrency: 4 }, () => {
  it('a start from another session ends the live route as interrupted, and route next then addresses the new one', async () => {
    await withTask(async (t) => {
      await launch(t, `/ambicode:task --task ${CHECK_TASK} fix total`, CLAUDE_1);
      const [first] = await t.kinds('route');
      await launch(t, `/ambicode:task --task ${CHECK_TASK} fix total again`, CLAUDE_2);
      const routes = await t.kinds('route');
      assert.equal(routes.length, 2);
      assert.deepEqual(await exits(t), [[first!.id, 'interrupted']]);
      const next = await cliNext(t, CLAUDE_1, CHECK_TASK);
      assert.equal(next.routeId, routes[1]!.id);
    });
  });

  it('a start from Bash ends the live route of whichever session held the task', async () => {
    await withTask(async (t) => {
      await launch(t, `/ambicode:task --task ${CHECK_TASK} fix total`, CLAUDE_1);
      await cliStart(t, CLAUDE_2, ['task', '--task', CHECK_TASK, 'fix total']);
      await cliStart(t, CLAUDE_2, ['task', '--task', CHECK_TASK, 'fix total']);
      const routes = await t.kinds('route');
      assert.deepEqual(await exits(t), [[routes[0]!.id, 'interrupted'], [routes[1]!.id, 'interrupted']]);
      assert.equal(await codeOf(cliNext(t, CLAUDE_1, CHECK_TASK)), 'ok');
    });
  });

  it('a session that starts a route on another task leaves nothing live behind on the first', async () => {
    await withTask(async (t) => {
      await launch(t, '/ambicode:task --task one fix total', CLAUDE_1);
      await launch(t, '/ambicode:task --task two fix total', CLAUDE_1);
      assert.deepEqual(await exits(t, 'one'), [[(await t.fx.kinds('one', 'route'))[0]!.id, 'interrupted']]);
      assert.deepEqual(await exits(t, 'two'), []);
    });
  });
});

describe('the task argument names a task', { concurrency: 4 }, () => {
  const planned = async (t: Fixture): Promise<void> => {
    await t.fx.repo.write(PLAN, '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n');
    await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), 'test-writer', { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
  };
  const started = async (t: Fixture, text: string) => {
    await launch(t, `/ambicode:task ${text}`, CLAUDE_1);
    const record = (await t.kinds('step')).findLast((entry) => entry['step'] === 'start');
    return { dirs: await tasks(t), plan: record?.['planPath'], iteration: [record?.['iteration'], record?.['iterations']] };
  };

  it('a `.ambicode/tasks/<slug>` path is that task, with its accepted plan', async () => {
    await withTask(async (t) => {
      await planned(t);
      const result = await started(t, `.ambicode/tasks/${CHECK_TASK}`);
      assert.deepEqual(result, { dirs: [CHECK_TASK], plan: PLAN, iteration: [1, 2] });
    });
  });

  it('a slug followed by `iteration N` is that task at that iteration', async () => {
    await withTask(async (t) => {
      await planned(t);
      assert.deepEqual(await started(t, `${CHECK_TASK} Iteration 2`), { dirs: [CHECK_TASK], plan: PLAN, iteration: [2, 2] });
    });
  });

  it('an issue key matches the task whatever its case, and `iteration N` is read anywhere in the text', async () => {
    await withTask(async (t) => {
      await planned(t);
      assert.deepEqual(await started(t, `ORD-7 continue with iteration 2 please`), { dirs: [CHECK_TASK], plan: PLAN, iteration: [2, 2] });
    });
  });

  it('a bare number after the task word is the iteration: one route, the review offered, no restart', async () => {
    await withTask(async (t) => {
      await planned(t);
      assert.deepEqual(await started(t, `${CHECK_TASK} 1`), { dirs: [CHECK_TASK], plan: PLAN, iteration: [1, 2] });
      await toOffer(t, CHECK_TASK);
      assert.equal((await t.kinds('route')).length, 1);
      assert.deepEqual((await t.kinds('gate')).map((entry) => entry['gate']), ['review-offer']);
    });
  });

  it('a bare number names the iteration after a Jira key too', async () => {
    await withTask(async (t) => {
      await launch(t, '/ambicode:task --task abc-123 add views', CLAUDE_1);
      await appendLedger(t.fx.runtime.fs, path.join(t.fx.repo.root, '.ambicode', 'tasks', 'abc-123'), t.fx.runtime.clock.now(), 'test-writer', { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
      await t.fx.repo.write(PLAN, '# Plan\n\n## Iteration 1\nA.\n\n## Iteration 2\nB.\n');
      await launch(t, '/ambicode:task ABC-123 2', CLAUDE_1);
      assert.equal((await t.fx.kinds('abc-123', 'step')).findLast((entry) => entry['step'] === 'start')?.['iteration'], 2);
    });
  });

  it('a Jira link names a new task by its issue key', async () => {
    await withTask(async (t) => {
      await launch(t, '/ambicode:task https://example.atlassian.net/browse/ABC-123', CLAUDE_1);
      assert.deepEqual(await tasks(t), ['abc-123']);
    });
  });

  it('an empty start continues the latest task of this session, with its plan', async () => {
    await withTask(async (t) => {
      await planned(t);
      await launch(t, `/ambicode:task --task ${CHECK_TASK} iteration 1`, CLAUDE_1);
      await cliStart(t, CLAUDE_1, ['task']);
      assert.deepEqual(await tasks(t), [CHECK_TASK]);
      assert.equal((await t.kinds('route')).length, 2);
      assert.equal((await t.kinds('step')).findLast((entry) => entry['step'] === 'start')?.['planPath'], PLAN);
    });
  });

  it('an empty start in a session with no task creates nothing and lists the recent tasks to ask about', async () => {
    await withTask(async (t) => {
      await planned(t);
      await launch(t, `/ambicode:task --task ${CHECK_TASK} iteration 1`, CLAUDE_1);
      for (const [task, entry] of [['init', { kind: 'init', what: 'scaffold', outcome: 'ok' }], ['rules', { kind: 'route', skill: 'rules', args: {}, mode: 'interactive', channel: 'cli', trusted: true, session: CLAUDE_1, epoch: 1 }]] as const) {
        const dir = path.join(t.fx.repo.root, '.ambicode', 'tasks', task);
        await mkdir(dir, { recursive: true });
        await appendLedger(t.fx.runtime.fs, dir, t.fx.runtime.clock.now(), 'test-writer', entry);
      }
      const error = await cliStart(t, CLAUDE_2, ['task']).then(() => null, (thrown: { code?: string; details?: string[] }) => thrown);
      assert.equal(error?.code, 'task-needed');
      const details = (error?.details ?? []).join('\n');
      assert.doesNotMatch(details, /^- (init|rules) /m, 'only tasks that take a request are offered');
      assert.match(details, new RegExp(`${CHECK_TASK} · plan: ${PLAN.replaceAll('.', '\\.')} · iterations 0/2 · last exit: none`));
      assert.match(details, /AskUserQuestion/);
      assert.deepEqual(await tasks(t), ['init', CHECK_TASK, 'rules']);
    });
  });

  it('a route that needs no request is still named after its skill when started empty', async () => {
    const { fx, start } = await checkFixture();
    try {
      await start('cli', false, { task: undefined, text: '' });
      assert.deepEqual((await readdir(path.join(fx.repo.root, '.ambicode', 'tasks'))).sort(), ['demo']);
    } finally {
      await fx.dispose();
    }
  });
});

describe('parallel sessions on different tasks', { concurrency: 4 }, () => {
  it('each session hook answers and advances only its own route', async () => {
    await withTask(async (t) => {
      await launch(t, '/ambicode:task --task one fix total iteration 1', CLAUDE_1);
      await launch(t, '/ambicode:task --task two fix total iteration 1', CLAUDE_2);
      await toOffer(t, 'one');
      await toOffer(t, 'two');
      const printOf = async (task: string) => (await t.fx.kinds(task, 'gate')).findLast((entry) => entry['gate'] === 'review-offer')!;
      const accepted = async (task: string) => (await t.fx.kinds(task, 'acceptance')).length;

      await answer(t, CLAUDE_1, 'review-offer', SKIP, (await printOf('one')).id);
      assert.deepEqual([await accepted('one'), await accepted('two')], [1, 0]);

      await answer(t, CLAUDE_2, 'review-offer', SKIP, (await printOf('two')).id);
      assert.deepEqual([await accepted('one'), await accepted('two')], [1, 1]);
    });
  });
});

describe('finding the session route without a pointer', { concurrency: 4 }, () => {
  it('a scan over 50 task ledgers of other sessions is measured', async () => {
    await withTask(async (t) => {
      for (let index = 0; index < 50; index += 1) {
        const dir = path.join(t.fx.repo.root, '.ambicode', 'tasks', `bulk-${index}`);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({ id: `x-${index}`, at: '2026-10-05T10:00:00.000Z', kind: 'route', skill: 'investigate', session: CLAUDE_2 })}\n`);
      }
      await launch(t, `/ambicode:task --task ${CHECK_TASK} fix total`, CLAUDE_1);
      const times: number[] = [];
      for (let run = 0; run < 20; run += 1) {
        const started = performance.now();
        assert.notEqual(await liveRouteOf(t.fx.runtime.fs, t.fx.repo.root, CLAUDE_1), null);
        times.push(performance.now() - started);
      }
      times.sort((left, right) => left - right);
      console.log(`# median scan over 51 ledgers: ${times[10]!.toFixed(1)} ms`);
      assert.ok(times[10]! < 1000);
    });
  });
});
