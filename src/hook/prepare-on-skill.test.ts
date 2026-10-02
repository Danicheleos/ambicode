import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '../cli/args.ts';
import { INIT_OPTIONS, runInit } from '../cli/commands/init.ts';
import { PREPARE_OPTIONS, runPrepare } from '../cli/commands/prepare.ts';
import { createRuntime } from '../composition/root.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { READING_ORDER } from '../code-intelligence/navigation.ts';
import { runHook } from './run-hook.ts';

async function initializedRepo(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders/service.ts', 'export function reserveStock(orderId: string) { return orderId; }\n');
  await repo.write('src/unrelated.ts', 'export const x = 0;\n');
  await repo.commitAll('initial');
  await runInit(await createRuntime({ cwd: repo.root }), parseArgs('init', [], INIT_OPTIONS));
  return repo;
}

function skillCall(cwd: string, skill: string, args: string | undefined): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    session_id: randomUUID(),
    cwd,
    tool_name: 'Skill',
    tool_input: { skill, ...(args === undefined ? {} : { args }) },
  });
}

async function contextOf(cwd: string, skill: string, args: string | undefined): Promise<string | null> {
  const runtime = await createRuntime({ cwd });
  const output = (await runHook(runtime, skillCall(cwd, skill, args))) as {
    hookSpecificOutput?: { hookEventName: string; additionalContext: string };
  };
  if (output.hookSpecificOutput === undefined) return null;
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
  return output.hookSpecificOutput.additionalContext;
}

function preparedJson(context: string): { navigation: { shortlist?: { terms: string[]; candidates: { path: string }[] } }; activity?: string } {
  const start = context.indexOf('\n{');
  return JSON.parse(context.slice(start + 1));
}

