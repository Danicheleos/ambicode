import { REVIEW_SCHEMA_VERSION, type Finding, type ReviewResult } from '#types/modules/review';

/** Hostile text is in every untrusted field on purpose: the renderer's job is to show it, not run it. */

export const HOSTILE = '<img src=x onerror="alert(1)"><script>fetch("//evil")</script>';

export const REVIEW_ID = 'r-0001';

export function finding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    risk: 'high',
    confidence: 'medium',
    category: 'correctness',
    location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 },
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
  findings?: Finding[];
  status?: ReviewResult['status'];
  reviewerStatus?: 'ok' | 'failed';
}

export function reviewResult(options: FixtureOptions = {}): ReviewResult {
  const kind = options.kind ?? 'merge-request';
  const reviewerStatus = options.reviewerStatus ?? 'ok';

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId: REVIEW_ID,
    createdAt: '2026-09-20T10:00:00.000Z',
    target: {
      kind,
      repositoryRoot: '/work/app',
      snapshotId: 'mr-42-v5-cccccccccccc',
      headSha: 'cccccccccccccccccccccccccccccccccccccccc',
      baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      baseRef: null,
      notes: [`A note carrying hostile text: ${HOSTILE}`],
    },
    requirements: [
      {
        id: 'ORD-17',
        url: 'https://example.atlassian.net/browse/ORD-17',
        title: `Reject negative amounts ${HOSTILE}`,
        retrievedAt: '2026-09-20T09:00:00.000Z',
        content: 'The orders service must reject negative amounts.',
      },
    ],
    requirementMode: 'requirement-based',
    inputs: {
      changedFiles: 1,
      changedLines: 2,
      patchBytes: 120,
      requirementBytes: 48,
      contextBytes: 1_140,
    },
    brief: null,
    reviewer: {
      status: reviewerStatus,
      rejections: [],
      detail: reviewerStatus === 'ok' ? null : `The reviewer failed: ${HOSTILE}`,
      rejectedOutputRef: null,
      at: null,
    },
    ruleIds: [],
    checks: [{ key: 'web/lint', phase: 'green', exit: 1, argv: ['eslint', '--', 'src/orders.ts'], only: ['src/orders.ts'] }],
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
