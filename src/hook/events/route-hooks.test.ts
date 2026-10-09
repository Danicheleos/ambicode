import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REGISTERED_HOOK_ENTRIES, REGISTERED_HOOK_EVENTS, type HookDeps } from '#types/hook';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { answerGates } from './gate-answer.ts';
import { splitLaunch } from './prompt-launch.ts';
import { runHook } from './run-hook.ts';
import { REPO_ROOT } from '#testing/paths';
import type { FileSystem } from '#types/platform/ports';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';
import { EVAL_EXPORT_VARIABLE } from '#harness/engine/stop';

const deps = (plan: PlanFixture): HookDeps => ({ pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) });
const hook = (plan: PlanFixture, event: Record<string, unknown>, session = SESSION_A) =>
  runHook(plan.fx.runtime, JSON.stringify({ session_id: session, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, ...event }), deps(plan)) as Promise<{ hookSpecificOutput?: { additionalContext: string }; decision?: string; reason?: string }>;
const prompt = (plan: PlanFixture, text: string, extra: Record<string, unknown> = {}) => hook(plan, { hook_event_name: 'UserPromptSubmit', prompt: text, ...extra });
const context = (output: { hookSpecificOutput?: { additionalContext: string } }): string => output.hookSpecificOutput?.additionalContext ?? '';

