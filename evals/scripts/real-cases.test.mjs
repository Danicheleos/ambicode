import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NO_RUNS, REAL_TAG, graderFiles, isRealCase, loadRealCases, realTruth, variantsOf, wroteLine, writeReal } from './real-cases.mjs';
import { gradeOne } from './diff-graders.mjs';
import { runCase } from './run.mjs';

const read = (...parts) => readFileSync(path.join(...parts), 'utf8');
const sources = { r1: { bench: '/bench/r1', context: '/bench/r1/ctx' } };
const sha = (c) => c.repeat(40);

// Generic fixtures: the generator is tested on invented cases. The real ones live in the gitignored local file and are tested below.
const FIXTURE = [
  {
    name: 'task-real-alpha', repo: 'r1', kind: 'feature', slug: 'rl-alpha', commit: sha('a'), parent: sha('b'), description: 'an invented case',
    prompt: 'Add an export button that downloads the list as a file.', relevant: ['src/a.ts'], allowed: ['tests/'], limits: { max_turns: 90, timeout_seconds: 2400 },
    graders: [
      { kind: 'file', name: 'file-has-token', file: 'src/a.ts', pattern: 'TOKEN', weight: 2 },
      { kind: 'file', name: 'no-copy', file: 'src/a.ts', pattern: 'COPY', match: 'not_contains', guard: true },
      { kind: 'trace', name: 'wrote-both', wrote: ['Base', 'class \\w+Repo'] },
      { kind: 'exists', name: 'migration-present', glob: 'migrations/*.py' },
      { kind: 'diff', name: 'diff-has-class', in: 'src/', pattern: 'class \\w+Repo', weight: 2 },
      { kind: 'llm', name: 'design', rubric: 'PASS if layered. FAIL if inline.', weight: 1 },
    ],
    plan: '# Add export\n\n## Iteration 1: button\n\n*Changes*:\n- src/a.ts:3 add the button.\n',
    investigation: 'The list lives at src/a.ts:3 and has no export.\n',
  },
  { name: 'task-real-beta', repo: 'r1', kind: 'hard', slug: 'rl-beta', commit: sha('c'), parent: sha('d'), description: 'another', prompt: 'Make totals use one rule.', relevant: ['src/b.ts'], allowed: [], graders: [{ kind: 'file', name: 'x', file: 'src/b.ts', pattern: 'y' }], investigation: 'Totals are computed at src/b.ts:1.\n' },
];

