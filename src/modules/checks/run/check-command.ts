import path from 'node:path';
import { openWorkspace, projectById } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { cycleEntries, liveHeads } from '#modules/evidence/ledger-chain';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { normalizeRelative } from '#util/paths';
import { authorizeCommand, checkApprovalKey } from '../selection/authorize.ts';
import { runChecks } from './run.ts';
import { GATE, type CheckDeps, type Routed, type CheckOnlyInput, type CheckOnlyOutcome, type CheckEntry } from '#types/modules/checks';
import type { LedgerEntry, LockedLedger, NoteDeps, TaskDir } from '#types/modules/evidence';
import type { RouteView } from '#types/harness';
const CHECK_LIMIT = 5;
const TAIL_LINES = 40;

const badArgument = (message: string, field: string): AmbicodeError => new AmbicodeError('bad-argument', message, { field });

const unauthorized = (key: string, reason: string): AmbicodeError =>
  new AmbicodeError('check-only-unauthorized', `${key} was not run: ${reason}.`, { details: ["Release: configure the check's policy, or run it inside /ambicode:task."] });

/** The open route the call speaks for; `session: null` while the slug has one refuses (07-K5). */
export async function routedOf(deps: CheckDeps, task: string): Promise<Routed | null> {
  const dir = await resolveTaskDir(deps.runtime, task);
  if (deps.session === null) {
    if (liveHeads(await deps.context!.entries(task)).length > 0) {
      throw new AmbicodeError('session-unbound', `Task ${task}: this call has no route owner, so the CLI cannot tell whose route it speaks for.`, {
        details: ['Pass --task <slug> of a task with exactly one live route.'],
      });
    }
    return null;
  }
  const view = await deps.context!.open(task, deps.session);
  return view === null ? null : { view, dir };
}

export const withLedger = <T>(deps: NoteDeps, dir: TaskDir, body: (ledger: LockedLedger) => Promise<T>): Promise<T> =>
  withLedgerLock(deps.runtime.fs, dir.root, () => deps.runtime.clock.now(), deps.session ?? deps.runtime.ids.writerId(), body);

/** Commands run in the project root; a repository-relative path names the same file from there. */
export const projectRelative = (project: ProjectConfig, file: string): string => {
  const root = normalizeRelative(project.root);
  const relative = normalizeRelative(file);
  return root === '' || root === '.' || !relative.startsWith(`${root}/`) ? relative : relative.slice(root.length + 1);
};

const stepOf = (view: RouteView): string => (view.position === 'complete' ? 'complete' : view.position);

const keyOf = (entry: LedgerEntry): readonly unknown[] => {
  const keys = (entry['values'] as { key?: unknown } | undefined)?.key;
  return Array.isArray(keys) ? keys : [];
};

/**
 * One consent check and one `declined` writer for a `propose` key (07-K2 … 07-K4): honoured runs; a bound or typed
 * decline declines; otherwise a typed `--approve` records `acting-needs-human` and the gate is raised again.
 */
export async function consentForKey(
  deps: CheckDeps,
  routed: Routed,
  input: { key: string; files: readonly string[]; approve: readonly string[]; decline: readonly string[]; raisedBy?: string; raise?: boolean },
): Promise<'honoured' | 'declined' | 'waiting'> {
  const { view, dir } = routed;
  const consent = await deps.context!.consent(view, GATE, { key: input.key });
  if (consent.state === 'honoured') return 'honoured';
  const source = consent.source;
  const prints = (await deps.context!.entries(view.task)).filter((entry) => entry.kind === 'gate' && entry['gate'] === GATE && view.chainIds.includes(String(entry['route'])));
  const forKey = prints.filter((entry) => keyOf(entry).includes(input.key));
  const boundDecline = source !== null && (source.kind === 'declined' || source.kind === 'default-taken') && source['reason'] !== 'acting-needs-human'
    && (forKey.some((print) => print.id === source['instance']) || source['key'] === input.key);
  return withLedger(deps, dir, async (ledger) => {
    const instance = forKey.at(-1)?.id ?? null;
    if (boundDecline) {
      // A typed --approve is recorded even when the key's question was already declined (headless default).
      if (input.approve.includes(input.key)) await ledger.append({ kind: 'declined', route: view.routeId, gate: GATE, instance, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: input.key });
      return 'declined' as const;
    }
    if (input.decline.includes(input.key)) {
      await ledger.append({ kind: 'declined', route: view.routeId, gate: GATE, instance, answer: 'decline', via: 'flag', key: input.key });
      return 'declined' as const;
    }
    if (input.approve.includes(input.key)) {
      await ledger.append({ kind: 'declined', route: view.routeId, gate: GATE, instance, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: input.key });
    }
    if (input.raise !== false) await deps.context!.raise(ledger, view, { gate: GATE, values: { key: [input.key], files: [...input.files] }, raisedBy: input.raisedBy ?? stepOf(view) });
    return 'waiting' as const;
  });
}

/** `forbid` and undeclared refuse with a `check-forbidden` limit in route mode; standalone `propose` refuses (07-K1, 07-K5). */
export async function authorizeKey(
  deps: CheckDeps,
  routed: Routed | null,
  input: { policy: ResolvedPolicy; commandId: string; key: string; files: readonly string[]; approve: readonly string[]; decline: readonly string[] },
): Promise<'allowed' | 'declined' | 'waiting'> {
  const authorization = authorizeCommand({ policy: input.policy, commandId: input.commandId, approvalKey: input.key, approvals: new Set() });
  if (authorization.kind === 'allowed') return 'allowed';
  if (authorization.kind === 'refused') {
    if (routed !== null) {
      await withLedger(deps, routed.dir, (ledger) => ledger.append({ kind: 'limit', route: routed.view.routeId, which: 'check-forbidden', count: 1, step: stepOf(routed.view), key: input.key }));
    }
    throw unauthorized(input.key, authorization.reason);
  }
  if (routed === null) throw unauthorized(input.key, `${authorization.reason}, and no route on this task can carry the user's answer`);
  const consent = await consentForKey(deps, routed, input);
  return consent === 'honoured' ? 'allowed' : consent;
}

