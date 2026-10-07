// Regression assertions moved intact from the approved harness suite.
import { describe, it, before, after } from 'node:test';
import { parseTicket, codeRoot, generate, localizeHardness, changedLines, reviewSubstance, defectThreads, SELECT, ticketOverlap, DUPLICATE_TICKET_OVERLAP, rankLocalize } from './bench-cases.mjs';
import { ticket, CHANGE, frontmatter, syntheticBenchmarks, tally, syntheticPlugin } from '../testing/bench-test-fixtures.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { CASES_LOCK, casesLockStatus, CURATED_EVAL_DIR, WITH_PROMPT, GENERATION_MARKER, main, SWAP_MARKER, planRun } from '../harness/evals-bench.mjs';
import { execFileSync } from 'node:child_process';

describe('evals-bench: tickets', () => {
  it('takes the ticket text and the true paths, and drops the console lines pasted into the list', () => {
    const parsed = parseTicket(ticket('Make totals right.\n\n## Detail\nmore', ['Exit code: 0', 'Wall time: 1.1 seconds', 'Output:', 'app/a.ts', 'app/a.ts', 'app/b.ts']));
    assert.equal(parsed.text, 'Make totals right.\n\n## Detail\nmore');
    assert.deepEqual(parsed.truth, ['app/a.ts', 'app/b.ts']);
  });

  it('refuses a ticket whose sections are missing or out of order', () => {
    assert.ok(parseTicket('## TRUE RELATED CODE\n- a/b.ts\n').error);
    assert.ok(parseTicket('## TRUE RELATED CODE\n- a/b.ts\n## build:context prompt\nx\n').error);
    assert.ok(parseTicket('## build:context prompt\n\n## TRUE RELATED CODE\n- a/b.ts\n').error, 'an empty ticket is refused');
  });

  it('places the snapshot under the leading directory the truth resolves through', () => {
    assert.equal(codeRoot([['app/x/a.ts', 'app/b.ts'], ['other/c.ts']], ['app/x/a.ts', 'app/b.ts', 'c.ts']), 'app');
    assert.throws(() => codeRoot([['app/zzz.ts']], ['zzz.ts']), /no ground-truth path resolves/);
  });
});

