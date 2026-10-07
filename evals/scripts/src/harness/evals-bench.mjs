// Evaluation CLI and run ownership. Generation, evidence analysis, and reporting live in leaf modules.
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { BARE_RECALL_FILE, BENCHMARKS, CASES_DIRECTORY, CURATED_CASES, CURATED_EVAL_DIR, NAKED_PLUGIN, REPLAY_REPORTS, ROOT } from '../shared/bench-paths.mjs';
import { generate, refuseLegacyTwins, SELECT } from '../cases/bench-cases.mjs';
import { barePrecisionByCase, bareRecallByCase, score, withBaseline } from '../analysis/bench-score.mjs';
import { walkReport } from '../analysis/bench-walk.mjs';
import { casesLockStatus, lockCases, unlockCases } from './cases-lock.mjs';
import { LEDGER_DIRECTORY, tally } from '../analysis/ledger-metrics.mjs';
import { atomicWrite, FRONT_MATTER, GENERATION_MARKER, NAKED_COPY, outstandingSwap, PROMPT, promptBody, restorePrompts, swapInPluginPrompts, WITH_PROMPT } from './prompt-transport.mjs';
import { FORCED_REMOVED, harnessArgv, parseRunOptions, PATH_OPTIONS, resultLayout, runSpec } from './run-options.mjs';
import { trackSweep } from './sweep-events.mjs';
import { dryRunArgs, DEFAULT_RECORDINGS, replaySummary, reviewCaseNames, tuningSummaryOf } from '../analysis/model-free-runners.mjs';
import { harvestTraces, harvestedOfResult, removeSandboxes, sandboxIdsOfResult } from '../analysis/trace-analysis.mjs';

// Existing consumers can still import the approved APIs from the CLI.
export * from '../shared/bench-paths.mjs';
export * from '../cases/bench-cases.mjs';
export { baselineProvenance, namedFiles, NAKED_EQUIVALENCE, score, scoreAnswer, servedPromptLine, withBaseline } from '../analysis/bench-score.mjs';
export * from '../analysis/bench-walk.mjs';
export * from './cases-lock.mjs';
export * from '../analysis/ledger-metrics.mjs';
export * from './prompt-transport.mjs';
export * from './run-options.mjs';
export { infrastructureError } from './run-validity.mjs';
export { harvestTraces, harvestedOfResult, removeSandboxes, sandboxIdsOfResult, traceMetrics } from '../analysis/trace-analysis.mjs';

/** In the result's iteration `reports/`, else beside the result: either way gitignored, as it quotes the benchmark's answers. */
function walkPathOf(jsonPath) {
  const { iteration, reportsDir } = resultLayout(jsonPath);
  if (iteration) return path.join(reportsDir, 'walk.md');
  return path.join(reportsDir, `${path.basename(jsonPath, '.json').replace(/^eval-/, 'walk-')}.md`);
}

export const ITERATIONS_HEADER = `One row per iteration, appended when its run finishes. Times are UTC. Traces: harvested of those the result names.

| iteration | started | cases | tags | plugin | prompt | model | cost $ | duration | status | traces |
|---|---|---|---|---|---|---|---|---|---|---|
`;

/**
 * Copies the harness's `plugin-eval/` folder (the HTML report) from beside the result to
 * `<replayRoot>/<date>/<iteration>/`. Never replaces a copy already there; false when nothing was copied.
 */
export function saveReplayReport(iteration, resultFile, replayRoot = REPLAY_REPORTS) {
  const source = path.join(path.dirname(resultFile), 'plugin-eval');
  if (!existsSync(source)) return false;
  const target = path.join(replayRoot, path.basename(path.dirname(iteration)), path.basename(iteration));
  if (existsSync(target)) return false;
  cpSync(source, target, { recursive: true });
  return true;
}

