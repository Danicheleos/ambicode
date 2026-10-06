import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '../composition/root.ts';
import { parseArgs } from '../cli/args.ts';
import { REVIEW_OPTIONS, runReviewEstimate } from '../cli/commands/review.ts';
import { CHECK_CONFIG, COMMAND_PACK } from '../testing/check-fixture.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { taskFixture } from '../testing/task-fixture.ts';
import { MAX_ESTIMATE_BYTES, renderEstimate, type ReviewEstimate } from './estimate.ts';

const MAP = '{ kind: mapping, mappings: [{ source: ["src/a.ts"], tests: ["src/a.spec.ts"] }] }';
const MAPPED = CHECK_CONFIG
  .replace('unit: { command: unit, adapter: jest }', `unit: { command: unit, adapter: jest, selector: ${MAP} }`)
  .replace('e2e: { command: e2e, adapter: playwright }', `e2e: { command: e2e, adapter: playwright, selector: ${MAP} }`);
const ESTIMATE = parseArgs('review', ['--estimate'], REVIEW_OPTIONS);

async function listing(root: string): Promise<string[]> {
  const dir = path.join(root, '.ambicode');
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.map((entry) => path.join(entry.parentPath, entry.name)).sort();
}

async function withRepo(
  body: (repo: TempRepo) => Promise<void>,
  options: { config?: string; pack?: string; extra?: Record<string, string> } = {},
): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('package.json', '{}\n');
    await repo.write('.ambicode/config.yaml', options.config ?? CHECK_CONFIG);
    await repo.write('.ambicode/policies/cmds.yaml', options.pack ?? COMMAND_PACK);
    await repo.write('src/a.ts', 'export const a = 1;\n');
    await repo.write('src/a.spec.ts', 'test\n');
    for (const [file, text] of Object.entries(options.extra ?? {})) await repo.write(file, text);
    await repo.commitAll('initial');
    await repo.write('src/a.ts', 'export const a = 2;\n');
    await body(repo);
  } finally {
    await repo.dispose();
  }
}

const estimateOf = async (repo: TempRepo, argv = ['--estimate']) =>
  (await runReviewEstimate(await createRuntime({ cwd: repo.root }), parseArgs('review', argv, REVIEW_OPTIONS))).estimate;

