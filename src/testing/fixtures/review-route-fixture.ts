import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Finding, ReviewResult } from '#types/modules/review';
import { skillHandlers } from '#skills/handlers';
import { appendLedger } from '#platform/ledger/ledger';
import { checkFixture, CHECK_CONFIG, CHECK_TASK, startedPage } from './check-fixture.ts';
import { reviewResult } from './review-fixture.ts';
import { ORDERS } from './task-fixture.ts';
import { REPO_ROOT } from '../paths.ts';

export type RequirementRows = Pick<ReviewResult, 'requirements' | 'requirementCoverage'>;
import type { LedgerEntry } from '#types/modules/evidence';
import type { ProcessRequest } from '#types/platform/ports';
import type { AdvanceInput, StartInput, StepMessage, Handler } from '#types/harness';
import { SESSION_A } from './ids.ts';

const STEPS = ['review/fetch', 'review/readback', 'review/agent', 'review/agent-work'];

/** The shipped review route with its step texts and the real handlers, on an uncommitted change to `src/orders.ts`. */
/** `refuse` adds a 10-line change to docs/notes.md under a 5-line limit, so the estimate asks (narrow or skip) and `--exclude 'docs/**'` clears it; without it the route goes straight on to the reviewer. */
export async function reviewRouteFixture(options: { config?: string; pack?: string; dirty?: boolean; refuse?: boolean; handlers?: Record<string, Handler> } = {}) {
  const step: Record<string, string> = {};
  for (const name of STEPS) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  const review = await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8');
  const { dirty, handlers, refuse, ...rest } = options;
  const base = await checkFixture({ routes: { review }, handlers: { ...skillHandlers(), ...(handlers ?? {}) }, step, ...rest, ...(refuse === true ? { config: (rest.config ?? CHECK_CONFIG).replace('maxChangedLines: 2000', 'maxChangedLines: 5') } : {}) });
  const { fx } = base;
  const pages: ProcessRequest[] = [];
  const real = fx.runtime.runner;
  fx.runtime.runner = { run: async (request) => (request.detached === true ? (pages.push(request), startedPage()) : real.run(request)) };
  await fx.repo.write('src/orders.ts', ORDERS);
  if (refuse === true) await fx.repo.write('docs/notes.md', 'old\n');
  await fx.repo.commitAll('orders');
  if (refuse === true) await fx.repo.write('docs/notes.md', Array.from({ length: 10 }, (_, at) => `new ${at}\n`).join(''));
  if (dirty !== false) await fx.repo.write('src/orders.ts', ORDERS.replace('a + b)', 'a + b, 0)'));
  const dir = path.join(fx.repo.root, '.ambicode', 'reviews', CHECK_TASK);
  let reviews = 0;

  const start = (input: Partial<StartInput> = {}): Promise<StepMessage> =>
    fx.engine.start({ skill: 'review', text: 'review my change', requirements: [], task: CHECK_TASK, cwd: fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<AdvanceInput> = {}): Promise<StepMessage> =>
    fx.engine.advance({ task: CHECK_TASK, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const hook = async (gate: string, option: string): Promise<StepMessage> => {
    const print = (await fx.kinds(CHECK_TASK, 'gate')).findLast((entry) => entry['gate'] === gate);
    return next({ cause: 'gate-hook', answers: [{ gate, option, ...(print === undefined ? {} : { instance: print.id }) }] });
  };
  const routeId = async (): Promise<string> => (await fx.kinds(CHECK_TASK, 'route')).at(-1)!.id;
  const append = async (fields: Record<string, unknown> & { kind: string }): Promise<LedgerEntry> =>
    (await appendLedger(fx.runtime.fs, dir, fx.runtime.clock.now(), 'test-writer', { route: await routeId(), session: SESSION_A, ...fields })).entry;
  /** What the pin step leaves: the result file and the `review` entry, then the tail. */
  const synthetic = async (findings: Finding[], extra: { stage?: 'pending' | 'recorded'; requirements?: RequirementRows } = {}): Promise<StepMessage> => {
    const stage = extra.stage ?? 'recorded';
    reviews += 1;
    // The recorded entry answers the pin's pending one, as the route's record step does; another id would leave that review pending for review.record to fail.
    const reviewId = String((await fx.kinds(CHECK_TASK, 'review')).findLast((entry) => entry['stage'] === 'pending')?.['reviewId'] ?? `r-${reviews}`);
    const bundle = path.join('.ambicode', 'reviews', CHECK_TASK, String(reviews));
    const result = path.join(bundle, 'result.json');
    await fx.repo.write(path.join(bundle, 'changed.diff'), 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1 +1 @@\n-a\n+b\n');
    await fx.repo.write(result, JSON.stringify({ ...reviewResult({ kind: 'working', findings }), ...extra.requirements, reviewId, brief: path.join(bundle, 'brief.md') }));
    const entry = await append({ kind: 'review', reviewId, result, status: 'partial', stage, reviewerRan: stage === 'recorded', findings: findings.length });
    return next({ cause: 'route-next', produced: [entry.id] });
  };
  /** The first review's bundle folder. */
  const bundle = path.join(dir, '1');
  return { ...base, pages, dir, bundle, start, next, hook, append, synthetic, ledger: () => fx.ledger(CHECK_TASK), kinds: (kind: string) => fx.kinds(CHECK_TASK, kind) };
}
