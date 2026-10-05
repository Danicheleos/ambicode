export interface AcSource { key: string; content: string }
export interface AcUnit { id: string; key: string; quote: string }

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(\S.*)$/;
const SECTION = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(acceptance criteria|definition of done|\bAC\b|\bDoD\b)(?:\*\*)?\s*:?\s*$/i;
const HEADING = /^\s*(?:#{1,6}\s+\S|\*\*[^*]+\*\*\s*:?\s*$|[A-Z][\w ]{2,40}:\s*$)/;
const NORMATIVE = /\b(must|should|shall|will|needs? to)\b/i;
const MIN_SENTENCE = 40;
const MAX_QUOTE = 240;

const clip = (value: string): string => (value.length > MAX_QUOTE ? `${value.slice(0, MAX_QUOTE - 1)}…` : value);

function sections(lines: readonly string[]): string[] {
  const items: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!SECTION.test(lines[index]!)) continue;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!;
      if (line.trim() !== '' && HEADING.test(line) && !BULLET.test(line)) break;
      const bullet = BULLET.exec(line);
      if (bullet !== null) items.push(bullet[1]!.trim());
    }
  }
  return items;
}

function unitsOf(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const explicit = sections(lines);
  if (explicit.length > 0) return explicit;
  const bullets = lines.flatMap((line) => BULLET.exec(line)?.[1]?.trim() ?? []);
  if (bullets.length > 0) return bullets;
  return content
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE && NORMATIVE.test(sentence));
}

/**
 * Acceptance units of each source: an explicit AC or Definition-of-done section, else its bullets and numbered
 * items, else long normative sentences. Ids are `AC-<key>-<nn>` in reading order, so the same text gives the same ids.
 * The units are a signal, not recall truth.
 */
export function splitAcs(sources: readonly AcSource[]): AcUnit[] {
  return sources.flatMap((source) =>
    unitsOf(source.content)
      .slice(0, 99)
      .map((quote, index) => ({ id: `AC-${source.key}-${String(index + 1).padStart(2, '0')}`, key: source.key, quote: clip(quote) })),
  );
}
