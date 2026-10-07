import { CapturedRequirement, RequirementEvidence, EXPANSION_FETCH, type EnvelopeSource, type EnvelopeInput } from '#types/modules/requirements';
import { latestBound } from '#modules/evidence/ledger-chain';
import { contentHash } from '#util/hash';
import { bindServer, capturedServers, observedTools, serverOf } from '../capture/binding.ts';
import { asRecorded, readCapture } from '../capture/capture-files.ts';
import { expansionFor } from '../capture/expansion.ts';
import { jiraFields, keyOfSource, toolName } from '../capture/template.ts';
import type { LedgerEntry, LockedLedger } from '#types/modules/evidence';
import type { RouteView, RouteArgs } from '#types/harness';

type EnvelopeResult =
  | { state: 'ok'; sources: EnvelopeSource[]; builtFrom: 'captures' | 'args'; asked: string[]; missingAsked: string[]; notices: string[]; entry: LedgerEntry }
  | { state: 'failed'; code: 'requirements-not-captured' | 'requirements-missing' | typeof EXPANSION_FETCH; message: string; recoverable: true }
  | { state: 'raise'; gate: 'requirements-not-captured-twice' | 'requirements-server-disconnected' | 'requirements-server-ambiguous' | 'requirements-expansion-capped'; values: Readonly<Record<string, readonly string[]>> };

const URL_IN_TEXT = /https?:\/\/[^\s)>\]"']+/g;
const CONTINUE_GATES = ['requirements-not-captured-twice', 'requirements-server-disconnected'];

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

