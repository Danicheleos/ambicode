import { z } from 'zod';
import { describeIssues } from '../config/load.ts';
import {
  RequirementConflict,
  RequirementEnvelopeSource,
  RequirementSource,
  type ProvenanceEntry,
  type RequirementMode,
} from '../contracts/requirements.ts';
import { MAX_EVIDENCE_BYTES } from '../config/defaults.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { StandardInput } from '../ports/stdin.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Validates what the outer session retrieved over MCP. This module never fetches
 * anything, holds a credential, or speaks to Atlassian.
 */

export const RequirementEvidence = z.strictObject({
  mcpServer: z.string().min(1).nullable().default(null),
  sources: z.array(RequirementEnvelopeSource).default([]),
  conflicts: z
    .array(RequirementConflict.omit({ detectedBy: true }))
    .default([]),
});
export type RequirementEvidence = z.infer<typeof RequirementEvidence>;

export type { RequirementMode };

export interface NormalizedRequirements {
  mode: RequirementMode;
  sources: RequirementSource[];
  conflicts: z.infer<typeof RequirementConflict>[];
  mcpServer: string | null;
  notices: string[];
  provenance: ProvenanceEntry[];
}

export interface NormalizeOptions {
  urls: readonly string[];
  evidence: RequirementEvidence | null;
  configuredServer: string | null;
  /** Read once, after validation: every source of one run shares the time the envelope arrived. */
  clock: Clock;
}

export const SOURCE_FREE: NormalizedRequirements = {
  mode: 'source-free',
  sources: [],
  conflicts: [],
  mcpServer: null,
  notices: [],
  provenance: [],
};

export type EvidenceSource = { kind: 'stdin' } | { kind: 'file'; path: string };

export interface EvidenceInput {
  fs: FileSystem;
  stdin: StandardInput;
}

