import type { Outcome, Publication } from '#modules/review/publication/publication';
import type { Finding, ReviewResult } from '#types/modules/review';
import type { DiffFile } from '#types/platform/git';
import { attentionNotes, checkLine, emptyFindingsNotice, findingPath, placeLabel, POINT_LABEL, scopeNotes } from './report.ts';

const STYLE = ':root{color-scheme:dark}body{background:#0d1117;color:#c9d1d9;font:15px/1.55 system-ui,sans-serif;max-width:64rem;margin:0 auto;padding:1.5rem 1rem 0}a{color:#58a6ff}h1{font-size:1.5rem;margin:0 0 .25rem}h2{font-size:1.1rem;margin-top:2rem}code,pre{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.meta{color:#8b949e}article{background:#161b22;border:1px solid #30363d;border-left:4px solid #6e7681;border-radius:8px;padding:.75rem 1rem 1rem;margin:1rem 0}article.risk-high{border-left-color:#f85149}article.risk-medium{border-left-color:#d29922}article.risk-low{border-left-color:#3fb950}h3{margin:.4rem 0}.tag{display:inline-block;border-radius:1em;padding:0 .6em;font-size:.8rem;font-weight:600;background:#30363d}.tag.risk-high{background:#da3633;color:#fff}.tag.risk-medium{background:#9e6a03;color:#fff}.tag.risk-low{background:#238636;color:#fff}pre{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:.5rem;overflow:auto;margin:.5rem 0}.code{border:1px solid #30363d;border-radius:6px;margin:.5rem 0;background:#0d1117}.code pre{border:0;margin:0;border-radius:0}.code .full{max-height:32em;overflow:scroll}.code summary{padding:.25rem .5rem;cursor:pointer;color:#8b949e}.l{display:block;white-space:pre;min-height:1.45em}.l i{display:inline-block;min-width:3.5ch;padding-right:1ch;text-align:right;color:#6e7681;font-style:normal;user-select:none}.l.add{background:#12261e}.l.del{background:#2d1517}.l.hunk{color:#8b949e;background:#161b22}.l.hit{outline:2px solid #d29922;outline-offset:-2px;background:#3a2f0b}textarea{width:100%;box-sizing:border-box;min-height:7rem;font:inherit;background:#0d1117;color:inherit;border:1px solid #30363d;border-radius:6px;padding:.5rem}.actions{position:sticky;bottom:0;display:flex;gap:.75rem;flex-wrap:wrap;background:#0d1117;border-top:1px solid #30363d;padding:.75rem 0;margin-top:1rem}button{font:inherit;font-weight:600;border-radius:6px;border:1px solid #30363d;padding:.45rem 1rem;background:#21262d;color:#c9d1d9;cursor:pointer}button.primary{background:#238636;border-color:#2ea043;color:#fff}.attention li,.scope li{margin:.3rem 0}.scope{margin-top:2rem}.scope summary{cursor:pointer;color:#8b949e}table{border-collapse:collapse;width:100%}td{border-top:1px solid #30363d;padding:.35rem .5rem;vertical-align:top}.point-missed td:first-child{color:#f85149}.point-cannot-verify td:first-child{color:#d29922}details ul{margin:.25rem 0;color:#8b949e}';

export const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * What the page shows besides the review: the merge request's heading and the diff the review dir holds, since the worktree is gone by now.
 * `base` is this review's path on the shared server (`/r/<slug>`), the prefix of every form action.
 */
interface PageContext { title?: string; url?: string; files?: readonly DiffFile[]; base?: string }

/** Lines of the file's diff shown above the finding line before the rest folds away; a scroll box without script cannot start mid-way, so the box itself starts here. */
const LINES_BEFORE = 4;
/** Rows shown without opening anything; Expand reveals the whole file's diff in a scroll box. */
const WINDOW_ROWS = 10;

const SIGN = { added: '+', removed: '-', context: ' ' } as const;
const KIND = { added: 'add', removed: 'del', context: '' } as const;

