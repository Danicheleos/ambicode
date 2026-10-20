import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string, cwd?: string) {
  const taskDir = path.join(root, '.ambicode/tasks/t');
  await mkdir(path.join(taskDir, 'notes'), { recursive: true });
  await writeFile(path.join(taskDir, 'notes/investigation.md'), body);
  await writeFile(path.join(taskDir, 'ledger.jsonl'), `${JSON.stringify({ kind: 'note', note: 'investigation', path: '.ambicode/tasks/t/notes/investigation.md' })}\n`);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/investigate/scripts/check-citations.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'investigate', repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps'), args: {}, params: [], revise: null, raisedBy: null, headless: false, ...(cwd === undefined ? {} : { cwd }) }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { anchorsBad: number; anchors?: string[] } }[]; failed?: { code: string; message: string; revise?: unknown } };
}

describe('skills/investigate/scripts/check-citations.mjs', () => {
  it('accepts citations that exist and ignores fenced code; fails listing a missing file, a line past the end and an escape', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const good = await check(root, '## Facts\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.equal(good.failed, undefined);
      assert.equal(good.entries[0]!.summary.anchorsBad, 0);
      const bad = await check(root, '`src/invoices/service.ts:900` `src/nope.ts:1` `../outside.ts:1`\n\n```\nsrc/ignored.ts:1\n```\n');
      assert.equal(bad.failed?.code, 'citations-failed');
      assert.equal(bad.entries[0]!.summary.anchorsBad, 3);
      assert.match(bad.failed!.message, /^3 bad citations: src\/invoices\/service\.ts:900 line-out-of-range.*src\/nope\.ts:1 missing-file.*\.\.\/outside\.ts:1 outside-repository$/);
      assert.equal(bad.failed?.revise, undefined);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bare file name is checked from the repository root: missing-file even when the note cites the file in full', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const bare = await check(root, 'Total (src/invoices/service.ts:3-5), throws (service.ts:4).\n');
      assert.equal(bare.failed?.code, 'citations-failed');
      assert.deepEqual(bare.entries[0]!.summary, { failed: true, anchorsBad: 1, anchors: ['service.ts:4 missing-file'] });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a path relative to the session directory, whose repository is a child of it, is valid and counted against the repository file', async () => {
    const root = await materialized('ts-feature-boundary');
    const session = path.dirname(root);
    const name = path.basename(root);
    try {
      const rebased = await check(root, `Total (${name}/src/invoices/service.ts:3-5), windows form (${name}\\src\\invoices\\service.ts:3).\n`, session);
      assert.equal(rebased.failed, undefined);
      assert.equal(rebased.entries[0]!.summary.anchorsBad, 0);
      const bad = await check(root, `${name}/src/invoices/service.ts:900 ${name}/src/nope.ts:1 ${name}/../outside.ts:1\n`, session);
      assert.equal(bad.entries[0]!.summary.anchorsBad, 3);
      assert.match(bad.failed!.message, /service\.ts:900 line-out-of-range.*nope\.ts:1 missing-file.*outside\.ts:1 outside-repository/);
      const without = await check(root, `${name}/src/invoices/service.ts:3\n`);
      assert.equal(without.entries[0]!.summary.anchorsBad, 1, 'with no session directory the old reading stands');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
