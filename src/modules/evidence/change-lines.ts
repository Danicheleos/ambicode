// Mirror of changeLines/fileSection in evals/scripts/src/analysis/bench-score.mjs. Both suites run
// evals/common/fixtures/change-lines.json so the scorer and the Stop check cannot disagree on what a change line is.

/** The body of the last `## Files` heading, up to the next heading of the same or a higher level; null when the answer has none. */
export function filesSection(message: string): string | null {
  const lines = message.split('\n');
  let start = -1;
  let level = 0;
  lines.forEach((line, i) => {
    const heading = /^(#{1,6})\s*\**\s*files\b/i.exec(line);
    if (heading?.[1] !== undefined) {
      start = i;
      level = heading[1].length;
    }
  });
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

// A group the answer says it does not change. BE6140 e-OXdoVc lists ReportHelper and the router under "Files that need
// no change:" inside `## Files`, and scoring them as changes cost it precision 1.00 -> 0.43.
const EXCLUDED_GROUP = /\b(?:no changes?|not (?:be )?(?:changed|modified|edited)|unchanged|needs? no|for reference|reference only|evidence only|context only|read[- ]only|out of scope|excluded|left out|rejected|do(?:es)? not need)\b|^[#*\s]*evidence[*:\s]*$/i;
const EXCLUDED_ITEM = /\b(?:needs? no changes?|no changes? (?:is )?(?:needed|required)|not (?:be )?(?:changed|modified)|unchanged|(?:listed )?(?:only )?for reference|reference only|does not need (?:to )?change)\b/i;
// "Likely unchanged. Touch it only if..." (30_2248 be-vs-4606) keeps the file in play: only a decided exclusion leaves the change set.
const HEDGED = /\b(?:probably|likely|possibly|maybe|perhaps|may|might|to check|unless|only if)\b/i;
const BULLET = /^( *)(?:[-*+]|\d+[.)])\s+/;
const decided = (pattern: RegExp, line: string): boolean => pattern.test(line) && !HEDGED.test(line);

/**
 * The Files section split into the lines the answer proposes to change and those it decides not to: a heading or
 * lead-in line that says so excludes its group, a bullet or table row that says so excludes itself, and nested lines
 * follow their bullet. A hedged exclusion stays a change.
 */
export function changeLines(text: string): { change: string; excluded: string } {
  const change: string[] = [];
  const excluded: string[] = [];
  let group = false;
  let item = false;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const bullet = BULLET.exec(line);
    if (line.startsWith('|')) item = group || decided(EXCLUDED_ITEM, line);
    else if (bullet === null && !/^\s/.test(line)) {
      group = decided(EXCLUDED_GROUP, line);
      item = group;
    } else if (bullet !== null && (bullet[1]?.length ?? 0) <= 1) item = group || decided(EXCLUDED_ITEM, line);
    (item ? excluded : change).push(line);
  }
  return { change: change.join('\n'), excluded: excluded.join('\n') };
}
