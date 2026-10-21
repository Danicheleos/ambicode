import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initLargeScaffold, modulesOfBench, renderInitLarge, writeInitLarge } from './init-large-case.mjs';

const CONFIG = 'context: { maxTotalTokens: 50000, maxFileTokens: 2500, maxIndexTokens: 10000 }\nprojects:\n  - id: x\n    paths: [ main/ ]\n';
const FILES = ['a', 'b'].flatMap((dir) => [1, 2, 3].map((i) => `main/${dir}/f${i}.ts`));

function bench() {
  const dir = mkdtempSync(path.join(tmpdir(), 'init-large-'));
  mkdirSync(path.join(dir, '.ambicode'));
  writeFileSync(path.join(dir, '.ambicode', 'config.yaml'), CONFIG);
  return dir;
}

describe('init-scout-large case', () => {
  it('lists the modules of the config paths and grades links, the haiku scout and failed writes', () => {
    const dir = bench();
    const files = renderInitLarge(dir, FILES);
    const names = [...files.keys()].filter((f) => f.includes('/graders/')).map((f) => path.basename(f, '.md'));
    for (const name of ['scout-invoked', 'scout-model-haiku', 'index-links-every-module', 'no-failed-context-write', 'context-conventions', 'conventions-descriptive']) assert.ok(names.includes(name), name);
    assert.ok(!names.includes('index-has-no-extra-notes'));
    assert.equal(modulesOfBench(FILES, { projects: [{ paths: ['main/'] }], context: { maxTotalTokens: 50000 } }).length, 3);
  });

  it('the scaffold copies HEAD and the config only, and sets the scout to haiku in the copy', () => {
    const script = initLargeScaffold('/b');
    assert.match(script, /git -C '\/b' archive HEAD/);
    assert.match(script, /cp '\/b\/\.ambicode\/config\.yaml'/);
    assert.doesNotMatch(script, /cp [^\n]*\.ambicode\/context/);
    assert.match(script, /scout: \{ model: haiku,/);
  });

  it('writes nothing when the bench has no config', () => {
    assert.equal(writeInitLarge(mkdtempSync(path.join(tmpdir(), 'init-large-out-')), { INIT_BENCH: path.join(tmpdir(), 'no-such-bench') }), 0);
  });
});
