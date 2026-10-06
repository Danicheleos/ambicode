import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildChain, executions, foldRoute, humanRevisesLeft, isGreen, latestBound, latestRouteOf, matches, unconsumedPreanswer, windowOf } from './fold.ts';
import { parseRegistry } from '../gates/gates.ts';
import { loadRoute } from '../definition/routes.ts';
import { REPO_ROOT } from '#testing/paths';
import { KINDS, type LedgerEntry } from '#types/modules/evidence';
import type { RouteDef } from '#types/harness';

const HEAD = 'skill: demo\nversion: 3\nbudget: { modelSteps: 6 }\nexits: [done, blocked]\nrevisable: [ground]\nsteps:\n';
const YAML = `${HEAD}  - id: template
    actor: code
    when: args.hasRequirement
    run: [h.a]
  - id: ground
    actor: code
    run: [h.a]
    produces: [envelope, "policy{before-work}"]
    repeat: 2
  - id: scope
    actor: human
    when: map.empty
    gate: { question: Q, options: [go, other], default: go, release: go, onAnswer: { "*": "revise ground --term $answer" } }
  - id: read
    actor: model
    instruction: Read.
  - id: write
    actor: model
    instruction: Write.
    produces: ["note{investigation}"]
`;

let counter = 0;
const entry = (kind: string, fields: object = {}): LedgerEntry => ({ id: `aaaaaaaa-${(counter += 1)}`, at: 't', kind, ...fields });
const route = (id: string, fields: object = {}): LedgerEntry => ({ id, at: 't', kind: 'route', skill: 'demo', args: { hasRequirement: false }, mode: 'interactive', channel: 'hook', trusted: true, session: 'aaaaaaaa', epoch: 1, ...fields });
const done = (step: string, actor = 'code', rid = 'r1'): LedgerEntry => entry('step', { route: rid, step, actor, status: 'completed', cause: 'x' });

async function def(yaml = YAML): Promise<RouteDef> {
  const root = REPO_ROOT;
  const registry = parseRegistry('g', await readFile(path.join(root, 'routes', 'gates.yaml'), 'utf8'), KINDS);
  return loadRoute('demo.yaml', yaml, { root, handlers: ['h.a'], readInstruction: async () => '' }, registry);
}

