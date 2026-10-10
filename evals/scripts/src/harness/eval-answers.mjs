// What an eval answers at each route gate, typed into the plugin prompt as trusted `--answer` preanswers. The policy
// (user, 2026-10-07): accept what the route proposes, and decline extra work the case did not ask for, such as the
// review offered after a task. A gate not listed here takes its headless default, which the ledger records as
// `default-taken` and the gate prints as a gap, so an unplanned question is visible rather than silently answered.
// Production headless defaults are untouched: only eval prompts carry these.

/** Per skill, `[gate, option]` pairs; every gate and option must exist in `routes/<skill>/<skill>.yaml` (tested). */
export const EVAL_ANSWERS = {
  // `scope` has the single option "pause": nothing to accept, and reaching it is the finding.
  investigate: [],
  task: [
    ['draft-ok', 'implement anyway'],
    ['review-offer', 'skip — verification incomplete'],
  ],
  // The review is the requested work here, not an extra.
  review: [['estimate', 'run']],
  plan: [['plan-accept', 'Accept']],
  init: [['init-apply', 'Apply']],
  rules: [
    ['sources', 'use these sources'],
    ['rules-table', 'Apply all'],
  ],
};

/** The `--answer` flags of a skill, quoted when an option has a space (the prompt hook splits on quotes). */
export function answerFlags(skill) {
  const answers = EVAL_ANSWERS[skill];
  if (answers === undefined) throw new Error(`no eval answers for skill ${skill}: add it to EVAL_ANSWERS`);
  return answers.map(([gate, option]) => {
    const value = `${gate}=${option}`;
    return `--answer ${/\s/.test(value) ? `"${value}"` : value}`;
  });
}

/** The command an eval types before the request: the skill, headless, and its answers. */
export const evalCommand = (skill) => ['/ambicode:' + skill, '--headless', ...answerFlags(skill)].join(' ');
