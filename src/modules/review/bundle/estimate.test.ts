import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { parseArgs } from '#util/args';
import { runReviewEstimate, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { CHECK_CONFIG, COMMAND_PACK } from '#testing/fixtures/check-fixture';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { reviewResult } from '#testing/fixtures/review-fixture';
import { AmbicodeError } from '#util/errors';
import { MAX_ESTIMATE_BYTES, parseNarrow, refusalSuggestions, renderEstimate } from './estimate.ts';
import { narrowingInForce, reviewCommand } from '#skills/review/handlers';
import { nodeFileSystem } from '#platform/ports/filesystem';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { FileSystem, ProcessRunner } from '#types/platform/ports';
import type { ReviewEstimate } from '#types/modules/review';

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
      assert.deepEqual([...(estimate.refusal?.suggestions ?? [])].sort(), ['--exclude "src/a.ts"', '--exclude "src/b.ts"']);
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
      assert.deepEqual(estimate.refusal?.suggestions, ['--exclude "src/big.ts"']);
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

  it('07-E3: with 50 checks the output stays within 2,048 bytes and ends the list with … N more (08-E5)', () => {
    const checks: ReviewEstimate['checks'] = Array.from({ length: 50 }, (_, i) => ({ key: `project-${i}/check-${i}`, decision: 'skip', reason: 'no changed file is in scope '.repeat(8) }));
    const estimate: ReviewEstimate = { target: 'working tree', files: 3, changedLines: 40, checks, waitingKeys: [], snapshotBytes: 1000, refusal: null };
    const text = renderEstimate(estimate);
    assert.ok(Buffer.byteLength(text) <= MAX_ESTIMATE_BYTES);
    assert.equal(MAX_ESTIMATE_BYTES, 2048);
    const shown = text.split('\n').filter((line) => line.startsWith('  project-')).length;
    assert.match(text, new RegExp(`… ${50 - shown} more`));
    assert.ok(shown < 50 && shown > 0);
  });

  it('07-E3: a short estimate lists every check and no (+N more)', () => {
    const estimate: ReviewEstimate = { target: 'working tree', files: 1, changedLines: 2, checks: [{ key: 'app/unit', decision: 'run', reason: null }], waitingKeys: [], snapshotBytes: 10, refusal: null };
    const text = renderEstimate(estimate);
    assert.match(text, /app\/unit run/);
    assert.doesNotMatch(text, /more/);
  });

  it('07-E4: the review-offer question carries the rendered estimate', async () => {
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
    } finally {
      await t.fx.dispose();
    }
  });
});

const WRITERS = ['writeText', 'createExclusive', 'appendText', 'rename', 'mkdirp', 'remove', 'copyFile'];
// Scratch space outside the repository (git's temporary index) is allowed; anything inside it is not.

