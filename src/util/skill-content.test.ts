import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

  it('keeps init, rules and the route-driven investigate, plan, task and review (08-K2) user-invoked only, and scopes every skill tool grant', async () => {
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
      const userOnly = dir === 'init' || dir === 'rules' || dir === 'investigate' || dir === 'plan' || dir === 'task' || dir === 'review';
      assert.equal(
        fm['disable-model-invocation'] === true,
        userOnly,
        `${what}: exactly the setup-time and route-driven skills disable model invocation`,
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
    for (const relative of ['review/references/requirements.md']) {
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

  it('03b-N9: the read step answers with citations and treats the map as leads, with no note command', async () => {
    const read = await readFile(path.join(repositoryRoot, 'routes', 'steps', 'investigate-read.md'), 'utf8');
    assert.match(read, /`path:line`/);
    assert.match(read, /leads, not answers/);
    assert.match(read, /Edit nothing/);
    assert.match(read, /whole request as written/, '03b-N13: a files answer covers the request, not the minimal fix');
    assert.match(read, /types, schema, DTO, mocks, routes and tests/);
    assert.match(read, /naming that assumption/);
    assert.match(read, /similar features the request does not name/);
    assert.match(read, /not in the code, say so/, '03b-N14: a missing premise ends the search');
    assert.doesNotMatch(read, /note save|route next|\{cli\} (find|refs)/);
    // 07-I1 adds one Diagnostics sentence on top of the 700-character read text.
    assert.ok(read.replace(/^Diagnostics .*\n/m, '').length <= 700);
    assert.equal(existsSync(path.join(repositoryRoot, 'routes', 'steps', 'investigate-write.md')), false);
  });

  it('03b-N10: the body names the read-only boundary, the saved answer and the fallback line (03-I3)', async () => {
    const investigate = (await readFile(path.join(SKILLS_DIR, 'investigate', 'SKILL.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(investigate, /edits nothing/i);
    assert.match(investigate, /saved as the investigation note/);
    assert.match(investigate, /route start investigate "\$ARGUMENTS"/);
    assert.doesNotMatch(investigate, /route next|note save/);
    assert.ok(Buffer.byteLength(investigate) <= 900);
  });

  it('06-S4: plan leaves the draft and the accepted note to the route, and never names --kind plan', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(plan, /--kind plan\b/);
  });

  it('06-S1/06-S2: plan stays within 2,560 bytes, is user-invoked only and may write only its plan body', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.ok(Buffer.byteLength(plan) <= 2560, `${Buffer.byteLength(plan)} bytes`);
    const fm = frontmatter(plan, 'plan/SKILL.md');
    assert.equal(fm['disable-model-invocation'], true);
    assert.equal(requiredString(fm, 'allowed-tools', 'plan/SKILL.md'), 'Read, Grep, Glob, Bash(node *ambicode.mjs*), Write(.ambicode/task/*/steps/plan-body.md)');
    const normalized = plan.replace(/\s+/g, ' ');
    for (const judgment of [/material versus routine/i, /reuse over new/i, /independently reviewable iterations/i]) assert.match(normalized, judgment);
  });

  it('07-R7: task\'s write step holds its single note-writing boundary, separate from investigate\'s and plan\'s', async () => {
    const write = await readFile(path.join(repositoryRoot, 'routes', 'steps', 'task-write.md'), 'utf8');
    assert.match(write, /note save --task \{task\} --kind notes --iteration <n>/);
    assert.doesNotMatch(await readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8'), /note save/);
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

  it('06-S4: plan and its write step name the six iteration fields', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    const write = await readFile(path.join(repositoryRoot, 'routes', 'steps', 'plan-write.md'), 'utf8');
    for (const field of ['Goal', 'Changes', 'Tests', 'Accept', 'Checks', 'Leaves out']) {
      assert.ok(plan.includes(`*${field}*`), `plan/SKILL.md lacks *${field}*`);
      assert.ok(write.includes(`*${field}*`), `plan-write.md lacks *${field}*`);
    }
  });

  it('06-S3: plan distinguishes draft from accepted status, and requires explicit human acceptance', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /\bdraft\b/i);
    assert.match(plan, /\baccepted\b/i);
    assert.ok(
      /never call a plan accepted merely because it was generated/i.test(plan) ||
        /generated draft.*is not accepted/i.test(plan),
      'plan/SKILL.md must state that generation alone never counts as acceptance',
    );
  });

  it('06-S4/06-R10: plan accepts through the route gate, whose decline is the default, not through ExitPlanMode', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(plan, /ExitPlanMode/);
    const route = YAML.parse(await readFile(path.join(repositoryRoot, 'routes', 'plan.yaml'), 'utf8')) as { steps: { id: string; gate?: Record<string, unknown> }[] };
    const gate = route.steps.find((step) => step.id === 'plan-accept')?.gate;
    assert.deepEqual(gate?.['options'], ['Accept', 'Revise', 'Reject']);
    assert.equal(gate?.['default'], 'Reject');
    assert.equal(gate?.['release'], 'Reject');
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

  it('plan treats requirement and repository content as evidence, never as authorization', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.match(plan, /never\s+instructions?\s+or\s+authorization/i);
  });

  it('06-S4: plan passes $ARGUMENTS to the route unchanged, so the whole primary request reaches it', async () => {
    const plan = await readFile(path.join(SKILLS_DIR, 'plan', 'SKILL.md'), 'utf8');
    assert.ok(plan.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start plan "$ARGUMENTS"'));
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

  it('points authoring skills at the inline shortlist, not at a second locate call', async () => {
    for (const relative of ['investigate/SKILL.md', 'plan/SKILL.md', 'task/SKILL.md']) {
      const content = await readFile(path.join(SKILLS_DIR, relative), 'utf8');
      assert.doesNotMatch(content, /\blocate\b/, `${relative} must not advertise locate`);
    }
  });
});

describe('P2.3 task skill', () => {
  async function task(): Promise<string> {
    return readFile(path.join(SKILLS_DIR, 'task', 'SKILL.md'), 'utf8');
  }

  it('07-M1 stays within 2,560 bytes, is user-invoked only and keeps its tool grant', async () => {
    const raw = await task();
    assert.ok(Buffer.byteLength(raw) <= 2560, `${Buffer.byteLength(raw)} bytes`);
    const fm = frontmatter(raw, 'task/SKILL.md');
    assert.equal(fm['disable-model-invocation'], true);
    assert.equal(requiredString(fm, 'allowed-tools', 'task/SKILL.md'), 'Read, Grep, Glob, Edit(**), Write(**), Bash(node *ambicode.mjs*), Bash(git status*), Bash(git diff*)');
    requiredString(fm, 'argument-hint', 'task/SKILL.md');
    assert.ok(raw.includes('$ARGUMENTS'), 'task/SKILL.md must reference $ARGUMENTS explicitly');
  });

  it('07-M1 takes a repeatable --requirement, never a plural --requirements', async () => {
    const content = await task();
    const hint = requiredString(frontmatter(content, 'task/SKILL.md'), 'argument-hint', 'task/SKILL.md');
    assert.match(hint, /--requirement <url>/);
    for (const usage of [...[...content.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]), hint]) assert.ok(!/--requirements\b/.test(usage), usage);
  });

  it('07-M1 names the four judgments', async () => {
    const content = (await task()).replace(/\s+/g, ' ');
    for (const judgment of [/smallest coherent change/i, /reuse before adding/i, /never weaken a test/i, /ask when a finding expands scope/i]) assert.match(content, judgment);
  });

  it('07-M1 states the git boundary with its reason', async () => {
    const content = (await task()).replace(/\s+/g, ' ');
    assert.match(content, /never commit, push, create a merge request, publish a comment, merge, deploy, or transition a ticket/i);
    assert.match(content, /those are the user's decisions/i);
    assert.match(content, /never stash, reset, checkout or clean/i);
    assert.match(requiredString(frontmatter(await task(), 'task/SKILL.md'), 'description', 'task/SKILL.md'), /never commits, pushes, or publishes/i);
  });

  it('07-M1 asks for Done and Remaining in prose and the generated sections as printed', async () => {
    const content = (await task()).replace(/\s+/g, ' ');
    assert.match(content, /\*\*Done\*\*/);
    assert.match(content, /\*\*Remaining\*\*/);
    assert.match(content, /generated Evidence and Not verified sections, exactly as the report step prints them/);
  });

  it('07-M1 has the fallback start line and no LSP or prepare', async () => {
    const content = await task();
    assert.ok(content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start task "$ARGUMENTS"'));
    assert.doesNotMatch(content, /\bLSP\b|findReferences|\bprepare\b/);
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

describe('07-M2 task outcomes', () => {
  it('07-M2: review outcomes document every code the task commands add, each as a backticked code', async () => {
    const outcomes = await readFile(path.join(SKILLS_DIR, 'review', 'references', 'outcomes.md'), 'utf8');
    const emitted = await emittedErrorCodes();
    for (const code of ['check-limit', 'check-only-unauthorized', 'baseline-missing', 'review-not-accepted', 'format-unconfigured', 'ambiguous-project', 'bad-argument']) {
      assert.ok(outcomes.includes(`\`${code}\``), `${code} is not documented in outcomes.md`);
      // format-unconfigured is printed with exit 0, not raised.
      if (code !== 'format-unconfigured') assert.ok(emitted.has(code), `${code} is no longer raised by the CLI`);
    }
  });
});

describe('F7 rules confirmation gate', () => {
  it('09-T2/09-T6: the rules table is answered before any pack goes live, and the skill states how to undo one', async () => {
    const route = YAML.parse(await readFile(path.join(repositoryRoot, 'routes', 'rules.yaml'), 'utf8')) as { steps: { id: string; when?: string; gate?: { acting?: string[]; default?: string } }[] };
    const ids = route.steps.map((step) => step.id);
    const table = route.steps.find((step) => step.id === 'rules-table');
    assert.ok(table?.gate?.acting?.includes('Apply all'));
    assert.notEqual(table?.gate?.default, 'Apply all');
    assert.ok(ids.indexOf('rules-table') < ids.indexOf('apply'), 'a gate after the change it guards cannot stop it');
    assert.equal(route.steps.find((step) => step.id === 'apply')?.when, 'gate.rules-table.is(Apply all)');
    const content = await readFile(path.join(SKILLS_DIR, 'rules', 'SKILL.md'), 'utf8');
    assert.match(content, /rules revert <pack-id>` undoes one pack/);
  });
});

describe('09-R3/09-W1: the init skill and the init route steps', () => {
  it('09-R3: the init body stays within 1,536 bytes, starts the route, and grants no config or ignore writes', async () => {
    const content = await readFile(path.join(SKILLS_DIR, 'init', 'SKILL.md'), 'utf8');
    const fm = frontmatter(content, 'init/SKILL.md');
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert.ok(Buffer.byteLength(body) <= 1536, `${Buffer.byteLength(body)} bytes`);
    assert.match(body, /route start init/);
    assert.equal(fm['disable-model-invocation'], true);
    assert.doesNotMatch(requiredString(fm, 'allowed-tools', 'init/SKILL.md'), /Write|Edit/);
  });

  it('09-W1: each init step instruction is at most 1,500 characters', async () => {
    for (const file of (await readdir(path.join(repositoryRoot, 'routes', 'steps'))).filter((name) => name.startsWith('init-'))) {
      const text = await readFile(path.join(repositoryRoot, 'routes', 'steps', file), 'utf8');
      assert.ok(text.length <= 1500, `${file}: ${text.length} characters`);
    }
  });
});
