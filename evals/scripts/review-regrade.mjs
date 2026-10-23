// Offline grading of archived review runs (eval-archive/review-runs/<arm>/<stamp>/<case>-<n>/, see context.mjs recordReviewRun).
// The regex graders of review-cases.mjs stay as the harness's fast signal; this script re-reads the same runs with a model that
// matches each finding of the review to the known issues, so a remark that merely mentions a test is not credited to a tests issue.
//   node evals/scripts/review-regrade.mjs <run dir | <arm>/<stamp> dir | stamp>... [--votes 5] [--budget 3] [--out dir]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseDir } from './cases.mjs';
import { reviewRunsOf } from './context.mjs';
import { REVIEW_TRUTHS, fixtureOf } from './review-cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODEL = 'claude-haiku-5-5';
export const VOTES = 5;
const SYSTEM = 'You match the findings of a code review to a list of known issues. Reply with JSON only, no prose.';

/** Findings of a printed report (report.txt): the blocks of section 2, code excerpts dropped. */
export function reportFindings(report) {
  const section = report.split(/^2\. FINDINGS\s*$/m)[1]?.split(/^3\. /m)[0] ?? '';
  const blocks = [];
  for (const line of section.split('\n')) {
    if (/^\s{3}\[[a-z]+\/[a-z]+\]/i.test(line)) blocks.push([line.trim()]);
    else if (blocks.length > 0 && !/^\s*\| /.test(line) && line.trim() !== '') blocks.at(-1).push(line.trim());
  }
  return blocks.map((block) => block.join('\n'));
}

export function matchPrompt({ diff, issues, findings }) {
  const known = issues.length === 0 ? '(none: the change is sound)' : issues.map((issue) => `- ${issue.id} [${issue.category}] ${issue.what}. Locations: ${issue.locations.map((l) => `${l.file}:${l.lines[0]}-${l.lines[1]}`).join('; ')}${issue.overlaps?.length ? `. Declared to overlap with: ${issue.overlaps.join(', ')}` : ''}`).join('\n');
  return `A reviewer reviewed this uncommitted change.

Change:
${diff}

Known issues in it (id, category, what, locations):
${known}

Findings of the review, numbered:
${findings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')}

For each finding decide:
- issue_id: the id of the known issue the finding reports, else null. A finding reports an issue when it names that problem in that code, in any words, with or without a line number. It does not report an issue because it mentions the same file or function. A remark such as "a unit test would have caught it" is about the defect it names, not about missing tests; a tests issue is reported only by a finding that says the relevant code has no test. A finding that plainly names several known issues (the defect and also a duplication, or also a missing test) credits each of them: give an array of ids. An issue is credited only when the finding itself says it, not because a neighbouring issue is in the same code.
- outside: when issue_id is null, "real" for a genuine defect or convention break in the change that is not in the list, "arguable" for a style point, question, risk or pre-existing weakness that reasonable reviewers dispute, "false" for a claim that is wrong about the code shown. null when issue_id is set.
- reason: one sentence.
Reply with a JSON array, one object per finding in order: [{"n":1,"issue_id":"main","outside":null,"reason":"..."}]`;
}

export const enumeratePrompt = (message) => `Below is a code review written by an agent. List each distinct finding it reports: problems, risks, convention breaks and missing tests. Leave out praise, summaries, caveats about what was not run and the verdict. One entry per problem; merge bullets about the same problem and keep its location and key wording. Reply with a JSON array of strings only.

Review:
${message}`;

/** The first JSON array in a reply, or null. */
export function parseArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** One vote's verdicts keyed by finding index (0-based); null when the reply does not cover every finding. */
export function parseVote(text, count, ids) {
  const array = parseArray(text);
  if (array === null) return null;
  const verdicts = new Array(count).fill(null);
  for (const item of array) {
    const i = Number(item?.n) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= count) return null;
    const raw = Array.isArray(item.issue_id) ? item.issue_id : [item.issue_id];
    const issue = raw.filter((id) => typeof id === 'string' && ids.includes(id));
    if (raw.some((id) => id !== null && !issue.includes(id))) return null;
    verdicts[i] = { issue, outside: issue.length > 0 ? null : (['real', 'arguable', 'false'].includes(item.outside) ? item.outside : null), reason: String(item.reason ?? '') };
  }
  return verdicts.every((v) => v !== null) ? verdicts : null;
}

