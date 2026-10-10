import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { cycleEntries, liveHeads } from '#modules/evidence/ledger-chain';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { normalizeRelative } from '#util/paths';
import { authorizeCommand, checkApprovalKey } from '../selection/authorize.ts';
import { runOne, shellQuote } from './run.ts';
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

/** `{file}` becomes the quoted files, space-joined: one run, one exit, one ledger entry for the whole selection. */
export const commandFor = (template: string, files: readonly string[]): string => template.replaceAll('{file}', files.map(shellQuote).join(' '));

export async function runCheckOnly(deps: CheckDeps, input: CheckOnlyInput): Promise<CheckOnlyOutcome> {
  if (input.phase !== 'red' && input.phase !== 'green') throw badArgument('"check" needs --phase red|green.', 'phase');

  const workspace = await openWorkspace(deps.runtime);
  const project = projectForRequest(workspace.config, input.project, input.files);
  const spec = project.checks[input.name];
  const runnable = Object.keys(project.checks).filter((id) => project.checks[id]!.all !== null || project.checks[id]!.file !== null).sort().join(', ') || 'none';
  if (spec === undefined) throw badArgument(`Project "${project.id}" has no check "${input.name}"; configured: ${runnable}.`, 'name');
  const template = input.files.length > 0 ? spec.file : spec.all;
  if (template === null) {
    throw badArgument(`Project "${project.id}" check "${input.name}" has no ${input.files.length > 0 ? '`file`' : '`all`'} command, so it cannot run${input.files.length > 0 ? ' on --file' : ' without --file'}.`, input.files.length > 0 ? 'file' : 'name');
  }
  const routed = await routedOf(deps, input.task);
  if (routed !== null && (await limitReached(deps, routed, input.phase))) {
    throw new AmbicodeError('check-limit', `${CHECK_LIMIT} ${input.phase} checks already ran in this step; nothing was run.`, {
      details: [`Release: state the gap in the report; $A route next --task ${input.task}`],
    });
  }

  // The pack's commandPolicy names the check by its config name (`unit`, `e2e`), so the check name is the command id.
  const key = checkApprovalKey(project.id, input.name);
  const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: input.files });
  const decision = await authorizeKey(deps, routed, { policy, commandId: input.name, key, files: input.files, approve: input.approve, decline: input.decline });
  if (decision === 'waiting') return { outcome: 'waiting', gate: GATE, key };
  if (decision === 'declined') return { outcome: 'declined', key };

  const dir = routed?.dir ?? (await resolveTaskDir(deps.runtime, input.task));
  const result = await runOne({
    runner: deps.runtime.runner, clock: deps.runtime.clock, repositoryRoot: workspace.repositoryRoot, project, policy, commandId: input.name, key,
    command: commandFor(template, input.files.map((file) => projectRelative(project, file))), timeoutSeconds: workspace.config.skills.task.checkTimeoutSeconds,
  });
  const step = routed === null ? null : stepOf(routed.view);
  const route = routed === null ? {} : { route: routed.view.routeId };
  const unproven = (which: string, cause: string) =>
    routed === null ? Promise.resolve() : withLedger(deps, dir, (ledger) => ledger.append({ kind: 'limit', ...route, which, count: 1, step, cause }).then(() => undefined));

  if (result.exitCode === null) {
    await unproven(`${input.phase}-unproven`, 'not-run');
    return { outcome: 'not-run', status: result.status === 'timed-out' ? 'timeout' : 'spawn-failed', detail: result.detail ?? 'the check did not run' };
  }

  const entry = await withLedger(deps, dir, (ledger) => ledger.append({
    kind: 'check', ...route, key, files: input.files, exit: result.exitCode, phase: input.phase,
    tail: tailOf(result.output), ms: result.ms, ...(deps.session === null ? {} : { session: deps.session }),
  })) as CheckEntry;
  // Red is exit != 0 and green is exit 0; the other combination is recorded as a gap, never as proof.
  const cause = input.phase === 'red' ? (result.exitCode === 0 ? 'no-failure' : null) : (result.exitCode === 0 ? null : 'nonzero-exit');
  if (cause !== null) await unproven(`${input.phase}-unproven`, cause);
  return { outcome: 'ran', entry, proof: cause === null ? { proven: true } : { proven: false, cause } };
}

/** The last 40 lines of stdout then stderr, the part a runner prints its verdict and failures in. */
const tailOf = (output: string): string => output.trimEnd().split('\n').slice(-TAIL_LINES).join('\n');
