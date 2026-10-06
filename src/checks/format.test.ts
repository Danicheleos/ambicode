import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkFixture, COMMAND_PACK, CHECK_CONFIG } from '../testing/check-fixture.ts';
import { runFormat } from './format.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

async function formatFixture(options: { slot?: string; action?: 'run' | 'propose' } = {}) {
  return checkFixture({
    config: CHECK_CONFIG.replace('format: { argv: [fmt] }', options.slot ?? 'format: { argv: [fmt] }'),
    pack: COMMAND_PACK.replace('{ command: format, action: run', `{ command: format, action: ${options.action ?? 'run'}`),
  });
}

const format = (env: Awaited<ReturnType<typeof checkFixture>>, paths: string[] = []) => runFormat(env.deps(), { task: 'ord-7', paths });

describe('format (07-F)', () => {
  it('07-F2 a null slot records unconfigured with exit null', async () => {
    const env = await formatFixture({ slot: 'format: null' });
    try {
      await env.start();
      await env.fx.repo.write('src/b.ts', 'x\n');
      const [entry] = await format(env);
      assert.deepEqual([entry?.key, entry?.outcome, entry?.exit, entry?.via, entry?.files], ['app/format', 'unconfigured', null, 'model', []]);
      assert.deepEqual(env.runner.calls, []);
    } finally {
      await env.fx.dispose();
    }
  });

  it('07-F1/07-F3 the touched files are appended to an argv without {files}; files lists only those whose bytes changed', async () => {
    const env = await formatFixture();
    try {
      await env.start();
      await env.fx.repo.write('src/b.ts', 'x\n');
      await env.fx.repo.write('src/c.ts', 'y\n');
      env.runner.out = { exitCode: 0 };
      env.runner.effect = async (request) => writeFile(path.join(request.cwd, 'src/b.ts'), 'x;\n');
      const [entry] = await format(env);
      assert.deepEqual(env.runner.calls, [['fmt', 'src/b.ts', 'src/c.ts']]);
      assert.deepEqual([entry?.outcome, entry?.exit, entry?.files], ['formatted', 0, ['src/b.ts']]);
      assert.equal(typeof (await env.fx.kinds('ord-7', 'format'))[0]?.['route'], 'string');
    } finally {
      await env.fx.dispose();
    }
  });

  it('07-F1 paths narrow the touched set', async () => {
    const env = await formatFixture();
    try {
      await env.fx.repo.write('src/b.ts', 'x\n');
      await env.fx.repo.write('lib/c.ts', 'y\n');
      await format(env, ['lib']);
      assert.deepEqual(env.runner.calls, [['fmt', 'lib/c.ts']]);
    } finally {
      await env.fx.dispose();
    }
  });

  it('07-F2 a nonzero exit records failed', async () => {
    const env = await formatFixture();
    try {
      await env.fx.repo.write('src/b.ts', 'x\n');
      env.runner.out = { exitCode: 2 };
      assert.deepEqual((await format(env)).map((entry) => [entry.outcome, entry.exit]), [['failed', 2]]);
    } finally {
      await env.fx.dispose();
    }
  });

  it('07-F2 propose raises check-only-unauthorized under <projectId>/format and runs nothing', async () => {
    const env = await formatFixture({ action: 'propose' });
    try {
      await env.start();
      await env.fx.repo.write('src/b.ts', 'x\n');
      assert.deepEqual(await format(env), []);
      const [gate] = await env.fx.kinds('ord-7', 'gate');
      assert.deepEqual(gate?.['values'], { key: ['app/format'], files: ['src/b.ts'] });
      assert.deepEqual(env.runner.calls, []);
    } finally {
      await env.fx.dispose();
    }
  });

  it('07-F3 no route handler or engine module calls runFormat', async () => {
    for (const name of await readdir(path.join(ROOT, 'src', 'route'))) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      assert.doesNotMatch(await readFile(path.join(ROOT, 'src', 'route', name), 'utf8'), /runFormat|checks\/format/, name);
    }
    assert.doesNotMatch(await readFile(path.join(ROOT, 'src', 'task', 'task-route.ts'), 'utf8'), /runFormat|checks\/format/);
  });
});
