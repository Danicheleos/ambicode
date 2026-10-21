import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RouteFixture } from '#testing/fixtures/route-fixture';
import { checkFixture, CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import path from 'node:path';
import { runCheckOnly } from './check-command.ts';
import { AmbicodeError } from '#util/errors';
import { SESSION_A } from '#testing/fixtures/ids';

const code = (expected: string) => (error: unknown) => error instanceof AmbicodeError && error.code === expected;
const kinds = async (fx: RouteFixture, kind: string) => fx.kinds(CHECK_TASK, kind);

describe('check --name (07-C)', () => {
  it('07-C1 a missing --phase value, an unknown check and an unknown project refuse', async () => {
    const { fx, check } = await checkFixture();
    try {
      await assert.rejects(check({ phase: 'blue' as never }), code('bad-argument'));
      await assert.rejects(check({ name: 'nope' }), code('bad-argument'));
      await assert.rejects(check({ project: 'web' }), code('unknown-project'));
    } finally {
      await fx.dispose();
    }
  });

  it('an unknown check name lists every configured key and marks the ones with no command', async () => {
    const nulls = CHECK_CONFIG.replace('unit: { all: "jest", file: "jest {file}" }', 'unit: { all: null, file: null }').replace('lint: { all: "eslint .", file: "eslint {file}" }', 'lint: { all: null, file: null }');
    const { fx, check } = await checkFixture({ config: nulls });
    try {
      await assert.rejects(check({ name: 'pytest' }), (error: unknown) => {
        assert.ok(error instanceof AmbicodeError);
        assert.match(error.message, /configured: e2e, format, lint \(no command\), typecheck, unit \(no command\)\./);
        return true;
      });
    } finally {
      await fx.dispose();
    }
  });

  it('a check configured as bare null is listed as having no command', async () => {
    const bare = CHECK_CONFIG.replace('unit: { all: "jest", file: "jest {file}" }', 'unit: null');
    assert.notEqual(bare, CHECK_CONFIG);
    const { fx, check } = await checkFixture({ config: bare });
    try {
      await assert.rejects(check({ name: 'pytest' }), (error: unknown) => error instanceof AmbicodeError && /unit \(no command\)/.test(error.message));
      await assert.rejects(check({ name: 'unit' }), (error: unknown) => error instanceof AmbicodeError && /no `(all|file)` command/.test(error.message));
    } finally {
      await fx.dispose();
    }
  });

  it('a check with no `file` form refuses --file, and one with no `all` form refuses a whole run, naming what runs', async () => {
    const { fx, check } = await checkFixture();
    try {
      await assert.rejects(check({ name: 'e2e', files: [] }), (error: unknown) => {
        assert.ok(error instanceof AmbicodeError && error.code === 'bad-argument');
        assert.match(error.message, /check "e2e" has no `all` command/);
        return true;
      });
      await assert.rejects(check({ name: 'format', files: [] }), (error: unknown) => error instanceof AmbicodeError && /has no `all` command/.test(error.message));
      await assert.rejects(check({ name: 'typecheck' }), (error: unknown) => error instanceof AmbicodeError && /has no `file` command/.test(error.message));
    } finally {
      await fx.dispose();
    }
  });

  it('07-C3/07-C4/07-P3 a run appends one check entry with the exit code, output tail, files and route', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      const result = await check();
      assert.equal(result.outcome, 'ran');
      assert.deepEqual(runner.calls, [["jest 'src/a.spec.ts'"]]);
      const [entry] = await kinds(fx, 'check');
      assert.equal(entry?.['phase'], 'red');
      assert.equal(typeof entry?.['tail'], 'string');
      assert.deepEqual(entry?.['files'], ['src/a.spec.ts']);
      assert.equal(entry?.['key'], 'app/unit');
      assert.equal(typeof entry?.['route'], 'string');
      assert.equal(entry?.['session'], SESSION_A);
      assert.ok(result.outcome === 'ran' && result.proof.proven);
    } finally {
      await fx.dispose();
    }
  });

  it('--file resolves against the repository: a relative or absolute path inside runs as `src/a.spec.ts`; a path outside is refused', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      await check({ files: ['src/a.spec.ts'] });
      await check({ files: [path.join(fx.repo.root, 'src/a.spec.ts')] });
      assert.deepEqual(runner.calls, [["jest 'src/a.spec.ts'"], ["jest 'src/a.spec.ts'"]]);
      assert.deepEqual((await kinds(fx, 'check')).map((entry) => entry['files']), [['src/a.spec.ts'], ['src/a.spec.ts']]);
      await assert.rejects(check({ files: ['../elsewhere/x.test.js'] }), code('bad-argument'));
    } finally {
      await fx.dispose();
    }
  });

  it('--file typed from the shell directory above the repository names the repo file; a path that exists nowhere stays as typed', async () => {
    const { fx, start, deps, runner } = await checkFixture();
    try {
      await start();
      const above = { ...deps(), runtime: { ...deps().runtime, invokedFrom: path.dirname(fx.repo.root) } };
      const typed = path.join(path.basename(fx.repo.root), 'src', 'a.spec.ts');
      const run = (file: string) => runCheckOnly(above, { task: CHECK_TASK, name: 'unit', project: null, files: [file], phase: 'red', approve: [], decline: [] });
      await run(typed);
      await run('src/nope.spec.ts');
      assert.deepEqual(runner.calls[0], ["jest 'src/a.spec.ts'"]);
      assert.deepEqual((await kinds(fx, 'check'))[0]?.['files'], ['src/a.spec.ts']);
      assert.deepEqual(runner.calls[1], ["jest 'src/nope.spec.ts'"]);
    } finally {
      await fx.dispose();
    }
  });

  it('without --file the `all` command runs once the user approved it', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      assert.equal((await check({ files: [] })).outcome, 'waiting');
      const [print] = await kinds(fx, 'gate');
      await fx.engine.advance({ task: CHECK_TASK, cause: 'gate-hook', answers: [{ gate: 'check-only-unauthorized', option: 'approve', instance: print!.id }], scratchpadDir: fx.scratchpad });
      await check({ files: [] });
      assert.deepEqual(runner.calls, [['jest']]);
      assert.deepEqual((await kinds(fx, 'check'))[0]?.['files'], []);
    } finally {
      await fx.dispose();
    }
  });

  it('07-P3 a green with a non-zero exit appends the check, then limit green-unproven with its cause', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      runner.out = { exitCode: 1, stdout: 'Tests:       1 failed, 1 total\n' };
      const result = await check({ phase: 'green' });
      assert.ok(result.outcome === 'ran' && !result.proof.proven && result.proof.cause === 'nonzero-exit');
      const limits = await kinds(fx, 'limit');
      assert.deepEqual(limits.map((entry) => [entry['which'], entry['cause'], entry['step']]), [['green-unproven', 'nonzero-exit', 'red']]);
      assert.deepEqual([limits[0]?.['key'], limits[0]?.['files']], ['app/unit', ['src/a.spec.ts']]);
    } finally {
      await fx.dispose();
    }
  });

  it('07-C4 a timeout appends no check entry, only limit red-unproven not-run', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      runner.out = { kind: 'timed-out', exitCode: null };
      const result = await check();
      assert.equal(result.outcome, 'not-run');
      assert.equal((await kinds(fx, 'check')).length, 0);
      assert.deepEqual((await kinds(fx, 'limit')).map((entry) => [entry['which'], entry['cause']]), [['red-unproven', 'not-run']]);
    } finally {
      await fx.dispose();
    }
  });

  it('the entry keeps the last 40 output lines and a red that exits 0 is a gap', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      runner.out = { exitCode: 0, stdout: Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n') };
      const result = await check();
      assert.ok(result.outcome === 'ran' && !result.proof.proven && result.proof.cause === 'no-failure');
      const [entry] = await kinds(fx, 'check');
      const tail = String(entry?.['tail']).split('\n');
      assert.equal(tail.length, 40);
      assert.ok(tail.some((line) => line.startsWith('line 59')) && !tail.includes('line 0'));
    } finally {
      await fx.dispose();
    }
  });

  it('07-C5 the sixth run of a phase in one step refuses check-limit, records the limit once, and standalone has no limit', async () => {
    const { fx, start, check, runner, folder } = await checkFixture();
    try {
      await folder();
      for (let index = 0; index < 5; index += 1) await check();
      assert.equal((await kinds(fx, 'check')).length, 5, 'standalone runs are not limited');
      await start(); // a fresh route: its window holds none of the standalone entries
      runner.out = { exitCode: 0, stdout: 'Tests:       1 passed, 1 total\n' };
      for (let index = 0; index < 5; index += 1) await check({ phase: 'green' });
      await assert.rejects(check({ phase: 'green' }), code('check-limit'));
      await assert.rejects(check({ phase: 'green' }), code('check-limit'));
      assert.equal(runner.calls.length, 10);
      assert.deepEqual((await kinds(fx, 'limit')).map((entry) => [entry['which'], entry['count']]), [['check', 5]]);
    } finally {
      await fx.dispose();
    }
  });

  it('07-K1 forbid refuses check-only-unauthorized with a check-forbidden limit and raises no gate', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      await assert.rejects(check({ name: 'lint' }), code('check-only-unauthorized'));
      assert.deepEqual(runner.calls, []);
      assert.deepEqual((await kinds(fx, 'limit')).map((entry) => [entry['which'], entry['key']]), [['check-forbidden', 'app/lint']]);
      assert.equal((await kinds(fx, 'gate')).length, 0);
    } finally {
      await fx.dispose();
    }
  });

  it('07-K4 propose without consent raises check-only-unauthorized with key, files and raisedBy, and runs nothing', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      assert.deepEqual(await check({ name: 'e2e' }), { outcome: 'waiting', gate: 'check-only-unauthorized', key: 'app/e2e' });
      const [gate] = await kinds(fx, 'gate');
      assert.deepEqual(gate?.['values'], { key: ['app/e2e'], files: ['src/a.spec.ts'] });
      assert.equal(gate?.['raisedBy'], 'red');
      assert.match(String(gate?.['question']), /Run app\/e2e on src\/a\.spec\.ts\?$/);
      assert.deepEqual(runner.calls, []);
    } finally {
      await fx.dispose();
    }
  });

  it('raise: false reports waiting and prints no gate, so a code step raises it through the engine', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      assert.deepEqual(await check({ name: 'e2e', raise: false }), { outcome: 'waiting', gate: 'check-only-unauthorized', key: 'app/e2e' });
      assert.deepEqual(await kinds(fx, 'gate'), []);
      assert.deepEqual(runner.calls, []);
    } finally {
      await fx.dispose();
    }
  });

  for (const channel of ['hook', 'cli'] as const) {
    for (const headless of [false, true]) {
      it(`07-K3 a typed --approve on the ${channel} channel, ${headless ? 'headless' : 'interactive'}, records acting-needs-human and prints again`, async () => {
        const { fx, start, check, runner } = await checkFixture();
        try {
          await start(channel, headless);
          await check({ name: 'e2e' });
          assert.equal((await check({ name: 'e2e', approve: ['app/e2e'] })).outcome, 'waiting');
          const [declined] = await kinds(fx, 'declined');
          assert.equal(declined?.['reason'], 'acting-needs-human');
          assert.equal(declined?.['via'], 'flag');
          assert.equal(declined?.['key'], 'app/e2e');
          assert.equal(declined?.['instance'], (await kinds(fx, 'gate'))[0]?.id);
          assert.deepEqual((await kinds(fx, 'gate')).map((entry) => entry['print']), [1, 2]);
          assert.deepEqual(runner.calls, []);
        } finally {
          await fx.dispose();
        }
      });
    }
  }

  it('07-K2 an honoured bound hook answer runs the check and asks nothing again', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      await check({ name: 'e2e' });
      const [print] = await kinds(fx, 'gate');
      await fx.engine.advance({ task: CHECK_TASK, cause: 'gate-hook', answers: [{ gate: 'check-only-unauthorized', option: 'approve', instance: print!.id }], scratchpadDir: fx.scratchpad });
      runner.out = { exitCode: 1, stdout: '  1 failed\n  3 passed\n' };
      assert.equal((await check({ name: 'e2e' })).outcome, 'ran');
      assert.equal((await check({ name: 'e2e' })).outcome, 'ran');
      assert.equal((await kinds(fx, 'gate')).length, 1);
      assert.equal(runner.calls.length, 2);
    } finally {
      await fx.dispose();
    }
  });

  it('07-K2 a consumed trusted preanswer runs the check', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start('hook', true, { answers: [{ gate: 'check-only-unauthorized', option: 'approve' }] });
      assert.equal((await check({ name: 'e2e' })).outcome, 'waiting');
      await fx.engine.advance({ task: CHECK_TASK, cause: 'check', scratchpadDir: fx.scratchpad });
      assert.equal((await kinds(fx, 'acceptance')).at(-1)?.['via'], 'prompt');
      assert.equal((await check({ name: 'e2e' })).outcome, 'ran');
      assert.equal(runner.calls.length, 1);
    } finally {
      await fx.dispose();
    }
  });

  it('07-K4 a typed --decline declines without running, and the bound decline is not asked again', async () => {
    const { fx, start, check, runner } = await checkFixture();
    try {
      await start();
      await check({ name: 'e2e' });
      assert.deepEqual(await check({ name: 'e2e', decline: ['app/e2e'] }), { outcome: 'declined', key: 'app/e2e' });
      assert.deepEqual(await check({ name: 'e2e' }), { outcome: 'declined', key: 'app/e2e' });
      assert.equal((await kinds(fx, 'declined')).length, 1);
      assert.deepEqual(runner.calls, []);
    } finally {
      await fx.dispose();
    }
  });

  it('07-K5 standalone propose refuses and writes nothing; session null with an open route refuses session-unbound', async () => {
    const { fx, start, check, folder } = await checkFixture();
    try {
      await folder();
      await assert.rejects(check({ name: 'e2e' }), code('check-only-unauthorized'));
      assert.deepEqual(await fx.ledger(CHECK_TASK), []);
      await start();
      await assert.rejects(check({}, null), code('session-unbound'));
    } finally {
      await fx.dispose();
    }
  });
});