/**
 * Per finding over the valid votes: an issue id is credited when a strict majority of votes name it, so a finding that names a main
 * issue plus a duplication or tests issue keeps both however the votes split across id sets (plurality over whole sets credited
 * nothing on ties of {main} and {main,s2}). Without a credited id, an outside kind needs a strict majority too.
 * `tie` marks a finding where votes made a claim but none reached a majority.
 */
export function majority(votes, count) {
  const valid = votes.filter((vote) => vote !== null);
  const need = Math.floor(valid.length / 2) + 1;
  return Array.from({ length: count }, (_, i) => {
    const tally = (keys) => {
      const counts = new Map();
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    };
    const ids = tally(valid.flatMap((vote) => vote[i].issue));
    const credited = [...ids].filter(([, n]) => n >= need).map(([id]) => id);
    const kinds = tally(valid.filter((vote) => vote[i].issue.length === 0 && vote[i].outside !== null).map((vote) => vote[i].outside));
    const outside = credited.length > 0 ? null : ([...kinds].find(([, n]) => n >= need)?.[0] ?? null);
    return {
      issue: credited,
      outside,
      tie: credited.length === 0 && outside === null && (ids.size > 0 || kinds.size > 0),
      votes: valid.length,
      reasons: valid.map((vote) => ({ issue: vote[i].issue, outside: vote[i].outside, reason: vote[i].reason })),
    };
  });
}

/** Metrics of one run from its matched findings; `issues` are the truth records. */
export function runMetrics(issues, matched) {
  const found = new Set(matched.flatMap((m) => m.issue));
  const count = (kind) => matched.filter((m) => m.issue.length === 0 && m.outside === kind).length;
  const byCategory = {};
  for (const issue of issues) {
    byCategory[issue.category] ??= { found: 0, total: 0 };
    byCategory[issue.category].total += 1;
    if (found.has(issue.id)) byCategory[issue.category].found += 1;
  }
  const main = issues.find((issue) => issue.main);
  return {
    findings: matched.length,
    foundIds: issues.filter((issue) => found.has(issue.id)).map((issue) => issue.id),
    recallMain: main === undefined ? null : found.has(main.id) ? 1 : 0,
    recallAll: issues.length === 0 ? null : issues.filter((issue) => found.has(issue.id)).length / issues.length,
    outsideReal: count('real'),
    arguable: count('arguable'),
    falseFindings: count('false'),
    unclassified: matched.filter((m) => m.issue.length === 0 && m.outside === null).length,
    byCategory,
  };
}

const mean = (values) => (values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000);