/** Every hunk of the finding's file, numbered and coloured, starting a few lines above the finding; null when the diff does not hold the line. */
function codeWindow(finding: Finding, files: readonly DiffFile[]): string | null {
  const { oldPath, newPath, side, line } = finding.location;
  const file = files.find((candidate) => candidate.oldPath === oldPath && candidate.newPath === newPath);
  const rows: { html: string; hit: boolean }[] = [];
  for (const hunk of file?.hunks ?? []) {
    rows.push({ html: `<span class="l hunk">${escape(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)}</span>`, hit: false });
    for (const row of hunk.lines) {
      const hit = (side === 'new' ? row.newLine : row.oldLine) === line;
      rows.push({ html: `<span class="l ${KIND[row.kind]}${hit ? ' hit' : ''}"><i>${row.oldLine ?? ''}</i><i>${row.newLine ?? ''}</i>${SIGN[row.kind]}${escape(row.text)}</span>`, hit });
    }
  }
  const at = rows.findIndex((row) => row.hit);
  if (at < 0) return null;
  const from = Math.max(0, at - LINES_BEFORE);
  const joined = (list: typeof rows): string => list.map((row) => row.html).join('');
  const more = rows.length <= WINDOW_ROWS ? '' : `<details><summary>Expand: all ${rows.length} lines of this file's diff</summary><pre class="full">${joined(rows)}</pre></details>`;
  return `<div class="code"><pre>${joined(rows.slice(from, from + WINDOW_ROWS))}</pre>${more}</div>`;
}

/** Publishing is offered for a merge request only: `publication` is its record, or null for a local review. */
function findingHtml(finding: Finding, number: number, publication: Publication | null, files: readonly DiffFile[]): string {
  const place = `${findingPath(finding)}:${finding.location.line}`;
  const entry = publication?.findings[String(number)];
  const posted = entry?.status === 'posted';
  const state = posted ? `<b>#${number}</b> <span class="meta">posted${entry.discussion === null ? '' : ` (discussion ${escape(entry.discussion)})`}</span>`
    : publication === null ? `<b>#${number}</b>` : `<label><input type="checkbox" name="pick" value="${number}"> <b>#${number}</b></label>${entry?.status === 'failed' ? ` <span class="meta">last attempt failed: ${escape(entry.reason ?? '')}</span>` : ''}`;
  const code = codeWindow(finding, files) ?? (finding.evidence === '' ? '' : `<pre>${escape(finding.evidence)}</pre>`);
  return `<article id="${escape(finding.id)}" class="risk-${escape(finding.risk)}">${state}
<span class="tag risk-${escape(finding.risk)}">${escape(finding.risk)}</span> <span class="meta">confidence: ${escape(finding.confidence)} · ${escape(finding.category)}</span>
<h3><code>${escape(place)}</code></h3>
<p class="why"><b>Problem:</b> ${escape(finding.problem)}<br><b>Impact:</b> ${escape(finding.impact)}<br><b>Confidence:</b> ${escape(finding.confidence)} — ${escape(finding.confidenceReason)}</p>
${posted || publication === null ? `<pre>${escape(finding.suggestedComment)}</pre>` : `<textarea name="comment-${number}" aria-label="Comment for #${number}">${escape(finding.suggestedComment)}</textarea>`}
${finding.supportingLocations.length === 0 ? '' : `<details><summary>Also: ${finding.supportingLocations.length} location${finding.supportingLocations.length === 1 ? '' : 's'}</summary><ul>${finding.supportingLocations.map((location) => `<li><code>${escape(placeLabel(location))}</code></li>`).join('')}</ul></details>\n`}${code}</article>`;
}

/** What a publish request did, per finding; a failure names its reason and stays pickable on the page. */
export function renderPublishResult(outcomes: readonly Outcome[], base = ''): string {
  const line = (outcome: Outcome): string => `<li><b>${outcome.requirement === undefined ? '#' : 'requirement row '}${outcome.number}</b> ${outcome.status === 'failed' ? `FAILED: ${escape(outcome.reason ?? '')}`
    : `${outcome.status === 'already' ? 'already posted' : 'posted'}${outcome.discussion === null ? '' : ` (discussion ${escape(outcome.discussion)})`}`}</li>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Published</title><style>${STYLE}</style></head><body><h1>Publication result</h1><ul>${outcomes.map(line).join('')}</ul><p><a href="${base === '' ? '/' : escape(base)}">Back to the findings</a></p></body></html>\n`;
}

