// Regression assertions moved intact from the approved harness suite.
import { describe, it, before, after } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { BENCH_PROJECTS, FULL_CASES_DIRECTORY, projectCasesDir, ROOT } from '../shared/bench-paths.mjs';
import assert from 'node:assert/strict';
import { CURATED_EVAL_DIR, formatPlan, generate, resolveCases, PROMPT, WITH_PROMPT, NAKED_COPY, promptBody, writePluginPrompt, pluginPrompt, swapInPluginPrompts, outstandingSwap, INVESTIGATE_COMMAND, REVIEW_COMMAND, restorePrompts, runSweep, withBaseline, planRun, CASES_LOCK, main, casesLockStatus, lockCases, unlockCases } from './evals-bench.mjs';
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { GENERATION_MARKER } from './prompt-transport.mjs';
import { syntheticBenchmarks, syntheticPlugin, sha256, snapshot, jsonOf, neverSpawn } from '../testing/bench-test-fixtures.mjs';
import { buildNaked } from '../arms/naked-arm.mjs';

describe('evals-bench: preset sets', () => {
  it('ignores the generated presets but their README, and plans a preset run with plan cases and no reviewer replay', () => {
    const ignored = (p) => spawnSync('git', ['check-ignore', '-q', p], { cwd: ROOT }).status === 0;
    assert.ok(ignored('evals/common/presets/light/be-vs-1-task/oracle.patch'));
    assert.ok(!ignored('evals/common/presets/README.md'));
    const root = mkdtempSync(path.join(tmpdir(), 'preset-plan-'));
    try {
      const plugin = path.join(root, 'plugin');
      mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
      writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'ambicode' }));
      for (const [name, kind] of [['be-1-plan', 'plan'], ['be-1-review', 'review']]) {
        const dir = path.join(plugin, 'evals', 'common', 'presets', 'light', name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, PROMPT), `---\nname: ${name}\ntags: ["bench", "${kind}", "be", "light"]\n---\n\nDo it.\n`);
      }
      const args = ['--set', 'preset', '--preset', 'light', '--plugin', plugin, '--model', 'm', '--max-cost-usd', '1', '--json', path.join(root, 'out', 'eval.json')];
      const plan = planRun(args, { benchmarks: root });
      assert.deepEqual(plan.cases.map((c) => c.kind), ['plan', 'review']);
      assert.match(formatPlan(plan), /set: preset; cases: 2 \(plan 1, review 1\)/);
      writeFileSync(path.join(plugin, 'evals', 'common', 'presets', 'light', GENERATION_MARKER), '');
      assert.throws(() => planRun(args, { benchmarks: root }), /interrupted: recreate it with `npm run evals:presets -- --regenerate`/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('restore-prompts takes a preset; judge-task refuses a missing model or cap before any call', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preset-cli-'));
    const logged = [];
    const log = console.log;
    try {
      await assert.rejects(main(['restore-prompts', '--preset', 'huge']), /--preset takes light, average, large, not huge/);
      mkdirSync(path.join(root, 'evals', 'common', 'presets', 'large'), { recursive: true });
      mkdirSync(path.join(root, 'evals', 'common', 'core', 'cases'), { recursive: true });
      console.log = (line) => logged.push(line);
      await main(['restore-prompts', '--plugin', root, '--preset', 'large']);
      await main(['restore-prompts', '--plugin', root, '--preset', 'average']);
      console.log = log;
      assert.deepEqual(logged, [`no outstanding swap in ${path.join(root, 'evals', 'common', 'presets', 'large')}`, `no outstanding swap in ${path.join(root, 'evals', 'common', 'core', 'cases')}`], 'the average preset is the core suite');
      await assert.rejects(main(['select', '--localize', '5']), /select no longer picks cases \(--localize\): the core suite is the average preset/);
      const results = path.join(root, 'eval.json');
      writeFileSync(results, JSON.stringify({ cases: [] }));
      await assert.rejects(main(['judge-task', results, '--max-cost-usd', '1']), /--model is required/);
      await assert.rejects(main(['judge-task', results, '--model', 'm']), /--max-cost-usd <usd> is required/);
      await assert.rejects(main(['judge-task', path.join(root, 'missing.json'), '--model', 'm', '--max-cost-usd', '1']), /usage: evals-bench\.mjs judge-task/);
    } finally {
      console.log = log;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: the curated cases stay out of git', () => {
  // check-ignore exits non-zero when the path is not ignored, which throws.
  const ignored = (p) => execFileSync('git', ['check-ignore', '-v', p], { cwd: ROOT, encoding: 'utf8' });

  it('ignores the curated cases and their results, wherever the data they are generated from lives', () => {
    assert.match(ignored(`${CURATED_EVAL_DIR}/cases/x`), /common\/core/);
    for (const project of BENCH_PROJECTS) assert.match(ignored(`evals/${project}/${FULL_CASES_DIRECTORY}/x`), new RegExp(project));
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
const FULL_SETS = BENCH_PROJECTS.map((project) => projectCasesDir(FULL_CASES_DIRECTORY, project)).filter(existsSync);

describe('evals-bench: the real benchmark stays out of git', { skip: FULL_SETS.length === 0 && 'no full sets here' }, () => {
  it('keeps every project suite folder ignored as a whole', () => {
    for (const project of BENCH_PROJECTS) assert.match(execFileSync('git', ['check-ignore', '-v', `evals/${project}/`], { cwd: ROOT, encoding: 'utf8' }), new RegExp(project));
  });

  it('has no ticket identifier in any tracked or addable file', () => {
    const ids = new Set();
    const dirs = (at) => (existsSync(at) ? readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(at, e.name)) : []);
    for (const caseDir of FULL_SETS.flatMap(dirs)) {
      const truth = path.join(caseDir, 'truth.json');
      const ticket = existsSync(truth) ? JSON.parse(readFileSync(truth, 'utf8')).ticket : undefined;
      if (typeof ticket === 'string' && ticket !== '') ids.add(ticket);
    }
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

describe('evals-bench: per-arm prompts', () => {
  let root;
  let benchmarks;
  let casesDir;
  let plugin;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-arms-'));
    benchmarks = syntheticBenchmarks(root);
    ({ plugin, casesDir } = syntheticPlugin(root, benchmarks));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('keeps the generated naked prompts byte-identical to the generator before per-arm prompts', () => {
    // Digests of what the unmodified generator wrote for this ticket (base revision 10cf672).
    const b = path.join(root, 'golden');
    const side = path.join(b, 'SIDE');
    mkdirSync(path.join(side, 'project', 'app', 'orders'), { recursive: true });
    mkdirSync(path.join(side, 'assets'), { recursive: true });
    mkdirSync(path.join(side, 'project', '.ambicode'), { recursive: true });
    writeFileSync(path.join(side, 'project', 'app', 'orders', 'service.ts'), 'x\n');
    writeFileSync(path.join(side, 'project', '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    writeFileSync(path.join(side, 'assets', 'T-1.md'), '# T\n\n## build:context prompt\n\nDiscount the order total.\n\n## TRUE RELATED CODE\n\n- `app/orders/service.ts`\n');
    const v = path.join(side, 'reviews', 'T-1', '7-abcdef12');
    mkdirSync(path.join(v, 'base'), { recursive: true });
    writeFileSync(path.join(v, 'absent.txt'), '');
    writeFileSync(path.join(v, 'change.patch'), '--- a/x\n+++ b/x\n+y\n');
    writeFileSync(path.join(v, 'threads.json'), JSON.stringify([{ path: 'app/orders/service.ts', newLine: 1, body: 'b' }]));
    const out = path.join(b, 'out');
    generate({ benchmarks: b, out });
    assert.equal(sha256(readFileSync(path.join(out, 'side-t-1', 'prompt.md'))), 'aedc1924c55d320e828db284e2ba4d22210fc4acd47c0ac11d665e7ce150e377');
    assert.equal(sha256(readFileSync(path.join(out, 'side-t-1-review-7-abcdef12', 'prompt.md'))), '4ab45f1b94afece458bbf040a338ad2451e50df96cc1d6712c2cf7746f1adefb');
  });

  it('types the investigate command before the first body line of a localize prompt, and changes nothing else', () => {
    const [localize] = resolveCases(casesDir, { tags: ['localize'] });
    const naked = readFileSync(path.join(localize.dir, PROMPT), 'utf8');
    const typed = readFileSync(path.join(localize.dir, WITH_PROMPT), 'utf8');
    assert.ok(readFileSync(path.join(localize.dir, NAKED_COPY)).equals(readFileSync(path.join(localize.dir, PROMPT))), 'the naked copy is a byte copy');
    const nakedLines = naked.split('\n');
    const typedLines = typed.split('\n');
    const changed = typedLines.flatMap((line, i) => (line === nakedLines[i] ? [] : [i]));
    assert.equal(typedLines.length, nakedLines.length);
    assert.equal(changed.length, 1);
    assert.equal(typedLines[changed[0]], `/ambicode:investigate --headless ${nakedLines[changed[0]]}`);
    assert.ok(promptBody(typed).startsWith('/ambicode:investigate --headless In the repository'));
    assert.doesNotMatch(typed, /--requirement/);
  });

  it('08-P1/08-P2: every review case types the review command, with no target flag, before its first body line; the naked bytes are kept', () => {
    const reviews = resolveCases(casesDir, { tags: ['review'] });
    assert.ok(reviews.length > 0);
    for (const review of reviews) {
      assert.ok(review.hasWith);
      const naked = readFileSync(path.join(review.dir, PROMPT), 'utf8');
      const typed = readFileSync(path.join(review.dir, WITH_PROMPT), 'utf8');
      assert.ok(readFileSync(path.join(review.dir, NAKED_COPY)).equals(readFileSync(path.join(review.dir, PROMPT))));
      assert.equal(typed, pluginPrompt(naked, REVIEW_COMMAND));
      assert.ok(promptBody(typed).startsWith('/ambicode:review --headless --answer estimate=run In the repository'));
      assert.doesNotMatch(typed, /--branch|--mr|--base/);
    }
  });

  it('exposes the same generator for a review case, for step 08', () => {
    const [review] = resolveCases(casesDir, { tags: ['review'] });
    const copy = path.join(root, 'review-hook', review.directory);
    mkdirSync(path.dirname(copy), { recursive: true });
    cpSync(review.dir, copy, { recursive: true });
    writePluginPrompt(copy, '/ambicode:review --headless');
    assert.ok(promptBody(readFileSync(path.join(copy, WITH_PROMPT), 'utf8')).startsWith('/ambicode:review --headless In the repository'));
    assert.ok(readFileSync(path.join(copy, NAKED_COPY)).equals(readFileSync(path.join(review.dir, PROMPT))));
    assert.throws(() => pluginPrompt('---\nname: x\n---\n\n', '/ambicode:review'), /no body line/);
    assert.throws(() => pluginPrompt('Body', 'review it'), /\/ambicode: command/);
  });

  it('swaps the plugin prompt in behind a marker, and restores the naked bytes', () => {
    const names = resolveCases(casesDir, { tags: ['localize'] }).map((c) => c.directory);
    const before = snapshot(casesDir);
    swapInPluginPrompts(casesDir, names);
    assert.deepEqual(outstandingSwap(casesDir).cases, names);
    for (const name of names) assert.ok(readFileSync(path.join(casesDir, name, PROMPT)).equals(readFileSync(path.join(casesDir, name, WITH_PROMPT))));
    assert.throws(() => swapInPluginPrompts(casesDir, names), /already outstanding/);
    assert.throws(() => writePluginPrompt(path.join(casesDir, names[0]), INVESTIGATE_COMMAND), /swap is outstanding/);
    assert.equal(restorePrompts(casesDir), names.length);
    assert.equal(restorePrompts(casesDir), 0, 'a second restore has nothing to do');
    assert.deepEqual(snapshot(casesDir), before);
  });

  it('refuses to swap over a prompt.md that is no longer the naked copy', () => {
    const [c] = resolveCases(casesDir, { tags: ['localize'] });
    const original = readFileSync(path.join(c.dir, PROMPT));
    writeFileSync(path.join(c.dir, PROMPT), `${original}edited\n`);
    try {
      assert.throws(() => swapInPluginPrompts(casesDir, [c.directory]), /differs from its naked copy/);
      assert.equal(outstandingSwap(casesDir), null);
    } finally {
      writeFileSync(path.join(c.dir, PROMPT), original);
    }
  });

  // Each call names a fresh result: an existing --json target is refused.
  let jsonCount = 0;
  let jsonPath;
  const jsonAt = () => jsonPath;
  const args = (...extra) => {
    jsonPath = path.join(benchmarks, 'results', `r-${++jsonCount}.json`);
    return ['--plugin', plugin, '--json', jsonPath, '--model', 'm', '--max-cost-usd', '1', ...extra];
  };

  /** Stands in for `claude plugin eval`: records each selected case's prompt.md body as the harness does. */
  const harness = (names, inspect = () => {}) => async (argv) => {
    const cases = names.map((name) => ({ name, promptMarkdown: promptBody(readFileSync(path.join(casesDir, name, PROMPT), 'utf8')), arms: { with: [{ turns: 1 }] } }));
    inspect(cases);
    writeFileSync(jsonOf(argv), JSON.stringify({ partial: false, claudeVersion: '2.1.289', suite: { modelOverride: 'm', plugins: [{ name: 'ambicode' }] }, cases }));
    return 0;
  };
  const quiet = { benchmarks: undefined, harvest: () => 0, clean: () => 0, log: () => {}, warn: () => {} };

  it('records the naked prompt as promptMarkdown and the served one as pluginPromptMarkdown', async () => {
    const localize = resolveCases(casesDir, { tags: ['localize'] });
    let served;
    const status = await runSweep(args('--tag', 'localize', '--ablation', 'none', '--prompt', 'with'), { ...quiet, benchmarks, spawnRun: harness(localize.map((c) => c.directory), (cases) => (served = cases)) });
    assert.equal(status, 0);
    assert.ok(served.every((c) => c.promptMarkdown.startsWith('/ambicode:investigate --headless')), 'the harness saw the plugin prompt');
    const result = JSON.parse(readFileSync(jsonAt(), 'utf8'));
    assert.equal(result.suite.servedPrompt, 'with');
    for (const c of result.cases) {
      const dir = localize.find((l) => l.name === c.name).dir;
      assert.equal(c.promptMarkdown, promptBody(readFileSync(path.join(dir, NAKED_COPY), 'utf8')));
      assert.equal(c.pluginPromptMarkdown, promptBody(readFileSync(path.join(dir, WITH_PROMPT), 'utf8')));
    }
    assert.equal(outstandingSwap(casesDir), null);
    const baseline = { partial: false, claudeVersion: '2.1.289', suite: { modelOverride: 'm', plugins: [{ name: 'naked' }] }, cases: result.cases.map((c) => ({ name: c.name, promptMarkdown: c.promptMarkdown, arms: { with: [{ turns: 2 }] } })) };
    assert.deepEqual(withBaseline(result, baseline, { baselinePath: 'b.json' }).cases[0].arms.without, [{ turns: 2 }], 'the naked baseline accepts a plugin-prompt run');
    assert.throws(() => withBaseline({ ...result, cases: served }, baseline, { baselinePath: 'b.json' }), /prompt differs/, 'an unrewritten result would be refused');
  });

  it('records a naked run as naked, and leaves its prompts alone', async () => {
    const localize = resolveCases(casesDir, { tags: ['localize'] });
    await runSweep(args('--tag', 'localize'), { ...quiet, benchmarks, spawnRun: harness(localize.map((c) => c.directory)) });
    const result = JSON.parse(readFileSync(jsonAt(), 'utf8'));
    assert.equal(result.suite.servedPrompt, 'naked');
    assert.ok(result.cases.every((c) => !('pluginPromptMarkdown' in c)));
  });

  it('restores the naked prompts when the spawn throws', async () => {
    const before = snapshot(casesDir);
    const throwing = async () => {
      assert.ok(outstandingSwap(casesDir), 'the marker is on disk while the run is out');
      throw new Error('spawn died');
    };
    await assert.rejects(runSweep(args('--tag', 'localize', '--ablation', 'none', '--prompt', 'with'), { ...quiet, benchmarks, spawnRun: throwing }), /spawn died/);
    assert.deepEqual(snapshot(casesDir), before);
  });

  it('restores a swap an interrupted run left before the next run serves anything', async () => {
    const localize = resolveCases(casesDir, { tags: ['localize'] });
    swapInPluginPrompts(casesDir, localize.map((c) => c.directory)); // the killed run never reached its finally
    const plan = planRun(args('--tag', 'localize'), { benchmarks });
    assert.ok(plan.cases.every((c) => !c.nakedBody.startsWith('/ambicode:')), 'the plan reads naked bodies from the naked copy');
    let seen;
    await runSweep(args('--tag', 'localize'), { ...quiet, benchmarks, spawnRun: harness(localize.map((c) => c.directory), (cases) => (seen = cases)) });
    assert.ok(seen.every((c) => !c.promptMarkdown.startsWith('/ambicode:')), 'the naked run was served naked prompts');
    assert.equal(outstandingSwap(casesDir), null);
  });

  it('refuses a plugin prompt for the naked control or a two-arm run, before spawning', async () => {
    const naked = syntheticPlugin(root, benchmarks, { name: 'naked' });
    const nakedArgs = ['--plugin', naked.plugin, '--json', path.join(benchmarks, 'results', 'naked-new.json'), '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize', '--ablation', 'none', '--prompt', 'with'];
    await assert.rejects(runSweep(nakedArgs, { ...quiet, benchmarks, spawnRun: neverSpawn }), /naked control plugin/);
    await assert.rejects(runSweep(args('--tag', 'localize', '--ablation', 'with-without', '--prompt', 'with'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /--ablation none/);
    await assert.rejects(runSweep(args('--tag', 'localize', '--prompt', 'with'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /harness default/);
    await assert.rejects(runSweep(args('--prompt', 'plugin'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /naked or with/);
    assert.equal(outstandingSwap(casesDir), null);
  });

  it('07-T4: a dry run names the eval dir of its set, not the curated one', () => {
    const plan = { set: 'task', evalDir: 'evals/common/task', plugin: ROOT, harness: [], cases: [], prompt: 'with', model: 'm', maxCostUsd: 1, runs: '1', ablation: 'none', replay: 'unset' };
    assert.match(formatPlan(plan), /--eval-dir evals\/common\/task --scaffold/);
  });

  it('dry-runs without spawning or touching a file, and prints no prompt or case name', async () => {
    const before = snapshot(root);
    const lines = [];
    const status = await runSweep(args('--tag', 'localize', '--ablation', 'none', '--prompt', 'with', '--dry-run'), { ...quiet, benchmarks, spawnRun: neverSpawn, log: (line) => lines.push(line) });
    assert.equal(status, 0);
    assert.deepEqual(snapshot(root), before);
    const out = lines.join('\n');
    assert.match(out, /^dry run: nothing spawned/);
    assert.match(out, /cases: 2 \(localize 2\)/);
    assert.match(out, /model: m; cap: \$1/);
    assert.match(out, /hook support: not claimed/);
    assert.match(out, /harness: claude plugin eval <plugin dir> --eval-dir evals\/common\/core/);
    assert.match(out, /harness options: --model m --max-cost-usd 1 --ablation none --json <benchmarks>\/…\/<name redacted>\.json --tag localize/);
    for (const c of resolveCases(casesDir)) assert.ok(!out.includes(c.name), 'no case name');
    assert.doesNotMatch(out, /Ticket \d|In the repository/, 'no prompt text');
    assert.ok(!out.includes(benchmarks), 'no benchmark path');
  });

  it('refuses tags the harness would OR together, and narrows walk to localize through select', async () => {
    await assert.rejects(runSweep(args('--tag', 'walk', '--tag', 'localize'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /ANY of these tags/);
    await assert.rejects(runSweep(args('--tag', 'walk', 'localize'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /ANY of these tags/, 'the variadic form too');
    assert.deepEqual(new Set(resolveCases(casesDir, { tags: ['walk'] }).map((c) => c.kind)), new Set(['localize', 'review']));
    const narrow = syntheticPlugin(root, benchmarks, { name: 'narrow', pick: { localize: 2, review: 0 } });
    assert.deepEqual(resolveCases(narrow.casesDir, { tags: ['walk'] }).map((c) => c.kind), ['localize', 'localize']);
    assert.equal(resolveCases(narrow.casesDir, { caseGlob: 'aa-*' }).length, 2);
  });
});

describe('evals-bench: one owner of the cases directory', () => {
  let root;
  let benchmarks;
  let casesDir;
  let plugin;
  let n = 0;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-lock-'));
    benchmarks = syntheticBenchmarks(root, { localize: 2, review: 1 });
    ({ plugin, casesDir } = syntheticPlugin(root, benchmarks, { pick: { localize: 2, review: 1 } }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  const fresh = () => path.join(benchmarks, 'results', `lock-${++n}.json`);
  const runArgv = (json, ...extra) => ['--plugin', plugin, '--json', json, '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize', ...extra];
  const quiet = { harvest: () => 0, clean: () => 0, log: () => {}, warn: () => {} };
  const localize = () => resolveCases(casesDir, { tags: ['localize'] });
  const writeResult = (argv, cases, extra = {}) => {
    writeFileSync(jsonOf(argv), JSON.stringify({ partial: false, claudeVersion: '2.1.289', suite: { modelOverride: 'm', plugins: [{ name: 'ambicode' }] }, cases, ...extra }));
  };
  const served = () => localize().map((c) => ({ name: c.name, promptMarkdown: promptBody(readFileSync(path.join(c.dir, PROMPT), 'utf8')), arms: { with: [{ turns: 1 }] } }));
  /** Plants a claim above the current top, as a process that took the lock and died (or lives elsewhere) leaves it. */
  const plantClaim = (owner) => {
    const dir = path.join(casesDir, CASES_LOCK);
    mkdirSync(dir, { recursive: true });
    const top = Math.max(0, ...readdirSync(dir).map((f) => Number(/^(\d{12})\.json$/.exec(f)?.[1] ?? 0)));
    writeFileSync(path.join(dir, `${String(top + 1).padStart(12, '0')}.json`), JSON.stringify(owner));
    return top + 1;
  };
  const deadLock = (purpose = 'run (with prompt)') => plantClaim({ pid: 99_999_999, host: hostname(), token: 'dead', purpose, at: '2026-10-04T00:00:00Z' });

  it('refuses a second run, restore-prompts, generation and the naked copy while a run holds the cases', async () => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    const json = fresh();
    const a = runSweep(runArgv(json, '--ablation', 'none', '--prompt', 'with'), {
      ...quiet,
      benchmarks,
      spawnRun: async (harnessArgv) => {
        await held;
        writeResult(harnessArgv, served().map((c) => ({ ...c })));
        return 0;
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const swapped = Object.fromEntries(localize().map((c) => [c.directory, readFileSync(path.join(c.dir, PROMPT))]));
      assert.ok(localize().every((c) => swapped[c.directory].equals(readFileSync(path.join(c.dir, WITH_PROMPT)))), 'run A serves the plugin prompts');
      await assert.rejects(runSweep(runArgv(fresh()), { ...quiet, benchmarks, spawnRun: neverSpawn }), /in use by run \(with prompt\)/, 'a naked run is refused too');
      assert.throws(() => restorePrompts(casesDir), /in use by run/);
      await assert.rejects(main(['restore-prompts', '--plugin', plugin]), /in use by run/);
      assert.throws(() => generate({ benchmarks, out: casesDir, pick: { localize: 2, review: 1 }, regenerate: true }), /in use by run/);
      assert.throws(() => buildNaked({ out: path.join(root, 'naked-out'), casesDir, benchmarks }), /in use by run/);
      assert.ok(!existsSync(path.join(root, 'naked-out')));
      for (const c of localize()) assert.ok(readFileSync(path.join(c.dir, PROMPT)).equals(swapped[c.directory]), 'run A\'s prompts were not touched');
    } finally {
      release();
    }
    assert.equal(await a, 0);
    assert.equal(casesLockStatus(casesDir), null);
    assert.equal(outstandingSwap(casesDir), null);
    for (const c of localize()) assert.ok(readFileSync(path.join(c.dir, PROMPT)).equals(readFileSync(path.join(c.dir, NAKED_COPY))));
  });

  it('recovers what a dead owner left: its lock and its swapped prompts', async () => {
    swapInPluginPrompts(casesDir, localize().map((c) => c.directory));
    deadLock();
    const logs = [];
    let seen;
    const json = fresh();
    const status = await runSweep(runArgv(json), {
      ...quiet,
      log: (line) => logs.push(line),
      benchmarks,
      spawnRun: async (harnessArgv) => {
        seen = served();
        writeResult(harnessArgv, seen);
        return 0;
      },
    });
    assert.equal(status, 0);
    assert.ok(seen.every((c) => !c.promptMarkdown.startsWith('/ambicode:')), 'the naked run was served naked prompts');
    assert.ok(logs.some((l) => /took over the cases lock/.test(l)) && logs.some((l) => l.startsWith(`restored ${localize().length} naked prompt`)));
    assert.equal(casesLockStatus(casesDir), null);
    swapInPluginPrompts(casesDir, localize().map((c) => c.directory));
    deadLock('restore-prompts');
    assert.equal(restorePrompts(casesDir), localize().length, 'restore-prompts recovers it too');
    assert.equal(casesLockStatus(casesDir), null);
  });

  it('tells a live owner from a dead one, and releases only its own claim', () => {
    const live = plantClaim({ pid: process.ppid, host: hostname(), token: 'other', purpose: 'run (naked prompt)', at: 'now' });
    assert.throws(() => lockCases(casesDir, 'test'), /in use by run \(naked prompt\)/);
    writeFileSync(path.join(casesDir, CASES_LOCK, `${String(live).padStart(12, '0')}.released`), '');
    const lock = lockCases(casesDir, 'test');
    assert.equal(lock.abandoned, null);
    assert.throws(() => lockCases(casesDir, 'again'), /in use by test/);
    assert.equal(unlockCases({ ...lock, token: 'forged' }), false, 'a forged token releases nothing');
    assert.throws(() => lockCases(casesDir, 'again'), /in use by test/);
    assert.equal(unlockCases(lock), true);
    assert.equal(unlockCases(lock), false, 'a second release of the same claim is refused');
    assert.equal(casesLockStatus(casesDir), null);
  });

  it('restores and unlocks when a swap fails partway, before anything is spawned', { skip: process.getuid?.() === 0 && 'root ignores directory modes' }, async () => {
    const before = snapshot(casesDir);
    const [, second] = localize();
    chmodSync(second.dir, 0o555);
    try {
      await assert.rejects(runSweep(runArgv(fresh(), '--ablation', 'none', '--prompt', 'with'), { ...quiet, benchmarks, spawnRun: neverSpawn }), /EACCES|permission denied/i);
    } finally {
      chmodSync(second.dir, 0o755);
    }
    assert.deepEqual(snapshot(casesDir), before, 'the first case is back to naked; no marker is left');
    assert.equal(casesLockStatus(casesDir), null);
  });
});

describe('evals-bench: a dry run names no case', () => {
  it('redacts case selectors and identity-bearing result paths', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bench-dry-'));
    try {
      const benchmarks = syntheticBenchmarks(root, { localize: 2, review: 1 });
      const { plugin, casesDir } = syntheticPlugin(root, benchmarks, { pick: { localize: 2, review: 1 } });
      const [c] = resolveCases(casesDir, { tags: ['localize'] });
      const results = path.join(benchmarks, 'results');
      const before = snapshot(root);
      const lines = [];
      const status = await runSweep(
        ['--plugin', plugin, '--model', 'm', '--max-cost-usd', '1', '--case', c.name, '--json', path.join(results, `${c.name}.json`), '--report', path.join(results, c.name, 'report.html'), '--output-dir', path.join(results, `${c.name}-agg`), '--dry-run'],
        { benchmarks, spawnRun: neverSpawn, harvest: () => 0, clean: () => 0, log: (line) => lines.push(line), warn: () => {} },
      );
      assert.equal(status, 0);
      assert.deepEqual(snapshot(root), before);
      const out = lines.join('\n');
      for (const secret of [c.name, c.directory, c.name.toUpperCase(), root, benchmarks]) assert.ok(!out.includes(secret), `the dry run printed ${secret}`);
      assert.match(out, /--case <selector redacted; 1 case\(s\) matched>/);
      assert.match(out, /--json <benchmarks>\/…\/<name redacted>\.json/);
      assert.match(out, /--report <benchmarks>\/…\/<name redacted>\.html/);
      assert.match(out, /cases: 1 \(localize 1\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: a run owns only the result it wrote', () => {
  let root;
  let benchmarks;
  let casesDir;
  let plugin;
  let n = 0;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-result-'));
    benchmarks = syntheticBenchmarks(root, { localize: 2, review: 1 });
    ({ plugin, casesDir } = syntheticPlugin(root, benchmarks, { pick: { localize: 2, review: 1 } }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => path.join(benchmarks, 'results', `eval-own-${++n}.json`);
  const argv = (json) => ['--plugin', plugin, '--json', json, '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize', '--walk'];
  const walkOf = (json) => path.join(path.dirname(json), `${path.basename(json, '.json').replace(/^eval-/, 'walk-')}.md`);
  const cases = () =>
    resolveCases(casesDir, { tags: ['localize'] }).map((c) => ({ name: c.name, promptMarkdown: promptBody(readFileSync(path.join(c.dir, PROMPT), 'utf8')), arms: { with: [{ turns: 1 }] } }));

  it('refuses an existing result before spawning, and leaves it byte-identical and unwalked', async () => {
    const json = fresh();
    mkdirSync(path.dirname(json), { recursive: true });
    const old = JSON.stringify({ partial: false, claudeVersion: '2.1.289', suite: { modelOverride: 'm' }, cases: [] });
    writeFileSync(json, old);
    await assert.rejects(runSweep(argv(json), { harvest: () => 0, clean: () => 0, log: () => {}, warn: () => {}, benchmarks, spawnRun: neverSpawn }), /already exists/);
    assert.equal(readFileSync(json, 'utf8'), old);
    assert.ok(!existsSync(walkOf(json)));
  });

  it('reports a failed run that wrote nothing as failed, and walks nothing', async () => {
    const json = fresh();
    const warnings = [];
    const status = await runSweep(argv(json), { harvest: () => 0, clean: () => 0, log: () => {}, warn: (w) => warnings.push(w), benchmarks, spawnRun: async () => 1 });
    assert.equal(status, 1);
    assert.ok(!existsSync(json) && !existsSync(walkOf(json)));
    assert.ok(warnings.some((w) => /walkthrough: skipped/.test(w)));
  });

  it('keeps and walks a partial result the failing run itself wrote', async () => {
    const json = fresh();
    const status = await runSweep(argv(json), {
      harvest: () => 0, clean: () => 0,
      log: () => {},
      warn: () => {},
      benchmarks,
      spawnRun: async (harnessArgv) => {
        writeFileSync(jsonOf(harnessArgv), JSON.stringify({ partial: true, claudeVersion: '2.1.289', suite: { modelOverride: 'm' }, cases: cases() }));
        return 2;
      },
    });
    assert.equal(status, 2);
    const result = JSON.parse(readFileSync(json, 'utf8'));
    assert.deepEqual([result.partial, result.suite.servedPrompt], [true, 'naked']);
    assert.ok(existsSync(walkOf(json)));
  });

  const resultsDir = () => path.join(benchmarks, 'results');
  const leftovers = () => readdirSync(resultsDir()).filter((f) => /\.run-|\.tmp$/.test(f));
  const quiet = { harvest: () => 0, clean: () => 0, log: () => {}, warn: () => {} };
  const write = (target, partial = false) => writeFileSync(target, JSON.stringify({ partial, claudeVersion: '2.1.289', suite: { modelOverride: 'm' }, cases: cases() }));

  it('does not take or annotate another run\'s result at the same target, and walks nothing from it', async () => {
    const other = syntheticPlugin(root, benchmarks, { name: 'other', pick: { localize: 2, review: 1 } });
    const json = fresh();
    let release;
    const held = new Promise((resolve) => (release = resolve));
    const warnings = [];
    const a = runSweep(argv(json), { ...quiet, warn: (w) => warnings.push(w), benchmarks, spawnRun: async () => (await held, 1) });
    await new Promise((resolve) => setImmediate(resolve));
    let b;
    try {
      // A different cases directory, so the cases lock does not serialize the two runs.
      b = await runSweep(['--plugin', other.plugin, '--json', json, '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize'], {
        ...quiet,
        benchmarks,
        spawnRun: async (harnessArgv) => (writeFileSync(jsonOf(harnessArgv), JSON.stringify({ partial: false, claudeVersion: '2.1.289', suite: { modelOverride: 'm', marker: 'B' }, cases: resolveCases(other.casesDir, { tags: ['localize'] }).map((c) => ({ name: c.name, promptMarkdown: promptBody(readFileSync(path.join(c.dir, PROMPT), 'utf8')), arms: { with: [{ turns: 1 }] } })) })), 0),
      });
    } finally {
      release();
    }
    assert.equal(b, 0);
    const published = readFileSync(json, 'utf8');
    assert.equal(await a, 1, 'A failed without output');
    assert.equal(readFileSync(json, 'utf8'), published, 'B\'s result is byte-identical after A finished');
    assert.equal(JSON.parse(published).suite.marker, 'B');
    assert.ok(!existsSync(walkOf(json)), 'A walked nothing');
    assert.ok(warnings.some((w) => /walkthrough: skipped, the run wrote no result of its own/.test(w)));
    assert.deepEqual(leftovers(), []);
  });

  it('keeps its own result private when another run published first, and never replaces that one', async () => {
    const other = syntheticPlugin(root, benchmarks, { name: 'third', pick: { localize: 2, review: 1 } });
    const json = fresh();
    const warnings = [];
    let mine;
    const status = await runSweep(argv(json), {
      ...quiet,
      warn: (w) => warnings.push(w),
      benchmarks,
      spawnRun: async (harnessArgv) => {
        mine = jsonOf(harnessArgv);
        write(mine);
        // Another run (another plugin's cases) finishes first at the same target.
        await runSweep(['--plugin', other.plugin, '--json', json, '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize'], {
          ...quiet,
          benchmarks,
          spawnRun: async (inner) => (writeFileSync(jsonOf(inner), JSON.stringify({ partial: false, suite: { marker: 'first' }, cases: [] })), 0),
        });
        return 0;
      },
    });
    assert.equal(status, 1);
    assert.equal(JSON.parse(readFileSync(json, 'utf8')).suite.marker, 'first', 'the earlier result stays');
    assert.ok(existsSync(mine), 'this run\'s result is kept where only it wrote');
    assert.equal(JSON.parse(readFileSync(mine, 'utf8')).suite.servedPrompt, 'naked', 'annotated in its private file');
    assert.ok(!existsSync(walkOf(json)));
    assert.ok(warnings.some((w) => /result stays at/.test(w)));
    rmSync(mine);
  });

  it('removes its private file and releases the cases when the spawn throws', async () => {
    const json = fresh();
    await assert.rejects(runSweep(argv(json), { ...quiet, benchmarks, spawnRun: async () => { throw new Error('spawn died'); } }), /spawn died/);
    assert.deepEqual(leftovers(), []);
    assert.ok(!existsSync(json) && !existsSync(walkOf(json)));
    assert.equal(casesLockStatus(casesDir), null);
  });

  it('never replaces an existing walkthrough', async () => {
    const json = fresh();
    mkdirSync(resultsDir(), { recursive: true });
    writeFileSync(walkOf(json), 'earlier walk\n');
    const warnings = [];
    const status = await runSweep(argv(json), { ...quiet, warn: (w) => warnings.push(w), benchmarks, spawnRun: async (harnessArgv) => (write(jsonOf(harnessArgv)), 0) });
    assert.equal(status, 1);
    assert.equal(readFileSync(walkOf(json), 'utf8'), 'earlier walk\n');
    assert.equal(JSON.parse(readFileSync(json, 'utf8')).suite.servedPrompt, 'naked', 'the result itself is published');
    assert.ok(warnings.some((w) => /walkthrough: skipped, a file is already at its path/.test(w)));
    assert.deepEqual(leftovers(), []);
  });

  it('publishes and walks an unannotatable result as the harness wrote it, and fails the run', async () => {
    const json = fresh();
    const warnings = [];
    const status = await runSweep(argv(json), {
      ...quiet,
      warn: (w) => warnings.push(w),
      benchmarks,
      spawnRun: async (harnessArgv) => (writeFileSync(jsonOf(harnessArgv), JSON.stringify({ partial: false, suite: {}, cases: [{ name: 'unplanned', promptMarkdown: 'x', arms: {} }] })), 0),
    });
    assert.equal(status, 1);
    assert.equal(JSON.parse(readFileSync(json, 'utf8')).suite.servedPrompt, undefined);
    assert.ok(warnings.some((w) => /served prompt not recorded/.test(w)));
    assert.ok(existsSync(walkOf(json)));
    assert.deepEqual(leftovers(), []);
  });
});

describe('evals-bench: review cases under the plugin prompt (08-P3)', () => {
  const CONFIG = ['schemaVersion: 3', 'baseline: ""', 'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }', 'checks: { timeoutSeconds: 120 }', 'requirements: { mcpServer: null }', 'projects:', '  - { id: app, root: ".", ecosystem: typescript }', ''].join('\n');
  let root;
  let benchmarks;
  let plugin;
  let casesDir;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-p3-'));
    benchmarks = syntheticBenchmarks(root, { localize: 0, review: 2 });
    for (const side of ['AA', 'BB']) {
      for (const t of [0, 1]) {
        const dir = path.join(benchmarks, side, 'reviews', `T-${t}`, `${t}-abcdef12`, 'base', 'app', 'orders');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'service.ts'), 'export const total = 0;\n');
      }
      writeFileSync(path.join(benchmarks, side, 'project', '.ambicode', 'config.yaml'), CONFIG);
    }
    ({ plugin, casesDir } = syntheticPlugin(root, benchmarks, { pick: { localize: 0, review: 2 } }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  const quiet = { benchmarks: undefined, harvest: () => 0, clean: () => 0, log: () => {}, warn: () => {} };

  it('08-P3: run --dry-run --prompt with lists the review cases and changes no file', async () => {
    const reviews = resolveCases(casesDir, { tags: ['review'] });
    assert.ok(reviews.length >= 2);
    const before = snapshot(root);
    const lines = [];
    const argv = ['--plugin', plugin, '--json', path.join(benchmarks, 'results', 'p3.json'), '--model', 'm', '--max-cost-usd', '1', '--tag', 'review', '--ablation', 'none', '--prompt', 'with', '--dry-run'];
    const status = await runSweep(argv, { ...quiet, benchmarks, spawnRun: neverSpawn, log: (line) => lines.push(line) });
    assert.equal(status, 0);
    assert.deepEqual(snapshot(root), before);
    const out = lines.join('\n');
    assert.match(out, new RegExp(`cases: ${reviews.length} \\(review ${reviews.length}\\)`));
    assert.match(out, /--tag review/);
    for (const review of reviews) assert.ok(!out.includes(review.name));
  });

  const scaffolded = () => {
    const [review] = resolveCases(casesDir, { tags: ['review'] });
    const work = mkdtempSync(path.join(root, 'work-'));
    execFileSync('sh', [path.join(review.dir, 'scaffold.sh')], { cwd: work });
    return path.join(work, 'repo');
  };
  const cli = (repo, ...argv) => spawnSync(process.execPath, [path.join(ROOT, 'src', 'cli', 'main.ts'), 'review', '--estimate', '--json', ...argv], { cwd: repo, encoding: 'utf8' });

  it('08-P3: review --estimate on the scaffold selects exactly the changed files and writes nothing', () => {
    const repo = scaffolded();
    const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean).map((line) => line.slice(3)).filter((file) => !file.startsWith('.ambicode'));
    assert.deepEqual(changed.sort(), ['app/orders/model.ts', 'app/orders/service.ts']);
    const outsideGit = () => Object.fromEntries(Object.entries(snapshot(repo)).filter(([file]) => !file.startsWith('.git') && file !== '.ambicode/metrics.jsonl'));
    const before = outsideGit();
    const run = cli(repo);
    assert.equal(run.status, 0, run.stderr);
    const { estimate } = JSON.parse(run.stdout);
    assert.equal(estimate.refusal, null);
    assert.equal(estimate.files, changed.length);
    const one = JSON.parse(cli(repo, '--only', 'app/orders/service.ts').stdout).estimate;
    assert.equal(one.files, 1);
    assert.deepEqual(outsideGit(), before);
  });

  it('08-P3: --branch excludes the uncommitted change: nothing to review or baseline-not-applicable', () => {
    const repo = scaffolded();
    const run = cli(repo, '--branch', '--base', 'HEAD');
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /error \[(nothing-to-review|baseline-not-applicable)\]/);
    assert.equal(run.stdout.includes('"files": 2'), false);
  });
});

describe('evals-bench: the HTML report is copied under eval-replay', () => {
  it('copies plugin-eval beside the result to <date>/<iteration>, and never replaces a copy', async () => {
    const { saveReplayReport } = await import('./evals-bench.mjs');
    const root = mkdtempSync(path.join(tmpdir(), 'replay-report-'));
    try {
      const iteration = path.join(root, 'outputs', 'core', '2026-10-07', '17_0452_x');
      mkdirSync(path.join(iteration, 'results', 'plugin-eval'), { recursive: true });
      writeFileSync(path.join(iteration, 'results', 'plugin-eval', 'report.html'), 'first');
      const replay = path.join(root, 'eval-replay');
      assert.equal(saveReplayReport(iteration, path.join(iteration, 'results', 'eval.json'), replay), true);
      assert.equal(readFileSync(path.join(replay, '2026-10-07', '17_0452_x', 'report.html'), 'utf8'), 'first');
      writeFileSync(path.join(iteration, 'results', 'plugin-eval', 'report.html'), 'second');
      assert.equal(saveReplayReport(iteration, path.join(iteration, 'results', 'eval.json'), replay), false);
      assert.equal(readFileSync(path.join(replay, '2026-10-07', '17_0452_x', 'report.html'), 'utf8'), 'first');
      rmSync(path.join(iteration, 'results', 'plugin-eval'), { recursive: true });
      assert.equal(saveReplayReport(iteration, path.join(iteration, 'results', 'eval.json'), path.join(root, 'other')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
