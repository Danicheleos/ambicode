import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '../paths.ts';

/** Replays a `fixtures/definitions.mjs` repository into a throwaway directory; the caller removes `path.dirname(root)`. */
export async function materialized(name: string): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-fixture-')), 'repo');
  const outcome = await new NodeProcessRunner().run({
    argv: ['node', path.join(REPO_ROOT, 'fixtures', 'materialize.mjs'), name, destination],
    cwd: REPO_ROOT,
    timeoutMs: 60_000,
    maxOutputBytes: 262_144,
    env: { kind: 'inherited' },
  });
  if (outcome.exitCode !== 0) throw new Error(outcome.stderr);
  return destination;
}
