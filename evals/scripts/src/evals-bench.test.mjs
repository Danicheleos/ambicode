// The real benchmark is under NDA and never in this repository; the last block
// runs only where `benchmarks/` exists, and checks it cannot leak.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { BENCH_EVAL_DIR, CURATED_EVAL_DIR, SELECT, changedLines, codeRoot, generate, harvestDir, harvestTraces, harvestedOfResult, localizeHardness, namedFiles, parseTicket, reviewSubstance, runArgs, score, scoreAnswer, traceMetrics, walkReport, walkRuns, withBaseline } from './evals-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const M = ['--model', 'claude-sonnet-5-5', '--max-cost-usd', '1'];

const CHANGE = `diff --git a/app/orders/service.ts b/app/orders/service.ts
--- a/app/orders/service.ts
+++ b/app/orders/service.ts
@@ -1 +1 @@
-export const total = 0;
+export const total = 2;
diff --git a/app/orders/model.ts b/app/orders/model.ts
new file mode 100644
--- /dev/null
+++ b/app/orders/model.ts
@@ -0,0 +1 @@
+export type Order = { discount: number };
`;

const ticket = (text, truth) => `# T\n\n## build:context prompt\n\n${text}\n\n## TRUE RELATED CODE\n\n${truth.map((p) => `- \`${p}\``).join('\n')}\n`;

function frontmatter(file) {
  const source = readFileSync(file, 'utf8');
  return parseYaml(/^---\n([\s\S]*?)\n---/.exec(source)[1]);
}

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
    assert.equal(codeRoot([['app/x/a.ts', 'app/b.ts'], ['other/c.ts']], ['x/a.ts', 'b.ts', 'c.ts']), 'app');
    assert.throws(() => codeRoot([['app/zzz.ts']], ['a.ts']), /no ground-truth path resolves/);
  });
});

describe('evals-bench: generate', () => {
  let benchmarks;
  let result;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-'));
    const side = path.join(benchmarks, 'SIDE');
    mkdirSync(path.join(side, 'src', 'orders'), { recursive: true });
    mkdirSync(path.join(side, '.ambicode', 'task', 'old-note'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    writeFileSync(path.join(side, 'src', 'orders', 'service.ts'), 'export const total = 1;\n');
    writeFileSync(path.join(side, 'src', 'orders', 'model.ts'), 'export type Order = {};\n');
    writeFileSync(path.join(side, 'src', '.DS_Store'), 'x');
    writeFileSync(path.join(side, '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    writeFileSync(path.join(side, '.ambicode', 'task', 'old-note', 'note.md'), 'the answer is app/orders/service.ts\n');
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
    // A stale case from an earlier generation must not survive.
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-9'), { recursive: true });
    result = generate({ benchmarks });
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('writes one case per ticket with a true file in the snapshot, and says why it refused the rest', () => {
    assert.deepEqual(result.written.map((w) => w.name), ['side-t-1', 'side-t-1-review-7-abcdef12']);
    assert.deepEqual(result.refused, [
      { name: 'side-t-2', reason: 'none of its 1 true file(s) exists in the snapshot' },
      { name: 'side-t-1-review-8-00000000', reason: 'change.patch is missing from the prepared version' },
    ]);
    assert.deepEqual(readdirSync(path.join(benchmarks, 'cases')).sort(), ['side-t-1', 'side-t-1-review-7-abcdef12']);
  });

  it('grades only the true files the snapshot still has, and records the others', () => {
    const truth = JSON.parse(readFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), 'utf8'));
    assert.deepEqual(truth, { kind: 'localize', side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/orders/service.ts'], missingFromSnapshot: ['app/orders/gone.ts'] });
  });

  it('puts the ticket in the prompt and the answer only in the graders', () => {
    const directory = path.join(benchmarks, 'cases', 'side-t-1');
    const prompt = readFileSync(path.join(directory, 'prompt.md'), 'utf8');
    assert.match(prompt, /Discount the order total\./);
    assert.doesNotMatch(prompt, /service\.ts/);
    const meta = frontmatter(path.join(directory, 'prompt.md'));
    assert.equal(meta.name, 'side-t-1');
    assert.deepEqual(meta.allowed_tools, ['Read', 'Glob', 'Grep', 'Bash', 'Skill']);
    assert.match(readFileSync(path.join(directory, 'graders', 'names-a-true-file.md'), 'utf8'), /`app\/orders\/service\.ts`/);
  });

  it('scores the answer with both arms, and records the plugin only as a with-only indicator', () => {
    const graders = path.join(benchmarks, 'cases', 'side-t-1', 'graders');
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
    assert.equal(all['plugin-fired'].arm, 'with-only');
    assert.equal(all['helper-ran'].arm, 'with-only');
    assert.ok(new RegExp(all['helper-ran'].input_match).test(JSON.stringify({ command: 'node "/p/scripts/ambicode.mjs" prepare --activity investigate' })));
  });

  it('fails any run whose tools reach into the data directory', () => {
    const graders = path.join(benchmarks, 'cases', 'side-t-1', 'graders');
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
      execFileSync('sh', [path.join(benchmarks, 'cases', 'side-t-1', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
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
    const directory = path.join(benchmarks, 'cases', 'side-t-1-review-7-abcdef12');
    const prompt = readFileSync(path.join(directory, 'prompt.md'), 'utf8');
    assert.match(prompt, /Discount the order total\./);
    assert.doesNotMatch(prompt, /Hard-coded/, 'the human comment is the answer, not the question');
    const graders = readdirSync(path.join(directory, 'graders')).sort();
    assert.deepEqual(graders, ['helper-ran.md', 'no-peek-bash.md', 'no-peek-glob.md', 'no-peek-grep.md', 'no-peek-read.md', 'plugin-fired.md', 'raises-01.md']);
    const raises = readFileSync(path.join(directory, 'graders', 'raises-01.md'), 'utf8');
    assert.match(raises, /`app\/orders\/service\.ts:1`/);
    assert.match(raises, /> Hard-coded total\.\n> Use the price\./);
    assert.equal(frontmatter(path.join(directory, 'graders', 'raises-01.md')).arm, 'both');
    assert.equal(frontmatter(path.join(directory, 'graders', 'plugin-fired.md')).input_match, '"ambicode:review"');
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'truth.json'), 'utf8')), { kind: 'review', side: 'SIDE', ticket: 'T-1', version: '7-abcdef12', root: 'app', threads: 1 });
  });

  it('scaffolds the change as the reviewer saw it: base committed, the change uncommitted on top', () => {
    const run = mkdtempSync(path.join(tmpdir(), 'bench-review-'));
    try {
      execFileSync('sh', [path.join(benchmarks, 'cases', 'side-t-1-review-7-abcdef12', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
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

describe('evals-bench: scoring an answer', () => {
  const truth = ['app/orders/service.ts', 'app/orders/model.ts', 'app/routes/orders.ts'];

  it('reads the Files section only, so files named as out of scope do not count', () => {
    const message = [
      'The total lives in `app/orders/service.ts`.',
      '',
      '## Files',
      '- `app/orders/service.ts` — the arithmetic',
      '- `repo/app/orders/model.ts` — the shape',
      '- ./app/legacy/export.ts — mentioned',
      '',
      '## Not part of the work',
      '- `app/routes/orders.ts`',
    ].join('\n');
    const { named, sectioned } = namedFiles(message, truth, 'app');
    assert.equal(sectioned, true);
    assert.deepEqual(named, ['app/orders/service.ts', 'app/orders/model.ts', 'app/legacy/export.ts']);
    const s = scoreAnswer(message, truth, 'app');
    assert.equal(s.correct, 2);
    assert.equal(s.precision, 2 / 3);
    assert.equal(s.recall, 2 / 3);
    assert.equal(s.hit, 1);
  });

  it('matches a path written without the code root, and only when one true file ends that way', () => {
    assert.deepEqual(namedFiles('## Files\n- orders/service.ts\n', truth, 'app').named, ['app/orders/service.ts']);
    assert.deepEqual(namedFiles('## Files\n- `/abs/run/repo/app/routes/orders.ts:12`\n', truth, 'app').named, ['app/routes/orders.ts']);
  });

  it('falls back to the whole message when there is no Files section, and says so', () => {
    const s = scoreAnswer('Touch app/orders/model.ts only.', truth, 'app');
    assert.equal(s.sectioned, false);
    assert.equal(s.correct, 1);
    assert.equal(s.precision, 1);
  });

  it('scores an answer that names nothing as zero precision, not as undefined', () => {
    const s = scoreAnswer('## Files\nNone found.', truth, 'app');
    assert.deepEqual([s.named, s.precision, s.recall, s.f1, s.hit], [0, 0, 0, 0, 0]);
  });
});

describe('evals-bench: scoring a run', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-score-'));
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('reports a run with no final message as absent, not as an answer that scored zero', () => {
    const graders = (evidence, fired) => [
      { name: 'names-a-true-file', passed: true, ...(evidence === undefined ? {} : { evidence }) },
      ...(fired === undefined ? [] : [{ name: 'plugin-fired', passed: fired }]),
    ];
    const results = {
      cases: [
        {
          name: 'side-t-1',
          arms: {
            with: [{ graders: graders('## Files\n- app/a.ts\n', true), costUsd: 0.2, turns: 5 }, { graders: graders(undefined, false), error: 'timeout' }],
            without: [{ graders: graders('## Files\n- app/a.ts\n- app/b.ts\n- app/c.ts\n'), costUsd: 0.1, turns: 3 }],
          },
        },
        { name: 'not-a-benchmark-case', arms: { with: [{ graders: [] }] } },
      ],
    };
    const { runs, arms } = score(results, { benchmarks });
    assert.equal(runs.length, 3, 'a case with no truth.json is not a benchmark case');
    assert.deepEqual(runs.filter((r) => r.absent).map((r) => [r.arm, r.error]), [['with', 'timeout']]);
    const w = arms['localize/with'];
    assert.deepEqual([w.runs, w.scored, w.absent], [2, 1, 1]);
    assert.equal(w.recall, 0.5);
    assert.equal(w['plugin-fired'], 1);
    assert.equal(arms['localize/without'].precision, 2 / 3);
    assert.equal(arms['localize/without'].recall, 1);
    assert.ok('localize/with/SIDE' in arms);
  });
});

const event = (type, extra) => JSON.stringify({ type, ...extra });
const toolUse = (name, input) => event('assistant', { message: { content: [{ type: 'tool_use', name, input }] } });
const HELPER = 'node "/p/scripts/ambicode.mjs"';
const TRACE = [
  event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
  toolUse('Skill', { skill: 'ambicode:investigate', args: 'q' }),
  // The skill body is in the trace too, and names the helper: it is not a call.
  event('user', { message: { content: [{ type: 'text', text: `Run ${HELPER} prepare --activity investigate --json` }] } }),
  toolUse('Bash', { command: `cd repo && ${HELPER} prepare --activity investigate --json 2>&1 | head -c 6000` }),
  toolUse('Bash', { command: `${HELPER} prepare --activity investigate --json --term x` }),
  toolUse('Bash', { command: 'cd repo && grep -rn amount src | head -20' }),
  toolUse('Bash', { command: 'sed -n 1,40p src/a.ts; cat src/b.ts' }),
  toolUse('Bash', { command: 'npm test' }),
  toolUse('Bash', { command: `${HELPER} review --branch 2>&1 | tail -150` }),
  event('user', { message: { content: [{ type: 'tool_result', content: 'reviewer    ok — model sonnet, REPLAYED from a recording (no model call)' }] } }),
  toolUse('Read', { file_path: 'src/a.ts' }),
  toolUse('Grep', { pattern: 'x' }),
  'not json',
].join('\n');

describe('evals-bench: measures taken from the trace', () => {
  it('counts the agent\'s own calls, never the skill text that names the helper', () => {
    assert.deepEqual(traceMetrics(TRACE), {
      model: 'claude-sonnet-5-5',
      toolCalls: 9,
      skills: ['ambicode:investigate'],
      prepareRuns: 2,
      prepareTruncated: 1,
      reviewRuns: 1,
      replayedReviews: 1,
      replayMisses: 0,
      bashReads: 2,
      readCalls: 1,
      grepCalls: 1,
    });
  });

  it('attaches them to the scored runs, and leaves an untraced run out of the counts', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-trace-score-'));
    try {
      mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const tracesDir = path.join(benchmarks, 'traces');
      mkdirSync(tracesDir);
      writeFileSync(path.join(tracesDir, 'e-abc.jsonl'), TRACE);
      const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
      const results = { cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/private/tmp/e-abc/out/trace.jsonl' }, { graders, tracePath: '/private/tmp/e-gone/out/trace.jsonl' }] } }] };
      const w = score(results, { benchmarks, tracesDir }).arms['localize/with'];
      assert.deepEqual([w.runs, w.traced, w['skill-fired'], w['prepare-ran'], w['prepare-truncated'], w['review-runs'], w['bash-reads']], [2, 1, 1, 1, 1, 1, 2]);
      assert.deepEqual(w.models, ['claude-sonnet-5-5']);
      assert.equal(score(results, { benchmarks }).arms['localize/with'].traced, 0, 'no traces directory: nothing is traced, nothing is invented');
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: a cached no-plugin arm', () => {
  const PROMPT = 'Which files?';
  const result = (arms, extra = {}) => ({
    partial: false,
    claudeVersion: '2.1.285',
    startedAt: '2026-09-30T00:00:00.000Z',
    suite: { modelOverride: 'claude-sonnet-5-5' },
    cases: [{ name: 'side-t-1', promptMarkdown: PROMPT, arms }],
    ...extra,
  });
  const withOnly = result({ with: [{ turns: 9 }] });
  const baseline = result({ with: [{ turns: 1 }], without: [{ turns: 7 }] }, { startedAt: '2026-09-29T00:00:00.000Z' });

  it('takes the without arm from the baseline, and keeps where it came from', () => {
    const merged = withBaseline(withOnly, baseline, { baselinePath: 'b.json' });
    assert.deepEqual(merged.cases[0].arms, { with: [{ turns: 9 }], without: [{ turns: 7 }] });
    assert.deepEqual(merged.baseline, { file: 'b.json', arm: 'without', startedAt: '2026-09-29T00:00:00.000Z' });
    assert.equal(withOnly.cases[0].arms.without, undefined, 'the run it was given is not modified');
  });

  it('refuses a baseline that differs in anything the no-plugin arm depends on', () => {
    const refuse = (b, pattern, r = withOnly) => assert.throws(() => withBaseline(r, b, { baselinePath: 'b.json' }), pattern);
    refuse({ ...baseline, suite: { modelOverride: 'claude-opus-5-5' } }, /model/);
    refuse({ ...baseline, claudeVersion: '2.1.300' }, /Claude Code version/);
    refuse({ ...baseline, partial: true }, /partial/);
    refuse({ ...baseline, cases: [{ ...baseline.cases[0], promptMarkdown: 'Other prompt' }] }, /prompt/);
    refuse({ ...baseline, cases: [] }, /side-t-1/);
    refuse({ ...baseline, cases: [{ ...baseline.cases[0], arms: { with: [] } }] }, /no without arm/);
    refuse(baseline, /its own without arm/, baseline);
  });
});

describe('evals-bench: the walkthrough', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-walk-'));
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
    mkdirSync(path.join(benchmarks, 'traces'));
    writeFileSync(path.join(benchmarks, 'traces', 'e-walk.jsonl'), TRACE);
    const quiet = [event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }), toolUse('Bash', { command: 'grep -rn total app' })].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-quiet.jsonl'), quiet);
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
  const results = {
    suite: { modelOverride: 'claude-sonnet-5-5', plugins: [{ name: 'ambicode', path: '/some/variant' }] },
    cases: [
      {
        name: 'side-t-1',
        maxTurns: 40,
        arms: {
          with: [
            { graders, costUsd: 0.2, turns: 12, tracePath: '/private/tmp/e-walk/out/trace.jsonl' },
            { graders, costUsd: 0.1, turns: 40, tracePath: '/private/tmp/e-quiet/out/trace.jsonl' },
            { graders: [], costUsd: 0.1, turns: 3, error: 'timeout', tracePath: '/private/tmp/e-gone/out/trace.jsonl' },
          ],
        },
      },
    ],
  };

  it('names the first thing that went wrong in each run, in trace order', () => {
    const walk = walkRuns(results, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(
      walk.map((w) => w.deviations[0] ?? null),
      ['prepare output cut with head/tail/cut (step 2)', 'no AMBICODE skill fired', 'the run ended in an error: timeout'],
    );
    assert.deepEqual(walk[1].deviations, ['no AMBICODE skill fired', 'stopped at the 40-turn limit']);
    assert.ok(!walk[0].deviations.some((d) => d.startsWith('review re-run')), 'one review call is not a re-run');
    const rerun = [
      event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
      toolUse('Skill', { skill: 'ambicode:review' }),
      toolUse('Bash', { command: `${HELPER} review --branch` }),
      toolUse('Bash', { command: `${HELPER} review --branch --exclude 'i18n/**'` }),
      toolUse('Edit', { file_path: '/s/repo/app/a.ts' }),
      toolUse('Read', { file_path: '/data/benchmarks/BE/assets/T-1.md' }),
    ].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-rerun.jsonl'), rerun);
    const [again] = walkRuns({ cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/tmp/e-rerun/out/trace.jsonl' }] } }] }, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(again.deviations, [
      'review re-run (step 3)',
      'edit attempted: /s/repo/app/a.ts (step 4)',
      'reached into benchmarks/ (step 5)',
      'a skill fired but prepare never ran',
    ]);
    assert.equal(walk[0].steps[0], '1. Skill ambicode:investigate q');
    assert.ok(walk[0].steps.every((line) => line.length <= 120 && !line.includes('\n')));
    assert.equal(walk[2].steps, null, 'an untraced run has no steps, not an empty list');
  });

  it('names a helper call that failed, by the code it printed', () => {
    const call = (id, command) => event('assistant', { message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
    const answer = (id, content, isError) => event('user', { message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
    const failing = [
      event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
      toolUse('Skill', { skill: 'ambicode:review' }),
      call('t1', `${HELPER} review`),
      answer('t1', 'Exit code 2\nerror [snapshot-too-large]: 15 changed files do not fit', true),
      call('t2', `${HELPER} review --exclude 'i18n/**'`),
      answer('t2', '1. WHAT WAS REVIEWED\n   review      local_x  (error: reviewer-error: Not logged in · Please run /login)', false),
      call('t3', 'grep -n x app/a.ts'),
      answer('t3', 'error [not-ours]: grep output is not a helper failure', false),
    ].join('\n');
    writeFileSync(path.join(benchmarks, 'traces', 'e-failing.jsonl'), failing);
    const [walk] = walkRuns({ cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/tmp/e-failing/out/trace.jsonl' }] } }] }, { benchmarks, tracesDir: path.join(benchmarks, 'traces') });
    assert.deepEqual(walk.deviations.slice(0, 3), ['review failed: snapshot-too-large (step 2)', 'review re-run (step 3)', 'review failed: reviewer-error (step 3)']);
  });

  it('writes one summary row per run, then each run with its steps', () => {
    const markdown = walkReport(results, { benchmarks, tracesDir: path.join(benchmarks, 'traces'), source: 'eval-x.json' });
    assert.match(markdown, /^# Walkthrough: eval-x\.json/m);
    assert.match(markdown, /Plugin \/some\/variant\b/);
    assert.match(markdown, /\| side-t-1 \| with \| 0 \| 0\.200 \| 12 \| ambicode:investigate \| 2 \(1 cut\) \| P 1\.00 R 0\.50 \| prepare output cut/);
    assert.match(markdown, /trace not harvested/);
    assert.match(markdown, /```\n1\. Skill ambicode:investigate q\n2\. Bash cd repo && node/);
  });
});

