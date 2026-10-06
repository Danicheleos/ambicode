import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#cli/args';
import { initConfig } from '#testing/fixtures/init-config';
import { runPrepare } from '#cli/commands/prepare/prepare';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { prepareForActivity } from './prepare-on-skill.ts';
import { runHook } from './run-hook.ts';
import { PREPARE_OPTIONS } from '#types/cli';

async function initializedRepo(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders/service.ts', 'export function reserveStock(orderId: string) { return orderId; }\n');
  await repo.write('src/unrelated.ts', 'export const x = 0;\n');
  await repo.commitAll('initial');
  await initConfig(await createRuntime({ cwd: repo.root }));
  return repo;
}

async function hookContextOf(cwd: string, prompt: string): Promise<string> {
  const runtime = await createRuntime({ cwd });
  const output = (await runHook(runtime, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: randomUUID(), cwd, prompt }))) as {
    hookSpecificOutput?: { hookEventName: string; additionalContext: string };
  };
  return output.hookSpecificOutput?.additionalContext ?? '';
}

async function contextOf(cwd: string, skill: string, args: string | undefined): Promise<string | null> {
  const output = await prepareForActivity(await createRuntime({ cwd }), cwd, skill.replace(/^ambicode:/, ''), args ?? '');
  const context = output.hookSpecificOutput?.additionalContext ?? '';
  const at = context.search(/AMBICODE (ran|did not run|could not run)/);
  return at < 0 ? null : context.slice(at);
}

function preparedJson(context: string): { navigation: { shortlist?: { terms: string[]; candidates: { path: string }[] } }; activity?: string } {
  const start = context.indexOf('\n{');
  return JSON.parse(context.slice(start + 1));
}

describe('prepare for a skill activity, and no slash command left that triggers it', () => {
  it('hands task the prepare output, with a shortlist taken from the skill args', async () => {
    const repo = await initializedRepo();
    try {
      const context = await contextOf(repo.root, 'ambicode:task', 'How does reserveStock in the orders service handle an order?');
      assert.ok(context !== null);
      assert.match(context, /^AMBICODE ran `prepare --activity task --json/);
      assert.match(context, /do not run it again/i);
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
      const context = (await contextOf(repo.root, 'ambicode:task', 'How does reserveStock in the orders service handle an order?')) ?? '';
      const task = (preparedJson(context) as { task?: { slug: string; directory: string } }).task;
      assert.equal(task?.slug, 'reservestock-orders-service-handle-order');
      assert.equal(task?.directory, '.ambicode/task/reservestock-orders-service-handle-order');
      assert.match(context, /task\.slug, when present, is the --task for note save and review/);
      const deferred = (await contextOf(repo.root, 'ambicode:task', 'ORD-17 which files would this change touch?')) ?? '';
      assert.match(deferred, /--task-open "ORD-17 which files would this change touch\?"/);
    } finally {
      await repo.dispose();
    }
  });

  it('07-R1: leaves a typed /ambicode:task and /ambicode:plan to the route launch and prepares for neither', async () => {
    const repo = await initializedRepo();
    try {
      for (const prompt of ['/ambicode:task add retries to reserveStock', '/ambicode:plan add retries to reserveStock']) {
        assert.doesNotMatch(await hookContextOf(repo.root, prompt), /AMBICODE (ran|did not run|could not run) prepare/, prompt);
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
      const context = await contextOf(parent, 'ambicode:task', 'What does reserveStock do?');
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
      const context = await contextOf(outer.root, 'ambicode:task', 'What does reserveStock do?');
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
      const context = await contextOf(outer.root, 'ambicode:task', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE could not run prepare for you: config-missing: .*init skill first\. Run it yourself/);
    } finally {
      await outer.dispose();
    }
  });

  it('still prepares policy when the args carry no term', async () => {
    const repo = await initializedRepo();
    try {
      const context = await contextOf(repo.root, 'ambicode:task', undefined);
      assert.match(context ?? '', /^AMBICODE ran `prepare --activity task --json`/);
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
      const none = await contextOf(empty, 'ambicode:task', 'What does reserveStock do?');
      assert.match(none ?? '', /^AMBICODE could not run prepare for you: no git repository/);
      assert.match(none ?? '', /run it yourself/i);

      await mkdir(parent, { recursive: true });
      await rename(one.root, path.join(parent, 'a'));
      await rename(two.root, path.join(parent, 'b'));
      const ambiguous = await contextOf(parent, 'ambicode:task', 'What does reserveStock do?');
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
      const context = await contextOf(repo.root, 'ambicode:task', 'What does reserveStock do?');
      assert.match(context ?? '', /^AMBICODE could not run prepare for you: \w[\w-]*/);
    } finally {
      await repo.dispose();
    }
  });

  it('ignores every typed command, every other tool and the Skill tool', async () => {
    const repo = await initializedRepo();
    try {
      for (const prompt of ['/ambicode:review --branch', '/ambicode:init', '/ambicode:investigate x', '/ambicode:task ORD-17 add a limit', 'how does reserveStock work?']) {
        assert.doesNotMatch(await hookContextOf(repo.root, prompt), /AMBICODE (ran|did not run|could not run) prepare/, prompt);
      }
      const runtime = await createRuntime({ cwd: repo.root });
      for (const tool of ['Bash', 'Skill']) {
        const other = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 's', cwd: repo.root, tool_name: tool, tool_input: { skill: 'ambicode:task', args: 'x' } });
        assert.deepEqual(await runHook(runtime, other), {});
      }
    } finally {
      await repo.dispose();
    }
  });

  it('keeps its header short, because the payload plus header must stay under the 9,800 characters measured to arrive whole', async () => {
    const repo = await initializedRepo();
    try {
      const context = (await contextOf(repo.root, 'ambicode:task', 'What does reserveStock do?')) ?? '';
      const header = context.slice(0, context.indexOf('\n{'));
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
      await initConfig(await createRuntime({ cwd: repo.root }));

      const unfitted = await runPrepare(await createRuntime({ cwd: repo.root }), parseArgs('prepare', ['--activity', 'investigate', '--json', '--term', 'reserveStock'], PREPARE_OPTIONS));
      const all = JSON.stringify(unfitted.data).length;
      assert.ok(all > 9_800, `the fixture must overflow on its own, but the payload is ${all} characters`);

      const context = (await contextOf(repo.root, 'ambicode:task', 'reserveStock')) ?? '';
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
        const context = (await contextOf(repo.root, 'ambicode:task', args)) ?? '';
        assert.match(context, /^AMBICODE did not run prepare: your skill args name a ticket/, args);
        assert.ok(!context.includes('\n{'), 'no prepare payload');
      }
    } finally {
      await repo.dispose();
    }
  });
});
