import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string, cwd?: string, env?: Record<string, string>) {
  const taskDir = path.join(root, '.ambicode/tasks/t');
  await mkdir(path.join(taskDir, 'notes'), { recursive: true });
  await writeFile(path.join(taskDir, 'notes/investigation.md'), body);
  await writeFile(path.join(taskDir, 'ledger.jsonl'), `${JSON.stringify({ kind: 'note', note: 'investigation', path: '.ambicode/tasks/t/notes/investigation.md' })}\n`);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/investigate/scripts/check-citations.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited', ...(env === undefined ? {} : { overrides: env }) },
    stdin: JSON.stringify({ task: 't', skill: 'investigate', repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps'), args: {}, params: [], revise: null, raisedBy: null, headless: false, ...(cwd === undefined ? {} : { cwd }) }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { anchorsBad: number; anchors?: string[]; resolved?: string[] } }[]; failed?: { code: string; message: string; revise?: unknown } };
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

  it('a bare name or partial path that is the tail of exactly one file is rewritten in the note to the full path and counted valid', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const note = '.ambicode/tasks/t/notes/investigation.md';
      const out = await check(root, 'Totals (monthly.ts:1), rounding (invoices/service.ts:3-5), full (src/users/service.ts:2).\n');
      assert.equal(out.failed, undefined);
      assert.deepEqual(out.entries[0]!.summary, { failed: false, anchorsBad: 0, resolved: ['monthly.ts → src/reports/monthly.ts', 'invoices/service.ts → src/invoices/service.ts'] });
      assert.equal(await readFile(path.join(root, note), 'utf8'), 'Totals (src/reports/monthly.ts:1), rounding (src/invoices/service.ts:3-5), full (src/users/service.ts:2).\n');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('an ambiguous bare name, a unique name with a line past the end and an already-full path stay as they were', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const note = '.ambicode/tasks/t/notes/investigation.md';
      const body = 'model.ts:1 and monthly.ts:900 and src/invoices/service.ts:3.\n';
      const out = await check(root, body);
      assert.deepEqual(out.entries[0]!.summary, { failed: true, anchorsBad: 2, anchors: ['model.ts:1 missing-file', 'monthly.ts:900 line-out-of-range (file has 2 lines)'] });
      assert.equal(await readFile(path.join(root, note), 'utf8'), body, 'a failing citation is not rewritten');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('with git unavailable the directory walk resolves a unique name and skips .git, node_modules and .ambicode', async () => {
    const root = await materialized('ts-feature-boundary');
    const noGit = path.join(path.dirname(root), 'empty-bin');
    try {
      await mkdir(noGit);
      for (const dir of ['node_modules/pkg', '.git/objects', '.ambicode/tasks/other']) await mkdir(path.join(root, dir), { recursive: true });
      for (const file of ['src/untracked-only.ts', 'node_modules/pkg/in-modules.ts', '.git/objects/in-git.ts', '.ambicode/tasks/other/in-ambicode.ts']) await writeFile(path.join(root, file), 'x\n');
      const out = await check(root, 'untracked-only.ts:1 monthly.ts:1 in-modules.ts:1 in-git.ts:1 in-ambicode.ts:1\n', undefined, { PATH: noGit });
      assert.deepEqual(out.entries[0]!.summary, {
        failed: true,
        anchorsBad: 3,
        anchors: ['in-modules.ts:1 missing-file', 'in-git.ts:1 missing-file', 'in-ambicode.ts:1 missing-file'],
        resolved: ['untracked-only.ts → src/untracked-only.ts', 'monthly.ts → src/reports/monthly.ts'],
      });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