describe('PostToolUse on the Skill tool runs prepare by construction', () => {
  it('hands investigate the prepare output, with a shortlist taken from the skill args', async () => {
    const repo = await initializedRepo();
    try {
      const context = await contextOf(repo.root, 'ambicode:investigate', 'How does reserveStock in the orders service handle an order?');
      assert.ok(context !== null);
      assert.match(context, /^AMBICODE ran `prepare --activity investigate --json/);
      assert.match(context, /do not run it again/i);
      assert.match(context, /ToolSearch select:LSP/);
      assert.match(context, /link-block/);
      assert.match(context, /Whole-file Read is the last resort/);
      const prepared = preparedJson(context);
      assert.ok(prepared.navigation.shortlist?.terms.some((term) => /reserveStock/i.test(term)));
      assert.equal(prepared.navigation.shortlist?.candidates[0]?.path, 'src/orders/service.ts');
    } finally {
      await repo.dispose();
    }
  });

  it('puts the request\'s task slug in the prepare output, so every skill for it names one directory', async () => {
    const repo = await initializedRepo();
    try {
      const context = (await contextOf(repo.root, 'ambicode:investigate', 'How does reserveStock in the orders service handle an order?')) ?? '';
      const task = (preparedJson(context) as { task?: { slug: string; directory: string } }).task;
      assert.equal(task?.slug, 'reservestock-orders-service-handle-order');
      assert.equal(task?.directory, '.ambicode/task/reservestock-orders-service-handle-order');
      assert.match(context, /task\.slug, when present, is the --task for note save and review/);
      const deferred = (await contextOf(repo.root, 'ambicode:plan', 'ORD-17 which files would this change touch?')) ?? '';
      assert.match(deferred, /--task-open "ORD-17 which files would this change touch\?"/);
    } finally {
      await repo.dispose();
    }
  });

  it('uses the skill\'s own activity for plan and task', async () => {
    const repo = await initializedRepo();
    try {
      for (const activity of ['plan', 'task']) {
        const context = await contextOf(repo.root, `ambicode:${activity}`, 'add retries to reserveStock');
        assert.match(context ?? '', new RegExp(`--activity ${activity} --json`));
      }
    } finally {
      await repo.dispose();
    }
  });

  it('finds the repository one directory below the session directory', async () => {
    const repo = await initializedRepo();
    const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-session-'));
    try {
      await rename(repo.root, path.join(parent, 'repo'));
      const context = await contextOf(parent, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE ran `prepare/);
      assert.equal(preparedJson(context ?? '').navigation.shortlist?.candidates[0]?.path, 'src/orders/service.ts');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('prefers the configured repository below the session directory when the session directory is itself an unconfigured repository', async () => {
    // The eval sandbox's home directory is a git work tree that holds the case's repo/ (2026-09-30 trace).
    const outer = await TempRepo.create();
    const inner = await initializedRepo();
    try {
      await rename(inner.root, path.join(outer.root, 'repo'));
      const context = await contextOf(outer.root, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE ran `prepare/);
      assert.match(context ?? '', /in `repo`/);
    } finally {
      await outer.dispose();
    }
  });

  it('names the session repository\'s own refusal when no configured repository exists anywhere', async () => {
    const outer = await TempRepo.create();
    try {
      await outer.write('a.txt', 'x\n');
      await outer.commitAll('initial');
      const context = await contextOf(outer.root, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE could not run prepare for you: config-missing: .*init skill first\. Run it yourself/);
    } finally {
      await outer.dispose();
    }
  });

  it('still prepares policy when the args carry no term', async () => {
    const repo = await initializedRepo();
    try {
      const context = await contextOf(repo.root, 'ambicode:plan', undefined);
      assert.match(context ?? '', /^AMBICODE ran `prepare --activity plan --json`/);
      assert.equal(preparedJson(context ?? '').navigation.shortlist, undefined);
    } finally {
      await repo.dispose();
    }
  });

  it('says so, and tells the model to run prepare itself, when it cannot', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'ambicode-norepo-'));
    const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-two-'));
    const one = await initializedRepo();
    const two = await initializedRepo();
    try {
      const none = await contextOf(empty, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(none ?? '', /^AMBICODE could not run prepare for you: no git repository/);
      assert.match(none ?? '', /run it yourself/i);

      await mkdir(parent, { recursive: true });
      await rename(one.root, path.join(parent, 'a'));
      await rename(two.root, path.join(parent, 'b'));
      const ambiguous = await contextOf(parent, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(ambiguous ?? '', /^AMBICODE could not run prepare for you: 2 configured git repositories/);
    } finally {
      await rm(empty, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('reports the helper\'s own refusal instead of staying silent', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('a.txt', 'x\n');
      await repo.commitAll('initial');
      const context = await contextOf(repo.root, 'ambicode:investigate', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE could not run prepare for you: \w[\w-]*/);
    } finally {
      await repo.dispose();
    }
  });

  it('ignores every other skill and every other tool', async () => {
    const repo = await initializedRepo();
    try {
      for (const skill of ['ambicode:review', 'ambicode:init', 'ambicode:rules', 'code-review', 'investigate']) {
        assert.equal(await contextOf(repo.root, skill, 'x'), null, skill);
      }
      const runtime = await createRuntime({ cwd: repo.root });
      const other = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 's', cwd: repo.root, tool_name: 'Bash', tool_input: {} });
      assert.deepEqual(await runHook(runtime, other), {});
    } finally {
      await repo.dispose();
    }
  });

  it('prepares for a typed slash command too, which Claude Code expands without a Skill tool call', async () => {
    const repo = await initializedRepo();
    try {
      const run = async (prompt: string): Promise<string> => {
        const runtime = await createRuntime({ cwd: repo.root });
        const raw = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: randomUUID(), cwd: repo.root, prompt });
        const output = (await runHook(runtime, raw)) as { hookSpecificOutput?: { additionalContext: string } };
        return output.hookSpecificOutput?.additionalContext ?? '';
      };
      const typed = await run('/ambicode:investigate How does reserveStock in the orders service handle an order?');
      assert.match(typed, /AMBICODE ran `prepare --activity investigate --json`/);
      assert.match(typed, /Whole-file Read is the last resort/);
      assert.equal(preparedJson(typed).navigation.shortlist?.candidates[0]?.path, 'src/orders/service.ts');
      assert.doesNotMatch(await run('/ambicode:review --branch'), /AMBICODE ran/);
      assert.doesNotMatch(await run('how does reserveStock work?'), /AMBICODE ran/);
      assert.match(await run('/ambicode:plan ORD-17 add a limit'), /did not run prepare: your skill args name a ticket/);
    } finally {
      await repo.dispose();
    }
  });

  it('keeps its header short, because the payload plus header must stay under the 9,800 characters measured to arrive whole', async () => {
    const repo = await initializedRepo();
    try {
      const context = (await contextOf(repo.root, 'ambicode:investigate', 'What does reserveStock do?')) ?? '';
      assert.ok(context.includes(READING_ORDER));
      const header = context.slice(0, context.indexOf('\n{')).replace(`\n${READING_ORDER}`, '');
      assert.ok(header.length <= 260, `${header.length} characters: ${header}`);
    } finally {
      await repo.dispose();
    }
  });

  it('drops the lowest-ranked candidates until the message fits the 9,800 characters that arrive whole', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
      const directory = `src/${Array(3).fill('reserve-stock-handling-'.repeat(8)).join('/')}`;
      for (let index = 1; index <= 20; index += 1) {
        await repo.write(`${directory}/module-${String(index).padStart(2, '0')}.ts`, 'export const reserveStock = 1;\n');
      }
      // A term reaching 60% of the files is ignored as describing the project, so most files must not match.
      for (let index = 1; index <= 40; index += 1) await repo.write(`src/unrelated-${index}.ts`, `export const x${index} = 0;\n`);
      await repo.commitAll('initial');
      await runInit(await createRuntime({ cwd: repo.root }), parseArgs('init', [], INIT_OPTIONS));

      const unfitted = await runPrepare(await createRuntime({ cwd: repo.root }), parseArgs('prepare', ['--activity', 'investigate', '--json', '--term', 'reserveStock'], PREPARE_OPTIONS));
      const all = JSON.stringify(unfitted.data).length;
      assert.ok(all > 9_800, `the fixture must overflow on its own, but the payload is ${all} characters`);

      const context = (await contextOf(repo.root, 'ambicode:investigate', 'reserveStock')) ?? '';
      assert.ok(context.length <= 9_800, `${context.length} characters`);
      const kept = preparedJson(context).navigation.shortlist?.candidates.length ?? 0;
      assert.ok(kept > 0 && kept < 15, `kept ${kept} candidates`);
    } finally {
      await repo.dispose();
    }
  });

  it('says so, instead of preparing from a bare ticket key, and leaves the preparing to the fetch', async () => {
    const repo = await initializedRepo();
    try {
      for (const args of ['VS-001', 'https://example.atlassian.net/browse/ORD-17', 'ORD-17 which files would this change touch?']) {
        const context = (await contextOf(repo.root, 'ambicode:investigate', args)) ?? '';
        assert.match(context, /^AMBICODE did not run prepare: your skill args name a ticket/, args);
        assert.ok(!context.includes('\n{'), 'no prepare payload');
      }
    } finally {
      await repo.dispose();
    }
  });
});

describe('PostToolUse on an Atlassian read tool prepares from the ticket text', () => {
  const comment = { id: '21338', body: 'merged <custom data-type="smartlink" data-id="id-0">https://git.example.com/org/web/-/merge_requests/2287</custom> by 2e85882c-a5c4-4172-936e-e485b219000a', created: '2026-03-20T16:27:05.286+0000' };
  const ticket = (text: string) => [{ type: 'text', text: JSON.stringify({ key: 'ORD-17', fields: { customfield_10001: 'x', description: { content: [{ text }] }, comment: { comments: [comment] } } }) }];

  async function afterFetch(cwd: string, toolName: string, response: unknown, session = randomUUID()): Promise<string | null> {
    const runtime = await createRuntime({ cwd });
    const output = (await runHook(
      runtime,
      JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd, tool_name: toolName, tool_input: {}, tool_response: response }),
    )) as { hookSpecificOutput?: { additionalContext: string } };
    return output.hookSpecificOutput?.additionalContext ?? null;
  }

  it('takes its terms from the ticket text, however the server nests it, and carries no rules', async () => {
    const repo = await initializedRepo();
    try {
      const context = await afterFetch(repo.root, 'mcp__claude_ai_Atlassian_Rovo__getJiraIssue', ticket('Why does reserveStock double count an order?'));
      assert.ok(context !== null);
      assert.match(context, /^AMBICODE ran `prepare --activity investigate --json`.*getJiraIssue/);
      const prepared = preparedJson(context) as { navigation: { shortlist?: { terms: string[]; candidates: { path: string }[] } }; policy?: { rulesOmitted?: unknown } };
      assert.equal(prepared.navigation.shortlist?.candidates[0]?.path, 'src/orders/service.ts');
      assert.ok(!prepared.navigation.shortlist?.terms.some((term) => /customfield|fields|^text$|data-|smartlink|merge_requests|git\.example|2e85882c|2026-03/i.test(term)), `noise in ${prepared.navigation.shortlist?.terms.join(', ')}`);
    } finally {
      await repo.dispose();
    }
  });

  it('names the task after the ticket the call asked for, though the response carries no usable key', async () => {
    const repo = await initializedRepo();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = (await runHook(
        runtime,
        JSON.stringify({ hook_event_name: 'PostToolUse', session_id: randomUUID(), cwd: repo.root, tool_name: 'mcp__claude_ai_Atlassian_Rovo__getJiraIssue', tool_input: { issueIdOrKey: 'ORD-17' }, tool_response: ticket('Why does reserveStock double count an order?') }),
      )) as { hookSpecificOutput?: { additionalContext: string } };
      const task = (preparedJson(output.hookSpecificOutput?.additionalContext ?? '') as { task?: { slug: string } }).task;
      assert.equal(task?.slug, 'ORD-17');
    } finally {
      await repo.dispose();
    }
  });

  it('prepares from the Atlassian plugin\'s server, whose tool names carry a plugin_ prefix, and honors a binding to another server', async () => {
    const repo = await initializedRepo();
    try {
      const response = ticket('Why does reserveStock double count an order?');
      const tool = 'mcp__plugin_atlassian_atlassian__getJiraIssue';
      assert.ok((await afterFetch(repo.root, tool, response)) !== null);
      const config = path.join(repo.root, '.ambicode', 'config.yaml');
      await writeFile(config, (await readFile(config, 'utf8')).replace('mcpServer: null', 'mcpServer: claude_ai_Atlassian_Rovo'));
      assert.equal(await afterFetch(repo.root, tool, response), null);
      assert.ok((await afterFetch(repo.root, 'mcp__claude_ai_Atlassian_Rovo__getJiraIssue', response)) !== null);
    } finally {
      await repo.dispose();
    }
  });

  it('stays silent for Atlassian tools that are not a ticket: the site lookup that precedes a fetch gave read-write terms and a 9,899-character payload', async () => {
    const repo = await initializedRepo();
    try {
      const sites = [{ type: 'text', text: JSON.stringify({ data: { resources: [{ cloudId: 'c1', url: 'https://example.atlassian.net', products: [{ id: 'jira', access: 'read-write' }] }] } }) }];
      for (const tool of ['mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources', 'mcp__plugin_atlassian_atlassian__getJiraIssueRemoteIssueLinks', 'mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue']) {
        assert.equal(await afterFetch(repo.root, tool, sites), null, tool);
      }
    } finally {
      await repo.dispose();
    }
  });

  it('reads the summary and description, not the assignee, ticket keys or build counters a Jira response also carries', async () => {
    const repo = await initializedRepo();
    try {
      const response = [{ type: 'text', text: JSON.stringify({ data: { key: 'ORD-17', fields: {
        summary: 'Why does reserveStock double count an order?',
        description: 'Orders are counted twice after a retry.',
        assignee: { accountId: '712020:3088', displayName: 'Pat.Smith' },
        parent: { key: 'ORD-9', fields: { summary: 'Order accounting' } },
        customFields: { Development: { value: { failedBuildCount: 1, unknownBuildCount: 0, byInstanceType: {} } } },
      } } }) }];
      const context = await afterFetch(repo.root, 'mcp__plugin_atlassian_atlassian__getJiraIssue', response);
      assert.ok(context !== null);
      const prepared = preparedJson(context) as { navigation: { shortlist?: { terms: string[]; candidates: { path: string }[] } } };
      const terms = prepared.navigation.shortlist?.terms ?? [];
      assert.ok(!terms.some((term) => /pat|smith|ORD-|BuildCount|byInstanceType|dataType/i.test(term)), `noise in ${terms.join(', ')}`);
      assert.equal(prepared.navigation.shortlist?.candidates[0]?.path, 'src/orders/service.ts');
    } finally {
      await repo.dispose();
    }
  });

  it('stays silent for other servers, for search, and for a ticket it already prepared from', async () => {
    const repo = await initializedRepo();
    try {
      const response = ticket('Why does reserveStock double count an order?');
      assert.equal(await afterFetch(repo.root, 'mcp__github__get_issue', response), null);
      assert.equal(await afterFetch(repo.root, 'mcp__atlassian__searchJiraIssues', response), null);
      const session = randomUUID();
      assert.ok((await afterFetch(repo.root, 'mcp__atlassian__getJiraIssue', response, session)) !== null);
      assert.equal(await afterFetch(repo.root, 'mcp__atlassian__getJiraIssue', response, session), null);
    } finally {
      await repo.dispose();
    }
  });
});
