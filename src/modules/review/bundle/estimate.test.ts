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
import { AmbicodeError } from '#util/errors';
import { parseNarrow, refusalSuggestions, renderEstimate } from './estimate.ts';
import { narrowingInForce, reviewCommand } from '#skills/review/handlers';
import { nodeFileSystem } from '#platform/ports/filesystem';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { FileSystem, ProcessRunner } from '#types/platform/ports';

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
  it('07-E1: the estimate writes nothing under .ambicode (no ledger or review directory)', async () => {
    await withRepo(async (repo) => {
      const before = await listing(repo.root);
      const out = await runReviewEstimate(await createRuntime({ cwd: repo.root }), ESTIMATE);
      assert.equal(out.command, 'review --estimate');
      assert.deepEqual(await listing(repo.root), before);
      assert.ok(!before.some((entry) => /reviews|ledger/.test(entry)));
    });
  });

  it('07-E1: input-too-large becomes a refusal with no throw', async () => {
    await withRepo(async (repo) => {
      await repo.write('src/b.ts', 'export const b = 2;\n');
      const estimate = await estimateOf(repo);
      assert.equal(estimate.refusal?.code, 'input-too-large');
      assert.deepEqual([...(estimate.refusal?.suggestions ?? [])].sort(), ['--exclude "src/a.ts"', '--exclude "src/b.ts"']);
      assert.ok((estimate.refusal?.message.length ?? 0) > 0);
      assert.match(renderEstimate(estimate), /refused before the reviewer: input-too-large/);
    }, { config: CHECK_CONFIG.replace('maxChangedFiles: 50', 'maxChangedFiles: 1') });
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
  it('08-E1: the estimate writes no file and runs no process other than git', async () => {
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
    });
  });

  it('08-E3: refusalSuggestions for input-too-large: top 3 by changed lines, --only per 2-3 top directories', () => {
    const file = (name: string, lines: number) => ({ oldPath: name, newPath: name, addedLines: lines, removedLines: 0 }) as never;
    const files = [file('a/x.ts', 1), file('b/y.ts', 9), file('b/z.ts', 5), file('c/w.ts', 7), file('root.ts', 3)];
    const out = refusalSuggestions(files);
    assert.deepEqual(out, ['--exclude "b/y.ts"', '--exclude "c/w.ts"', '--exclude "b/z.ts"', '--only "a/**"', '--only "b/**"', '--only "c/**"']);
    const four = [...files, file('d/q.ts', 1)];
    assert.deepEqual(refusalSuggestions(four).filter((line) => line.startsWith('--only')), []);
  });

  it('08-E5: the --json payload carries command, text and the counts', async () => {
    await withRepo(async (repo) => {
      const out = await runReviewEstimate(await createRuntime({ cwd: repo.root }), ESTIMATE);
      assert.deepEqual(Object.keys(out).sort(), ['command', 'estimate', 'text']);
      assert.deepEqual(Object.keys(out.estimate).sort(), ['changedLines', 'files', 'refusal', 'target']);
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
