// Claude Code's Read returns at most 25,000 tokens: a 59 KB review brief was cut at byte 37,847 (skills/review/scripts/brief.mjs:155-158, which cannot share code with src).
// 32 KB is 15% under that point, because tokens per byte vary with the content.
const PART_BUDGET_BYTES = 32 * 1024;
// Room in each part for its own heading and the line that points at the next part.
const PART_RESERVE_BYTES = 400;

const bytes = (text: string): number => Buffer.byteLength(text);

/** The text cut at `at` bytes, backed up to a character boundary: the head and the rest. */
function cut(text: string, at: number): [string, string] {
  const buffer = Buffer.from(text);
  let end = Math.max(0, Math.min(at, buffer.length));
  while (end > 0 && end < buffer.length && (buffer[end]! & 0xc0) === 0x80) end -= 1;
  return [buffer.subarray(0, end).toString(), buffer.subarray(end).toString()];
}

/**
 * Splits a section on line boundaries into pieces of at most `room` bytes, the first at most `first`; a later piece repeats the heading so it is not read as another section's text.
 * A single line longer than a piece can hold is cut at the byte boundary of the room left.
 */
function pieces(section: string, first: number, room: number): string[] {
  const [heading = '', ...lines] = section.split('\n');
  const result: string[] = [];
  let piece: string[] = [heading];
  let size = bytes(heading);
  let limit = first;
  const next = (): void => {
    result.push(piece.join('\n'));
    piece = [`${heading} (continued)`];
    size = bytes(piece[0]!);
    limit = room;
  };
  for (let line of lines) {
    while (bytes(line) > room - bytes(`${heading} (continued)`) - 1) {
      const [head, rest] = cut(line, limit - size - 1);
      if (head !== '') {
        piece.push(head);
        line = rest;
      }
      next();
    }
    if (size + 1 + bytes(line) > limit && piece.length > 1) next();
    piece.push(line);
    size += 1 + bytes(line);
  }
  result.push(piece.join('\n'));
  return result;
}

/**
 * The text of each part of a work file, the first first. Sections are placed whole and in order; one that does not fit the room left but fits a part starts the next part,
 * one larger than a part is split on line boundaries. The first part opens with the stamp and, when there are several, a line that lists them and says to read them all.
 */
export function workParts(sections: readonly string[], stamp: string, nameOf: (at: number) => string): string[] {
  const cap = PART_BUDGET_BYTES - PART_RESERVE_BYTES;
  const limit = (at: number): number => (at === 0 ? cap - bytes(stamp) : cap);
  const sizeOf = (part: readonly string[]): number => bytes(part.join('\n\n'));
  const parts: string[][] = [[]];
  const place = (text: string): void => {
    const last = parts.at(-1)!;
    if (sizeOf([...last, text]) <= limit(parts.length - 1)) last.push(text);
    else parts.push([text]);
  };
  for (const section of sections) {
    if (bytes(section) <= cap) place(section);
    else for (const piece of pieces(section, limit(parts.length - 1) - sizeOf(parts.at(-1)!) - 2, cap)) place(piece);
  }
  const total = parts.length;
  return parts.map((body, at) => {
    const lead = at === 0
      ? [stamp, ...(total > 1 ? [`This work file has ${total} parts: ${parts.map((_, index) => nameOf(index)).join(', ')}. Read every part, in order, before your first action: the sections continue past this one.`] : [])]
      : [`# Work file, part ${at + 1} of ${total}`, `This continues ${nameOf(at - 1)}. Read every part, in order.`];
    const trailer = at === total - 1 ? [] : [`(continued in ${nameOf(at + 1)}, part ${at + 2} of ${total})`];
    return `${[...lead, ...body, ...trailer].join('\n\n')}\n`;
  });
}
