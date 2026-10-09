import { openRepository } from '#platform/git/open';
import { buildProposal, writeConfig } from '#modules/config/init/proposal';
import { ProposalInput, type SetPair } from '#types/modules/config';
import type { Runtime } from '#types/composition';

/** What the model would propose for a bare TypeScript repository: one root project, every command null. */
export const FIXTURE_PROPOSAL = ProposalInput.parse({
  projects: [{ id: 'app', root: '.', ecosystem: 'typescript', shortlist: ['**/*.ts'], packs: ['builtin/common-quality', 'builtin/common-checks'] }],
});

/** Test setup stands in for a user who wrote a config; it never ships. */
export async function initConfig(runtime: Runtime, overrides: readonly SetPair[] = [], input: ProposalInput = FIXTURE_PROPOSAL) {
  const { repositoryRoot } = await openRepository(runtime);
  const proposal = await buildProposal(runtime, repositoryRoot, input, overrides);
  const written = await writeConfig(runtime.fs, repositoryRoot, proposal, overrides);
  return { configPath: proposal.configPath, ...written };
}
