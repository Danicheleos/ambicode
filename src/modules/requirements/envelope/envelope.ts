import { RequirementEvidence, type EnvelopeInput, type EnvelopeSource } from '#types/modules/requirements';
import { latestBound } from '#modules/evidence/ledger-chain';
import { contentHash } from '#util/hash';
import { keyOfSource, readCapture } from '../capture/capture.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteArgs } from '#types/harness';

type EnvelopeResult =
  | { state: 'ok'; sources: EnvelopeSource[]; builtFrom: 'captures' | 'args'; asked: string[]; missingAsked: string[]; notices: string[]; entry: LedgerEntry }
  | { state: 'failed'; code: 'requirements-not-captured' | 'requirements-missing'; message: string; recoverable: true }
  | { state: 'raise'; gate: typeof CAPTURE_GATE; values: Readonly<Record<string, readonly string[]>> };

const URL_IN_TEXT = /https?:\/\/[^\s)>\]"']+/g;
const CAPTURE_GATE = 'requirements-not-captured-twice';

/** The keys the route asked for: its `--requirement` values, the URLs in its text, and a bare first-word key (03-Q5). */
export function askedKeys(args: Pick<RouteArgs, 'requirements' | 'text'>): string[] {
  const first = args.text.trim().split(/\s+/)[0] ?? '';
  const sources = [...args.requirements, ...(args.text.match(URL_IN_TEXT) ?? []), ...(/^[A-Z][A-Z0-9]+-\d+$/.test(first) ? [first] : [])];
  return [...new Set(sources.map(keyOfSource))];
}

const clip = (value: string, length: number): string => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

const argsSource = (text: string, retrievedAt: string): EnvelopeSource => ({ key: 'ARGS', title: clip(text.split('\n')[0] ?? '', 120), content: text, url: '', relation: 'args', retrievedAt });

/** The latest captured result of each key on this route's chain whose file still holds what was recorded. */
async function captured(input: EnvelopeInput, entries: readonly LedgerEntry[]): Promise<Map<string, EnvelopeSource>> {
  const found = new Map<string, EnvelopeSource>();
  for (const entry of entries.filter((candidate) => candidate.kind === 'requirement')) {
    const capture = await readCapture(input.runtime.fs, input.dir, String(entry['key']), String(entry['rawHash']));
    if (capture !== null) found.set(capture.key, { key: capture.key, title: capture.key, content: capture.content, url: capture.url, relation: 'captured', retrievedAt: capture.retrievedAt, rawHash: capture.rawHash, tool: capture.tool });
  }
  return found;
}

/** A route's envelope as review evidence: the captured sources, asked ones by URL (or key when the capture has none). Null when built from the request text only. */
export async function routeEvidence(input: Pick<EnvelopeInput, 'runtime' | 'dir' | 'args'>, entry: LedgerEntry): Promise<{ urls: string[]; evidence: RequirementEvidence } | null> {
  if (entry['builtFrom'] !== 'captures') return null;
  const sources = (await envelopeSources(input, entry)).filter((source) => source.relation === 'captured');
  const asked = Array.isArray(entry['asked']) ? (entry['asked'] as string[]) : [];
  const urls = sources.filter((source) => asked.includes(source.key)).map((source) => (source.url === '' ? source.key : source.url));
  if (urls.length === 0) return null;
  const evidence = RequirementEvidence.parse({
    sources: sources.map((source) => ({ id: source.key, url: source.url === '' ? source.key : source.url, title: source.title, retrievedAt: source.retrievedAt, content: source.content, status: 'retrieved', retrievedVia: source.tool ?? 'mcp' })),
  });
  return { urls, evidence };
}

async function record(input: EnvelopeInput, sources: EnvelopeSource[], builtFrom: 'captures' | 'args', asked: string[], missingAsked: string[], notices: string[]): Promise<EnvelopeResult> {
  const entry = await input.ledger.append({
    kind: 'envelope',
    route: input.view.routeId,
    sources: sources.map((source) => ({ key: source.key, url: source.url, rawHash: source.rawHash ?? null, relation: source.relation, bytes: Buffer.byteLength(source.content) })),
    builtFrom,
    asked,
    missingAsked,
    hash: contentHash(JSON.stringify(sources.map((source) => [source.key, source.rawHash ?? source.content]))),
  });
  return { state: 'ok', sources, builtFrom, asked, missingAsked, notices, entry };
}

/**
 * The route's requirement envelope: the captured sources when there are any, else the request text, else a
 * recoverable refusal, else a gate that lets the user continue without the requirement (04-E1).
 */
export async function normalizeEnvelope(input: EnvelopeInput): Promise<EnvelopeResult> {
  const read = await input.ledger.read();
  const entries = read.state === 'ok' ? read.entries.filter((entry) => input.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
  const asked = askedKeys(input.args);
  const complete = await captured(input, entries);
  const missingAsked = asked.filter((key) => !complete.has(key));
  const notices: string[] = [];

  if (complete.size > 0) {
    if (missingAsked.length > 0) {
      if (input.view.skill === 'review') return { state: 'failed', code: 'requirements-missing', message: `The review asked for ${missingAsked.join(', ')}, which is not captured.`, recoverable: true };
      notices.push(`requirements-partial: ${missingAsked.join(', ')} not captured; it is listed under Not verified.`);
    }
    return record(input, [...complete.values()], 'captures', asked, missingAsked, notices);
  }

  const fromArgs = (missing: readonly string[]): Promise<EnvelopeResult> =>
    record(input, [argsSource(input.args.text.trim(), input.runtime.clock.now().toISOString())], 'args', asked, [...missing], notices);
  // Nothing was to be fetched, so a URL in the prose (an image, a link) is not a requirement that went missing.
  const explicit = new Set(input.args.requirements.map(keyOfSource));
  if (!input.args.hasRequirement) return fromArgs(missingAsked.filter((key) => explicit.has(key)));
  if (latestBound(entries, CAPTURE_GATE)?.['answer'] === 'continue without') return fromArgs(missingAsked);
  if (entries.some((entry) => entry.kind === 'step' && entry['status'] === 'failed' && entry['code'] === 'requirements-not-captured')) return { state: 'raise', gate: CAPTURE_GATE, values: {} };
  return {
    state: 'failed',
    code: 'requirements-not-captured',
    message: `Nothing was captured for ${asked.join(', ') || 'the requirement'}. Fetch ${missingAsked.join(', ') || 'it'} with your Jira or Confluence MCP tools, then run route next.`,
    recoverable: true,
  };
}

/** The sources of an envelope entry: captures are read from their files, an args source from the route's text. */
export async function envelopeSources(input: Pick<EnvelopeInput, 'runtime' | 'dir' | 'args'>, entry: LedgerEntry): Promise<EnvelopeSource[]> {
  const sources: EnvelopeSource[] = [];
  for (const slim of Array.isArray(entry['sources']) ? (entry['sources'] as { key: string; relation: string; rawHash?: string | null }[]) : []) {
    if (slim.relation === 'args') {
      sources.push(argsSource(input.args.text.trim(), entry.at));
      continue;
    }
    const capture = await readCapture(input.runtime.fs, input.dir, slim.key, slim.rawHash ?? null);
    if (capture !== null) sources.push({ key: capture.key, title: capture.key, content: capture.content, url: capture.url, relation: 'captured', retrievedAt: capture.retrievedAt, tool: capture.tool });
  }
  return sources;
}
