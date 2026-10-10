import path from 'node:path';
import { contentHash } from '#util/hash';
import { isObject } from '#util/guards';
import type { HookInput } from '#types/hook';
import type { LedgerEntry, LockedLedger, TaskDir } from '#types/modules/evidence';
import type { Runtime } from '#types/composition';

export const MR_DIFF_PATCH = 'mr-diff.patch';
export const MR_DIFF_JSON = 'mr-diff.json';

export interface MrCaptureDeps { runtime: Runtime; dir: TaskDir; ledger: LockedLedger; routeId: string; /** `--mr` of the active review route; null for any other route, which records nothing. */ mrUrl: string | null }

const MR_DIFF_TOOL = /^mcp__(.+?)__(.+)$/;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Every JSON value in a response, with JSON carried inside text parts opened. */
function opened(value: unknown, depth = 0): unknown[] {
  if (typeof value === 'string') {
    try {
      return depth < 3 && /^\s*[[{]/.test(value) ? opened(JSON.parse(value), depth + 1) : [value];
    } catch {
      return [value];
    }
  }
  if (Array.isArray(value)) return [value, ...value.flatMap((item) => opened(item, depth))];
  return isObject(value) ? [value, ...Object.values(value).flatMap((item) => opened(item, depth))] : [];
}

interface Change { old_path?: unknown; new_path?: unknown; new_file?: unknown; deleted_file?: unknown; diff?: unknown }
const isChange = (value: unknown): value is Change => isObject(value) && typeof value['diff'] === 'string' && (typeof value['new_path'] === 'string' || typeof value['old_path'] === 'string');

/** A GitLab `changes[]` entry carries hunks only; the headers are rebuilt from its paths. */
function fromChange(change: Change): string {
  const oldPath = str(change.old_path) || str(change.new_path);
  const newPath = str(change.new_path) || oldPath;
  const body = str(change.diff);
  const before = change.new_file === true ? '/dev/null' : `a/${oldPath}`;
  const after = change.deleted_file === true ? '/dev/null' : `b/${newPath}`;
  return `diff --git a/${oldPath} b/${newPath}\n--- ${before}\n+++ ${after}\n${body.endsWith('\n') ? body : `${body}\n`}`;
}

/** A unified diff without `diff --git` lines gets them from its `---`/`+++` pair, so the git-shaped parser can section it. */
function gitShaped(patch: string): string {
  if (/^diff --git /m.test(patch)) return patch;
  const lines = patch.split('\n');
  const out: string[] = [];
  lines.forEach((line, at) => {
    const next = lines[at + 1] ?? '';
    if (line.startsWith('--- ') && next.startsWith('+++ ')) {
      const strip = (header: string): string => header.slice(4).split('\t')[0]!.replace(/^[ab]\//, '');
      const [from, to] = [strip(line), strip(next)];
      const real = to === '/dev/null' ? from : to;
      out.push(`diff --git a/${from === '/dev/null' ? real : from} b/${real}`);
    }
    out.push(line);
  });
  return out.join('\n');
}

/** The diff a merge-request tool returned: a `changes[]` list, or a unified-diff string. */
export function patchOf(response: unknown): string | null {
  const values = opened(response);
  const changes = values.flatMap((value) => (Array.isArray(value) ? value.filter(isChange) : []));
  if (changes.length > 0) return changes.map(fromChange).join('');
  const text = values.find((value): value is string => typeof value === 'string' && /^(?:diff --git |--- .*\n\+\+\+ |@@ )/m.test(value));
  return text === undefined ? null : gitShaped(text.endsWith('\n') ? text : `${text}\n`);
}

const shaOf = (response: unknown): string | null => {
  for (const value of opened(response)) {
    if (!isObject(value)) continue;
    const refs = isObject(value['diff_refs']) ? value['diff_refs'] : {};
    const sha = str(refs['head_sha']) || str(value['head_sha']) || str(value['sha']);
    if (/^[0-9a-f]{40}$/i.test(sha)) return sha.toLowerCase();
  }
  return null;
};

/**
 * Records the diff a GitLab MCP tool returned while a review route with `--mr` is active: the files and one ledger entry,
 * no fold and no step. Any other tool, or a response with no diff, writes nothing.
 */
export async function captureMrDiff(input: HookInput, deps: MrCaptureDeps): Promise<LedgerEntry | null> {
  if (deps.mrUrl === null) return null;
  const match = MR_DIFF_TOOL.exec(input.tool_name ?? '');
  const tool = match?.[2]?.toLowerCase() ?? '';
  if (match === null || !tool.includes('merge_request') || !/diff|changes/.test(tool)) return null;
  const patch = patchOf(input.tool_response);
  if (patch === null) return null;
  const rawHash = contentHash(JSON.stringify(input.tool_response ?? null));
  const sha = shaOf(input.tool_response);
  await deps.runtime.fs.mkdirp(deps.dir.root);
  await deps.runtime.fs.writeText(path.join(deps.dir.root, MR_DIFF_PATCH), patch);
  const bytes = Buffer.byteLength(patch);
  await deps.runtime.fs.writeText(path.join(deps.dir.root, MR_DIFF_JSON), `${JSON.stringify({ url: deps.mrUrl, ...(sha === null ? {} : { sha }), server: match[1], tool: input.tool_name, rawHash, bytes }, null, 2)}\n`);
  return deps.ledger.append({ kind: 'capture', route: deps.routeId, what: 'mr-diff', path: path.relative(deps.dir.repositoryRoot, path.join(deps.dir.root, MR_DIFF_PATCH)), rawHash, bytes, tool: input.tool_name });
}
