import { CapturedRequirement, type CapturedHits, type CaptureDeps } from '#types/modules/requirements';
import type { HookInput } from '#types/hook';
import { contentHash } from '#util/hash';
import { capturesFrom, serverOf } from './binding.ts';
import { keyOfSource } from './template.ts';
import { asRecorded, readCapture, readList, searchName, writeCapture } from './capture-files.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import { isObject } from '#util/guards';

const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const TOOL_CLASSES = ['get', 'search', 'fetch', 'read'] as const;
const PARENT_JQL = /\bparent\s*=\s*"?([A-Z][A-Z0-9]+-\d+)/;
const MAX_CONTENT = 60_000;

/** Fields of a Jira response that are not the question; custom fields, people and timestamps are not vocabulary. */
const NOT_THE_TICKET = new Set(['customFields', 'assignee', 'reporter', 'creator', 'status', 'priority', 'issuetype', 'type', 'id', 'self', 'expand', 'accountId', 'created', 'updated', 'updateAuthor', 'author', 'comment', 'comments', 'changelog', 'renderedFields']);

type Json = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Every JSON value a tool response holds, with JSON carried inside strings opened. */
function values(value: unknown, depth = 0): unknown[] {
  if (typeof value === 'string') {
    const trimmed = value.trimStart();
    if (depth < 4 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      try {
        const parsed: unknown = JSON.parse(value);
        return [parsed, ...values(parsed, depth + 1)];
      } catch {
        return [];
      }
    }
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => [item, ...values(item, depth)]);
  if (isObject(value)) return Object.values(value).flatMap((item) => [item, ...values(item, depth)]);
  return [];
}

