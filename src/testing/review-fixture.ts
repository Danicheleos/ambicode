import { PUBLICATION_SCHEMA_VERSION, type PublicationPositions } from '../contracts/publication.ts';
import { COMPLETE_COVERAGE, type RemoteTarget } from '../contracts/provider.ts';
import { REVIEW_SCHEMA_VERSION, type Finding, type ReviewResult } from '../contracts/review.ts';
import { positionDigest } from '../publication/positions.ts';
import { FAKE_TARGET } from './fake-provider.ts';

/**
 * A saved review the page tests render and publish from. Hostile text is in
 * every untrusted field on purpose: the renderer's job is to show it, not to
 * run it.
 */

export const HOSTILE = '<img src=x onerror="alert(1)"><script>fetch("//evil")</script>';

export const REVIEW_ID = 'r-0001';

export function finding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    risk: 'high',
    confidence: 'medium',
    category: 'correctness',
    location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 },
    supportingLocations: [],
    evidence: '  return amounts.reduce((a, b) => a + b, 0);',
    explanation: 'The reduce has no initial value when the list is empty.',
    suggestedComment: 'Consider seeding the reduce so an empty list returns zero.',
    ruleRefs: [],
    requirementRefs: [],
    ...overrides,
  };
}

export interface FixtureOptions {
  kind?: ReviewResult['target']['kind'];
  remote?: RemoteTarget | null;
  findings?: Finding[];
  status?: ReviewResult['status'];
  reviewerStatus?: 'ok' | 'failed' | 'not-run';
  coverageComplete?: boolean;
}

export function reviewResult(options: FixtureOptions = {}): ReviewResult {
  const kind = options.kind ?? 'merge-request';
  const remote = options.remote === undefined ? (kind === 'merge-request' ? FAKE_TARGET : null) : options.remote;
  const reviewerStatus = options.reviewerStatus ?? 'ok';

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId: REVIEW_ID,
    createdAt: '2026-09-20T10:00:00.000Z',
    pluginVersion: '0.1.0',
    reviewModel: 'sonnet',
    target: {
      kind,
      repositoryRoot: '/work/app',
      snapshotId: 'mr-42-v5-cccccccccccc',
      headSha: remote?.headSha ?? null,
      baseSha: remote?.baseSha ?? null,
      baseRef: null,
      remote,
      notes: [`A note carrying hostile text: ${HOSTILE}`],
    },
    requirements: [
      {
        id: 'ORD-17',
        url: 'https://example.atlassian.net/browse/ORD-17',
        title: `Reject negative amounts ${HOSTILE}`,
        retrievedAt: '2026-09-20T09:00:00.000Z',
        sourceVersion: '3',
        updatedAt: null,
        content: 'The orders service must reject negative amounts.',
        citations: [],
        status: 'retrieved',
        failureReason: null,
        retrievedVia: 'mcp__atlassian__getJiraIssue',
      },
    ],
    requirementMode: 'requirement-based',
    requirementConflicts: [],
    provenance: [{ kind: 'config', reference: '.ambicode/config.yaml', contentHash: 'sha256:abc' }],
    inputs: {
      changedFiles: 1,
      changedLines: 2,
      patchBytes: 120,
      snapshotBytes: 240,
      requirementBytes: 48,
      promptBytes: 900,
      contextBytes: 1_140,
      limits: {
        maxChangedFiles: 50,
        maxChangedLines: 2000,
        maxContextBytes: 524_288,
        maxFindings: 7,
      },
    },
    reviewer: {
      status: reviewerStatus,
      model: 'sonnet',
      timeoutSeconds: 300,
      tools: ['Read', 'Grep', 'Glob'],
      isolation: ['--safe-mode', '--restricted'],
      rejections: [],
      detail: reviewerStatus === 'ok' ? null : `The reviewer failed: ${HOSTILE}`,
    },
    policySummary: { packs: [], ruleIds: [] },
    checks: [
      {
        checkId: 'lint',
        projectId: 'web',
        commandId: 'lint',
        adapter: 'eslint',
        status: 'failed',
        selected: [{ path: 'src/orders.ts', reason: 'changed' }],
        selectionComplete: true,
        argv: ['eslint', '--', 'src/orders.ts'],
        cwd: '/ambicode/work',
        durationMs: 120,
        exitCode: 1,
        outputRef: 'checks/web/lint.txt',
        limitations: [`A limitation carrying hostile text: ${HOSTILE}`],
        mutations: ['modified src/orders.ts (inside the disposable container workspace)'],
      },
    ],
    coverage:
      options.coverageComplete === false
        ? {
            complete: false,
            declaredFileCount: 4,
            deliveredFileCount: 1,
            versionState: 'overflow',
            gaps: [
              {
                kind: 'omitted-files',
                path: null,
                detail: `GitLab declares 4 changed file(s) but delivered 1. ${HOSTILE}`,
              },
            ],
          }
        : COMPLETE_COVERAGE,
    discussions: [],
    changedFiles: [],
    findings: options.findings ?? [
      finding({ id: 'f-aaaa' }),
      finding({
        id: 'f-bbbb',
        risk: 'low',
        location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 3 },
        explanation: `An explanation carrying hostile text: ${HOSTILE}`,
        suggestedComment: `A suggested comment carrying hostile text: ${HOSTILE}`,
        evidence: `const injected = "${HOSTILE}";`,
      }),
      // No saved position for this one: it is displayed but never selectable.
      finding({
        id: 'f-cccc',
        location: { oldPath: null, newPath: 'src/unmapped.ts', side: 'new', line: 99 },
      }),
    ],
    omissions: [`An omission carrying hostile text: ${HOSTILE}`],
    status: options.status ?? 'partial',
    statusReason: 'The review ran, with gaps.',
  };
}

/** Positions for the findings that have one; `f-cccc` deliberately has none. */
export function publicationPositions(
  result: ReviewResult,
  target: RemoteTarget = FAKE_TARGET,
): PublicationPositions {
  const placed = result.findings.filter((entry) => entry.id !== 'f-cccc');
  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    reviewId: result.reviewId,
    derivedAt: '2026-09-20T10:00:05.000Z',
    target,
    positions: placed.map((entry) => {
      const position = {
        baseSha: target.baseSha,
        startSha: target.startSha,
        headSha: target.headSha,
        oldPath: 'src/orders.ts',
        newPath: 'src/orders.ts',
        oldLine: null,
        newLine: entry.location.line,
      };
      return {
        findingId: entry.id,
        provider: target.provider,
        host: target.host,
        projectId: target.projectId,
        projectPath: target.projectPath,
        mergeRequestIid: target.mergeRequestIid,
        webUrl: target.webUrl,
        versionId: target.versionId,
        position,
        digest: positionDigest(result.reviewId, entry.id, target, position),
      };
    }),
    unplaceable: [
      {
        findingId: 'f-cccc',
        reason: 'No exact position could be derived for this finding, so it cannot be published.',
      },
    ],
  };
}