describe('review estimate (08-E)', () => {
  it('08-E1: the estimate calls no filesystem write and no process other than git', async () => {
    await withRepo(async (repo) => {
      const fs = new Proxy(nodeFileSystem, {
        get: (target, key: string) => {
          const original = (target as never)[key] as (...args: unknown[]) => unknown;
          if (!WRITERS.includes(key)) return original;
          return (...args: unknown[]) => {
            if (typeof args[0] === 'string' && args[0].startsWith(repo.root)) throw new Error(`estimate wrote: ${key} ${args[0]}`);
            return original.apply(target, args);
          };
        },
      }) as FileSystem;
      const runner: ProcessRunner = { run: async (request) => {
        if (request.argv[0] !== 'git') throw new Error(`estimate ran: ${request.argv.join(' ')}`);
        return repo.runner.run(request);
      } };
      const runtime: Runtime = { ...(await createRuntime({ cwd: repo.root })), fs, runner };
      const out = await runReviewEstimate(runtime, ESTIMATE);
      assert.equal(out.estimate.refusal, null);
    }, { config: MAPPED });
  });

  const decisions: [string, string, string][] = [
    ['allowed with a selected file', 'app/unit', 'run'],
    ['propose without acceptance', 'app/e2e', 'waiting'],
    ['forbidden command', 'app/lint', 'forbid'],
  ];
  for (const [name, key, decision] of decisions) {
    it(`08-E2: ${name} is ${decision}`, async () => {
      await withRepo(async (repo) => {
        const check = (await estimateOf(repo)).checks.find((entry) => entry.key === key);
        assert.equal(check?.decision, decision);
        assert.equal(check?.reason === null, decision === 'run');
      }, { config: MAPPED });
    });
  }

  it('08-E3: both refusals return with suggestions and do not throw', async () => {
    await withRepo(async (repo) => {
      await repo.write('src/b.ts', 'export const b = 2;\n');
      const estimate = await estimateOf(repo);
      assert.equal(estimate.refusal?.code, 'input-too-large');
      assert.ok((estimate.refusal?.suggestions ?? []).every((line) => /^--(exclude|only) "/.test(line)));
      assert.match(renderEstimate(estimate), /--exclude "src\/b\.ts"/);
    }, { config: CHECK_CONFIG.replace('maxChangedFiles: 50', 'maxChangedFiles: 1') });
    await withRepo(async (repo) => {
      await repo.write('src/big.ts', `export const big = "${'x'.repeat(300_000)}";\n`);
      const estimate = await estimateOf(repo);
      assert.equal(estimate.refusal?.code, 'snapshot-too-large');
      assert.equal(estimate.snapshotBytes, null);
      assert.deepEqual(estimate.refusal?.suggestions, ['--exclude "src/big.ts"']);
    }, { config: CHECK_CONFIG.replace('maxContextBytes: 524288', 'maxContextBytes: 20000000') });
  });

  it('08-E3: refusalSuggestions for input-too-large: top 3 by changed lines, --only per 2-3 top directories', () => {
    const file = (name: string, lines: number) => ({ oldPath: name, newPath: name, addedLines: lines, removedLines: 0 }) as never;
    const files = [file('a/x.ts', 1), file('b/y.ts', 9), file('b/z.ts', 5), file('c/w.ts', 7), file('root.ts', 3)];
    const out = refusalSuggestions(new AmbicodeError('input-too-large', 'big'), files);
    assert.deepEqual(out, ['--exclude "b/y.ts"', '--exclude "c/w.ts"', '--exclude "b/z.ts"', '--only "a/**"', '--only "b/**"', '--only "c/**"']);
    const four = [...files, file('d/q.ts', 1)];
    assert.deepEqual(refusalSuggestions(new AmbicodeError('input-too-large', 'big'), four).filter((line) => line.startsWith('--only')), []);
  });

  it('08-E5: 200 files x 30 checks renders within 2,048 bytes with "… N more"', () => {
    const checks: ReviewEstimate['checks'] = Array.from({ length: 30 }, (_, i) => ({ key: `p${i}/check`, decision: 'waiting', reason: 'needs approval from the team policy' }));
    const estimate: ReviewEstimate = { target: 'working tree', files: 200, changedLines: 4000, checks, waitingKeys: checks.map((check) => check.key), snapshotBytes: 400_000, refusal: null };
    const text = renderEstimate(estimate);
    assert.ok(Buffer.byteLength(text) <= 2048);
    assert.match(text, /… \d+ more/);
    assert.match(text, /200 file\(s\)/);
  });

  it('08-E5: the --json payload carries command, text and the full ReviewEstimate shape', async () => {
    await withRepo(async (repo) => {
      const out = await runReviewEstimate(await createRuntime({ cwd: repo.root }), ESTIMATE);
      assert.deepEqual(Object.keys(out).sort(), ['command', 'estimate', 'text']);
      assert.deepEqual(Object.keys(out.estimate).sort(), ['changedLines', 'checks', 'files', 'refusal', 'snapshotBytes', 'target', 'waitingKeys']);
      assert.equal(out.text, renderEstimate(out.estimate));
    });
  });

  describe('narrowing', () => {
    it('08-E6: parseNarrow accepts --only/--exclude pairs, quoted globs included', () => {
      assert.deepEqual(parseNarrow(`--only "src/**" --exclude 'a b/*.ts' --only x`), { onlyPaths: ['src/**', 'x'], excludePaths: ['a b/*.ts'] });
    });

    for (const bad of ['', 'src/**', '--only', '--only --exclude x', '--include x', '--only a b', '--only a --exclude']) {
      it(`08-E6: parseNarrow refuses ${JSON.stringify(bad)} with bad-argument on narrow`, () => {
        assert.throws(() => parseNarrow(bad), (error: unknown) => error instanceof AmbicodeError && error.code === 'bad-argument' && error.field === 'narrow');
      });
    }

    const revise = (id: string, narrow: string, from = 'estimate-step'): LedgerEntry => ({ id, at: 'x', kind: 'revise', from, args: { narrow: [narrow] } });

    it('08-E6: narrowingInForce takes the latest valid estimate-step revise; narrow, bad tokens and other steps keep the previous', () => {
      assert.equal(narrowingInForce([]), null);
      assert.equal(narrowingInForce([revise('1', '--only a'), revise('2', '--exclude b')]), '--exclude b');
      assert.equal(narrowingInForce([revise('1', '--only a'), revise('2', 'narrow'), revise('3', 'garbage'), revise('4', '--only z', 'other')]), '--only a');
      assert.equal(narrowingInForce([revise('1', 'narrow'), revise('2', 'junk')]), null);
    });

    it('08-R5: reviewCommand orders task, target, then quoted narrowing, and carries no --approve', () => {
      const args = { text: '', requirements: [], project: null, plan: null, fromDraft: null, answers: [], headless: false, hasRequirement: false, hash: 'h', target: { branch: true, base: "ma'in", mr: null } };
      const chain = [revise('1', `--only "src/**" --exclude x`)];
      assert.equal(reviewCommand('t1', args, chain), `review --task t1 --branch --base 'ma'\\''in' --only 'src/**' --exclude 'x'`);
      assert.equal(reviewCommand('t1', { ...args, target: { branch: false, base: null, mr: 'https://h/mr/1' } }, []), `review --task t1 --mr 'https://h/mr/1'`);
      assert.equal(reviewCommand('t1', { ...args, target: undefined }, []), 'review --task t1');
    });
  });
});