/** Means per arm and case, and per arm and category (found over total issues of that category). */
export function aggregate(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.arm}/${run.case}`;
    groups.set(key, [...(groups.get(key) ?? []), run.metrics]);
  }
  const perCase = [...groups].map(([key, list]) => ({
    key,
    runs: list.length,
    recallMain: mean(list.map((m) => m.recallMain).filter((v) => v !== null)),
    recallAll: mean(list.map((m) => m.recallAll).filter((v) => v !== null)),
    outsideReal: mean(list.map((m) => m.outsideReal)),
    arguable: mean(list.map((m) => m.arguable)),
    falseFindings: mean(list.map((m) => m.falseFindings)),
  }));
  const cats = new Map();
  for (const run of runs) {
    for (const [category, { found, total }] of Object.entries(run.metrics.byCategory)) {
      const key = `${run.arm}/${category}`;
      const old = cats.get(key) ?? { found: 0, total: 0 };
      cats.set(key, { found: old.found + found, total: old.total + total });
    }
  }
  const perCategory = [...cats].map(([key, { found, total }]) => ({ key, found, total, recall: found / total }));
  return { perCase, perCategory };
}

export function markdown({ model, runs, summary, cost }) {
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const lines = [`Matcher ${model}, ${cost.calls} calls, $${cost.usd.toFixed(3)}.`, '', row(['arm/case', 'runs', 'recall main', 'recall all', 'outside real', 'arguable', 'false']), row(['---', '---', '---', '---', '---', '---', '---'])];
  for (const c of summary.perCase) lines.push(row([c.key, c.runs, c.recallMain ?? '-', c.recallAll ?? '-', c.outsideReal, c.arguable, c.falseFindings]));
  lines.push('', row(['arm/category', 'found', 'total', 'recall']), row(['---', '---', '---', '---']));
  for (const c of summary.perCategory) lines.push(row([c.key, c.found, c.total, c.recall.toFixed(2)]));
  const disagreements = runs.flatMap((run) => run.comparison.filter((c) => c.regex !== c.matcher).map((c) => `${run.arm}/${run.case}-${run.n} ${c.id}: regex ${c.regex ? 'found' : 'missed'}, matcher ${c.matcher ? 'found' : 'missed'}`));
  lines.push('', `Regex vs matcher: ${disagreements.length === 0 ? 'no disagreement' : `${disagreements.length} disagreement(s)`}`, ...disagreements.map((d) => `- ${d}`));
  return `${lines.join('\n')}\n`;
}

/** The real judge: one `claude -p` call; `{text, costUsd}`. */
export function claudeRunner(model = MODEL) {
  return (prompt) => {
    const out = spawnSync('claude', ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM], { input: prompt, cwd: tmpdir(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (out.status !== 0) throw new Error(`claude -p failed: ${out.stderr.slice(0, 300)}`);
    const reply = JSON.parse(out.stdout);
    return { text: reply.result ?? '', costUsd: reply.total_cost_usd ?? 0 };
  };
}

/** A runner that counts its calls and cost and refuses to start a call past `budget` dollars. */
export function budgeted(run, budget) {
  const cost = { calls: 0, usd: 0 };
  const call = (prompt) => {
    if (cost.usd >= budget) throw new Error(`judge budget of $${budget} reached after ${cost.calls} calls`);
    const reply = run(prompt);
    cost.calls += 1;
    cost.usd += reply.costUsd ?? 0;
    return reply;
  };
  call.cost = cost;
  return call;
}

/** Findings of one record: deterministic for a printed report, enumerated by the judge for free text. */
export function findingsOf(record, run) {
  if (record.report !== null) {
    const found = reportFindings(record.report);
    if (found.length > 0 || /FINDINGS\s*\n\s*\n?\s*(none|no findings)/i.test(record.report)) return { source: 'report', findings: found };
  }
  if (record.finalMessage === null) return { source: 'none', findings: [] };
  const reply = run(enumeratePrompt(record.finalMessage));
  const list = parseArray(reply.text);
  return { source: 'judge', findings: (list ?? []).map(String), invalid: list === null };
}

export function matchFindings({ diff, issues, findings, run, votes = VOTES }) {
  if (findings.length === 0) return { matched: [], votes: [] };
  const ids = issues.map((issue) => issue.id);
  const prompt = matchPrompt({ diff, issues, findings });
  const raw = [];
  for (let v = 0; v < votes; v += 1) {
    const reply = run(prompt);
    raw.push({ text: reply.text, vote: parseVote(reply.text, findings.length, ids) });
  }
  return { matched: majority(raw.map((r) => r.vote), findings.length).map((m, i) => ({ finding: findings[i], ...m })), votes: raw };
}

const truthOf = (name) => REVIEW_TRUTHS.find((t) => t.name === name);

/** Truth records with `main` and `overlaps` from the case's review-truth.json and review-cases.mjs. */
export function truthFor(name, root = ROOT) {
  const file = path.join(root, 'evals', caseDir('cases', name), 'review-truth.json');
  const records = JSON.parse(readFileSync(file, 'utf8'));
  const planned = truthOf(name);
  return records.map((record) => ({ ...record, overlaps: planned?.issues.find((i) => i.id === record.id)?.overlaps ?? [] }));
}

const diffCache = new Map();
/** `git diff` of the case's fixture (the change the reviewer saw). */
export function fixtureDiff(name) {
  if (diffCache.has(name)) return diffCache.get(name);
  const fixture = fixtureOf(truthOf(name));
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'regrade-fx-')), 'repo');
  execFileSync('node', [path.join(ROOT, 'fixtures', 'materialize.mjs'), fixture, dir], { stdio: 'ignore' });
  execFileSync('git', ['add', '-N', '.'], { cwd: dir });
  const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  diffCache.set(name, diff);
  return diff;
}

/** The regex grader of the harness for one issue, read from the generated case. */
export function regexVerdict(name, id, text, root = ROOT) {
  const file = path.join(root, 'evals', caseDir('cases', name), 'graders', `found-${id}.md`);
  const pattern = readFileSync(file, 'utf8').match(/pattern: '(.*)'\n/s)?.[1]?.replace(/''/g, "'");
  return pattern !== undefined && new RegExp(pattern).test(text);
}

/** `{dir, case, n, arm, stamp, report, finalMessage}` of one archived run. */
export function readRecord(dir) {
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const read = (name) => (existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : null);
  return { dir, case: meta.case, n: meta.run, arm: meta.arm, stamp: meta.stamp, report: read('report.txt'), finalMessage: read('final-message.md'), diff: read('changed.diff') };
}

/** Run directories under each argument: a run dir, a `<arm>/<stamp>` dir, or a bare stamp looked up in the archive. */
const runsRoot = () => path.dirname(path.dirname(reviewRunsOf('x', 'y')));

export function runDirs(args, root = runsRoot()) {
  const found = [];
  const add = (dir) => {
    if (existsSync(path.join(dir, 'meta.json'))) found.push(dir);
    else for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) add(path.join(dir, entry.name));
  };
  for (const arg of args) {
    if (existsSync(arg)) add(path.resolve(arg));
    else for (const arm of ['plugin', 'bare']) if (existsSync(path.join(root, arm, arg))) add(path.join(root, arm, arg));
  }
  return found;
}

export function regradeRun(record, { run, votes = VOTES, diffOf = fixtureDiff }) {
  const issues = truthFor(record.case);
  const { source, findings, invalid } = findingsOf(record, run);
  const { matched, votes: raw } = matchFindings({ diff: record.diff ?? diffOf(record.case), issues, findings, run, votes });
  const metrics = runMetrics(issues, matched);
  const regexText = record.arm === 'plugin' ? (record.report ?? '') : (record.finalMessage ?? '');
  const comparison = issues.map((issue) => ({ id: issue.id, regex: regexVerdict(record.case, issue.id, regexText), matcher: metrics.foundIds.includes(issue.id) }));
  return { case: record.case, n: record.n, arm: record.arm, stamp: record.stamp, source, invalidEnumeration: invalid === true, findings: matched, votes: raw, metrics, comparison };
}

function main(argv) {
  const args = [];
  const opts = { votes: VOTES, budget: 3, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--votes') opts.votes = Number(argv[++i]);
    else if (argv[i] === '--budget') opts.budget = Number(argv[++i]);
    else if (argv[i] === '--out') opts.out = argv[++i];
    else args.push(argv[i]);
  }
  const dirs = runDirs(args);
  if (dirs.length === 0) throw new Error('no review run found for the arguments');
  const run = budgeted(claudeRunner(), opts.budget);
  const runs = dirs.map((dir) => regradeRun(readRecord(dir), { run, votes: opts.votes }));
  const summary = aggregate(runs);
  const out = opts.out ?? path.join(runsRoot(), 'regrade', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(out, { recursive: true });
  const result = { model: MODEL, votes: opts.votes, cost: run.cost, runs, summary };
  writeFileSync(path.join(out, 'regrade.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(path.join(out, 'regrade.md'), markdown({ model: MODEL, runs, summary, cost: run.cost }));
  process.stdout.write(markdown({ model: MODEL, runs, summary, cost: run.cost }));
  process.stdout.write(`written ${out}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
