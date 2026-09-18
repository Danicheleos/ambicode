// Bundles the helper sources into one distributable entry point under scripts/.
// Bundling (rather than shipping tsc output plus node_modules) keeps the
// installed plugin runnable without an install step inside a product repository.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm(new URL('./scripts/ambicode.mjs', import.meta.url), { force: true });

await build({
  entryPoints: ['src/cli/main.ts'],
  outfile: 'scripts/ambicode.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: false,
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