/** What a reader must act on, each line a gap that is never dropped for brevity: a failed reviewer, work not reviewed, dropped refs, failing checks. */
function attentionLines(result: ReviewResult): string[] {
  const failedReview = result.reviewer === null || result.reviewer.status !== 'ok';
  return [...new Set([
    ...(failedReview ? (emptyFindingsNotice(result) ?? []) : []),
    ...(result.reviewer?.status === 'failed' && result.reviewer.detail !== null ? [result.reviewer.detail] : []),
    ...attentionNotes(result),
    ...result.checks.filter((check) => check.exit !== 0).map(checkLine),
  ])];
}

/** The routine facts of how the review was scoped: status, target notes, the notes marked `scope`, and an empty-result notice that is not a failure. */
function scopeLines(result: ReviewResult): string[] {
  const failedReview = result.reviewer === null || result.reviewer.status !== 'ok';
  return [...new Set([
    `Review ${result.status}${result.statusReason === null ? '' : `: ${result.statusReason}`}`,
    ...(failedReview ? [] : (emptyFindingsNotice(result) ?? [])),
    ...scopeNotes(result),
    ...result.target.notes,
    ...(result.checks.length === 0 ? ['No check recorded: nothing was verified by execution.'] : []),
  ])];
}

/** The general note a requirement row offers to post; the reader edits it in the page. */
function requirementNote(source: ReviewResult['requirements'][number], point: ReviewResult['requirementCoverage'][number]): string {
  return `Requirement ${source.title || source.id}: "${point.point}" is ${POINT_LABEL[point.status]}.${point.note === '' ? '' : ` ${point.note}`}`;
}

/** One row per acceptance point of each requirement: status, the point, the reviewer's note, and a link to the finding when a missed point is one. A row that is not covered can be posted as a general note, through the same Publish form (`form="publish"`); a posted row shows its record instead. */
function requirementsHtml(result: ReviewResult, publication: Publication | null): string {
  if (result.requirements.length === 0) return '';
  const rows = result.requirements.map((source) => {
    const points = result.requirementCoverage.filter((point) => point.ref === source.id);
    const pick = (point: ReviewResult['requirementCoverage'][number]): string => {
      const number = result.requirementCoverage.indexOf(point) + 1;
      const entry = publication?.findings[`r${number}`];
      if (publication === null || point.status === 'covered') return '';
      if (entry?.status === 'posted') return `<br><span class="meta">posted as a note${entry.discussion === null ? '' : ` (discussion ${escape(entry.discussion)})`}</span>`;
      return `<br><label><input type="checkbox" form="publish" name="pick-req" value="${number}"> post as a note</label>${entry?.status === 'failed' ? ` <span class="meta">last attempt failed: ${escape(entry.reason ?? '')}</span>` : ''}
<textarea form="publish" name="comment-req-${number}" aria-label="Note for requirement row ${number}">${escape(requirementNote(source, point))}</textarea>`;
    };
    const body = points.length === 0 ? '<tr><td colspan="3" class="meta">The reviewer gave no per-point answer.</td></tr>'
      : points.map((point) => `<tr class="point-${escape(point.status)}"><td>${escape(POINT_LABEL[point.status])}</td><td>${escape(point.point)}</td><td>${escape(point.note)}${point.finding === null ? '' : ` <a href="#${escape(point.finding)}">${escape(point.finding)}</a>`}${pick(point)}</td></tr>`).join('');
    return `<h3>${escape(source.title || source.id)} <span class="meta">${escape(source.id)}</span></h3><table>${body}</table>`;
  });
  return `<section class="requirements"><h2>Requirements</h2>${rows.join('')}</section>`;
}

const PER_FILE = /^([^\s:]*[./][^\s:]*): (.+)$/;

/** Gap lines that name a file and repeat one reason become one line with the files folded under it; every file stays listed. */
function gapItems(lines: readonly string[]): string[] {
  const byReason = new Map<string, string[]>();
  for (const line of lines) {
    const match = PER_FILE.exec(line);
    if (match !== null) byReason.set(match[2]!, [...byReason.get(match[2]!) ?? [], match[1]!]);
  }
  const done = new Set<string>();
  return lines.flatMap((line) => {
    const match = PER_FILE.exec(line);
    const files = match === null ? [] : byReason.get(match[2]!)!;
    if (files.length < 2) return [`<li>${escape(line)}</li>`];
    if (done.has(match![2]!)) return [];
    done.add(match![2]!);
    return [`<li><details><summary>${files.length} files: ${escape(match![2]!)}</summary><ul>${files.map((file) => `<li><code>${escape(file)}</code></li>`).join('')}</ul></details></li>`];
  });
}