describe('real-change task cases: the generator', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'real-cases-'));
  const rows = writeReal({ evalsDir: root, sources, cases: FIXTURE });
  const VARIANTS = FIXTURE.flatMap(variantsOf);
  const dirOf = (c, arm) => path.join(root, arm, REAL_TAG, `${String(VARIANTS.findIndex((v) => v.name === c.name) + 1).padStart(2, '0')}-${c.name}`);

  it('renders a plan variant and an investigation variant per note a spec carries, in both trees, with the truth the spec declares', () => {
    assert.deepEqual(rows.map((r) => r.name), ['task-real-alpha-plan', 'task-real-alpha-inv', 'task-real-alpha', 'task-real-beta-inv', 'task-real-beta']);
    for (const c of VARIANTS) {
      const truth = JSON.parse(read(dirOf(c, 'cases'), 'truth.json'));
      assert.deepEqual([truth.source, truth.relevant, truth.allowed, truth.bench], ['changed', c.relevant, c.allowed, { repo: c.repo, commit: c.commit, parent: c.parent }]);
      assert.equal(realTruth(c.name, root).name, c.name);
      assert.ok(isRealCase(c.name));
    }
    assert.deepEqual(JSON.parse(read(dirOf(VARIANTS[0], 'bare'), 'truth.json')).diffGraders, [{ name: 'diff-has-class', pattern: 'class \\w+Repo', in: 'src/', weight: 2 }]);
  });

  it('the plugin prompt types /ambicode:task and the bare prompt carries the note as text; both say not to run builds, tests or reviews', () => {
    const body = (c, arm) => read(dirOf(c, arm), 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '').trim();
    const [plan, inv] = VARIANTS;
    assert.equal(body(plan, 'cases'), `/ambicode:task --task rl-alphap --headless Go ahead with the plan. ${NO_RUNS}`);
    assert.equal(body(inv, 'cases'), `/ambicode:task --task rl-alphai --headless ${FIXTURE[0].prompt} ${NO_RUNS}`);
    assert.ok(body(plan, 'bare').startsWith('Implement the accepted plan below') && body(plan, 'bare').includes('src/a.ts:3 add the button.') && body(plan, 'bare').endsWith(NO_RUNS));
    assert.ok(body(inv, 'bare').startsWith(FIXTURE[0].prompt) && body(inv, 'bare').includes('The list lives at src/a.ts:3') && body(inv, 'bare').endsWith(NO_RUNS));
    for (const c of VARIANTS) assert.doesNotMatch(body(c, 'bare') + body(c, 'cases'), /ambicode(?!:task)/i, 'the bare prompt names no AMBICODE thing');
    assert.match(read(dirOf(plan, 'bare'), 'prompt.md'), /max_turns: 90\ntimeout_seconds: 2400/);
    assert.match(read(dirOf(plan, 'bare'), 'prompt.md'), /tags: \["task", "task-real", "task-real-plan", "feature"\]/);
    assert.match(read(dirOf(VARIANTS.find((v) => v.name === 'task-real-beta-inv'), 'bare'), 'prompt.md'), /max_turns: 60\ntimeout_seconds: 1500/);
  });

  it('every harness grader kind renders (file regex, trace regex, file_exists glob, llm on the final message); diff graders do not; the plugin arm adds route-done and, after a plan, plan-picked-up', () => {
    const dir = (c, arm) => path.join(dirOf(c, arm), 'graders');
    const [plan, inv] = VARIANTS;
    assert.match(read(dir(plan, 'cases'), 'file-has-token.md'), /type: regex[\s\S]*target: \{ source: file, path: src\/a\.ts \}\nweight: 2/);
    assert.match(read(dir(plan, 'cases'), 'no-copy.md'), /match: not_contains/);
    assert.match(read(dir(plan, 'cases'), 'wrote-both.md'), /target: trace/);
    assert.match(read(dir(plan, 'cases'), 'migration-present.md'), /type: file_exists\npath: migrations\/\*\.py/);
    assert.match(read(dir(plan, 'cases'), 'design.md'), /type: llm\nfocus: last_message\nweight: 1[\s\S]*PASS if layered/);
    assert.ok(!existsSync(path.join(dir(plan, 'cases'), 'diff-has-class.md')), 'a diff grader is not a harness grader');
    assert.ok(existsSync(path.join(dir(plan, 'cases'), 'route-done.md')));
    assert.match(read(dir(plan, 'cases'), 'plan-picked-up.md'), /rl-alphap\/plan\\\.md/);
    assert.ok(!existsSync(path.join(dir(inv, 'cases'), 'plan-picked-up.md')));
    assert.ok(!existsSync(path.join(dir(plan, 'bare'), 'route-done.md')));
  });

  it('the plugin arm seeds the note as an accepted plan or an investigation with a ledger line, switches the bench checks off and copies the seed; the bare arm has none of it', () => {
    const [plan, inv] = VARIANTS;
    const seed = (c) => path.join(dirOf(c, 'cases'), 'seed', 'tasks', c.slug);
    assert.match(read(seed(plan), 'plan.md'), /^---\nstatus: accepted\n---\n\n# Add export/);
    assert.match(read(seed(plan), 'ledger.jsonl'), /"note":"plan","path":".ambicode\/tasks\/rl-alphap\/plan.md"/);
    assert.match(read(seed(inv), 'investigation_2026-03-01T09-00.md'), /The list lives at/);
    for (const c of VARIANTS.filter((v) => v.note !== null)) {
      const plugin = read(dirOf(c, 'cases'), 'scaffold.sh');
      assert.match(plugin, /config-checks-off\.mjs'? \.ambicode\/config\.yaml/);
      assert.match(plugin, /cp -R "\$\(dirname "\$0"\)\/seed\/\." \.ambicode\//);
      assert.ok(!existsSync(path.join(dirOf(c, 'bare'), 'seed')));
    }
  });

  it('wroteLine matches one write call holding every token, and no read, grep or tool result', () => {
    const hit = new RegExp(wroteLine(['Base', 'class \\w+Repo']));
    assert.ok(hit.test(JSON.stringify({ name: 'Write', input: { file_path: 'x', content: 'class AbcRepo(Base):\n pass' } })));
    assert.ok(hit.test(`{"name":"Bash","input":{"command":"python3 - <<E\\nopen(p,'w').write('Base class AbcRepo')"}}`));
    assert.ok(!hit.test(`{"name":"Read","input":{"file_path":"x"}} Base class AbcRepo`));
    assert.ok(!hit.test('{"name":"Bash","input":{"command":"grep Base src; class AbcRepo"}}'));
    assert.ok(!hit.test(`${JSON.stringify({ name: 'Write', input: { content: 'Base' } })}\n${JSON.stringify({ name: 'Write', input: { content: 'class XRepo' } })}`), 'tokens on two lines are two calls');
  });

  it('the scaffold archives the parent commit; only the plugin arm copies the bench config, context and policies, and graders of the bare arm leave the ledger one out', () => {
    for (const c of VARIANTS) {
      const plugin = read(dirOf(c, 'cases'), 'scaffold.sh');
      const bare = read(dirOf(c, 'bare'), 'scaffold.sh');
      for (const script of [plugin, bare]) {
        assert.ok(script.includes(`archive --format=tar ${c.parent}`), c.name);
        assert.match(script, /git init -q/);
      }
      assert.match(plugin, /\.ambicode\/policies/);
      assert.match(plugin, /\[ ! -d \.ambicode\/context \] \|\| node .*context index/);
      assert.doesNotMatch(bare, /\.ambicode/);
    }
  });

  it('the raw variant is the task prompt alone: tag task-real-raw, no seed and no seed copy, no plan-picked-up, the same truth, graders and no-runs sentence', () => {
    const raw = VARIANTS.find((v) => v.name === 'task-real-alpha');
    const plan = VARIANTS.find((v) => v.name === 'task-real-alpha-plan');
    const body = (arm) => read(dirOf(raw, arm), 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '').trim();
    assert.equal(body('cases'), `/ambicode:task --task rl-alpha --headless ${FIXTURE[0].prompt} ${NO_RUNS}`);
    assert.equal(body('bare'), `${FIXTURE[0].prompt}\n\n${NO_RUNS}`);
    assert.match(read(dirOf(raw, 'cases'), 'prompt.md'), /tags: \["task", "task-real", "task-real-raw", "feature"\]/);
    assert.ok(!existsSync(path.join(dirOf(raw, 'cases'), 'seed')));
    assert.doesNotMatch(read(dirOf(raw, 'cases'), 'scaffold.sh'), /seed/);
    assert.match(read(dirOf(raw, 'cases'), 'scaffold.sh'), /config-checks-off/);
    assert.ok(!existsSync(path.join(dirOf(raw, 'cases'), 'graders', 'plan-picked-up.md')));
    assert.ok(existsSync(path.join(dirOf(raw, 'cases'), 'graders', 'route-done.md')));
    assert.equal(read(dirOf(raw, 'cases'), 'truth.json').replace(raw.name, plan.name), read(dirOf(plan, 'cases'), 'truth.json'));
  });

  it('run.mjs scores a real case on the workspace diff from its truth.json', () => {
    const results = mkdtempSync(path.join(tmpdir(), 'real-run-'));
    const result = path.join(results, 'plugin.json');
    const c = VARIANTS[0];
    const diff = path.join(results, 'run.diff');
    writeFileSync(diff, 'diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+class FooRepo {}\n');
    const raw = { startedAt: '2026-10-28T10:00:00.000Z', cases: [{ name: c.name, aggregates: { score: 0, passRate: 0 }, arms: { with: [{ graders: [{ name: 'harness', weight: 2, passed: true, scored: true }], changed: [...c.relevant, 'src/unrelated.ts'], diff }] } }] };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, { tracesRoot: path.join(results, 'traces'), harvest: () => {}, realTruthOf: () => realTruth(c.name, root), spawn: () => { writeFileSync(result, JSON.stringify(raw)); return 0; } });
    const metrics = JSON.parse(read(result)).cases[0].arms.with[0].metrics;
    assert.deepEqual([metrics.recall, metrics.extra], [1, ['src/unrelated.ts']]);
    const run = JSON.parse(read(result)).cases[0].arms.with[0];
    assert.deepEqual(run.graders.map((g) => [g.name, g.passed]), [['harness', true], ['diff-has-class', true]]);
    assert.equal(run.score, 1, 'the diff grader counts in the score with its weight');
    assert.equal(JSON.parse(read(result)).cases[0].aggregates.score, 1);
  });

  it('diff graders read the added lines of the files they name, a missing diff fails them, a guard on a missing diff holds only by not_contains', () => {
    const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-old Base\n+class XRepo(Base):\n+  pass\ndiff --git a/tests/t.py b/tests/t.py\nnew file mode 100644\n--- /dev/null\n+++ b/tests/t.py\n@@ -0,0 +1 @@\n+def test_issue(): pass\n';
    const g = (o) => gradeOne({ name: 'x', ...o }, diff);
    assert.ok(g({ pattern: 'class \\w+Repo' }).passed);
    assert.ok(!g({ pattern: 'old Base' }).passed, 'removed lines are not read');
    assert.ok(g({ pattern: 'test_issue', in: '^tests/' }).passed);
    assert.ok(!g({ pattern: 'class \\w+Repo', in: '^tests/' }).passed, 'a file the grader does not name is not read');
    assert.ok(g({ pattern: 'HttpClient', match: 'not_contains' }).passed);
    assert.ok(!gradeOne({ name: 'x', pattern: 'a' }, '').passed);
    assert.ok(gradeOne({ name: 'x', pattern: 'a', match: 'not_contains' }, '').passed);
  });

  it('an absent local file loads as no cases', () => {
    assert.deepEqual(loadRealCases(path.join(root, 'none.json')), { repos: {}, cases: [] });
  });
});

