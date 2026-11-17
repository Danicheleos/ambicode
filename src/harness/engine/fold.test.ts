import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChain, exitOf, executions, foldRoute, isGreen, latestBound, latestRouteOf, matches, reportOf, unconsumedPreanswer, windowOf } from './fold.ts';
import { loadRoute } from '../definition/routes.ts';
import { gapsOf } from '#modules/evidence/report/report';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteDef } from '#types/harness';

const HEAD = 'skill: demo\nversion: 3\nsteps:\n';
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
    gate: { question: Q, options: [go, other], default: go, onAnswer: { "*": "revise ground --term $answer" } }
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
  return loadRoute('demo.yaml', yaml, { handlers: ['h.a'], readInstruction: async () => '' });
}

describe('requirements.missing', () => {
  const fetchYaml = `${HEAD}  - id: fetch\n    actor: code\n    when: requirements.missing\n    run: [h.a]\n  - id: ground\n    actor: code\n    run: [h.a]\n`;
  const KEY = 'https://x.atlassian.net/browse/ORD-17';
  const args = { hasRequirement: true, text: 'plan it', requirements: [KEY] };
  const position = async (head: LedgerEntry, rest: LedgerEntry[] = []): Promise<string | undefined> => foldRoute(await def(fetchYaml), buildChain([head, ...rest], head)).position?.id;

  it('fetch runs while an asked key is not captured and is skipped once an earlier route of the task holds it', async () => {
    assert.equal(await position(route('r1', { args })), 'fetch');
    assert.equal(await position(route('r1', { args, captured: [KEY] })), 'ground');
  });

  it('fetch stays open in the route that captured the key, so the reads that follow it are still in the fetch step', async () => {
    assert.equal(await position(route('r1', { args }), [entry('requirement', { route: 'r1', key: KEY })]), 'fetch');
  });

  it('a key that is captured does not hide one that is not, and a child capture does not stand in for the asked key', async () => {
    const two = { ...args, requirements: [KEY, 'https://x.atlassian.net/wiki/spaces/E/pages/42/Orders'] };
    assert.equal(await position(route('r1', { args: two, captured: [KEY] })), 'fetch');
    assert.equal(await position(route('r1', { args }), [entry('requirement', { route: 'r1', key: 'ORD-170' })]), 'fetch');
  });

  it('a key captured by key satisfies the same ticket asked by URL, and the reverse', async () => {
    assert.equal(await position(route('r1', { args, captured: ['ORD-17'] })), 'ground');
    assert.equal(await position(route('r1', { args: { ...args, requirements: ['ORD-17'] }, captured: [KEY] })), 'ground');
    assert.equal(await position(route('r1', { args, captured: ['ORD-170'] })), 'fetch');
  });

  it('nothing asked by a route that names no requirement leaves fetch skipped', async () => {
    assert.equal(await position(route('r1', { args: { hasRequirement: false, text: 'x', requirements: [] } })), 'ground');
  });
});

describe('unrevised', () => {
  const yaml = `${HEAD}  - id: draft\n    actor: code\n    run: [h.a]\n    repeat: 2\n  - id: critic\n    actor: code\n    when: unrevised\n    run: [h.a]\n  - id: accept\n    actor: code\n    run: [h.a]\n`;
  const position = async (rest: LedgerEntry[]): Promise<string | undefined> => {
    const head = route('r1');
    return foldRoute(await def(yaml), buildChain([head, ...rest], head)).position?.id;
  };

  it('holds in the first pass of the chain and not once a revise to an earlier step opened the step\'s window', async () => {
    assert.equal(await position([done('draft')]), 'critic');
    const revise = entry('revise', { route: 'r1', from: 'draft', via: 'gate', cycle: 1, reason: 'x' });
    assert.equal(await position([done('draft'), revise, done('draft')]), 'accept', 'the critic is skipped after a revise to draft');
  });

  it('still holds after a revise to a later step: it does not open the step\'s window', async () => {
    assert.equal(await position([done('draft'), entry('revise', { route: 'r1', from: 'accept', via: 'gate', cycle: 1, reason: 'x' })]), 'critic', 'a revise to a later step does not open the critic\'s window: it has not run yet');
  });
});

