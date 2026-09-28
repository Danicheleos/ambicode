import type { Workspace } from '../composition/root.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import type { ProvenanceEntry } from '../contracts/requirements.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';

export function policyProvenance(policies: readonly { policy: ResolvedPolicy }[]): ProvenanceEntry[] {
  const entries = new Map<string, ProvenanceEntry>();
  for (const entry of packProvenance(policies)) entries.set(entry.reference, entry);
  for (const { policy } of policies) {
    for (const prompt of policy.prompts) {
      const reference = `${prompt.packReference}:${prompt.declaredPath}@${prompt.stage}`;
      entries.set(reference, { kind: 'prompt', reference, contentHash: prompt.contentHash });
    }
  }
  return [...entries.values()].sort((a, b) => a.reference.localeCompare(b.reference));
}

/**
 * Pack provenance only: `prepare` adds prompt provenance from the stage-filtered
 * prompts it actually delivers.
 */
export function packProvenance(policies: readonly { policy: ResolvedPolicy }[]): ProvenanceEntry[] {
  const entries = new Map<string, ProvenanceEntry>();
  for (const { policy } of policies) {
    for (const pack of policy.packs) {
      entries.set(pack.reference, { kind: 'pack', reference: pack.reference, contentHash: pack.contentHash });
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
