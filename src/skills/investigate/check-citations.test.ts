import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string) {
  const taskDir = path.join(root, '.ambicode/task/t');
  await mkdir(path.join(taskDir, 'notes'), { recursive: true });
  await writeFile(path.join(taskDir, 'notes/investigation.md'), body);
  await writeFile(path.join(taskDir, 'ledger.jsonl'), `${JSON.stringify({ kind: 'note', note: 'investigation', path: '.ambicode/task/t/notes/investigation.md' })}\n`);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/investigate/scripts/check-citations.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'investigate', repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps'), args: {}, params: [], revise: null, raisedBy: null, headless: false }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { anchorsBad: number; anchors?: string[] } }[]; failed?: { code: string; revise: { args: Record<string, string[]> } } };
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
      assert.equal(bad.failed?.revise.args['Citation check failed']?.length, 3);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