const targetLabel = (target: ReviewResult['target']): string => target.kind === 'working' ? 'Working tree changes'
  : `Branch${target.headSha === null ? '' : ` ${target.headSha.slice(0, 8)}`}${target.baseRef === null ? '' : ` against ${target.baseRef}`}`;

/** Findings first, numbered as the publish list is; then the compact gaps. `csrf` is the session's form token; `publication` is the merge request's record, null for a local review. No script is needed, so the page's CSP forbids them. */
export function renderReviewPage(result: ReviewResult, csrf: string, publication: Publication | null = null, context: PageContext = {}): string {
  const token = `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
  const files = context.files ?? [];
  const list = result.findings.length === 0 ? '<p>No findings.</p>' : result.findings.map((finding, at) => findingHtml(finding, at + 1, publication, files)).join('\n');
  const heading = escape(reviewTitle(result, context.title, context.url));
  const link = context.url === undefined || !/^https?:\/\//.test(context.url) ? '' : `<p class="meta"><a href="${escape(context.url)}" rel="noreferrer">${escape(context.url)}</a></p>`;
  const attention = attentionLines(result);
  const scope = scopeLines(result);
  const base = escape(context.base ?? '');
  const close = '<button type="submit" form="close">Close</button><button type="submit" form="delete">Delete</button><span class="meta">Close returns to the list of reviews. Delete removes this review\'s saved files; posted comments stay on the MR.</span>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title><style>${STYLE}</style></head><body>
<p class="meta"><a href="/">All reviews</a></p>
<h1>${heading}</h1>
${link}${publication === null ? `${list}
<div class="actions">${close}</div>` : `<form id="publish" method="post" action="${base}/publish">${token}
${list}
<div class="actions"><button type="submit" class="primary">Publish</button>${close}</div>
</form>`}
${requirementsHtml(result, publication)}
${attention.length === 0 ? '' : `<section class="attention"><h2>Needs attention</h2><ul>${gapItems(attention).join('')}</ul></section>`}
<details class="scope"><summary>Review scope: ${scope.length} routine note${scope.length === 1 ? '' : 's'}</summary><ul>${gapItems(scope).join('')}</ul></details>
<form id="close" method="post" action="${base}/close">${token}</form>
<form id="delete" method="post" action="${base}/delete">${token}</form>
</body></html>
`;
}

export interface IndexRow { slug: string; title: string; createdAt: string; findings: number | null; published: string }

/** Every review folder of the repository, read per request; a row links to that review's page. */
export function renderIndex(rows: readonly IndexRow[]): string {
  const row = (entry: IndexRow): string => `<tr><td><a href="/r/${encodeURIComponent(entry.slug)}">${escape(entry.title)}</a><br><span class="meta">${escape(entry.slug)}</span></td><td>${escape(entry.createdAt.slice(0, 16).replace('T', ' '))}</td><td>${entry.findings ?? ''}</td><td>${escape(entry.published)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reviews</title><style>${STYLE}</style></head><body><h1>Reviews</h1>${rows.length === 0 ? '<p>No saved reviews.</p>' : `<table><tr><th align="left">Review</th><th align="left">Date</th><th align="left">Findings</th><th align="left">Published</th></tr>${rows.map(row).join('')}</table>`}</body></html>\n`;
}

/** The title the page and the index give a review: the merge request's, else what was reviewed. */
export function reviewTitle(result: ReviewResult, mrTitle: string | undefined, mrUrl: string | undefined): string {
  const iid = /\/merge_requests\/(\d+)/.exec(mrUrl ?? '')?.[1];
  const name = mrTitle === undefined || mrTitle === '' ? (result.target.kind === 'merge-request' ? 'Merge request review' : targetLabel(result.target)) : mrTitle;
  return `${name}${iid === undefined ? '' : ` (!${iid})`}`;
}