// The cases of the local file (gitignored, never in git), checked against the bench repositories they name: read-only git show/diff/ls-tree.
const { repos, cases } = loadRealCases();
const benchOf = (repo) => process.env[repos[repo]?.bench];
const have = (repo) => benchOf(repo) && existsSync(path.join(benchOf(repo), '.git'));
const git = (repo, ...args) => execFileSync('git', ['-C', benchOf(repo), ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const fileAt = (repo, rev, file) => {
  try { return git(repo, 'show', `${rev}:${file}`); } catch { return ''; }
};
const globToRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
const passes = (g, text) => new RegExp(g.kind === 'trace' && g.wrote ? wroteLine(g.wrote) : g.pattern).test(text) === ((g.match ?? 'contains') === 'contains');
// `path:line` and `path:from-to` citations of a note.
const citations = (text) => [...text.matchAll(/(?<![\w./-])((?:[\w@.-]+\/)+[\w@.-]+\.\w+):(\d+)(?:-(\d+))?/g)].map((m) => ({ file: m[1], line: Number(m[3] ?? m[2]) }));
// The trace of a perfect run: one Write call per file the real change added or modified, with the file's content at the real commit.
const syntheticTrace = (repo, commit, parent) => git(repo, 'diff', '--name-only', '--diff-filter=AM', parent, commit).split('\n').filter(Boolean)
  .map((file) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: `/work/${file}`, content: fileAt(repo, commit, file) } }] } })).join('\n');

