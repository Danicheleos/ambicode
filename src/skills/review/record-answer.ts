import path from 'node:path';
import { attention } from '#modules/review/omission';
import { ReviewResult, ReviewerOutput } from '#types/modules/review';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import { openWorkspace } from '#modules/config/workspace';
import { combineDiff } from '#platform/git/diff';
import { validateFindings } from '#modules/review/findings/validate';
import { applyStatus } from '#modules/review/findings/status';
import { renderReport } from '#modules/review/findings/report';
import { AmbicodeError, messageOf } from '#util/errors';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';

/** The subagent's answer is a fenced block, the last one that parses winning; a bare object is accepted so a replay by hand works. */
const FENCE = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g;
const REJECTED_FILE = 'rejected-output.txt';
/** Where the reviewer's Write tool puts its answer, in the review folder; the guard's reviewer rule and the brief script name the same file. */
export const ANSWER_FILE = 'answer.json';

interface RecordedReview { reviewId: string; resultPath: string; reportPath: string; result: ReviewResult }

// A reviewer may send a draft block before its final one.
const candidates = (raw: string): string[] => {
  const blocks = [...raw.matchAll(FENCE)].map((match) => match[1]!.trim()).reverse();
  return blocks.length === 0 ? [raw.trim()] : blocks;
};

function parseOutput(raw: string): { ok: true; output: ReviewerOutput } | { ok: false; reason: string } {
  let reason = '';
  for (const text of candidates(raw)) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      reason ||= `the reviewer's answer is not JSON: ${messageOf(error)}`;
      continue;
    }
    const parsed = ReviewerOutput.safeParse(json);
    if (parsed.success) return { ok: true, output: parsed.data };
    reason ||= `the reviewer's answer does not match the findings shape: ${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`;
  }
  return { ok: false, reason };
}

/** The text, in the target's checkout, of each file a `new`-side finding names, size-bounded. A merge request whose head was not checked out has none: its root is the working tree, so its snippets come from the diff. */
async function checkoutText(runtime: Runtime, result: ReviewResult, output: ReviewerOutput): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (result.target.diffOnly !== undefined) return found;
  for (const finding of output.findings) {
    const name = finding.location.side === 'new' ? finding.location.newPath : null;
    if (name === null || found.has(name)) continue;
    const absolute = path.join(result.target.repositoryRoot, name);
    try {
      const stats = await runtime.fs.lstat(absolute);
      if (stats.isFile() && stats.size <= MAX_SNAPSHOT_FILE_BYTES) found.set(name, await runtime.fs.readText(absolute));
    } catch {
      // Unreadable or gone: the validator falls back to the diff line.
    }
  }
  return found;
}