/** Appends the run to its day's `iterations.md`, the summary log beside the iteration directories. */
function logIteration(iteration, written, { status, traces }) {
  const log = path.join(path.dirname(iteration), 'iterations.md');
  if (!existsSync(log)) writeFileSync(log, `# ${path.basename(path.dirname(path.dirname(iteration)))} — ${path.basename(path.dirname(iteration))}\n\n${ITERATIONS_HEADER}`);
  const minutes = Math.round((written?.durationSeconds ?? 0) / 60);
  const cost = typeof written?.costUsd === 'number' ? written.costUsd.toFixed(2) : '—';
  const state = written === null ? 'unreadable' : `${written.partial ? 'partial' : 'complete'}${status ? `, exit ${status}` : ''}`;
  const suite = written?.suite ?? {};
  const cells = [
    path.basename(iteration),
    written?.startedAt ?? '—',
    written?.cases?.length ?? '—',
    (suite.tagFilters ?? []).join(',') || '—',
    (suite.plugins ?? []).map((p) => p.name).join(',') || '—',
    suite.servedPrompt ?? '—',
    suite.modelOverride ?? '—',
    cost,
    `${minutes} min`,
    state,
    traces ?? '—',
  ];
  appendFileSync(log, `| ${cells.join(' | ')} |\n`);
}

function writeWalk(jsonPath, { tracesDir }) {
  const out = walkPathOf(jsonPath);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, walkReport(JSON.parse(readFileSync(jsonPath, 'utf8')), { tracesDir, source: path.basename(jsonPath) }));
  return out;
}

// Faster buys nothing (the final copy wins); slower risks missing a short run's whole window.
const HARVEST_INTERVAL_MS = 2_000;

const frontMatterOf = (file) => {
  const head = FRONT_MATTER.exec(readFileSync(file, 'utf8'))?.[0];
  return head ? (parseYaml(head.replace(/^---\n/, '').replace(/\n---\n?$/, '')) ?? {}) : {};
};

/**
 * The cases `claude plugin eval` would run from `casesDir`, filtered as 2.1.289 filters them (read from its
 * binary): `--case` is one glob over the name, and repeated `--tag` keeps a case carrying ANY of the tags.
 */
