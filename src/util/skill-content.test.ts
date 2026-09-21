import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

/**
 * Structural checks on the shipped skill content itself (doc 04 P2.1). These
 * do not invoke the real `claude plugin validate`/`details` — that is a
 * native-CLI check the test guide (doc 07) keeps out of `test:unit` — but a
 * skill directory's name and its `SKILL.md` frontmatter are exactly what that
 * command reads, so a regression here is the same regression it would report.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = path.join(repositoryRoot, 'skills');

/**
 * Parses a shipped `SKILL.md`'s frontmatter with the same YAML parser Claude
 * Code uses, instead of matching lines with a regex. A per-line regex happily
 * reads a value the YAML spec rejects — an unquoted plain scalar containing
 * `": "` — which is exactly how two skills shipped in the 0.1.1 candidate with
 * no `name` and no `description` at all while this test stayed green (R1
 * defect 1). The `---` delimiters are not themselves YAML, so they are still
 * split off by hand, but with `\r?\n`: a Windows checkout of a repository
 * without `.gitattributes` has CRLF, and the LF-only form silently matched
 * nothing there (R1 defect 3).
 */
function frontmatter(content: string, what: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  assert.ok(match !== null, `${what}: no frontmatter block`);
  let parsed: unknown;
  try {
    parsed = YAML.parse(match[1] ?? '');
  } catch (cause) {
    assert.fail(`${what}: frontmatter is not valid YAML — ${(cause as Error).message}`);
  }
  assert.ok(
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
    `${what}: frontmatter is not a YAML mapping`,
  );
  return parsed as Record<string, unknown>;
}

