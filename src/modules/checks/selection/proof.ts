import type { RunnerSummary } from '../types/selection.ts';

type ProofCause = 'no-summary' | 'zero-tests' | 'load-error' | 'no-failure' | 'nonzero-exit';

type ProofVerdict =
  | { proven: true }
  | { proven: false; which: 'red-unproven' | 'green-unproven'; cause: ProofCause };

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
