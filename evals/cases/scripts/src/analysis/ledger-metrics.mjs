// The v6 route measures of a run, read from the task ledgers its sandbox left (harvested by `harvestTraces`).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const tally = (values) => {
  const out = {};
  for (const value of values) out[value ?? 'unrecorded'] = (out[value ?? 'unrecorded'] ?? 0) + 1;
  return out;
};

/** Pass 2's terms of a `map` entry: `terms` keyed by pass (`{2: [...]}`/`{pass2: [...]}`) or listed in pass order. */
function pass2Terms(map) {
  const terms = map.terms;
  const second = Array.isArray(terms) ? terms[1] : (terms?.[2] ?? terms?.['2'] ?? terms?.pass2);
  return Array.isArray(second) ? second.length : null;
}

/** Why `mcpHookSpawns` and `noRouteMcpSpawns` are null: printed with the ledger measures. */
export const MCP_SPAWNS_UNMEASURED = 'unmeasured: MCP hook process spawns are not in the trace or the ledger, and the PostToolUse observation channel is unverified (probe pending)';

/**
 * Field contract the ledger measures read (v6 13 §1, 32 §2, 12 route stop, 15 guard; step 02 writes it):
 * - `route {id, resumes?}`: starts a chain, or continues the chain of the route entry `resumes` names (12 §2.3).
 * - `exit {route, reason, detail?, code?}`: one per route end; `reason` is a route exit name (`blocked`, `done`,
 *   `superseded`, …), or the `onError` action form `stop:blocked`; `code` is the error code that ended it,
 *   `permission-denied` for a headless `ask`.
 * - `check {route, key, only?, phase: "red"|"green", exit, summary: {ran, failed}}`; `revise {route, from, via}`.
 * `route` on check, revise and exit is the id of the `route` entry the command ran under: v6 13 §1 does not list
 * it, so until step 02 writes it a check is readable but proves nothing.
 */
const exitReason = (e) => String(e.reason ?? '').replace(/^stop:/, '');
const isPermissionDenied = (e) => e.code === 'permission-denied' || e.detail === 'permission-denied';

/** The documented `only`: absent or empty is the whole suite; otherwise a flat array of strings. */
const validScope = (only) => only === undefined || (Array.isArray(only) && only.every((t) => typeof t === 'string'));

const validSummary = (s) => s && Number.isInteger(s.ran) && Number.isInteger(s.failed) && s.ran >= 1 && s.failed >= 0 && s.failed <= s.ran;

/**
 * Each route entry's chain (the root route it resumes, transitively), in one ledger's line order. A resume of a
 * route not yet seen in this ledger, or a repeated or missing id, gives null: that route's evidence proves nothing.
 */
function chainsOf(entries) {
  const at = new Map();
  const resumes = new Map();
  const repeated = new Set();
  entries.forEach((e, i) => {
    if (e?.kind !== 'route' || typeof e.id !== 'string' || !e.id) return;
    if (at.has(e.id)) return repeated.add(e.id);
    at.set(e.id, i);
    resumes.set(e.id, e.resumes);
  });
  const rootOf = (id) => {
    // Each hop goes to an earlier line, so the walk ends.
    for (;;) {
      if (repeated.has(id)) return null;
      const up = resumes.get(id);
      if (up === undefined) return id;
      if (typeof up !== 'string' || !at.has(up) || at.get(up) >= at.get(id)) return null;
      id = up;
    }
  };
  return new Map([...at.keys()].map((id) => [id, rootOf(id)]));
}

/**
 * Red then green for the same check key and test scope, within one ledger and one route chain: both checks name
 * a route of that chain, recorded before them. A `revise` or `exit` of the chain voids its earlier reds; one with
 * no valid association voids every chain's, since it cannot be placed. A check with no valid association is
 * counted (`unassociated`) and proves nothing; one whose summary cannot be trusted counts as `malformed`.
 */
function redGreenOf(entries) {
  const out = { checks: 0, red: 0, green: 0, malformed: 0, unassociated: 0, proven: false };
  const seen = new Map();
  const reds = new Map();
  const chains = chainsOf(entries);
  const chainOf = (e) => (typeof e.route === 'string' && seen.has(e.route) ? seen.get(e.route) : null);
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (e.kind === 'route') {
      if (typeof e.id === 'string' && e.id) seen.set(e.id, chains.get(e.id));
      continue;
    }
    if (e.kind === 'revise' || e.kind === 'exit') {
      const chain = chainOf(e);
      if (chain) reds.delete(chain);
      else reds.clear();
      continue;
    }
    if (e.kind !== 'check') continue;
    out.checks += 1;
    if (!validSummary(e.summary) || typeof e.key !== 'string' || !Number.isInteger(e.exit) || !validScope(e.only)) {
      out.malformed += 1;
      continue;
    }
    const red = e.phase === 'red' && e.summary.failed >= 1 && e.exit !== 0;
    const green = e.phase === 'green' && e.summary.failed === 0 && e.exit === 0;
    if (red) out.red += 1;
    if (green) out.green += 1;
    const chain = chainOf(e);
    if (!chain) {
      out.unassociated += 1;
      continue;
    }
    const scope = JSON.stringify([e.key, [...(e.only ?? [])].sort()]);
    if (red) (reds.get(chain) ?? reds.set(chain, new Set()).get(chain)).add(scope);
    else if (green && reds.get(chain)?.has(scope)) out.proven = true;
  }
  return out;
}

