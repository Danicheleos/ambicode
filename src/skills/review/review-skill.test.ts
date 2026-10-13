import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import YAML from 'yaml';
import { REPO_ROOT } from '#testing/paths';

const SKILL = path.join(REPO_ROOT, 'skills', 'review', 'SKILL.md');

const frontmatter = (text: string): Record<string, unknown> => YAML.parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)![1]!) as Record<string, unknown>;

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : Promise.resolve([path.join(directory, entry.name)]))));
  return nested.flat();
}

describe('review skill (08-K)', () => {
  it('08-K1: SKILL.md is at most 1,000 bytes', async () => {
    assert.ok(Buffer.byteLength(await readFile(SKILL, 'utf8')) <= 1000);
  });

  it('08-K1: the body starts the route and the read-back step, which is delivered, states the four reporting rules once', async () => {
    assert.match(await readFile(SKILL, 'utf8'), /route start review/);
    const text = await readFile(path.join(REPO_ROOT, 'routes', 'review', 'readback.md'), 'utf8');
    for (const rule of [/empty finding list is not a clean/i, /failed reviewer is not a clean/i, /skipped check is not a pass/i, /rejected for its location is listed in Part 4/i]) assert.match(text, rule);
    assert.doesNotMatch(await readFile(SKILL, 'utf8'), /is not a clean/i);
  });

  it('08-K2: front matter sets disable-model-invocation: true', async () => {
    assert.equal(frontmatter(await readFile(SKILL, 'utf8'))['disable-model-invocation'], true);
  });

  it('08-K3: the description says natural language goes to the built-in review and AMBICODE runs only when typed', async () => {
    const description = String(frontmatter(await readFile(SKILL, 'utf8'))['description']);
    assert.match(description, /natural-language "review my change" goes to Claude Code's built-in review/);
    assert.match(description, /AMBICODE's review runs only when \/ambicode:review is typed/);
  });

  it('08-K3: the impact reference is deleted and nothing under skills, src or routes names it', async () => {
    const needle = `impact${'.md'}`;
    assert.equal(existsSync(path.join(REPO_ROOT, 'skills', 'review', 'references', needle)), false);
    for (const directory of ['skills', 'src', 'routes']) {
      for (const file of await filesUnder(path.join(REPO_ROOT, directory))) {
        if (!/\.(md|ts|mjs|yaml|yml|json|eta)$/.test(file)) continue;
        assert.ok(!(await readFile(file, 'utf8')).includes(needle), path.relative(REPO_ROOT, file));
      }
    }
  });
});
