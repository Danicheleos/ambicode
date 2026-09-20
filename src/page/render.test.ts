import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTHORITY,
  openPage,
  startHarness,
} from '../testing/page-harness.ts';
import { HOSTILE, reviewResult } from '../testing/review-fixture.ts';

/**
 * U20. The page is rendered by the real templates through the real Fastify
 * route, so what these tests read is what a browser would receive.
 */

describe('U20 the review page shows what the result actually says', () => {
  it('shows the summary a reader needs before any finding', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      assert.match(page.html, /Review r-0001/);
      assert.match(page.html, /partial/);
      assert.match(page.html, /requirement-based/);
      // Host, project, merge request link and the pinned SHAs.
      assert.match(page.html, /gitlab\.example\.com/);
      assert.match(page.html, /group\/sub\/project !42/);
      assert.match(page.html, /merge_requests\/42/);
      assert.match(page.html, /diff version 5/);
      assert.match(page.html, new RegExp(`base <code>${'a'.repeat(40)}</code>`));
      assert.match(page.html, new RegExp(`start <code>${'b'.repeat(40)}</code>`));
      assert.match(page.html, new RegExp(`head <code>${'c'.repeat(40)}</code>`));
      // Requirement sources and provenance.
      assert.match(page.html, /ORD-17/);
      assert.match(page.html, /mcp__atlassian__getJiraIssue/);
      assert.match(page.html, /\.ambicode\/config\.yaml/);
      // Check results, selection completeness and mutations.
      assert.match(page.html, /web\/lint/);
      assert.match(page.html, /selection complete: true/);
      assert.match(page.html, /inside the disposable container workspace/);
      // Ordinary omissions are shown too.
      assert.match(page.html, /An omission carrying hostile text/);
    } finally {
      await harness.dispose();
    }
  });

  it('gives every finding its risk, location, excerpt, textarea and unchecked box', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      assert.match(page.html, /<span class="tag risk-high">high<\/span>/);
      assert.match(page.html, /confidence medium/);
      assert.match(page.html, /correctness/);
      assert.match(page.html, /src\/orders\.ts:2 \(new\)/);
      assert.match(page.html, /amounts\.reduce/);
      assert.match(page.html, /The reduce has no initial value/);
      assert.match(page.html, /<textarea id="body_f-aaaa" name="body_f-aaaa"/);
      assert.match(page.html, /<input type="checkbox" name="select_f-aaaa" value="on">/);
      // Nothing starts checked.
      assert.ok(!/checkbox[^>]*checked/.test(page.html));
    } finally {
      await harness.dispose();
    }
  });

  it('says why a finding without a saved position cannot be published', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      assert.match(page.html, /id="finding-f-cccc"/);
      assert.ok(!page.html.includes('name="select_f-cccc"'));
      assert.match(page.html, /No exact position could be derived/);
    } finally {
      await harness.dispose();
    }
  });

  it('escapes hostile text in every untrusted field', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      // The payload is present as text, with its angle brackets encoded...
      assert.ok(page.html.includes('&lt;img src=x onerror='));
      // ...and never as markup: no tag from the payload survives, and the
      // exact hostile string is nowhere in the document.
      assert.ok(!/<script/i.test(page.html));
      assert.ok(!/<img/i.test(page.html));
      assert.ok(!page.html.includes(HOSTILE));
      // Each untrusted field is covered, not only the first one.
      assert.ok(page.html.includes('A note carrying hostile text'));
      assert.ok(page.html.includes('An explanation carrying hostile text'));
      assert.ok(page.html.includes('A suggested comment carrying hostile text'));
      assert.ok(page.html.includes('A limitation carrying hostile text'));
      assert.ok(page.html.includes('An omission carrying hostile text'));
    } finally {
      await harness.dispose();
    }
  });

  it('loads nothing from a CDN, a remote font or a script, and leaks no capability', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      assert.ok(!/https?:\/\/(?!gitlab\.example\.com|example\.atlassian\.net)/.test(page.html));
      assert.ok(!/<script/i.test(page.html));
      assert.ok(!/fonts\.googleapis|cdn\./i.test(page.html));
      // The one-time capability never appears in a rendered page.
      assert.ok(!page.html.includes(harness.server.capability));
      // Nor does any cookie or secret.
      assert.ok(!/ambicode_session/.test(page.html));
    } finally {
      await harness.dispose();
    }
  });

  it('serves its stylesheet from itself with restrictive headers', async () => {
    const harness = await startHarness();
    try {
      const css = await harness.server.app.inject({
        method: 'GET',
        url: '/assets/page.css',
        headers: { host: AUTHORITY },
      });
      assert.equal(css.statusCode, 200);
      assert.match(css.headers['content-type'] as string, /text\/css/);

      const page = await harness.server.app.inject({
        method: 'GET',
        url: `/?c=${harness.server.capability}`,
        headers: { host: AUTHORITY },
      });
      const csp = page.headers['content-security-policy'] as string;
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /script-src 'none'/);
      assert.match(csp, /style-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /form-action 'self'/);
      assert.equal(page.headers['referrer-policy'], 'no-referrer');
      assert.equal(page.headers['x-content-type-options'], 'nosniff');
      assert.match(page.headers['cache-control'] as string, /no-store/);
    } finally {
      await harness.dispose();
    }
  });

  it('shows a local review without any publication control', async () => {
    const harness = await startHarness({
      result: reviewResult({ kind: 'working', remote: null }),
      positions: null,
      provider: null,
    });
    try {
      const page = await openPage(harness);
      assert.match(page.html, /This is a local review/);
      assert.ok(!page.html.includes('type="checkbox"'));
      assert.ok(!page.html.includes('<button type="submit">'));
    } finally {
      await harness.dispose();
    }
  });

  it('says plainly that an empty finding list from a failed reviewer is not a clean review', async () => {
    const harness = await startHarness({
      result: reviewResult({ findings: [], reviewerStatus: 'failed', status: 'error' }),
      positions: null,
    });
    try {
      const page = await openPage(harness);
      assert.match(page.html, /did not produce a validated result/);
      assert.match(page.html, /This is not a clean review/);
      assert.ok(!page.html.includes('<button type="submit">'));
    } finally {
      await harness.dispose();
    }
  });

  it('says that an empty finding list from a successful reviewer is not a proof either', async () => {
    const harness = await startHarness({ result: reviewResult({ findings: [] }) });
    try {
      const page = await openPage(harness);
      assert.match(page.html, /identified no material issue/);
      assert.match(page.html, /not a proof that the change is correct/);
    } finally {
      await harness.dispose();
    }
  });

  it('identifies a material coverage gap instead of presenting a capped review as whole', async () => {
    const harness = await startHarness({ result: reviewResult({ coverageComplete: false }) });
    try {
      const page = await openPage(harness);
      assert.match(page.html, /does not cover the whole change/);
      assert.match(page.html, /1 file\(s\) were delivered/);
      assert.match(page.html, /of 4 declared/);
      assert.match(page.html, /overflow/);
      assert.match(page.html, /omitted-files/);
    } finally {
      await harness.dispose();
    }
  });
});
