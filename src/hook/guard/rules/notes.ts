// Serves investigate, plan and review: their notes reach .ambicode/tasks and .ambicode/reviews only through `note save`.
export const RUN_DIR = /(?:^|\/)\.ambicode\/(?:tasks|reviews)(?:\/|$)/;

export function noteSaveReason(pluginRoot: string): string {
  return (
    `AMBICODE: .ambicode/tasks/ and .ambicode/reviews/ are written only through \`node "${pluginRoot}/scripts/ambicode.mjs" note save ` +
    '--task <slug> --kind investigation|plan-draft|notes`, with the note on standard ' +
    'input. It names the file, stamps the time and adds the label. Run that instead.'
  );
}
