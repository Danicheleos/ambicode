import { baselineIn, touchedSet } from '#modules/checks/workspace/baseline';
import { buildChain, delegatedStepOf } from '#harness/engine/fold';
import { HOOK_LIMIT } from '#harness/engine/execute';
import { IMPLEMENTER_AGENT_TYPE } from '#skills/task/commands';
import { readLedger } from '#platform/ledger/ledger';
import { dirKindFor } from '#types/defaults';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { messageOf } from '#util/errors';
import { agentReturn } from './agent-return.ts';
import type { HookInput, HookDeps } from '#types/hook';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';

// A touched list past this many paths would crowd the next step out of the hook's cap.
const LISTED = 40;
// The engine releases a delegated step on its third return without a green check (missing-produces).
const ATTEMPTS = 3;
const BACKGROUND = 'The implementer runs in the background: wait for its result, then run `route next` (no hook fires when a background agent finishes).';
const GATE_MARKER = /\[ambicode gate \S+ \S+\]/;

/** The paths that fit `room` characters after the count, or '' when not even the count does; the step text never gives way to them. A string is why the files are unknown. */
function touchedLine(touched: readonly string[] | string, room: number): string {
  if (typeof touched === 'string') return `Touched files: unknown (${touched}).`;
  if (touched.length === 0) return 'Touched files: none.';
  const head = `Touched files (${touched.length}): `;
  const shown: string[] = [];
  for (const file of touched.slice(0, LISTED)) {
    if (head.length + [...shown, file].join(', ').length + 3 > room) break;
    shown.push(file);
  }
  const line = shown.length === 0 ? `Touched files: ${touched.length}, not listed.` : `${head}${shown.join(', ')}${shown.length < touched.length ? ', …' : ''}.`;
  return line.length <= room ? line : '';
}

/** The count of returns without green, and the limit that released the step, since its launch. */
function sinceLaunch(entries: readonly LedgerEntry[], step: string): { repeats: number; released: string | null } {
  const launch = entries.findLastIndex((entry) => entry.kind === 'step' && entry['step'] === step && entry['status'] === 'delivered');
  const window = entries.slice(Math.max(launch, 0));
  // A `<phase>-unproven` limit only reports a failing run; these two are what release the step.
  const limit = window.find((entry) => entry.kind === 'limit' && entry['step'] === step && (entry['which'] === 'missing-produces' || entry['which'] === 'check'));
  return { repeats: window.filter((entry) => entry.kind === 'step' && entry['step'] === step && entry['status'] === 'repeated').length, released: limit === undefined ? null : String(limit['which']) };
}

/**
 * PostToolUse on Agent: the implementer returned. Its `check` recorded the green run without advancing, so the
 * route advances here and the main session gets the touched files and the step that follows (format, gate, ...).
 * Null means this call is not the answer to a delegated step.
 */
export async function implementerReturned(runtime: Runtime, input: HookInput, deps: HookDeps): Promise<string | null> {
  const call = await agentReturn(runtime, input, deps, { type: IMPLEMENTER_AGENT_TYPE, statuses: ['completed', 'async_launched'] });
  if (call === null) return null;
  const { repositoryRoot, active } = call;
  const { engine, routes } = await deps.load(repositoryRoot);
  const def = routes.route(active.skill);
  const head = call.entries.find((entry) => entry.kind === 'route' && entry.id === active.routeId);
  if (def === null || head === undefined) return null;
  const entries = buildChain(call.entries, head).entries;
  const delegating = new Set(def.steps.filter((step) => step.work !== null).map((step) => step.id));
  const launched = delegatedStepOf(def, buildChain(call.entries, head));
  if (call.status === 'async_launched') return launched === null ? null : BACKGROUND;
  const scratch = input.scratchpad_dir === undefined ? {} : { scratchpadDir: input.scratchpad_dir };
  if (launched === null) {
    // The subagent advanced the route itself: the main session never saw the step it stands at.
    const launch = entries.findLastIndex((entry) => entry.kind === 'step' && delegating.has(String(entry['step'])) && entry['status'] === 'delivered');
    // Only a step after the launch that the hook itself advanced into says it already answered; the hook's own repeats of the delegated step are earlier returns.
    if (launch < 0 || entries.slice(launch).some((entry) => entry.kind === 'step' && !delegating.has(String(entry['step'])) && entry['cause'] === 'implementer-hook')) return null;
    return `[ambicode] The implementer returned and the route had already moved on.\n\n${(await engine.deliver(active.task, active.owner, input.scratchpad_dir))?.text ?? ''}`.trimEnd();
  }

  let next;
  try {
    next = await engine.advance({ task: active.task, session: active.owner, cause: 'implementer-hook', ...scratch });
  } catch (error) {
    return `[ambicode] The implementer returned, but the current step could not be read (${messageOf(error)}). Run \`node "${runtime.pluginRoot}/scripts/ambicode.mjs" route next --task ${active.task}\`.`;
  }
  const after = buildChain(await readLedger(runtime.fs, taskDirFor(repositoryRoot, active.task, '.', dirKindFor(active.skill)).root), head).entries;
  const { repeats, released } = sinceLaunch(after, launched.id);
  // A gate open at the delegated step itself is the implementer's own stop (a check awaiting approval); later gates are the route's next question.
  const raised = delegating.has(next.position) && GATE_MARKER.test(next.text);
  const lead = raised
    ? "The implementer stopped for the user's approval: ask the user first."
    : released !== null
      ? `The implementer returned, but green was never reached: ${released === 'check' ? 'the check limit' : `${ATTEMPTS} returns without a green check`} released step ${launched.id}; the report lists it under Not verified.`
      : delegating.has(next.position)
        ? `The implementer returned without a green check (attempt ${repeats} of ${ATTEMPTS}).`
        : 'The implementer returned.';
  const relaunch = !raised && released === null && delegating.has(next.position) ? ' Launch `ambicode:implementer` again with the same work file.' : '';
  const baseline = baselineIn(entries);
  let touched: readonly string[] | string = 'no baseline on record';
  if (baseline !== null) {
    try {
      touched = (await touchedSet({ ...runtime, cwd: repositoryRoot }, baseline, { strict: true })).touched;
    } catch {
      touched = 'git failed';
    }
  }
  const frame = (files: string): string => `[ambicode] ${lead}${raised || files === '' ? '' : ` ${files}`}${relaunch}\n\n${next.text}`;
  const framed = frame(touchedLine(touched, HOOK_LIMIT - frame('').length));
  // A step text near the cap leaves no room for our own lines; the text is what the model must act on, so it goes out alone.
  return framed.length <= HOOK_LIMIT ? framed : next.text;
}