describe('review estimate (07-E)', () => {
  it('07-E1: the estimate writes nothing under .ambicode (no ledger, snapshot or review directory)', async () => {
    await withRepo(async (repo) => {
      const before = await listing(repo.root);
      const out = await runReviewEstimate(await createRuntime({ cwd: repo.root }), ESTIMATE);
      assert.equal(out.command, 'review --estimate');
      assert.deepEqual(await listing(repo.root), before);
      assert.ok(!before.some((entry) => /reviews|snapshot|ledger/.test(entry)));
    });
  });

  it('07-E1: input-too-large becomes a refusal with no throw and no snapshot plan', async () => {
    await withRepo(async (repo) => {
      await repo.write('src/b.ts', 'export const b = 2;\n');
      const estimate = await estimateOf(repo);
      assert.equal(estimate.refusal?.code, 'input-too-large');
      assert.deepEqual(estimate.refusal?.suggestions, []);
      assert.ok((estimate.refusal?.message.length ?? 0) > 0);
      assert.equal(estimate.snapshotBytes, null);
      assert.match(renderEstimate(estimate), /refused before the snapshot: input-too-large/);
    }, { config: CHECK_CONFIG.replace('maxChangedFiles: 50', 'maxChangedFiles: 1') });
  });

  it('07-E1: snapshot-too-large becomes a refusal with no throw', async () => {
    const big = `export const big = "${'x'.repeat(300_000)}";\n`;
    await withRepo(async (repo) => {
      await repo.write('src/big.ts', big);
      const estimate = await estimateOf(repo);
      assert.equal(estimate.refusal?.code, 'snapshot-too-large');
      assert.deepEqual(estimate.refusal?.suggestions, []);
    }, { config: CHECK_CONFIG.replace('maxContextBytes: 524288', 'maxContextBytes: 20000000') });
  });

  it('07-E2: each check carries its decision: run, waiting, forbid; waitingKeys lists the waiting ones', async () => {
    await withRepo(async (repo) => {
      const estimate = await estimateOf(repo);
      const by = Object.fromEntries(estimate.checks.map((check) => [check.key, check.decision]));
      assert.equal(by['app/unit'], 'run');
      assert.equal(by['app/e2e'], 'waiting');
      assert.equal(by['app/lint'], 'forbid');
      assert.deepEqual(estimate.waitingKeys, ['app/e2e']);
      assert.match(estimate.checks.find((check) => check.key === 'app/lint')?.reason ?? '', /forbidden.*never here/);
      assert.equal(estimate.files, 1);
      assert.equal(estimate.target, 'working tree');
      assert.ok(estimate.changedLines >= 2);
      assert.ok((estimate.snapshotBytes ?? 0) > 0);
    }, { config: MAPPED });
  });

  it('07-E2: a check with no selected file is skip with the limitation as the reason', async () => {
    await withRepo(async (repo) => {
      await repo.write('src/a.ts', 'export const a = 3;\n');
      const estimate = await estimateOf(repo, ['--estimate', '--only', 'src/a.ts']);
      const skipped = estimate.checks.filter((check) => check.decision === 'skip');
      assert.ok(skipped.length > 0);
      for (const check of skipped) assert.ok(check.reason !== null && check.reason.length > 0, check.key);
    });
  });

  it('07-E2: a related-selector test check is unknown ("selected at review time") and runs nothing', async () => {
    const config = CHECK_CONFIG.replace('unit: { command: unit, adapter: jest }', 'unit: { command: unit, adapter: jest, selector: { kind: related } }');
    await withRepo(async (repo) => {
      const estimate = await estimateOf(repo);
      const unit = estimate.checks.find((check) => check.key === 'app/unit');
      assert.equal(unit?.decision, 'unknown');
      assert.match(unit?.reason ?? '', /^selected at review time/);
    }, { config });
  });

  it('07-E2: a related check whose command needs approval says so in the unknown reason', async () => {
    const config = CHECK_CONFIG.replace('e2e: { command: e2e, adapter: playwright }', 'e2e: { command: e2e, adapter: playwright, selector: { kind: related } }');
    await withRepo(async (repo) => {
      const e2e = (await estimateOf(repo)).checks.find((check) => check.key === 'app/e2e');
      assert.equal(e2e?.decision, 'unknown');
      assert.match(e2e?.reason ?? '', /needs approval if a test is selected/);
    }, { config });
  });

  it('07-E2: a mapping selector with no matching change is computed statically and skips with a reason', async () => {
    const mapping = 'unit: { command: unit, adapter: jest, selector: { kind: mapping, mappings: [{ source: ["lib/**/*.ts"], tests: ["lib/**/*.spec.ts"] }] } }';
    const config = CHECK_CONFIG.replace('unit: { command: unit, adapter: jest }', mapping);
    await withRepo(async (repo) => {
      const unit = (await estimateOf(repo)).checks.find((check) => check.key === 'app/unit');
      assert.equal(unit?.decision, 'skip');
      assert.ok((unit?.reason ?? '').length > 0);
    }, { config });
  });

  it('07-E2: a declined key is skip with reason declined and leaves waitingKeys', async () => {
    await withRepo(async (repo) => {
      const estimate = await estimateOf(repo, ['--estimate', '--decline', 'app/e2e']);
      const e2e = estimate.checks.find((check) => check.key === 'app/e2e');
      assert.deepEqual([e2e?.decision, e2e?.reason], ['skip', 'declined']);
      assert.deepEqual(estimate.waitingKeys, []);
    }, { config: MAPPED });
  });

  it('07-E2: a test check with no selector is skip with the no-selector limitation as reason', async () => {
    await withRepo(async (repo) => {
      const unit = (await estimateOf(repo)).checks.find((check) => check.key === 'app/unit');
      assert.deepEqual([unit?.decision, unit?.reason], ['skip', 'This check has no selector, so AMBICODE cannot decide which tests it would run.']);
    });
  });

  it('07-E3: renderEstimate prints "history: no history" and history is null in this step', async () => {
    await withRepo(async (repo) => {
      const estimate = await estimateOf(repo);
      assert.equal(estimate.history, null);
      assert.match(renderEstimate(estimate), /^history: no history$/m);
    });
  });

  it('07-E3: with 50 checks the output stays within 2,048 bytes and ends the list with (+N more)', () => {
    const checks: ReviewEstimate['checks'] = Array.from({ length: 50 }, (_, i) => ({ key: `project-${i}/check-${i}`, decision: 'skip', reason: 'no changed file is in scope '.repeat(8) }));
    const estimate: ReviewEstimate = { target: 'working tree', files: 3, changedLines: 40, checks, waitingKeys: [], snapshotBytes: 1000, history: null, refusal: null };
    const text = renderEstimate(estimate);
    assert.ok(Buffer.byteLength(text) <= MAX_ESTIMATE_BYTES);
    assert.equal(MAX_ESTIMATE_BYTES, 2048);
    const shown = text.split('\n').filter((line) => line.startsWith('  project-')).length;
    assert.match(text, new RegExp(`\\(\\+${50 - shown} more\\)`));
    assert.ok(shown < 50 && shown > 0);
    assert.match(text, /history: no history/);
  });

  it('07-E3: a short estimate lists every check and no (+N more)', () => {
    const estimate: ReviewEstimate = { target: 'working tree', files: 1, changedLines: 2, checks: [{ key: 'app/unit', decision: 'run', reason: null }], waitingKeys: [], snapshotBytes: 10, history: null, refusal: null };
    const text = renderEstimate(estimate);
    assert.match(text, /app\/unit run/);
    assert.doesNotMatch(text, /more\)/);
  });

  it('07-E4: the review-offer question carries the rendered estimate with history: no history', async () => {
    const t = await taskFixture();
    try {
      await t.start();
      await t.check('red', { ran: 1, failed: 1 });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.format();
      const print = (await t.kinds('gate')).findLast((entry) => entry['gate'] === 'review-offer');
      const question = String((print?.['question'] ?? (print?.['values'] as { question?: unknown } | undefined)?.question) ?? '');
      assert.match(question, /Review estimate:/);
      assert.match(question, /history: no history/);
    } finally {
      await t.fx.dispose();
    }
  });
});
