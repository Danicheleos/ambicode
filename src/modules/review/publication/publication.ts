import path from 'node:path';
import { lineAt } from '#platform/git/diff';
import { processAlive } from '#platform/ledger/ledger-lock';
import { comment, type MrPlace, type MrRefs } from '#platform/gitlab/glab';
import { capturedFiles, MR_DIFF_JSON, MR_DIFF_PATCH } from '#modules/review/snapshot/target';
import { REVIEWS_DIR } from '#types/defaults';
import { AmbicodeError, isAmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';
import type { Finding, ReviewResult } from '#types/modules/review';

const RECORD_FILE = 'publication.json';
const LOCK_FILE = 'publication.lock';
/** A held lock is waited on this long: one glab call times out at 60 s, and a double submit queues behind a short post. */
const LOCK_WAIT_MS = 120_000;

interface PublicationEntry { status: 'posted' | 'failed'; discussion: string | null; reason: string | null }
/** One file per review folder, shared with the page; keys are finding numbers, or `r<n>` for requirement rows. */
export interface Publication { reviewId: string; findings: Record<string, PublicationEntry> }
/** A requirement pick numbers a row of `requirementCoverage`; it is posted as a general note and recorded under `r<number>`. */
interface Pick { number: number; body: string; requirement?: true }
export interface Outcome { number: number; requirement?: true; status: 'posted' | 'already' | 'failed'; discussion: string | null; reason: string | null }
interface MergeRequest { url: string; title: string; refs: MrRefs; patch: string }

/** An unchanged line exists on both sides, so its other number comes from the diff; a line outside it is sent as given and GitLab refuses it. */
function mrPlace(finding: Finding, patch: string): MrPlace {
  const { oldPath, newPath, side, line } = finding.location;
  const file = capturedFiles(patch).find((candidate) => candidate.oldPath === oldPath && candidate.newPath === newPath);
  const hit = file === undefined ? null : lineAt(file, side, line);
  return { oldPath, newPath, oldLine: hit?.oldLine ?? (side === 'old' ? line : null), newLine: hit?.newLine ?? (side === 'new' ? line : null) };
}

/** The fetched merge request of this review folder; null for a local review, which has no `mr-diff.json`. */
export async function readMergeRequest(runtime: Runtime, dir: string): Promise<MergeRequest | null> {
  const text = await runtime.fs.readText(path.join(dir, MR_DIFF_JSON)).catch(() => null);
  if (text === null) return null;
  const meta = JSON.parse(text) as { url?: string; title?: string; refs: MrRefs };
  return { url: meta.url ?? '', title: meta.title ?? '', refs: meta.refs, patch: await runtime.fs.readText(path.join(dir, MR_DIFF_PATCH)) };
}

/** A record of another review in the same folder is not this review's: its numbers name other findings. */
export async function readPublication(runtime: Runtime, dir: string, reviewId: string): Promise<Publication> {
  const text = await runtime.fs.readText(path.join(dir, RECORD_FILE)).catch(() => null);
  if (text === null) return { reviewId, findings: {} };
  let parsed: Publication;
  try {
    parsed = JSON.parse(text) as Publication;
  } catch {
    // Reading it as empty would post the findings again.
    throw new AmbicodeError('publication-unreadable', `${path.join(dir, RECORD_FILE)} is not valid JSON; no comment was posted.`, { details: ['Fix or delete the file only after checking the merge request for the comments already posted.'] });
  }
  return parsed.reviewId === reviewId ? parsed : { reviewId, findings: {} };
}

async function writePublication(runtime: Runtime, dir: string, record: Publication): Promise<void> {
  const file = path.join(dir, RECORD_FILE);
  const scratch = `${file}.${process.pid}.tmp`;
  await runtime.fs.writeText(scratch, `${JSON.stringify(record, null, 2)}\n`);
  await runtime.fs.rename(scratch, file);
}

async function withLock<T>(runtime: Runtime, dir: string, body: () => Promise<T>, waitMs = LOCK_WAIT_MS): Promise<T> {
  const lockFile = path.join(dir, LOCK_FILE);
  const started = Date.now();
  for (;;) {
    if (await runtime.fs.createExclusive(lockFile, JSON.stringify({ pid: process.pid }))) break;
    const holder = await runtime.fs.readText(lockFile).then((text) => JSON.parse(text) as { pid?: unknown }, () => null);
    // No age limit: a batch of more than 15 findings at glab's 60 s timeout outlasts any fixed one and would lose its live lock.
    if (holder !== null && (typeof holder.pid !== 'number' || !processAlive(holder.pid))) {
      await runtime.fs.remove(lockFile);
      continue;
    }
    if (Date.now() - started >= waitMs) throw new AmbicodeError('publication-busy', `Another publication holds ${lockFile}; waited ${waitMs / 1000} s. Nothing was posted by this call.`);
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 50));
  }
  try {
    return await body();
  } finally {
    await runtime.fs.remove(lockFile).catch(() => undefined);
  }
}