async function limitReached(deps: CheckDeps, routed: Routed, phase: string): Promise<boolean> {
  const { view } = routed;
  const window = cycleEntries(await deps.context!.window(view, stepOf(view)));
  const runs = window.filter((entry) => entry.kind === 'check' && entry['phase'] === phase).length;
  if (runs < CHECK_LIMIT) return false;
  if (!window.some((entry) => entry.kind === 'limit' && entry['which'] === 'check')) {
    await withLedger(deps, routed.dir, (ledger) => ledger.append({ kind: 'limit', route: view.routeId, which: 'check', count: CHECK_LIMIT, step: stepOf(view) }));
  }
  return true;
}

export async function runCheckOnly(deps: CheckDeps, input: CheckOnlyInput): Promise<CheckOnlyOutcome> {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(input.key);
  if (match === null) throw badArgument(`"check" takes one key <projectId>/<checkId>; got "${input.key}".`, 'key');
  if (input.only.length === 0) throw badArgument('"check" needs at least one --only <file>.', 'only');
  if (input.phase !== 'red' && input.phase !== 'green') throw badArgument('"check" needs --phase red|green.', 'phase');
  const [, projectId, checkId] = match as unknown as [string, string, string];

  const workspace = await openWorkspace(deps.runtime);
  const project = projectById(workspace.config, projectId);
  const check = project.checks[checkId];
  if (check === undefined || check === null) {
    const runnable = Object.keys(project.checks).filter((id) => project.checks[id] !== null).sort().join(', ') || 'none';
    if (check === null) throw badArgument(`Project "${projectId}" check "${checkId}" is configured without a command, so it cannot run; runnable: ${runnable}.`, 'key');
    throw badArgument(`Project "${projectId}" has no check "${checkId}"; configured: ${runnable}.`, 'key');
  }

  const routed = await routedOf(deps, input.task);
  if (routed !== null && (await limitReached(deps, routed, input.phase))) {
    throw new AmbicodeError('check-limit', `${CHECK_LIMIT} ${input.phase} checks already ran in this step; nothing was run.`, {
      details: [`Release: state the gap in the report; $A route next --task ${input.task}`],
    });
  }

  const key = checkApprovalKey(projectId, checkId);
  const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: input.only });
  const decision = await authorizeKey(deps, routed, { policy, commandId: check.command, key, files: input.only, approve: input.approve, decline: input.decline });
  if (decision === 'waiting') return { outcome: 'waiting', gate: GATE, key };
  if (decision === 'declined') return { outcome: 'declined', key };

  const dir = routed?.dir ?? (await resolveTaskDir(deps.runtime, input.task));
  const { results } = await runChecks({
    fs: deps.runtime.fs, config: workspace.config, project, policy, changed: [], repositoryRoot: workspace.repositoryRoot,
    runner: deps.runtime.runner, clock: deps.runtime.clock, approvals: new Set([key]), declines: new Set(), reviewDirectory: dir.root,
    enumerationRevision: null, git: workspace.git, watchedPaths: input.only, revisionNote: null, only: { checkId, files: input.only.map((file) => projectRelative(project, file)) },
  });
  const result = results[0];
  const step = routed === null ? null : stepOf(routed.view);
  const route = routed === null ? {} : { route: routed.view.routeId };
  const unproven = (which: string, cause: string) =>
    routed === null ? Promise.resolve() : withLedger(deps, dir, (ledger) => ledger.append({ kind: 'limit', ...route, which, count: 1, step, cause }).then(() => undefined));

  if (result === undefined || result.exitCode === null) {
    await unproven(`${input.phase}-unproven`, 'not-run');
    return { outcome: 'not-run', status: result?.status === 'timed-out' ? 'timeout' : 'spawn-failed', detail: result?.limitations[0] ?? 'the check did not run' };
  }

  const output = result.outputRef === null ? '' : await deps.runtime.fs.readText(path.join(dir.root, result.outputRef)).catch(() => '');
  const entry = await withLedger(deps, dir, (ledger) => ledger.append({
    kind: 'check', ...route, key, argv: result.argv, only: input.only, exit: result.exitCode, phase: input.phase,
    summary: null, tail: tailOf(output), ms: result.durationMs ?? 0,
    ...(result.mutations.length === 0 ? {} : { mutations: result.mutations }), ...(deps.session === null ? {} : { session: deps.session }),
  })) as CheckEntry;
  // Red is exit != 0 and green is exit 0; the other combination is recorded as a gap, never as proof.
  const cause = input.phase === 'red' ? (result.exitCode === 0 ? 'no-failure' : null) : (result.exitCode === 0 ? null : 'nonzero-exit');
  if (cause !== null) await unproven(`${input.phase}-unproven`, cause);
  return { outcome: 'ran', entry, proof: cause === null ? { proven: true } : { proven: false, cause } };
}

/** The last 40 lines of stdout then stderr, the part a runner prints its verdict and failures in. */
const tailOf = (output: string): string => output.trimEnd().split('\n').slice(-TAIL_LINES).join('\n');
