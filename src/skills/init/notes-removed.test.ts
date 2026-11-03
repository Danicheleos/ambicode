import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '#testing/paths';
import { MODULE_HANDLERS } from '#skills/common';

// DECISIONS #60: init writes no `.ambicode/context/` notes. Models made 0 Read and 0 Grep calls on notes in 11 plugin traces; the conventions the scout finds become policy drafts.
const text = (...parts: string[]): Promise<string> => readFile(path.join(REPO_ROOT, ...parts), 'utf8');
const NOTES = /context write|context list|context files|context-format|conventions\.md|overview\.md|navigation\.md|learning context|context notes/i;

describe('init writes no context notes', () => {
  it('the init skill, the scout and their references never tell a model to write or list notes', async () => {
    for (const file of ['skills/init/SKILL.md', 'agents/scout.md', 'skills/init/references/rules.md', 'skills/init/references/outcomes.md']) {
      assert.doesNotMatch(await text(file), NOTES, file);
    }
  });

  it('the scout reports conventions candidates and no context files; the skill drafts them', async () => {
    const scout = await text('agents/scout.md');
    assert.match(scout, /`conventions`: every candidate rule the evidence supports/);
    assert.doesNotMatch(scout, /`context files`/);
    assert.match(await text('skills/init/SKILL.md'), /conventions/);
  });

  it('no route lists notes, and no route text tells a step to read them', async () => {
    for (const route of await readdir(path.join(REPO_ROOT, 'routes'))) {
      for (const file of await readdir(path.join(REPO_ROOT, 'routes', route)).catch(() => [])) {
        const body = await text('routes', route, file);
        // Only the plan route, whose contract file is hash-pinned, still names the handler, and as `context.list(docs)`: the documentation files line.
        if (route !== 'plan') assert.doesNotMatch(body, /context\.list/, `routes/${route}/${file}`);
        assert.doesNotMatch(body, /Read the notes|context notes/i, `routes/${route}/${file}`);
      }
    }
  });

  it('the handler no longer lists notes: its source has no notes listing or read instruction', async () => {
    assert.ok(MODULE_HANDLERS['context.list'] !== undefined);
    assert.doesNotMatch(await text('src/skills/common.ts'), /listContext|renderListing|Read the notes/);
  });

  it('the review brief takes conventions from the policy rules, not from a notes file', async () => {
    assert.doesNotMatch(await text('skills/review/scripts/brief.mjs'), /conventions\.md|Project conventions/);
    assert.doesNotMatch(await text('agents/reviewer.md'), /Project conventions|project conventions/);
  });
});
