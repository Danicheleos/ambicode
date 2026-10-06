import { openRepository, type Runtime } from '../composition/root.ts';
import { buildProposal, writeConfig } from '../config/proposal.ts';
import type { SetPair } from '../config/init-sets.ts';

/** Test setup stands in for a user who wrote a config; it never ships. */
export async function initConfig(runtime: Runtime, overrides: readonly SetPair[] = []) {
  const { repositoryRoot } = await openRepository(runtime);
  const proposal = await buildProposal(runtime, repositoryRoot, overrides);
  const written = await writeConfig(runtime.fs, repositoryRoot, proposal, overrides);
  return { configPath: proposal.configPath, ...written };
}
