import path from 'node:path';
import { acceptPlan } from '#modules/evidence/notes';
import { buildChain, reportOf } from '#harness/engine/fold';
import { factsOf } from '#modules/evidence/report/report';
import { chainEntries, failed } from './common.ts';
import type { Handler } from '#types/harness';

/** `evidence.*` adapters over step 02's writers; they take the ledger the engine already holds. */
export const EVIDENCE_HANDLERS: Readonly<Record<string, Handler>> = {
  'evidence.plan.accept': async (input) => {
    const { ledger, runtime, view, context } = input;
    try {
      await acceptPlan({ runtime, session: view.session, context, ledger }, view.task);
      return { state: 'ok', payload: null };
    } catch (error) {
      return failed(error);
    }
  },
  /** The Checks, Review and Not verified facts the final message copies, so the model states them and does not work them out. */
  'evidence.report': async (input) => {
    const chain = await chainEntries(input);
    const read = await input.ledger.read();
    // The head comes from the same read as the entries it is looked up in.
    const head = read.state === 'ok' ? read.entries.find((entry) => entry.kind === 'route' && entry.id === input.view.routeId) : undefined;
    const scope = input.def === undefined || head === undefined || read.state !== 'ok' ? null : reportOf(read.entries, buildChain(read.entries, head), input.def);
    const checks = input.def?.steps.some((step) => step.produces.some((produced) => produced.kind === 'check')) ?? false;
    // Each round's Changed/Gaps list was saved when its implementer stopped; the one that writes the report holds only its own round.
    const rounds = await Promise.all(chain.filter((entry) => entry.kind === 'note' && entry['note'] === 'changed').map((entry) => input.runtime.fs.readText(path.join(input.dir.repositoryRoot, String(entry['path']))).catch(() => '')));
    const changed = rounds.filter((text) => text.trim() !== '');
    const earlier = changed.length === 0 ? '' : `Changed in earlier rounds, oldest first (list them with your own):\n${changed.map((text) => text.trim()).join('\n\n')}\n\n`;
    return { state: 'ok', payload: `${earlier}${scope === null ? factsOf(chain, undefined, { checks }) : factsOf(...scope, { checks })}`.trim() || null };
  },
};
