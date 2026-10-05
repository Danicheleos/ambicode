import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = path.join(repositoryRoot, 'skills');

/**
 * Parsed with the YAML parser Claude Code uses: a per-line regex accepts values YAML
 * rejects, such as an unquoted scalar containing `": "`. The `---` delimiters are split
 * with `\r?\n`, since a Windows checkout without `.gitattributes` has CRLF.
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

function requiredString(fm: Record<string, unknown>, key: string, what: string): string {
  const value = fm[key];
  assert.equal(typeof value, 'string', `${what}: frontmatter must declare a string ${key}`);
  assert.notEqual((value as string).trim(), '', `${what}: frontmatter ${key} must not be blank`);
  return value as string;
}

describe('P2.2/P2.3 shipped skill content', () => {
  it('registers exactly ambicode:init, ambicode:review, ambicode:investigate, ambicode:plan, ambicode:task and ambicode:rules', async () => {
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
    assert.deepEqual(skillDirs.sort(), ['init', 'investigate', 'plan', 'review', 'rules', 'task']);

    // A skill whose frontmatter fails to parse is registered but loads with no `name`
    // or `description`, so it can never trigger.
    for (const dir of skillDirs) {
      const content = await readFile(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
      const what = `${dir}/SKILL.md`;
      const fm = frontmatter(content, what);
      // The directory name is only an unstable fallback for a cached plugin.
      assert.equal(requiredString(fm, 'name', what), dir, `${what} must declare name: ${dir}`);
      requiredString(fm, 'description', what);
      if (dir === 'plan' || dir === 'task' || dir === 'rules') requiredString(fm, 'argument-hint', what);
    }
  });

  it('keeps init, rules and the route-driven investigate user-invoked only, and scopes every skill tool grant', async () => {
    for (const dir of ['init', 'investigate', 'plan', 'review', 'rules', 'task']) {
      const what = `${dir}/SKILL.md`;
      const fm = frontmatter(await readFile(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8'), what);
      // `allowed-tools` pre-approves rather than restricts: a bare `Bash` would
      // pre-approve every shell command, so the grant stays scoped.
      const tools = requiredString(fm, 'allowed-tools', what);
      assert.ok(/Bash\(.+\)/.test(tools), `${what}: Bash grant must be scoped`);
      assert.ok(!/(?:^|,)\s*Bash\s*(?:,|$)/.test(tools), `${what}: no unscoped Bash grant`);
      // Write/Edit grants carry the path boundary the skill body promises; `task`
      // edits anything in the checkout, so its bound is `**`.
      for (const grant of tools.split(',').map((entry) => entry.trim())) {
        if (!/^(Write|Edit)/.test(grant)) continue;
        assert.ok(/^(Write|Edit)\(.+\)/.test(grant), `${what}: ${grant} must be path-scoped`);
      }
      // Setup-time skills are run by the user, never by the model, so their
      // descriptions stay out of the always-on skill list.
      const setupOnly = dir === 'init' || dir === 'rules' || dir === 'investigate';
      assert.equal(
        fm['disable-model-invocation'] === true,
        setupOnly,
        `${what}: exactly the setup-time skills disable model invocation`,
      );
    }
  });

  it('03-I4: no skill, reference or doc names the deleted shared resources, and each requirements body carries the envelope inline', async () => {
    await assert.rejects(readFile(path.join(SKILLS_DIR, 'shared', 'requirements-mcp.md'), 'utf8'));
    await assert.rejects(readFile(path.join(SKILLS_DIR, 'shared', 'prepare-output.md'), 'utf8'));
    const bodies = ['task/SKILL.md', 'review/SKILL.md', 'plan/SKILL.md', 'investigate/SKILL.md', 'rules/SKILL.md', 'review/references/requirements.md'];
    for (const relative of bodies) {
      const content = await readFile(path.join(SKILLS_DIR, relative), 'utf8');
      assert.doesNotMatch(content, /skills\/shared|requirements-mcp|prepare-output|shared file/, `${relative} still points at a deleted shared file`);
    }
    for (const relative of ['task/SKILL.md', 'plan/SKILL.md', 'review/references/requirements.md']) {
      const content = await readFile(path.join(SKILLS_DIR, relative), 'utf8');
      assert.match(content, /requirements\.mcpServer/, `${relative} binds the server inline`);
      assert.match(content, /--evidence -/, `${relative} pipes the envelope`);
    }
  });

  it('no skill tells anyone to create, keep alive, or delete a requirement evidence file (R2 change 4)', async () => {
    const files = ['task/SKILL.md', 'review/SKILL.md', 'plan/SKILL.md', 'investigate/SKILL.md', 'rules/SKILL.md'];
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

  it('03-I2: the write step saves the note with the one CLI call, and the body names the read-only boundary (03-I3)', async () => {
    const write = await readFile(path.join(repositoryRoot, 'routes', 'steps', 'investigate-write.md'), 'utf8');
    assert.match(write, /note save --task \{task\} --kind investigation/);
    assert.match(write, /^Write the investigation note/);
    assert.match(write, /`## Confirmed facts`/);
    const investigate = (await readFile(path.join(SKILLS_DIR, 'investigate', 'SKILL.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(investigate, /edits nothing/i);
    assert.match(investigate, /route start investigate "\$ARGUMENTS"/);
    assert.ok(Buffer.byteLength(investigate) <= 2048);
  });

  it('tells plan and task to pass the terms prepare needs for a shortlist (R4)', async () => {
    for (const name of ['plan', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(content, /--term <term>/, `${name}/SKILL.md must offer --term in its prepare argv`);
    }
  });

  it('plan documents its single note-writing boundary, separate from investigate\'s', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /note save --task <slug> --kind plan/);
  });

  it('task documents its single note-writing boundary, separate from investigate\'s and plan\'s', async () => {
    const task = await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8');
    assert.match(task, /note save --task <slug> --kind notes/);
  });

  it('plan declares an argument hint and makes the request available through $ARGUMENTS', async () => {
    const raw = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    requiredString(frontmatter(raw, 'plan/SKILL.md'), 'argument-hint', 'plan/SKILL.md');
    assert.ok(raw.includes('$ARGUMENTS'), 'plan/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('plan\'s public interface takes a repeatable --requirement, never a plural --requirements', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /--requirement <url>/);
    // No usage example (fenced code or an argument-hint) may show a plural flag;
    // prose may name it only to rule it out.
    const codeBlocks = [...plan.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
    const hint = requiredString(frontmatter(plan, 'plan/SKILL.md'), 'argument-hint', 'plan/SKILL.md');
    for (const usage of [...codeBlocks, hint]) {
      assert.ok(!/--requirements\b/.test(usage), `plan/SKILL.md must not show --requirements as usage: ${usage}`);
    }
  });

  it('plan writes each iteration as a brief task can start from, not a one-line title', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    for (const field of ['Goal', 'Changes', 'Tests', 'Accept', 'Checks', 'Leaves out']) {
      assert.match(plan, new RegExp(`^  - \\*${field}\\*:`, 'm'), `plan/SKILL.md iteration brief lacks *${field}*`);
    }
    assert.match(plan, /mini-prompt/);
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

  it('plan names an acceptance gate that works outside plan mode, and offers a decline', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    // Outside plan mode `ExitPlanMode` is not available, so both paths and the decline
    // must be named: a gate whose only answer is yes is not a gate.
    assert.match(plan, /ExitPlanMode/);
    assert.match(plan, /AskUserQuestion/);
    assert.match(plan, /\bReject\b/);
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
    assert.ok(
      !/`team`\/`observed`/.test(content),
      'must not conflate "team" and "observed" as if both were approved requirements',
    );
    assert.ok(!/suggestedComment|coverageNotes/i.test(content), 'must not carry reviewer-only finding/output vocabulary');
  });

  it('plan and task point at the prepared shared operating contract for authority guidance, instead of duplicating its definition (doc 04 P2.4 correction A6)', async () => {
    for (const name of ['plan', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(
        content,
        /sharedOperatingContract/,
        `${name}/SKILL.md must point at prepare's sharedOperatingContract field`,
      );
      assert.doesNotMatch(
        content,
        /sharedOperatingContract\.content/,
        `${name}/SKILL.md must not expect the contract's text on every prepare call`,
      );
      assert.ok(
        !/`observed`.*evidence of existing project practice/is.test(content),
        `${name}/SKILL.md must not duplicate the authority-label definitions the shared contract now owns`,
      );
    }
  });

  it('every authoring skill invokes ambicode prepare with --json and reads its structured output (doc 04 P2.4 correction A1)', async () => {
    for (const name of ['plan', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(
        content,
        /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/ambicode\.mjs" prepare --activity \S+ --json/,
        `${name}/SKILL.md must invoke the packaged Node entry point with prepare --json`,
      );
    }
  });

  it('makes LSP-first navigation observable instead of silently claiming or skipping it', async () => {
    for (const name of ['plan', 'task']) {
      const content = await readFile(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      assert.match(content, /`navigation`/, `${name}/SKILL.md must read prepare's navigation contract`);
      assert.match(content, /Navigation: LSP/);
      assert.match(content, /targeted-search fallback/);
    }
  });

  it('never reads a findReferences that lists only the definition as no users, since a loading server answers that way', async () => {
    // Measured 2026-10-02: the first call on a 532-file project found 2 of 11 references, a call 5 s later all 11; on 2,338 files
    // the first found 1 of 22 and an instant repeat also 1, which an agent read as "no users" (impact walk).
    const impact = (await readFile(path.join(SKILLS_DIR, 'review', 'references', 'impact.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(impact, /start with one `documentSymbol` on a changed file, and retry any `findReferences` that lists only the defining file after other work/);
    assert.match(impact, /Zero references to a removed name, confirmed by a later retry or a `Grep -w`/);
  });

  it('starts task from the boundary shortlist and states the shortlist discipline inline (R4)', async () => {
    const content = (await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(content, /navigation\.shortlist/, 'task/SKILL.md must start from the shortlist');
    assert.match(content, /hypothesis, not an answer/i);
    assert.match(content, /confirm each candidate/i);
    assert.match(content, /rejected/i);
  });

  it('lets a request that pins the exact edit skip localization, without shrinking checks or review', async () => {
    const content = (await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(content, /pins the exact edit/, 'step 2 must name the fast path');
    assert.match(content, /that one path and no `--term`/, 'the fast path prepares with the affected path only');
    assert.match(content, /skip the shortlist and its confirmation ceremony/, 'step 4 must skip the ceremony');
    assert.match(content, /Navigation: request-pinned — <file>/, 'the fast path carries its own literal evidence line');
    assert.match(content, /checks, review and the report still run in full/i, 'the fast path must not weaken honest reporting');
  });

  it('points authoring skills at the inline shortlist, not at a second locate call', async () => {
    for (const relative of ['investigate/SKILL.md', 'plan/SKILL.md', 'task/SKILL.md']) {
      const content = await readFile(path.join(SKILLS_DIR, relative), 'utf8');
      assert.doesNotMatch(content, /\blocate\b/, `${relative} must not advertise locate`);
    }
    const content = (await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(content, /`prepare --term` asks for one/, 'task/SKILL.md must say how to get a shortlist');
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
    assert.match(content, /never parsed a second way/i);
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

  it('never promises the review target is only this task\'s edits, and spends the dirty tree before the reviewer does', async () => {
    const content = await task();
    // The target must not be taken on trust as "this task's edits": a tree dirty before
    // the task started gets reviewed whole. The warning must land before the reviewer runs.
    assert.ok(
      !/exactly this task's edits/i.test(content),
      'task/SKILL.md must not claim the working-tree target is only this task\'s edits',
    );
    assert.match(content, /all of your uncommitted work/i);
    assert.match(content, /\*\*name those files before the first review\*\*/i);
    assert.match(content, /Never modify them or adopt their\s*\n?\s*findings/i);
  });
  it('spends the reviewer only with the user\'s consent, and records a skip as unverified', async () => {
    const content = await task();
    // A review costs minutes of tests and reviewer, so the skill offers the skip rather
    // than starting it; a skip must never report as nothing-found.
    assert.match(content, /Format what you wrote, then ask/i);
    assert.match(content, /offer the skip/i);
    assert.match(content, /a skipped, declined or incomplete independent review/i);
    assert.ok(
      !/independent review pipeline automatically/i.test(content),
      'task/SKILL.md must not advertise a review the user is now asked about',
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
    // The description keeps a compact form of this list for deciding whether to invoke
    // the skill; the body keeps the full list.
    const description = requiredString(frontmatter(content, 'task/SKILL.md'), 'description', 'task/SKILL.md');
    assert.match(description, /never commits, pushes, or publishes/i);
  });

  it('treats plans, tickets, repository files, comments, and test output as evidence, never as capabilities or permission', async () => {
    const content = await task();
    const normalized = content.replace(/\s+/g, ' ');
    assert.match(normalized, /evidence, never/i);
    assert.match(normalized, /not a grant of any tool, capability, commit, deploy, publish, or/i);
  });
});