describe('fold', () => {
  it('03-F1: the chain is the head route and its own entries, never another route\'s, legacy or foreign entries', async () => {
    const entries = [
      route('r0', { session: 'cccccccc' }),
      entry('envelope', { route: 'r0' }),
      route('r9', { session: 'bbbbbbbb' }),
      entry('envelope', { route: 'r9' }),
      entry('note', { note: 'investigation', path: 'x', contentHash: 'h' }),
    ];
    const chain = buildChain(entries, entries[2]!);
    assert.deepEqual([...chain.ids], ['r9']);
    assert.deepEqual(chain.entries.map((candidate) => candidate.id), ['r9', entries[3]!.id]);
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
  });

  it('qualified kinds match on the field that kind carries; check{green} needs a counted pass', () => {
    assert.equal(matches(entry('note', { note: 'plan' }), { kind: 'note', value: 'plan' }), true);
    assert.equal(matches(entry('note', { note: 'plan-draft' }), { kind: 'note', value: 'plan' }), false);
    assert.equal(matches(entry('policy', { stage: 'before-work' }), { kind: 'policy', value: 'before-report' }), false);
    assert.equal(isGreen(entry('check', { exit: 0, summary: { ran: 3, failed: 0 } })), true);
    assert.equal(matches(entry('check', { exit: 1, summary: { ran: 1, failed: 1 } }), { kind: 'check', value: 'green' }), false);
  });

  it('07-D4 check{green} needs phase green and exit 0; an unproven run keeps the step open', () => {
    assert.equal(matches(entry('check', { phase: 'green', exit: 1, summary: null }), { kind: 'check', value: 'green' }), false);
    assert.equal(matches(entry('check', { phase: 'green', exit: 0, summary: null }), { kind: 'check', value: 'green' }), true);
  });
});

describe('exitOf', () => {
  it('the latest exit ends the chain', () => {
    const exit = (reason: string): LedgerEntry => entry('exit', { route: 'r1', reason, complete: true });
    const head = route('r1');
    assert.equal(exitOf(buildChain([head], head)), null);
    assert.equal(exitOf(buildChain([head, exit('done'), exit('blocked')], head))?.['reason'], 'blocked');
  });
});

describe('checks.offer', () => {
  const offerYaml = `${HEAD}  - id: offer\n    actor: human\n    when: checks.offer\n    gate: { question: Q, options: [run, skip], default: skip }\n  - id: end\n    actor: code\n    run: [h.a]\n`;
  const baseline = (full: number): LedgerEntry => entry('baseline', { route: 'r1', full });
  const offered = async (args: object, full: number): Promise<boolean> => {
    const head = route('r1', { args });
    return foldRoute(await def(offerYaml), buildChain([head, baseline(full)], head)).position?.id === 'offer';
  };

  it('every run with a full key is asked once, named iteration or not, headless included; no full key asks nothing', async () => {
    assert.equal(await offered({ iteration: 2 }, 1), true);
    assert.equal(await offered({}, 1), true, 'a route without a named iteration covers the whole project too');
    assert.equal(await offered({ headless: true }, 1), true, 'headless prints it and takes the skip default');
    assert.equal(await offered({}, 0), false);
  });
});