describe('local real-change cases: shape', { skip: cases.length === 0 && 'no evals/local/real-cases.json' }, () => {
  it('names and task slugs are unique, and the prompts name no path and no identifier a grader looks for', () => {
    assert.equal(new Set(cases.map((c) => c.name)).size, cases.length);
    assert.equal(new Set(cases.map((c) => c.slug)).size, cases.length);
    for (const c of cases) {
      assert.ok(isRealCase(c.name) && /^[0-9a-f]{40}$/.test(c.parent) && /^[0-9a-f]{40}$/.test(c.commit) && c.repo in repos, c.name);
      assert.doesNotMatch(c.prompt, /[\w-]+\/[\w-]+|\.(ts|py|js|html|json)\b/, `${c.name}: no path`);
      const words = new Set(c.prompt.toLowerCase().match(/[a-z_][a-z0-9_]*/g));
      for (const g of c.graders) for (const token of (g.pattern ?? g.wrote?.join(' ') ?? '').match(/[a-z]+[A-Z]\w*|\w+_\w+/g) ?? []) assert.ok(!words.has(token.toLowerCase()), `${c.name}: prompt mirrors ${token} of ${g.name}`);
    }
  });

  it('every case declares its truth and has measuring graders, marked guards and exactly one llm judge with PASS and FAIL conditions', () => {
    for (const c of cases) {
      assert.ok(c.relevant.length >= 1, `${c.name}: relevant`);
      assert.ok(c.graders.some((g) => g.guard) && c.graders.some((g) => !g.guard && g.kind !== 'llm'), `${c.name}: guards and measuring graders`);
      assert.equal(c.graders.filter((g) => g.kind === 'llm').length, 1, `${c.name}: one llm grader`);
      for (const g of c.graders) {
        assert.ok(['file', 'trace', 'exists', 'diff', 'llm'].includes(g.kind), `${c.name}/${g.name}: kind`);
        if (g.kind === 'llm') {
          assert.match(g.rubric, /PASS[\s\S]*FAIL|FAIL[\s\S]*PASS/, `${c.name}: llm rubric needs both conditions`);
          assert.ok((g.weight ?? 1) <= 1, `${c.name}: the llm judge reads the final message, which differs between arms: weight 1`);
        }
        if (g.kind === 'diff') assert.ok(g.pattern, `${c.name}/${g.name}`);
        if (g.kind === 'trace') assert.ok(g.wrote || g.pattern, `${c.name}/${g.name}`);
        if (g.guard) assert.ok(g.kind === 'file' || g.match === 'not_contains', `${c.name}/${g.name}: a guard must hold on a parent with no trace`);
      }
      assert.ok(c.plan?.trim() && c.investigation?.trim(), `${c.name}: a plan and an investigation note`);
      assert.ok((c.limits?.max_turns ?? 60) >= 60 && (c.limits?.timeout_seconds ?? 1500) >= 1500, `${c.name}: limits`);
    }
  });
});

