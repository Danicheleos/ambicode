import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openRouteView } from '#harness/engine/context';
import { recordGoverning } from './conflict.ts';
import { jira, mcp, session } from '#testing/fixtures/requirements-session';

const GATE = 'requirements-conflicting';
const GET = 'mcp__atlassian__getJiraIssue';

async function grounded(options: { headless?: boolean } = {}) {
  const s = await session({ skill: 'investigate', shipped: true, ...options });
  await s.capture(GET, mcp(jira('ORD-17', { description: 'The cart holds 50 items.' })));
  await s.capture(GET, mcp(jira('ORD-30', { parent: { key: 'ORD-17' }, description: 'The cart holds 20 items.' })));
  const read = await s.next();
  assert.equal(read.position, 'read');
  return s;
}

const conflict = { summary: 'the limit differs', sources: ['ORD-17', 'ORD-30'] };

describe('04-K conflicts', () => {
  it('04-K1: fewer than two distinct sources, or a source not in the latest envelope, is requirements-conflict-sources and records nothing', async () => {
    const s = await grounded();
    try {
      const before = (await s.fx.ledger(s.task)).length;
      for (const sources of [['ORD-17'], ['ORD-17', 'ORD-17'], ['ORD-17', 'ORD-99']]) {
        await assert.rejects(s.next({ conflict: { summary: 'x', sources } }), (error: Error & { code?: string }) => error.code === 'requirements-conflict-sources' && /ORD-17, ORD-30/.test(error.message));
      }
      assert.equal((await s.fx.kinds(s.task, 'gate')).filter((entry) => entry['gate'] === GATE).length, 0);
      assert.equal((await s.fx.ledger(s.task)).length, before, 'nothing recorded');
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-K2: a valid conflict raises the gate with the sources then stop, stop as default and release, and no object', async () => {
    const s = await grounded();
    try {
      const message = await s.next({ conflict });
      assert.match(message.text, /The requirement sources disagree: the limit differs\. Which source decides\?/);
      assert.match(message.text, /Options:\n {2}- ORD-17\n {2}- ORD-30\n {2}- stop \(default if nobody answers\)/);
      assert.doesNotMatch(message.text, /Object:/);
      const [print] = (await s.fx.kinds(s.task, 'gate')).filter((entry) => entry['gate'] === GATE);
      assert.deepEqual(print!['options'], ['ORD-17', 'ORD-30', 'stop']);
      assert.equal(print!['object'], undefined);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-K3/04-K4: a flag answer is an acceptance on the printed instance, the governing source goes on a new envelope once, and an unknown option is refused', async () => {
    const s = await grounded();
    try {
      await s.next({ conflict });
      await assert.rejects(s.next({ answers: [{ gate: GATE, option: 'ORD-99' }] }), (error: Error & { code?: string }) => error.code === 'gate-option-unknown');
      const envelopes = (await s.fx.kinds(s.task, 'envelope')).length;
      await s.next({ answers: [{ gate: GATE, option: 'ORD-30' }] });
      const print = (await s.fx.kinds(s.task, 'gate')).findLast((entry) => entry['gate'] === GATE)!;
      const acceptance = (await s.fx.kinds(s.task, 'acceptance')).find((entry) => entry['gate'] === GATE)!;
      assert.deepEqual([acceptance['answer'], acceptance['via'], acceptance['instance']], ['ORD-30', 'flag', print.id]);
      const all = await s.fx.kinds(s.task, 'envelope');
      assert.equal(all.length, envelopes + 1);
      const [latest, before] = [all.at(-1)!, all.at(-2)!];
      assert.deepEqual(latest['conflicts'], [{ summary: 'the limit differs', sources: ['ORD-17', 'ORD-30'], governing: 'ORD-30', acceptance: acceptance.id }]);
      assert.notEqual(latest['hash'], before['hash']);
      assert.deepEqual(latest['sources'], before['sources']);
      const again = await s.under(async ({ ledger, runtime }) => {
        const view = (await openRouteView(runtime, s.fx.routes, s.task, 'aaaaaaaa-1111-4111-8111-111111111111'))!;
        return recordGoverning({ view, ledger, acceptance });
      });
      assert.equal(again, null, 'idempotent per acceptance');
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, envelopes + 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-K4: stop exits blocked, and so does the headless default', async () => {
    const s = await grounded();
    try {
      await s.next({ conflict });
      await s.next({ answers: [{ gate: GATE, option: 'stop' }] });
      assert.deepEqual(await s.exits(), ['blocked']);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).every((entry) => entry['conflicts'] === undefined), true);
    } finally {
      await s.fx.dispose();
    }
    const headless = await grounded({ headless: true });
    try {
      await headless.next({ conflict });
      assert.deepEqual(await headless.exits(), ['blocked']);
      assert.deepEqual((await headless.fx.kinds(headless.task, 'default-taken')).map((entry) => [entry['gate'], entry['answer']]), [[GATE, 'stop']]);
    } finally {
      await headless.fx.dispose();
    }
  });

  it('04-K4: an acceptance persisted before the governing envelope write was interrupted is applied by the next advance', async () => {
    const s = await grounded();
    const fs = s.fx.runtime.fs;
    const original = fs.appendText;
    try {
      await s.next({ conflict });
      fs.appendText = async (file, text) => {
        if (file.endsWith('ledger.jsonl') && JSON.parse(text).kind === 'envelope') throw new Error('interrupted');
        return original(file, text);
      };
      await assert.rejects(s.next({ answers: [{ gate: GATE, option: 'ORD-30' }] }), /interrupted/);
      fs.appendText = original;
      assert.equal((await s.fx.kinds(s.task, 'acceptance')).filter((entry) => entry.gate === GATE).length, 1);
      await s.next();
      const governing = (await s.fx.kinds(s.task, 'envelope')).flatMap((entry) => (entry['conflicts'] as { governing: string }[] | undefined) ?? []);
      assert.deepEqual(governing.map((item) => item.governing), ['ORD-30']);
      await s.next();
      assert.equal((await s.fx.kinds(s.task, 'envelope')).flatMap((entry) => (entry['conflicts'] as unknown[] | undefined) ?? []).length, 1);
    } finally {
      fs.appendText = original;
      await s.fx.dispose();
    }
  });

  it('04-K1: an invalid --sources at a model step without produces completes nothing', async () => {
    const route = [
      'skill: review', 'version: 3', 'budget: { modelSteps: 6 }', 'exits: [done, blocked, human, inconclusive, superseded]', 'revisable: []', 'steps:',
      '  - id: fetch', '    actor: model', '    instruction: "Fetch."', '  - id: ground', '    actor: code', '    run: [requirements.normalize]', '    produces: [envelope]',
      '  - id: design', '    actor: model', '    instruction: "Consider."', '  - id: accept', '    actor: human', '    gate:', '      question: "Continue?"', '      options: ["stop"]', '      default: "stop"', '      release: "stop"', '',
    ].join('\n');
    const s = await session({ route });
    try {
      await s.capture(GET, mcp(jira('ORD-17')));
      await s.next();
      const before = await s.fx.ledger(s.task);
      await assert.rejects(s.next({ conflict: { summary: 'x', sources: ['ORD-17'] } }), (error: { code?: string }) => error.code === 'requirements-conflict-sources');
      assert.deepEqual(await s.fx.ledger(s.task), before);
    } finally {
      await s.fx.dispose();
    }
  });
});
