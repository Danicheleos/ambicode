import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import { CapturedRequirement } from '../contracts/requirements.ts';
import type { RouteView } from '../route/context.ts';
import type { RouteArgs } from '../route/flags.ts';
import { latestBound } from '../route/fold.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import type { LockedLedger } from '../task/ledger-lock.ts';
import type { TaskDir } from '../task/task-dir.ts';
import { contentHash } from '../util/hash.ts';
import { asRecorded, readCapture } from './capture-files.ts';
import { canonicalUrl, RequirementEvidence } from './normalize.ts';

export interface EnvelopeSource {
  key: string;
  title: string;
  content: string;
  url: string;
  relation: 'asked' | 'child' | 'parent' | 'link' | 'args';
  derivedFrom: string | null;
  retrievedAt: string;
  rawHash?: string;
}

export interface EnvelopeInput {
  runtime: Runtime;
  dir: TaskDir;
  ledger: LockedLedger;
  view: RouteView;
  args: RouteArgs;
  mcpServer: string | null;
}

export type EnvelopeResult =
  | { state: 'ok'; sources: EnvelopeSource[]; builtFrom: 'captures' | 'args'; asked: string[]; missingAsked: string[]; notices: string[]; entry: LedgerEntry }
  | { state: 'failed'; code: 'requirements-not-captured' | 'requirements-missing'; message: string; recoverable: true }
  | { state: 'raise'; gate: 'requirements-not-captured-twice'; values: Record<string, never> };

const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const URL_IN_TEXT = /https?:\/\/[^\s)>\]"']+/g;
const CONTINUE_GATES = ['requirements-not-captured-twice', 'requirements-server-disconnected'];

function keyOfSource(source: string): string {
  const url = canonicalUrl(source);
  const page = /\/pages\/(\d+)/.exec(url);
  if (page !== null) return `page-${page[1]}`;
  return KEY.exec(url)?.[0] ?? KEY.exec(source)?.[0] ?? url;
}

/** The keys the route asked for: its `--requirement` values, the URLs in its text, and a bare first-word key (03-Q5). */
export function askedKeys(args: Pick<RouteArgs, 'requirements' | 'text'>): string[] {
  const first = args.text.trim().split(/\s+/)[0] ?? '';
  const sources = [...args.requirements, ...(args.text.match(URL_IN_TEXT) ?? []), ...(/^[A-Z][A-Z0-9]+-\d+$/.test(first) ? [first] : [])];
  return [...new Set(sources.map(keyOfSource))];
}

