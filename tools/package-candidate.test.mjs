// Packages the real candidate (build included) and checks the artifact, not the allowlist.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(absolute, base)));
    else out.push(path.relative(base, absolute).split(path.sep).join('/'));
  }
  return out;
}

describe('package candidate', () => {
  it('ships every referenced and tracked plugin file', async () => {
    const stdout = execFileSync('node', ['tools/package-candidate.mjs'], { cwd: ROOT, encoding: 'utf8' });
    const candidateDir = /^Candidate directory: (.+)$/m.exec(stdout)?.[1];
    assert.ok(candidateDir, 'package-candidate printed no candidate directory');
    const shipped = new Set(await walk(candidateDir));

    // 0.6.4 shipped without skills/*/scripts, agents/ and templates/: `.mjs` was not in the skills extension list.
    const tracked = execFileSync('git', ['ls-files', 'skills', 'agents', 'templates'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file !== '');
    assert.deepEqual(tracked.filter((file) => !shipped.has(file)), []);

    const missing = [];
    for (const file of shipped) {
      if (!/\.(md|yaml|json)$/.test(file)) continue;
      const text = await readFile(path.join(candidateDir, file), 'utf8');
      for (const [, ref] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
        if (!shipped.has(ref)) missing.push(`${file} -> ${ref}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});
