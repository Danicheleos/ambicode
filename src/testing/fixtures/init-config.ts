import path from 'node:path';
import { openRepository } from '#platform/git/open';
import type { Runtime } from '#types/composition';

/** What the model would propose for a bare TypeScript repository: one root project, every command null. */
export const FIXTURE_CONFIG = [
  'schemaVersion: 3',
  'baseline: ""',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null, onInvalid: void }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'requirements: { mcpServer: null, acceptanceField: null }',
  'guard: { askOutsideMap: false }',
  'projects:',
  '  - id: app',
  '    root: .',
  '    ecosystem: typescript',
  '    packs: [builtin/common-quality, builtin/common-checks]',
  '    shortlist: { include: ["**/*.ts"], exclude: ["**/*.{spec,test,cy,stories}.*", "**/*.d.ts"] }',
  '    commands: { lint: null, unit: null, typecheck: null, e2e: null, format: null }',
  '    checks: { lint: null, unit: null }',
  '',
].join('\n');

/** Test setup stands in for a user who wrote a config; it never ships. */
export async function initConfig(runtime: Runtime, text: string = FIXTURE_CONFIG): Promise<string> {
  const { repositoryRoot } = await openRepository(runtime);
  const file = path.join(repositoryRoot, '.ambicode', 'config.yaml');
  await runtime.fs.mkdirp(path.dirname(file));
  await runtime.fs.writeText(file, text);
  return file;
}
