// Serves investigate, plan and review: their notes reach .ambicode/tasks and .ambicode/reviews only through `note save`.
// A task's plan.md (not a review run's) is not a note: the plan route writes it with Write and Edit, so the lookahead leaves it out.
export const RUN_DIR = /(?:^|\/)\.ambicode\/(?:tasks(?:\/(?![^/]+\/plan\.md$)|$)|reviews(?:\/|$))/;

export function noteSaveReason(pluginRoot: string): string {
  return (
    `AMBICODE: .ambicode/tasks/ and .ambicode/reviews/ are written only through \`node "${pluginRoot}/scripts/ambicode.mjs" note save ` +
    '--task <slug> --kind investigation|notes|result|report`, with the note on standard ' +
    'input. It names the file, stamps the time and adds the label. Run that instead.'
  );
}
