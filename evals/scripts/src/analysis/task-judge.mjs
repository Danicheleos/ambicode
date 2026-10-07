// The opt-in, paid half of task scoring: one `claude -p` call per task run asks whether the run's patch makes the
// same changes as the merged one, so a valid alternative implementation is not scored as a miss by the overlap
// measures. Its cost is the judge's, kept apart from the agent's. `score` merges the file when it is there.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sandboxIdOf } from './ledger-metrics.mjs';
import { parsePatch } from './patch-overlap.mjs';

export const JUDGE_FILE = 'task-judge.json';
/**
 * Per patch shown to the judge: each file's section up to FILE_CAP bytes, all of them up to TOTAL_CAP. The large
 * preset's merged patches reach ~400 KB; two whole ones would not fit one context, so the rest is listed by name.
 */
export const FILE_CAP = 10_000;
export const TOTAL_CAP = 100_000;

/** The patch as the judge sees it, and the files it saw cut or only by name. */
export function capPatch(patch, { fileCap = FILE_CAP, totalCap = TOTAL_CAP } = {}) {
  const sections = String(patch ?? '').split(/^(?=diff --git )/m).filter((s) => s.startsWith('diff --git '));
  // Named from each section's own header: a section the parser skips must not shift every later name.
  const files = sections.map((section) => parsePatch(section)[0]?.file ?? section.split('\n', 1)[0].slice('diff --git '.length));
  let text = '';
  const truncated = [];
  const omitted = [];
  sections.forEach((section, i) => {
    if (text.length >= totalCap) return omitted.push(files[i]);
    let kept = section.length > fileCap ? `${section.slice(0, fileCap)}\n… (file cut at ${fileCap} bytes)\n` : section;
    if (text.length + kept.length > totalCap) kept = `${kept.slice(0, totalCap - text.length)}\n… (patch cut at ${totalCap} bytes)\n`;
    if (kept !== section) truncated.push(files[i]);
    text += kept;
  });
  if (omitted.length) text += `\nNot shown (over the size cap): ${omitted.join(', ')}\n`;
  return { text, truncated, omitted };
}

export function judgePrompt({ request, oracle, run }) {
  return `You grade a coding agent's change against the change a developer actually merged for the same request.

<request>
${request}
</request>

<merged_change>
${oracle}
</merged_change>

<agent_change>
${run || '(the agent changed nothing)'}
</agent_change>

Judge whether the agent's change implements the same behaviour as the merged change. A different but valid
implementation of the same behaviour counts fully; style, naming and file layout do not matter. Unrelated extra
changes do not add credit. Parts cut for size are marked; do not assume what they contain.

Answer with one JSON object and nothing else:
{"score": <0..1, the share of the merged change's behaviour the agent's change implements>, "missing": [<short descriptions>], "reason": "<one sentence>"}
`;
}

/** Every balanced `{…}` in the text, outermost first; braces inside JSON strings do not count. */
function objectCandidates(text) {
  const found = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    for (let i = start; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '\\') i += 1;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth += 1;
      else if (c === '}' && (depth -= 1) === 0) {
        found.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  return found;
}

/**
 * The verdict in a judge's answer, or null when no JSON object in it has a numeric 0..1 score. A paid answer with
 * prose or a brace after its JSON is still read; a null, string or boolean score is not taken as 0 or 1.
 */
export function parseVerdict(text) {
  const raw = String(text ?? '').trim();
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const candidate of [raw, ...fenced, ...objectCandidates(raw)]) {
    let verdict;
    try {
      verdict = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!verdict || typeof verdict.score !== 'number' || !Number.isFinite(verdict.score) || verdict.score < 0 || verdict.score > 1) continue;
    return { score: verdict.score, missing: Array.isArray(verdict.missing) ? verdict.missing.map(String) : [], reason: String(verdict.reason ?? '') };
  }
  return null;
}

/** `claude -p` with no tools, outside any repository; returns {text, costUsd, error}. Tests pass a fake. */
export function claudeJudge({ model, spawn = spawnSync } = {}) {
  return ({ prompt, budgetUsd }) => {
    const run = spawn('claude', ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', String(budgetUsd)], {
      input: prompt,
      cwd: tmpdir(),
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
    let out = null;
    try {
      out = JSON.parse(run.stdout);
    } catch {
      return { text: null, costUsd: null, error: run.error ? `spawn failed: ${run.error.message}` : `exit ${run.status}: ${String(run.stderr || run.stdout).slice(0, 200)}` };
    }
    return { text: out.result ?? null, costUsd: typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null, error: out.is_error ? String(out.result).slice(0, 200) : null };
  };
}

/**
 * Judges every harvested task run of `results` until `maxCostUsd` is spent; the rest are recorded as skipped, never
 * dropped. A run with no harvested patch is not judged: its score is absent, as in `score`.
 */
/** `analysis` is bench-score's `createAnalysis({ tracesDir })`, passed in so this module and bench-score do not import each other. */
export function judgeTaskRuns(results, { judge, maxCostUsd, model, analysis }) {
  const rows = [];
  let spent = 0;
  for (const evalCase of results.cases ?? []) {
    const meta = analysis.meta(evalCase);
    if (meta?.kind !== 'task' || !meta.oracle || !meta.caseDir) continue;
    const oracle = capPatch(readFileSync(path.join(meta.caseDir, meta.oracle), 'utf8'));
    for (const [arm, runs] of Object.entries(evalCase.arms ?? {}))
      runs.forEach((run, index) => {
        const row = { case: evalCase.name, arm, run: index, sandbox: sandboxIdOf(run) };
        const patch = analysis.patch(run);
        if (patch === null) return rows.push({ ...row, skipped: 'no harvested patch' });
        if (spent >= maxCostUsd) return rows.push({ ...row, skipped: 'budget' });
        const mine = capPatch(patch);
        const answer = judge({ prompt: judgePrompt({ request: evalCase.promptMarkdown ?? '', oracle: oracle.text, run: mine.text }), budgetUsd: Math.max(maxCostUsd - spent, 0.01) });
        spent += answer.costUsd ?? 0;
        const verdict = parseVerdict(answer.text);
        rows.push({
          ...row,
          judgeScore: verdict?.score ?? null,
          missing: verdict?.missing ?? null,
          reason: verdict?.reason ?? null,
          error: answer.error ?? (verdict ? null : 'no verdict in the answer'),
          judgeCostUsd: answer.costUsd,
          truncated: { oracle: [...oracle.truncated, ...oracle.omitted], run: [...mine.truncated, ...mine.omitted] },
        });
      });
  }
  return { model, maxCostUsd, costUsd: spent, runs: rows };
}

/** Writes the verdicts beside the run's reports; an earlier file is never replaced, as it was paid for. */
export function writeJudgeFile(reportsDir, verdicts) {
  const file = path.join(reportsDir, JUDGE_FILE);
  if (existsSync(file)) throw new Error(`${file} exists: an earlier judgement is never replaced; move it away to judge again`);
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(verdicts, null, 2)}\n`, { flag: 'wx' });
  return file;
}

/** Per sandbox id, the verdict a judge file holds for it; empty when there is no file. */
export function readJudgeFile(file) {
  if (!file || !existsSync(file)) return new Map();
  const verdicts = JSON.parse(readFileSync(file, 'utf8'));
  return new Map((verdicts.runs ?? []).filter((r) => r.sandbox && !r.skipped).map((r) => [r.sandbox, r]));
}
