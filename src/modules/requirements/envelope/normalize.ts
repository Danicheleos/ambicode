import { describeIssues } from '#modules/config/load';
import { RequirementSource, RequirementEvidence, type RequirementMode, type NormalizedRequirements, type EvidenceSource } from '#types/modules/requirements';
import { MAX_EVIDENCE_BYTES } from '#types/defaults';
import { AmbicodeError, messageOf } from '#util/errors';
import { contentHash } from '#util/hash';
import type { FileSystem, StandardInput } from '#types/platform/ports';

/**
 * Validates what the outer session retrieved over MCP. This module never fetches
 * anything, holds a credential, or speaks to Atlassian.
 */

export type { RequirementMode };

interface NormalizeOptions {
  urls: readonly string[];
  evidence: RequirementEvidence | null;
  /** `captured`: the ids are a route's hook-captured sources, keyed by URL or by issue key when the capture has none. */
  declared?: 'urls' | 'captured';
}

const SOURCE_FREE: NormalizedRequirements = {
  mode: 'source-free',
  sources: [],
  notices: [],
  provenance: [],
};

interface EvidenceInput {
  fs: FileSystem;
  stdin: StandardInput;
}

export async function loadRequirementEvidence(
  io: EvidenceInput,
  source: EvidenceSource,
): Promise<RequirementEvidence> {
  if (source.kind === 'file') return readRequirementEvidence(io.fs, source.path);
  if (source.kind === 'inline') return source.evidence;

  const raw = await io.stdin.read(MAX_EVIDENCE_BYTES);
  if (raw === null) {
    throw new AmbicodeError(
      'requirements-unreadable',
      `The requirement evidence piped on standard input exceeds ${MAX_EVIDENCE_BYTES} bytes.`,
      {
        field: '--evidence -',
        details: [
          'Nothing was normalized: a partially read envelope is not evidence.',
          'Supply fewer or smaller requirement sources.',
        ],
      },
    );
  }
  if (raw.trim() === '') {
    throw new AmbicodeError(
      'requirements-unreadable',
      '"--evidence -" was given but standard input was empty.',
      {
        field: '--evidence -',
        details: ['Pipe the evidence envelope the retrieving session built, or omit --evidence.'],
      },
    );
  }
  return parseRequirementEvidence(raw, 'standard input');
}

async function readRequirementEvidence(
  fs: FileSystem,
  filePath: string,
): Promise<RequirementEvidence> {
  let raw: string;
  try {
    raw = await fs.readText(filePath);
  } catch (cause) {
    throw new AmbicodeError('requirements-unreadable', 'The requirement evidence file could not be read.', {
      field: filePath,
      cause,
      details: [
        'The reviewing session writes this file after retrieving each requirement URL over MCP.',
      ],
    });
  }
  return parseRequirementEvidence(raw, filePath);
}

function parseRequirementEvidence(raw: string, where: string): RequirementEvidence {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (cause) {
    throw new AmbicodeError('requirements-unparsable', 'The requirement evidence is not valid JSON.', {
      field: where,
      details: [messageOf(cause)],
    });
  }

  const parsed = RequirementEvidence.safeParse(document);
  if (!parsed.success) {
    throw new AmbicodeError(
      'requirements-invalid',
      'The requirement evidence does not match the expected shape.',
      { field: where, details: describeIssues(parsed.error) },
    );
  }
  return parsed.data;
}

/**
 * Every failure blocks the requirement-based review; none degrades into a quality
 * review, which would answer a question the operator did not ask.
 */
export function normalizeRequirements(options: NormalizeOptions): NormalizedRequirements {
  const urls = options.urls.map((value) => value.trim()).filter((value) => value !== '');
  const supplied = options.evidence?.sources ?? [];

  if (urls.length === 0) {
    if (supplied.length > 0) {
      throw new AmbicodeError('requirements-undeclared', 'Requirement evidence was supplied for URLs that the review was not asked to judge against.', {
        details: ['Every requirement must be declared with --requirement <url>; the evidence file answers those URLs.', ...supplied.map((source) => `Undeclared: ${source.url}`)],
      });
    }
    return { ...SOURCE_FREE, notices: [] };
  }

  if (options.declared !== 'captured') for (const url of urls) assertRetrievableUrl(url);
  if (options.evidence === null) {
    throw new AmbicodeError('requirements-not-retrieved', 'Requirement URLs were supplied but no retrieved evidence was, so this review cannot judge the change against them.', {
      details: [...urls, 'Retrieve each URL with the MCP tools and pass the result with --evidence -.', 'Run the review without requirement URLs if a quality review is what you want.'],
    });
  }

  const sources = urls.map((url) => supplied.find((source) => sameUrl(source.url, url)));
  const missing = urls.filter((_, index) => sources[index] === undefined);
  const extra = supplied.filter((source) => !urls.some((url) => sameUrl(source.url, url)));
  if (missing.length > 0) throw new AmbicodeError('requirements-not-retrieved', 'A supplied requirement was not retrieved, so this review cannot judge the change against its requirements.', { details: missing.map((url) => `No evidence for ${url}`) });
  if (extra.length > 0) throw new AmbicodeError('requirements-undeclared', 'The evidence holds requirements the review was not asked to judge against.', { details: extra.map((source) => source.url) });
  const found = sources as RequirementSource[];
  const failed = found.filter((source) => source.status !== 'retrieved' || source.content.trim() === '');
  if (failed.length > 0) {
    throw new AmbicodeError('requirements-unavailable', 'A supplied requirement source could not be retrieved or carries no content, so this review cannot judge the change against its requirements.', {
      details: failed.map((source) => `${source.url}: ${source.status}${source.failureReason === null ? '' : ` — ${source.failureReason}`}`),
    });
  }

  const ordered = [...found].sort((a, b) => a.id.localeCompare(b.id));
  return {
    mode: 'requirement-based',
    sources: ordered,
    notices: [],
    provenance: ordered.map((source) => ({ kind: 'requirement' as const, reference: `${source.id} ${source.url}${source.sourceVersion === null ? '' : ` @${source.sourceVersion}`}`, contentHash: contentHash(source.content) })),
  };
}

function assertRetrievableUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AmbicodeError('requirements-invalid-url', 'A requirement must be a URL.', {
      details: [url, 'Pass the Jira issue or Confluence page URL, for example --requirement https://example.atlassian.net/browse/ABC-1.'],
    });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AmbicodeError(
      'requirements-invalid-url',
      'A requirement URL must use http or https.',
      { details: [url, 'Requirements are retrieved over MCP; no other scheme is fetched.'] },
    );
  }
}

function sameUrl(a: string, b: string): boolean {
  return canonicalUrl(a) === canonicalUrl(b);
}

export function canonicalUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hostname = url.hostname.toLowerCase();
    url.protocol = url.protocol.toLowerCase();
    if (url.pathname.endsWith('/') && url.pathname !== '/') url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return value.trim();
  }
}
