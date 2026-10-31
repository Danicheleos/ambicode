import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gapsOf } from '#modules/evidence/report/report';
import { runHook } from '#hook/events/run-hook';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { CHECK_TASK, CHECK_CONFIG } from '#testing/fixtures/check-fixture';
import { SESSION_A } from '#testing/fixtures/ids';
import { REPO_ROOT } from '#testing/paths';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const GAP = 'check-only-unauthorized: declined "approve" (acting-needs-human)';
const DECLINED = { kind: 'declined', gate: 'check-only-unauthorized', instance: null, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: 'app/e2e' };
const CHANGED = 'Changed:\n- src/orders.ts:2 seed the reduce so an empty list totals 0.\nChecks: app/unit: passed\nGaps: none';
const REPORT = '# Task report\n**Done**\n- src/orders.ts:2 the empty list now totals 0.\nChecks\n- app/unit: passed';

/** A subagent transcript as Claude Code writes it: JSON lines, the final report in one assistant entry. */
const transcript = (final: 'handback' | 'text', text: string): string => {
  const line = (type: string, content: unknown): string => JSON.stringify({ type, message: { role: type, content } });
  return [
    line('user', 'Implement the work described in work-change.md.'),
    line('assistant', [{ type: 'text', text: 'Reading the work file.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'route next --task ord-7' } }]),
    line('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'Step review-offer' }]),
    line('assistant', final === 'handback' ? [{ type: 'tool_use', id: 't2', name: 'SubagentHandback', input: { message: text } }] : [{ type: 'text', text }]),
  ].join('\n') + '\n';
};

async function withTask(body: (t: Fixture, send: (event: Record<string, unknown>) => Promise<unknown>, file: (form: 'handback' | 'text', text: string) => Promise<string>) => Promise<void>): Promise<void> {
  const t = await taskFixture();
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-transcript-'));
  const deps = { load: async () => ({ engine: t.fx.engine, routes: t.fx.routes }) };
  const send = (event: Record<string, unknown>): Promise<unknown> => runHook(t.fx.runtime, JSON.stringify({ session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, ...event }), deps);
  let serial = 0;
  const file = async (form: 'handback' | 'text', text: string): Promise<string> => {
    serial += 1;
    const target = path.join(scratch, `agent-${serial}.jsonl`);
    await writeFile(target, transcript(form, text));
    return target;
  };
  try {
    await body(t, send, file);
  } finally {
    await rm(scratch, { recursive: true, force: true });
    await t.fx.dispose();
  }
}

const stopped = (transcriptPath: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'ambicode:implementer', agent_transcript_path: transcriptPath, ...extra });
const returned = { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'ambicode:implementer', prompt: 'Implement it' }, tool_response: { status: 'completed', content: [{ type: 'text', text: 'Changed: ...' }] } };
const notes = async (t: Fixture, kind: string) => (await t.kinds('note')).filter((entry) => entry['note'] === kind);
const REPORT_PATH = `.ambicode/tasks/${CHECK_TASK}/report.md`;

/** The implementer's route next, the last call of its brief: the green check is held, then the step after it prints. */
async function implementerNext(t: Fixture): Promise<Awaited<ReturnType<Fixture['next']>>> {
  await t.edit();
  await t.held('green');
  return t.next();
}

describe('the implementer closes its own step and writes the report', { concurrency: 4 }, () => {
  it('SubagentStop saves a Changed: message as a note of the live route, from either transcript form', async () => {
    for (const form of ['handback', 'text'] as const) {
      await withTask(async (t, send, file) => {
        await t.start();
        assert.equal((await implementerNext(t)).position, 'review-offer');
        await send(stopped(await file(form, CHANGED)));
        const [note] = await notes(t, 'changed');
        assert.ok(note !== undefined, form);
        assert.equal(note['route'], await t.kinds('route').then((routes) => routes.at(-1)!.id));
        assert.equal((await readFile(path.join(t.fx.repo.root, String(note['path'])), 'utf8')).trim(), CHANGED);
        assert.deepEqual(await notes(t, 'report'), [], 'a Changed: list is not the report');
      });
    }
  });

  it('SubagentStop takes the last SubagentHandback, not earlier prose, and ignores another agent', async () => {
    await withTask(async (t, send, file) => {
      await t.start();
      await implementerNext(t);
      await send(stopped(await file('text', CHANGED), { agent_type: 'ambicode:reviewer' }));
      assert.deepEqual(await notes(t, 'changed'), []);
      await send(stopped(await file('handback', CHANGED)));
      assert.equal((await notes(t, 'changed')).length, 1);
    });
  });

  it('SubagentStop at the write step saves the report to report.md and appends the gap lines it left out', async () => {
    for (const form of ['handback', 'text'] as const) {
      await withTask(async (t, send, file) => {
        await t.start({ headless: true });
        await t.append(DECLINED);
        assert.equal((await implementerNext(t)).position, 'write');
        await send(stopped(await file(form, REPORT)));
        const saved = await readFile(path.join(t.fx.repo.root, REPORT_PATH), 'utf8');
        assert.ok(saved.startsWith(REPORT), saved);
        assert.ok(saved.includes(GAP), `the missing gap is appended: ${saved}`);
        assert.equal((await notes(t, 'report')).length, 1);
        assert.deepEqual(await notes(t, 'changed'), []);
      });
    }
  });

  it('a report that already states the gap is saved as written', async () => {
    await withTask(async (t, send, file) => {
      await t.start({ headless: true });
      await t.append(DECLINED);
      await implementerNext(t);
      const stated = `${REPORT}\nNot verified\n${gapsOf(await t.ledger()).map((gap) => `- ${gap}`).join('\n')}`;
      assert.ok(stated.includes(GAP));
      await send(stopped(await file('text', stated)));
      assert.equal((await readFile(path.join(t.fx.repo.root, REPORT_PATH), 'utf8')).trim(), stated);
    });
  });

  it('PostToolUse Agent hands main the step the implementer reached: the review offer, with no route next turn of its own', async () => {
    await withTask(async (t, send, file) => {
      await t.start();
      await implementerNext(t);
      await send(stopped(await file('text', CHANGED)));
      const asked = (await t.kinds('gate')).length;
      const out = (await send(returned)) as { hookSpecificOutput?: { hookEventName: string; additionalContext: string } };
      assert.equal((await t.kinds('gate')).length, asked, 'delivering the question again prints no second gate');
      assert.equal(out.hookSpecificOutput?.hookEventName, 'PostToolUse');
      assert.match(out.hookSpecificOutput!.additionalContext, /Run the independent review of this change\?/);
      assert.match(out.hookSpecificOutput!.additionalContext, /\[ambicode gate review-offer /);
    });
  });

  it('an implementer that returned without route next leaves main the command to run', async () => {
    await withTask(async (t, send) => {
      await t.start();
      await t.edit();
      await t.held('green');
      const out = (await send(returned)) as { hookSpecificOutput?: { additionalContext: string } };
      assert.match(out.hookSpecificOutput!.additionalContext, /route next --task/);
    });
  });

  it('no runnable check: an implementer that returned without route next leaves main the command, not the launch of the same brief', async () => {
    const config = CHECK_CONFIG.replace(/ {4}checks:\n(?: {6}.*\n)+/, '    checks: { unit: { all: null, file: null } }\n');
    const work = (await readFile(path.join(REPO_ROOT, 'routes', 'task', 'change-work.md'), 'utf8')) + (await readFile(path.join(REPO_ROOT, 'routes', 'task', 'fix-work.md'), 'utf8'));
    assert.doesNotMatch(work, /Last call after the green check/, 'route next is not conditioned on a check the route may not have');
    assert.match(await readFile(path.join(REPO_ROOT, 'agents', 'implementer.md'), 'utf8'), /Your last call is the work file's `route next`/);
    const t = await taskFixture({ config });
    try {
      await t.start({ headless: true });
      await t.edit();
      const prompt = `Implement the work described in ${path.join(t.dir, 'steps', 'work-change.md')}. The code is in the checkout.`;
      const out = (await runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, tool_name: 'Agent', tool_input: { subagent_type: 'ambicode:implementer', prompt }, tool_response: { status: 'completed', content: [{ type: 'text', text: 'Changed: ...' }] } }), { load: async () => ({ engine: t.fx.engine, routes: t.fx.routes }) })) as { hookSpecificOutput?: { additionalContext: string } };
      const text = out.hookSpecificOutput!.additionalContext;
      assert.match(text, /route next --task ord-7/);
      assert.doesNotMatch(text, /Launch the `ambicode:implementer`/);
      assert.match(text, /Do not launch it again/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('headless: route next reaches write, the report is saved, main answers with one pointer line and Stop closes the route without a block', async () => {
    await withTask(async (t, send, file) => {
      await t.start({ headless: true });
      await t.append(DECLINED);
      const write = await implementerNext(t);
      assert.equal(write.position, 'write');
      assert.match(write.text, /work-write\.md/);
      await send(stopped(await file('handback', REPORT)));
      const out = (await send(returned)) as { hookSpecificOutput?: { additionalContext: string } };
      assert.match(out.hookSpecificOutput!.additionalContext, new RegExp(`Task report: ${REPORT_PATH.replaceAll('.', '\\.')}`));
      const stop = await send({ hook_event_name: 'Stop', last_assistant_message: `Task report: ${REPORT_PATH}` });
      assert.deepEqual(stop, {}, 'the pointer is not asked for the gap lines: the report file already has them');
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['done']);
      assert.deepEqual((await t.kinds('limit')).filter((entry) => entry['which'] === 'stop-block'), []);
      assert.deepEqual(await notes(t, 'result'), [], 'the pointer does not replace the report');
      assert.ok((await readFile(path.join(t.fx.repo.root, REPORT_PATH), 'utf8')).startsWith(REPORT));
    });
  });

  it('the write step printed to the implementer carries the report brief and the facts inline: no Read and no second route next', async () => {
    await withTask(async (t) => {
      await t.start({ headless: true });
      await t.append(DECLINED);
      const write = await implementerNext(t);
      assert.equal(write.position, 'write');
      assert.match(write.text, /Work brief: the task report/);
      assert.match(write.text, /## report\n/);
      assert.match(write.text, /app\/unit: passed/);
      assert.doesNotMatch(write.text, / report --task /, 'the brief names no command that prints the summary again');
      assert.match(await t.work('write'), /## report\n/, 'the file stays for the main-launched path');
      assert.equal((await t.kinds('exit')).length, 0, 'printing the write step does not complete the route');
    });
  });

  it('through main: the review ran, route next from main reaches write, and the implementer is launched once on the write work', async () => {
    await withTask(async (t, send, file) => {
      await t.start();
      await implementerNext(t);
      await send(stopped(await file('text', CHANGED)));
      await t.hook('review-offer', 'run');
      const write = await t.review([]);
      assert.equal(write.position, 'write');
      assert.match(write.text, /ambicode:implementer/);
      const work = await t.work('write');
      assert.match(work, /## report\n/);
      assert.match(work, /src\/orders\.ts:2 seed the reduce/, 'the earlier round is in the facts the report is written from');
    });
  });

  it('a fix loop: both rounds reach the report, the first from its note and the last from the implementer that writes it', async () => {
    await withTask(async (t, send, file) => {
      await t.start();
      await implementerNext(t);
      await send(stopped(await file('text', CHANGED)));
      await t.hook('review-offer', 'run');
      assert.equal((await t.review([finding({ id: 'F1' })])).position, 'fix');
      await t.edit();
      await t.held('green');
      const again = await t.next();
      assert.equal(again.position, 'report-step');
      const second = 'Changed:\n- src/orders.ts:3 guard the null list found in review.\nChecks: app/unit: passed\nGaps: none';
      await send(stopped(await file('text', second)));
      assert.equal((await notes(t, 'changed')).length, 2);
      assert.equal((await t.hook('review-again', 'skip')).position, 'write');
      const work = await t.work('write');
      assert.match(work, /src\/orders\.ts:2 seed the reduce/);
      assert.match(work, /src\/orders\.ts:3 guard the null list/);
    });
  });
});
