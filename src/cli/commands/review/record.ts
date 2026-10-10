import path from 'node:path';
import { ReviewResult, ReviewerOutput } from '#types/modules/review';
import { MAX_EVIDENCE_BYTES, MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import { openWorkspace } from '#modules/config/workspace';
import { combineDiff } from '#platform/git/diff';
import { appendLedger } from '#platform/ledger/ledger';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { validateFindings } from '#modules/review/findings/validate';
import { applyStatus } from '#modules/review/findings/status';
import { renderReport } from '#modules/review/findings/report';
import { readEntries } from '#harness/engine/context';
import { runCommandTail } from '#harness/engine/engine';
import { COMMAND_SPECS } from '#skills/review/commands';
import { AmbicodeError, messageOf } from '#util/errors';
import { routeTools, taskOf } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const REVIEW_RECORD_OPTIONS = { values: ['task', 'review'], flags: ['json'] } as const;

/** The subagent's answer is one fenced block; a bare object is accepted so a replay by hand works. */
const FENCE = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/;
const REJECTED_FILE = 'rejected-output.txt';

interface RecordOutput { command: 'review record'; task: string; reviewId: string; resultPath: string; reportPath: string; result: ReviewResult; next?: string }

const unfenced = (raw: string): string => FENCE.exec(raw)?.[1]?.trim() ?? raw.trim();

function parseOutput(raw: string): { ok: true; output: ReviewerOutput } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(unfenced(raw));
  } catch (error) {
    return { ok: false, reason: `the reviewer's answer is not JSON: ${messageOf(error)}` };
  }
  const parsed = ReviewerOutput.safeParse(json);
  return parsed.success ? { ok: true, output: parsed.data } : { ok: false, reason: `the reviewer's answer does not match the findings shape: ${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}` };
}

/** The checkout text of each file a `new`-side finding names, size-bounded; a merge request has no checkout to read, so its snippets come from the diff. */
async function checkoutText(runtime: Runtime, root: string, result: ReviewResult, output: ReviewerOutput): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (result.target.kind === 'merge-request') return found;
  for (const finding of output.findings) {
    const name = finding.location.side === 'new' ? finding.location.newPath : null;
    if (name === null || found.has(name)) continue;
    const absolute = path.join(root, name);
    try {
      const stats = await runtime.fs.lstat(absolute);
      if (stats.isFile() && stats.size <= MAX_SNAPSHOT_FILE_BYTES) found.set(name, await runtime.fs.readText(absolute));
    } catch {
      // Unreadable or gone: the validator falls back to the diff line.
    }
  }
  return found;
}

function locate(entries: readonly LedgerEntry[], task: string, wanted: string | null): LedgerEntry {
  // One review has a pending entry and, once recorded, a later recorded one: only the newest per id says where it stands.
  const newest = new Map(entries.filter((entry) => entry.kind === 'review').map((entry) => [String(entry['reviewId']), entry]));
  const entry = wanted === null ? [...newest.values()].findLast((candidate) => candidate['stage'] === 'pending') : newest.get(wanted);
  if (entry === undefined || entry['stage'] !== 'pending') {
    throw new AmbicodeError('review-not-found', wanted === null ? `Task ${task} has no review waiting for its reviewer.` : `Task ${task} has no review ${wanted} waiting for its reviewer (missing, or its answer is already recorded).`, {
      details: [`Release: run \`review --task ${task}\` first; it prints the diff and brief the reviewer reads.`],
    });
  }
  return entry;
}

