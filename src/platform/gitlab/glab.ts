import { AmbicodeError } from '#util/errors';
import type { ProcessRunner } from '#types/platform/ports';

export interface MrRefs { base_sha: string; start_sha: string; head_sha: string }
interface Mr { diff: string; refs: MrRefs; title: string; description: string }

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
  const record = JSON.parse(await apiCall(runner, cwd, url, [`projects/${encodeURIComponent(project)}/merge_requests/${iid}`])) as { title?: string; description?: string | null; diff_refs?: Partial<MrRefs> | null };
  const { base_sha, start_sha, head_sha } = record.diff_refs ?? {};
  if (!base_sha || !start_sha || !head_sha) throw new AmbicodeError('mr-fetch-failed', 'The merge request carries no diff refs.', { details: ['GitLab returned no diff_refs; its diff is not computed yet.'] });
  return { diff, refs: { base_sha, start_sha, head_sha }, title: record.title ?? '', description: record.description ?? '' };
}

/** Both paths are always sent (GitLab requires them); a line is sent only for the side it exists on. */
export interface MrPlace { oldPath: string | null; newPath: string | null; oldLine: number | null; newLine: number | null }

export async function comment(runner: ProcessRunner, cwd: string, url: string, refs: MrRefs, place: MrPlace, body: string): Promise<void> {
  const parsed = parseMrUrl(url);
  const path = place.newPath ?? place.oldPath ?? '';
  const position = JSON.stringify({
    position_type: 'text', ...refs, old_path: place.oldPath ?? path, new_path: place.newPath ?? path,
    ...(place.oldLine === null ? {} : { old_line: place.oldLine }), ...(place.newLine === null ? {} : { new_line: place.newLine }),
  });
  try {
    await apiCall(runner, cwd, parsed, ['-X', 'POST', `projects/${encodeURIComponent(parsed.project)}/merge_requests/${parsed.iid}/discussions`, '-f', `body=${body}`, '-F', `position=${position}`]);
  } catch (error) {
    throw new AmbicodeError('mr-publish-failed', (error as Error).message);
  }
}