const LEDGER_MEASURES = ['routes', 'mapLayers', 'mapPass2', 'routeSteps', 'revises', 'gates', 'preanswers', 'stopBlocked', 'checkRedGreen', 'envelopeBuiltFrom', 'permissionDenied'];

/**
 * The v6 route measures of one run, from the task ledgers its sandbox left: `[{entries, unreadable}]`, one per
 * ledger file, each in its own line order (files are never ordered against each other). No ledger gives null.
 * An unreadable line or an empty ledger makes the evidence incomplete: every measure is null, never a clean 0
 * or a proof. Otherwise a ledger with no `route` gives null for the route-scoped measures, and a kind never
 * written gives null for the measure read from it (a route alone proves nothing about steps, revises, gates,
 * preanswers or exits), while a kind written with no match gives a real 0. Unknown kinds are skipped.
 */
export function ledgerMetrics(ledgers, trace = null) {
  if (!ledgers) return null;
  const unreadable = ledgers.reduce((n, l) => n + (l.unreadable ?? 0), 0);
  const empty = ledgers.filter((l) => !l.entries.length && !l.unreadable).length;
  const status = { ledgers: ledgers.length, complete: ledgers.length > 0 && !unreadable && !empty, unreadable, empty };
  const unmeasured = { mcpHookResponses: trace?.mcpHookResponses ?? null, noRouteMcpSpawns: null };
  if (!status.complete) return { ...status, ...Object.fromEntries(LEDGER_MEASURES.map((m) => [m, null])), ...unmeasured };
  const entries = ledgers.flatMap((l) => l.entries);
  const kinds = new Map();
  for (const entry of entries) {
    const bucket = kinds.get(entry?.kind);
    if (bucket) bucket.push(entry);
    else kinds.set(entry?.kind, [entry]);
  }
  const of = (kind) => kinds.get(kind) ?? [];
  const last = (kind) => of(kind).at(-1) ?? null;
  const routed = of('route').length > 0;
  // A route-scoped measure is known only from the records it is read from: a route alone says nothing about them.
  const from = (kind, measure) => {
    const records = of(kind);
    return routed && records.length ? measure(records) : null;
  };
  const map = last('map');
  const envelope = last('envelope');
  const prints = of('gate');
  const answers = ['acceptance', 'declined', 'default-taken'].flatMap(of);
  const bound = answers.filter((a) => !a.unbound && a.instance != null && prints.some((g) => g.id === a.instance && g.gate === a.gate));
  const proofs = ledgers.map((l) => redGreenOf(l.entries));
  const sum = (key) => proofs.reduce((n, p) => n + p[key], 0);
  const exited = (match) => from('exit', (exits) => exits.filter(match).length);
  return {
    ...status,
    routes: of('route').length,
    mapLayers: map ? (Array.isArray(map.layers) ? map.layers.map((l) => l?.name ?? null) : null) : null,
    mapPass2: map ? pass2Terms(map) : null,
    routeSteps: from('step', (steps) => ({ delivered: 0, completed: 0, skipped: 0, ...tally(steps.map((e) => e.status)) })),
    revises: from('revise', (revises) => ({ gate: 0, code: 0, model: 0, ...tally(revises.map((e) => e.via)) })),
    // Prints and answers are separate records: each is known only when it was written, and a binding needs both.
    gates:
      routed && (prints.length || answers.length)
        ? {
            prints: prints.length ? tally(prints.map((g) => g.class)) : null,
            answers: answers.length ? tally(answers.filter((a) => !a.unbound).map((a) => a.via)) : null,
            bound: prints.length && answers.length ? bound.length : null,
            unbound: answers.length ? answers.filter((a) => a.unbound).length : null,
          }
        : null,
    preanswers: from('preanswer', (all) => all.length),
    stopBlocked: exited((e) => exitReason(e) === 'blocked'),
    checkRedGreen: sum('checks')
      ? { checks: sum('checks'), red: sum('red'), green: sum('green'), malformed: sum('malformed'), unassociated: sum('unassociated'), proven: proofs.some((p) => p.proven) }
      : null,
    envelopeBuiltFrom: envelope ? (envelope.builtFrom ?? null) : null,
    // Exits only: the refusal that preceded one is not a second permission-denied exit.
    permissionDenied: exited(isPermissionDenied),
    ...unmeasured,
  };
}

/** Where `harvestTraces` keeps a run's ledgers: `<traces>/ledgers/<e-id>/<path inside the sandbox>`. */
export const LEDGER_DIRECTORY = 'ledgers';

function listLedgers(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listLedgers(full));
    else if (entry.name === 'ledger.jsonl') out.push(full);
  }
  return out;
}

/** The run's harvested ledgers, each with its own entries in line order and its unreadable-line count; null when none. */
export function ledgersOf(run, tracesDir) {
  const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1];
  const directory = tracesDir && id ? [].concat(tracesDir).map((dir) => path.join(dir, LEDGER_DIRECTORY, id)).find((dir) => existsSync(dir)) : null;
  if (!directory) return null;
  return listLedgers(directory).map((file) => {
    const ledger = { file: path.relative(directory, file), entries: [], unreadable: 0 };
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) ledger.entries.push(entry);
        else ledger.unreadable += 1;
      } catch {
        ledger.unreadable += 1;
      }
    }
    return ledger;
  });
}
