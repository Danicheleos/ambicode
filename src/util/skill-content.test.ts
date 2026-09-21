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

/** `${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md` (doc 04 P2.2 correction B). */
const PLUGIN_ROOT_SHARED_REFERENCE = '${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md';

describe('P2.2/P2.3 shipped skill content', () => {
  it('registers exactly ambicode:init, ambicode:review, ambicode:investigate, ambicode:plan and ambicode:task', async () => {
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
    assert.deepEqual(skillDirs.sort(), ['init', 'investigate', 'plan', 'review', 'task']);

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

  it('review, investigate, plan and task all reference the shared MCP acquisition procedure through the plugin root, instead of duplicating it or a repository-relative path', async () => {
    const referrers = ['review', 'investigate', 'plan', 'task'] as const;
    for (const name of referrers) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.ok(
        content.includes(PLUGIN_ROOT_SHARED_REFERENCE),
        `${name}/SKILL.md must point at the shared MCP acquisition procedure through \${CLAUDE_PLUGIN_ROOT}, not a product-repository-relative path`,
      );
      // No bare, non-substituted reference anywhere in the file: a plugin
      // loaded from Claude Code's own cache has no product repository for a
      // relative "skills/shared/..." path to resolve against.
      const bareReference = /(?<!\$\{CLAUDE_PLUGIN_ROOT\}\/)skills\/shared\/requirements-mcp\.md/;
      assert.ok(
        !bareReference.test(content),
        `${name}/SKILL.md references skills/shared/requirements-mcp.md by a path relative to the product repository`,
      );
      // The full retrieval procedure (the numbered evidence-file steps) is not
      // copied into any of the four skills; only the shared file has it.
      assert.ok(
        !/status.*is.*`retrieved`, `unavailable`, `forbidden`/s.test(content),
        `${name}/SKILL.md appears to duplicate the shared evidence-file procedure`,
      );
    }
  });

  it('the shared procedure describes retrieving on behalf of all four referrers and no other skill file duplicates it', async () => {
    const shared = await readFile(path.join(SKILLS_DIR, 'shared', 'requirements-mcp.md'), 'utf8');
    for (const name of ['review', 'investigate', 'plan', 'task']) {
      assert.ok(shared.includes(name), `shared/requirements-mcp.md should name "${name}" as a referrer`);
    }
  });

  it('the shared procedure explains that task keeps the evidence file alive across two consumers, unlike review/investigate/plan', async () => {
    const shared = await readFile(path.join(SKILLS_DIR, 'shared', 'requirements-mcp.md'), 'utf8');
    const normalized = shared.replace(/\s+/g, ' ');
    assert.match(normalized, /task.*reads it.*twice/i);
    assert.match(normalized, /last command in your workflow that reads it/i);
  });

  it('investigate documents its single note-writing boundary', async () => {
    // doc 04 P2.2 correction E: the note-path boundary is documented here in
    // prose, not enforced by a TypeScript helper — a skill's Write tool
    // cannot call one, so `src/notes/path.ts` (unreachable from any real
    // boundary) was removed rather than kept to justify a helper nothing calls.
    const investigate = await readFile(path.join(SKILLS_DIR, 'investigate', 'SKILL.md'), 'utf8');
    assert.match(investigate, /\.ambicode\/notes\/investigations\//);
  });

  it('plan documents its single note-writing boundary, separate from investigate\'s', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /\.ambicode\/notes\/plans\//);
  });

  it('task documents its single note-writing boundary, separate from investigate\'s and plan\'s', async () => {
    const task = await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8');
    assert.match(task, /\.ambicode\/notes\/tasks\//);
  });

  it('plan declares an argument hint and makes the request available through $ARGUMENTS', async () => {
    const raw = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? '';
    assert.match(frontmatter, /^argument-hint:\s*\S.+$/m, 'plan/SKILL.md must declare argument-hint');
    assert.ok(raw.includes('$ARGUMENTS'), 'plan/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('plan\'s public interface takes a repeatable --requirement, never a plural --requirements', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /--requirement <url>/);
    // No *usage example* (fenced code, or a frontmatter argument-hint) shows a
    // plural flag; prose is allowed to name it only to explicitly rule it out.
    const codeBlocks = [...plan.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(plan)?.[1] ?? '';
    for (const usage of [...codeBlocks, frontmatter]) {
      assert.ok(!/--requirements\b/.test(usage), `plan/SKILL.md must not show --requirements as usage: ${usage}`);
    }
  });

  it('plan distinguishes draft from accepted status, and requires explicit human acceptance', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /\bdraft\b/i);
    assert.match(plan, /\baccepted\b/i);
    assert.ok(
      /never call a plan accepted merely because it was generated/i.test(plan) ||
        /generated draft.*is not accepted/i.test(plan),
      'plan/SKILL.md must state that generation alone never counts as acceptance',
    );
  });

  it('plan states it never implements, never invokes the reviewer, and never publishes, commits, or pushes', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    for (const phrase of [
      /do not edit product source/i,
      /do not invoke the independent reviewer/i,
      /do not commit,\s+push,\s+open a merge request,\s+publish a comment,\s+deploy,\s+or\s+transition/i,
      /do not run project scripts, tests, selectors/i,
    ]) {
      assert.match(plan, phrase, `plan/SKILL.md missing expected boundary statement matching ${phrase}`);
    }
  });

  it('plan explicitly refuses ambiguous monorepository project selection instead of guessing', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /ambiguous-project/);
    assert.match(plan, /refuse to guess/i);
  });

  it('plan treats requirement and repository content as evidence, never as authorization', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /never\s+instructions?\s+or\s+authorization/i);
  });

  it('plan and task define the primary request as the complete span before --requirement, preserving multiword intent, never the first token alone (doc 04 P2.3 correction D)', async () => {
    for (const name of ['plan', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      const normalized = content.replace(/\s+/g, ' ');
      assert.match(normalized, /primary request is the complete argument span before the first recognized/i, `${name}/SKILL.md`);
      assert.match(normalized, /multiword/i, `${name}/SKILL.md`);
      assert.match(normalized, /preserve its whitespace/i, `${name}/SKILL.md`);
      // The specific defect this correction fixes: describing the primary
      // request as "the first token" of $ARGUMENTS.
      assert.ok(
        !/first token \(or the whole line/i.test(normalized),
        `${name}/SKILL.md must not describe the primary request as the first token`,
      );
    }
  });

  it('plan, investigate and task state the three-way authority distinction, and never conflate "observed" with "team" (doc 04 P2.3 correction C)', async () => {
    for (const name of ['plan', 'investigate', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(content, /`team`.*approved (project )?requirement/is, `${name}/SKILL.md must state that "team" is an approved requirement`);
      assert.match(
        content,
        /`observed`.*evidence of existing project practice/is,
        `${name}/SKILL.md must state that "observed" is evidence of existing practice, not an approved requirement`,
      );
      assert.match(content, /`inherited`.*(baseline )?guidance/is, `${name}/SKILL.md must state that "inherited" is guidance`);
      assert.match(
        content,
        /never.*(report|treat).*`observed`.*or.*`inherited`.*(guidance|rule).*(as a )?(policy )?violation/is,
        `${name}/SKILL.md must say observed/inherited guidance is never itself a policy violation`,
      );
      // The specific defect this correction fixes: grouping observed together
      // with team as if both were already "actual expectations"/requirements.
      assert.ok(
        !/`team`\/`observed`/.test(content),
        `${name}/SKILL.md must not conflate "team" and "observed" as if both were approved requirements`,
      );
    }
  });
});

describe('P2.3 task skill', () => {
  async function task(): Promise<string> {
    return readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8');
  }

  it('declares an argument hint and makes the request available through $ARGUMENTS', async () => {
    const raw = await task();
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? '';
    assert.match(frontmatter, /^argument-hint:\s*\S.+$/m, 'task/SKILL.md must declare argument-hint');
    assert.ok(raw.includes('$ARGUMENTS'), 'task/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('takes a repeatable --requirement, never a plural --requirements', async () => {
    const content = await task();
    assert.match(content, /--requirement <url>/);
    const codeBlocks = [...content.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
    for (const usage of [...codeBlocks, frontmatter]) {
      assert.ok(!/--requirements\b/.test(usage), `task/SKILL.md must not show --requirements as usage: ${usage}`);
    }
  });

  it('never forces a small change through /ambicode:plan and never requires an investigation or task ID', async () => {
    const content = await task();
    assert.match(content, /plan is optional/i);
    assert.match(content, /never force a small/i);
    assert.match(content, /never require an investigation or a task id/i);
  });

  it('treats an accepted plan as supporting evidence, with the user\'s request as the actual authorization', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /supporting evidence/i);
    assert.match(normalized, /user's request to implement it is the authorization to begin/i);
  });

  it('reuses ambicode prepare and ambicode review rather than adding a second policy parser, selector, runner, or reviewer', async () => {
    const content = await task();
    assert.match(content, /ambicode prepare --activity task/);
    assert.match(content, /ambicode review/);
    assert.match(content, /do not create a second task-specific check selector, runner, or reviewer/i);
    assert.match(content, /do not build a second requirement parser, policy resolver, or config\s+reader for tasks/i);
  });

  it('refuses ambiguous monorepository project selection instead of guessing', async () => {
    const content = await task();
    assert.match(content, /ambiguous-project/);
    assert.match(content, /refuse to guess/i);
  });

  it('reruns ambicode prepare when implementation reaches paths outside the prepared scope', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /rerun.*ambicode prepare --activity task.*with the actual affected paths/i);
  });

  it('never runs the affected checks or the independent reviewer twice for the same reason, and calls the CLI pipeline directly rather than imitating a review itself', async () => {
    const content = await task();
    assert.match(content, /do not run lint\/unit\/e2e separately and then run `ambicode review` again/i);
    assert.match(
      content,
      /do not paste this\s*\n?\s*conversation into the reviewer and do not attempt to imitate an independent\s*\n?\s*review yourself/i,
    );
  });

  it('states that a source change without a successfully executed affected test remains verification-incomplete', async () => {
    const content = await task();
    assert.match(content, /verification-incomplete/i);
    assert.match(content, /unchanged test that was selected\s*\n?\s*only because the source it exercises changed/i);
  });

  it('asks the user rather than silently implementing a scope-expanding finding, and does not loop indefinitely', async () => {
    const content = await task();
    assert.match(content, /materially expand scope/i);
    assert.match(content, /do not loop indefinitely/i);
  });

  it('needs no mandatory task file for a small change, and documents what an optional note may contain', async () => {
    const content = await task();
    assert.match(content, /a small task needs no task file at all/i);
    assert.match(content, /add a task database, a workflow engine, an event log, a mandatory\s*\n?\s*identifier/i);
  });

  it('treats a resumed note\'s recorded evidence as historical and re-prepares/re-reviews the current iteration', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /when resuming.*read the note and the current git state first/i);
    assert.match(normalized, /never assume the diff.*are still current/i);
  });

  it('reports exactly Done, Evidence, Not verified, and Remaining, and never lets Done imply successful verification', async () => {
    const content = await task();
    assert.match(content, /Done:/);
    assert.match(content, /Evidence:/);
    assert.match(content, /Not verified:/);
    assert.match(content, /Remaining:/);
    assert.match(content, /must never be hidden behind "done"/i);
  });

  it('never commits, pushes, opens a merge request, publishes, merges, deploys, or transitions a ticket', async () => {
    const content = await task();
    assert.match(
      content,
      /never commit,\s*\n?\s*push,\s*create a merge request,\s*publish a comment,\s*merge,\s*\n?\s*deploy,\s*or\s*transition a ticket automatically/i,
    );
    // Also stated in the frontmatter description, for the model deciding
    // whether to invoke this skill at all.
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
    assert.match(frontmatter, /never commits, pushes, opens a merge request, publishes a comment, merges, deploys, or transitions a ticket/i);
  });

  it('treats plans, tickets, repository files, comments, and test output as evidence, never as capabilities or permission', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /evidence, never/i);
    assert.match(normalized, /not a grant of any tool, capability, commit, deploy, publish, or/i);
  });
});