export function resolveCases(casesDir, { tags = [], caseGlob } = {}) {
  const glob = caseGlob === undefined ? null : new RegExp(`^${caseGlob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  const cases = [];
  for (const entry of readdirSync(casesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(casesDir, entry.name);
    const yamlFile = path.join(dir, 'case.yaml');
    const promptFileAt = path.join(dir, PROMPT);
    if (!existsSync(yamlFile) && !existsSync(promptFileAt)) continue;
    const top = { ...(existsSync(yamlFile) ? (parseYaml(readFileSync(yamlFile, 'utf8')) ?? {}) : {}), ...(existsSync(promptFileAt) ? frontMatterOf(promptFileAt) : {}) };
    const name = typeof top.name === 'string' && top.name ? top.name : entry.name;
    const caseTags = Array.isArray(top.tags) ? top.tags : [];
    if (glob && !glob.test(name)) continue;
    if (tags.length && !tags.some((t) => caseTags.includes(t))) continue;
    const kind = ['review', 'localize', 'task'].find((k) => caseTags.includes(k)) ?? 'other';
    cases.push({ name, directory: entry.name, dir, tags: caseTags, kind, hasWith: existsSync(path.join(dir, WITH_PROMPT)) });
  }
  return cases;
}

/** Task runs only: the sandbox repo's change against its base commit, untracked files included, beside the ledgers. */
export function harvestPatches(outDir, { sandboxRoots = [...new Set(['/tmp', tmpdir()])], git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }) } = {}) {
  for (const root of sandboxRoots) {
    let names = [];
    try { names = readdirSync(root).filter((name) => name.startsWith('e-')); } catch { continue; }
    for (const name of names) {
      const repo = path.join(root, name, 'home', 'cwd', 'repo');
      if (!existsSync(path.join(repo, '.git'))) continue;
      try {
        git(repo, ['add', '-A']);
        const patch = git(repo, ['diff', '--cached', '--binary', 'HEAD', '--', '.', ':(exclude).ambicode']);
        mkdirSync(path.join(outDir, 'patches'), { recursive: true });
        writeFileSync(path.join(outDir, 'patches', `${name}.patch`), patch);
      } catch { /* the sandbox may still be mid-write; the next pass retries */ }
    }
  }
}

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * Everything a run would do, decided before anything is spawned or changed: `run --dry-run` prints it and stops;
 * `runSweep` executes it. Refusals here cost nothing. `rest` is the raw arguments or `parseRunOptions`' result.
 */
export function planRun(rest, { benchmarks = BENCHMARKS, now = new Date(), env = process.env } = {}) {
  const spec = runSpec(Array.isArray(rest) ? parseRunOptions(rest) : rest, { now, benchmarks });
  return planSpec(spec, { benchmarks, env });
}

function planSpec(spec, { benchmarks, env }) {
  const { casesDir, prompt, ablation, plugin } = spec;
  // A result already there is earlier evidence: this run neither overwrites it nor reads it as its own.
  if (existsSync(spec.json)) throw new Error('the --json target already exists: an earlier result is never overwritten or read as this run\'s; pass a new path');
  if (!existsSync(casesDir)) throw new Error(`no generated cases at ${casesDir}: run \`npm run evals:${spec.set === 'full' ? 'generate' : 'select'}\` first`);
  if (existsSync(path.join(casesDir, GENERATION_MARKER))) throw new Error(`the generation of ${casesDir} was interrupted: recreate it with \`select --regenerate\``);
  refuseLegacyTwins(casesDir);
  const cases = resolveCases(casesDir, { tags: spec.tags, caseGlob: spec.caseGlob ?? undefined });
  if (cases.length === 0) throw new Error('no case matches the --tag/--case filter');
  const pluginName = JSON.parse(readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).name ?? null;
  if (prompt === 'with') {
    if (pluginName === NAKED_PLUGIN) throw new Error('--prompt with refused: the naked control plugin must serve the naked prompt.md');
    if (ablation !== 'none') throw new Error(`--prompt with needs --ablation none, not ${ablation ?? 'the harness default with-without'}: the swapped prompt would reach the no-plugin arm too`);
    const missing = cases.filter((c) => !c.hasWith).length;
    if (missing) throw new Error(`--prompt with refused: ${missing} of ${cases.length} selected case(s) have no ${WITH_PROMPT} (review and task prompts come with steps 07/08)`);
  }
  // A task case's reviewer must run live: an old recording would grade a different change.
  if (spec.set === 'task' && env.EVAL_AMBICODE_REVIEWER_REPLAY) throw new Error('--set task refuses EVAL_AMBICODE_REVIEWER_REPLAY: old reviewer recordings never apply to task cases');
  const marker = outstandingSwap(casesDir);
  // Bodies are read now, before any swap: prompt.md may hold the plugin prompt only while a swap is outstanding,
  // and then the naked copy is the naked prompt.
  const planned = cases.map((c) => {
    const swapped = marker?.cases.includes(c.directory);
    const nakedBody = promptBody(readFileSync(path.join(c.dir, swapped ? NAKED_COPY : PROMPT), 'utf8'));
    const withBody = c.hasWith ? promptBody(readFileSync(path.join(c.dir, WITH_PROMPT), 'utf8')) : null;
    return { ...c, served: prompt, nakedBody, withBody };
  });
  return {
    ...spec,
    argv: harnessArgv(spec),
    benchmarks,
    pluginName,
    trusted: plugin === ROOT ? 'the repository itself' : spec.trustPlugin ? '--trust-plugin given' : 'not asserted: the harness will ask before the first run',
    replay: env.EVAL_AMBICODE_REVIEWER_REPLAY ? 'set' : 'unset',
    outstandingSwap: marker ? marker.cases.length : 0,
    lockedBy: casesLockStatus(casesDir),
    cases: planned,
  };
}

// Tags the generators write; any other value could carry a name and is shown redacted.
const PLAIN_TAGS = new Set(['bench', 'localize', 'review', 'task', 'walk', 'reuse', 'impact']);

