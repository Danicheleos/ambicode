import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { parseArgs } from '#util/args';
import { renderPlanCheck, runPlanCheckCommand, PLAN_CHECK_OPTIONS } from '#cli/commands/workers/plan-check';
import { commandContext } from '#harness/engine/context';
import { skillHandlers } from '#skills/handlers';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { AmbicodeError } from '#util/errors';
import { checkPlan, MAX_LISTED, planCheckFailed, runPlanCheck } from './plan-check.ts';
import { REPO_ROOT } from '#testing/paths';
import type { Runtime } from '#types/composition';

describe('checkPlan', () => {
  let root = '';
  const none = async () => [];
  const run = (body: string, acIds: string[] = [], find: Parameters<typeof checkPlan>[0]['find'] = none) =>
    checkPlan({ body, repositoryRoot: root, acIds, find });

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'plan-check-'));
    await mkdir(join(root, 'src'));
    const lines = Array.from({ length: 30 }, (_, i) => `// filler ${i + 1}`);
    lines[19] = 'export function targetName() {}';
    await writeFile(join(root, 'src/a.ts'), lines.join('\n') + '\n');
  });
  after(() => rm(root, { recursive: true, force: true }));

  it('06-C1: counts code and prose anchors and skips fences', async () => {
    const body = ['`targetName` at src/a.ts:20', '```', 'src/nope.ts:1', '```', '### src/a.ts', 'see lines 3-5', 'also L7'].join('\n');
    const r = await run(body);
    assert.equal(r.anchors.checked, 3);
    assert.equal(r.anchors.badTotal, 0);
  });

  const cases: [string, string, string, string?][] = [
    ['06-C2: absolute path', 'see /etc/passwd.txt:1', 'outside-repository'],
    ['06-C2: parent segment', 'see ../x/a.ts:1', 'outside-repository'],
    ['06-C2: missing file', 'see src/gone.ts:1', 'missing-file'],
    ['06-C3: past the end', 'see src/a.ts:31', 'line-out-of-range'],
    ['06-C3: reversed range', 'see src/a.ts:9-5', 'line-out-of-range'],
    ['06-C3: line zero', 'see src/a.ts:0', 'line-out-of-range'],
    ['06-C4: identifier outside +-3', '`targetName` src/a.ts:10', 'identifier-not-near', 'targetName'],
    ['06-C1/06-C3: a code anchor in a heading is checked', '## Changes src/a.ts:999', 'line-out-of-range'],
    ['06-C1/06-C2: a heading anchor to a missing file', '## Changes src/gone.ts:3', 'missing-file'],
  ];
  for (const [name, body, reason, identifier] of cases) {
    it(name, async () => {
      const r = await run(body);
      assert.equal(r.anchors.badTotal, 1);
      assert.equal(r.anchors.bad[0]!.reason, reason);
      assert.equal(r.anchors.bad[0]!.identifier, identifier);
    });
  }

  it('06-C2: a new path without an anchor is not checked', async () => {
    const r = await run('Create `src/brand-new.ts` for the feature');
    assert.deepEqual(r.anchors, { checked: 0, bad: [], badTotal: 0 });
  });

  it('06-C4: identifier at +-3 lines hits and prose anchors are range-only', async () => {
    const hit = await run('`targetName` src/a.ts:17\n`targetName` src/a.ts:23');
    assert.equal(hit.anchors.badTotal, 0);
    const prose = await run('## src/a.ts\n`targetName` unrelated, line 3');
    assert.deepEqual(prose.anchors.bad, []);
    assert.equal(prose.anchors.checked, 1);
  });

  it('06-C5: caps the list at 50 and keeps the total', async () => {
    const body = Array.from({ length: 60 }, (_, i) => `src/missing${i}.ts:1`).join('\n');
    const r = await run(body);
    assert.equal(r.anchors.checked, 60);
    assert.equal(r.anchors.bad.length, MAX_LISTED);
    assert.equal(r.anchors.badTotal, 60);
    assert.equal(r.anchors.bad[0]!.path, 'src/missing0.ts');
  });

  it('06-C6: maps table rows and Not covered sections; lists the rest', async () => {
    const body = ['| AC-1 | covered |', '## Not covered', 'AC-2 is out of scope', '## Next', 'AC-3 mentioned'].join('\n');
    const r = await run(body, ['AC-1', 'AC-2', 'AC-3']);
    assert.deepEqual(r.acs, { mapped: 2, unmapped: ['AC-3'], unmappedTotal: 1 });
    assert.equal(planCheckFailed(r), true);
  });

  it('06-C6: no acceptance criteria means nothing to map', async () => {
    const r = await run('anything');
    assert.deepEqual(r.acs, { mapped: 0, unmapped: [], unmappedTotal: 0 });
    assert.equal(planCheckFailed(r), false);
  });

  it('06-C7: reports a duplicate once and does not fail the check', async () => {
    const find = async (n: string) => (n === 'existingHelper' ? [{ path: 'src/h.ts', line: 4 }, { path: 'x.ts', line: 1 }] : []);
    const r = await run('Add `existingHelper` and create `freshThing`; add `existingHelper` again', [], find);
    assert.deepEqual(r.duplicates, [{ name: 'existingHelper', declaredAt: 'src/h.ts:4' }]);
    assert.equal(planCheckFailed(r), false);
  });

  it('06-C8: the same input gives the same result', async () => {
    const body = 'src/gone.ts:2\n| AC-1 |\nAdd `someName`';
    assert.deepEqual(await run(body, ['AC-1', 'AC-9']), await run(body, ['AC-1', 'AC-9']));
  });

  it('06-C5: worst-case artifact stays within 64 KiB (D7)', async () => {
    const dir = 'd'.repeat(200);
    const body = Array.from({ length: 80 }, (_, i) => `${dir}${i}/${'f'.repeat(100)}.ts:1`).join('\n') +
      '\n' + Array.from({ length: 80 }, (_, i) => `Add \`${'n'.repeat(60)}${i}\``).join('\n');
    const find = async (n: string) => [{ path: 'p'.repeat(150) + '.ts', line: 99999 }].map((x) => ({ ...x, n }));
    const r = await run(body, Array.from({ length: 80 }, (_, i) => `AC-${'x'.repeat(40)}${i}`), find);
    assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 65_536);
    assert.equal(r.duplicates.length, MAX_LISTED);
  });
});

