import type { EnvelopeSource } from './envelope.ts';

export interface AcceptanceCriterion { id: string; key: string; quote: string; where: string }

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(\S.*)$/;
const SECTION = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(acceptance criteria|definition of done|\bAC\b|\bDoD\b)(?:\*\*)?\s*:?\s*$/i;
const HEADING = /^\s*(?:#{1,6}\s+\S|\*\*[^*]+\*\*\s*:?\s*$|[A-Za-z][\w ]{0,40}:\s*$)/;
const NORMATIVE = /\b(must|should|shall|will|needs? to|has to|cannot)\b/i;
const MIN_SENTENCE = 40;

interface Unit { quote: string; where: string }

const headingText = (line: string): string => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/:\s*$/, '').trim();

function sections(lines: readonly string[]): Unit[] {
  const items: Unit[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!SECTION.test(lines[index]!)) continue;
    const where = `section:${headingText(lines[index]!)}`;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!;
      if (line.trim() !== '' && HEADING.test(line) && !BULLET.test(line)) break;
      const bullet = BULLET.exec(line);
      if (bullet !== null) items.push({ quote: bullet[1]!.trim(), where });
    }
  }
  return items;
}

function unitsOf(content: string): Unit[] {
  const lines = content.split(/\r?\n/);
  const explicit = sections(lines);
  if (explicit.length > 0) return explicit;
  const bullets = lines.flatMap((line) => BULLET.exec(line)?.[1]?.trim() ?? []);
  if (bullets.length > 0) return bullets.map((quote) => ({ quote, where: 'list' }));
  return content
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE && NORMATIVE.test(sentence))
    .map((quote) => ({ quote, where: 'prose' }));
}

/**
 * Acceptance units of each source: an explicit AC or Definition-of-done section, else its bullets and numbered
 * items, else long normative sentences. Ids are `AC-<key>-<nn>` in reading order, so the same text gives the same ids.
 * The units are a signal, not recall truth.
 */
export function splitAcs(sources: readonly Pick<EnvelopeSource, 'key' | 'content'>[]): AcceptanceCriterion[] {
  return sources.flatMap((source) =>
    unitsOf(source.content)
      .slice(0, 999)
      .map((unit, index) => ({ id: `AC-${source.key}-${String(index + 1).padStart(2, '0')}`, key: source.key, quote: unit.quote, where: unit.where })),
  );
}
