// Runs as the operator because `claude plugin eval`'s sandbox hides the login. Compares `ambicode`
// (the built `review --json`) with `plain`: the same isolated `claude` process without AMBICODE's
// prompt, bundle, checks or validation. `record` turns `ambicode` answers into replay recordings.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../../../src/config/defaults.ts';
import { systemClock } from '../../../src/ports/clock.ts';
import { nodeFileSystem } from '../../../src/ports/filesystem.ts';
import { NodeProcessRunner } from '../../../src/ports/node-process-runner.ts';
import { ClaudeReviewer } from '../../../src/review/claude-reviewer.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EVALS = path.join(ROOT, 'evals', 'evals-archived', 'typescript');
const AMBICODE = path.join(ROOT, 'scripts', 'ambicode.mjs');
const ARMS = ['ambicode', 'plain'];

// The reviewer timeout (DEFAULTS.review.timeoutSeconds) plus the checks the
// review runs before it; `regression-ts` runs jest and eslint.
const AMBICODE_TIMEOUT_MS = (DEFAULTS.review.timeoutSeconds + 300) * 1000;

// One neutral line rather than an empty file, so the plain arm is "Claude Code, asked
// to review", not an untested empty-prompt edge of the CLI.
const PLAIN_SYSTEM_PROMPT = 'You are reviewing a code change for its author.';

export async function loadScaffolds(evalsDirectory = EVALS) {
  const scaffolds = [];
  for (const entry of await readdir(evalsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'results') continue;
    const directory = path.join(evalsDirectory, entry.name);
    const source = await readFile(path.join(directory, 'scaffold.sh'), 'utf8');
    const fixture = /materialize\.mjs" ([a-z0-9-]+)/.exec(source)?.[1];
    if (!fixture) throw new Error(`${entry.name}/scaffold.sh materializes no fixture`);
    scaffolds.push({ name: entry.name, directory, source, fixture });
  }
  return scaffolds;
}

async function reviewCases(evalsDirectory, only) {
  const cases = [];
  for (const scaffold of await loadScaffolds(evalsDirectory)) {
    const fired = await readFile(path.join(scaffold.directory, 'graders', 'plugin-fired.md'), 'utf8').catch(() => '');
    if (!fired.includes('"ambicode:review"')) continue;
    if (only.length > 0 && !only.includes(scaffold.name)) continue;
    const prompt = await readFile(path.join(scaffold.directory, 'prompt.md'), 'utf8');
    const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(prompt)?.[1]?.trim();
    if (!body) throw new Error(`${scaffold.name}/prompt.md has no body`);
    cases.push({ ...scaffold, prompt: body });
  }
  const unknown = only.filter((name) => !cases.some((c) => c.name === name));
  if (unknown.length > 0) throw new Error(`not a review case: ${unknown.join(', ')}`);
  if (cases.length === 0) throw new Error(`no review case under ${evalsDirectory}`);
  return cases;
}

/** mulberry32: a seeded shuffle, so a sheet and its key can be rebuilt exactly. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sheet names neither the arm nor the run; rows are shuffled across cases. */
export function blindSheet(runs, seed) {
  const rows = runs.flatMap((run) =>
    (run.findings ?? []).map((finding, index) => ({ run, finding, index })),
  );
  const next = random(seed);
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const id = (i) => `F${String(i + 1).padStart(3, '0')}`;
  return {
    sheet: [
      ['id', 'case', 'path', 'line', 'claim', 'label', 'notes'],
      ...rows.map(({ run, finding }, i) => [id(i), run.case, finding.path, finding.line, finding.claim, '', '']),
    ],
    key: [
      ['id', 'case', 'arm', 'run', 'finding'],
      ...rows.map(({ run, index }, i) => [id(i), run.case, run.arm, run.run, index]),
    ],
  };
}

function csv(rows) {
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

function normalize(finding) {
  const { location } = finding;
  return { path: location.newPath ?? location.oldPath, line: location.line, side: location.side, claim: finding.explanation };
}

function firstLines(text, count = 3) {
  return text.trim().split('\n').slice(0, count).join(' ').slice(0, 500);
}

async function requirementEvidence(directory) {
  const file = path.join(directory, 'requirement-evidence.json');
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text === null) return null;
  return { text, urls: JSON.parse(text).sources.map((source) => source.url) };
}

