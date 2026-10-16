/** Replaces the `{files}` argument with the files; any other argument is kept as given. */
export function expandFiles(argv: readonly string[], files: readonly string[]): string[] {
  const expanded: string[] = [];
  for (const argument of argv) {
    if (argument === '{files}') expanded.push(...files);
    else expanded.push(argument);
  }
  return expanded;
}
