import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { INVESTIGATE_COMMAND, PLAN_COMMAND, PRESET_TASK_COMMAND, REVIEW_COMMAND } from '../harness/prompt-transport.mjs';
import { generatePreset, PRESET_PEEK, walkCases } from './preset-cases.mjs';
import { CURATED_CASES, presetCasesDir } from '../shared/bench-paths.mjs';

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const put = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
// A token only the oracle carries: no model-visible file may contain it.
const SECRET = 'oracleOnlyToken';
const ORACLE = `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-base();\n+${SECRET}();\ndiff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+fresh();\n`;
const REVIEWED = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-base();\n+reviewed();\n';

describe('preset-cases', () => {
  let top;
  let base;
  let out;
  let result;
  const source = (id, { review = true, preset = 'light' } = {}) => {
    const dir = path.join(top, 'presets', 'light', id);
    const evaluation = (skill, extra = {}) => ({ eligible: true, prompt: `prompts/${skill}.md`, fixture_commit: base, ...extra });
    put(path.join(dir, 'case.json'), JSON.stringify({
      id, preset, project: 'BE-express', ticket: id.toUpperCase(),
      implementation: { base },
      review: review ? { version: '1-abc', base } : null,
      evaluations: {
        investigate: evaluation('investigate'),
        plan: evaluation('plan'),
        task: evaluation('task'),
        review: review ? evaluation('review', { oracle: 'oracle/review/threads.json', input_patch: 'oracle/review/change.patch' }) : { eligible: false },
        init: evaluation('init'),
        rules: evaluation('rules'),
      },
    }));
    for (const skill of ['investigate', 'plan', 'task', 'review', 'init', 'rules']) put(path.join(dir, 'prompts', `${skill}.md`), `Do the ${skill} work in \`repo/\`.\n`);
    put(path.join(dir, 'prompt.md'), 'ticket');
    put(path.join(dir, 'inputs', 'package.json'), '{}');
    put(path.join(dir, 'oracle', 'base-files.tar.gz'), 'tar');
    put(path.join(dir, 'oracle', 'rules.json'), '{}');
    put(path.join(dir, 'oracle', 'changed-files.json'), JSON.stringify({ touched: ['src/a.ts', 'src/new.ts'], existing_at_base: ['src/a.ts'], created: ['src/new.ts'], deleted: [] }));
    put(path.join(dir, 'oracle', 'change.patch'), ORACLE);
    if (review) {
      put(path.join(dir, 'oracle', 'review', 'change.patch'), REVIEWED);
      put(path.join(dir, 'oracle', 'review', 'threads.json'), JSON.stringify([
        { path: 'src/a.ts', newLine: 1, body: 'Wrong call here.', classification: { label: 'defect' } },
        { path: 'src/a.ts', newLine: 1, body: 'Rename it.' },
      ]));
    }
  };
  const runScaffold = (caseDir, name) => {
    const work = path.join(top, 'work', name);
    mkdirSync(work, { recursive: true });
    const run = spawnSync('sh', [path.join(caseDir, 'scaffold.sh')], { cwd: work, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return path.join(work, 'repo');
  };

  before(() => {
    top = mkdtempSync(path.join(tmpdir(), 'preset-cases-'));
    const cache = path.join(top, 'work-cache');
    mkdirSync(cache, { recursive: true });
    git(cache, 'init', '-q');
    put(path.join(cache, 'src/a.ts'), 'base();\n');
    put(path.join(cache, 'package.json'), '{}\n');
    git(cache, 'add', '-A');
    git(cache, 'commit', '-q', '-m', 'base');
    base = git(cache, 'rev-parse', 'HEAD');
    git(top, 'clone', '-q', '--bare', cache, path.join(top, 'benchmarks', 'BE-express', '.git'));
    put(path.join(top, 'benchmarks', 'BE-express', 'project', '.ambicode', 'config.yaml'), 'version: 3\n');
    source('be-vs-1');
    source('be-vs-2', { review: false });
    out = path.join(top, 'plugin', 'evals', 'common', 'presets', 'light');
    result = generatePreset({ preset: 'light', presets: path.join(top, 'presets'), benchmarks: path.join(top, 'benchmarks'), out });
  });
  after(() => rmSync(top, { recursive: true, force: true }));

  it('writes one case per eligible requested skill, never init or rules, and a manifest', () => {
    assert.deepEqual(readdirSync(out).filter((e) => !e.startsWith('.')).sort(), ['be-vs-1-investigate', 'be-vs-1-plan', 'be-vs-1-review', 'be-vs-1-task', 'be-vs-2-investigate', 'be-vs-2-plan', 'be-vs-2-task', 'manifest.json']);
    const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.counts, { investigate: 2, plan: 2, task: 2, review: 1 });
    assert.match(manifest.sources['be-vs-1'], /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.written.length, 7);
  });

  it('tags one walkthrough case per skill and project, and lists them in the manifest', () => {
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')).walk, ['be-vs-1-investigate', 'be-vs-1-plan', 'be-vs-1-review', 'be-vs-1-task']);
    const tags = (name) => /^tags: (.*)$/m.exec(readFileSync(path.join(out, name, 'prompt.md'), 'utf8'))[1];
    assert.match(tags('be-vs-1-plan'), /"walk"/);
    assert.doesNotMatch(tags('be-vs-2-plan'), /"walk"/);
    const s = (id, project, touched, skills = ['investigate', 'review']) => ({ touched, source: { id, project, evaluations: Object.fromEntries(skills.map((k) => [k, { eligible: true }])) } });
    const walk = walkCases([s('be-b', 'BE', 3), s('be-a', 'BE', 3), s('be-c', 'BE', 1, ['investigate']), s('fe-a', 'FE', 9)]);
    assert.deepEqual([...walk].sort(), ['be-a-review', 'be-c-investigate', 'fe-a-investigate', 'fe-a-review'], 'fewest touched files, then the first id; a skill the ticket is not eligible for is not walked');
  });

  it('writes the average preset into the core suite', () => {
    assert.equal(presetCasesDir('average'), CURATED_CASES);
    assert.match(presetCasesDir('light'), /[/\\]evals[/\\]common[/\\]presets[/\\]light$/);
  });

  it('copies only what a run and its score need: no archives, inputs or other skills\' oracles', () => {
    const files = (dir) => readdirSync(dir, { recursive: true }).filter((f) => !f.startsWith('graders')).sort();
    const common = ['case.yaml', 'prompt.md', 'prompt.naked.md', 'prompt.with.md', 'scaffold.sh', 'truth.json'];
    assert.deepEqual(files(path.join(out, 'be-vs-1-investigate')), common);
    assert.deepEqual(files(path.join(out, 'be-vs-1-task')), ['oracle.patch', ...common].sort());
    assert.deepEqual(files(path.join(out, 'be-vs-1-review')), [...common, 'review', path.join('review', 'change.patch')].sort());
  });

  it('serves the skill prompt with its command, tags, tools and limits, and no oracle bytes', () => {
    const commands = { investigate: INVESTIGATE_COMMAND, plan: PLAN_COMMAND, task: PRESET_TASK_COMMAND, review: REVIEW_COMMAND };
    for (const [skill, command] of Object.entries(commands)) {
      const dir = path.join(out, `be-vs-1-${skill}`);
      const naked = readFileSync(path.join(dir, 'prompt.md'), 'utf8');
      assert.match(naked, new RegExp(`Do the ${skill} work`));
      assert.match(naked, /tags: \["bench", "(localize|plan|task|review)", "be", "walk", "light"\]/);
      assert.ok(readFileSync(path.join(dir, 'prompt.with.md'), 'utf8').includes(`${command} Do the ${skill} work`));
      for (const file of ['prompt.md', 'prompt.with.md', 'case.yaml', 'scaffold.sh']) assert.ok(!readFileSync(path.join(dir, file), 'utf8').includes(SECRET), `${skill}/${file}`);
    }
    assert.match(readFileSync(path.join(out, 'be-vs-1-task', 'prompt.md'), 'utf8'), /allowed_tools: \[Read, Glob, Grep, Bash, Edit, Write, Skill\]\nmax_turns: 80|max_turns: 80[\s\S]*allowed_tools: \[Read, Glob, Grep, Bash, Edit, Write, Skill\]/);
    assert.match(readFileSync(path.join(out, 'be-vs-1-investigate', 'prompt.md'), 'utf8'), /allowed_tools: \[Read, Glob, Grep, Bash, Skill\]/);
  });

  it('writes per-skill truth and graders', () => {
    const truth = (name) => JSON.parse(readFileSync(path.join(out, name, 'truth.json'), 'utf8'));
    assert.deepEqual(truth('be-vs-1-investigate'), { kind: 'localize', preset: 'light', side: 'BE-express', ticket: 'BE-VS-1', root: 'src', truth: ['src/a.ts', 'src/new.ts'], existing: ['src/a.ts'], created: ['src/new.ts'], deleted: [] });
    assert.equal(truth('be-vs-1-plan').kind, 'plan');
    assert.deepEqual([truth('be-vs-1-task').kind, truth('be-vs-1-task').oracle], ['task', 'oracle.patch']);
    assert.equal(readFileSync(path.join(out, 'be-vs-1-task', 'oracle.patch'), 'utf8'), ORACLE);
    assert.deepEqual(truth('be-vs-1-review'), { kind: 'review', preset: 'light', side: 'BE-express', ticket: 'BE-VS-1', root: 'src', version: '1-abc', threads: 2, labels: ['defect', 'unclassified'] });
    const graders = (name) => readdirSync(path.join(out, name, 'graders')).sort();
    const peek = ['no-peek-bash.md', 'no-peek-glob.md', 'no-peek-grep.md', 'no-peek-read.md'];
    assert.deepEqual(graders('be-vs-1-investigate'), ['names-a-true-file.md', 'no-code-edit.md', 'no-code-write.md', ...peek].sort());
    assert.deepEqual(graders('be-vs-1-plan'), graders('be-vs-1-investigate'));
    assert.deepEqual(graders('be-vs-1-task'), peek);
    assert.deepEqual(graders('be-vs-1-review'), [...peek, 'raises-01.md', 'raises-02.md'].sort());
    assert.ok(readFileSync(path.join(out, 'be-vs-1-task', 'graders', 'no-peek-read.md'), 'utf8').includes(`input_match: '${PRESET_PEEK}'`));
    const write = readFileSync(path.join(out, 'be-vs-1-plan', 'graders', 'no-code-write.md'), 'utf8');
    const pattern = new RegExp(/input_match: '(.*)'/.exec(write)[1]);
    assert.ok(pattern.test('{"file_path":"/x/repo/src/a.ts"}') && pattern.test('{"file_path":"/x/repo/package.json"}'));
    assert.ok(!pattern.test('{"file_path":"/x/repo/.ambicode/task/t/steps/plan-body.md"}'), 'the plan body is not a code write');
  });

  it('scaffolds the whole base tree; the review applies its patch uncommitted, the task leaves a clean tree its oracle applies to', () => {
    const task = runScaffold(path.join(out, 'be-vs-1-task'), 'task');
    assert.equal(readFileSync(path.join(task, 'src/a.ts'), 'utf8'), 'base();\n');
    assert.ok(existsSync(path.join(task, 'package.json')), 'files outside the code root are there');
    assert.equal(git(task, 'status', '--porcelain'), '');
    git(task, 'apply', '--check', path.join(out, 'be-vs-1-task', 'oracle.patch'));
    const review = runScaffold(path.join(out, 'be-vs-1-review'), 'review');
    assert.equal(git(review, 'status', '--porcelain'), 'M src/a.ts');
    assert.equal(readFileSync(path.join(review, 'src/a.ts'), 'utf8'), 'reviewed();\n');
  });

  it('regenerates in place, and refuses a source whose case.json names another preset', () => {
    generatePreset({ preset: 'light', presets: path.join(top, 'presets'), benchmarks: path.join(top, 'benchmarks'), out });
    assert.equal(readdirSync(out).filter((e) => e.startsWith('be-vs-')).length, 7);
    source('be-vs-3', { preset: 'large' });
    assert.throws(() => generatePreset({ preset: 'light', presets: path.join(top, 'presets'), benchmarks: path.join(top, 'benchmarks'), out }), /names large\/be-vs-3/);
    rmSync(path.join(top, 'presets', 'light', 'be-vs-3'), { recursive: true });
    assert.throws(() => generatePreset({ preset: 'light', presets: path.join(top, 'presets'), benchmarks: path.join(top, 'benchmarks'), out }), /interrupted|--regenerate/, 'the failed generation left its marker');
    generatePreset({ preset: 'light', presets: path.join(top, 'presets'), benchmarks: path.join(top, 'benchmarks'), out, regenerate: true });
  });
});
