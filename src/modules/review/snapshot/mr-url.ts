import { AmbicodeError } from '#util/errors';

/** `https://host/group/sub/project/-/merge_requests/42` (or the older form without `/-/`) → project path and iid. */
export function parseMergeRequestUrl(url: string): { project: string; iid: number } {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    throw new AmbicodeError('bad-argument', `"${url}" is not a merge-request URL.`, { field: 'mr' });
  }
  const match = /^\/(.+?)(?:\/-)?\/merge_requests\/(\d+)(?:\/.*)?$/.exec(pathname);
  if (match === null) throw new AmbicodeError('bad-argument', `"${url}" is not a merge-request URL: expected <project>/-/merge_requests/<number>.`, { field: 'mr' });
  return { project: decodeURIComponent(match[1]!), iid: Number(match[2]) };
}
