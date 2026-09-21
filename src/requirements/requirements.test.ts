import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RequirementSource } from '../contracts/review.ts';
import { isAmbicodeError } from '../util/errors.ts';
import {
  canonicalUrl,
  normalizeRequirements,
  type NormalizeOptions,
} from './normalize.ts';

const JIRA = 'https://example.atlassian.net/browse/ORD-17';
const CONFLUENCE = 'https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders';

function source(overrides: Partial<RequirementSource> & { url: string }): RequirementSource {
  return {
    id: overrides.id ?? 'ORD-17',
    url: overrides.url,
    title: overrides.title ?? 'Reject negative order amounts',
    retrievedAt: overrides.retrievedAt ?? '2026-09-20T09:00:00.000Z',
    sourceVersion: overrides.sourceVersion ?? '12',
    updatedAt: overrides.updatedAt ?? '2026-09-19T17:30:00.000Z',
    content: overrides.content ?? 'A negative order amount is rejected with a validation error.',
    citations: overrides.citations ?? ['ORD-17 description'],
    status: overrides.status ?? 'retrieved',
    failureReason: overrides.failureReason ?? null,
    retrievedVia: overrides.retrievedVia ?? 'mcp__atlassian__getJiraIssue',
  };
}

function normalize(options: Partial<NormalizeOptions> = {}) {
  return normalizeRequirements({
    urls: options.urls ?? [],
    evidence: options.evidence ?? null,
    configuredServer: 'configuredServer' in options ? options.configuredServer ?? null : 'atlassian',
  });
}

function failure(run: () => unknown): { code: string; message: string; details: string[] } {
  try {
    run();
  } catch (error) {
    assert.ok(isAmbicodeError(error), `expected an AmbicodeError, got ${String(error)}`);
    return { code: error.code, message: error.message, details: error.details };
  }
  assert.fail('expected the requirement normalization to be refused');
}

