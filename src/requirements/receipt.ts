import type { RequirementSource } from '../contracts/requirements.ts';

/**
 * One wording for every place a source's timing is printed. `retrievedAt` is shown only when
 * the session supplied it, and a result stored before `receivedAt` existed prints as it did.
 */
export function describeReceipt(
  source: Pick<RequirementSource, 'receivedAt' | 'retrievedAt' | 'retrievedVia'>,
): string {
  const retrieved = source.retrievedAt ?? null;
  if (source.receivedAt === undefined) {
    return retrieved === null ? `via ${source.retrievedVia}` : `retrieved ${retrieved} via ${source.retrievedVia}`;
  }
  const received = `received ${source.receivedAt} by AMBICODE via ${source.retrievedVia}`;
  return retrieved === null ? received : `${received}; retrieved ${retrieved} by the session`;
}
