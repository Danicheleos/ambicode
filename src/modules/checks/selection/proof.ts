import type { RunnerSummary } from '../types/selection.ts';
import type { ProofCause, ProofVerdict } from '#types/modules/checks';

export function classifyProof(
  phase: 'red' | 'green',
  exit: number,
  summary: RunnerSummary | null,
): ProofVerdict {
  const proven =
    summary !== null && (phase === 'red' ? summary.failed >= 1 : exit === 0 && summary.ran >= 1);
  if (proven) return { proven: true };
  const which = phase === 'red' ? 'red-unproven' : 'green-unproven';
  const cause = ((): ProofCause => {
    if (summary === null) return 'no-summary';
    if (summary.loadErrors >= 1 && summary.failed === 0) return 'load-error';
    if (summary.ran === 0) return 'zero-tests';
    return phase === 'red' ? 'no-failure' : 'nonzero-exit';
  })();
  return { proven: false, which, cause };
}
