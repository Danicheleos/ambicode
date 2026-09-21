import type { Workspace } from '../composition/root.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import type { ProvenanceEntry } from '../contracts/requirements.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Pack/prompt and configuration provenance, shared by `review`/`bundle` and
 * `ambicode prepare` (doc 04 P2.2 correction D) so the two do not each derive
 * their own answer to "what produced this policy" from `ResolvedPolicy`.
 */
export function policyProvenance(policies: readonly { policy: ResolvedPolicy }[]): ProvenanceEntry[] {
  const entries = new Map<string, ProvenanceEntry>();
  for (const { policy } of policies) {
    for (const pack of policy.packs) {
      entries.set(pack.reference, { kind: 'pack', reference: pack.reference, contentHash: pack.contentHash });
    }
    for (const prompt of policy.prompts) {
      const reference = `${prompt.packReference}:${prompt.declaredPath}@${prompt.stage}`;
      entries.set(reference, { kind: 'prompt', reference, contentHash: prompt.contentHash });
    }
  }
  return [...entries.values()].sort((a, b) => a.reference.localeCompare(b.reference));
}

export async function configProvenance(fs: FileSystem, workspace: Workspace): Promise<ProvenanceEntry[]> {
  try {
    return [
      {
        kind: 'config',
        reference: '.ambicode/config.yaml',
        contentHash: contentHash(await fs.readText(workspace.configPath)),
      },
    ];
  } catch {
    return [];
  }
}