function ambicodeJson(directory, evidence, command, env = process.env) {
  const args = [AMBICODE, command, '--json'];
  for (const url of evidence?.urls ?? []) args.push('--requirement', url);
  if (evidence) args.push('--evidence', '-');
  const child = spawnSync(process.execPath, args, {
    cwd: path.join(directory, 'repo'),
    input: evidence?.text ?? '',
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: AMBICODE_TIMEOUT_MS,
  });
  const raw = { argv: args.slice(1), exitCode: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr };
  let output = null;
  try {
    output = JSON.parse(child.stdout);
  } catch {
    // Reported by the caller as a failed run with the process's own diagnostic.
  }
  if (output?.command !== command) {
    const detail = child.error?.message ?? (firstLines(child.stderr ?? '') || `exit ${child.status}`);
    return { output: null, detail, raw };
  }
  raw.stdout = output;
  return { output, detail: null, raw };
}

async function runAmbicode(directory, evidence) {
  const started = Date.now();
  const { output, detail, raw } = ambicodeJson(directory, evidence, 'review');
  const wallMs = Date.now() - started;
  if (output === null) return { status: 'failed', reason: 'review-command-failed', detail, wallMs, raw };
  const reviewer = output.result.reviewer;
  const common = {
    wallMs,
    reviewerMs: reviewer?.durationMs ?? null,
    costUsd: reviewer?.usage?.costUsd ?? null,
    model: reviewer?.model ?? null,
    rejected: reviewer?.rejections?.length ?? null,
    raw,
  };
  if (output.pendingApprovals.length > 0) {
    const keys = output.pendingApprovals.map((approval) => approval.approvalKey).join(', ');
    return { ...common, status: 'failed', reason: 'waiting-for-authorization', detail: keys };
  }
  if (reviewer?.status !== 'ok') {
    return { ...common, status: 'failed', reason: `reviewer-${reviewer?.status ?? 'absent'}`, detail: reviewer?.detail ?? null };
  }
  return { ...common, status: 'ok', findings: output.result.findings.map(normalize) };
}

