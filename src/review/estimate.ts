import type { Runtime } from '../composition/root.ts';
import { adapterFor } from '../checks/adapters.ts';
import { authorizeCommand, checkApprovalKey } from '../checks/authorize.ts';
import { selectionRunsCommand, selectLintFiles, selectTestFiles } from '../checks/select.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { assembleBundle, groupByProject, type AssembleOptions } from './bundle.ts';

export const MAX_ESTIMATE_BYTES = 2_048;

export interface ReviewEstimate {
  target: string;
  files: number;
  changedLines: number;
  checks: { key: string; decision: 'run' | 'waiting' | 'skip' | 'forbid' | 'unknown'; reason: string | null }[];
  waitingKeys: string[];
  snapshotBytes: number | null;
  history: { reviews: 5; medianDurationMs: number; medianCostUsd: number | null } | null;
  refusal: { code: 'input-too-large' | 'snapshot-too-large'; message: string; suggestions: string[] } | null;
}

const NOTHING_RUNS: ProcessRunner = { run: async () => { throw new Error('The review estimate runs no project command.'); } };

/** The review measured without writing a snapshot, running a check or a selector, or appending to a ledger (07-E1 … 07-E3). */
export async function estimateReview(runtime: Runtime, options: AssembleOptions): Promise<ReviewEstimate> {
  const dry = await assembleBundle({ ...options, runtime, dryRun: true });
  const changedOf = new Map(groupByProject(dry.workspace, dry.files).map((entry) => [entry.project.id, entry.changed]));
  const target = dry.target.kind === 'merge-request' ? (dry.target.remote?.webUrl ?? 'merge request') : dry.target.kind === 'branch' ? `branch ${dry.target.baseRef ?? dry.target.baseSha?.slice(0, 12) ?? "base"}..HEAD` : 'working tree';
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
    history: null,
    refusal: dry.refusal === null ? null : { code: dry.refusal.code as 'input-too-large', message: dry.refusal.message, suggestions: [] },
  };
}

export function renderEstimate(estimate: ReviewEstimate): string {
  const head = [
    `Review estimate: ${estimate.target} · ${estimate.files} file(s) · ${estimate.changedLines} changed line(s) · snapshot ${estimate.snapshotBytes === null ? 'not planned' : `${estimate.snapshotBytes} bytes`}`,
    ...(estimate.refusal === null ? [] : [`refused before the snapshot: ${estimate.refusal.code}: ${estimate.refusal.message}`.slice(0, 400)]),
  ];
  const tail = [
    `waiting: ${estimate.waitingKeys.length === 0 ? 'none' : estimate.waitingKeys.join(', ')}`.slice(0, 300),
    estimate.history === null ? 'history: no history' : `history: median ${Math.round(estimate.history.medianDurationMs / 1000)}s over the last ${estimate.history.reviews} reviews`,
  ];
  const lines = estimate.checks.map((check) => `  ${check.key} ${check.decision}${check.reason === null ? '' : ` — ${check.reason}`}`.slice(0, 160));
  const size = (shown: number): number => Buffer.byteLength([...head, 'checks:', ...lines.slice(0, shown), `  (+${lines.length - shown} more)`, ...tail].join('\n'));
  let shown = lines.length;
  while (shown > 0 && size(shown) > MAX_ESTIMATE_BYTES) shown -= 1;
  const more = shown < lines.length ? [`  (+${lines.length - shown} more)`] : [];
  return [...head, 'checks:', ...lines.slice(0, shown), ...more, ...tail].join('\n');
}
