import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Structural checks on the shipped skill content itself (doc 04 P2.1). These
 * do not invoke the real `claude plugin validate`/`details` — that is a
 * native-CLI check the test guide (doc 07) keeps out of `test:unit` — but a
 * skill directory's name and its `SKILL.md` frontmatter are exactly what that
 * command reads, so a regression here is the same regression it would report.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = path.join(repositoryRoot, 'skills');

function frontmatterName(content: string): string | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (match === null) return null;
  const name = /^name:\s*(\S+)\s*$/m.exec(match[1] ?? '');
  return name?.[1] ?? null;
}

describe('P2.1 shipped skill content', () => {
  it('registers exactly ambicode:init, ambicode:review and ambicode:investigate', async () => {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    const skillDirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      try {
        await readFile(skillFile, 'utf8');
        skillDirs.push(entry.name);
      } catch {
        // A directory with no SKILL.md (e.g. `shared/`) is not a skill.
      }
    }
    assert.deepEqual(skillDirs.sort(), ['init', 'investigate', 'review']);

    for (const dir of skillDirs) {
      const content = await readFile(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
      // The directory name is only a fallback and an unstable one for a cached
      // plugin, so every skill sets `name` explicitly (doc 08, "Skills").
      assert.equal(frontmatterName(content), dir, `${dir}/SKILL.md must declare name: ${dir}`);
    }
  });

  it('does not put a SKILL.md under the shared resources directory', async () => {
    const sharedFile = path.join(SKILLS_DIR, 'shared', 'requirements-mcp.md');
    await assert.doesNotReject(readFile(sharedFile, 'utf8'));
    await assert.rejects(readFile(path.join(SKILLS_DIR, 'shared', 'SKILL.md'), 'utf8'));
  });

  it('review and investigate both reference the shared MCP acquisition procedure instead of duplicating it', async () => {
    const review = await readFile(path.join(SKILLS_DIR, 'review', 'SKILL.md'), 'utf8');
    const investigate = await readFile(path.join(SKILLS_DIR, 'investigate', 'SKILL.md'), 'utf8');
    for (const [name, content] of [['review', review], ['investigate', investigate]] as const) {
      assert.match(
        content,
        /skills\/shared\/requirements-mcp\.md/,
        `${name}/SKILL.md must point at the shared MCP acquisition procedure`,
      );
      // The full retrieval procedure (the numbered evidence-file steps) is not
      // copied into either skill; only the shared file has it.
      assert.ok(
        !/status.*is.*`retrieved`, `unavailable`, `forbidden`/s.test(content),
        `${name}/SKILL.md appears to duplicate the shared evidence-file procedure`,
      );
    }
  });

  it('investigate documents the single note-writing boundary, matching the tested path helper', async () => {
    const investigate = await readFile(path.join(SKILLS_DIR, 'investigate', 'SKILL.md'), 'utf8');
    assert.match(investigate, /\.ambicode\/notes\/investigations\//);
  });
});