/** Everything the recorded review needs: validates the answer against the pinned diff, writes the result files and appends the `recorded` entry. A missing answer is a failed review, never a clean one. */
export async function recordReviewerAnswer(runtime: Runtime, input: { pending: LedgerEntry; policy?: LedgerEntry; answer: string | null; append: (fields: { kind: string; [field: string]: unknown }) => Promise<LedgerEntry> }): Promise<RecordedReview> {
  const { pending } = input;
  const workspace = await openWorkspace(runtime);
  const resultPath = path.join(workspace.repositoryRoot, String(pending['result']));
  const reviewDirectory = path.dirname(resultPath);
  const raw = input.answer?.trim() ? input.answer : null;
  const parsedResult = ReviewResult.safeParse(JSON.parse(await runtime.fs.readText(resultPath)));
  if (!parsedResult.success) throw new AmbicodeError('review-unreadable', `${resultPath} is not a review result.`, { details: [parsedResult.error.issues[0]?.message ?? ''] });
  const result = parsedResult.data;
  // The one staging of the review's rules is both what the brief carries and what a finding may cite; its error diagnostics keep the result partial without stopping the reviewer.
  const policyIds = (input.policy?.['ids'] as string[] | undefined) ?? [];
  result.omissions.push(...((input.policy?.['problems'] as string[] | undefined) ?? []).map(attention));
  const config = workspace.config.skills.review;

  const run = {
    status: 'ok' as 'ok' | 'failed', rejections: [] as string[], detail: null as string | null, rejectedOutputRef: null as string | null, at: runtime.clock.now().toISOString(),
  };
  let ok = true;
  const answer = raw === null ? { ok: false as const, reason: `the reviewer wrote no ${ANSWER_FILE}` } : parseOutput(raw);
  if (!answer.ok) {
    ok = false;
    run.rejections = [answer.reason];
    run.detail = `invalid-output: ${answer.reason}`;
  } else {
    // Only the files that entered the review are valid locations; their order is the patch's (see bundle.ts).
    const reviewable = result.changedFiles.filter((file) => file.exclusionReason === null);
    const files = combineDiff(reviewable.map((file) => ({ oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, oldMode: '', newMode: '' })), await runtime.fs.readText(path.join(reviewDirectory, 'changed.diff')));
    const validated = validateFindings({
      output: answer.output, files, snapshotText: await checkoutText(runtime, result, answer.output), maxFindings: config.maxFindings,
      knownRuleIds: new Set(policyIds), knownRequirementIds: new Set(result.requirements.map((source) => source.id)),
    });
    if (validated.kind === 'invalid') {
      ok = false;
      run.rejections = validated.rejections;
      run.detail = `invalid-output: ${validated.reason}`;
    } else {
      result.findings = validated.findings;
      // Listed in Part 4 beside the omissions; applyStatus keeps the review partial while any is there.
      run.rejections = validated.rejected;
      result.requirementCoverage = validated.coverage;
      const unanswered = result.requirements.filter((source) => !validated.coverage.some((point) => point.ref === source.id));
      result.omissions = [...result.omissions, ...[...answer.output.coverageNotes, ...validated.dropped, ...unanswered.map((source) => `requirement ${source.id}: the reviewer gave no per-point answer`)].map(attention)];
    }
  }
  if (!ok) {
    run.status = 'failed';
    if (raw !== null) {
      run.rejectedOutputRef = REJECTED_FILE;
      // Untrusted model text, kept for a person diagnosing the refusal; nothing reads it back as findings.
      await runtime.fs.writeText(path.join(reviewDirectory, REJECTED_FILE), `${raw}\n`);
    }
  }
  result.reviewer = run;
  applyStatus(result, ok);

  await runtime.fs.writeText(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await runtime.fs.writeText(path.join(reviewDirectory, 'findings.json'), `${JSON.stringify(result.findings, null, 2)}\n`);
  const carried = Object.fromEntries(['route', 'session', 'baseline', 'preexisting'].filter((key) => pending[key] !== undefined).map((key) => [key, pending[key]]));
  // The report goes first: the ledger entry is what makes the review recorded, so nothing may fail after it.
  const reportPath = path.join(reviewDirectory, 'report.txt');
  await runtime.fs.writeText(reportPath, `${renderReport({ result, resultPath })}\n`);
  await input.append({
    ...carried, kind: 'review', reviewId: result.reviewId, result: pending['result'], stage: 'recorded', reviewerRan: true, findings: result.findings.length,
    status: result.status, statusReason: result.statusReason, omissions: result.omissions.length,
  });

  return { reviewId: result.reviewId, resultPath, reportPath, result };
}

/** What the model reads after a record: the report, then why no findings came when the answer was refused. */
export function renderRecord({ result, resultPath, reportPath }: { result: ReviewResult; resultPath: string; reportPath: string }): string {
  const failed = result.status === 'error' ? `\n\nNo finding list was produced: ${result.statusReason ?? ''}\n${(result.reviewer?.rejections ?? []).map((line) => `  - ${line}`).join('\n')}` : '';
  const full = result.findings.length === 0 ? '' : `\n\nThe full report, with each finding's code excerpt, suggested comment and rule ids: ${reportPath}`;
  return `${renderReport({ result, resultPath, compact: true })}${failed}${full}`;
}