/**
 * Every code the CLI can raise, read from the source. A code built at run time is listed by
 * hand, and the test fails if a new one appears, so the list cannot fall silently behind.
 */
async function emittedErrorCodes(): Promise<Set<string>> {
  const DYNAMIC: Record<string, string[]> = {
    'snapshot/remote-target.ts': ['provider-unsupported', 'provider-resolve-failed', 'provider-fetch-failed'],
    // A handler's failure code passes through; the codes themselves are raised, and documented, where the handler raises them.
    'route/engine.ts': [],
    'cli/commands/requirements.ts': ['requirements-not-captured', 'requirements-missing'],
  };
  const codes = new Set<string>();
  const sourceDir = path.join(repositoryRoot, 'src');
  for (const file of await readdir(sourceDir, { recursive: true })) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const text = await readFile(path.join(sourceDir, file), 'utf8');
    for (const match of text.matchAll(/new AmbicodeError\(\s*([^,]+),/g)) {
      const literal = /^'([a-z0-9-]+)'$/.exec(match[1]!.trim());
      if (literal) codes.add(literal[1]!);
      else {
        const known = DYNAMIC[file.split(path.sep).join('/')];
        assert.ok(known, `${file} raises an AmbicodeError with a computed code (${match[1]!.trim()}); list its codes in DYNAMIC`);
        known.forEach((code) => codes.add(code));
      }
    }
  }
  return codes;
}