describe('03-H1/03-H8 the hook matrix', () => {
  it('registers seven events and fourteen handler entries, and the docs say so', async () => {
    const manifest = JSON.parse(await readFile(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8')) as { hooks: Record<string, { matcher?: string; hooks: unknown[] }[]> };
    assert.deepEqual(Object.keys(manifest.hooks), [...REGISTERED_HOOK_EVENTS]);
    const entries = Object.values(manifest.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks));
    assert.equal(entries.length, REGISTERED_HOOK_ENTRIES);
    assert.deepEqual(manifest.hooks['PostToolUse']!.map((group) => group.matcher), ['mcp__.*', 'WebFetch', 'AskUserQuestion']);
    assert.ok(manifest.hooks['Stop'] !== undefined);
    for (const doc of ['docs/compatibility.md', 'docs/release-checklist.md']) {
      const text = (await readFile(path.join(REPO_ROOT, doc), 'utf8')).replace(/\s+/g, ' ');
      assert.match(text, /seven events/, doc);
      assert.match(text, /fourteen handler entries/, doc);
    }
  });
});

describe('03-H3 launch', () => {
  it('a /ambicode:<skill> prompt with a shipped route starts it and returns the first step as context; other prompts launch nothing', async () => {
    const plan = await planFixture();
    try {
      const launched = await prompt(plan, '/ambicode:plan add a limit to the cart --task ORD-17');
      assert.match(context(launched), /\[ambicode\] plan · task ORD-17 · step design/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 1);
      const plain = await prompt(plan, 'which files handle the cart?');
      assert.doesNotMatch(context(plain), /\[ambicode\]/);
      const ticket = await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'mcp__atlassian__getJiraIssue', tool_response: { content: [{ type: 'text', text: '{"key":"ORD-17"}' }] } });
      assert.deepEqual(ticket, {});
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('03b-M13 takes known options before and after the request, keeps the request as typed, honours a trusted --answer, and states a failure to start', async () => {
    assert.deepEqual(splitLaunch('--headless Add "a limit"\nto  cart --task ORD-17'), { args: ['--headless', '--task', 'ORD-17'], text: 'Add "a limit"\nto  cart' });
    assert.deepEqual(splitLaunch('--headless -x keeps "Bar baz" --task'), { args: ['--headless'], text: '-x keeps "Bar baz" --task' });
    assert.deepEqual(splitLaunch('use --fresh mode --answer \'a=b c\''), { args: ['--answer', 'a=b c'], text: 'use --fresh mode' });
    // The task eval's prompt (evals/scripts/src/harness/eval-answers.mjs): two quoted answers, one with an em dash.
    assert.deepEqual(splitLaunch('--headless --answer "draft-ok=implement anyway" --answer "review-offer=skip — verification incomplete" Fix the bug'), {
      args: ['--headless', '--answer', 'draft-ok=implement anyway', '--answer', 'review-offer=skip — verification incomplete'],
      text: 'Fix the bug',
    });
    const plan = await planFixture();
    try {
      await prompt(plan, '/ambicode:plan "add a limit" --task ORD-17 --answer plan-accept=Accept');
      const route = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      assert.deepEqual([route['channel'], route['trusted']], ['hook', true]);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 1);
      const busy = await prompt(plan, '/ambicode:plan "add a limit" --task ORD-17', {}).then(() => hook(plan, { hook_event_name: 'UserPromptSubmit', prompt: '/ambicode:plan other --task ORD-17' }, SESSION_B));
      assert.match(context(busy), /could not start the plan route: route-busy/);
    } finally {
      await plan.dispose();
    }
  });

  it('03-H2: a subagent launches nothing and re-injects nothing', async () => {
    const plan = await planFixture();
    try {
      const output = await prompt(plan, '/ambicode:plan add a limit --task ORD-17', { agent_id: 'sub' });
      assert.doesNotMatch(context(output), /\[ambicode\] plan/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 0);
      assert.deepEqual(await hook(plan, { hook_event_name: 'Stop', agent_id: 'sub' }), {});
      assert.deepEqual(await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', agent_id: 'sub' }), {});
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H4 re-injection', () => {
  it('delivers the active step again once per epoch and writes nothing', async () => {
    const plan = await planFixture();
    try {
      await prompt(plan, '/ambicode:plan add a limit --task ORD-17');
      assert.doesNotMatch(context(await prompt(plan, 'continue')), /\[ambicode\] plan/, 'the start already delivered this epoch');
      await hook(plan, { hook_event_name: 'PostCompact' });
      const before = await plan.fx.ledger(PLAN_TASK);
      const again = await prompt(plan, 'continue');
      assert.match(context(again), /\[ambicode\] plan · task ORD-17 · step design/);
      assert.deepEqual(await plan.fx.ledger(PLAN_TASK), before);
      assert.doesNotMatch(context(await prompt(plan, 'continue')), /\[ambicode\] plan/);
    } finally {
      await plan.dispose();
    }
  });

  it('a step the CLI delivered in this epoch is not re-injected; one delivered before a compaction is', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      await plan.next();
      assert.doesNotMatch(context(await prompt(plan, 'go on')), /\[ambicode\]/);
      await hook(plan, { hook_event_name: 'PostCompact' });
      assert.match(context(await prompt(plan, 'go on')), /step plan-write/);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H5/03-L1..L4 AskUserQuestion', () => {
  const answered = (question: string, label: string, labels = ['Accept', 'Revise', 'Reject']) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question, options: labels.map((value) => ({ label: value })) }] },
    tool_response: { answers: { [question]: label } },
  });

  const deps2 = (plan: PlanFixture) => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer });
  const gateAsk = (plan: PlanFixture, event: object, platform?: { askBinding: 'supported' | 'unsupported'; answerContext: 'supported' | 'unsupported' }) =>
    answerGates(plan.fx.runtime, { session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, ...event } as never, deps2(plan), platform);

  it('03-L1/03-L3: with binding unsupported, nothing is recorded and nothing is returned', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = (await plan.prints()).at(-1)!;
      const before = await plan.fx.ledger(PLAN_TASK);
      assert.equal(await gateAsk(plan, answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept'), { askBinding: 'unsupported', answerContext: 'unsupported' }), null);
      assert.equal(await gateAsk(plan, answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept'), { askBinding: 'unsupported', answerContext: 'supported' }), null);
      assert.deepEqual(await plan.fx.ledger(PLAN_TASK), before);
    } finally {
      await plan.dispose();
    }
  });

  it('03-L1/03-L4: the shipped default is supported: a marker question binds for its gate and instance and returns the next step as context', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = (await plan.prints()).at(-1)!;
      const output = await hook(plan, answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept'));
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
      assert.deepEqual([acceptance['via'], acceptance['gate'], acceptance['instance'], acceptance['answer']], ['hook', 'plan-accept', print.id, 'Accept']);
      assert.notEqual(context(output), '');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('03-L2/03-H5: the observed PostToolUse payload (tool_input.answers, tool_response.questions/answers/annotations) binds the answer', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = (await plan.prints()).at(-1)!;
      const question = `Accept this plan? [ambicode gate plan-accept ${print.id}]`;
      const questions = [{ question, header: 'Plan', multiSelect: false, options: ['Accept', 'Revise', 'Reject'].map((label) => ({ label, description: `${label} the plan` })) }];
      const output = await hook(plan, {
        hook_event_name: 'PostToolUse',
        tool_name: 'AskUserQuestion',
        tool_use_id: 'toolu_synthetic',
        tool_input: { questions, answers: { [question]: 'Accept' } },
        tool_response: { questions, answers: { [question]: 'Accept' }, annotations: {} },
        duration_ms: 1,
      });
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
      assert.deepEqual([acceptance['via'], acceptance['instance'], acceptance['answer']], ['hook', print.id, 'Accept']);
      assert.notEqual(context(output), '');
    } finally {
      await plan.dispose();
    }
  });

  it('03-L4: a route next right after the hook delivered a gate re-shows that print once and adds no instance', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const first = (await plan.prints()).at(-1)!;
      const out = await hook(plan, answered(`Accept this plan? [ambicode gate plan-accept ${first.id}]`, 'Looks fine, rename the flag first'));
      const delivered = (await plan.prints()).at(-1)!;
      assert.match(context(out), new RegExp(`plan-accept ${delivered.id}`), 'the hook delivered the next gate');
      const count = (await plan.prints()).length;
      const again = await plan.fx.engine.advance({ task: PLAN_TASK, session: SESSION_A, cause: 'route-next', scratchpadDir: plan.fx.scratchpad });
      assert.match(again.text, new RegExp(`plan-accept ${delivered.id}`));
      assert.equal((await plan.prints()).length, count);
    } finally {
      await plan.dispose();
    }
  });

  it('03-G3/03-G4: a model-typed --answer of an acting option is refused while the hook marker path honours it', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = (await plan.prints()).at(-1)!;
      await plan.fx.engine.advance({ task: PLAN_TASK, session: SESSION_A, cause: 'route-next', answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'acting-needs-human');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 0);
      await hook(plan, answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept'));
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
    } finally {
      await plan.dispose();
    }
  });

  for (const [name, answerContext, expected] of [['binding supported, context unsupported', 'unsupported', false], ['both supported', 'supported', true]] as const) {
    it(`03-L2/03-L4 ${name}: the answer binds to the printed instance; the next step is returned only with answer context`, async () => {
      const plan = await planFixture();
      try {
        await plan.toGate();
        const print = (await plan.prints()).at(-1)!;
        const output = await answerGates(plan.fx.runtime, { session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, ...answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept') } as never, { engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }, { askBinding: 'supported', answerContext });
        const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
        assert.deepEqual([acceptance['via'], acceptance['instance'], acceptance['answer']], ['hook', print.id, 'Accept']);
        assert.equal(output !== null, expected);
        assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
      } finally {
        await plan.dispose();
      }
    });
  }

  it('03-G4: with the default flags a question without a marker binds nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const before = await plan.fx.ledger(PLAN_TASK);
      assert.deepEqual(await hook(plan, answered('Which database?', 'postgres')), {});
      assert.deepEqual(await plan.fx.ledger(PLAN_TASK), before);
    } finally {
      await plan.dispose();
    }
  });

  it('a question without a marker binds nothing; one repeating the gate text is an answer without a usable marker; a free-text answer is flagged', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const platform = { askBinding: 'supported', answerContext: 'unsupported' } as const;
      const run = (event: object) => answerGates(plan.fx.runtime, { session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, ...event } as never, { engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }, platform);
      await run(answered('Which database?', 'postgres'));
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).length, 0);
      await run(answered('Accept this plan?', 'Accept'));
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'no-instance');
      const print = (await plan.prints()).at(-1)!;
      await run(answered(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'maybe later'));
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'option-not-offered');
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H6 MCP capture', () => {
  it('with no active route it returns before any config load or ledger read', async () => {
    const plan = await planFixture();
    try {
      const reads: string[] = [];
      const fs: FileSystem = new Proxy(plan.fx.runtime.fs, { get: (target, key) => (typeof key === 'string' && key.startsWith('read') ? (...args: unknown[]) => (reads.push(String(args[0])), (target as never as Record<string, (...rest: unknown[]) => unknown>)[key]!(...args)) : (target as never as Record<string | symbol, unknown>)[key]) });
      const output = await runHook({ ...plan.fx.runtime, fs }, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, tool_name: 'mcp__atlassian__getJiraIssue', tool_response: {} }), deps(plan));
      assert.deepEqual(output, {});
      assert.deepEqual(reads.filter((file) => /config\.yaml|ledger\.jsonl/.test(file)), []);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H6 MCP capture with a route', () => {
  it('records the requirement the bound server returned for the active route, and nothing for another server', async () => {
    const plan = await planFixture({ config: CONFIG.replace('mcpServer: null', 'mcpServer: atlassian') });
    try {
      await prompt(plan, '/ambicode:plan ORD-17 add a limit --task ORD-17');
      const response = { content: [{ type: 'text', text: JSON.stringify({ key: 'ORD-17', fields: { summary: 'Limit', description: 'Cap the cart at 50 items.' } }) }] };
      await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'mcp__linear__getIssue', tool_response: response });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'requirement')).length, 0);
      assert.deepEqual(await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'mcp__claude_ai_Atlassian__getJiraIssue', tool_response: response }), {});
      const [entry] = await plan.fx.kinds(PLAN_TASK, 'requirement');
      assert.deepEqual([entry!['key'], entry!['relation'], entry!['capture']], ['ORD-17', 'asked', 'full']);
      assert.equal(entry!['route'], (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!.id);
    } finally {
      await plan.dispose();
    }
  });
});