export async function loadRequirementEvidence(
  io: EvidenceInput,
  source: EvidenceSource,
): Promise<RequirementEvidence> {
  if (source.kind === 'file') return readRequirementEvidence(io.fs, source.path);

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

export async function readRequirementEvidence(
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
      details: [cause instanceof Error ? cause.message : String(cause)],
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

  if (urls.length === 0) {
    if (options.evidence !== null && options.evidence.sources.length > 0) {
      throw new AmbicodeError(
        'requirements-undeclared',
        'Requirement evidence was supplied for URLs that the review was not asked to judge against.',
        {
          details: [
            'Every requirement must be declared with --requirement <url>; the evidence file answers those URLs.',
            ...options.evidence.sources.map((source) => `Undeclared: ${source.url}`),
          ],
        },
      );
    }
    return { ...SOURCE_FREE, notices: [] };
  }

  for (const url of urls) assertRetrievableUrl(url);

  const duplicated = urls.filter((url, index) => urls.findIndex((other) => sameUrl(other, url)) !== index);
  if (duplicated.length > 0) {
    throw new AmbicodeError('requirements-duplicated', 'The same requirement URL was supplied more than once.', {
      details: [...new Set(duplicated)],
    });
  }

  if (options.evidence === null) {
    throw new AmbicodeError(
      'requirements-not-retrieved',
      'Requirement URLs were supplied but no retrieved evidence was, so this review cannot judge the change against them.',
      {
        details: [
          ...urls,
          'The reviewing session retrieves each URL over the configured MCP server and passes the result with --evidence <file>.',
          'Run the review without requirement URLs if a quality review is what you want.',
        ],
      },
    );
  }

  const notices: string[] = [];
  const server = bindServer(options.configuredServer, options.evidence.mcpServer, notices);

  const sources = matchSources(urls, options.evidence.sources);
  assertRetrieved(sources);
  assertContent(sources);

  const conflicts = [
    ...options.evidence.conflicts.map((conflict) => ({ ...conflict, detectedBy: 'session' as const })),
    ...structuralConflicts(sources),
  ];
  if (conflicts.length > 0) {
    throw new AmbicodeError(
      'requirements-conflicting',
      'The supplied requirements contradict each other, so there is no single contract to review against.',
      {
        details: [
          ...conflicts.map(
            (conflict) => `${conflict.sourceIds.join(' vs ')}: ${conflict.summary} (reported by the ${conflict.detectedBy})`,
          ),
          'Resolve the contradiction at the source, or supply only the requirement that currently applies.',
        ],
      },
    );
  }

  const receivedAt = options.clock.now().toISOString();
  const ordered = sources
    .map((source) => RequirementSource.parse({ ...source, receivedAt }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    mode: 'requirement-based',
    sources: ordered,
    conflicts: [],
    mcpServer: server,
    notices,
    provenance: ordered.map((source) => ({
      kind: 'requirement' as const,
      reference: `${source.id} ${source.url}${source.sourceVersion === null ? '' : ` @${source.sourceVersion}`}`,
      contentHash: contentHash(source.content),
    })),
  };
}

function bindServer(configured: string | null, declared: string | null, notices: string[]): string | null {
  if (configured !== null && declared !== null && configured !== declared) {
    throw new AmbicodeError(
      'requirements-server-mismatch',
      'The requirement evidence came from a different MCP server than the one this repository is bound to.',
      {
        field: 'requirements.mcpServer',
        details: [
          `Configured: ${configured}. Evidence declares: ${declared}.`,
          'Retrieve the requirements through the configured server, or change the binding deliberately.',
        ],
      },
    );
  }
  if (configured !== null && declared === null) {
    throw new AmbicodeError(
      'requirements-server-unrecorded',
      'The requirement evidence does not record which MCP server produced it.',
      {
        field: 'requirements.mcpServer',
        details: [`This repository is bound to "${configured}"; the evidence must name the server it used.`],
      },
    );
  }
  if (configured === null) {
    notices.push(
      declared === null
        ? 'No MCP server is recorded for this retrieval and requirements.mcpServer is unset, so the source of this evidence cannot be established from the result.'
        : `requirements.mcpServer is unset, so nothing pins retrieval to a server; this evidence declares "${declared}".`,
    );
  }
  return declared ?? configured;
}

function matchSources(
  urls: readonly string[],
  supplied: readonly RequirementSource[],
): RequirementSource[] {
  const missing: string[] = [];
  const matched: RequirementSource[] = [];

  for (const url of urls) {
    const candidates = supplied.filter((source) => sameUrl(source.url, url));
    if (candidates.length === 0) {
      missing.push(url);
      continue;
    }
    if (candidates.length > 1) {
      throw new AmbicodeError(
        'requirements-ambiguous',
        'The evidence holds more than one retrieval for the same requirement URL.',
        { details: [url, 'AMBICODE will not choose which retrieval the review was about.'] },
      );
    }
    matched.push(candidates[0] as RequirementSource);
  }

  if (missing.length > 0) {
    throw new AmbicodeError(
      'requirements-not-retrieved',
      'A supplied requirement was not retrieved, so this review cannot judge the change against its requirements.',
      {
        details: [
          ...missing.map((url) => `No evidence for ${url}`),
          'Fix access to the source and retrieve it again, or run the review without requirement URLs to get a quality review instead.',
        ],
      },
    );
  }

  const extra = supplied.filter((source) => !urls.some((url) => sameUrl(source.url, url)));
  if (extra.length > 0) {
    throw new AmbicodeError(
      'requirements-undeclared',
      'The evidence holds requirements the review was not asked to judge against.',
      {
        details: [
          ...extra.map((source) => source.url),
          'Declare every requirement with --requirement <url>, or remove it from the evidence.',
        ],
      },
    );
  }

  const byId = new Map<string, string>();
  for (const source of matched) {
    const previous = byId.get(source.id);
    if (previous !== undefined && !sameUrl(previous, source.url)) {
      throw new AmbicodeError(
        'requirements-ambiguous',
        `Two requirement sources share the id "${source.id}" but point at different documents.`,
      );
    }
    byId.set(source.id, source.url);
  }
  return matched;
}

function assertRetrieved(sources: readonly RequirementSource[]): void {
  const failed = sources.filter((source) => source.status !== 'retrieved');
  if (failed.length === 0) return;
  throw new AmbicodeError(
    'requirements-unavailable',
    'A supplied requirement source could not be retrieved, so this review cannot judge the change against its requirements.',
    {
      details: [
        ...failed.map(
          (source) =>
            `${source.url}: ${source.status}${source.failureReason === null ? '' : ` — ${source.failureReason}`}`,
        ),
        'Fix access to the source, or run the review without requirement URLs to get a quality review instead.',
      ],
    },
  );
}

function assertContent(sources: readonly RequirementSource[]): void {
  const empty = sources.filter((source) => source.content.trim() === '');
  if (empty.length === 0) return;
  throw new AmbicodeError(
    'requirements-empty',
    'A requirement source was reported as retrieved but carries no content.',
    { details: empty.map((source) => source.url) },
  );
}

function structuralConflicts(
  sources: readonly RequirementSource[],
): z.infer<typeof RequirementConflict>[] {
  const conflicts: z.infer<typeof RequirementConflict>[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const a = sources[i] as RequirementSource;
      const b = sources[j] as RequirementSource;
      if (!sameUrl(a.url, b.url)) continue;
      if (a.content === b.content) continue;
      conflicts.push({
        summary: `the same document was retrieved twice with different content (${a.url})`,
        sourceIds: [a.id, b.id],
        detectedBy: 'helper',
      });
    }
  }
  return conflicts;
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