describe('U16 requirement normalization and provenance', () => {
  it('without a URL, normalization is source-free — a canonical, activity-neutral label', () => {
    const normalized = normalize();
    assert.equal(normalized.mode, 'source-free');
    assert.deepEqual(normalized.sources, []);
    assert.deepEqual(normalized.provenance, []);
  });

  it('keeps provenance for each retrieved source and pins its content by hash', () => {
    const normalized = normalize({
      urls: [JIRA],
      evidence: { mcpServer: 'atlassian', sources: [source({ url: JIRA })], conflicts: [] },
    });

    assert.equal(normalized.mode, 'requirement-based');
    assert.equal(normalized.mcpServer, 'atlassian');
    const [only] = normalized.sources;
    assert.ok(only);
    assert.equal(only.url, JIRA);
    assert.equal(only.sourceVersion, '12');
    assert.equal(only.updatedAt, '2026-09-19T17:30:00.000Z');
    assert.equal(only.retrievedVia, 'mcp__atlassian__getJiraIssue');
    assert.deepEqual(only.citations, ['ORD-17 description']);

    const [provenance] = normalized.provenance;
    assert.ok(provenance);
    assert.equal(provenance.kind, 'requirement');
    assert.match(provenance.reference, /ORD-17 .*@12/);
    assert.match(provenance.contentHash, /^sha256:[0-9a-f]{32}$/);
  });

  it('accepts several requirement URLs and keeps them in a stable order', () => {
    const normalized = normalize({
      urls: [CONFLUENCE, JIRA],
      evidence: {
        mcpServer: 'atlassian',
        sources: [
          source({ url: CONFLUENCE, id: 'ENG-orders-page', content: 'Orders are validated at the edge.' }),
          source({ url: JIRA }),
        ],
        conflicts: [],
      },
    });

    assert.equal(normalized.mode, 'requirement-based');
    assert.deepEqual(
      normalized.sources.map((entry) => entry.id),
      ['ENG-orders-page', 'ORD-17'],
    );
    assert.equal(normalized.provenance.length, 2);
  });

  it('blocks when a supplied requirement could not be retrieved', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA],
        evidence: {
          mcpServer: 'atlassian',
          sources: [
            source({ url: JIRA, status: 'forbidden', content: '', failureReason: 'no read access' }),
          ],
          conflicts: [],
        },
      }),
    );
    assert.equal(error.code, 'requirements-unavailable');
    assert.ok(error.details.some((detail) => detail.includes('no read access')));
  });

  it('blocks when a URL was supplied and no evidence came back at all', () => {
    const error = failure(() => normalize({ urls: [JIRA] }));
    assert.equal(error.code, 'requirements-not-retrieved');
  });

  it('blocks when the evidence answers only some of the supplied URLs', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA, CONFLUENCE],
        evidence: { mcpServer: 'atlassian', sources: [source({ url: JIRA })], conflicts: [] },
      }),
    );
    assert.equal(error.code, 'requirements-not-retrieved');
    assert.ok(error.details.some((detail) => detail.includes(CONFLUENCE)));
  });

  it('never turns a failed requirement retrieval into a quality review', () => {
    // The offer of a quality review is advice in the message, never a fallback
    // the helper takes on its own behalf (D04).
    const error = failure(() =>
      normalize({
        urls: [JIRA],
        evidence: {
          mcpServer: 'atlassian',
          sources: [source({ url: JIRA, status: 'not-found', content: '', failureReason: 'deleted' })],
          conflicts: [],
        },
      }),
    );
    assert.match(
      error.details.join('\n'),
      /run the review without requirement URLs to get a quality review/i,
    );
  });

  it('stops on a contradiction the session reported', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA, CONFLUENCE],
        evidence: {
          mcpServer: 'atlassian',
          sources: [source({ url: JIRA }), source({ url: CONFLUENCE, id: 'ENG-orders-page' })],
          conflicts: [
            {
              summary: 'the ticket rejects a negative amount, the page clamps it to zero',
              sourceIds: ['ORD-17', 'ENG-orders-page'],
            },
          ],
        },
      }),
    );
    assert.equal(error.code, 'requirements-conflicting');
    assert.ok(error.details.some((detail) => detail.includes('reported by the session')));
  });

  it('detects the same document retrieved twice with different content', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA],
        evidence: {
          mcpServer: 'atlassian',
          sources: [
            source({ url: JIRA, id: 'ORD-17-a' }),
            source({ url: `${JIRA}/`, id: 'ORD-17-b', content: 'A negative amount is clamped to zero.' }),
          ],
          conflicts: [],
        },
      }),
    );
    // The duplicate is caught before the contents are compared; either way the
    // review stops rather than choosing one of the two retrievals.
    assert.ok(['requirements-ambiguous', 'requirements-conflicting'].includes(error.code));
  });

  it('refuses evidence from a server other than the configured binding', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA],
        configuredServer: 'atlassian',
        evidence: { mcpServer: 'other-atlassian', sources: [source({ url: JIRA })], conflicts: [] },
      }),
    );
    assert.equal(error.code, 'requirements-server-mismatch');
  });

  it('records a notice rather than a silent success when no server is bound', () => {
    const normalized = normalize({
      urls: [JIRA],
      configuredServer: null,
      evidence: { mcpServer: 'atlassian', sources: [source({ url: JIRA })], conflicts: [] },
    });
    assert.equal(normalized.mode, 'requirement-based');
    assert.ok(normalized.notices.some((notice) => notice.includes('requirements.mcpServer is unset')));
  });

  it('rejects evidence for a requirement the review was not asked about', () => {
    const error = failure(() =>
      normalize({
        urls: [JIRA],
        evidence: {
          mcpServer: 'atlassian',
          sources: [source({ url: JIRA }), source({ url: CONFLUENCE, id: 'sneaked-in' })],
          conflicts: [],
        },
      }),
    );
    assert.equal(error.code, 'requirements-undeclared');
  });

  it('rejects a requirement that is not an http URL', () => {
    assert.equal(failure(() => normalize({ urls: ['file:///etc/passwd'] })).code, 'requirements-invalid-url');
    assert.equal(failure(() => normalize({ urls: ['ORD-17'] })).code, 'requirements-invalid-url');
  });

  it('rejects the same requirement supplied twice', () => {
    const error = failure(() => normalize({ urls: [JIRA, `${JIRA}/`] }));
    assert.equal(error.code, 'requirements-duplicated');
  });

  it('treats host case and a trailing slash as the same document', () => {
    assert.equal(canonicalUrl('https://Example.Atlassian.NET/browse/ORD-17/'), canonicalUrl(JIRA));
    assert.notEqual(canonicalUrl(JIRA), canonicalUrl(CONFLUENCE));
  });
});
