import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { createRuntime } from '#composition/root';
import { captureBaseline, touchedSet } from './baseline.ts';

async function setup(t: { after(fn: () => unknown): void }, commit = true) {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());
  if (commit) {
    await repo.write('a.ts', 'a\n');
    await repo.write('b.ts', 'b\n');
    await repo.write('c.ts', 'c\n');
    await repo.commitAll('init');
  }
  const runtime = await createRuntime({ cwd: repo.root });
  return { repo, runtime };
}

test('07-B1: a clean repository has no dirty paths and the HEAD sha', async (t) => {
  const { repo, runtime } = await setup(t);
  const baseline = await captureBaseline(runtime);
  assert.deepEqual(baseline.dirty, []);
  assert.equal(baseline.head, await repo.git.revParse('HEAD'));
});

test('07-B1: modified and untracked files are listed with hashes', async (t) => {
  const { repo, runtime } = await setup(t);
  await repo.write('a.ts', 'changed\n');
  await repo.write('new/n.ts', 'n\n');
  const { dirty } = await captureBaseline(runtime);
  assert.deepEqual(dirty.map((entry) => entry.path), ['a.ts', 'new/n.ts']);
  assert.ok(dirty.every((entry) => typeof entry.hash === 'string' && entry.hash !== ''));
  assert.notEqual(dirty[0]?.hash, dirty[1]?.hash);
});

test('07-B1: a deleted tracked file has a null hash', async (t) => {
  const { repo, runtime } = await setup(t);
  await rm(path.join(repo.root, 'b.ts'));
  const { dirty } = await captureBaseline(runtime);
  assert.deepEqual(dirty, [{ path: 'b.ts', hash: null }]);
});

test('07-B1: a rename lists both sides as separate paths', async (t) => {
  const { repo, runtime } = await setup(t);
  await repo.run(['git', 'mv', 'a.ts', 'renamed.ts']);
  const { dirty } = await captureBaseline(runtime);
  assert.deepEqual(dirty.map((entry) => entry.path), ['a.ts', 'renamed.ts']);
  assert.equal(dirty[0]?.hash, null);
});

test('07-B1: an unborn branch has a null head', async (t) => {
  const { repo, runtime } = await setup(t, false);
  await repo.write('x.ts', 'x\n');
  const baseline = await captureBaseline(runtime);
  assert.equal(baseline.head, null);
  assert.deepEqual(baseline.dirty.map((entry) => entry.path), ['x.ts']);
});

test('07-B2: an unrelated pre-existing dirty file is excluded and listed as preexisting', async (t) => {
  const { repo, runtime } = await setup(t);
  await repo.write('a.ts', 'dirty\n');
  const baseline = await captureBaseline(runtime);
  await repo.write('b.ts', 'task edit\n');
  const result = await touchedSet(runtime, baseline);
  assert.deepEqual(result, { touched: ['b.ts'], preexisting: ['a.ts'], headMoved: false });
});

test('07-B2: a pre-existing dirty file edited after the baseline is touched', async (t) => {
  const { repo, runtime } = await setup(t);
  await repo.write('a.ts', 'dirty\n');
  const baseline = await captureBaseline(runtime);
  await repo.write('a.ts', 'dirty and edited\n');
  const result = await touchedSet(runtime, baseline);
  assert.deepEqual(result.touched, ['a.ts']);
  assert.deepEqual(result.preexisting, []);
});

test('07-B2: a file created after the baseline is touched', async (t) => {
  const { repo, runtime } = await setup(t);
  const baseline = await captureBaseline(runtime);
  await repo.write('created.ts', 'x\n');
  assert.deepEqual((await touchedSet(runtime, baseline)).touched, ['created.ts']);
});

test('07-B2: a baseline-dirty file reverted to HEAD content is touched', async (t) => {
  const { repo, runtime } = await setup(t);
  await repo.write('a.ts', 'dirty\n');
  const baseline = await captureBaseline(runtime);
  await repo.write('a.ts', 'a\n');
  const result = await touchedSet(runtime, baseline);
  assert.deepEqual(result.touched, ['a.ts']);
  assert.deepEqual(result.preexisting, []);
});

test('07-B2: a commit after the baseline moves HEAD, an unchanged HEAD does not', async (t) => {
  const { repo, runtime } = await setup(t);
  const baseline = await captureBaseline(runtime);
  assert.equal((await touchedSet(runtime, baseline)).headMoved, false);
  await repo.write('a.ts', 'next\n');
  await repo.commitAll('next');
  assert.equal((await touchedSet(runtime, baseline)).headMoved, true);
});

test('07-B2: an unborn branch that stays unborn has not moved', async (t) => {
  const { repo, runtime } = await setup(t, false);
  const baseline = await captureBaseline(runtime);
  await repo.write('x.ts', 'x\n');
  const result = await touchedSet(runtime, baseline);
  assert.equal(result.headMoved, false);
  assert.deepEqual(result.touched, ['x.ts']);
});
