import type { LedgerEntry } from '#types/modules/evidence';

/** The [from, to) character ranges of a plan's fenced code blocks; an unclosed fence runs to the end. */
export function fencedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open: { fence: string; from: number } | null = null;
  let offset = 0;
  for (const line of text.split('\n')) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      if (open === null) open = { fence, from: offset };
      else if (fence[0] === open.fence[0] && fence.length >= open.fence.length) {
        ranges.push([open.from, offset + line.length]);
        open = null;
      }
    }
    offset += line.length + 1;
  }
  if (open !== null) ranges.push([open.from, text.length]);
  return ranges;
}

interface IterationHeading { number: number; title: string; index: number }

/** The `## Iteration N<sep> title` headings of a plan, in order, outside fenced code (a fenced one is example text): the one parser every reader of a plan's iterations uses. */
export function iterationHeadings(plan: string): IterationHeading[] {
  const fenced = fencedRanges(plan);
  return [...plan.matchAll(/^##[ \t]+Iteration[ \t]+(\d+)\b[ \t]*[:.\u2014\u2013-]?[ \t]*(.*?)[ \t]*$/gim)]
    .filter(({ index }) => !fenced.some(([from, to]) => index >= from && index < to))
    .map((heading) => ({ number: Number(heading[1]), title: heading[2]!, index: heading.index }));
}

/** The offsets of the level-2 headings of a plan outside fenced code: every reader of where a section ends uses these. */
export function level2Starts(plan: string): number[] {
  const fenced = fencedRanges(plan);
  return [...plan.matchAll(/^##\s+\S.*$/gm)].map((heading) => heading.index).filter((index) => !fenced.some(([from, to]) => index >= from && index < to));
}

/** Where the section starting at `start` ends: the next level-2 heading of any kind, or the end of the plan. */
export function sectionEnd(plan: string, start: number, level2: readonly number[] = level2Starts(plan)): number {
  return level2.find((at) => at > start) ?? plan.length;
}

/** An iteration is done when a route covering it (start.iteration through start.through) exited `done`, however the review went; an interrupted or blocked route leaves it open. */
export function doneIterations(entries: readonly LedgerEntry[]): Set<number> {
  const done = new Set<number>();
  for (const exit of entries) {
    if (exit.kind !== 'exit' || exit['reason'] !== 'done') continue;
    const start = entries.find((entry) => entry.kind === 'step' && entry['step'] === 'start' && entry['route'] === exit['route']);
    if (typeof start?.['iteration'] !== 'number') continue;
    const through = typeof start['through'] === 'number' ? start['through'] : start['iteration'];
    for (let number = start['iteration']; number <= through; number += 1) done.add(number);
  }
  return done;
}
