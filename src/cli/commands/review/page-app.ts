import path from 'node:path';
import { escape, renderIndex, renderPublishResult, renderReviewPage, reviewTitle, type IndexRow } from '#modules/review/findings/page';
import type { AppReply } from '#modules/review/page/server';
import { discardReview, publishFindings, readMergeRequest, readPicks, readPublication } from '#modules/review/publication/publication';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { capturedFiles } from '#modules/review/snapshot/target';
import { readLedgerStrict } from '#platform/ledger/ledger';
import { recordedResult, recordedResultFile } from '#skills/review/page';
import { REVIEWS_DIR } from '#types/defaults';
import { isAmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';

const base = (slug: string): string => `/r/${encodeURIComponent(slug)}`;
const notice = (status: number, message: string, slug: string | null): AppReply => ({ status, body: `<!doctype html><title>Review</title><p>${escape(message)}</p><p><a href="${slug === null ? '/' : base(slug)}">Back</a></p>` });

/**
 * The routes of the shared page server. Reviews are read from `.ambicode/reviews/*` on every request, so one that finishes
 * later appears without a restart. `open` holds the reviews whose page was shown and not closed; the server stops when the last one is.
 */
export function pageApp(runtime: Runtime, repositoryRoot: string, open: Set<string>) {
  const load = async (slug: string, withFiles: boolean) => {
    const dir = taskDirFor(repositoryRoot, slug, '.', 'review');
    const read = await readLedgerStrict(runtime.fs, dir.root);
    const result = read.state === 'ok' ? await recordedResult(runtime.fs, repositoryRoot, read.entries) : null;
    if (read.state !== 'ok' || result === null) return null;
    // Only a merge request can be published to; a local review gets neither the button nor the endpoint.
    const mr = await readMergeRequest(runtime, dir.root).catch(() => null);
    let files: ReturnType<typeof capturedFiles> = [];
    if (withFiles) {
      // The worktree is gone by now: the code windows come from the diff the review folder holds.
      const patch = mr?.patch ?? await runtime.fs.readText(path.join(repositoryRoot, path.dirname(recordedResultFile(read.entries) ?? ''), 'changed.diff')).catch(() => '');
      try { files = capturedFiles(patch); } catch { files = []; }
    }
    return { dir, result, mr, context: { files, base: base(slug), ...(mr === null ? {} : { title: mr.title, url: mr.url }) } };
  };

  const rows = async (): Promise<IndexRow[]> => {
    const names = (await runtime.fs.readdir(path.join(repositoryRoot, REVIEWS_DIR)).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const found = await Promise.all(names.map(async (slug): Promise<IndexRow> => {
      const review = await load(slug, false).catch(() => null);
      if (review === null) return { slug, title: slug, createdAt: '', findings: null, published: 'no readable review' };
      const posted = review.mr === null ? null : Object.entries((await readPublication(runtime, review.dir.root, review.result.reviewId).catch(() => ({ findings: {} }))).findings).filter(([key, entry]) => /^\d+$/.test(key) && entry.status === 'posted').length;
      return { slug, title: reviewTitle(review.result, review.mr?.title, review.mr?.url), createdAt: review.result.createdAt, findings: review.result.findings.length, published: posted === null ? 'local review' : `${posted} of ${review.result.findings.length} posted` };
    }));
    return found.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.slug < b.slug ? -1 : 1));
  };

  const finish = (slug: string): AppReply => {
    open.delete(slug);
    return open.size === 0
      ? { status: 200, body: '<!doctype html><title>Review</title><p>Every review page is closed; the server has stopped. You can close this tab.</p>', stop: 'closed' }
      : { status: 303, location: '/' };
  };

  const handle = async ({ method, path: route, form, csrf }: { method: 'GET' | 'POST'; path: string; form: URLSearchParams; csrf: string }): Promise<AppReply> => {
    if (route === '/') return method === 'GET' ? { status: 200, body: renderIndex(await rows()) } : { status: 405, body: 'Method not allowed.' };
    const match = /^\/r\/([^/]+)(?:\/(publish|close|delete))?$/.exec(route);
    if (match === null) return { status: 404, body: 'Not found.' };
    let slug: string;
    try { slug = decodeURIComponent(match[1]!); } catch { return { status: 404, body: 'Not found.' }; }
    const review = await load(slug, method === 'GET').catch(() => null);
    if (review === null) return notice(404, `${slug} has no readable recorded review.`, null);
    const action = match[2];
    if (method === 'GET') {
      if (action !== undefined) return { status: 405, body: 'Method not allowed.' };
      open.add(slug);
      return { status: 200, body: renderReviewPage(review.result, csrf, review.mr === null ? null : await readPublication(runtime, review.dir.root, review.result.reviewId), review.context) };
    }
    if (action === 'close') return finish(slug);
    if (action === 'delete') {
      const refused = await discardReview(runtime, review.dir.root, repositoryRoot).catch((error: unknown) => (isAmbicodeError(error) ? error.message : Promise.reject(error)));
      return refused === null ? finish(slug) : notice(409, refused, slug);
    }
    if (action === 'publish' && review.mr !== null) {
      const read = readPicks(form, review.result.findings.length, review.result.requirementCoverage.length);
      if ('error' in read) return notice(400, read.error, slug);
      try {
        const posted = await publishFindings(runtime, { dir: review.dir.root, repositoryRoot, result: review.result }, read.picks);
        return { status: 200, body: renderPublishResult([...read.invalid, ...posted].sort((a, b) => Number(a.requirement === true) - Number(b.requirement === true) || a.number - b.number), base(slug)) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return notice(410, 'This review was deleted while the request waited; nothing was posted.', null);
        if (!isAmbicodeError(error)) throw error;
        return notice(500, `${error.code}: ${error.message}`, slug);
      }
    }
    return { status: 404, body: 'Not found.' };
  };

  /** POST /register: a review that finished while the server runs is opened through it. */
  const admit = async (form: URLSearchParams): Promise<string | null> => {
    const slug = form.get('task') ?? '';
    if (!/^[A-Za-z0-9._-]+$/.test(slug) || (await load(slug, false).catch(() => null)) === null) return null;
    open.add(slug);
    return base(slug);
  };

  return { handle, admit };
}