async function captures(input: EnvelopeInput, entries: readonly LedgerEntry[], server: string | null): Promise<Map<string, CapturedRequirement>> {
  const found = new Map<string, CapturedRequirement>();
  for (const entry of entries.filter((candidate) => candidate.kind === 'requirement' && candidate['capture'] === 'full' && (candidate['via'] === 'WebFetch' || (server !== null && serverOf(String(candidate['via'])) === server)))) {
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

function evidenceOf(sources: readonly EnvelopeSource[], server: string | null, mcpServer: string | null): RequirementEvidence {
  return RequirementEvidence.parse({
    mcpServer: server ?? mcpServer,
    sources: sources.map((source) => ({
      id: source.key, url: source.url === '' ? source.key : source.url, title: source.title, retrievedAt: source.retrievedAt, content: source.content, status: 'retrieved',
      retrievedVia: source.relation === 'args' ? 'args' : (mcpServer ?? 'mcp'), ...(source.relation === 'args' ? {} : { relation: source.relation, derivedFrom: source.derivedFrom }),
    })),
    conflicts: [],
  });
}

/**
 * A route's envelope as review evidence: the asked sources (by URL, or by key when the capture has none) and every
 * captured source. Null when the envelope was built from the request text only, so the review stays a quality review.
 */
export async function routeEvidence(input: Pick<EnvelopeInput, 'runtime' | 'dir' | 'args'>, entry: LedgerEntry, mcpServer: string | null): Promise<{ urls: string[]; evidence: RequirementEvidence } | null> {
  if (entry['builtFrom'] !== 'captures') return null;
  const sources = (await envelopeSources(input, entry)).filter((source) => source.relation !== 'args');
  const asked = Array.isArray(entry['asked']) ? (entry['asked'] as string[]) : [];
  const urls = sources.filter((source) => asked.includes(source.key)).map((source) => (source.url === '' ? source.key : source.url));
  if (urls.length === 0) return null;
  return { urls, evidence: evidenceOf(sources, typeof entry['server'] === 'string' ? entry['server'] : null, mcpServer) };
}

async function record(input: EnvelopeInput, sources: EnvelopeSource[], builtFrom: 'captures' | 'args', asked: string[], missingAsked: string[], notices: string[], server: string | null): Promise<EnvelopeResult> {
  const evidence = evidenceOf(sources, server, input.mcpServer);
  const entry = await input.ledger.append({
    kind: 'envelope',
    route: input.view.routeId,
    sources: sources.map((source) => ({ key: source.key, title: clip(source.title, 80), relation: source.relation, derivedFrom: source.derivedFrom, bytes: Buffer.byteLength(source.content), ...(source.rawHash === undefined ? {} : { rawHash: source.rawHash }) })),
    builtFrom,
    asked,
    missingAsked,
    ...(server === null ? {} : { server }),
    hash: contentHash(JSON.stringify(evidence)),
  });
  return { state: 'ok', sources, builtFrom, asked, missingAsked, notices, entry };
}

const AMBIGUOUS = 'requirements-server-ambiguous';

/**
 * The route's requirement envelope. Ground order: the server the captures came from, the expansion of a wide
 * epic, what was asked and what is missing, then the envelope itself: the complete captures when there are any, else
 * the request text, else a recoverable refusal, else a gate (04-E1).
 */
export async function normalizeEnvelope(input: EnvelopeInput): Promise<EnvelopeResult> {
  const entries = await chainOf(input.ledger, input.view);
  const asked = askedKeys(input.args);
  const skill = input.view.skill;
  const notices: string[] = [];

  const binding = bindServer(input.mcpServer, capturedServers(entries));
  let server: string | null = null;
  let withoutServer = false;
  if (binding.state === 'bound') {
    server = binding.server;
    if (binding.how === 'only-candidate' && !entries.some((entry) => entry.kind === 'envelope' && entry['server'] !== undefined)) {
      notices.push(`requirements-server-unpinned: bound \`${server}\`; tell the user to pin \`requirements.mcpServer: ${server}\` in .ambicode/config.yaml.`);
    }
  } else if (binding.state === 'ambiguous') {
    const answer = latestBound(entries, AMBIGUOUS)?.['answer'];
    if (typeof answer === 'string' && binding.servers.includes(answer)) server = answer;
    else if (answer === 'continue without') {
      withoutServer = true;
      notices.push(`${AMBIGUOUS}: continued without a requirement server; the request text stands in for the requirement.`);
    } else return { state: 'raise', gate: AMBIGUOUS, values: { servers: binding.servers } };
  }

  const complete = await captures(input, entries, server);
  for (const [key, captured] of complete) if (captured.relation === 'mention') complete.delete(key);
  const scoped = entries.filter((entry) => entry.kind !== 'requirement' || server === null || entry['via'] === 'WebFetch' || serverOf(String(entry['via'])) === server);
  if (server !== null) {
    const expansion = await expansionFor({ runtime: input.runtime, dir: input.dir, entries: scoped, asked, complete: new Set(complete.keys()) });
    notices.push(...expansion.notices);
    if (expansion.state === 'raise') return { state: 'raise', gate: 'requirements-expansion-capped', values: { keys: expansion.keys, parent: [expansion.parent] } };
    if (expansion.state === 'fetch') {
      const get = toolName(observedTools(entries), server, 'getJiraIssue');
      const lines = expansion.keys.map((key) => `${get} ${key} fields=${jiraFields(input.acceptanceField ?? null)}`);
      return {
        state: 'failed',
        code: EXPANSION_FETCH,
        message: `Read the ${expansion.keys.length} chosen children of ${expansion.parent}, one call each:\n${lines.join('\n')}\nThen run \`${input.runner ?? 'ambicode'} route next --task ${input.view.task}\`.`,
        recoverable: true,
      };
    }
  }

  const missingAsked = asked.filter((key) => !complete.has(key));

  if (complete.size > 0) {
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
    return record(input, sources, 'captures', asked, missingAsked, notices, server);
  }

  const fromArgs = (missing: readonly string[]): Promise<EnvelopeResult> => {
    const text = input.args.text.trim();
    const source: EnvelopeSource = { key: 'ARGS', title: clip(text.split('\n')[0] ?? '', 120), content: text, url: '', relation: 'args', derivedFrom: null, retrievedAt: input.runtime.clock.now().toISOString() };
    return record(input, [source], 'args', asked, [...missing], notices, null);
  };
  // Nothing was to be fetched, so a URL in the prose (an image, a link) is not a requirement that went missing.
  const explicit = new Set(input.args.requirements.map(keyOfSource));
  if (!input.args.hasRequirement) return fromArgs(missingAsked.filter((key) => explicit.has(key)));

  const continued = withoutServer || CONTINUE_GATES.some((gate) => latestBound(entries, gate)?.['answer'] === 'continue without');
  if (continued) return fromArgs(missingAsked);
  const lastServed = entries.filter((entry) => entry.kind === 'requirement' && entry['via'] !== 'WebFetch').at(-1);
  if (lastServed?.['capture'] === 'disconnected') return { state: 'raise', gate: 'requirements-server-disconnected', values: {} };
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