export async function runReviewRecord(runtime: Runtime, args: ParsedArgs): Promise<RecordOutput> {
  const task = taskOf('review record', args);
  const raw = (await runtime.stdin.read(MAX_EVIDENCE_BYTES)) ?? '';
  const workspace = await openWorkspace(runtime);
  const pending = locate(await readEntries(runtime, task), task, args.value('review'));
  const resultPath = path.join(workspace.repositoryRoot, String(pending['result']));
  const reviewDirectory = path.dirname(resultPath);
  const parsedResult = ReviewResult.safeParse(JSON.parse(await runtime.fs.readText(resultPath)));
  if (!parsedResult.success) throw new AmbicodeError('review-unreadable', `${resultPath} is not a review result.`, { details: [parsedResult.error.issues[0]?.message ?? ''] });
  const result = parsedResult.data;
  const config = workspace.config.skills.review;

  const run = {
    status: 'ok' as 'ok' | 'failed', rejections: [] as string[], detail: null as string | null, rejectedOutputRef: null as string | null, at: runtime.clock.now().toISOString(),
  };
  let ok = true;
  const answer = parseOutput(raw);
  if (!answer.ok) {
    ok = false;
    run.rejections = [answer.reason];
    run.detail = `invalid-output: ${answer.reason}`;
  } else {
    // Only the files that entered the review are valid locations; their order is the patch's (see bundle.ts).
    const reviewable = result.changedFiles.filter((file) => file.exclusionReason === null);
    const files = combineDiff(reviewable.map((file) => ({ oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, oldMode: '', newMode: '' })), await runtime.fs.readText(path.join(reviewDirectory, 'changed.diff')));
    const validated = validateFindings({
      output: answer.output, files, snapshotText: await checkoutText(runtime, workspace.repositoryRoot, result, answer.output), maxFindings: config.maxFindings,
      knownRuleIds: new Set(result.ruleIds), knownRequirementIds: new Set(result.requirements.map((source) => source.id)),
    });
    if (validated.kind === 'invalid') {
      ok = false;
      run.rejections = validated.rejections;
      run.detail = `invalid-output: ${validated.reason}`;
    } else {
      result.findings = validated.findings;
      result.omissions = [...result.omissions, ...answer.output.coverageNotes];
    }
  }
  if (!ok) {
    run.status = 'failed';
    run.rejectedOutputRef = REJECTED_FILE;
    // Untrusted model text, kept for a person diagnosing the refusal; nothing reads it back as findings.
    await runtime.fs.writeText(path.join(reviewDirectory, REJECTED_FILE), `${raw}\n`);
  }
  result.reviewer = run;
  applyStatus(result, ok);

  await runtime.fs.writeText(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await runtime.fs.writeText(path.join(reviewDirectory, 'findings.json'), `${JSON.stringify(result.findings, null, 2)}\n`);
  const carried = Object.fromEntries(['route', 'session', 'baseline', 'preexisting'].filter((key) => pending[key] !== undefined).map((key) => [key, pending[key]]));
  const { entry } = await appendLedger(runtime.fs, (await resolveTaskDir(runtime, task)).root, runtime.clock.now(), runtime.ids.writerId(), {
    ...carried, kind: 'review', reviewId: result.reviewId, result: pending['result'], stage: 'recorded', reviewerRan: true, findings: result.findings.length,
    status: result.status, statusReason: result.statusReason, omissions: result.omissions.length,
  });

  const reportPath = path.join(reviewDirectory, 'report.txt');
  await runtime.fs.writeText(reportPath, `${renderReport({ result, resultPath })}\n`);
  const tools = await routeTools(runtime, task);
  const { binding } = await tools.engine.command(COMMAND_SPECS.reviewRecord, { task }, async ({ binding }) => ({ binding }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'review record', session: binding, produced: [entry.id] });
  return { command: 'review record', task, reviewId: result.reviewId, resultPath, reportPath, result, ...(next === null ? {} : { next: next.text }) };
}

export function renderRecord(output: RecordOutput): string {
  const report = renderReport({ result: output.result, resultPath: output.resultPath });
  const failed = output.result.status === 'error' ? `\n\nNo finding list was produced: ${output.result.statusReason ?? ''}\n${(output.result.reviewer?.rejections ?? []).map((line) => `  - ${line}`).join('\n')}` : '';
  return `${report}${failed}${output.next === undefined ? '' : `\n\n${output.next}`}`;
}

export const reviewRecordCommand: CliCommand = {
  name: 'review record',
  summary: "Record the reviewer's JSON answer from stdin (--task).",
  options: REVIEW_RECORD_OPTIONS,
  run: async (runtime, args) => {
    const output = await runReviewRecord(runtime, args);
    return { text: renderRecord(output), data: output };
  },
};
