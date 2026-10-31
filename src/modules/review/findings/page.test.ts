import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finding, reviewResult } from '#testing/fixtures/review-fixture';
import { capturedFiles } from '#modules/review/snapshot/target';
import { renderIndex, renderReviewPage, themed } from './page.ts';

/** Everything after the last finding: the requirements, what needs attention, the review scope. */
const gapsOf = (html: string): string => html.slice(Math.max(html.lastIndexOf('</article>'), 0), html.indexOf('<form id="close"'));

describe('the review page', () => {
  it('lists findings, numbered as the publish list is, before every gap line', () => {
    const findings = [finding({ id: 'f-1' }), finding({ id: 'f-2', risk: 'low', location: { oldPath: 'a.ts', newPath: 'b.ts', side: 'new', line: 9 } })];
    const html = renderReviewPage({ ...reviewResult({ findings }), omissions: [{ kind: 'attention', text: 'gap-line-one' }], checks: [] }, 'csrf-token', { reviewId: 'r', findings: {} });
    const numbers = [...html.matchAll(/name="pick" value="(\d+)"/g)].map((match) => Number(match[1]));
    assert.deepEqual(numbers, [1, 2]);
    assert.match(html, /<code>b\.ts:9<\/code>/);
    assert.match(html, /risk-high">high<\/span> <span class="meta">confidence: medium · correctness/);
    assert.match(html, /name="comment-1"[^>]*>Consider seeding/);
    for (const gap of ['gap-line-one', 'No check recorded', 'Review partial']) assert.ok(html.indexOf(gap) > html.lastIndexOf('</article>'), gap);
  });

  it('lists a finding\'s other locations under a collapsed Also line, and nothing for one without', () => {
    const extra = { oldPath: 'x/<b>.ts', newPath: 'x/<b>.ts', side: 'new' as const, line: 7 };
    const html = renderReviewPage(reviewResult({ findings: [finding({ id: 'f-1', supportingLocations: [extra, { ...extra, line: 8 }] }), finding({ id: 'f-2' })] }), 'c');
    assert.equal(html.match(/<details>/g)?.length, 1);
    assert.match(html, /<details><summary>Also: 2 locations<\/summary><ul><li><code>x\/&#60;b&#62;\.ts:7<\/code><\/li><li><code>x\/&#60;b&#62;\.ts:8<\/code><\/li><\/ul><\/details>/);
  });

  it('shows a finding as header, problem, impact and confidence, then the comment, then Also, then the code', () => {
    const extra = { oldPath: 'a.ts', newPath: 'a.ts', side: 'new' as const, line: 7 };
    const html = renderReviewPage(reviewResult({ findings: [finding({ id: 'f-1', supportingLocations: [extra], confidence: 'low' })] }), 'c', { reviewId: 'r', findings: {} });
    const at = ['class="tag risk-high">high<', '<b>Problem:</b> The reduce has no initial value', '<b>Impact:</b> An empty order throws', '<b>Confidence:</b> low — the call site passes', '<textarea', 'Also: 1 location', 'return amounts.reduce'].map((text) => html.indexOf(text));
    assert.ok(at.every((index) => index >= 0), JSON.stringify(at));
    assert.deepEqual(at, [...at].sort((x, y) => x - y));
  });

  it('keeps every gap: a failed reviewer and no finding are not a clean review, rejections and failing checks are listed', () => {
    const failed = reviewResult({ reviewerStatus: 'failed' });
    const html = renderReviewPage({ ...failed, status: 'error', statusReason: 'no validated answer', omissions: [{ kind: 'attention', text: 'narrowed to src/' }], checks: [{ key: 'unit', phase: 'green', exit: 1, files: [] }] }, 'c');
    const [attention = '', scope = ''] = gapsOf(html).split('<details class="scope">');
    assert.match(attention, /This is not a clean review/);
    assert.match(attention, /narrowed to src\//);
    assert.match(attention, /unit green: exit 1.*FAILED/);
    assert.match(scope, /Review error: no validated answer/);
    assert.doesNotMatch(scope, /not a clean review/);
    const none = renderReviewPage(reviewResult({ findings: [] }), 'c');
    assert.match(none, /No findings\./);
    assert.match(gapsOf(none), /not a proof that the change is correct/);
  });

  it('splits what is left over: requirement points as rows, attention open, routine scope in a closed details', () => {
    const base = reviewResult({ findings: [finding({ id: 'f1' })] });
    const requirement = { id: 'https://x.example/browse/VS-1', url: 'https://x.example/browse/VS-1', title: 'Totals', retrievedAt: 't', content: 'c' };
    const html = renderReviewPage({
      ...base, requirements: [requirement],
      requirementCoverage: [
        { ref: requirement.id, point: 'Sums every line', status: 'missed', note: 'empty list throws', finding: 'f1' },
        { ref: requirement.id, point: 'Rounds to cents', status: 'covered', note: '', finding: null },
        { ref: requirement.id, point: 'Exports as CSV', status: 'cannot-verify', note: 'no exporter in the diff', finding: null },
      ],
      omissions: [{ kind: 'attention', text: 'security.md in the checkout was treated as repository content' }, { kind: 'scope', text: 'This is a merge-request review, so test code was not reviewed.' }],
    }, 'c');
    const requirements = html.slice(html.indexOf('<section class="requirements">'), html.indexOf('</section>', html.indexOf('<section class="requirements">')));
    assert.match(requirements, /<tr class="point-missed"><td>missed<\/td><td>Sums every line<\/td><td>empty list throws <a href="#f1">f1<\/a><\/td><\/tr>/);
    assert.match(requirements, /<td>cannot verify from the diff<\/td><td>Exports as CSV/);
    assert.match(html, /<article id="f1"/);
    const attention = html.slice(html.indexOf('<section class="attention">'), html.indexOf('</section>', html.indexOf('<section class="attention">')));
    assert.match(attention, /security\.md in the checkout/);
    assert.doesNotMatch(attention, /test code was not reviewed/);
    const scope = html.slice(html.indexOf('<details class="scope">'));
    assert.match(scope, /^<details class="scope"><summary>Review scope: \d+ routine notes?<\/summary>/);
    assert.match(scope, /test code was not reviewed/);
    assert.ok(html.indexOf('<section class="attention">') < html.indexOf('<details class="scope">'));
  });

  it('escapes every untrusted field and carries no script, review id, hash or timestamp', () => {
    const hostile = '<script>alert(1)</script>';
    const html = renderReviewPage(reviewResult({ findings: [finding({ id: 'f-1', suggestedComment: hostile, problem: hostile, evidence: hostile, category: hostile })] }), '"><script>x</script>');
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&#60;script&#62;alert\(1\)&#60;\/script&#62;/);
    assert.doesNotMatch(html, /r-0001|2026-09-20/);
  });

  it('puts the merge-request title and !iid in the title and h1, escaped, and describes a local target briefly', () => {
    const html = renderReviewPage(reviewResult(), 'c', null, { title: 'Fix <b>x</b>', url: 'https://gitlab.example/g/p/-/merge_requests/2774' });
    assert.match(html, /<title>Fix &#60;b&#62;x&#60;\/b&#62; \(!2774\)<\/title>/);
    assert.match(html, /<h1>Fix &#60;b&#62;x&#60;\/b&#62; \(!2774\)<\/h1>/);
    assert.match(html, /href="https:\/\/gitlab\.example\/g\/p\/-\/merge_requests\/2774"/);
    const local = reviewResult({ kind: 'branch' });
    assert.match(renderReviewPage({ ...local, target: { ...local.target, baseRef: 'main' } }, 'c'), /<h1>Branch cccccccc against main<\/h1>/);
    assert.match(renderReviewPage(reviewResult({ kind: 'working' }), 'c'), /<h1>Working tree changes<\/h1>/);
  });

  it('keeps Publish, Close and Delete in one action row, each of the last two its own csrf form under the review path', () => {
    const html = renderReviewPage(reviewResult(), 'tok', { reviewId: 'r', findings: {} }, { base: '/r/mr-7' });
    const row = /<div class="actions">(.*?)<\/div>/s.exec(html)![1]!;
    assert.match(row, />Publish<\/button>/);
    assert.match(row, /<button type="submit" form="close">Close<\/button><button type="submit" form="delete">Delete<\/button>/);
    assert.match(row, /posted comments stay on the MR/);
    assert.match(html, /<form id="publish" method="post" action="\/r\/mr-7\/publish">/);
    assert.match(html, /<form id="close" method="post" action="\/r\/mr-7\/close"><input type="hidden" name="csrf" value="tok"><\/form>\n<form id="delete" method="post" action="\/r\/mr-7\/delete"><input type="hidden" name="csrf" value="tok"><\/form>/);
    assert.match(html, /<a href="\/">All reviews<\/a>/);
    const local = renderReviewPage(reviewResult(), 'tok');
    assert.doesNotMatch(local, />Publish</);
    assert.match(local, /<div class="actions"><button type="submit" form="close">/);
  });

  it('lists each review as a row that links to its page, escaped, newest first as the caller orders it', () => {
    const html = renderIndex([{ slug: 'mr-7', title: 'Fix <b>totals</b> (!7)', createdAt: '2026-10-23T09:15:00Z', findings: 3, published: '1 of 3 posted' }, { slug: 'old', title: 'old', createdAt: '', findings: null, published: 'no readable review' }]);
    assert.match(html, /<a href="\/r\/mr-7">Fix &#60;b&#62;totals&#60;\/b&#62; \(!7\)<\/a>/);
    assert.match(html, /<td>2026-10-23 09:15<\/td><td>3<\/td><td>1 of 3 posted<\/td>/);
    assert.match(renderIndex([]), /No saved reviews\./);
  });

  it('shows every hunk of the finding file with the finding line marked, folded above it, and escapes the diff', () => {
    const body = Array.from({ length: 12 }, (_, at) => ` ctx${at + 1}`).join('\n');
    const patch = `diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,12 +1,13 @@\n${body}\n+  <script>alert(1)</script>\n@@ -40,1 +41,1 @@\n-gone & old\n+new\n`;
    const files = capturedFiles(patch);
    const at = finding({ id: 'f-1', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 13 } });
    const html = renderReviewPage(reviewResult({ findings: [at] }), 'c', null, { files });
    assert.equal([...html.matchAll(/ hit"/g)].length, 2, 'the window and the expanded block both mark the line');
    assert.match(html, /<span class="l add hit"><i><\/i><i>13<\/i>\+  &#60;script&#62;alert\(1\)&#60;\/script&#62;<\/span>/);
    assert.match(html, /<summary>Expand: all 17 lines of this file's diff<\/summary><pre class="full">/);
    const compact = /<div class="code"><pre>(.*?)<\/pre>/s.exec(html)![1]!;
    assert.equal(compact.split('<span class="l').length - 1, 8, 'from four above the finding line to the end of a 17-row diff, at most ten');
    assert.match(compact, /^<span class="l "><i>9<\/i>/);
    assert.match(html, /class="l hunk">@@ -40,1 \+41,1 @@/);
    assert.match(html, /class="l del"><i>40<\/i><i><\/i>-gone &#38; old/);
    assert.match(html, /class="l add"><i><\/i><i>41<\/i>\+new/);
    assert.doesNotMatch(html, /<script/);
    const outside = renderReviewPage(reviewResult({ findings: [{ ...at, location: { ...at.location, line: 999 } }] }), 'c', null, { files });
    assert.doesNotMatch(outside, /class="code"/);
    assert.match(outside, /<pre>  return amounts/);
  });

  it('folds repeated per-file gaps into one counted line and keeps every file listed', () => {
    const reason = 'not reviewed because it is test code.';
    const omissions = [`a/x.spec.ts: ${reason}`, `b/y.spec.ts: ${reason}`, 'c/z.ts: not reviewed because it is generated.', 'plain gap'].map((text) => ({ kind: 'scope' as const, text }));
    const gaps = gapsOf(renderReviewPage({ ...reviewResult(), omissions }, 'c'));
    assert.match(gaps, /<summary>2 files: not reviewed because it is test code\.<\/summary><ul><li><code>a\/x\.spec\.ts<\/code><\/li><li><code>b\/y\.spec\.ts<\/code><\/li><\/ul>/);
    assert.equal([...gaps.matchAll(/not reviewed because it is test code/g)].length, 1);
    assert.match(gaps, /<li>c\/z\.ts: not reviewed because it is generated\.<\/li>/);
    assert.match(gaps, /<li>plain gap<\/li>/);
  });

  it('links each finding place, the Also places and the requirements when the page has a place URL, and keeps plain text without one', () => {
    const at = finding({ id: 'f-1', location: { oldPath: 'a.ts', newPath: 'b.ts', side: 'new', line: 9 } });
    const plain = renderReviewPage(reviewResult({ findings: [at] }), 'c', null, { url: 'https://gitlab.example/g/p/-/merge_requests/2' });
    assert.match(plain, /<h3><code>b\.ts:9<\/code><\/h3>/);
    const html = renderReviewPage(reviewResult({ findings: [at] }), 'c', null, { url: 'https://gitlab.example/g/p/-/merge_requests/2', placeUrl: (location) => `https://x/diffs#${location.line}&"` });
    assert.match(html, /<h3><a href="https:\/\/x\/diffs#9&#38;&#34;" rel="noreferrer"><code>b\.ts:9<\/code><\/a><\/h3>/);
    assert.match(html, /merge_requests\/2" rel="noreferrer">[^<]*<\/a><\/p><p class="meta">Requirements: <a href="https:\/\/example\.atlassian\.net\/browse\/ORD-17" rel="noreferrer">Reject negative amounts/);
    assert.doesNotMatch(renderReviewPage({ ...reviewResult(), requirements: [] }, 'c'), /Requirements:/);
  });

  it('marks a published review on the list, links its merge request under the name and offers Terminate as a csrf POST form', () => {
    const html = renderIndex([
      { slug: 'mr-7', title: 'Fix (!7)', createdAt: '2026-10-23T09:15:00Z', findings: 3, published: '1 of 3 posted', mrUrl: 'https://gitlab.example/g/p/-/merge_requests/7', posted: true },
      { slug: 'local', title: 'local', createdAt: '', findings: 1, published: 'local review' },
    ], 'tok');
    const [first = '', second = ''] = html.split('<tr><td>').slice(1);
    assert.match(first, /^<span title="Published to the merge request" aria-label="Published">&#10003;<\/span> <a href="\/r\/mr-7">/);
    assert.match(first, /<a class="meta" href="https:\/\/gitlab\.example\/g\/p\/-\/merge_requests\/7" rel="noreferrer">!7<\/a>/);
    assert.doesNotMatch(second, /Published|merge_requests/);
    assert.match(html, /<form method="post" action="\/terminate"[^>]*><input type="hidden" name="csrf" value="tok"><button type="submit">Terminate<\/button>/);
  });

  it('wraps a notice fragment and plain text in the dark shell, escaped, and leaves a full page alone', () => {
    for (const body of ['<!doctype html><title>Review</title><p>gone</p>', 'Not <found>.']) {
      const html = themed(body);
      assert.match(html, /^<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Review<\/title><style>:root\{color-scheme:dark\}/);
      assert.equal(html.split('<title>').length, 2, 'one title, in the head');
    }
    assert.match(themed('Not <found>.'), /<p>Not &#60;found&#62;\.<\/p>/);
    const full = renderIndex([]);
    assert.equal(themed(full), full);
  });
});