describe('04-B hook binding', () => {
  it('04-B6: with no active route a candidate-named server is still ignored before any config load or ledger read', async () => {
    const plan = await planFixture();
    try {
      const reads: string[] = [];
      const fs: FileSystem = new Proxy(plan.fx.runtime.fs, { get: (target, key) => (typeof key === 'string' && key.startsWith('read') ? (...args: unknown[]) => (reads.push(String(args[0])), (target as never as Record<string, (...rest: unknown[]) => unknown>)[key]!(...args)) : (target as never as Record<string | symbol, unknown>)[key]) });
      const output = await runHook({ ...plan.fx.runtime, fs }, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, tool_name: 'mcp__claude_ai_Atlassian_Rovo__getJiraIssue', tool_response: {} }), deps(plan));
      assert.deepEqual(output, {});
      assert.deepEqual(reads.filter((file) => /config\.yaml|ledger\.jsonl/.test(file)), []);
    } finally {
      await plan.dispose();
    }
  });

  it('04-B2: with no server configured a candidate-named server is captured and another is not', async () => {
    const plan = await planFixture();
    try {
      await prompt(plan, '/ambicode:plan ORD-17 add a limit --task ORD-17');
      const response = { content: [{ type: 'text', text: JSON.stringify({ key: 'ORD-17', fields: { summary: 'Limit', description: 'Cap the cart at 50 items.' } }) }] };
      await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'mcp__linear__getIssue', tool_response: response });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'requirement')).length, 0);
      await hook(plan, { hook_event_name: 'PostToolUse', tool_name: 'mcp__claude_ai_Atlassian_Rovo__getJiraIssue', tool_response: response });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'requirement')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H7 SessionEnd', () => {
  it('removes the pointer, ended-route and stop cursors with the rest of the session state', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      await plan.fx.engine.stop(PLAN_TASK, SESSION_A, 'blocked', 'x', plan.fx.scratchpad);
      assert.ok((await plan.fx.pointer.readEnded(SESSION_A, plan.fx.scratchpad)) !== null);
      await hook(plan, { hook_event_name: 'SessionEnd' });
      assert.equal(await plan.fx.pointer.readEnded(SESSION_A, plan.fx.scratchpad), null);
      assert.equal(await plan.fx.pointer.read(SESSION_A, plan.fx.scratchpad), null);
    } finally {
      await plan.dispose();
    }
  });
});

