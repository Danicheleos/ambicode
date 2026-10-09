import path from 'node:path';
import { REVIEWS_DIR, REVIEWS_LEAF, TASKS_DIR } from '#types/defaults';
import { ReviewResult, type ReviewEstimate, type AssembleOptions } from '#types/modules/review';
import { tokenize } from '#util/text';
import { AmbicodeError } from '#util/errors';
import { adapterFor } from '#modules/checks/selection/adapters';
import { authorizeCommand, checkApprovalKey } from '#modules/checks/selection/authorize';
import { selectionRunsCommand, selectLintFiles, selectTestFiles } from '#modules/checks/selection/select';
import { assembleBundle, groupByProject } from './bundle.ts';
import type { Runtime } from '#types/composition';
import type { DiffFile } from '#types/platform/git';
import type { FileSystem, ProcessRunner } from '#types/platform/ports';

export const MAX_ESTIMATE_BYTES = 2_048;

const HISTORY_REVIEWS = 5;
const SUGGESTED_EXCLUDES = 3;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** The 5 newest results whose reviewer ran and was timed, under routeless and task reviews; fewer is no history (08-E4, D6). */
export async function reviewHistory(fs: FileSystem, repositoryRoot: string): Promise<ReviewEstimate['history']> {
  const directories = async (at: string): Promise<string[]> => (await fs.readdir(at).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => path.join(at, entry.name));
  const reviews = [
    ...(await directories(path.join(repositoryRoot, REVIEWS_DIR))),
    ...(await Promise.all((await directories(path.join(repositoryRoot, TASKS_DIR))).map((task) => directories(path.join(task, REVIEWS_LEAF))))).flat(),
  ];
  const timed: ReviewResult[] = [];
  for (const directory of reviews) {
    const text = await fs.readText(path.join(directory, 'result.json')).catch(() => null);
    let parsed: ReturnType<typeof ReviewResult.safeParse> | null = null;
    try {
      parsed = text === null ? null : ReviewResult.safeParse(JSON.parse(text));
    } catch {
      parsed = null;
    }
    if (parsed?.success === true && parsed.data.reviewer?.status === 'ok' && parsed.data.reviewer.durationMs !== null) timed.push(parsed.data);
  }
  const newest = timed.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_REVIEWS);
  if (newest.length < HISTORY_REVIEWS) return null;
  const costs = newest.flatMap((result) => (result.reviewer?.usage?.costUsd ?? null) === null ? [] : [result.reviewer!.usage!.costUsd!]);
  return { reviews: HISTORY_REVIEWS, medianDurationMs: median(newest.map((result) => result.reviewer!.durationMs!)), medianCostUsd: costs.length === 0 ? null : median(costs) };
}

/** `--exclude` lines a limit refusal can be passed with (08-E3). */
export function refusalSuggestions(refusal: AmbicodeError, files: readonly DiffFile[]): string[] {
  if (refusal.code === 'snapshot-too-large') return refusal.details.filter((line) => /^\s*--exclude "/.test(line)).map((line) => line.trim());
  const pathOf = (file: DiffFile): string => file.newPath ?? file.oldPath ?? '';
  const largest = [...files].sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines)).slice(0, SUGGESTED_EXCLUDES);
  const top = [...new Set(files.map(pathOf).filter((file) => file.includes('/')).map((file) => file.split('/')[0]!))];
  return [...largest.map((file) => `--exclude "${pathOf(file)}"`), ...(top.length >= 2 && top.length <= 3 ? top.map((dir) => `--only "${dir}/**"`) : [])];
}

/** A `narrow` answer: `--only <glob>` / `--exclude <glob>` pairs and nothing else (08-E6). */
export function parseNarrow(text: string): { onlyPaths: string[]; excludePaths: string[] } {
  const tokens = tokenize(text);
  const narrowed = { onlyPaths: [] as string[], excludePaths: [] as string[] };
  for (let index = 0; index < tokens.length; index += 2) {
    const [flag, glob] = [tokens[index], tokens[index + 1]];
    if ((flag !== '--only' && flag !== '--exclude') || glob === undefined || glob.startsWith('--') || glob.trim() === '') {
      throw new AmbicodeError('bad-argument', `A narrowing is --only <glob> or --exclude <glob> tokens; "${flag ?? text}" is not one.`, { field: 'narrow' });
    }
    (flag === '--only' ? narrowed.onlyPaths : narrowed.excludePaths).push(glob);
  }
  if (tokens.length === 0) throw new AmbicodeError('bad-argument', 'A narrowing needs at least one --only or --exclude token.', { field: 'narrow' });
  return narrowed;
}

const NOTHING_RUNS: ProcessRunner = { run: async () => { throw new Error('The review estimate runs no project command.'); } };

