// Scores one plan-eval run (v6 33 §4, step 06 E4): file recall, anchor validity, AC coverage, run cost.
//
// Truth list: `git diff --name-status` lines (`M\tpath`, `A\tpath`, `R100\told\tnew`); recall is the share of
// the existing non-test files the change touched that the plan cites and that exist in the repository.
// Label file (JSON, kept beside the benchmark data, never committed): `{"<epic>": {"acs": [{"id": "AC1"}]}}`;
// only the ids matter, an AC counts as covered when its id appears in the plan as a whole word.
// Anchor validity is (checked - bad) / checked from the built `plan check --json`, null when nothing is checked.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { traceMetrics } from './trace-analysis.mjs';

const isTest = (file) => /\.(spec|test)\.[a-z]+$/.test(file);
const CITED = /[\w.@-]+(?:\/[\w.@-]+)+\.\w+/g;

export function touchedExisting(truthText) {
  const existing = new Set();
  for (const row of truthText.split('\n').map((line) => line.split('\t'))) {
    if (!/^[MADR]/.test(row[0] ?? '') || !row[1]) continue;
    if (row[0][0] !== 'A') existing.add(row[1]);
  }
  return [...existing].filter((file) => !isTest(file));
}

export function fileRecall(planText, truthText, repo) {
  const cited = new Set(planText.match(CITED) ?? []);
  const touched = touchedExisting(truthText).filter((file) => existsSync(path.join(repo, file)));
  const hit = touched.filter((file) => cited.has(file));
  return { recall: touched.length ? hit.length / touched.length : null, hit: hit.length, total: touched.length };
}

/** The plan without its `Not covered` sections: an AC the plan excludes is accounted for, not covered. */
function withoutExclusions(planText) {
  let excludedAt = 0;
  return planText.split('\n').filter((line) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (excludedAt && heading[1].length <= excludedAt) excludedAt = 0;
      if (/Not covered/i.test(heading[2])) excludedAt = heading[1].length;
    }
    return excludedAt === 0 && !/^\s*\|.*not covered/i.test(line);
  }).join('\n');
}

export function acCoverage(planText, labels, epic) {
  const ids = (labels?.[epic]?.acs ?? []).map((ac) => String(ac.id));
  if (!ids.length) return { coverage: null, covered: 0, total: 0 };
  const included = withoutExclusions(planText);
  const covered = ids.filter((id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i').test(included));
  return { coverage: covered.length / ids.length, covered: covered.length, total: ids.length };
}

/** Runs the built `plan check` in the scored repository with the plan on stdin; tests pass a fake instead. */
export function planCheckCli(pluginRoot) {
  return ({ plan, task, repo }) => {
    let out;
    try {
      out = execFileSync('node', [path.join(pluginRoot, 'scripts', 'ambicode.mjs'), 'plan', 'check', '--task', task, '--json'], { cwd: repo, input: plan, encoding: 'utf8' });
    } catch (error) {
      out = error.stdout; // a failing check still prints its JSON
      if (!out) throw error;
    }
    return JSON.parse(out);
  };
}

export const anchorValidity = (check) => {
  const checked = check?.anchors?.checked ?? 0;
  return checked ? (checked - (check.anchors.badTotal ?? 0)) / checked : null;
};

/** `note save` names files `<kind>_<minute>.md`, then `-2`, `-3` … within one minute: order by minute, then suffix. */
function latestNamed(names, kind) {
  const keyed = names
    .map((name) => ({ name, match: new RegExp(`^${kind}_(\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d)(?:-(\\d+))?\\.md$`).exec(name) }))
    .filter((row) => row.match !== null)
    .map((row) => ({ name: row.name, minute: row.match[1], suffix: Number(row.match[2] ?? 1) }));
  keyed.sort((a, b) => (a.minute === b.minute ? a.suffix - b.suffix : a.minute < b.minute ? -1 : 1));
  return keyed.at(-1)?.name;
}

/** The promoted plan when the task directory has one, else the latest draft; `null` when neither exists. */
export function scoredPlan(taskDirectory) {
  if (!existsSync(taskDirectory)) return null;
  const names = readdirSync(taskDirectory);
  const promoted = latestNamed(names, 'plan');
  const draft = latestNamed(names, 'plan-draft');
  const name = promoted ?? draft;
  return name ? { text: readFileSync(path.join(taskDirectory, name), 'utf8'), kind: promoted ? 'promoted' : 'draft', name } : null;
}

export const revisesOf = (ledgerText) => (ledgerText ?? '').split('\n').filter((line) => { try { return JSON.parse(line).kind === 'revise'; } catch { return false; } }).length;

/** `run`: {text, kind?, epic, task, repo, truth, labels, cost, turns, trace?, ledger?}. */
export function scorePlanRun(run, { check }) {
  const recall = fileRecall(run.text, run.truth, run.repo);
  const checked = check({ plan: run.text, task: run.task, repo: run.repo });
  const acs = acCoverage(run.text, run.labels, run.epic);
  return {
    epic: run.epic,
    fileRecall: recall.recall,
    anchorValidity: anchorValidity(checked),
    acCoverage: acs.coverage,
    detail: { recall, anchors: checked?.anchors ?? null, acs },
    scoredText: run.kind ?? 'unknown',
    cost: run.cost ?? null,
    turns: run.turns ?? null,
    peakContext: run.trace ? traceMetrics(run.trace).peakContext : null,
    revises: run.ledger === undefined ? null : revisesOf(run.ledger),
  };
}
