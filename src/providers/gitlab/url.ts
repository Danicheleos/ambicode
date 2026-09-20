/**
 * Parsing a merge-request URL into the identity every later request is built
 * from. Nothing here touches a process or the network: a malformed or ambiguous
 * URL is rejected before `glab` is invoked at all (doc 03 P1.5).
 *
 * The host is taken from the URL and never from the current checkout or branch,
 * so reviewing a merge request on one GitLab while standing in a checkout of
 * another cannot silently ask the wrong server.
 */

export interface GitLabMergeRequestRef {
  /** Host with its port when the URL named one, e.g. `gitlab.example.com:8443`. */
  host: string;
  /** Decoded `group/subgroup/project`, the canonical project identity. */
  projectPath: string;
  mergeRequestIid: number;
  /** The URL as it identifies this merge request, without a view suffix. */
  canonicalUrl: string;
}

export type ParsedMergeRequestUrl =
  | { kind: 'ok'; ref: GitLabMergeRequestRef }
  | { kind: 'invalid'; reason: string; details: string[] };

/** Views GitLab appends to the same merge request; they do not change identity. */
const VIEW_SUFFIXES = new Set(['diffs', 'commits', 'pipelines', 'reports', 'widget']);

const MERGE_REQUEST_SEGMENT = 'merge_requests';

export function parseMergeRequestUrl(value: string): ParsedMergeRequestUrl {
  const raw = value.trim();
  if (raw === '') return invalid('No merge request URL was given.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid(`"${raw}" is not a URL.`, [
      'Pass the full merge request URL, for example https://gitlab.example.com/group/project/-/merge_requests/42.',
    ]);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return invalid(`"${url.protocol.replace(':', '')}" is not a supported scheme for a merge request URL.`, [
      'AMBICODE resolves merge requests over HTTP(S) only; an ssh or git remote is not a merge request address.',
    ]);
  }

  // Credentials in a URL would be a secret in an argument vector, a log line
  // and a persisted review result. They are refused, not stripped.
  if (url.username !== '' || url.password !== '') {
    return invalid('The merge request URL carries credentials.', [
      'Remove the user information from the URL. AMBICODE authenticates through the glab configuration for that host.',
    ]);
  }

  if (url.hostname === '') return invalid('The merge request URL has no host.');

  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  // The separator is the "-" that `merge_requests` follows. A project path
  // cannot legitimately contain "-" as a whole segment, but looking for the
  // pair keeps such a URL a project-path error rather than a "not a merge
  // request" one.
  const marker = segments.findIndex(
    (segment, index) => segment === '-' && segments[index + 1] === MERGE_REQUEST_SEGMENT,
  );
  if (marker < 0) {
    return invalid(`"${raw}" is not a merge request URL.`, [
      'The path must contain "/-/merge_requests/<iid>".',
      'A project, issue, pipeline or branch URL does not identify a merge request.',
    ]);
  }

  const iidSegment = segments[marker + 2];
  if (iidSegment === undefined) {
    return invalid('The merge request URL has no merge request number.', [
      'Expected "/-/merge_requests/<iid>", for example "/-/merge_requests/42".',
    ]);
  }
  // A strict decimal form: "042", "+1", "1.0" and "1e3" all name nothing.
  if (!/^[1-9][0-9]*$/.test(iidSegment)) {
    return invalid(`"${iidSegment}" is not a merge request number.`, [
      'The merge request iid is a positive decimal integer without leading zeroes.',
    ]);
  }
  const mergeRequestIid = Number(iidSegment);
  if (!Number.isSafeInteger(mergeRequestIid)) {
    return invalid(`"${iidSegment}" is larger than a merge request number can be.`);
  }

  const trailing = segments.slice(marker + 3);
  if (trailing.length > 1 || (trailing.length === 1 && !VIEW_SUFFIXES.has(trailing[0] as string))) {
    return invalid(`"${raw}" points inside a merge request rather than at it.`, [
      `Unexpected path after the merge request number: ${trailing.join('/')}.`,
      'Pass the merge request URL itself, optionally ending in /diffs or /commits.',
    ]);
  }

  const projectSegments = segments.slice(0, marker);
  const decoded = decodeProjectPath(projectSegments);
  if (typeof decoded === 'string') return invalid(decoded);

  const host = url.port === '' ? url.hostname : `${url.hostname}:${url.port}`;
  return {
    kind: 'ok',
    ref: {
      host,
      projectPath: decoded.join('/'),
      mergeRequestIid,
      canonicalUrl: `${url.protocol}//${host}/${decoded.join('/')}/-/merge_requests/${mergeRequestIid}`,
    },
  };
}

/**
 * Percent-encoding in a URL path is the author's, so it is decoded once and the
 * result validated. A segment that decodes into a separator, a traversal step
 * or a control character is refused rather than normalized into something the
 * user did not write.
 */
function decodeProjectPath(segments: readonly string[]): string[] | string {
  if (segments.length < 2) {
    return 'The merge request URL does not name a namespace and a project.';
  }

  const decoded: string[] = [];
  for (const segment of segments) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return `"${segment}" in the project path is not valid percent-encoding.`;
    }
    if (value === '') return 'The project path has an empty segment.';
    if (value === '.' || value === '..') {
      return `"${value}" is not a project path segment.`;
    }
    if (value.includes('/') || value.includes('\\')) {
      return `An encoded separator in "${segment}" makes the project path ambiguous.`;
    }
    // The character class is written with escapes on purpose: a literal
    // control byte in a source file makes git treat it as binary.
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      return 'The project path contains a control character.';
    }
    if (value === '-') {
      return 'The project path contains a "-" segment, which GitLab reserves.';
    }
    decoded.push(value);
  }
  return decoded;
}

/**
 * GitLab addresses a project either by numeric id or by its full path, encoded
 * as one component: every `/` becomes `%2F`. Used for every request, so a
 * nested namespace cannot be mistaken for a route.
 */
export function encodeProjectIdentity(pathOrId: string): string {
  return encodeURIComponent(pathOrId);
}

function invalid(reason: string, details: string[] = []): ParsedMergeRequestUrl {
  return { kind: 'invalid', reason, details };
}