async function chainOf(ledger: LockedLedger, view: RouteView): Promise<LedgerEntry[]> {
  const read = await ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

async function captures(input: EnvelopeInput, entries: readonly LedgerEntry[]): Promise<Map<string, CapturedRequirement>> {
  const found = new Map<string, CapturedRequirement>();
  for (const entry of entries.filter((candidate) => candidate.kind === 'requirement' && candidate['capture'] === 'full')) {
    try {
      const parsed = await readCapture(input.runtime.fs, input.dir, String(entry['key']), String(entry['rawHash']));
      if (parsed !== null && parsed.content.trim() !== '') found.set(parsed.key, asRecorded(parsed, entry));
    } catch {
      // A capture whose file is gone or unreadable is not complete.
    }
  }
  return found;
}

/** Whether a derived capture chains through other captures back to an asked key. */
function chains(captured: ReadonlyMap<string, CapturedRequirement>, asked: readonly string[], key: string): boolean {
  const seen = new Set<string>();
  for (let current: string | null = key; current !== null && !seen.has(current); ) {
    if (asked.includes(current)) return true;
    seen.add(current);
    current = captured.get(current)?.derivedFrom ?? null;
  }
  return false;
}

const clip = (value: string, length: number): string => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

async function record(input: EnvelopeInput, sources: EnvelopeSource[], builtFrom: 'captures' | 'args', asked: string[], missingAsked: string[], notices: string[]): Promise<EnvelopeResult> {
  const evidence = RequirementEvidence.parse({
    mcpServer: input.mcpServer,
    sources: sources.map((source) => ({
      id: source.key, url: source.url === '' ? source.key : source.url, title: source.title, retrievedAt: source.retrievedAt, content: source.content, status: 'retrieved',
      retrievedVia: source.relation === 'args' ? 'args' : (input.mcpServer ?? 'mcp'), ...(source.relation === 'args' ? {} : { relation: source.relation, derivedFrom: source.derivedFrom }),
    })),
    conflicts: [],
  });
  const entry = await input.ledger.append({
    kind: 'envelope',
    route: input.view.routeId,
    sources: sources.map((source) => ({ key: source.key, title: clip(source.title, 80), relation: source.relation, derivedFrom: source.derivedFrom, bytes: Buffer.byteLength(source.content), ...(source.rawHash === undefined ? {} : { rawHash: source.rawHash }) })),
    builtFrom,
    asked,
    missingAsked,
    hash: contentHash(JSON.stringify(evidence)),
  });
  return { state: 'ok', sources, builtFrom, asked, missingAsked, notices, entry };
}

/**
 * The route's requirement envelope: the complete captures when there are any, else the request text itself, else a
 * recoverable refusal, else a gate (03-Q5 … 03-Q7).
 */
export async function normalizeEnvelope(input: EnvelopeInput): Promise<EnvelopeResult> {
  const entries = await chainOf(input.ledger, input.view);
  const asked = askedKeys(input.args);
  const complete = await captures(input, entries);
  const missingAsked = asked.filter((key) => !complete.has(key));
  const skill = input.view.skill;

  if (complete.size > 0) {
    const notices: string[] = [];
    const kept: CapturedRequirement[] = [];
    for (const captured of complete.values()) {
      if (captured.relation !== 'asked' && !chains(complete, asked, captured.key)) notices.push(`requirements-derived-orphan: ${captured.key} is not linked to an asked requirement and was dropped.`);
      else kept.push(captured);
    }
    if (missingAsked.length > 0) {
      if (skill === 'review') {
        return { state: 'failed', code: 'requirements-missing', message: `The review asked for ${missingAsked.join(', ')}, which is not captured.`, recoverable: true };
      }
      notices.push(`requirements-partial: ${missingAsked.join(', ')} not captured; it is listed under Not verified.`);
    }
    const sources: EnvelopeSource[] = kept.map((captured) => ({ key: captured.key, title: captured.title, content: captured.content, url: captured.url, relation: captured.relation, derivedFrom: captured.derivedFrom, retrievedAt: captured.retrievedAt, rawHash: captured.rawHash }));
    return record(input, sources, 'captures', asked, missingAsked, notices);
  }

  const fromArgs = (): Promise<EnvelopeResult> => {
    const text = input.args.text.trim();
    const source: EnvelopeSource = { key: 'ARGS', title: clip(text.split('\n')[0] ?? '', 120), content: text, url: '', relation: 'args', derivedFrom: null, retrievedAt: input.runtime.clock.now().toISOString() };
    return record(input, [source], 'args', asked, missingAsked, []);
  };
  if (!input.args.hasRequirement) return fromArgs();

  const continued = CONTINUE_GATES.some((gate) => latestBound(entries, gate)?.['answer'] === 'continue without');
  if (continued) return fromArgs();
  const failures = entries.filter((entry) => entry.kind === 'step' && entry['status'] === 'failed' && entry['code'] === 'requirements-not-captured').length;
  if (failures >= 1) return { state: 'raise', gate: 'requirements-not-captured-twice', values: {} };
  return {
    state: 'failed',
    code: 'requirements-not-captured',
    message: `Nothing was captured for ${asked.join(', ') || 'the requirement'}. Fetch ${missingAsked.join(', ') || 'it'} with the ${input.mcpServer ?? 'configured'} MCP server's read tool, then run route next.`,
    recoverable: true,
  };
}

/** The full sources of an envelope entry: captures are read from their files, an args source from the route's text. */
export async function envelopeSources(input: Pick<EnvelopeInput, 'runtime' | 'dir' | 'args'>, entry: LedgerEntry): Promise<EnvelopeSource[]> {
  const sources: EnvelopeSource[] = [];
  for (const slim of Array.isArray(entry['sources']) ? (entry['sources'] as { key: string; relation: string; rawHash?: string }[]) : []) {
    if (slim.relation === 'args') {
      const text = input.args.text.trim();
      sources.push({ key: 'ARGS', title: clip(text.split('\n')[0] ?? '', 120), content: text, url: '', relation: 'args', derivedFrom: null, retrievedAt: entry.at });
      continue;
    }
    try {
      const parsed = await readCapture(input.runtime.fs, input.dir, slim.key, slim.rawHash ?? null);
      if (parsed === null) continue;
      const recorded = asRecorded(parsed, slim);
      sources.push({ key: parsed.key, title: parsed.title, content: parsed.content, url: parsed.url, relation: recorded.relation, derivedFrom: recorded.derivedFrom, retrievedAt: parsed.retrievedAt });
    } catch {
      // A source whose file vanished since the envelope was built is not offered.
    }
  }
  return sources;
}
