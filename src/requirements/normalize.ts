import type { FileSystem } from '../ports/filesystem.ts';
import { z } from 'zod';
import { RequirementSource } from '../contracts/review.ts';
import { describeIssues } from '../config/load.ts';
import { AmbicodeError } from '../util/errors.ts';

/**
 * Requirement evidence comes from the outer Claude session, which is the only
 * party holding an MCP connection. This module validates what it hands over; it
 * never fetches anything itself (doc 02).
 */

const RequirementsFile = z.strictObject({
  /** The MCP server the outer session bound to, recorded as provenance. */
  mcpServer: z.string().min(1).nullable().default(null),
  sources: z.array(RequirementSource).default([]),
});

export type RequirementMode = 'quality-review' | 'requirement-based';

export interface NormalizedRequirements {
  sources: z.infer<typeof RequirementSource>[];
  mode: RequirementMode;
  mcpServer: string | null;
}

export async function loadRequirements(
  fs: FileSystem,
  filePath: string | null,
): Promise<NormalizedRequirements> {
  if (filePath === null) {
    // No supplied source means quality review is available (D04).
    return { sources: [], mode: 'quality-review', mcpServer: null };
  }

  let raw: string;
  try {
    raw = await fs.readText(filePath);
  } catch (cause) {
    throw new AmbicodeError('requirements-unreadable', 'The requirements file could not be read.', {
      field: filePath,
      cause,
    });
  }

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (cause) {
    throw new AmbicodeError('requirements-unparsable', 'The requirements file is not valid JSON.', {
      field: filePath,
      details: [cause instanceof Error ? cause.message : String(cause)],
    });
  }

  const parsed = RequirementsFile.safeParse(document);
  if (!parsed.success) {
    throw new AmbicodeError('requirements-invalid', 'The requirements file does not match the expected shape.', {
      field: filePath,
      details: describeIssues(parsed.error),
    });
  }

  return normalizeRequirements(parsed.data.sources, parsed.data.mcpServer);
}

export function normalizeRequirements(
  sources: readonly z.infer<typeof RequirementSource>[],
  mcpServer: string | null,
): NormalizedRequirements {
  if (sources.length === 0) {
    return { sources: [], mode: 'quality-review', mcpServer };
  }

  const failed = sources.filter((source) => source.status !== 'retrieved');
  if (failed.length > 0) {
    // A failed retrieval stops the requirement-dependent operation; it never
    // degrades into a quality review on its own (D04).
    throw new AmbicodeError(
      'requirements-unavailable',
      'A supplied requirement source could not be retrieved, so this review cannot judge the change against its requirements.',
      {
        details: [
          ...failed.map(
            (source) => `${source.url}: ${source.status}${source.failureReason === null ? '' : ` — ${source.failureReason}`}`,
          ),
          'Fix access to the source, or run the review without requirement URLs to get a quality review instead.',
        ],
      },
    );
  }

  const empty = sources.filter((source) => source.content.trim() === '');
  if (empty.length > 0) {
    throw new AmbicodeError(
      'requirements-empty',
      'A requirement source was reported as retrieved but carries no content.',
      { details: empty.map((source) => source.url) },
    );
  }

  const seen = new Map<string, string>();
  for (const source of sources) {
    const previous = seen.get(source.id);
    if (previous !== undefined && previous !== source.url) {
      throw new AmbicodeError(
        'requirements-ambiguous',
        `Two requirement sources share the id "${source.id}" but point at different documents.`,
      );
    }
    seen.set(source.id, source.url);
  }

  return {
    sources: [...sources].sort((a, b) => a.id.localeCompare(b.id)),
    mode: 'requirement-based',
    mcpServer,
  };
}