describe('evals-bench: generate', () => {
  let benchmarks;
  let full;
  let result;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-'));
    const side = path.join(benchmarks, 'SIDE');
    mkdirSync(path.join(side, 'project', 'app', 'orders'), { recursive: true });
    mkdirSync(path.join(side, 'project', '.ambicode', 'task', 'old-note'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    writeFileSync(path.join(side, 'project', 'app', 'orders', 'service.ts'), 'export const total = 1;\n');
    writeFileSync(path.join(side, 'project', 'app', 'orders', 'model.ts'), 'export type Order = {};\n');
    writeFileSync(path.join(side, 'project', 'app', '.DS_Store'), 'x');
    writeFileSync(path.join(side, 'project', '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    writeFileSync(path.join(side, 'project', '.ambicode', 'task', 'old-note', 'note.md'), 'the answer is app/orders/service.ts\n');
    writeFileSync(path.join(side, 'assets', 'T-1.md'), ticket('Discount the order total.', ['app/orders/service.ts', 'app/orders/gone.ts']));
    writeFileSync(path.join(side, 'assets', 'T-2.md'), ticket('Only a removed file.', ['app/orders/removed.ts']));
    const version = path.join(side, 'reviews', 'T-1', '7-abcdef12');
    mkdirSync(path.join(version, 'base', 'app', 'orders'), { recursive: true });
    writeFileSync(path.join(version, 'base', 'app', 'orders', 'service.ts'), 'export const total = 0;\n');
    writeFileSync(path.join(version, 'absent.txt'), 'app/orders/model.ts\n');
    writeFileSync(path.join(version, 'change.patch'), CHANGE);
    writeFileSync(path.join(version, 'version.json'), '{}');
    writeFileSync(path.join(version, 'threads.json'), JSON.stringify([{ path: 'app/orders/service.ts', newLine: 1, body: 'Hard-coded total.\nUse the price.' }]));
    mkdirSync(path.join(side, 'reviews', 'T-1', '8-00000000'), { recursive: true });
    writeFileSync(path.join(side, 'reviews', 'T-1', '8-00000000', 'threads.json'), '[{"path":"app/x.ts","body":"b"}]');
    full = path.join(benchmarks, 'suites', 'SIDE', 'full');
    // A stale case from an earlier generation must not survive.
    mkdirSync(path.join(full, 'side-t-9'), { recursive: true });
    result = generate({ benchmarks, casesRoot: path.join(benchmarks, 'suites'), projects: ['SIDE'] });
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('writes one case per ticket with a true file in the snapshot, and says why it refused the rest', () => {
    assert.deepEqual(result.written.map((w) => w.name), ['side-t-1', 'side-t-1-review-7-abcdef12']);
    assert.deepEqual(result.refused, [
      { name: 'side-t-2', reason: 'none of its 1 true file(s) exists in the snapshot' },
      { name: 'side-t-1-review-8-00000000', reason: 'change.patch is missing from the prepared version' },
    ]);
    assert.deepEqual(readdirSync(full).filter((f) => f !== CASES_LOCK).sort(), ['side-t-1', 'side-t-1-review-7-abcdef12']);
    assert.equal(casesLockStatus(full), null, 'generation released its claim');
  });

  it('grades only the true files the snapshot still has, and records the others', () => {
    const truth = JSON.parse(readFileSync(path.join(full, 'side-t-1', 'truth.json'), 'utf8'));
    assert.deepEqual(truth, { kind: 'localize', side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/orders/service.ts'], missingFromSnapshot: ['app/orders/gone.ts'] });
  });

  it('puts the ticket in the prompt and the answer only in the graders', () => {
    const directory = path.join(full, 'side-t-1');
    const prompt = readFileSync(path.join(directory, 'prompt.md'), 'utf8');
    assert.match(prompt, /Discount the order total\./);
    assert.doesNotMatch(prompt, /service\.ts/);
    const meta = frontmatter(path.join(directory, 'prompt.md'));
    assert.equal(meta.name, 'side-t-1');
    assert.deepEqual(meta.allowed_tools, ['Read', 'Glob', 'Grep', 'Bash', 'Skill']);
    assert.match(readFileSync(path.join(directory, 'graders', 'names-a-true-file.md'), 'utf8'), /`app\/orders\/service\.ts`/);
  });

  it('scores the answer with both arms, with no Skill or helper indicator (03b-H4)', () => {
    const graders = path.join(full, 'side-t-1', 'graders');
    const all = Object.fromEntries(readdirSync(graders).map((f) => [f.replace(/\.md$/, ''), frontmatter(path.join(graders, f))]));
    assert.equal(all['names-a-true-file'].type, 'llm');
    assert.equal(all['names-a-true-file'].focus, 'last_message');
    assert.equal(all['names-a-true-file'].arm, 'both');
    for (const name of ['no-code-edit', 'no-code-write']) {
      assert.equal(all[name].arm, 'both');
      assert.equal(all[name].max, 0);
      // Only the code: the investigate skill's own note under .ambicode/ is not an edit.
      assert.ok(new RegExp(all[name].input_match).test('{"file_path":"/tmp/x/repo/app/orders/service.ts"}'));
      assert.ok(!new RegExp(all[name].input_match).test('{"file_path":"/tmp/x/repo/.ambicode/task/n.md"}'));
    }
    // 03b-H4: the route starts from the prompt hook, so no Skill or prepare/locate indicator is graded.
    assert.equal(all['plugin-fired'], undefined);
    assert.equal(all['helper-ran'], undefined);
  });

  it('fails any run whose tools reach into the data directory', () => {
    const graders = path.join(full, 'side-t-1', 'graders');
    for (const tool of ['read', 'grep', 'glob', 'bash']) {
      const meta = frontmatter(path.join(graders, `no-peek-${tool}.md`));
      assert.equal(meta.max, 0);
      assert.equal(meta.arm, 'both');
      assert.ok(new RegExp(meta.input_match).test('{"file_path":"/x/benchmarks/S/assets/t.md"}'));
      assert.ok(!new RegExp(meta.input_match).test('{"file_path":"/x/run/repo/app/a.ts"}'));
    }
  });

  it('scaffolds a clean committed repository at the truth root, with the config and without earlier task notes', () => {
    const run = mkdtempSync(path.join(tmpdir(), 'bench-run-'));
    try {
      execFileSync('sh', [path.join(full, 'side-t-1', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
      const repo = path.join(run, 'repo');
      assert.ok(existsSync(path.join(repo, 'app', 'orders', 'service.ts')));
      assert.ok(existsSync(path.join(repo, '.ambicode', 'config.yaml')));
      assert.ok(!existsSync(path.join(repo, '.ambicode', 'task')), 'earlier task notes could hand an arm the answer');
      assert.ok(!existsSync(path.join(repo, 'app', '.DS_Store')));
      assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), '');
      assert.equal(execFileSync('git', ['log', '--format=%aI'], { cwd: repo, encoding: 'utf8' }).trim(), '2026-01-01T00:00:00Z');
    } finally {
      rmSync(run, { recursive: true, force: true });
    }
  });
  it('writes a review case whose graders are the human threads, one each', () => {
    const directory = path.join(full, 'side-t-1-review-7-abcdef12');
    const prompt = readFileSync(path.join(directory, 'prompt.md'), 'utf8');
    assert.match(prompt, /Discount the order total\./);
    assert.doesNotMatch(prompt, /Hard-coded/, 'the human comment is the answer, not the question');
    const graders = readdirSync(path.join(directory, 'graders')).sort();
    assert.deepEqual(graders, ['no-peek-bash.md', 'no-peek-glob.md', 'no-peek-grep.md', 'no-peek-read.md', 'raises-01.md']);
    const raises = readFileSync(path.join(directory, 'graders', 'raises-01.md'), 'utf8');
    assert.match(raises, /`app\/orders\/service\.ts:1`/);
    assert.match(raises, /> Hard-coded total\.\n> Use the price\./);
    assert.equal(frontmatter(path.join(directory, 'graders', 'raises-01.md')).arm, 'both');
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'truth.json'), 'utf8')), { kind: 'review', side: 'SIDE', ticket: 'T-1', version: '7-abcdef12', root: 'app', threads: 1 });
  });

  it('scaffolds the change as the reviewer saw it: base committed, the change uncommitted on top', () => {
    const run = mkdtempSync(path.join(tmpdir(), 'bench-review-'));
    try {
      execFileSync('sh', [path.join(full, 'side-t-1-review-7-abcdef12', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
      const repo = path.join(run, 'repo');
      const at = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
      // The snapshot had `total = 1`; the base put back `0`; the change makes it `2`.
      assert.equal(at(['show', 'HEAD:app/orders/service.ts']), 'export const total = 0;\n');
      assert.throws(() => at(['show', 'HEAD:app/orders/model.ts']), 'a file absent at base is not committed');
      assert.equal(at(['status', '--porcelain']), ' M app/orders/service.ts\n?? app/orders/model.ts\n');
      assert.equal(readFileSync(path.join(repo, 'app', 'orders', 'model.ts'), 'utf8'), 'export type Order = { discount: number };\n');
    } finally {
      rmSync(run, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: selection strength', () => {
  it('measures how little the ticket gives away: the fraction of true files it never names', () => {
    const truth = ['app/orders/service.ts', 'app/billing/rates.ts'];
    assert.equal(localizeHardness('Fix the order Service total.', truth), 0.5);
    assert.equal(localizeHardness('Totals are wrong on annual plans.', truth), 1);
    assert.equal(localizeHardness('rates and service', truth), 0);
    assert.equal(localizeHardness('mentions order.service by its dotted stem', ['app/x/order.service.ts']), 0);
  });

  it('counts a patch’s changed lines without its file headers', () => {
    assert.equal(changedLines(CHANGE), 3);
  });

  it('weighs a thread by the proof it carries: resolved, engaged, substantive', () => {
    assert.equal(reviewSubstance([{ body: 'nit' }]), 1);
    assert.equal(reviewSubstance([{ body: 'x'.repeat(120), resolved: true, replies: [{ byAuthor: true, body: 'fixed' }] }]), 4);
    assert.equal(reviewSubstance([{ body: 'nit', replies: [{ byAuthor: false, body: 'same' }] }, { body: 'y', resolved: true }]), 3);
  });
});

describe('evals-bench: select', () => {
  let base;
  let out;
  let result;
  before(() => {
    base = mkdtempSync(path.join(tmpdir(), 'bench-select-'));
    const benchmarks = path.join(base, 'evals-assets', 'benchmarks');
    const side = path.join(benchmarks, 'SIDE');
    mkdirSync(path.join(side, 'project', 'app', 'orders'), { recursive: true });
    mkdirSync(path.join(side, 'project', 'app', 'billing'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    mkdirSync(path.join(side, 'project', '.ambicode'), { recursive: true });
    writeFileSync(path.join(side, 'project', 'app', 'orders', 'service.ts'), 'export const total = 1;\n');
    writeFileSync(path.join(side, 'project', 'app', 'orders', 'model.ts'), 'export type Order = {};\n');
    writeFileSync(path.join(side, 'project', 'app', 'billing', 'charges.ts'), 'export const charge = 1;\n');
    writeFileSync(path.join(side, 'project', 'app', 'billing', 'rates.ts'), 'export const rate = 1;\n');
    writeFileSync(path.join(side, 'project', '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    const pad = ' The steps to reproduce and the acceptance criteria follow in detail.'.repeat(5);
    // Easy: both true files are named in the text. Hard: neither is.
    writeFileSync(path.join(side, 'assets', 'T-EASY.md'), ticket(`Update the order service and the order model.${pad}`, ['app/orders/service.ts', 'app/orders/model.ts']));
    writeFileSync(path.join(side, 'assets', 'T-HARD.md'), ticket(`Buying an annual plan computes the wrong final amount.${pad}`, ['app/billing/charges.ts', 'app/billing/rates.ts']));
    writeFileSync(path.join(side, 'assets', 'T-SHORT.md'), ticket('Too short.', ['app/billing/charges.ts', 'app/billing/rates.ts']));
    writeFileSync(path.join(side, 'assets', 'T-ONE.md'), ticket(`A single-file ticket cannot separate luck from skill.${pad}`, ['app/billing/rates.ts']));
    const version = (name, patch, threads) => {
      const dir = path.join(side, 'reviews', 'T-EASY', name);
      mkdirSync(path.join(dir, 'base', 'app', 'orders'), { recursive: true });
      writeFileSync(path.join(dir, 'base', 'app', 'orders', 'service.ts'), 'export const total = 0;\n');
      writeFileSync(path.join(dir, 'absent.txt'), '');
      writeFileSync(path.join(dir, 'change.patch'), patch);
      writeFileSync(path.join(dir, 'threads.json'), JSON.stringify(threads));
    };
    version('7-abcdef12', CHANGE, [
      { path: 'app/orders/service.ts', newLine: 1, body: 'This recomputes the total on every call, which the profiler already flagged; cache it as the previous implementation did.', resolved: true, replies: [{ byAuthor: true, body: 'Done.' }] },
      { path: 'app/orders/service.ts', newLine: 1, body: 'Missing test.', resolved: true },
    ]);
    // Same threads would win on substance, but the change is too large to
    // review inside the case timeout.
    version('9-ffffffff', `--- a/x\n+++ b/x\n${'+line\n'.repeat(SELECT.maxChangedLines + 1)}`, [
      { path: 'app/orders/service.ts', newLine: 1, body: 'This recomputes the total on every call; cache it as before, which the profiler already flagged on the previous change.', resolved: true, replies: [{ byAuthor: true, body: 'Done.' }] },
      { path: 'app/orders/service.ts', newLine: 1, body: 'Missing test.', resolved: true },
    ]);
    out = path.join(base, ...CURATED_EVAL_DIR.split('/'), 'cases');
    result = generate({ benchmarks, out, pick: { localize: 1, review: 1 } });
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it('keeps the hardest eligible ticket and the most substantiated review that fits the timeout', () => {
    assert.deepEqual(result.written.map((w) => w.name).sort(), ['side-t-easy-review-7-abcdef12', 'side-t-hard']);
    const s = result.selection.sides.SIDE;
    assert.deepEqual([s.localize.eligible, s.localize.of, s.review.eligible, s.review.of], [2, 4, 1, 2]);
    assert.equal(s.localize.chosen[0].hardness, 1);
    assert.deepEqual([s.review.chosen[0].substance, s.review.chosen[0].threads], [6, 2]);
    const onDisk = JSON.parse(readFileSync(path.join(out, 'selection.json'), 'utf8'));
    assert.deepEqual(onDisk, result.selection);
    assert.equal(onDisk.criteria.maxChangedLines, SELECT.maxChangedLines);
  });

  it('writes a neutral review prompt and no forced twin', () => {
    const neutral = readFileSync(path.join(out, 'side-t-easy-review-7-abcdef12', 'prompt.md'), 'utf8');
    assert.doesNotMatch(neutral, /ambicode/);
    assert.match(neutral, /^Review the change before it merges/m);
    assert.ok(!readdirSync(out).some((name) => name.endsWith('-forced')));
  });

  it('tags the top pick of each kind per side for the walkthrough', () => {
    const wider = path.join(base, 'wider');
    generate({ benchmarks: path.join(base, 'evals-assets', 'benchmarks'), out: wider, pick: { localize: 2, review: 1 } });
    const walkTag = /^tags: \[[^\]\n]*"walk"/m;
    const tagged = (name) => walkTag.test(readFileSync(path.join(wider, name, 'prompt.md'), 'utf8'));
    assert.deepEqual(
      ['side-t-hard', 'side-t-easy', 'side-t-easy-review-7-abcdef12'].map(tagged),
      [true, false, true],
    );
    assert.ok(walkTag.test(readFileSync(path.join(out, 'side-t-hard', 'prompt.md'), 'utf8')), 'with one pick per kind, that pick is the walkthrough');
  });

  it('anchors the scaffold from the curated directory back to the data', () => {
    const scaffold = readFileSync(path.join(out, 'side-t-hard', 'scaffold.sh'), 'utf8');
    assert.match(scaffold, /"\$\(dirname "\$0"\)\/(?:\.\.\/){5}evals-assets\/benchmarks\/SIDE\/project"/);
    const run = mkdtempSync(path.join(tmpdir(), 'bench-curated-run-'));
    try {
      execFileSync('sh', [path.join(out, 'side-t-hard', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
      assert.ok(existsSync(path.join(run, 'repo', 'app', 'billing', 'rates.ts')));
    } finally {
      rmSync(run, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: curated selection without twins', () => {
  let root;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-curated-'));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('selects 18 cases, 10 localize and 8 review, with no forced twin', () => {
    const benchmarks = syntheticBenchmarks(root);
    const out = path.join(root, 'cases');
    const { written } = generate({ benchmarks, out, pick: { localize: 5, review: 4 } });
    assert.equal(written.length, 18);
    assert.deepEqual(tally(written.map((w) => w.kind)), { localize: 10, review: 8 });
    assert.ok(!readdirSync(out).some((n) => n.endsWith('-forced')));
    assert.equal(readdirSync(out).filter((n) => existsSync(path.join(out, n, WITH_PROMPT))).length, 18, '08-P1: every review case has its with-prompt too');
    assert.ok(!existsSync(path.join(out, GENERATION_MARKER)));
  });

  it('refuses the removed --forced flag with a migration message', async () => {
    await assert.rejects(main(['select', '--forced']), /--forced was removed/);
    await assert.rejects(main(['run', '--forced', '--model', 'm', '--max-cost-usd', '1']), /--forced was removed/);
  });

  it('refuses to replace cases under an outstanding swap or interrupted generation unless told to regenerate', () => {
    const benchmarks = syntheticBenchmarks(path.join(root, 'again'), { localize: 2, review: 1 });
    const out = path.join(root, 'again', 'cases');
    generate({ benchmarks, out });
    for (const marker of [SWAP_MARKER, GENERATION_MARKER]) {
      writeFileSync(path.join(out, marker), JSON.stringify({ cases: [] }));
      assert.throws(() => generate({ benchmarks, out }), /--regenerate/);
      generate({ benchmarks, out, regenerate: true });
      assert.ok(!existsSync(path.join(out, marker)));
    }
  });

  it('refuses to run cases whose generation was interrupted, or a leftover forced twin', async () => {
    const { plugin, casesDir } = syntheticPlugin(path.join(root, 'p'), syntheticBenchmarks(path.join(root, 'p'), { localize: 2, review: 1 }));
    const argv = ['--plugin', plugin, '--model', 'm', '--max-cost-usd', '1', '--dry-run'];
    writeFileSync(path.join(casesDir, GENERATION_MARKER), '');
    assert.throws(() => planRun(argv), /interrupted/);
    rmSync(path.join(casesDir, GENERATION_MARKER));
    mkdirSync(path.join(casesDir, 'aa-t-0-review-0-abcdef12-forced'));
    assert.throws(() => planRun(argv), /forced twin/);
  });
});

describe('evals-bench: select by discrimination', () => {
  let base;
  let benchmarks;
  before(() => {
    base = mkdtempSync(path.join(tmpdir(), 'bench-discriminate-'));
    benchmarks = path.join(base, 'evals-assets', 'benchmarks');
    const side = path.join(benchmarks, 'SIDE');
    mkdirSync(path.join(side, 'project', 'app'), { recursive: true });
    mkdirSync(path.join(side, 'project', '.ambicode'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    const files = ['a', 'b', 'c'].map((n) => `app/${n}.ts`);
    for (const f of files) writeFileSync(path.join(side, 'project', f), 'export const x = 1;\n');
    writeFileSync(path.join(side, 'project', '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    const pad = ' The steps to reproduce and the acceptance criteria follow in detail.'.repeat(5);
    for (const name of ['T-MID', 'T-SAT', 'T-FLOOR', 'T-NEW']) writeFileSync(path.join(side, 'assets', `${name}.md`), ticket(`Ticket ${name} computes the wrong amount.${pad}`, files));
    const thread = (body) => ({ path: 'app/a.ts', newLine: 1, body, resolved: true });
    const version = (name, count) => {
      const dir = path.join(side, 'reviews', 'T-MID', name);
      mkdirSync(path.join(dir, 'base', 'app'), { recursive: true });
      writeFileSync(path.join(dir, 'base', 'app', 'a.ts'), 'export const x = 0;\n');
      writeFileSync(path.join(dir, 'absent.txt'), '');
      writeFileSync(path.join(dir, 'change.patch'), CHANGE);
      writeFileSync(path.join(dir, 'threads.json'), JSON.stringify(Array.from({ length: count }, (_, i) => thread(`comment ${i}`))));
    };
    version('5-aaaaaaaa', 3);
    version('5-bbbbbbbb', 4);
    version('6-cccccccc', 2);
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  const pickWith = (bare) => {
    const out = path.join(base, 'out');
    return generate({ benchmarks, out, pick: { localize: 5, review: 5, bare }, regenerate: true }).selection.sides.SIDE;
  };

  it('keeps localize cases whose bare recall is neither saturated, floored, nor unmeasured', () => {
    const s = pickWith(new Map([['side-t-mid', 0.5], ['side-t-sat', 1], ['side-t-floor', 0.1]]));
    assert.deepEqual(s.localize.chosen.map((c) => c.name), ['side-t-mid']);
  });

  it('keeps one of two localize tickets that share their words, the harder first', () => {
    const s = pickWith(new Map([['side-t-mid', 0.5], ['side-t-new', 0.5]]));
    assert.equal(s.localize.chosen.length, 1);
  });

  it('ranks by least bare recall, then least bare precision, when a baseline is given', () => {
    const c = (name) => ({ plan: { name, truth: [], text: '' }, hardness: 0 });
    const pick = { bare: new Map([['a', 0.5], ['b', 0.3], ['c', 0.3]]), barePrecision: new Map([['a', 0.1], ['b', 0.8], ['c', 0.4]]) };
    assert.deepEqual([c('a'), c('b'), c('c')].sort(rankLocalize(pick)).map((x) => x.plan.name), ['c', 'b', 'a']);
  });

  it('scores identical tickets 1 and disjoint ones below the duplicate overlap', () => {
    assert.equal(ticketOverlap('alpha bravo charlie delta', 'alpha bravo charlie delta'), 1);
    assert.ok(ticketOverlap('alpha bravo charlie delta', 'echo foxtrot golf hotel') < DUPLICATE_TICKET_OVERLAP);
  });

  it('keeps review versions with a thread and one version per merge request', () => {
    const s = pickWith(new Map());
    assert.deepEqual(s.review.chosen.map((c) => c.name).sort(), ['side-t-mid-review-5-bbbbbbbb', 'side-t-mid-review-6-cccccccc']);
  });

  it('with labels, a review case keeps only the defect threads and a version with none is refused', () => {
    const labels = path.join(benchmarks, 'thread-classes.json');
    writeFileSync(labels, JSON.stringify({ 'SIDE/T-MID/6-cccccccc#1': { label: 'defect' }, 'SIDE/T-MID/6-cccccccc#0': { label: 'opinion' }, 'SIDE/T-MID/5-bbbbbbbb#0': { label: 'opinion' } }));
    try {
      const s = pickWith(new Map());
      assert.deepEqual(s.review.chosen.map((c) => [c.name, c.threads]), [['side-t-mid-review-6-cccccccc', 1]]);
      assert.equal(readFileSync(path.join(base, 'out', 'side-t-mid-review-6-cccccccc', 'graders', 'raises-01.md'), 'utf8').includes('comment 1'), true);
    } finally {
      rmSync(labels);
    }
  });

  it('defectThreads keeps every thread without labels and drops the unlabelled ones with labels', () => {
    const threads = [{ body: 'a' }, { body: 'b' }, { body: 'c' }];
    assert.deepEqual(defectThreads(threads, 'S/T/1', null), threads);
    assert.deepEqual(defectThreads(threads, 'S/T/1', { 'S/T/1#0': { label: 'opinion' }, 'S/T/1#2': { label: 'defect' } }), [{ body: 'c' }]);
  });
});
