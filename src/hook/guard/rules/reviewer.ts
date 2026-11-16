// A read-only subagent has no Bash; its one write is the answer file the route reads at `route next`.
// A review folder is `.ambicode/reviews/<run>/<n>` or `.ambicode/tasks/<task>/reviews/<n>` (nextReviewDirectory); the plan critic's file sits in the task's steps folder.
// `agent` is Claude Code's `agent_type`: a plugin agent is namespaced, a local copy is not.
const ANSWERERS: readonly { agent: RegExp; answer: RegExp; refusal: string }[] = [
  {
    agent: /^(?:ambicode:)?reviewer$/,
    answer: /(?:^|\/)\.ambicode\/(?:reviews\/[^/]+|tasks\/[^/]+\/reviews)\/\d+\/answer\.json$/,
    refusal: 'AMBICODE: the reviewer writes only its `answer.json` in the review folder named in the work file, with the Write tool. Read files with Read, Grep and Glob.',
  },
  {
    agent: /^(?:ambicode:)?plan-critic$/,
    answer: /(?:^|\/)\.ambicode\/tasks\/[^/]+\/steps\/critic-answer\.json$/,
    refusal: 'AMBICODE: the plan critic writes only its `critic-answer.json` in the task steps folder named in the work file, with the Write tool. Read files with Read, Grep and Glob.',
  },
];

/** The refusal for a file tool call of a read-only subagent: `null` when it is a Write of its answer file, `undefined` when the agent is not one; `target` is normalized. */
export function answererRefusal(agentType: string, tool: string | undefined, target: string): string | null | undefined {
  const rule = ANSWERERS.find((candidate) => candidate.agent.test(agentType));
  if (rule === undefined) return undefined;
  return tool === 'Write' && rule.answer.test(target) ? null : rule.refusal;
}
