import { describeIssues } from '#modules/config/load';
import { RequirementEvidence, type EvidenceSource, type RequirementSource } from '#types/modules/requirements';
import { MAX_EVIDENCE_BYTES } from '#types/defaults';
import { AmbicodeError, messageOf } from '#util/errors';
import type { Runtime } from '#types/composition';

async function loadEvidence(runtime: Runtime, source: EvidenceSource): Promise<RequirementEvidence> {
  if (source.kind === 'inline') return source.evidence;
  let raw: string | null;
  try {
    raw = source.kind === 'file' ? await runtime.fs.readText(source.path) : await runtime.stdin.read(MAX_EVIDENCE_BYTES);
  } catch (cause) {
    throw new AmbicodeError('requirements-unreadable', 'The requirement evidence file could not be read.', { field: source.kind === 'file' ? source.path : '--evidence -', cause });
  }
  if (raw === null || raw.trim() === '') throw new AmbicodeError('requirements-unreadable', 'The requirement evidence on standard input is empty or exceeds its size cap.', { field: '--evidence -' });
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (cause) {
    throw new AmbicodeError('requirements-unparsable', 'The requirement evidence is not valid JSON.', { details: [messageOf(cause)] });
  }
  const parsed = RequirementEvidence.safeParse(document);
  if (!parsed.success) throw new AmbicodeError('requirements-invalid', 'The requirement evidence does not match the expected shape.', { details: describeIssues(parsed.error) });
  return parsed.data;
}

/**
 * The one place the review reads the requirements module: `assembleBundle` takes sources, never URLs or evidence.
 * A named requirement with no evidence refuses here rather than silently becoming a quality review.
 * Sources come back in the order the caller named them, because the task is named after the first.
 */
export async function requirementSources(runtime: Runtime, input: { urls: readonly string[]; evidence: EvidenceSource | null }): Promise<RequirementSource[]> {
  const urls = input.urls.map((value) => value.trim()).filter((value) => value !== '');
  const supplied = input.evidence === null ? [] : (await loadEvidence(runtime, input.evidence)).sources;
  const sources = urls.map((url) => supplied.find((source) => source.url.trim() === url && source.content.trim() !== ''));
  const missing = urls.filter((_, index) => sources[index] === undefined);
  if (missing.length > 0) throw new AmbicodeError('requirements-not-retrieved', 'A named requirement has no retrieved evidence, so this review cannot judge the change against it.', { details: missing.map((url) => `No evidence for ${url}`) });
  return sources as RequirementSource[];
}
