// The reviewer subagent has no Bash; its one write is the answer file the review route reads at `route next`.
/** Claude Code's `agent_type` for the subagent; a plugin agent is namespaced, a local copy is not. */
export const REVIEWER_AGENT = /^(?:ambicode:)?reviewer$/;

// A review folder is `.ambicode/reviews/<run>/<n>` or `.ambicode/tasks/<task>/reviews/<n>` (nextReviewDirectory).
const ANSWER_FILE = /(?:^|\/)\.ambicode\/(?:reviews\/[^/]+|tasks\/[^/]+\/reviews)\/\d+\/answer\.json$/;

/** The refusal for a reviewer's file tool call, `null` when it is a Write of its answer file; `target` is normalized. */
export function reviewerRefusal(tool: string | undefined, target: string): string | null {
  return tool === 'Write' && ANSWER_FILE.test(target) ? null : 'AMBICODE: the reviewer writes only its `answer.json` in the review folder named in the work file, with the Write tool. Read files with Read, Grep and Glob.';
}
