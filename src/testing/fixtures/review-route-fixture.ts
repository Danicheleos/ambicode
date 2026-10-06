import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Finding } from '#types/modules/review';
import { skillHandlers } from '#skills/handlers';
import { appendLedger } from '#platform/ledger/ledger';
import { checkFixture, COMMAND_PACK, CHECK_TASK } from './check-fixture.ts';
import { reviewResult } from './review-fixture.ts';
import { ORDERS } from './task-fixture.ts';
import { REPO_ROOT } from '../paths.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { AdvanceInput, StartInput, StepMessage, Handler } from '#types/harness';
import { SESSION_A } from './ids.ts';

const STEPS = ['review/fetch', 'review/readback', 'review/view'];

export const PROPOSED = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: propose, reason: "ask" }');

/** The shipped review route with its step texts and the real handlers, on an uncommitted change to `src/orders.ts`. */
export async function reviewRouteFixture(options: { config?: string; pack?: string; dirty?: boolean; handlers?: Record<string, Handler> } = {}) {
  const step: Record<string, string> = {};
  for (const name of STEPS) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  const review = await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8');
  const { dirty, handlers, ...rest } = options;
  const base = await checkFixture({ routes: { review }, handlers: { ...skillHandlers(), ...(handlers ?? {}) }, step, ...rest });
  const { fx } = base;
  await fx.repo.write('src/orders.ts', ORDERS);
  await fx.repo.commitAll('orders');
  if (dirty !== false) await fx.repo.write('src/orders.ts', ORDERS.replace('a + b)', 'a + b, 0)'));
  const dir = path.join(fx.repo.root, '.ambicode', 'task', CHECK_TASK);
  let reviews = 0;

  const start = (input: Partial<StartInput> = {}): Promise<StepMessage> =>
    fx.engine.start({ skill: 'review', text: 'review my change', requirements: [], task: CHECK_TASK, cwd: fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<AdvanceInput> = {}): Promise<StepMessage> =>
    fx.engine.advance({ task: CHECK_TASK, session: SESSION_A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const hook = async (gate: string, option: string): Promise<StepMessage> => {
    const print = (await fx.kinds(CHECK_TASK, 'gate')).findLast((entry) => entry['gate'] === gate);
    return next({ cause: 'gate-hook', answers: [{ gate, option, ...(print === undefined ? {} : { instance: print.id }) }] });
  };
  const routeId = async (): Promise<string> => (await fx.kinds(CHECK_TASK, 'route')).at(-1)!.id;
  const append = async (fields: Record<string, unknown> & { kind: string }): Promise<LedgerEntry> =>
    (await appendLedger(fx.runtime.fs, dir, fx.runtime.clock.now(), 'test-writer', { route: await routeId(), session: SESSION_A, ...fields })).entry;
  /** What `review --task` leaves: the result file and the `review` entry, then the tail. */
  const synthetic = async (findings: Finding[], extra: { waiting?: string[] } = {}): Promise<StepMessage> => {
    reviews += 1;
    const reviewId = `r-${reviews}`;
    const result = path.join('.ambicode', 'task', CHECK_TASK, 'reviews', reviewId, 'result.json');
    await fx.repo.write(result, JSON.stringify({ ...reviewResult({ kind: 'working', findings }), reviewId }));
    const entry = await append({ kind: 'review', reviewId, result, status: 'partial', reviewerRan: true, findings: findings.length, waiting: extra.waiting ?? [] });
    return next({ cause: 'review', produced: [entry.id] });
  };
  return { ...base, dir, start, next, hook, append, synthetic, ledger: () => fx.ledger(CHECK_TASK), kinds: (kind: string) => fx.kinds(CHECK_TASK, kind) };
}