describe('fold', () => {
  it('03-F1: the chain follows resumes transitively, from any session, and never includes legacy or foreign entries', async () => {
    const entries = [
      route('r0', { session: 'cccccccc' }),
      entry('envelope', { route: 'r0' }),
      route('r1', { session: 'aaaaaaaa', resumes: 'r0' }),
      entry('envelope', { route: 'r1' }),
      route('r9', { session: 'bbbbbbbb' }),
      entry('envelope', { route: 'r9' }),
      entry('note', { note: 'investigation', path: 'x', contentHash: 'h' }),
    ];
    const chain = buildChain(entries, entries[2]!);
    assert.deepEqual([...chain.ids], ['r1', 'r0']);
    assert.deepEqual(chain.entries.map((candidate) => candidate.id), [entries[0]!.id, entries[1]!.id, 'r1', entries[3]!.id]);
    assert.equal(latestRouteOf(entries, 'bbbbbbbb')?.id, 'r9');
  });

  it('03-F2: a window starts after the latest revise aimed at or before the step; preanswers sit outside windows', async () => {
    const d = await def();
    const entries = [route('r1'), entry('envelope', { route: 'r1' }), entry('revise', { route: 'r1', from: 'scope', via: 'gate', cycle: 1, reason: 'x' }), entry('map', { route: 'r1', candidates: 0 })];
    const fold = foldRoute(d, buildChain(entries, entries[0]!));
    const starts = fold.steps.map((state) => [state.step.id, state.windowStart]);
    assert.deepEqual(starts, [['template', 0], ['ground', 0], ['scope', 3], ['read', 3], ['write', 3]]);
    assert.deepEqual(windowOf(fold, d.steps[1]!).map((candidate) => candidate.kind), ['route', 'envelope', 'revise', 'map']);
    const pre = entry('preanswer', { route: 'r1', gate: 'scope', option: 'go', via: 'prompt', trusted: true });
    assert.equal(unconsumedPreanswer([...entries, pre], 'scope'), pre);
    assert.equal(unconsumedPreanswer([...entries, pre, entry('acceptance', { route: 'r1', gate: 'scope', answer: 'go', preanswer: pre.id })], 'scope'), null);
  });

  it('03-F3: done per actor; a code step needs its own completion and every qualified output; empty produces proves nothing', async () => {
    const d = await def();
    const base = [route('r1')];
    const at = (entries: LedgerEntry[]) => foldRoute(d, buildChain(entries, entries[0]!)).position?.id ?? 'complete';
    assert.equal(at(base), 'ground');
    assert.equal(at([...base, entry('envelope', { route: 'r1' }), entry('policy', { route: 'r1', stage: 'before-work' })]), 'ground');
    assert.equal(at([...base, done('ground')]), 'ground');
    assert.equal(at([...base, entry('envelope', { route: 'r1' }), entry('policy', { route: 'r1', stage: 'before-report' }), done('ground')]), 'ground');
    const grounded = [...base, entry('envelope', { route: 'r1' }), entry('policy', { route: 'r1', stage: 'before-work' }), done('ground')];
    assert.equal(at(grounded), 'read');
    assert.equal(at([...grounded, done('read', 'model')]), 'write');
    assert.equal(at([...grounded, done('read', 'model'), entry('note', { route: 'r1', note: 'plan', path: 'p', contentHash: 'h' })]), 'write');
    assert.equal(at([...grounded, done('read', 'model'), entry('note', { route: 'r1', note: 'investigation', path: 'p', contentHash: 'h' })]), 'complete');
  });

  it('03-F3: the template step with empty produces is done only by its own completion record', async () => {
    const d = await def();
    const withRequirement = route('r1', { args: { hasRequirement: true } });
    const at = (entries: LedgerEntry[]) => foldRoute(d, buildChain(entries, entries[0]!)).position?.id;
    assert.equal(at([withRequirement]), 'template');
    assert.equal(at([withRequirement, done('template')]), 'ground');
  });

  it('03-F4: a false when counts as done without checking needs; gate predicates read the latest bound answer in the window', async () => {
    const d = await def();
    const entries = [route('r1'), entry('envelope', { route: 'r1' }), entry('policy', { route: 'r1', stage: 'before-work' }), done('ground'), entry('map', { route: 'r1', candidates: 0 })];
    const fold = foldRoute(d, buildChain(entries, entries[0]!));
    assert.deepEqual(fold.steps.map((state) => state.state), ['skipped', 'done', 'pending', 'pending', 'pending']);
    const answered = [...entries, entry('acceptance', { route: 'r1', gate: 'scope', answer: 'go', via: 'hook', instance: 'x' })];
    assert.equal(foldRoute(d, buildChain(answered, answered[0]!)).position?.id, 'read');
    const nonEmpty = [...entries.slice(0, 4), entry('map', { route: 'r1', candidates: 3 })];
    assert.deepEqual(foldRoute(d, buildChain(nonEmpty, nonEmpty[0]!)).steps.map((state) => state.state), ['skipped', 'done', 'skipped', 'pending', 'pending']);
  });

  it('03-G5: only bound answers count; the latest bound answer wins; acting declines and unbound entries are not answers', () => {
    const answers = [
      entry('acceptance', { gate: 'g', answer: 'A' }),
      entry('declined', { gate: 'g', answer: 'B', via: 'flag', reason: 'acting-needs-human' }),
      entry('declined', { gate: 'g', answer: 'C', via: 'hook', unbound: true }),
      entry('declined', { gate: 'g', answer: 'D', via: 'hook', reason: 'option-not-offered' }),
    ];
    assert.equal(latestBound(answers, 'g')?.['answer'], 'A');
    const later = [...answers, entry('default-taken', { gate: 'g', answer: 'Z' })];
    assert.equal(latestBound(later, 'g')?.['answer'], 'Z');
    assert.equal(latestBound(later, 'other'), null);
  });

  it('03-F6/03-F7/03-F11: counters are counts over the chain; a human revise starts a new cycle', async () => {
    const d = await def();
    const ground = d.steps[1]!;
    const entries = [route('r1'), done('ground'), done('ground'), entry('revise', { route: 'r1', from: 'ground', via: 'gate', cycle: 1, gate: 'scope' }), done('ground')];
    assert.equal(executions(entries, ground), 1);
    const gate = d.steps[2]!.gate!;
    assert.equal(humanRevisesLeft(entries, gate), 2);
    assert.equal(humanRevisesLeft([...entries, ...[1, 2].map(() => entry('revise', { route: 'r1', from: 'ground', via: 'gate', gate: 'scope' }))], gate), 0);
  });

  it('qualified kinds match on the field that kind carries; check{green} needs a counted pass', () => {
    assert.equal(matches(entry('note', { note: 'plan' }), { kind: 'note', value: 'plan' }), true);
    assert.equal(matches(entry('note', { note: 'plan-draft' }), { kind: 'note', value: 'plan' }), false);
    assert.equal(matches(entry('policy', { stage: 'before-work' }), { kind: 'policy', value: 'before-report' }), false);
    assert.equal(isGreen(entry('check', { exit: 0, summary: { ran: 3, failed: 0 } })), true);
    assert.equal(isGreen(entry('check', { exit: 0, summary: { ran: 0, failed: 0 } })), false);
    assert.equal(isGreen(entry('check', { exit: 0, summary: null })), false);
    assert.equal(matches(entry('check', { exit: 1, summary: { ran: 1, failed: 1 } }), { kind: 'check', value: 'green' }), false);
    assert.equal(matches(entry('requirement', { capture: 'list' }), { kind: 'requirement', value: 'full' }), false);
  });

  it('07-D4 check{red} and check{green} match on phase alone; an unproven green still meets check{green}', () => {
    assert.equal(matches(entry('check', { phase: 'green', exit: 1, summary: null }), { kind: 'check', value: 'green' }), true);
    assert.equal(matches(entry('check', { phase: 'red', exit: 0, summary: { ran: 0, failed: 0 } }), { kind: 'check', value: 'red' }), true);
    assert.equal(matches(entry('check', { phase: 'red', exit: 1, summary: { ran: 1, failed: 1 } }), { kind: 'check', value: 'green' }), false);
  });
});
