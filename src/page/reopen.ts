/**
 * The one canonical form of the reopen command. CLI help, the generated review
 * report, the page's own refusal pages, the skill and the docs all print this,
 * so a reader never meets two spellings of the same thing.
 */
export function reopenCommand(reviewId: string): string {
  return `ambicode view --review ${reviewId}`;
}
