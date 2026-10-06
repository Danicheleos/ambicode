import { openRepository } from '#platform/git/open';
import { buildProposal, writeConfig } from '#modules/config/init/proposal';
import type { Runtime } from '#types/composition';
import type { SetPair } from '#types/modules/config';

/** Test setup stands in for a user who wrote a config; it never ships. */
export async function initConfig(runtime: Runtime, overrides: readonly SetPair[] = []) {
  const { repositoryRoot } = await openRepository(runtime);
  const proposal = await buildProposal(runtime, repositoryRoot, overrides);
  const written = await writeConfig(runtime.fs, repositoryRoot, proposal, overrides);
  return { configPath: proposal.configPath, ...written };
}
