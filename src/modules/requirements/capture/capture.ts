import path from 'node:path';
import { z } from 'zod';
import { contentHash } from '#util/hash';
import { isObject } from '#util/guards';
import { htmlText } from '../envelope/render.ts';
import { isIssueKey, namesKey } from '#util/issue-key';
import type { HookInput } from '#types/hook';
import type { CaptureDeps } from '#types/modules/requirements';
import type { LedgerEntry, TaskDir } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

// A Confluence page body measured 40-90 KB; 256 KB keeps a long spec whole without letting one result fill the task directory.
export const MAX_CONTENT = 256 * 1024;

const CapturedRequirement = z.strictObject({ key: z.string().min(1), url: z.string(), tool: z.string().min(1), retrievedAt: z.string().min(1), rawHash: z.string().min(1), content: z.string(), cutFrom: z.number().nullable() });
type CapturedRequirement = z.infer<typeof CapturedRequirement>;

const PAGE_PARAM = /^page_?id$/i;
// The fetch step's id in every shipped route; elsewhere the model reads for its own reasons and no read is a requirement.
const FETCH_STEP = 'fetch';

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/** What an unasked call names: its URL when it is on an asked tracker's host, or a whole-value issue key or page id parameter. Free text never names one (`UTF-8` and `SHA-256` look like issue keys). */
function linkedKey(input: Record<string, unknown> | undefined, asked: readonly string[]): string | null {
  const url = typeof input?.['url'] === 'string' ? input['url'] : '';
  const host = hostOf(url);
  if (host !== null && asked.some((candidate) => hostOf(candidate) === host)) return url;
  for (const [name, value] of Object.entries(input ?? {})) {
    if (typeof value === 'string' && (isIssueKey(value) || (PAGE_PARAM.test(name) && /^\d+$/.test(value)))) return value;
  }
  return null;
}

/** The last path segment of a URL, so a call that names only the issue key still matches the URL the route asked for. */
const tailOf = (asked: string): string => asked.split(/[?#]/)[0]!.split('/').filter((segment) => segment !== '').at(-1) ?? asked;

// Breadth-first: a ticket's own `summary` must win over `parent.fields.summary`, which depth-first returned when `parent` came first.
const findOwner = (value: unknown, name: string): Record<string, unknown> | null => {
  let level: unknown[] = [value];
  for (let depth = 0; depth <= 6 && level.length > 0; depth++) {
    const next: unknown[] = [];
    for (const node of level) {
      if (!isObject(node) && !Array.isArray(node)) continue;
      if (isObject(node) && typeof node[name] === 'string' && node[name].trim() !== '') return node;
      for (const child of Object.values(node)) if (typeof child === 'object' && child !== null) next.push(child);
    }
    level = next;
  }
  return null;
};

const findText = (value: unknown, name: string): string | null => {
  const owner = findOwner(value, name);
  return owner === null ? null : (owner[name] as string).trim();
};

/** A captured result's own name: the shallowest `summary` (Jira) or `title` (Confluence) string in its JSON, else the key. The key stands in for it when the tool returned prose. */
export function titleOf(content: string, key: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    return findText(parsed, 'summary') ?? findText(parsed, 'title') ?? key;
  } catch {
    return key;
  }
}

/** What the map searches for one captured source: JSON gives its title plus the description (or Confluence storage body) of the object that holds that title, so an issuetype or status description never stands in; prose keeps today's `title+newline+content` form. */
export function mapTextOf(content: string, title: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return `${title}\n${content}`;
  }
  if (!isObject(parsed) && !Array.isArray(parsed)) return `${title}\n${content}`;
  const owner = findOwner(parsed, 'summary') ?? findOwner(parsed, 'title');
  const storage = owner !== null && isObject(owner['body']) && isObject(owner['body']['storage']) ? owner['body']['storage']['value'] : undefined;
  const description = owner?.['description'];
  const text = typeof description === 'string' && description.trim() !== '' ? description.trim() : typeof storage === 'string' && htmlText(storage) !== '' ? htmlText(storage) : null;
  return text === null ? title : `${title}\n${text}`;
}

export const fileOf = (dir: TaskDir, key: string): string => path.join(dir.requirements, `${key.replace(/[^\w.-]+/g, '_').slice(0, 80)}.${contentHash(key).replace(/^sha256:/, '').slice(0, 8)}.json`);

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
 * requirements. The key is the asked key whose text or last path segment the call's input names, else the
 * call's own url or issue key; a call naming none is not a requirement read.
 */
export async function captureRequirement(input: HookInput, deps: CaptureDeps): Promise<LedgerEntry | null> {
  const tool = input.tool_name ?? '';
  if (deps.asked.length === 0 || (tool !== 'WebFetch' && !tool.startsWith('mcp__'))) return null;
  const given = JSON.stringify(input.tool_input ?? {});
  const url = typeof input.tool_input?.['url'] === 'string' ? input.tool_input['url'] : '';
  const asked = deps.asked.find((candidate) => namesKey(given, candidate) || namesKey(given, tailOf(candidate)));
  // A child, parent or linked item is evidence only while the fetch step runs and never stands in for the asked source.
  const key = asked ?? (deps.view.position === FETCH_STEP ? linkedKey(input.tool_input, deps.asked) : null);
  const whole = resultText(input.tool_response).trim();
  if (key === null || whole === '') return null;
  return saveRequirement(deps, { key, url, tool, whole, relation: asked === undefined ? 'linked' : 'asked' });
}

/** Writes one requirement file and its ledger row; null when the route's chain already holds that content under the key. */
export async function saveRequirement(deps: Pick<CaptureDeps, 'runtime' | 'dir' | 'ledger' | 'view'>, source: { key: string; url: string; tool: string; whole: string; relation: 'asked' | 'linked' }): Promise<LedgerEntry | null> {
  const { key, url, tool, whole } = source;
  const cut = whole.length > MAX_CONTENT;
  const content = whole.slice(0, MAX_CONTENT);
  const rawHash = contentHash(content);
  const read = await deps.ledger.read();
  const chain = read.state === 'ok' ? read.entries.filter((entry) => deps.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
  if (chain.some((entry) => entry.kind === 'requirement' && entry['key'] === key && entry['rawHash'] === rawHash)) return null;
  const text = `${JSON.stringify({ key, url, tool, retrievedAt: deps.runtime.clock.now().toISOString(), rawHash, content, cutFrom: cut ? whole.length : null }, null, 2)}\n`;
  await deps.runtime.fs.mkdirp(deps.dir.requirements);
  await deps.runtime.fs.writeText(fileOf(deps.dir, key), text);
  return deps.ledger.append({ kind: 'requirement', route: deps.view.routeId, key, via: tool, rawHash, bytes: Buffer.byteLength(text), relation: source.relation, capture: cut ? 'cut' : 'full' });
}
