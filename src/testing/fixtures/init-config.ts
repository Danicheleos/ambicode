import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { CONFIG_HEAD } from './route-fixture.ts';
import type { Runtime } from '#types/composition';

/** A bare TypeScript repository: one root project with the common packs and every check unconfigured. */
export const FIXTURE_CONFIG = [
  CONFIG_HEAD,
  '  - id: app',
  '    root: .',
  '    paths: [src/]',
  '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
  '    include: ["**/*.ts"]',
  '    exclude: ["**/*.{spec,test,cy,stories}.*", "**/*.d.ts"]',
  '    packs: [builtin/common-quality, builtin/common-checks]',
  '    commands: {}',
  '    checks: { lint: { all: null, file: null }, unit: { all: null, file: null }, typecheck: { all: null, file: null }, e2e: { all: null, file: null } }',
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