/** The review measured without writing a snapshot, running a check or a selector, or appending to a ledger (07-E1 … 07-E3). */
export async function estimateReview(runtime: Runtime, options: AssembleOptions): Promise<ReviewEstimate> {
  const dry = await assembleBundle({ ...options, runtime, dryRun: true });
  const changedOf = new Map(groupByProject(dry.workspace, dry.files).map((entry) => [entry.project.id, entry.changed]));
  const target = dry.target.kind === 'branch' ? `branch ${dry.target.baseRef ?? dry.target.baseSha?.slice(0, 12) ?? "base"}..HEAD` : 'working tree';
  const checks: ReviewEstimate['checks'] = [];
  for (const { project, policy } of dry.policies) {
    for (const checkId of Object.keys(project.checks).sort()) {
      const key = checkApprovalKey(project.id, checkId);
      const check = project.checks[checkId];
      const command = check === null || check === undefined ? undefined : project.commands[check.command];
      if (check === null || check === undefined || command === null || command === undefined) {
        checks.push({ key, decision: 'skip', reason: check == null ? 'not configured' : `command "${check.command}" is not configured` });
        continue;
      }
      const authorization = authorizeCommand({ policy, commandId: check.command, approvalKey: key, approvals: options.approvals });
      if (authorization.kind === 'refused') {
        checks.push({ key, decision: 'forbid', reason: authorization.reason });
        continue;
      }
      const lint = adapterFor(check.adapter).role === 'lint';
      // A runner-listed selection is known only by running project code, which an estimate never does.
      if (!lint && selectionRunsCommand(check)) {
        checks.push({ key, decision: 'unknown', reason: `selected at review time${authorization.kind === 'needs-approval' ? `; needs approval if a test is selected (${authorization.reason})` : ''}` });
        continue;
      }
      const select = {
        fs: runtime.fs, project, check, changed: changedOf.get(project.id) ?? [], repositoryRoot: dry.workspace.repositoryRoot, runner: NOTHING_RUNS, enumerationRevision: null,
        maxSelectedTestFiles: dry.workspace.config.checks.maxSelectedTestFiles, timeoutMs: 0, commandArgv: command.argv, authorize: () => authorization,
      };
      const selection = lint ? selectLintFiles(select) : await selectTestFiles(select);
      if (selection.files.length === 0) {
        checks.push({ key, decision: 'skip', reason: selection.complete ? 'no changed file is in scope' : (selection.limitations[0] ?? 'no test file could be selected') });
      } else if (authorization.kind === 'allowed' && selection.approval === null) checks.push({ key, decision: 'run', reason: null });
      else checks.push({ key, decision: options.declines.has(key) ? 'skip' : 'waiting', reason: options.declines.has(key) ? 'declined' : (selection.approval?.reason ?? (authorization.kind === 'needs-approval' ? authorization.reason : 'needs authorization')) });
    }
  }
  return {
    target,
    files: dry.files.length,
    changedLines: dry.files.reduce((total, file) => total + file.addedLines + file.removedLines, 0),
    checks,
    waitingKeys: checks.filter((check) => check.decision === 'waiting').map((check) => check.key),
    snapshotBytes: dry.plan?.totalBytes ?? null,
    history: await reviewHistory(runtime.fs, dry.workspace.repositoryRoot),
    refusal: dry.refusal === null ? null : { code: dry.refusal.code as 'input-too-large', message: dry.refusal.message, suggestions: refusalSuggestions(dry.refusal, dry.files) },
  };
}

const more = (count: number): string => `… ${count} more`;

/** Refusal and its suggestions first; lists are cut with "… N more" to stay within 2,048 bytes (08-E5). */
export function renderEstimate(estimate: ReviewEstimate): string {
  const refusal = estimate.refusal === null ? [] : [
    `refused before the snapshot: ${estimate.refusal.code}: ${estimate.refusal.message}`.slice(0, 300),
    ...estimate.refusal.suggestions.slice(0, 6).map((line) => `  ${line}`.slice(0, 160)),
    ...(estimate.refusal.suggestions.length > 6 ? [`  ${more(estimate.refusal.suggestions.length - 6)}`] : []),
  ];
  const head = [
    ...refusal,
    `Review estimate: ${estimate.target} · ${estimate.files} file(s) · ${estimate.changedLines} changed line(s) · snapshot ${estimate.snapshotBytes === null ? 'not planned' : `${estimate.snapshotBytes} bytes`}`,
  ];
  const waiting = estimate.waitingKeys.length <= 8 ? estimate.waitingKeys.join(', ') : `${estimate.waitingKeys.slice(0, 8).join(', ')}, ${more(estimate.waitingKeys.length - 8)}`;
  const history = estimate.history;
  const tail = [
    `waiting: ${estimate.waitingKeys.length === 0 ? 'none' : waiting}`.slice(0, 300),
    history === null ? 'history: no history' : `history: median ${Math.round(history.medianDurationMs / 1000)}s${history.medianCostUsd === null ? '' : `, $${history.medianCostUsd.toFixed(2)}`} over the last ${history.reviews} reviews`,
  ];
  const lines = estimate.checks.map((check) => `  ${check.key} ${check.decision}${check.reason === null ? '' : ` — ${check.reason}`}`.slice(0, 160));
  const size = (shown: number): number => Buffer.byteLength([...head, 'checks:', ...lines.slice(0, shown), `  ${more(lines.length - shown)}`, ...tail].join('\n'));
  let shown = lines.length;
  while (shown > 0 && size(shown) > MAX_ESTIMATE_BYTES) shown -= 1;
  const cut = shown < lines.length ? [`  ${more(lines.length - shown)}`] : [];
  return [...head, 'checks:', ...lines.slice(0, shown), ...cut, ...tail].join('\n');
}
