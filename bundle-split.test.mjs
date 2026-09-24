// Built-artifact check that the page server stays out of every path but
// `view`. Measured when the split was made: import 157 → 115 ms, the hook
// 170 → 137 ms, `config --json` 221 → 184 ms. One static import of
// `commands/view.ts` from anywhere on those paths undoes all of it silently,
// and no behavioural test would notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts');
const ENTRY = path.join(SCRIPTS, 'ambicode.mjs');

// esbuild names each bundled module in a comment; `legalComments: 'none'`
// does not remove those, and minifying would, which the last test catches.
const FASTIFY = /^\/\/ node_modules\/fastify\//m;

async function source(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`${file} could not be read (${error.code}); run \`npm run build\` first.`);
  }
}

function relativeImports(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

/** Every file loaded, without a dynamic import, once `file` is. */
async function staticClosure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = await source(file);
  // `from "./x.mjs"` and `import "./x.mjs"`, never `import("./x.mjs")`.
  for (const specifier of relativeImports(text, /\b(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    await staticClosure(path.resolve(path.dirname(file), specifier), seen);
  }
  return seen;
}

async function holdsFastify(files) {
  const found = [];
  for (const file of files) if (FASTIFY.test(await source(file))) found.push(path.relative(SCRIPTS, file));
  return found;
}

async function dynamicChunk(name) {
  const specifiers = relativeImports(await source(ENTRY), /import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g);
  const specifier = specifiers.find((value) => path.basename(value).startsWith(`${name}-`));
  assert.ok(specifier !== undefined, `the entry has no dynamic import of a ${name} chunk: ${specifiers.join(', ')}`);
  return path.resolve(SCRIPTS, specifier);
}

describe('the bundle loads the page server for view only', () => {
  it('reaches no Fastify module from the entry without a dynamic import', async () => {
    assert.deepEqual(await holdsFastify(await staticClosure(ENTRY)), []);
  });

  it('keeps the hook, which runs on every prompt and edit, free of it too', async () => {
    const loaded = await staticClosure(await dynamicChunk('run-hook'), await staticClosure(ENTRY));
    assert.deepEqual(await holdsFastify(loaded), []);
  });

  it('still ships Fastify, in the chunk view imports', async () => {
    assert.ok((await holdsFastify(await staticClosure(await dynamicChunk('view')))).length > 0);
  });
});
