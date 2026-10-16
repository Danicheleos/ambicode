import { MAX_EVIDENCE_BYTES } from '#types/defaults';
import { runCommandTail } from '#harness/engine/engine';
import { recordReviewerAnswer, renderRecord } from '#skills/review/record-answer';
import { routeTools, taskOf } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ReviewResult } from '#types/modules/review';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const REVIEW_RECORD_OPTIONS = { values: ['task', 'review'], flags: ['json'] } as const;

interface RecordOutput { command: 'review record'; task: string; reviewId: string; resultPath: string; reportPath: string; result: ReviewResult; next?: string }

export async function runReviewRecord(runtime: Runtime, args: ParsedArgs): Promise<RecordOutput> {
  const task = taskOf('review record', args);
  const { entryId, ...recorded } = await recordReviewerAnswer(runtime, { task, wanted: args.value('review'), fallback: async () => (await runtime.stdin.read(MAX_EVIDENCE_BYTES)) ?? '' });
  const tools = await routeTools(runtime);
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'review record', produced: [entryId] });
  return { command: 'review record', ...recorded, ...(next === null ? {} : { next: next.text }) };
}

export const reviewRecordCommand: CliCommand = {
  name: 'review record',
  summary: "Record the reviewer's JSON answer, from stdin (--task).",
  options: REVIEW_RECORD_OPTIONS,
  run: async (runtime, args) => {
    const output = await runReviewRecord(runtime, args);
    return { text: renderRecord(output), data: output };
  },
};