/** The plan with no prompt text, case name or identifying path: counts, kinds, digests and settings only. */
export function formatPlan(plan) {
  const where = (target) => {
    const resolved = path.resolve(target);
    const [label] = [['<benchmarks>', plan.benchmarks], ['<root>', ROOT], ['<plugin>', plan.plugin]].find(([, dir]) => !path.relative(dir, resolved).startsWith('..')) ?? ['<path>'];
    return `${label}/…/<name redacted>${path.extname(target)}`;
  };
  const harness = plan.harness.map(([name, ...values]) => {
    if (name === '--tag') return `--tag ${values.map((t) => (PLAIN_TAGS.has(t) ? t : '<tag redacted>')).join(' ')}`;
    if (!values.length) return name;
    if (name === '--case') return `--case <selector redacted; ${plan.cases.length} case(s) matched>`;
    if (PATH_OPTIONS.has(name)) return `${name} ${where(values[0])}${name === '--json' && !plan.jsonGiven ? ' (default)' : ''}`;
    return `${name} ${values[0]}`;
  });
  const kinds = tally(plan.cases.map((c) => c.kind));
  const pluginShown = plan.plugin === ROOT ? '<root>' : '<plugin dir>';
  const lock = plan.lockedBy;
  return [
    'dry run: nothing spawned, no prompt or case file changed',
    `plugin: ${pluginShown} (${plan.pluginName ?? 'unnamed'}); trust: ${plan.trusted}`,
    `set: ${plan.set}; cases: ${plan.cases.length} (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')})`,
    `served prompt: ${plan.prompt === 'with' ? `${WITH_PROMPT}, swapped into ${PROMPT} for the run and restored after; promptMarkdown records the naked prompt` : PROMPT}`,
    ...plan.cases.map((c, i) => `  case ${i + 1}: ${c.kind}, naked ${sha(c.nakedBody)}${c.withBody === null ? '' : `, with ${sha(c.withBody)}`}, serves ${c.served}`),
    `model: ${plan.model}; cap: $${plan.maxCostUsd}; runs: ${plan.runs ?? 'per case'}; ablation: ${plan.ablation ?? 'harness default (with-without)'}`,
    `reviewer replay: ${plan.replay}; outstanding swap: ${plan.outstandingSwap ? `${plan.outstandingSwap} case(s), restored before a real run` : 'none'}; cases lock: ${
      lock ? `${lock.state}, held by ${lock.purpose ?? 'unknown'}; a real run would ${lock.state === 'abandoned' ? 'recover it' : 'be refused'}` : 'free'
    }`,
    'hook support: not claimed (probe P37 pending); a dry run cannot show whether a typed command expands',
    `harness: claude plugin eval ${pluginShown} --eval-dir ${plan.evalDir} --scaffold --allow-tools Bash --no-publish`,
    `harness options: ${harness.join(' ')}`,
  ].join('\n');
}

/**
 * The served prompt's provenance in a result: `promptMarkdown` stays the naked prompt (what `withBaseline`
 * compares), `pluginPromptMarkdown` is what the plugin arm was actually served, `suite.servedPrompt` says which.
 */
export function recordServedPrompts(results, plan) {
  const byName = new Map(plan.cases.map((c) => [c.name, c]));
  const cases = (results.cases ?? []).map((evalCase) => {
    const planned = byName.get(evalCase.name);
    if (!planned) throw new Error(`the result holds case ${evalCase.name}, which the run did not plan`);
    const served = plan.prompt === 'with' ? planned.withBody : planned.nakedBody;
    if (evalCase.promptMarkdown !== served) throw new Error(`${evalCase.name}: the result records a prompt other than the ${plan.prompt} prompt that was served`);
    return plan.prompt === 'with' ? { ...evalCase, promptMarkdown: planned.nakedBody, pluginPromptMarkdown: served } : evalCase;
  });
  return { ...results, cases, suite: { ...results.suite, servedPrompt: plan.prompt } };
}

/**
 * The harness writes to a file only this invocation knows, created empty and exclusively beside the target; it
 * reaches the target by a hard link, which never replaces a file. So a run reads, annotates and walks only what
 * it wrote, whatever another run does to the same target meanwhile.
 */
function reserveResult(target) {
  const dir = path.dirname(target);
  mkdirSync(dir, { recursive: true });
  const reserved = path.join(dir, `.${path.basename(target, '.json')}.run-${randomUUID()}.json`);
  writeFileSync(reserved, '', { flag: 'wx' });
  return reserved;
}

/** Publishes `text` at `target` only if nothing is there; false when something is. */
function publishNew(target, { from, text }) {
  let source = from;
  if (text !== undefined) {
    source = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    writeFileSync(source, text, { flag: 'wx' });
  }
  try {
    linkSync(source, target);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    if (text !== undefined) rmSync(source, { force: true });
  }
}

