/** Every surface that shows the reopen command prints this one spelling. */
export function reopenCommand(reviewId: string): string {
  return `ambicode view --review ${reviewId}`;
}