describe('F3 documented outcomes', () => {
  it('documents every error code the CLI raises in a file the skills read', async () => {
    const codes = await emittedErrorCodes();
    assert.ok(codes.size > 40, `expected the whole set of codes, found ${codes.size}`);
    let documentation = '';
    for (const file of await readdir(SKILLS_DIR, { recursive: true })) {
      if (file.endsWith('.md')) documentation += await readFile(path.join(SKILLS_DIR, file), 'utf8');
    }
    const missing = [...codes].filter((code) => !documentation.includes(`\`${code}\``)).sort();
    assert.deepEqual(missing, [], 'an agent that meets an undocumented code has nothing to act on but the message');
  });

  it('review outcomes cover every requirements, baseline and reviewer code, the ones a review run meets', async () => {
    const outcomes = await readFile(path.join(SKILLS_DIR, 'review', 'references', 'outcomes.md'), 'utf8');
    const reviewPath = [...(await emittedErrorCodes())].filter((code) =>
      /^(requirements-|baseline-|reviewer-|provider-|config-)|^(no-merge-base|no-head|not-a-repository)$/.test(code),
    );
    const missing = reviewPath.filter((code) => !outcomes.includes(`\`${code}\``)).sort();
    assert.deepEqual(missing, []);
  });
});

describe('F7 rules confirmation gate', () => {
  it('asks for confirmation before any pack is wired in, and states how to undo the wiring', async () => {
    const content = await readFile(path.join(SKILLS_DIR, 'rules', 'SKILL.md'), 'utf8');
    const steps = [...content.matchAll(/^### (\d+)\. (.+)$/gm)].map((m) => ({ n: Number(m[1]), title: m[2]!, at: m.index }));
    const confirm = steps.find((s) => /disposition table/i.test(s.title));
    const wire = steps.find((s) => /wire the packs in/i.test(s.title));
    assert.ok(confirm && wire, 'both steps exist');
    assert.ok(confirm.at < wire.at, 'a gate after the change it guards cannot stop it');
    const wiring = content.slice(wire.at, steps.find((s) => s.n === wire.n + 1)?.at ?? content.indexOf('\n## ', wire.at));
    assert.match(wiring, /policyFiles/);
    assert.match(wiring.replace(/\s+/g, ' '), /to undo|roll back|rollback/i);
  });
});