describe('evals-bench: scoring a review run', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-review-score-'));
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-1-review-7-x'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'cases', 'side-t-1-review-7-x', 'truth.json'), JSON.stringify({ kind: 'review', side: 'SIDE', ticket: 'T-1', version: '7-x', root: 'app', threads: 2 }));
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('scores recall against the human threads, and a run whose judges did not run as absent', () => {
    const raised = (a, b) => [{ name: 'raises-01', passed: a }, { name: 'raises-02', passed: b }];
    const results = {
      cases: [
        {
          name: 'side-t-1-review-7-x',
          arms: {
            with: [{ graders: raised(true, false) }, { graders: raised(false, false), skippedPaidGraders: true }],
            without: [{ graders: [{ name: 'raises-01', passed: true }] }],
          },
        },
      ],
    };
    const { arms } = score(results, { benchmarks });
    assert.deepEqual([arms['review/with'].scored, arms['review/with'].absent, arms['review/with'].recall], [1, 1, 0.5]);
    assert.equal(arms['review/without'].absent, 1, 'a missing thread grader is not a thread the run failed to raise');
  });
});

describe('evals-bench: running', () => {
  it('runs the curated suite by default, the full set with --set full, and never publishes', () => {
    const argv = runArgs([...M, '--case', 'x', '-j', '4']);
    assert.deepEqual(argv.slice(0, 2), ['plugin', 'eval']);
    assert.equal(argv[argv.indexOf('--eval-dir') + 1], CURATED_EVAL_DIR);
    assert.ok(argv.includes('--no-publish'));
    const full = runArgs([...M], { set: 'full' });
    assert.equal(full[full.indexOf('--eval-dir') + 1], BENCH_EVAL_DIR);
    assert.throws(() => runArgs([...M, '--publish-report']), /NDA/);
    assert.throws(() => runArgs([...M, '--eval-dir', 'evals']), /fixed/);
    assert.throws(() => runArgs([...M], { set: 'both' }), /curated or full/);
  });

  it('refuses a run whose model is not pinned', () => {
    assert.throws(() => runArgs(['--case', 'x']), /--model is required/);
    assert.equal(runArgs([...M])[runArgs([...M]).indexOf('--model') + 1], 'claude-sonnet-5-5');
  });

  it('refuses a run with no cost ceiling', () => {
    assert.throws(() => runArgs(['--model', 'claude-sonnet-5-5']), /--max-cost-usd is required/);
    assert.throws(() => runArgs(['--model', 'claude-sonnet-5-5', '--max-cost-usd']), /--max-cost-usd is required/);
  });

  it('evaluates a variant plugin directory in place of the repository, and refuses a directory that is no plugin', () => {
    const variant = mkdtempSync(path.join(tmpdir(), 'variant-'));
    assert.throws(() => runArgs([...M], { plugin: variant }), /is not a plugin/);
    mkdirSync(path.join(variant, '.claude-plugin'));
    writeFileSync(path.join(variant, '.claude-plugin', 'plugin.json'), '{}');
    const argv = runArgs([...M], { plugin: variant });
    assert.equal(argv[2], variant);
    assert.equal(runArgs([...M])[2], ROOT);
    rmSync(variant, { recursive: true });
  });

  it('keeps the result JSON inside the excluded directories', () => {
    const benchmarks = path.join(tmpdir(), 'b');
    const argv = runArgs([...M], { now: new Date('2026-01-02T03:04:05.678Z'), benchmarks, set: 'full' });
    assert.equal(argv[argv.indexOf('--json') + 1], path.join(benchmarks, 'results', 'eval-2026-01-02T03-04-05-678Z.json'));
    const curated = runArgs([...M], { now: new Date('2026-01-02T03:04:05.678Z'), benchmarks });
    assert.equal(curated[curated.indexOf('--json') + 1], path.join(ROOT, 'evals', 'evals-core', 'results', 'eval-2026-01-02T03-04-05-678Z.json'));
    assert.equal(runArgs([...M, '--json', path.join(benchmarks, 'r.json')], { benchmarks }).filter((a) => a === '--json').length, 1);
    assert.ok(runArgs([...M, '--json', path.join(ROOT, 'evals', 'evals-core', 'results', 'r.json')], { benchmarks }).includes('--json'), 'evals/evals-core/results/ is gitignored and allowed');
    assert.throws(() => runArgs([...M, '--json', path.join(ROOT, 'evals', 'evals-triggers', 'results', 'r.json')], { benchmarks }), /must stay under/, 'another suite\'s results dir is not the curated excluded dir');
    for (const flag of ['--json', '--report', '--output-dir']) {
      assert.throws(() => runArgs([...M, flag, path.join(tmpdir(), 'elsewhere.json')], { benchmarks }), /must stay under/);
      assert.throws(() => runArgs([...M, flag], { benchmarks }), /needs a path/);
    }
  });
});

