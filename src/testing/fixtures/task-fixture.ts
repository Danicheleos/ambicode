import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Finding } from '#types/modules/review';
import { skillHandlers } from '#skills/handlers';
import { appendLedger } from '#platform/ledger/ledger';
import { checkFixture, CHECK_TASK } from './check-fixture.ts';
import { reviewResult } from './review-fixture.ts';
import { REPO_ROOT } from '../paths.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { AdvanceInput, StartInput, StepMessage } from '#types/harness';
import { SESSION_A } from './ids.ts';

const STEPS = ['plan/fetch', 'task/red', 'task/green', 'task/fix', 'task/write', 'task/review', 'review/agent'];

export const ORDERS = 'export function total(amounts: number[]): number {\n  return amounts.reduce((a, b) => a + b);\n}\n';

/** The shipped task route with its step texts and the real handlers, on `checkFixture`'s repository. */
export async function taskFixture(options: { config?: string; pack?: string } = {}) {
  const step: Record<string, string> = {};
  for (const name of STEPS) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  const task = await readFile(path.join(REPO_ROOT, 'routes', 'task', 'task.yaml'), 'utf8');
  const base = await checkFixture({ routes: { task }, handlers: skillHandlers(), step, ...options });
  const { fx } = base;
  await fx.repo.write('src/orders.ts', ORDERS);
  await fx.repo.commitAll('orders');
  const dir = path.join(fx.repo.root, '.ambicode', 'tasks', CHECK_TASK);
  let reviews = 0;

  const start = (input: Partial<StartInput> = {}): Promise<StepMessage> =>
    fx.engine.start({ skill: 'task', text: 'fix `total` for an empty list', requirements: [], task: CHECK_TASK, cwd: fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<AdvanceInput> = {}): Promise<StepMessage> =>
    fx.engine.advance({ task: CHECK_TASK, session: SESSION_A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  /** The user's answer to the latest print of `gate`, as the AskUserQuestion hook records it. */
  const hook = async (gate: string, option: string): Promise<StepMessage> => {
    const print = (await fx.kinds(CHECK_TASK, 'gate')).findLast((entry) => entry['gate'] === gate);
    return next({ cause: 'gate-hook', answers: [{ gate, option, ...(print === undefined ? {} : { instance: print.id }) }] });
  };
  const routeId = async (): Promise<string> => (await fx.kinds(CHECK_TASK, 'route')).at(-1)!.id;
  const append = async (fields: Record<string, unknown> & { kind: string }): Promise<LedgerEntry> =>
    (await appendLedger(fx.runtime.fs, dir, fx.runtime.clock.now(), 'test-writer', { route: await routeId(), session: SESSION_A, ...fields })).entry;

  /** What `check --only` leaves for the tail, then the tail itself. */
  const check = async (phase: 'red' | 'green', _summary: { ran: number; failed: number } | null, exit = phase === 'red' ? 1 : 0): Promise<StepMessage> => {
    const entry = await append({ kind: 'check', key: 'app/unit', files: ['src/a.spec.ts'], exit, phase, ms: 3 });
    return next({ cause: 'check', produced: [entry.id] });
  };
  const format = async (outcome: 'formatted' | 'unconfigured' = 'formatted'): Promise<StepMessage> => {
    const entry = await append({ kind: 'format', key: 'app/format', files: [], exit: outcome === 'formatted' ? 0 : null, via: 'model', outcome });
    return next({ cause: 'format', produced: [entry.id] });
  };
  /** What `review --task` leaves: the result file and the `review` entry, then the tail. */
  const review = async (findings: Finding[], extra: { reviewerRan?: boolean } = {}): Promise<StepMessage> => {
    reviews += 1;
    const reviewId = `r-${reviews}`;
    const result = path.join('.ambicode', 'reviews', CHECK_TASK, 'result.json');
    await fx.repo.write(result, JSON.stringify({ ...reviewResult({ kind: 'working', findings }), reviewId, brief: path.join('.ambicode', 'reviews', CHECK_TASK, 'brief.md') }));
    await fx.repo.write(path.join('.ambicode', 'reviews', CHECK_TASK, 'changed.diff'), 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1 +1 @@\n-a\n+b\n');
    const ran = extra.reviewerRan ?? true;
    const entry = await append({ kind: 'review', reviewId, result, status: 'partial', stage: ran ? 'recorded' : 'pending', reviewerRan: ran, findings: findings.length });
    return next({ cause: ran ? 'review record' : 'review', produced: [entry.id] });
  };
  /** Edits the committed source, so `src/orders.ts` is in the touched set. */
  const edit = (): Promise<void> => fx.repo.write('src/orders.ts', ORDERS.replace('a + b)', 'a + b, 0)'));
  return { ...base, runCheck: base.check, dir, start, next, hook, append, check, format, review, edit, ledger: () => fx.ledger(CHECK_TASK), kinds: (kind: string) => fx.kinds(CHECK_TASK, kind) };
}