describe('reportOf', () => {
  const critic = (rid: string, defects: object[]): LedgerEntry => entry('worker', { route: rid, worker: 'plan-critic', outcome: 'ran', ms: 0, artifact: null, summary: { defects, claims: [] } });
  const kept = async (head: LedgerEntry, all: LedgerEntry[]): Promise<string[]> => {
    const [entries, current] = reportOf(all, buildChain(all, head), await def());
    return entries.filter((item) => item.kind === 'worker' && current(item)).map((item) => item.id);
  };

  it('a task takes the latest plan route before it and that route\'s newest critic entry; a plan route or a task with no plan before it takes none', async () => {
    const plan1 = route('p1', { skill: 'plan' });
    const plan2 = route('p2', { skill: 'plan' });
    const task = route('t1', { skill: 'task' });
    const first = critic('p1', [{ kind: 'order' }]);
    const old = critic('p2', [{ kind: 'order' }]);
    const newest = critic('p2', [{ kind: 'caller-missed' }]);
    assert.deepEqual(await kept(task, [plan1, first, plan2, old, newest, task]), [newest.id]);
    assert.deepEqual(await kept(task, [task, plan2, newest]), []);
    assert.deepEqual(await kept(plan2, [plan1, first, plan2, newest]), [newest.id], 'a plan route\'s own critic entry is its own chain');
  });

  it('a task\'s report marks the plan critic\'s lines as not re-checked only when the plan route revised to draft after them', async () => {
    const plan = route('p1', { skill: 'plan' });
    const task = route('t1', { skill: 'task' });
    const worker = entry('worker', { route: 'p1', worker: 'plan-critic', outcome: 'ran', ms: 0, artifact: null, summary: { defects: [{ kind: 'claim-wrong', where: 'plan.md:4', evidence: 'x' }], claims: [] } });
    const revise = entry('revise', { route: 'p1', from: 'draft', via: 'revise', cycle: 1, reason: 'x' });
    const lines = async (all: LedgerEntry[]): Promise<string[]> => gapsOf(...reportOf(all, buildChain(all, task), await def()));
    assert.deepEqual(await lines([plan, worker, task]), ['plan critic: claim-wrong plan.md:4: x']);
    assert.deepEqual(await lines([plan, worker, revise, task]), ['revision not re-checked: plan critic: claim-wrong plan.md:4: x']);
  });

  const note = (rid: string, file: string): LedgerEntry => entry('note', { route: rid, note: 'plan', path: file });
  const accepted = (rid: string, fields: object): LedgerEntry => entry('acceptance', { route: rid, gate: 'plan-accept', instance: null, answer: 'Accept', via: 'hook', ...fields });
  const stageOf = async (head: LedgerEntry, all: LedgerEntry[]): Promise<string[]> => {
    const [entries, current] = reportOf(all, buildChain(all, head), await def());
    return entries.filter((item) => item.route !== head.id && item.kind !== 'route' && current(item)).map((item) => item.id);
  };

  it('a task takes the plan stage that wrote the plan it used: a later interrupted plan route does not replace it', async () => {
    const plan1 = route('p1', { skill: 'plan' });
    const plan2 = route('p2', { skill: 'plan' });
    const task = route('t1', { skill: 'task' });
    const first = critic('p1', [{ kind: 'order' }]);
    const all = [plan1, first, note('p1', '.ambicode/tasks/x/plan.md'), plan2, entry('exit', { route: 'p2', reason: 'interrupted' }), task];
    assert.deepEqual(await stageOf(task, all), [first.id]);
  });

  it('a task given another plan file with --plan takes no plan stage; one given the noted file takes it', async () => {
    const plan1 = route('p1', { skill: 'plan' });
    const first = critic('p1', [{ kind: 'order' }]);
    const before = [plan1, first, note('p1', '.ambicode/tasks/x/plan.md')];
    assert.deepEqual(await stageOf(route('t1', { skill: 'task', args: { plan: 'docs/other-plan.md' } }), [...before, route('t1', { skill: 'task', args: { plan: 'docs/other-plan.md' } })]), []);
    const named = route('t2', { skill: 'task', args: { plan: '.ambicode/tasks/x/plan.md' } });
    assert.deepEqual(await stageOf(named, [...before, named]), [first.id]);
  });

  it('only the latest bound plan-accept answer of the stage is taken: a superseded preset Revise is not', async () => {
    const plan1 = route('p1', { skill: 'plan' });
    const task = route('t1', { skill: 'task' });
    const revise = accepted('p1', { answer: 'Revise', via: 'prompt', preanswer: 'x-0' });
    const human = accepted('p1', { instance: 'g2' });
    assert.deepEqual(await stageOf(task, [plan1, revise, human, task]), [human.id]);
  });

  it('a chain head read apart from the entries is found by id', async () => {
    const plan1 = route('p1', { skill: 'plan' });
    const task = route('t1', { skill: 'task' });
    const first = critic('p1', [{ kind: 'order' }]);
    const later = route('p2', { skill: 'plan' });
    const all = [plan1, first, task, later, critic('p2', [{ kind: 'order' }])];
    assert.deepEqual(await stageOf({ ...task }, all), [first.id]);
  });
});