describe('the eval export at Stop', () => {
  it('a route that ended on a CLI step before Stop is still exported', async () => {
    const plan = await planFixture();
    const exported = await plan.fx.runtime.fs.temporaryDirectory('ambicode-export-');
    process.env[EVAL_EXPORT_VARIABLE] = exported;
    try {
      await plan.toGate({ headless: true });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'exit')).at(-1)?.['reason'], 'done');
      await hook(plan, { hook_event_name: 'Stop' });
      const source = JSON.parse(await readFile(path.join(exported, SESSION_A, PLAN_TASK, 'source.json'), 'utf8')) as { complete: boolean };
      assert.equal(source.complete, true);
    } finally {
      delete process.env[EVAL_EXPORT_VARIABLE];
      await plan.fx.runtime.fs.remove(exported);
      await plan.dispose();
    }
  });

  it('a route that ended on a CLI step whose state files the Stop hook cannot see is found in the ledger, once', async () => {
    const plan = await planFixture();
    const exported = await plan.fx.runtime.fs.temporaryDirectory('ambicode-export-');
    const elsewhere = await plan.fx.runtime.fs.temporaryDirectory('ambicode-hook-state-');
    const errors: string[] = [];
    const write = process.stderr.write;
    process.env[EVAL_EXPORT_VARIABLE] = exported;
    process.stderr.write = ((chunk: string) => errors.push(String(chunk)) > 0) as typeof process.stderr.write;
    try {
      await plan.toGate({ headless: true });
      const stop = () => runHook(plan.fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: elsewhere }), deps(plan));
      await stop();
      const source = JSON.parse(await readFile(path.join(exported, SESSION_A, PLAN_TASK, 'source.json'), 'utf8')) as { complete: boolean };
      assert.equal(source.complete, true);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'hook')).filter((entry) => entry['name'] === 'stop').length, 1);
      await stop();
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'hook')).filter((entry) => entry['name'] === 'stop').length, 1, 'a later Stop leaves the ended route alone');
      assert.ok(errors.some((line) => line.startsWith('ambicode stop: skipped, no route pointer')), errors.join(''));
    } finally {
      process.stderr.write = write;
      delete process.env[EVAL_EXPORT_VARIABLE];
      await plan.fx.runtime.fs.remove(exported);
      await plan.fx.runtime.fs.remove(elsewhere);
      await plan.dispose();
    }
  });
});