/** Reads one frontmatter key Claude Code relies on, and proves it is present. */
function requiredString(fm: Record<string, unknown>, key: string, what: string): string {
  const value = fm[key];
  assert.equal(typeof value, 'string', `${what}: frontmatter must declare a string ${key}`);
  assert.notEqual((value as string).trim(), '', `${what}: frontmatter ${key} must not be blank`);
  return value as string;
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

    // Being registered is not the same as being triggerable: Claude Code
    // matches on `name` and `description`, and a skill whose frontmatter fails
    // to parse loads with neither. Assert the parse and both keys, not just a
    // line that looks like a name.
    for (const dir of skillDirs) {
      const content = await readFile(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
      const what = `${dir}/SKILL.md`;
      const fm = frontmatter(content, what);
      // The directory name is only a fallback and an unstable one for a cached
      // plugin, so every skill sets `name` explicitly (doc 08, "Skills").
      assert.equal(requiredString(fm, 'name', what), dir, `${what} must declare name: ${dir}`);
      requiredString(fm, 'description', what);
      // Only the two skills that take an argument declare a hint for it.
      if (dir === 'plan' || dir === 'task') requiredString(fm, 'argument-hint', what);
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

  it('the shared procedure pipes the envelope with --evidence - and owns no file lifecycle (R2 change 4)', async () => {
    const shared = await readFile(path.join(SKILLS_DIR, 'shared', 'requirements-mcp.md'), 'utf8');
    assert.match(shared, /--evidence -/);
    assert.match(shared, /There is no evidence file to own/i);
  });

  it('no skill tells anyone to create, keep alive, or delete a requirement evidence file (R2 change 4)', async () => {
    // The file lifecycle was roughly 40 lines across task, the shared
    // procedure and review, and every line of it existed only because the
    // envelope had to survive between two commands. `--evidence -` removes
    // the object, so the protocol around it has nothing left to govern.
    const files = ['shared/requirements-mcp.md', 'task/SKILL.md', 'review/SKILL.md', 'plan/SKILL.md', 'investigate/SKILL.md'];
    for (const relative of files) {
      const content = (await readFile(path.join(SKILLS_DIR, relative), 'utf8')).replace(/\s+/g, ' ');
      for (const forbidden of [
        /write one evidence file/i,
        /delete the evidence file/i,
        /keeps? the evidence file alive/i,
        /arbitrary number of consumers/i,
        /final cleanup/i,
        /mkdtemp/i,
      ]) {
        assert.doesNotMatch(content, forbidden, `${relative} still describes an evidence-file lifecycle`);
      }
    }
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
    requiredString(frontmatter(raw, 'plan/SKILL.md'), 'argument-hint', 'plan/SKILL.md');
    assert.ok(raw.includes('$ARGUMENTS'), 'plan/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('plan\'s public interface takes a repeatable --requirement, never a plural --requirements', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /--requirement <url>/);
    // No *usage example* (fenced code, or a frontmatter argument-hint) shows a
    // plural flag; prose is allowed to name it only to explicitly rule it out.
    const codeBlocks = [...plan.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
    const hint = requiredString(frontmatter(plan, 'plan/SKILL.md'), 'argument-hint', 'plan/SKILL.md');
    for (const usage of [...codeBlocks, hint]) {
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

  it('the canonical shared operating contract states the three-way authority distinction, and never conflates "observed" with "team" (doc 04 P2.4 correction A5)', async () => {
    const content = await readFile(
      path.join(repositoryRoot, 'prompts', 'shared-operating-contract.md'),
      'utf8',
    );
    assert.match(content, /`team`.*approved (project )?requirement/is, 'must state that "team" is an approved requirement');
    assert.match(
      content,
      /`observed`.*evidence of existing project practice/is,
      'must state that "observed" is evidence of existing practice, not an approved requirement',
    );
    assert.match(content, /`inherited`.*(baseline )?guidance/is, 'must state that "inherited" is guidance');
    assert.match(
      content,
      /never.*(report|treat).*`observed`.*or.*`inherited`.*(content|guidance|rule).*(as a )?(policy )?violation/is,
      'must say observed/inherited guidance is never itself a policy violation',
    );
    // The specific defect the original correction fixed: grouping observed
    // together with team as if both were already "actual expectations".
    assert.ok(
      !/`team`\/`observed`/.test(content),
      'must not conflate "team" and "observed" as if both were approved requirements',
    );
    // Workflow-neutral: nothing reviewer-only (finding/output rules) leaked
    // into the shared contract (doc 04 P2.4 correction A5) — that stays in
    // reviewer-role.md.
    assert.ok(!/suggestedComment|coverageNotes/i.test(content), 'must not carry reviewer-only finding/output vocabulary');
  });

  it('plan, investigate and task point at the prepared shared operating contract for authority guidance, instead of duplicating its definition (doc 04 P2.4 correction A6)', async () => {
    for (const name of ['plan', 'investigate', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(
        content,
        /sharedOperatingContract/,
        `${name}/SKILL.md must point at prepare's sharedOperatingContract field`,
      );
      // R2 change 2: the text arrives once per session through the plugin
      // hook, so a skill that still expected `.content` on every call would
      // be describing a field the compact output no longer carries.
      assert.doesNotMatch(
        content,
        /sharedOperatingContract\.content/,
        `${name}/SKILL.md must not expect the contract's text on every prepare call`,
      );
      // The full authority-label definitions are no longer copied into each
      // skill file; the canonical contract is the one place that owns them.
      assert.ok(
        !/`observed`.*evidence of existing project practice/is.test(content),
        `${name}/SKILL.md must not duplicate the authority-label definitions the shared contract now owns`,
      );
    }
  });

  it('every authoring skill invokes ambicode prepare with --json and reads its structured output (doc 04 P2.4 correction A1)', async () => {
    for (const name of ['plan', 'investigate', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(
        content,
        /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/ambicode\.mjs" prepare --activity \S+ --json/,
        `${name}/SKILL.md must invoke the packaged Node entry point with prepare --json`,
      );
    }
  });

  it('makes LSP-first navigation observable instead of silently claiming or skipping it', async () => {
    for (const name of ['plan', 'investigate', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(content, /`navigation`/, `${name}/SKILL.md must read prepare's navigation contract`);
      assert.match(content, /Navigation: LSP/);
      assert.match(content, /targeted-search fallback/);
      assert.match(content, /installed or recommended alone/i);
    }
  });
});

describe('P2.3 task skill', () => {
  async function task(): Promise<string> {
    return readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8');
  }

  it('declares an argument hint and makes the request available through $ARGUMENTS', async () => {
    const raw = await task();
    requiredString(frontmatter(raw, 'task/SKILL.md'), 'argument-hint', 'task/SKILL.md');
    assert.ok(raw.includes('$ARGUMENTS'), 'task/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('takes a repeatable --requirement, never a plural --requirements', async () => {
    const content = await task();
    assert.match(content, /--requirement <url>/);
    const codeBlocks = [...content.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
    const hint = requiredString(frontmatter(content, 'task/SKILL.md'), 'argument-hint', 'task/SKILL.md');
    for (const usage of [...codeBlocks, hint]) {
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
    const description = requiredString(frontmatter(content, 'task/SKILL.md'), 'description', 'task/SKILL.md');
    assert.match(description, /never commits, pushes, opens a merge request, publishes a comment, merges, deploys, or transitions a ticket/i);
  });

  it('treats plans, tickets, repository files, comments, and test output as evidence, never as capabilities or permission', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /evidence, never/i);
    assert.match(normalized, /not a grant of any tool, capability, commit, deploy, publish, or/i);
  });
});