/**
 * The one poster of both exits. Under the lock it skips findings the record holds as posted, posts the rest and records each
 * result at once. A crash or timeout between glab's post and that write leaves the finding unrecorded or failed, and the next call posts it again.
 */
export async function publishFindings(runtime: Runtime, input: { dir: string; repositoryRoot: string; result: ReviewResult }, picks: readonly Pick[]): Promise<Outcome[]> {
  const { dir, repositoryRoot, result } = input;
  return withLock(runtime, dir, async () => {
    const record = await readPublication(runtime, dir, result.reviewId);
    let mr: MergeRequest | string;
    try {
      mr = (await readMergeRequest(runtime, dir)) ?? 'this review is not of a merge request';
    } catch (error) {
      mr = `the fetched merge request is unreadable: ${(error as Error).message}`;
    }
    const outcomes: Outcome[] = [];
    for (const { number, body, requirement } of picks) {
      const key = requirement === undefined ? String(number) : `r${number}`;
      const tag = requirement === undefined ? {} : { requirement };
      const finding = result.findings[number - 1];
      const known = record.findings[key];
      if (known?.status === 'posted') {
        outcomes.push({ number, ...tag, status: 'already', discussion: known.discussion, reason: null });
        continue;
      }
      try {
        if (requirement === undefined && finding === undefined) throw new AmbicodeError('bad-argument', `finding ${number} does not exist`);
        if (requirement !== undefined && result.requirementCoverage[number - 1] === undefined) throw new AmbicodeError('bad-argument', `requirement row ${number} does not exist`);
        if (typeof mr === 'string') throw new AmbicodeError('mr-publish-failed', mr);
        const posted = await comment(runtime.runner, repositoryRoot, mr.url, mr.refs, finding === undefined || requirement !== undefined ? null : mrPlace(finding, mr.patch), body);
        record.findings[key] = { status: 'posted', ...posted, reason: null };
        outcomes.push({ number, ...tag, status: 'posted', ...posted, reason: null });
      } catch (error) {
        if (!isAmbicodeError(error)) throw error;
        const reason = `${error.code}: ${error.message}`;
        record.findings[key] = { status: 'failed', discussion: null, reason };
        outcomes.push({ number, ...tag, status: 'failed', discussion: null, reason });
      }
      await writePublication(runtime, dir, record);
    }
    return outcomes;
  });
}

/**
 * Deletes this review's folder (its ledger, bundles and `publication.json`) and nothing else. The folder is taken from the server's own
 * state and must be `<repository>/.ambicode/reviews/<slug>`; a held publication lock refuses at once, since the folder would vanish under the post.
 */
export async function discardReview(runtime: Runtime, dir: string, repositoryRoot: string): Promise<string | null> {
  if (path.dirname(dir) !== path.join(repositoryRoot, REVIEWS_DIR) || path.basename(dir) === '') {
    throw new AmbicodeError('bad-argument', `${dir} is not a review folder under ${REVIEWS_DIR}; nothing was deleted.`);
  }
  try {
    await withLock(runtime, dir, () => runtime.fs.remove(dir), 0);
    return null;
  } catch (error) {
    if (isAmbicodeError(error) && error.code === 'publication-busy') return 'A publication is running right now. Nothing was deleted; try again when it has finished.';
    throw error;
  }
}

/** The page's form: pick numbers checked against the findings and requirement rows, comment text trimmed. A bad number refuses the whole request; an empty comment fails only its pick. */
export function readPicks(form: URLSearchParams, findingCount: number, rowCount = 0): { error: string } | { picks: Pick[]; invalid: Outcome[] } {
  const wanted: { number: number; requirement?: true }[] = [];
  for (const [field, limit] of [['pick', findingCount], ['pick-req', rowCount]] as const) {
    for (const value of form.getAll(field)) {
      if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > limit) return { error: `"${value.slice(0, 20)}" is not one of the ${limit} listed ${field === 'pick' ? 'findings' : 'requirement rows'}. Nothing was posted.` };
      const number = Number(value);
      if (!wanted.some((one) => one.number === number && (one.requirement === undefined) === (field === 'pick'))) wanted.push(field === 'pick' ? { number } : { number, requirement: true });
    }
  }
  if (wanted.length === 0) return { error: 'Nothing was picked. Nothing was posted.' };
  const picks: Pick[] = [];
  const invalid: Outcome[] = [];
  for (const one of wanted) {
    const body = (form.get(`${one.requirement === undefined ? 'comment' : 'comment-req'}-${one.number}`) ?? '').trim();
    if (body === '') invalid.push({ ...one, status: 'failed', discussion: null, reason: 'not posted: the comment is empty' });
    else picks.push({ ...one, body });
  }
  return { picks, invalid };
}