describe('local real-change cases against the bench repositories', () => {
  for (const c of cases) {
    it(`${c.name}: guards hold on the parent, measuring graders fail there and pass on the real change, and the truth is the real diff`, { skip: !have(c.repo) && `bench checkout not found (env ${repos[c.repo]?.bench})` }, () => {
      assert.equal(git(c.repo, 'rev-parse', `${c.commit}^1`).trim(), c.parent, 'parent');
      const realFiles = git(c.repo, 'ls-tree', '-r', '--name-only', c.commit).split('\n').filter(Boolean);
      const parentFiles = new Set(git(c.repo, 'ls-tree', '-r', '--name-only', c.parent).split('\n').filter(Boolean));
      const real = syntheticTrace(c.repo, c.commit, c.parent);
      const realDiff = git(c.repo, 'diff', c.parent, c.commit);
      for (const [kind, note] of [['plan', c.plan], ['investigation', c.investigation]]) {
        const cited = citations(note);
        assert.ok(cited.length >= 3, `${c.name}: the ${kind} cites at least three path:line`);
        for (const { file, line } of cited) {
          const text = fileAt(c.repo, c.parent, file);
          assert.ok(text !== '' && line <= text.split('\n').length, `${c.name}: ${kind} cites ${file}:${line}, which is not in the parent tree`);
        }
      }
      for (const g of c.graders) {
        if (g.kind === 'llm') continue;
        if (g.kind === 'exists') {
          const re = globToRegex(g.glob);
          assert.ok(realFiles.some((f) => re.test(f)), `${g.name}: a file of the real change matches the glob`);
          assert.ok(![...parentFiles].some((f) => re.test(f)), `${g.name}: measures nothing, the parent already has a match`);
        } else if (g.kind === 'diff') {
          assert.ok(gradeOne(g, realDiff).passed, `${g.name} accepts the diff of the real change`);
          assert.equal(gradeOne(g, '').passed, Boolean(g.guard), `${g.name}: ${g.guard ? 'a guard holds' : 'a measuring grader fails'} on a run that changed nothing`);
        } else if (g.kind === 'trace') {
          assert.ok(passes(g, real), `${g.name} accepts the trace of the real change`);
          assert.equal(passes(g, ''), Boolean(g.guard), `${g.name}: ${g.guard ? 'a guard holds' : 'a measuring grader fails'} on a run that wrote nothing`);
        } else {
          assert.ok(passes(g, fileAt(c.repo, c.commit, g.file)), `${g.name} accepts the real change`);
          const before = passes(g, fileAt(c.repo, c.parent, g.file));
          if (g.guard) assert.ok(before, `${g.name} is a guard: it must pass on the untouched parent`);
          else assert.ok(!before, `${g.name} measures nothing: it already passes on the parent`);
        }
      }
      const changed = git(c.repo, 'diff', '--name-only', c.parent, c.commit).split('\n').filter(Boolean);
      const within = (file) => c.relevant.includes(file) || c.allowed.some((item) => (item.endsWith('/') ? file.startsWith(item) : item === file));
      for (const file of c.relevant) assert.ok(changed.includes(file), `${file} is changed by the real commit`);
      assert.deepEqual(changed.filter((file) => !within(file)), [], 'every file of the real change is relevant or allowed');
    });
  }
});
