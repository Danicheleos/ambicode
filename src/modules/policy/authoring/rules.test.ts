import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT } from '#testing/paths';

describe('09-M1: the skill', () => {
  it('09-M1: the body stays within 2,560 bytes and the tools no longer edit the configuration', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'skills', 'rules', 'SKILL.md'), 'utf8');
    const body = text.split('---\n').slice(2).join('---\n');
    assert.ok(Buffer.byteLength(body) <= 2_560, `${Buffer.byteLength(body)} bytes`);
    assert.match(text, /allowed-tools: .*Write\(\.ambicode\/policies\/drafts\/\*\*\)/);
    assert.doesNotMatch(text, /Edit\(\.ambicode\/config\.yaml\)/);
    assert.match(text, /disable-model-invocation: true/);
  });
});