function spawnClaude(argv) {
  const child = spawn('claude', argv, { stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * `run`: takes the cases lock, plans, restores what an abandoned owner left, swaps in the plugin prompts, spawns,
 * and restores and unlocks in `finally`, so a failure partway through a swap or a thrown spawn leaves prompt.md
 * naked. A kill skips `finally`; the dead owner's claim and the marker make the next run, `restore-prompts`,
 * `select` and `naked-arm.mjs` recover it. A naked run holds the lock too: it serves the same prompt files.
 */
export async function runSweep(rest, { benchmarks = BENCHMARKS, now = new Date(), spawnRun = spawnClaude, harvest = harvestTraces, clean = removeSandboxes, log = console.log, warn = console.error, env = process.env } = {}) {
  const options = parseRunOptions(rest);
  if (options.flags.has('--dry-run')) {
    log(formatPlan(planRun(options, { benchmarks, now, env })));
    return 0;
  }
  const spec = runSpec(options, { now, benchmarks });
  const lock = lockCases(spec.casesDir, `run (${spec.prompt} prompt)`);
  let plan;
  let reserved;
  try {
    plan = planSpec(spec, { benchmarks, env });
    reserved = reserveResult(plan.json);
  } catch (error) {
    unlockCases(lock);
    throw error;
  }
  const { casesDir, tracesDir } = plan;
  let status;
  const harvestErrors = new Set();
  const runs = Number(options.runs ?? 0);
  const tracker = trackSweep({ total: runs > 0 ? runs * plan.cases.length : null, file: env['EVAL_EVENTS_FILE'] ?? null, log });
  // A harvest failure is reported, never fatal to a paid sweep. Each distinct cause is printed once:
  // a pass every 2 s would flood the output, but a cause that changes mid-sweep must not hide.
  const pass = () => {
    try {
      tracker.tick();
      harvest(tracesDir);
      if (spec.set === 'task') harvestPatches(tracesDir);
    } catch (error) {
      if (!harvestErrors.has(error.message)) warn(`trace harvest failing: ${error.message}`);
      harvestErrors.add(error.message);
    }
  };
  try {
    try {
      if (lock.abandoned) log(`took over the cases lock of a process that is gone (${lock.abandoned.purpose ?? 'unknown purpose'})`);
      const restored = restorePrompts(casesDir, { lock });
      if (restored) log(`restored ${restored} naked prompt(s) left swapped by an interrupted run`);
      if (plan.prompt === 'with') swapInPluginPrompts(casesDir, plan.cases.map((c) => c.directory), { lock });
      pass(); // setInterval's first tick is a whole interval away; a short-lived sandbox would be missed.
      const timer = setInterval(pass, HARVEST_INTERVAL_MS);
      try {
        status = await spawnRun(harnessArgv(plan, { json: reserved }));
      } finally {
        clearInterval(timer);
        tracker.finish(status);
      }
    } finally {
      try {
        restorePrompts(casesDir, { lock });
      } finally {
        unlockCases(lock);
      }
    }
  } catch (error) {
    rmSync(reserved, { force: true });
    throw error;
  }
  pass();
  const kept = existsSync(tracesDir) ? readdirSync(tracesDir).filter((f) => f.endsWith('.jsonl')).length : 0;
  const ledgerRuns = existsSync(path.join(tracesDir, LEDGER_DIRECTORY)) ? readdirSync(path.join(tracesDir, LEDGER_DIRECTORY)).length : 0;
  const produced = (statSync(reserved, { throwIfNoEntry: false })?.size ?? 0) > 0;
  let completeness = '; harvest completeness unknown (the run wrote no result of its own)';
  let traceCount = null;
  if (produced)
    try {
      const { named, harvested, missing } = harvestedOfResult(reserved, tracesDir);
      completeness = `; the result names ${named}, ${harvested} of those harvested`;
      traceCount = `${harvested}/${named}`;
      if (missing.length > 0) warn(`not harvested (no trace copy): ${missing.join(', ')}`);
    } catch (error) {
      completeness = `; harvest completeness unknown (${error.message})`;
    }
  if (produced)
    try {
      clean(sandboxIdsOfResult(reserved));
    } catch (error) {
      warn(`kept sandboxes not removed: ${error.message}`);
    }
  log(
    `harvested ${kept} trace(s) and the ledgers of ${ledgerRuns} sandbox(es) to ${tracesDir}${completeness}` +
      `${harvestErrors.size ? ` (harvest reported ${harvestErrors.size} distinct failure(s): the set is incomplete)` : ''}`,
  );
  if (!produced) {
    rmSync(reserved, { force: true });
    if (plan.walk) warn('walkthrough: skipped, the run wrote no result of its own');
    return status || 1;
  }
  let written = null;
  try {
    written = JSON.parse(readFileSync(reserved, 'utf8'));
    const recorded = recordServedPrompts(written, plan);
    atomicWrite(reserved, `${JSON.stringify(recorded, null, 2)}\n`);
    written = recorded;
  } catch (error) {
    // Left as the harness wrote it: a gate then refuses the case's prompt instead of trusting an unverified one.
    warn(`served prompt not recorded: ${error.message}`);
    status ||= 1;
  }
  if (!publishNew(plan.json, { from: reserved })) {
    warn(`the result stays at ${reserved}: another file appeared at the --json target during the run and is never replaced`);
    if (plan.walk) warn('walkthrough: skipped, the result was not published');
    return status || 1;
  }
  rmSync(reserved);
  if (plan.iteration)
    try {
      saveReplayReport(plan.iteration, plan.json);
    } catch (error) {
      warn(`report not copied to eval-replay: ${error.message}`);
    }
  if (plan.iteration)
    try {
      logIteration(plan.iteration, written, { status, traces: traceCount });
    } catch (error) {
      warn(`iteration log not written: ${error.message}`);
    }
  if (plan.walk && written === null) {
    warn('walkthrough: skipped, the run\'s result is not readable JSON');
  } else if (plan.walk) {
    const walk = walkPathOf(plan.json);
    mkdirSync(path.dirname(walk), { recursive: true });
    const text = walkReport(written, { tracesDir, source: path.basename(plan.json) });
    if (publishNew(walk, { text })) log(`walkthrough: ${walk}`);
    else {
      warn('walkthrough: skipped, a file is already at its path and is never replaced');
      status ||= 1;
    }
  }
  return status;
}

export async function main(argv, options = {}) {
  const [command, ...rest] = argv;
  const taken = new Set();
  const option = (name) => {
    const i = rest.indexOf(name);
    if (i < 0) return undefined;
    taken.add(i).add(i + 1);
    return rest[i + 1];
  };
  /** `--baseline` records a naked result's per-case recall and precision in `bare-recall.json`; later selects read it back. No file, no discrimination. */
  const bareRates = (baselineAt) => {
    if (baselineAt !== undefined) {
      const result = JSON.parse(readFileSync(path.resolve(baselineAt), 'utf8'));
      const [recalls, precisions] = [bareRecallByCase(result), barePrecisionByCase(result)];
      const sorted = (map) => Object.fromEntries([...map].sort());
      writeFileSync(BARE_RECALL_FILE, `${JSON.stringify({ source: path.resolve(baselineAt), recalls: sorted(recalls), precisions: sorted(precisions) }, null, 2)}\n`);
      return { bare: recalls, barePrecision: precisions };
    }
    if (!existsSync(BARE_RECALL_FILE)) return {};
    const saved = JSON.parse(readFileSync(BARE_RECALL_FILE, 'utf8'));
    return { bare: new Map(Object.entries(saved.recalls)), barePrecision: new Map(Object.entries(saved.precisions ?? {})) };
  };
  const benchmarksAt = option('--benchmarks');
  const benchmarks = benchmarksAt === undefined ? BENCHMARKS : path.resolve(benchmarksAt);
  if (command === 'generate' || command === 'select') {
    if (rest.includes('--forced')) throw new Error(FORCED_REMOVED);
    const baselineAt = option('--baseline');
    const pick =
      command === 'select'
        ? {
            localize: Number(option('--localize') ?? SELECT.localize),
            review: Number(option('--review') ?? SELECT.review),
            ...(rest.includes('--candidates') ? { candidates: true } : {}),
            ...(rest.includes('--candidates') ? {} : bareRates(baselineAt)),
          }
        : null;
    const out = command === 'select' ? CURATED_CASES : undefined;
    const { out: outDir, written, refused, selection } = generate({ benchmarks, out, pick, regenerate: rest.includes('--regenerate') });
    for (const r of refused) console.log(`refused ${r.name}: ${r.reason}`);
    if (selection)
      for (const [side, kinds] of Object.entries(selection.sides))
        for (const [kind, s] of Object.entries(kinds))
          console.log(`${side} ${kind}: chose ${s.chosen.length} of ${s.eligible} eligible (${s.of} in all): ${s.chosen.map((c) => c.name).join(', ')}`);
    const bySide = {};
    for (const w of written) bySide[w.side] = (bySide[w.side] ?? 0) + 1;
    console.log(`wrote ${written.length} case(s) to ${outDir} (${Object.entries(bySide).map(([s, n]) => `${s} ${n}`).join(', ')}), refused ${refused.length}`);
    return 0;
  }
  if (command === 'run') return runSweep(rest.filter((_, i) => !taken.has(i)), { benchmarks, ...options });
  if (command === 'restore-prompts') {
    const pluginAt = option('--plugin');
    const casesDir = path.join(pluginAt === undefined ? ROOT : path.resolve(pluginAt), CURATED_EVAL_DIR, CASES_DIRECTORY);
    const restored = restorePrompts(casesDir);
    console.log(restored ? `restored ${restored} naked prompt(s) in ${casesDir}` : `no outstanding swap in ${casesDir}`);
    return 0;
  }
  if (command === 'score' || command === 'walk') {
    const tracesAt = option('--traces');
    const baselinePath = command === 'score' ? option('--baseline') : undefined;
    const [file] = rest.filter((_, i) => !taken.has(i));
    if (!file || !statSync(file, { throwIfNoEntry: false }))
      throw new Error(`usage: evals-bench.mjs ${command} <eval-results.json> [--traces <dir>]${command === 'score' ? ' [--baseline <with-without-results.json>]' : ''}`);
    const tracesDir = tracesAt ?? resultLayout(file).tracesDir;
    if (command === 'walk') {
      console.log(`walkthrough: ${writeWalk(file, { tracesDir })}`);
      return 0;
    }
    let results = JSON.parse(readFileSync(file, 'utf8'));
    if (baselinePath !== undefined) results = withBaseline(results, JSON.parse(readFileSync(baselinePath, 'utf8')), { baselinePath });
    console.log(JSON.stringify(score(results, { tracesDir }).arms, null, 2));
    return 0;
  }
  if (command === 'tuning-summary') {
    const [dir] = rest;
    if (!dir) throw new Error('usage: evals-bench.mjs tuning-summary <traces-dir>');
    console.log(JSON.stringify(tuningSummaryOf(path.resolve(dir)), null, 2));
    return 0;
  }
  if (command === 'task-suite') return runSweep(dryRunArgs(['--set', 'task'], rest), { benchmarks, ...options });
  if (command === 'live-review') {
    const [mode, ...more] = rest;
    if (mode === 'dry-run') return runSweep(dryRunArgs(['--set', 'curated', '--tag', 'review'], more), { benchmarks, ...options });
    if (mode === 'replay') {
      const file = path.resolve(more[0] ?? DEFAULT_RECORDINGS);
      console.log(JSON.stringify(replaySummary(JSON.parse(readFileSync(file, 'utf8')), reviewCaseNames()), null, 2));
      return 0;
    }
    throw new Error('usage: evals-bench.mjs live-review dry-run [run options] | live-review replay [<recordings.json>]');
  }
  throw new Error(
    'usage: evals-bench.mjs generate | select [--localize <n>] [--review <n>] [--candidates] [--baseline <naked eval.json>] [--regenerate] | run [--set curated|task|full --project <project>] [--plugin <dir>] [--prompt naked|with] [--dry-run] --model <m> --max-cost-usd <usd> [--walk] [options] | restore-prompts [--plugin <dir>] | score <eval-results.json> [--traces <dir>] [--baseline <file>] | walk <eval-results.json> [--traces <dir>] | tuning-summary <traces-dir> | task-suite [run options] | live-review dry-run [run options] | live-review replay [<recordings.json>]',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
