import { createHash } from 'node:crypto';
import { AmbicodeError } from '#util/errors';
import type { DiffFile } from '#types/platform/git';
import type { ProcessRunner } from '#types/platform/ports';

export interface MrRefs { base_sha: string; start_sha: string; head_sha: string }
interface Mr { diff: string; refs: MrRefs; title: string; description: string; links: string[] }

const MR_URL = /^(https?):\/\/([^/:]+)(?::(\d+))?\/(.+?)\/-\/merge_requests\/(\d+)(?:[/?#].*)?$/;
const TIMEOUT_MS = 60_000;
// Same ceiling as a large merge request diff; a truncated diff would review only its head.
const MAX_BYTES = 20_000_000;

interface MrUrl { scheme: string; host: string; port: string | null; project: string; iid: string }

export function parseMrUrl(url: string): MrUrl {
  const match = MR_URL.exec(url.trim());
  if (match === null) throw new AmbicodeError('mr-fetch-failed', `Not a merge-request URL: ${url}`, { details: ['Expected https://<host>/<group>/<project>/-/merge_requests/<iid>.'] });
  return { scheme: match[1]!, host: match[2]!, port: match[3] ?? null, project: match[4]!, iid: match[5]! };
}

/** The text itself when it is one merge-request URL; null for anything else, so prose and tickets are left alone. */
export const mrUrlIn = (text: string): string | null => (MR_URL.test(text.trim()) ? text.trim() : null);

/**
 * Where a finding's line sits on the merge request's web diff: `<mr>/diffs#<sha1(path)>_<old>_<new>`. GitLab's diff parser (lib/gitlab/diff/parser.rb)
 * starts both counters at the hunk's start numbers and emits each line, then advances: an added line carries the old counter as it stands, a removed one the new.
 * A line the diff does not hold, or an unparsable URL, links to the file alone (null for the latter).
 */
export function mrLineUrl(mrUrl: string, file: DiffFile, side: 'old' | 'new', line: number): string | null {
  const parsed = MR_URL.exec(mrUrl.trim());
  if (parsed === null) return null;
  const base = `${parsed[1]}://${parsed[2]}${parsed[3] === undefined ? '' : `:${parsed[3]}`}/${parsed[4]}/-/merge_requests/${parsed[5]}/diffs`;
  const hash = createHash('sha1').update(file.newPath ?? file.oldPath ?? '').digest('hex');
  for (const hunk of file.hunks) {
    let oldPos = hunk.oldStart;
    let newPos = hunk.newStart;
    for (const row of hunk.lines) {
      if ((side === 'old' ? row.oldLine : row.newLine) === line) return `${base}#${hash}_${oldPos}_${newPos}`;
      if (row.kind !== 'added') oldPos++;
      if (row.kind !== 'removed') newPos++;
    }
  }
  return `${base}#${hash}`;
}

/** Throws a plain Error; the callers name the outcome code, which the documented-codes test reads as a literal. */
async function glab(runner: ProcessRunner, cwd: string, argv: string[], overrides?: Record<string, string>): Promise<string> {
  const outcome = await runner.run({ argv: ['glab', ...argv], cwd, timeoutMs: TIMEOUT_MS, maxOutputBytes: MAX_BYTES, env: overrides === undefined ? { kind: 'inherited' } : { kind: 'inherited', overrides } });
  if (outcome.kind !== 'exited' || outcome.exitCode !== 0 || outcome.truncated) {
    const why = outcome.stderr.trim() || outcome.failure || (outcome.truncated ? 'output truncated' : `${outcome.kind}, exit ${outcome.exitCode}`);
    throw new Error(`glab ${argv[0]} failed: ${why}`);
  }
  return outcome.stdout;
}

/** `--hostname` rejects host:port; glab takes the port and scheme of a self-hosted API from these variables (`glab config --help`). */
const apiCall = (runner: ProcessRunner, cwd: string, url: MrUrl, argv: string[]): Promise<string> =>
  glab(runner, cwd, ['api', '--hostname', url.host, ...argv], url.port === null ? undefined : { GITLAB_API_HOST: `${url.host}:${url.port}`, GLAB_API_PROTOCOL: url.scheme });

export async function fetchMr(runner: ProcessRunner, cwd: string, url: string): Promise<Mr> {
  const parsed = parseMrUrl(url);
  try {
    return await read(runner, cwd, parsed);
  } catch (error) {
    throw error instanceof AmbicodeError ? error : new AmbicodeError('mr-fetch-failed', (error as Error).message);
  }
}

async function read(runner: ProcessRunner, cwd: string, url: MrUrl): Promise<Mr> {
  const { scheme, host, port, project, iid } = url;
  const diff = await glab(runner, cwd, ['mr', 'diff', iid, '-R', `${scheme}://${host}${port === null ? '' : `:${port}`}/${project}`, '--raw']);
  const record = JSON.parse(await apiCall(runner, cwd, url, [`projects/${encodeURIComponent(project)}/merge_requests/${iid}?render_html=true`])) as { title?: string; description?: string | null; title_html?: string; description_html?: string | null; diff_refs?: Partial<MrRefs> | null };
  const { base_sha, start_sha, head_sha } = record.diff_refs ?? {};
  if (!base_sha || !start_sha || !head_sha) throw new AmbicodeError('mr-fetch-failed', 'The merge request carries no diff refs.', { details: ['GitLab returned no diff_refs; its diff is not computed yet.'] });
  return { diff, refs: { base_sha, start_sha, head_sha }, title: record.title ?? '', description: record.description ?? '', links: externalIssueLinks(`${record.title_html ?? ''}\n${record.description_html ?? ''}`) };
}

const ANCHOR = /<a\b[^>]*>/g;

/** The tracker links GitLab itself resolved: only the rendered HTML carries them (`title` is the bare key), as anchors of type external_issue. Query strings (`?atlOrigin=`) are tracking, not identity. */
export function externalIssueLinks(html: string): string[] {
  const found = [...html.matchAll(ANCHOR)].flatMap(([anchor]) => (/data-reference-type="external_issue"/.test(anchor) ? [/href="([^"]+)"/.exec(anchor)?.[1]?.replace(/&amp;/g, '&').split(/[?#]/)[0] ?? ''] : []));
  return [...new Set(found.filter((link) => link !== ''))];
}

/** One human discussion of a merge request: where it sits (null for a general one) and its notes, oldest first. */
interface MrDiscussion { path: string | null; line: number | null; resolved: boolean | null; notes: { author: string; body: string }[] }

// GitLab's maximum page size. The page limit is a stop for a runaway loop, not a measured bound: 2000 discussions is far past any review this plugin sizes.
const DISCUSSIONS_PER_PAGE = 100;
const DISCUSSIONS_MAX_PAGES = 20;

interface RawNote { system?: boolean; body?: string; author?: { username?: string; name?: string }; resolved?: boolean; resolvable?: boolean; position?: { new_path?: string | null; old_path?: string | null; new_line?: number | null; old_line?: number | null } | null }

/** The merge request's discussions with system notes dropped (`system: true` is a label, a push or a merge, not a person). Read-only; a failure throws and the caller reports a gap. */
export async function fetchDiscussions(runner: ProcessRunner, cwd: string, url: string): Promise<MrDiscussion[]> {
  const parsed = parseMrUrl(url);
  const found: MrDiscussion[] = [];
  for (let page = 1; page <= DISCUSSIONS_MAX_PAGES; page++) {
    const reply = JSON.parse(await apiCall(runner, cwd, parsed, [`projects/${encodeURIComponent(parsed.project)}/merge_requests/${parsed.iid}/discussions?per_page=${DISCUSSIONS_PER_PAGE}&page=${page}`])) as unknown;
    if (!Array.isArray(reply)) throw new Error('glab api returned no discussion list');
    for (const raw of reply as { notes?: RawNote[] }[]) {
      const notes = (raw.notes ?? []).filter((note) => note.system !== true && (note.body ?? '').trim() !== '');
      if (notes.length === 0) continue;
      const position = (raw.notes ?? [])[0]?.position;
      const first = (raw.notes ?? []).find((note) => note.resolvable === true);
      found.push({
        path: position?.new_path ?? position?.old_path ?? null,
        line: position?.new_line ?? position?.old_line ?? null,
        resolved: first === undefined ? null : first.resolved === true,
        notes: notes.map((note) => ({ author: note.author?.username ?? note.author?.name ?? 'unknown', body: note.body!.trim() })),
      });
    }
    if (reply.length < DISCUSSIONS_PER_PAGE) return found;
  }
  throw new Error(`more than ${DISCUSSIONS_MAX_PAGES * DISCUSSIONS_PER_PAGE} discussions`);
}

/** One commit of a merge request: the short sha, its author's name and its title. */
interface MrCommit { sha: string; author: string; title: string }

// One page: the brief shows 30 commits and says how many more, and a merge request past 100 commits is not one to read commit by commit.
const COMMITS_PER_PAGE = 100;

/** The merge request's commits, newest first as GitLab returns them. Read-only; a failure throws and the caller reports a gap. */
export async function fetchCommits(runner: ProcessRunner, cwd: string, url: string): Promise<MrCommit[]> {
  const parsed = parseMrUrl(url);
  const reply = JSON.parse(await apiCall(runner, cwd, parsed, [`projects/${encodeURIComponent(parsed.project)}/merge_requests/${parsed.iid}/commits?per_page=${COMMITS_PER_PAGE}`])) as unknown;
  if (!Array.isArray(reply)) throw new Error('glab api returned no commit list');
  return (reply as { id?: string; author_name?: string; title?: string }[]).map((raw) => ({ sha: (raw.id ?? '').slice(0, 8), author: raw.author_name ?? 'unknown', title: (raw.title ?? '').trim() }));
}

/** Both paths are always sent (GitLab requires them); a line is sent only for the side it exists on. */
export interface MrPlace { oldPath: string | null; newPath: string | null; oldLine: number | null; newLine: number | null }

/** What GitLab named for the discussion it created; null where the reply carried no such field. */
interface Posted { discussion: string | null }

/** A null place posts a general note on the merge request, not a line comment. */
export async function comment(runner: ProcessRunner, cwd: string, url: string, refs: MrRefs, place: MrPlace | null, body: string): Promise<Posted> {
  const parsed = parseMrUrl(url);
  const position = place === null ? null : JSON.stringify({
    position_type: 'text', ...refs, old_path: place.oldPath ?? place.newPath ?? '', new_path: place.newPath ?? place.oldPath ?? '',
    ...(place.oldLine === null ? {} : { old_line: place.oldLine }), ...(place.newLine === null ? {} : { new_line: place.newLine }),
  });
  let reply: string;
  try {
    reply = await apiCall(runner, cwd, parsed, ['-X', 'POST', `projects/${encodeURIComponent(parsed.project)}/merge_requests/${parsed.iid}/discussions`, '-f', `body=${body}`, ...(position === null ? [] : ['-F', `position=${position}`])]);
  } catch (error) {
    throw new AmbicodeError('mr-publish-failed', (error as Error).message);
  }
  // The comment is already posted: an unreadable reply must not turn it into a failure that a retry would post twice.
  try {
    const id = (JSON.parse(reply) as { id?: unknown }).id;
    return { discussion: typeof id === 'string' ? id : null };
  } catch {
    return { discussion: null };
  }
}
