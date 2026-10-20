import { runCheckOnly, FORMAT_CHECK, routedOf } from './check-command.ts';
import { GATE, type CheckDeps } from '#types/modules/checks';
import { isBoundAnswer } from '#modules/evidence/ledger-chain';

/**
 * Runs each check the user approved that has no check entry after the approval. The model asked for it while the route
 * had already moved on, so the answer revises a step that never runs it. Format is run by its own step.
 */
export async function runApprovedChecks(deps: CheckDeps, input: { task: string }): Promise<number> {
  const routed = await routedOf(deps, input.task);
  if (routed === null) return 0;
  const entries = (await deps.context!.entries(input.task)).filter((entry) => routed.view.chainIds.includes(String(entry['route'])));
  let ran = 0;
  for (const [at, answer] of entries.entries()) {
    if (answer.kind !== 'acceptance' || answer['gate'] !== GATE || answer['answer'] !== 'approve' || !isBoundAnswer(answer)) continue;
    const values = entries.find((entry) => entry.kind === 'gate' && entry.id === answer['instance'])?.['values'] as { key?: string[]; files?: string[] } | undefined;
    for (const key of values?.key ?? []) {
      const split = key.lastIndexOf('/');
      const name = key.slice(split + 1);
      if (name === FORMAT_CHECK || entries.slice(at).some((entry) => entry.kind === 'check' && entry['key'] === key)) continue;
      await runCheckOnly(deps, { task: input.task, name, project: key.slice(0, split), files: values?.files ?? [], phase: 'green', approve: [], decline: [], raise: false });
      ran += 1;
    }
  }
  return ran;
}