function gitText(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function plainPrompt(evalCase, directory) {
  const repo = path.join(directory, 'repo');
  const diff = gitText(repo, ['diff', 'HEAD', '--no-color', '--no-ext-diff']);
  const untracked = gitText(repo, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return [
    evalCase.prompt,
    '',
    'You cannot run commands here. This is the uncommitted change, as `git diff HEAD` prints it from inside `repo/`:',
    '',
    '```diff',
    diff.trimEnd(),
    '```',
    ...(untracked.length > 0
      ? ['', 'These untracked files are new and part of the change; read them under `repo/`:', ...untracked.map((file) => `- ${file}`)]
      : []),
    '',
    'You may read any file under `repo/` for context. Report each defect you find in this change as a finding,',
    'with its path relative to `repo/` and a line in the new version of the file (or the old version, for a removed line).',
    'Report no finding if you find none.',
  ].join('\n');
}

async function runPlain(evalCase, directory, model) {
  const reviewer = new ClaudeReviewer({
    runner: new NodeProcessRunner(process.env),
    fs: nodeFileSystem,
    clock: systemClock,
    cwd: directory,
  });
  const started = Date.now();
  try {
    await reviewer.assertIsolationAvailable();
  } catch (error) {
    return { status: 'failed', reason: 'reviewer-unavailable', detail: error.message, wallMs: Date.now() - started, raw: null };
  }
  const invocation = await reviewer.invoke({
    systemPrompt: PLAIN_SYSTEM_PROMPT,
    prompt: plainPrompt(evalCase, directory),
    workingDirectory: directory,
    model,
    timeoutMs: DEFAULTS.review.timeoutSeconds * 1000,
  });
  const wallMs = Date.now() - started;
  const common = { wallMs, reviewerMs: invocation.usage?.apiDurationMs ?? null, costUsd: invocation.usage?.costUsd ?? null, model, rejected: null, raw: invocation };
  if (invocation.kind !== 'ok') return { ...common, status: 'failed', reason: invocation.reason, detail: invocation.detail };
  return { ...common, status: 'ok', findings: invocation.output.findings.map(normalize) };
}

async function withScaffold(evalCase, use) {
  const directory = await mkdtemp(path.join(tmpdir(), `ambicode-reviewer-${evalCase.name}-`));
  try {
    const scaffold = spawnSync('sh', [path.join(evalCase.directory, 'scaffold.sh')], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (scaffold.status !== 0) {
      const detail = firstLines(scaffold.stderr || scaffold.stdout || `exit ${scaffold.status}`);
      return { status: 'failed', reason: 'scaffold-failed', detail, wallMs: null, raw: null };
    }
    return await use(directory, await requirementEvidence(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runOnce(evalCase, arm, model) {
  return await withScaffold(evalCase, (directory, evidence) =>
    arm === 'ambicode' ? runAmbicode(directory, evidence) : runPlain(evalCase, directory, model),
  );
}

/** The fields `ReviewerOutput` has; a validated finding adds `id` and `evidence`. */
function reviewerFinding({ id, evidence, ...finding }) {
  return finding;
}

const BUNDLE_ONLY_OMISSION = 'No model review was run: this command produces the evidence bundle only.';

const CHANGE_INPUTS = ['changedFiles', 'changedLines', 'patchBytes', 'snapshotBytes', 'requirementBytes'];

/**
 * A recording is keyed on the snapshot a fresh scaffold has now, so the fresh `bundle`
 * must describe the same change the recorded review did, or the case is refused.
 */
export async function record(resultsDirectory, { evalsDirectory = EVALS } = {}) {
  const results = JSON.parse(await readFile(path.join(resultsDirectory, 'results.json'), 'utf8'));
  const recordings = [];
  const refused = [];
  for (const evalCase of await reviewCases(evalsDirectory, [])) {
    const chosen = results.results
      .filter((r) => r.case === evalCase.name && r.arm === 'ambicode' && r.status === 'ok')
      .sort((a, b) => a.run - b.run)[0];
    if (chosen === undefined) {
      refused.push(`${evalCase.name}: no ambicode run answered`);
      continue;
    }
    const rawPath = path.join(resultsDirectory, chosen.raw);
    const recorded = JSON.parse(await readFile(rawPath, 'utf8')).stdout.result;
    const fresh = await withScaffold(evalCase, async (directory, evidence) => ambicodeJson(directory, evidence, 'bundle'));
    const now = fresh.output?.result;
    if (now === undefined) {
      refused.push(`${evalCase.name}: bundle failed: ${fresh.detail}`);
      continue;
    }
    const drift = CHANGE_INPUTS.filter((key) => recorded.inputs[key] !== now.inputs[key]);
    if (JSON.stringify(recorded.changedFiles) !== JSON.stringify(now.changedFiles)) drift.push('changedFiles list');
    if (drift.length > 0) {
      refused.push(`${evalCase.name}: the change differs from the recorded one (${drift.join(', ')})`);
      continue;
    }
    // `bundle` appends one omission of its own, last, that `review` never has;
    // anything else out of place refuses the case.
    const before = now.omissions.slice(0, -1);
    if (!now.omissions.at(-1)?.startsWith(BUNDLE_ONLY_OMISSION)) {
      refused.push(`${evalCase.name}: the bundle's last omission is not its evidence-only notice`);
      continue;
    }
    if (JSON.stringify(recorded.omissions.slice(0, before.length)) !== JSON.stringify(before)) {
      refused.push(`${evalCase.name}: the recorded omissions do not start with the bundle's`);
      continue;
    }
    recordings.push({
      snapshotId: now.target.snapshotId,
      case: evalCase.name,
      model: recorded.reviewer.model,
      recordedFrom: path.relative(ROOT, rawPath),
      output: { findings: recorded.findings.map(reviewerFinding), coverageNotes: recorded.omissions.slice(before.length) },
    });
  }
  const document = { schemaVersion: 1, recordings };
  const out = path.join(resultsDirectory, 'recordings.json');
  await writeFile(out, `${JSON.stringify(document, null, 2)}\n`);
  return { out, recordings, refused };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function report(results) {
  const lines = [
    `# Reviewer quality — ${results.startedAt}`,
    '',
    `- Claude Code: ${results.claudeVersion ?? 'missing'}`,
    `- AMBICODE: \`scripts/ambicode.mjs\` sha256 ${results.ambicodeSha256}`,
    `- Plain-arm model: ${results.model}; runs per arm: ${results.runs}; shuffle seed: ${results.seed}`,
  ];
  if (results.runs < 3) {
    lines.push(`- **${results.runs} run(s) per arm is below the three plan/07:209 asks for.** Not a sample to decide on.`);
  }
  const mismatched = results.results.filter((run) => run.arm === 'ambicode' && run.model !== null && run.model !== results.model);
  if (mismatched.length > 0) {
    lines.push(`- **The AMBICODE reviewer ran a different model in ${mismatched.length} run(s)** than the plain arm's ${results.model}.`);
  }
  lines.push(
    '',
    'Findings are counted, not judged. A failed run has no finding count: it is not a run that found nothing.',
    'Cost is the reviewer model call, as its envelope reports it. Wall time is the whole arm after scaffolding:',
    "for `ambicode` that includes the bundle and the checks. \"missing\" is a figure the run did not report.",
    '',
    '| case | arm | ok | failed | findings offered | per ok run | cost (USD) | wall (s, mean) |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const name of results.cases) {
    for (const arm of ARMS) {
      const runs = results.results.filter((run) => run.case === name && run.arm === arm);
      const ok = runs.filter((run) => run.status === 'ok');
      const offered = sum(ok.map((run) => run.findings.length));
      const costs = runs.map((run) => run.costUsd);
      const known = costs.filter((cost) => cost !== null);
      const cost = known.length === 0 ? 'missing' : `${sum(known).toFixed(2)}${known.length < costs.length ? ` (missing for ${costs.length - known.length})` : ''}`;
      const walls = runs.map((run) => run.wallMs).filter((ms) => ms !== null);
      const wall = walls.length === 0 ? 'missing' : (sum(walls) / walls.length / 1000).toFixed(0);
      const perRun = ok.length === 0 ? 'missing' : (offered / ok.length).toFixed(1);
      lines.push(`| ${name} | ${arm} | ${ok.length} | ${runs.length - ok.length} | ${ok.length === 0 ? 'missing' : offered} | ${perRun} | ${cost} | ${wall} |`);
    }
  }
  const failures = results.results.filter((run) => run.status === 'failed');
  if (failures.length > 0) {
    lines.push('', '## Failed runs', '');
    for (const run of failures) {
      lines.push(`- ${run.case} ${run.arm} run ${run.run}: ${run.reason}${run.detail ? ` — ${run.detail}` : ''}`);
    }
  }
  lines.push(
    '',
    '## Adjudication',
    '',
    'Label every row of `adjudication-sheet.csv` per `evals/evals-archived/typescript/adjudication.md`, against each case\'s',
    '`evals/evals-archived/typescript/<case>/ground-truth.md`. The sheet names no arm and is shuffled across cases;',
    '`adjudication-key.csv` maps each row back and must stay closed until labelling is done.',
    'Each claim is the reviewer\'s own words: where one gives its arm away, record that the blind failed for it.',
    'Actionable precision and recall are not computed here; they need the labels.',
    '',
  );
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { runs: 3, cases: [], evals: EVALS, out: null, seed: null, model: DEFAULTS.review.model };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--case') options.cases.push(value());
    else if (flag === '--evals') options.evals = path.resolve(value());
    else if (flag === '--out') options.out = path.resolve(value());
    else if (flag === '--seed') options.seed = Number(value());
    else if (flag === '--model') options.model = value();
    else throw new Error(`unknown option ${flag}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer');
  if (options.seed !== null && !Number.isInteger(options.seed)) throw new Error('--seed must be an integer');
  return options;
}

export async function main(argv) {
  const options = parseArgs(argv);
  await stat(AMBICODE).catch(() => {
    throw new Error('scripts/ambicode.mjs is missing: run `npm run build` first');
  });
  const cases = await reviewCases(options.evals, options.cases);
  const startedAt = new Date().toISOString();
  const out = options.out ?? path.join(EVALS, 'results', `reviewer-${startedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')}`);
  await mkdir(path.join(out, 'raw'), { recursive: true });

  let claudeVersion = null;
  try {
    claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    // Recorded as missing in the report.
  }
  const results = {
    startedAt,
    claudeVersion,
    ambicodeSha256: createHash('sha256').update(await readFile(AMBICODE)).digest('hex'),
    model: options.model,
    runs: options.runs,
    seed: options.seed ?? randomInt(2 ** 31),
    cases: cases.map((c) => c.name),
    results: [],
  };

  for (let run = 1; run <= options.runs; run += 1) {
    // Alternated, so neither arm always runs first against a warm cache.
    const arms = run % 2 === 1 ? ARMS : [...ARMS].reverse();
    for (const evalCase of cases) {
      for (const arm of arms) {
        process.stderr.write(`${evalCase.name} ${arm} run ${run}/${options.runs}… `);
        const { raw, findings, ...outcome } = await runOnce(evalCase, arm, options.model);
        const rawFile = path.join('raw', `${evalCase.name}-${arm}-${run}.json`);
        await writeFile(path.join(out, rawFile), `${JSON.stringify(raw, null, 2)}\n`);
        const record = {
          case: evalCase.name,
          arm,
          run,
          reason: null,
          detail: null,
          wallMs: null,
          reviewerMs: null,
          costUsd: null,
          model: null,
          rejected: null,
          ...outcome,
          findings: outcome.status === 'ok' ? findings : null,
          raw: rawFile,
        };
        results.results.push(record);
        process.stderr.write(`${record.status}${record.findings ? ` (${record.findings.length} finding(s))` : ` (${record.reason})`}\n`);
      }
    }
  }

  const { sheet, key } = blindSheet(results.results, results.seed);
  await writeFile(path.join(out, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(
    path.join(out, 'runs.csv'),
    csv([
      ['case', 'arm', 'run', 'status', 'findings', 'reason', 'detail', 'cost_usd', 'wall_ms', 'reviewer_ms', 'model', 'rejected'],
      ...results.results.map((r) => [r.case, r.arm, r.run, r.status, r.findings?.length, r.reason, r.detail, r.costUsd, r.wallMs, r.reviewerMs, r.model, r.rejected]),
    ]),
  );
  await writeFile(
    path.join(out, 'findings.csv'),
    csv([
      ['case', 'arm', 'run', 'finding', 'path', 'line', 'side', 'claim'],
      ...results.results.flatMap((r) =>
        (r.findings ?? []).map((f, index) => [r.case, r.arm, r.run, index, f.path, f.line, f.side, f.claim]),
      ),
    ]),
  );
  await writeFile(path.join(out, 'adjudication-sheet.csv'), csv(sheet));
  await writeFile(path.join(out, 'adjudication-key.csv'), csv(key));
  await writeFile(path.join(out, 'report.md'), report(results));
  return out;
}

async function recordCommand(argv) {
  let evalsDirectory = EVALS;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--evals') evalsDirectory = path.resolve(argv[++i] ?? '');
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) throw new Error('usage: evals-reviewer.mjs record <results-dir> [--evals <dir>]');
  const { out, recordings, refused } = await record(path.resolve(positional[0]), { evalsDirectory });
  for (const line of refused) process.stderr.write(`refused ${line}\n`);
  process.stderr.write(`${recordings.length} recording(s)\n`);
  // A refused case has no recording, so its replay fails: say so, don't pass.
  if (refused.length > 0) process.exitCode = 1;
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  (argv[0] === 'record' ? recordCommand(argv.slice(1)) : main(argv)).then(
    (out) => process.stdout.write(`${path.relative(process.cwd(), out) || out}\n`),
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