describe('plan check command and runPlanCheck', () => {
  const A = 'aaaaaaaa-1111-4111-8111-111111111111';
  const B = 'bbbbbbbb-2222-4222-8222-222222222222';
  const GOOD = '# Plan\n\nChange `targetName` in src/a.ts:1\n';
  const BAD = '# Plan\n\nChange src/missing.ts:3\n';

  async function planFixture() {
    const step: Record<string, string> = {};
    for (const name of ['plan/fetch', 'plan/design', 'plan/write']) step[`routes/${name}.md`] = await readFile(join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
    const fx = await routeFixture({ routes: { plan: await readFile(join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8') }, handlers: skillHandlers(), step });
    await fx.repo.write('src/a.ts', 'export function targetName() {}\n');
    await fx.repo.commitAll('src');
    const task = 't1';
    const taskDir = join(fx.repo.root, '.ambicode', 'task', task);
    const runtime = await createRuntime({ cwd: fx.repo.root, clock: { now: () => new Date(2026, 9, 5, 10, 0, 0), elapsed: () => 0 }, stdin: { read: async () => null } });
    const withStdin = (body: string | null) => ({ ...runtime, stdin: { read: async () => body } });
    const startRoute = async () => {
      await fx.engine.start({ skill: 'plan', text: 'plan it', requirements: [], task, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      await fx.engine.advance({ task, session: A, cause: 'route-next', scratchpadDir: fx.scratchpad });
    };
    const steps = async () => (await fx.ledger(task)).filter((e) => e.kind === 'step').map((e) => `${e['step']}:${e['status']}`);
    const writeBody = async (text: string) => { await mkdir(join(taskDir, 'steps'), { recursive: true }); await writeFile(join(taskDir, 'steps', 'plan-body.md'), text); };
    const cmd = (body: string | null, argv: string[] = ['--task', task]) => runPlanCheckCommand(withStdin(body), parseArgs('plan check', argv, PLAN_CHECK_OPTIONS));
    const deps = (session: string | null, rt: Runtime = runtime) => ({ runtime: rt, session, context: commandContext({ runtime: rt, routes: fx.routes }) });
    const kinds = async () => (await fx.ledger(task)).map((e) => (e.kind === 'note' ? `note:${e['note']}` : e.kind === 'worker' ? `worker:${e['worker']}` : e.kind));
    return { fx, task, taskDir, runtime, startRoute, steps, writeBody, cmd, deps, kinds };
  }
  const using = async (run: (f: Awaited<ReturnType<typeof planFixture>>) => Promise<void>) => {
    const f = await planFixture();
    try { await run(f); } finally { await f.fx.dispose(); }
  };

  it('06-P1: stdin is the body; neither --from nor stdin is bad-argument from', async () => {
    await using(async (f) => {
      const out = await f.cmd(GOOD);
      assert.match(out.draft, /plan-draft_/);
      assert.match(await readFile(join(f.fx.repo.root, out.draft), 'utf8'), /targetName/);
      for (const empty of [null, '  \n']) {
        await assert.rejects(f.cmd(empty), (e: unknown) => e instanceof AmbicodeError && e.code === 'bad-argument' && e.field === 'from');
      }
    });
  });

  it('06-P1: --from accepts only the task steps/plan-body.md and refuses elsewhere, writing nothing', async () => {
    await using(async (f) => {
      await f.writeBody(GOOD);
      const out = await f.cmd(null, ['--task', f.task, '--from', 'steps/plan-body.md']);
      assert.equal(out.anchors.badTotal, 0);
      const before = await f.kinds();
      await f.fx.repo.write('other.md', GOOD);
      await assert.rejects(f.cmd(null, ['--task', f.task, '--from', join(f.fx.repo.root, 'other.md')]), (e: unknown) => e instanceof AmbicodeError && e.code === 'bad-argument');
      await assert.rejects(f.cmd(null, ['--task', f.task, '--from', '../../../other.md']), (e: unknown) => e instanceof AmbicodeError && e.code === 'bad-argument');
      assert.deepEqual(await f.kinds(), before);
    });
  });

  it('06-P1: a body over 262144 bytes is refused', async () => {
    await using(async (f) => {
      await assert.rejects(runPlanCheck(f.deps(null), { task: f.task, body: 'x'.repeat(262_145), from: null }), (e: unknown) => e instanceof AmbicodeError && e.code === 'bad-argument');
      assert.deepEqual(await f.kinds(), []);
    });
  });

  it('06-P2: the draft entry precedes the worker entry', async () => {
    await using(async (f) => {
      await runPlanCheck(f.deps(null), { task: f.task, body: GOOD, from: null });
      assert.deepEqual(await f.kinds(), ['note:plan-draft', 'worker:plan-check']);
    });
  });

  it('06-P2: a checker failure keeps the draft and its entry, writes no worker entry and propagates', async () => {
    await using(async (f) => {
      await f.fx.repo.write('.ambicode/task/t1/workers', 'not a directory');
      await assert.rejects(runPlanCheck(f.deps(null), { task: f.task, body: GOOD, from: null }));
      assert.deepEqual(await f.kinds(), ['note:plan-draft']);
      const draft = (await f.fx.ledger(f.task))[0]!;
      assert.match(await readFile(join(f.fx.repo.root, String(draft['path'])), 'utf8'), /targetName/);
    });
  });

  it('06-P3: an unbound or foreign session on a live route is refused, writing nothing', async () => {
    await using(async (f) => {
      await f.startRoute();
      const before = await f.kinds();
      const files = await readdir(f.taskDir);
      for (const [session, code] of [[null, 'session-unbound'], [B, 'route-busy']] as const) {
        await assert.rejects(runPlanCheck(f.deps(session), { task: f.task, body: GOOD, from: null }), (e: unknown) => e instanceof AmbicodeError && e.code === code);
      }
      assert.deepEqual(await f.kinds(), before);
      assert.deepEqual(await readdir(f.taskDir), files);
      assert.equal(before.includes('worker:plan-check'), false);
    });
  });

  it('06-P4: in a route the tail runs once with the draft and worker ids', async () => {
    await using(async (f) => {
      await f.startRoute();
      const before = await f.steps();
      const out = await f.cmd(GOOD);
      const ledger = await f.fx.ledger(f.task);
      assert.equal(ledger.filter((e) => e.kind === 'note' && e['note'] === 'plan-draft').length, 1);
      assert.equal(ledger.filter((e) => e.kind === 'worker').length, 1);
      assert.ok(out.next !== undefined);
      const after = await f.steps();
      assert.ok(after.length > before.length);
      assert.ok(after.includes('plan-check:completed'), after.join(','));
      assert.ok(out.next!.length > 0);
    });
  });

  it('06-P4: with no route there is no tail and no next', async () => {
    await using(async (f) => {
      const out = await f.cmd(GOOD);
      assert.equal('next' in out, false);
      assert.equal(out.failed, false);
      assert.deepEqual(await f.kinds(), ['note:plan-draft', 'worker:plan-check']);
    });
  });

  it('06-P8: a failing check returns normally and renders counts, artifact and next', async () => {
    await using(async (f) => {
      await f.startRoute();
      const out = await f.cmd(BAD);
      assert.equal(out.failed, true);
      assert.equal(out.anchors.badTotal, 1);
      const text = renderPlanCheck(out);
      assert.match(text, /plan check failed: 1 anchors checked, 1 bad/);
      assert.ok(text.includes(`Result: ${out.artifact}`));
      assert.ok(text.includes(out.next!));
      const standalone = renderPlanCheck({ ...out, failed: false, next: undefined } as never);
      assert.match(standalone, /plan check passed/);
    });
  });

  it('06-P8: the CLI process exits 0 for a failing check', async () => {
    await using(async (f) => {
      const r = spawnSync(process.execPath, [join(REPO_ROOT, 'src', 'cli', 'main.ts'), 'plan', 'check', '--task', f.task], { cwd: f.fx.repo.root, input: BAD, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /plan check failed/);
    });
  });
});

describe('06-C1 heading anchors keep the heading context', () => {
  it('06-C1: a heading with a code anchor still names the file for the prose anchors below it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plan-check-heading-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src/b.ts'), 'one\ntwo\nthree\n');
      const r = await checkPlan({ body: '## src/b.ts:2\nsee line 3\nsee line 9\n', repositoryRoot: root, acIds: [], find: async () => [] });
      assert.equal(r.anchors.checked, 3);
      assert.deepEqual(r.anchors.bad.map((anchor) => [anchor.path, anchor.line, anchor.reason]), [['src/b.ts', '9', 'line-out-of-range']]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