describe('evals-bench: harvesting traces', () => {
  it('puts traces beside the run result, so they share its excluded-directory guarantee', () => {
    const argv = runArgs([...M], { now: new Date('2026-01-02T03:04:05.678Z') });
    assert.equal(harvestDir(argv), path.join(ROOT, 'evals', 'evals-core', 'results', 'traces'));
    const benchmarks = path.join(tmpdir(), 'b');
    assert.equal(harvestDir(runArgs([...M, '--json', path.join(benchmarks, 'r.json')], { benchmarks })), path.join(benchmarks, 'traces'));
    assert.throws(() => harvestDir(['plugin', 'eval']), /nowhere safe/);
  });

  it('copies each live sandbox trace whole, overwrites with growth, and skips what has no trace yet', () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'harvest-'));
    const outDir = path.join(sandboxRoot, 'kept');
    try {
      const sandboxRoots = [sandboxRoot, path.join(sandboxRoot, 'missing-root')];
      mkdirSync(path.join(sandboxRoot, 'e-one', 'out'), { recursive: true });
      writeFileSync(path.join(sandboxRoot, 'e-one', 'out', 'trace.jsonl'), '{"turn":1}\n');
      mkdirSync(path.join(sandboxRoot, 'e-two', 'out'), { recursive: true });
      mkdirSync(path.join(sandboxRoot, 'not-a-run'), { recursive: true });
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 1, 'a root that does not exist on this platform is skipped, not fatal');
      assert.deepEqual(readdirSync(outDir), ['e-one.jsonl']);
      writeFileSync(path.join(sandboxRoot, 'e-one', 'out', 'trace.jsonl'), '{"turn":1}\n{"turn":2}\n');
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 1, 'a later pass overwrites: the trace grows, the last copy is the whole one');
      assert.equal(readFileSync(path.join(outDir, 'e-one.jsonl'), 'utf8'), '{"turn":1}\n{"turn":2}\n');
      rmSync(path.join(sandboxRoot, 'e-one'), { recursive: true });
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 0);
      assert.deepEqual(readdirSync(outDir), ['e-one.jsonl'], 'a deleted sandbox does not take its harvested trace with it');
      writeFileSync(path.join(sandboxRoot, 'e-two', 'out', 'trace.jsonl'), '{"turn":1}\n');
      mkdirSync(path.join(outDir, 'e-two.jsonl.tmp')); // copy destination occupied by a directory: EISDIR, not the benign ENOENT
      assert.throws(() => harvestTraces(outDir, { sandboxRoots }), (e) => e.code !== 'ENOENT', 'a persistent failure surfaces instead of degrading every pass silently');
      rmSync(path.join(outDir, 'e-two.jsonl.tmp'), { recursive: true });
      const rootIsAFile = path.join(sandboxRoot, 'root-file');
      writeFileSync(rootIsAFile, '');
      assert.throws(() => harvestTraces(outDir, { sandboxRoots: [rootIsAFile] }), (e) => e.code !== 'ENOENT', 'an unlistable root surfaces too; only a missing one is benign');
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('tells a complete harvest from one that missed traces the result names', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'harvest-check-'));
    try {
      const result = {
        cases: [
          {
            arms: {
              with: [{ tracePath: '/private/tmp/e-kept/out/trace.jsonl' }, { tracePath: '/private/tmp/e-gone/out/trace.jsonl' }],
              without: [{ tracePath: '/private/tmp/e-kept/out/trace.jsonl' }], // the same sandbox twice counts once
            },
          },
        ],
      };
      writeFileSync(path.join(dir, 'r.json'), JSON.stringify(result));
      writeFileSync(path.join(dir, 'e-kept.jsonl'), '{}\n');
      writeFileSync(path.join(dir, 'e-stray.jsonl'), '{}\n'); // another sweep's trace changes nothing
      assert.deepEqual(harvestedOfResult(path.join(dir, 'r.json'), dir), { named: 2, harvested: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
    const benchmarks = path.join(base, 'benchmarks');
    const side = path.join(benchmarks, 'SIDE');
    mkdirSync(path.join(side, 'src', 'orders'), { recursive: true });
    mkdirSync(path.join(side, 'src', 'billing'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    mkdirSync(path.join(side, '.ambicode'), { recursive: true });
    writeFileSync(path.join(side, 'src', 'orders', 'service.ts'), 'export const total = 1;\n');
    writeFileSync(path.join(side, 'src', 'orders', 'model.ts'), 'export type Order = {};\n');
    writeFileSync(path.join(side, 'src', 'billing', 'charges.ts'), 'export const charge = 1;\n');
    writeFileSync(path.join(side, 'src', 'billing', 'rates.ts'), 'export const rate = 1;\n');
    writeFileSync(path.join(side, '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
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
    result = generate({ benchmarks, out, pick: { localize: 1, review: 1 }, forced: true });
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it('keeps the hardest eligible ticket and the most substantiated review that fits the timeout', () => {
    assert.deepEqual(result.written.map((w) => w.name).sort(), ['side-t-easy-review-7-abcdef12', 'side-t-easy-review-7-abcdef12-forced', 'side-t-hard']);
    const s = result.selection.sides.SIDE;
    assert.deepEqual([s.localize.eligible, s.localize.of, s.review.eligible, s.review.of], [2, 4, 1, 2]);
    assert.equal(s.localize.chosen[0].hardness, 1);
    assert.deepEqual([s.review.chosen[0].substance, s.review.chosen[0].threads], [6, 2]);
    const onDisk = JSON.parse(readFileSync(path.join(out, 'selection.json'), 'utf8'));
    assert.deepEqual(onDisk, result.selection);
    assert.equal(onDisk.criteria.maxChangedLines, SELECT.maxChangedLines);
  });

  it('writes a neutral review prompt, and a forced twin scored as its own kind', () => {
    const neutral = readFileSync(path.join(out, 'side-t-easy-review-7-abcdef12', 'prompt.md'), 'utf8');
    const forced = readFileSync(path.join(out, 'side-t-easy-review-7-abcdef12-forced', 'prompt.md'), 'utf8');
    assert.doesNotMatch(neutral, /ambicode/);
    assert.match(neutral, /^Review the change before it merges/m);
    assert.match(forced, /^Use the ambicode review skill to review the change before it merges/m);
    assert.match(forced, /tags: \[.*"forced"\]/);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'side-t-easy-review-7-abcdef12-forced', 'truth.json'), 'utf8')).variant, 'forced');
  });

  it('tags the top pick of each kind per side, and its forced twin, for the walkthrough', () => {
    const wider = path.join(base, 'wider');
    generate({ benchmarks: path.join(base, 'benchmarks'), out: wider, pick: { localize: 2, review: 1 }, forced: true });
    const walkTag = /^tags: \[[^\]\n]*"walk"/m;
    const tagged = (name) => walkTag.test(readFileSync(path.join(wider, name, 'prompt.md'), 'utf8'));
    assert.deepEqual(
      ['side-t-hard', 'side-t-easy', 'side-t-easy-review-7-abcdef12', 'side-t-easy-review-7-abcdef12-forced'].map(tagged),
      [true, false, true, true],
    );
    assert.ok(walkTag.test(readFileSync(path.join(out, 'side-t-hard', 'prompt.md'), 'utf8')), 'with one pick per kind, that pick is the walkthrough');
  });

  it('anchors the scaffold from the curated directory back to the data', () => {
    const scaffold = readFileSync(path.join(out, 'side-t-hard', 'scaffold.sh'), 'utf8');
    assert.match(scaffold, /"\$\(dirname "\$0"\)\/\.\.\/\.\.\/\.\.\/\.\.\/benchmarks\/SIDE"/);
    const run = mkdtempSync(path.join(tmpdir(), 'bench-curated-run-'));
    try {
      execFileSync('sh', [path.join(out, 'side-t-hard', 'scaffold.sh')], { cwd: run, env: { PATH: process.env.PATH, HOME: run } });
      assert.ok(existsSync(path.join(run, 'repo', 'app', 'billing', 'rates.ts')));
    } finally {
      rmSync(run, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: the curated cases stay out of git', () => {
  // check-ignore exits non-zero when the path is not ignored, which throws.
  const ignored = (p) => execFileSync('git', ['check-ignore', '-v', p], { cwd: ROOT, encoding: 'utf8' });

  it('ignores the curated cases and their results, wherever the data they are generated from lives', () => {
    assert.match(ignored(`${CURATED_EVAL_DIR}/cases/x`), /evals-core/);
    assert.match(ignored(`${CURATED_EVAL_DIR}/results/x`), /evals-core|results/);
  });

  it('ignores the results of whichever suite a bare `claude plugin eval .` runs', () => {
    // A bare run writes to <manifest eval dir>/results/ and publishes by
    // default; the results must never be taken by git whatever that dir is.
    const manifest = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    const bareDir = manifest.experimental?.evals ?? 'evals';
    assert.match(ignored(`${bareDir}/results/x`), /results/);
    // Discovery is recursive, so a bare dir that contains the curated one (`evals/`, `.`)
    // sweeps the NDA cases as surely as one inside it.
    const within = (outer, inner) => !path.relative(outer, inner).startsWith('..');
    assert.ok(!within(bareDir, CURATED_EVAL_DIR) && !within(CURATED_EVAL_DIR, bareDir), `a bare run over ${bareDir}/ reaches the NDA curated suite`);
  });
});

// No file git would take may carry one of the real benchmark's ticket identifiers.
const REAL = path.join(ROOT, 'benchmarks');
describe('evals-bench: the real benchmark stays out of git', { skip: !existsSync(REAL) && 'no benchmarks/ here' }, () => {
  it('is ignored as a whole', () => {
    assert.match(execFileSync('git', ['check-ignore', '-v', 'benchmarks/'], { cwd: ROOT, encoding: 'utf8' }), /benchmarks/);
  });

  it('has no ticket identifier in any tracked or addable file', () => {
    const ids = new Set();
    for (const side of readdirSync(REAL, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(REAL, e.name, 'assets'))))
      for (const f of readdirSync(path.join(REAL, side.name, 'assets'), { withFileTypes: true }).filter((e) => e.name.endsWith('.md')))
        ids.add(path.basename(f.name, '.md'));
    assert.ok(ids.size > 0);
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    const leaks = [];
    for (const file of files) {
      const full = path.join(ROOT, file);
      if (!existsSync(full)) continue;
      const text = readFileSync(full, 'latin1');
      for (const id of ids) if (new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) leaks.push(`${file}: ${id}`);
    }
    assert.deepEqual(leaks, []);
  });
});
