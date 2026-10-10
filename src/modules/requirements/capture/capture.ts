import path from 'node:path';
import { z } from 'zod';
import { contentHash } from '#util/hash';
import { isObject } from '#util/guards';
import type { HookInput } from '#types/hook';
import type { CaptureDeps } from '#types/modules/requirements';
import type { LedgerEntry, TaskDir } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

// A Confluence page body measured 40-90 KB; 256 KB keeps a long spec whole without letting one result fill the task directory.
const MAX_CONTENT = 256 * 1024;

export const CapturedRequirement = z.strictObject({ key: z.string().min(1), url: z.string(), tool: z.string().min(1), retrievedAt: z.string().min(1), rawHash: z.string().min(1), content: z.string() });
export type CapturedRequirement = z.infer<typeof CapturedRequirement>;

/** The last path segment of a URL, so a call that names only the issue key still matches the URL the route asked for. */
const tailOf = (asked: string): string => asked.split(/[?#]/)[0]!.split('/').filter((segment) => segment !== '').at(-1) ?? asked;

const fileOf = (dir: TaskDir, key: string): string => path.join(dir.requirements, `${key.replace(/[^\w.-]+/g, '_').slice(0, 80)}.${contentHash(key).replace(/^sha256:/, '').slice(0, 8)}.json`);

/** The stored capture for a key, or null when its file is gone, unreadable, or its content no longer matches the recorded hash. */
export async function readCapture(fs: FileSystem, dir: TaskDir, key: string, rawHash: string | null): Promise<CapturedRequirement | null> {
  try {
    const parsed = CapturedRequirement.safeParse(JSON.parse(await fs.readText(fileOf(dir, key))));
    return parsed.success && contentHash(parsed.data.content) === parsed.data.rawHash && (rawHash === null || parsed.data.rawHash === rawHash) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The text a tool returned: a string, MCP text parts joined, or the JSON of anything else. */
function resultText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (isObject(response) && Array.isArray(response['content'])) {
    const parts = response['content'].flatMap((part) => (isObject(part) && typeof part['text'] === 'string' ? [part['text']] : []));
    if (parts.length > 0) return parts.join('\n');
  }
  if (isObject(response)) for (const field of ['result', 'text', 'content']) if (typeof response[field] === 'string') return response[field];
  return response === undefined || response === null ? '' : JSON.stringify(response);
}

/**
 * Stores the raw result of a `mcp__*` or WebFetch call under `requirements/<key>.json` while the route asked for
 * requirements. The key is the asked key whose text or last path segment the call's input names; a call naming
 * none is not a requirement read.
 */
export async function captureRequirement(input: HookInput, deps: CaptureDeps): Promise<LedgerEntry | null> {
  const tool = input.tool_name ?? '';
  if (deps.asked.length === 0 || (tool !== 'WebFetch' && !tool.startsWith('mcp__'))) return null;
  const given = JSON.stringify(input.tool_input ?? {});
  const url = typeof input.tool_input?.['url'] === 'string' ? input.tool_input['url'] : '';
  const key = deps.asked.find((asked) => given.includes(asked) || given.includes(tailOf(asked))) ?? null;
  const content = resultText(input.tool_response).trim().slice(0, MAX_CONTENT);
  if (key === null || content === '') return null;
  const rawHash = contentHash(content);
  const read = await deps.ledger.read();
  const chain = read.state === 'ok' ? read.entries.filter((entry) => deps.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
  if (chain.some((entry) => entry.kind === 'requirement' && entry['key'] === key && entry['rawHash'] === rawHash)) return null;
  const text = `${JSON.stringify({ key, url, tool, retrievedAt: deps.runtime.clock.now().toISOString(), rawHash, content }, null, 2)}\n`;
  await deps.runtime.fs.mkdirp(deps.dir.requirements);
  await deps.runtime.fs.writeText(fileOf(deps.dir, key), text);
  return deps.ledger.append({ kind: 'requirement', route: deps.view.routeId, key, via: tool, rawHash, bytes: Buffer.byteLength(text), relation: 'asked', capture: 'full' });
}