function textOf(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    const trimmed = value.trimStart();
    if (depth < 4 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      try {
        return textOf(JSON.parse(value), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => textOf(item, depth)).join('\n');
  if (isObject(value)) return Object.entries(value).filter(([key]) => !NOT_THE_TICKET.has(key)).map(([, item]) => textOf(item, depth)).join('\n');
  return '';
}

const roots = (response: unknown): Json[] => [response, ...values(response)].flatMap((item) => (typeof item === 'string' ? [] : isObject(item) ? [item] : []));

function issueKeys(fields: unknown): string[] {
  if (!isObject(fields)) return [];
  const links = Array.isArray(fields['issuelinks']) ? fields['issuelinks'] : [];
  return links.flatMap((link) => (isObject(link) ? [link['inwardIssue'], link['outwardIssue']] : [])).flatMap((issue) => (isObject(issue) && typeof issue['key'] === 'string' ? [issue['key']] : []));
}

interface Extracted { key: string; title: string; type: string; parent: string | null; links: string[]; content: string; url: string; sourceVersion: string | null }

function extractDocument(response: unknown): Extracted | null {
  for (const node of roots(response)) {
    const fields = isObject(node['fields']) ? node['fields'] : null;
    if (typeof node['key'] === 'string' && KEY.test(node['key']) && fields !== null) {
      const type = isObject(fields['issuetype']) ? str(fields['issuetype']['name']) : '';
      const parent = isObject(fields['parent']) ? str(fields['parent']['key']) : '';
      const { summary, description, ...rest } = fields;
      const body = textOf({ summary, description, ...Object.fromEntries(Object.entries(rest).filter(([name]) => name !== 'issuelinks' && name !== 'parent')) });
      return { key: node['key'], title: textOf(summary).trim(), type, parent: parent === '' ? null : parent, links: issueKeys(fields), content: body.trim().slice(0, MAX_CONTENT), url: '', sourceVersion: null };
    }
    if (typeof node['id'] === 'string' && typeof node['title'] === 'string' && node['body'] !== undefined) {
      const version = isObject(node['version']) ? node['version']['number'] : undefined;
      const webui = isObject(node['_links']) ? str(node['_links']['webui']) : '';
      return { key: `page-${node['id']}`, title: node['title'], type: 'page', parent: null, links: [], content: textOf(node['body']).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CONTENT), url: webui, sourceVersion: version === undefined ? null : String(version) };
    }
  }
  return null;
}

function extractHits(response: unknown): { key: string; summary: string }[] {
  const hits: { key: string; summary: string }[] = [];
  for (const node of roots(response)) {
    if (typeof node['key'] !== 'string' || !KEY.test(node['key'])) continue;
    const fields = isObject(node['fields']) ? node['fields'] : node;
    const summary = str(fields['summary']);
    if (!hits.some((hit) => hit.key === node['key'])) hits.push({ key: node['key'], summary });
  }
  return hits;
}

function totalOf(response: unknown): number | null {
  for (const node of roots(response)) if (typeof node['total'] === 'number' && Number.isInteger(node['total']) && node['total'] >= 0) return node['total'];
  return null;
}

async function chainEntries(deps: CaptureDeps): Promise<LedgerEntry[]> {
  const read = await deps.ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => deps.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

async function known(deps: CaptureDeps, entries: readonly LedgerEntry[]): Promise<Map<string, CapturedRequirement>> {
  const captured = new Map<string, CapturedRequirement>();
  for (const entry of entries.filter((candidate) => candidate.kind === 'requirement' && candidate['capture'] === 'full')) {
    try {
      const parsed = await readCapture(deps.runtime.fs, deps.dir, String(entry['key']), String(entry['rawHash']));
      if (parsed !== null) captured.set(parsed.key, asRecorded(parsed, entry));
    } catch {
      // A capture whose file is gone is not known.
    }
  }
  return captured;
}

function relationOf(document: Extracted, asked: readonly string[], captured: ReadonlyMap<string, CapturedRequirement>, listed: ReadonlyMap<string, string>): { relation: CapturedRequirement['relation']; derivedFrom: string | null } {
  if (asked.includes(document.key)) return { relation: 'asked', derivedFrom: null };
  const parentSearch = listed.get(document.key);
  if (parentSearch !== undefined) return { relation: 'child', derivedFrom: parentSearch };
  const present = (key: string | null): key is string => key !== null && (asked.includes(key) || captured.has(key));
  if (present(document.parent)) return { relation: 'child', derivedFrom: document.parent };
  for (const other of captured.values()) {
    if (other.parent === document.key) return { relation: 'parent', derivedFrom: other.key };
    if (other.links.includes(document.key)) return { relation: 'link', derivedFrom: other.key };
  }
  const linked = document.links.find(present);
  return { relation: 'link', derivedFrom: linked ?? null };
}

/**
 * Records what an MCP read tool returned for the active route: nothing else, no map, no step, no advance (03-Q4).
 * A payload it does not recognise writes nothing.
 */
/** Hit keys of the `parent = K` searches already captured, by the `K` they were derived from. */
async function listedChildren(deps: CaptureDeps, entries: readonly LedgerEntry[]): Promise<Map<string, string>> {
  const listed = new Map<string, string>();
  for (const entry of entries.filter((candidate) => candidate.kind === 'requirement' && candidate['capture'] === 'list' && typeof candidate['derivedFrom'] === 'string')) {
    const list = await readList(deps.runtime.fs, deps.dir, String(entry['rawHash']));
    for (const hit of list?.hits ?? []) listed.set(hit.key, String(entry['derivedFrom']));
  }
  return listed;
}

/** Matched only on a short result: a page that discusses authentication is not a server error. */
const DISCONNECTED_MAX = 300;
const DISCONNECTED = /\b(?:not connected|disconnected|not authenticated|needs? (?:to be )?authenticat\w*|requires? authentication|no (?:such )?mcp server|server (?:is )?(?:not found|unavailable))\b/i;

/** The page a WebFetch returned, as the text the tool reported. */
function fetchedText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (isObject(response)) return str(response['result']) || str(response['content']) || str(response['text']);
  return '';
}

/** `content` names `url` itself, not a longer address that starts with it. */
function mentions(content: string, url: string): boolean {
  for (let at = content.indexOf(url); at !== -1; at = content.indexOf(url, at + 1)) {
    if (!/[\w/-]/.test(content.charAt(at + url.length))) return true;
  }
  return false;
}

function latestFrom(entries: readonly LedgerEntry[], server: string): LedgerEntry | undefined {
  return entries.filter((entry) => entry.kind === 'requirement' && serverOf(String(entry['via'])) === server).at(-1);
}

/** A fetched URL is recorded when it was asked for, or when a captured source mentions it. */
async function captureFetch(input: HookInput, deps: CaptureDeps): Promise<LedgerEntry | null> {
  const address = str(input.tool_input?.['url']);
  const content = fetchedText(input.tool_response).trim().slice(0, MAX_CONTENT);
  if (address === '' || content === '') return null;
  const key = keyOfSource(address);
  const entries = await chainEntries(deps);
  const asked = deps.asked.includes(key);
  const mentionedBy = asked ? null : [...(await known(deps, entries)).values()].find((other) => mentions(other.content, address) || mentions(other.content, key));
  if (!asked && mentionedBy === undefined) return null;
  const rawHash = contentHash(JSON.stringify(input.tool_response ?? null));
  if (entries.some((entry) => entry.kind === 'requirement' && entry['key'] === key && entry['rawHash'] === rawHash)) return null;
  const relation = asked ? 'asked' : 'mention';
  const derivedFrom = mentionedBy?.key ?? null;
  const document: CapturedRequirement = {
    key, url: address, title: content.split('\n')[0]!.slice(0, 120), type: 'web', relation, derivedFrom, retrievedVia: 'WebFetch', retrievedAt: deps.runtime.clock.now().toISOString(),
    sourceVersion: null, content, links: [], parent: null, rawHash,
  };
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await writeCapture(deps.runtime.fs, deps.dir, key, rawHash, text);
  return deps.ledger.append({ kind: 'requirement', route: deps.view.routeId, key, via: 'WebFetch', rawHash, bytes: Buffer.byteLength(text), relation, capture: 'full', derivedFrom });
}

/**
 * Records what an MCP read tool returned for the active route: nothing else, no map, no step, no advance (03-Q4).
 * A payload it does not recognise, or from a server the binding ignores, writes nothing.
 */
export async function captureRequirement(input: HookInput, deps: CaptureDeps): Promise<LedgerEntry | null> {
  if (input.tool_name === undefined) return null;
  if (input.tool_name === 'WebFetch') return captureFetch(input, deps);
  const server = serverOf(input.tool_name);
  if (server === null || !capturesFrom(deps.mcpServer, server)) return null;
  const reported = textOf(input.tool_response);
  if (reported.length <= DISCONNECTED_MAX && DISCONNECTED.test(reported) && extractDocument(input.tool_response) === null && extractHits(input.tool_response).length === 0) {
    const rawHash = contentHash(JSON.stringify(input.tool_response ?? null));
    const entries = await chainEntries(deps);
    if (latestFrom(entries, server)?.['capture'] === 'disconnected') return null;
    return deps.ledger.append({ kind: 'requirement', route: deps.view.routeId, key: 'DISCONNECTED', via: input.tool_name, rawHash, bytes: 0, relation: 'disconnected', capture: 'disconnected', derivedFrom: null });
  }
  const tool = input.tool_name.slice(`mcp__${server}__`.length).toLowerCase();
  const toolClass = TOOL_CLASSES.find((name) => tool.startsWith(name));
  if (toolClass === undefined) return null;

  const rawHash = contentHash(JSON.stringify(input.tool_response ?? null));
  const now = deps.runtime.clock.now().toISOString();
  const entries = await chainEntries(deps);
  const write = async (name: string, document: object): Promise<number> => {
    const text = `${JSON.stringify(document, null, 2)}\n`;
    await writeCapture(deps.runtime.fs, deps.dir, name, rawHash, text);
    return Buffer.byteLength(text);
  };

  if (toolClass === 'search') {
    const hits = extractHits(input.tool_response);
    const total = totalOf(input.tool_response);
    if (hits.length === 0 && total === null) return null;
    if (entries.some((entry) => entry.kind === 'requirement' && entry['capture'] === 'list' && entry['rawHash'] === rawHash && serverOf(String(entry['via'])) === server)) return null;
    const query = String(input.tool_input?.['jql'] ?? input.tool_input?.['query'] ?? '');
    const parent = PARENT_JQL.exec(query)?.[1] ?? null;
    const file: CapturedHits = { query, total: total ?? hits.length, hits, retrievedVia: input.tool_name, retrievedAt: now, rawHash };
    const bytes = await write(searchName(rawHash), file);
    return deps.ledger.append({
      kind: 'requirement', route: deps.view.routeId, key: parent ?? 'SEARCH', via: input.tool_name, rawHash, bytes, relation: 'list', capture: 'list', derivedFrom: parent, hits: Math.max(hits.length, file.total),
    });
  }

  const document = extractDocument(input.tool_response);
  if (document === null) return null;
  if (entries.some((entry) => entry.kind === 'requirement' && entry['key'] === document.key && entry['rawHash'] === rawHash && serverOf(String(entry['via'])) === server)) return null;
  const { relation, derivedFrom } = relationOf(document, deps.asked, await known(deps, entries), await listedChildren(deps, entries));
  const captured: CapturedRequirement = {
    key: document.key, url: document.url, title: document.title, type: document.type, relation, derivedFrom, retrievedVia: input.tool_name, retrievedAt: now,
    sourceVersion: document.sourceVersion, content: document.content, links: document.links, parent: document.parent, rawHash,
  };
  const bytes = await write(document.key, captured);
  return deps.ledger.append({ kind: 'requirement', route: deps.view.routeId, key: document.key, via: input.tool_name, rawHash, bytes, relation, capture: 'full', derivedFrom });
}
