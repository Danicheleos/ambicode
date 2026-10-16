/** Trailing dots and spaces are not legal at the end of a Windows path segment. */
function sanitize(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '');
  return cleaned.slice(0, maxLength).replace(/[-._]+$/, '');
}

/** The run directory slug, or `null` when the run has no task identity. */
export function taskSlugFor(input: {
  requirementIds: readonly string[];
  task: string | null;
}): string | null {
  const explicit = input.task === null ? "" : sanitize(input.task, 60);
  if (explicit !== "") return explicit;
  const ticket = sanitize(input.requirementIds[0] ?? "", 24);
  return ticket === "" ? null : ticket;
}

/** Also the review id (`view --review <name>`): the minted id makes the name unique without a collision loop. */
export function reviewName(now: Date, id: string): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `review-${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${sanitize(id, 40)}`;
}
