import path from 'node:path';
import type { HandlerInput } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';

/**
 * The two paths the model gives the reviewer subagent. Null once the answer is recorded: a recorded review has
 * nothing left to hand to a reviewer, and printing the paths again would invite a second, unauthorized run.
 */
export async function agentPayload(input: HandlerInput, review: LedgerEntry): Promise<string | null> {
  if (review['stage'] !== 'pending' || typeof review['result'] !== 'string') return null;
  const resultPath = path.join(input.dir.repositoryRoot, review['result']);
  const read = async (file: string): Promise<string | null> => input.runtime.fs.readText(file).catch(() => null);
  const snapshot = (await read(path.join(path.dirname(resultPath), 'snapshot-path.txt')))?.trim();
  const text = await read(resultPath);
  const brief = text === null ? undefined : (JSON.parse(text) as { brief?: string | null }).brief;
  if (snapshot === undefined || typeof brief !== 'string') return null;
  return `snapshot: ${snapshot}\nbrief: ${path.join(input.dir.repositoryRoot, brief)}`;
}
