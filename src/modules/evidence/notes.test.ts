import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { ownerOf } from '#harness/session/ownership';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { systemIds } from '#platform/ports/ids';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { appendLedger, readLedger } from './ledger/ledger.ts';
import { withLedgerLock } from './ledger/ledger-lock.ts';
import { listNotes, promotePlan, saveNote } from './notes.ts';
import type { Runtime } from '#types/composition';
import { LEDGER_FILE, type LedgerEntry, type NoteDeps } from '#types/modules/evidence';
import type { ConsentResult, RouteContextPort, RouteView } from '#types/harness';
import type { FileSystem } from '#types/platform/ports';

const NOW = new Date(2026, 9, 2, 14, 35);
const TASK = 'ORD-17';
const A = 'aaaaaaaa';
const B = 'bbbbbbbb';

async function inRepo(run: (repo: TempRepo) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('package.json', '{}\n');
    await repo.commitAll('initial');
    await run(repo);
  } finally {
    await repo.dispose();
  }
}

const runtimeFor = (repo: TempRepo, fs: FileSystem = nodeFileSystem): Promise<Runtime> =>
  createRuntime({ cwd: repo.root, fs, clock: { now: () => NOW, elapsed: () => 0 }, ids: { ...systemIds, writerId: () => 'feedbeef' } });

const taskDir = (repo: TempRepo, slug = TASK): string => path.join(repo.root, '.ambicode', 'task', slug);

const route = (id: string, session: string, extra: object = {}): object => ({
  id, at: 't', kind: 'route', skill: 'plan', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session, epoch: 1, ...extra,
});

async function seed(repo: TempRepo, entries: (object | string)[], slug = TASK): Promise<void> {
  await mkdir(taskDir(repo, slug), { recursive: true });
  await writeFile(path.join(taskDir(repo, slug), LEDGER_FILE), `${entries.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n')}\n`);
}

/** Everything a refusal must leave as it found it. */
async function snapshot(repo: TempRepo, slug = TASK): Promise<string> {
  const dir = taskDir(repo, slug);
  const names = await readdir(dir, { recursive: true }).catch(() => []);
  const ledger = await readFile(path.join(dir, LEDGER_FILE), 'utf8').catch(() => '');
  return `${names.sort().join(',')}\n${ledger}`;
}

const save = (deps: NoteDeps, kind: 'investigation' | 'plan-draft' | 'notes', body: string | null, extra: { from?: string; iteration?: number } = {}) =>
  saveNote(deps, { task: TASK, kind, body, from: extra.from ?? null, iteration: extra.iteration ?? null });

const entriesOf = async (repo: TempRepo): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, taskDir(repo));

describe('note save: kinds, bodies and headers', () => {
  it('02-N1: saves investigation, plan-draft and notes from a body, and refuses --from on any but plan-draft', async () => {
    await inRepo(async (repo) => {
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const investigation = await save(deps, 'investigation', 'Finding\n');
      const draft = await save(deps, 'plan-draft', '# Plan\n');
      const notes = await save(deps, 'notes', 'work so far');
      assert.deepEqual([investigation.path, draft.path, notes.path], [
        '.ambicode/task/ORD-17/investigation_2026-10-02T14-35.md',
        '.ambicode/task/ORD-17/plan-draft_2026-10-02T14-35.md',
        '.ambicode/task/ORD-17/notes.md',
      ]);
      await assert.rejects(save(deps, 'notes', null, { from: 'steps/plan-body.md' }), { code: 'bad-argument', field: 'from' });
      await assert.rejects(save(deps, 'investigation', '  '), { code: 'bad-argument', field: 'stdin' });
      await assert.rejects(save(deps, 'notes', 'x'.repeat(262_145)), { code: 'bad-argument' });
      assert.equal((await save(deps, 'notes', 'x'.repeat(262_000))).kind, 'notes');
    });
  });

  it('02-N1: a plan-draft takes its body from the task\'s plan body, and records where it came from', async () => {
    await inRepo(async (repo) => {
      await mkdir(path.join(taskDir(repo), 'steps'), { recursive: true });
      await writeFile(path.join(taskDir(repo), 'steps', 'plan-body.md'), '# From the file\n');
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const saved = await save(deps, 'plan-draft', null, { from: 'steps/plan-body.md' });
      assert.match(await readFile(path.join(repo.root, saved.path), 'utf8'), /# From the file/);
      assert.equal(saved.entry.from, 'steps/plan-body.md');
      await assert.rejects(save(deps, 'plan-draft', null, { from: '../OTHER/steps/plan-body.md' }), { code: 'bad-argument', field: 'from' });
    });
  });

  it('02-N2: --iteration puts the header on the first line, replaces an old one, and is for notes only', async () => {
    await inRepo(async (repo) => {
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const first = await save(deps, 'notes', 'step one done', { iteration: 1 });
      const second = await save(deps, 'notes', '<!-- ambicode iteration: 1 done -->\nstep two done', { iteration: 2 });
      const text = await readFile(path.join(repo.root, second.path), 'utf8');
      assert.equal(text.split('\n')[0], '<!-- ambicode iteration: 2 done -->');
      assert.equal(text.match(/iteration/g)?.length, 1);
      assert.match(text, /\*\*task note\*\*\n\nstep two done/);
      assert.equal(first.entry.iteration, 1);
      assert.equal(second.entry.iteration, 2);
      for (const bad of [0, 1.5, -1]) await assert.rejects(save(deps, 'notes', 'x', { iteration: bad }), { field: 'iteration' });
      await assert.rejects(save(deps, 'investigation', 'x', { iteration: 1 }), { field: 'iteration' });
      await assert.rejects(save(deps, 'plan-draft', 'x', { iteration: 1 }), { field: 'iteration' });
    });
  });

  it('02-N3: a plan-draft is stamped, labelled as a draft, collision-suffixed and recorded', async () => {
    await inRepo(async (repo) => {
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const first = await save(deps, 'plan-draft', '# Plan A');
      const second = await save(deps, 'plan-draft', '# Plan B');
      assert.match(second.path, /plan-draft_2026-10-02T14-35-2\.md$/);
      const text = await readFile(path.join(repo.root, first.path), 'utf8');
      assert.equal(text, '**plan draft** — acceptance is recorded by `note promote`, not in this file.\n\n# Plan A\n');
      assert.deepEqual(
        { ...first.entry },
        { id: 'feedbeef-1', at: first.entry.at, kind: 'note', note: 'plan-draft', path: first.path, contentHash: contentHash(text) },
      );
    });
  });

  it('06-N1: saveNote refuses kind plan before writing anything', async () => {
    await inRepo(async (repo) => {
      await seed(repo, [route(`${A}-1`, A)]);
      const before = await snapshot(repo);
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      await assert.rejects(saveNote(deps, { task: TASK, kind: 'plan' as never, body: '# Plan', from: null, iteration: null }), (error: AmbicodeError) => error.code === 'bad-argument' && error.field === 'kind');
      assert.equal(await snapshot(repo), before);
    });
  });
});

describe('02-N4: a plan-draft is saved only by the owner of the live plan route', () => {
  const live = [route(`${A}-1`, A)];
  const takenOver = [route(`${A}-1`, A), route(`${B}-1`, B, { resumes: `${A}-1`, adopts: true })];
  const cases: { label: string; ledger: (object | string)[] | null; session: string | null; allowed?: { id: RegExp; route: string | null }; code?: string }[] = [
    { label: 'no ledger: routeless', ledger: null, session: null, allowed: { id: /^feedbeef-1$/, route: null } },
    { label: 'no live plan route: routeless', ledger: [route(`${A}-1`, A), { id: `${A}-2`, at: 't', kind: 'exit', route: `${A}-1`, reason: 'done' }], session: A, allowed: { id: new RegExp(`^${A}-3$`), route: null } },
    { label: 'the owner', ledger: live, session: A, allowed: { id: new RegExp(`^${A}-2$`), route: `${A}-1` } },
    { label: 'the owner after an adoption', ledger: takenOver, session: B, allowed: { id: new RegExp(`^${B}-2$`), route: `${B}-1` } },
    { label: 'an owned route and no session', ledger: live, session: null, code: 'session-unbound' },
    { label: 'a session that was taken over', ledger: takenOver, session: A, code: 'route-taken-over' },
    { label: 'any other session', ledger: live, session: 'cccccccc', code: 'route-busy' },
    { label: 'two live plan routes: unknown', ledger: [route(`${A}-1`, A), route(`${B}-1`, B)], session: A, code: 'ledger-unreadable' },
    { label: 'a torn ledger: unknown', ledger: [route(`${A}-1`, A), '{"id":"aaaaaaaa-2","at":'], session: A, code: 'ledger-unreadable' },
  ];
  for (const { label, ledger, session, allowed, code } of cases) {
    it(`02-N4: ${label}`, async () => {
      await inRepo(async (repo) => {
        if (ledger !== null) await seed(repo, ledger);
        const before = await snapshot(repo);
        const deps = { runtime: await runtimeFor(repo), session, context: null };
        if (allowed === undefined) {
          await assert.rejects(save(deps, 'plan-draft', '# Plan'), { code });
          assert.equal(await snapshot(repo), before, 'nothing is written before a refusal');
          return;
        }
        const saved = await save(deps, 'plan-draft', '# Plan');
        assert.match(saved.entry.id, allowed.id);
        assert.equal(saved.entry.route ?? null, allowed.route);
      });
    });
  }

  it('02-N4: route-taken-over names the owner; investigation and notes are not checked', async () => {
    await inRepo(async (repo) => {
      await seed(repo, takenOver);
      const deps = { runtime: await runtimeFor(repo), session: A, context: null };
      await assert.rejects(save(deps, 'plan-draft', 'x'), (error: AmbicodeError) => error.message.includes(B));
      await save({ ...deps, session: 'cccccccc' }, 'investigation', 'x');
      await save({ ...deps, session: null }, 'notes', 'x');
    });
  });
});

describe('02-N6: note list', () => {
  it('lists every note entry in ledger order, legacy and new, with heading, iteration and promotion links', async () => {
    await inRepo(async (repo) => {
      const dir = taskDir(repo);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'investigation_old.md'), '**investigation note** — x\n\n# Old findings\ntext\n');
      await writeFile(path.join(dir, 'plan_2026-10-02T14-35.md'), '# The plan\n');
      const rel = (name: string): string => `.ambicode/task/${TASK}/${name}`;
      await seed(repo, [
        { id: 'L1', at: 't1', kind: 'note', note: 'investigation', path: rel('investigation_old.md'), contentHash: 'h' },
        { id: 'L2', at: 't2', kind: 'review', reviewId: 'r', status: 'complete' },
        { id: `${A}-1`, at: 't3', kind: 'note', note: 'plan-draft', path: rel('plan-draft_2026-10-02T14-35.md'), contentHash: 'h' },
        { id: `${A}-2`, at: 't4', kind: 'note', note: 'plan', path: rel('plan_2026-10-02T14-35.md'), contentHash: 'h', promotedFrom: `${A}-1` },
        { id: `${A}-3`, at: 't5', kind: 'note', note: 'notes', path: rel('notes.md'), contentHash: 'h', iteration: 2 },
      ]);
      const rows = await listNotes(await runtimeFor(repo), TASK);
      assert.deepEqual(rows.map((row) => [row.id, row.note, row.heading, row.iteration, row.link]), [
        ['L1', 'investigation', 'Old findings', null, null],
        [`${A}-1`, 'plan-draft', '—', null, 'promoted → plan_2026-10-02T14-35.md'],
        [`${A}-2`, 'plan', 'The plan', null, 'from plan-draft_2026-10-02T14-35.md'],
        [`${A}-3`, 'notes', '—', 2, null],
      ]);
      assert.deepEqual(rows.map((row) => row.at), ['t1', 't3', 't4', 't5']);
      assert.equal(rows[0]?.path, rel('investigation_old.md'));
    });
  });
});

/** Gate answers over a real ledger; the engine is step 03's, so a fake reads the same ledger and answers as 01-contracts §6 says. */
function fakePort(repo: TempRepo): RouteContextPort {
  const read = (): Promise<LedgerEntry[]> => entriesOf(repo);
  const answers = (entries: LedgerEntry[], gate: string): LedgerEntry[] =>
    entries.filter((entry) => ['acceptance', 'declined', 'default-taken'].includes(entry.kind) && entry.gate === gate && entry.unbound !== true);
  const afterDesign = (entries: LedgerEntry[]): LedgerEntry[] => entries.slice(entries.findLastIndex((entry) => entry.kind === 'revise' && entry.from === 'design') + 1);
  return {
    async resolve(_task, session) {
      const mine = (await read()).filter((entry) => entry.kind === 'route' && entry.skill === 'plan' && entry.session === session).at(-1);
      if (mine === undefined) return null;
      return { task: TASK, routeId: mine.id, chainIds: [mine.id], skill: 'plan', session, mode: 'interactive', channel: 'hook', trusted: true, position: 'plan-accept' };
    },
    async assertOwner(view) {
      const owner = ownerOf(await read(), TASK);
      if (owner.state === 'owned' && owner.session !== view.session) throw new AmbicodeError('route-taken-over', `now owned by ${owner.session}`);
    },
    async window(_view, _step) {
      return afterDesign(await read());
    },
    async object() {
      return null;
    },
    async consent(view: RouteView, gate: string): Promise<ConsentResult> {
      const entries = afterDesign(await read());
      const given = answers(entries, gate);
      const latest = given.at(-1);
      if (latest === undefined) return { state: 'refused', reason: 'no-answer', source: null };
      if (latest.kind === 'acceptance' && latest.answer === 'Accept') {
        const bound = entries.some((entry) => entry.kind === 'gate' && entry.id === latest.instance && entry.gate === gate && view.chainIds.includes(String(entry.route)));
        if (latest.via === 'hook' && !bound) return { state: 'refused', reason: 'unbound', source: latest };
        return { state: 'honoured', source: latest as never, object: (latest.object as never) ?? null };
      }
      const earlier = given.slice(0, -1).some((entry) => entry.kind === 'acceptance' && entry.answer === 'Accept');
      return { state: 'refused', reason: earlier ? 'superseded' : 'not-accepted', source: latest };
    },
  };
}

class Scenario {
  readonly repo: TempRepo;
  runtime!: Runtime;
  routeId = `${A}-1`;
  prints = 0;
  constructor(repo: TempRepo) {
    this.repo = repo;
  }
  static async start(repo: TempRepo, fs?: FileSystem): Promise<Scenario> {
    const scenario = new Scenario(repo);
    scenario.runtime = await runtimeFor(repo, fs);
    await scenario.append(route(`${A}-1`, A));
    return scenario;
  }
  async append(entry: object): Promise<LedgerEntry> {
    return (await appendLedger(nodeFileSystem, taskDir(this.repo), NOW, A, entry as { kind: string })).entry;
  }
  async draft(body: string) {
    return save({ runtime: this.runtime, session: A, context: null }, 'plan-draft', body);
  }
  async gate(draft: { entry: LedgerEntry }): Promise<LedgerEntry> {
    this.prints += 1;
    const { id, path: file, contentHash: hash } = draft.entry as LedgerEntry & { path: string; contentHash: string };
    return this.append({ kind: 'gate', route: this.routeId, gate: 'plan-accept', class: 'declared', question: 'Accept?', print: this.prints, object: { kind: 'note', value: 'plan-draft', id, path: file, contentHash: hash } });
  }
  async answer(gate: LedgerEntry, answer: string, extra: object = {}): Promise<LedgerEntry> {
    return this.append({ kind: 'acceptance', route: this.routeId, gate: 'plan-accept', instance: gate.id, answer, via: 'hook', object: gate.object, ...extra });
  }
  deps(overrides: Partial<NoteDeps> = {}): NoteDeps {
    return { runtime: this.runtime, session: A, context: fakePort(this.repo), ...overrides };
  }
  promote(overrides: Partial<NoteDeps> = {}) {
    return promotePlan(this.deps(overrides), TASK);
  }
  files = async (): Promise<string[]> => (await readdir(taskDir(this.repo))).filter((name) => name.endsWith('.md')).sort();
  count = async (kind: string, note?: string): Promise<number> => (await entriesOf(this.repo)).filter((entry) => entry.kind === kind && (note === undefined || entry.note === note)).length;
}

const refused = (reason: string) => (error: AmbicodeError) => error.code === 'plan-not-accepted' && error.details.includes(`reason: ${reason}`);

describe('note promote: the accepted draft, and only that draft, becomes the plan', () => {
  it('02-P1: no session is session-unbound, before anything is read', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await assert.rejects(scenario.promote({ session: null }), { code: 'session-unbound' });
      await assert.rejects(scenario.promote({ session: null, context: null }), { code: 'session-unbound' });
    });
  });

  it('02-P6/S3: accept A, promote; a second call is plan-already-promoted and changes nothing', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const draft = await scenario.draft('# Plan A');
      await scenario.answer(await scenario.gate(draft), 'Accept');
      const done = await scenario.promote();
      assert.deepEqual(done, { outcome: 'promoted', path: draft.path.replace('plan-draft_', 'plan_'), promotedFrom: draft.entry.id });
      assert.deepEqual(await scenario.files(), ['plan_2026-10-02T14-35.md']);
      const plan = (await entriesOf(repo)).find((entry) => entry.kind === 'note' && entry.note === 'plan');
      assert.deepEqual([plan?.promotedFrom, plan?.contentHash, plan?.route], [draft.entry.id, draft.entry.contentHash, `${A}-1`]);
      assert.equal(await readFile(path.join(repo.root, String(plan?.path)), 'utf8'), await readFile(path.join(repo.root, done.path), 'utf8'));
      const before = await snapshot(repo);
      assert.equal((await scenario.promote()).outcome, 'plan-already-promoted');
      assert.equal(await snapshot(repo), before);
    });
  });

  it('02-P5/02-P8/S3: accept A, save B: object-changed names both and leaves everything; re-accepting B promotes B without a new plan-write', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const a = await scenario.draft('# Plan A');
      await scenario.answer(await scenario.gate(a), 'Accept');
      const b = await scenario.draft('# Plan B');
      const before = await snapshot(repo);
      await assert.rejects(scenario.promote(), (error: AmbicodeError) =>
        refused('object-changed')(error) && error.message.includes(a.path) && error.message.includes(b.path) &&
        error.message.includes(hash(a)) && error.message.includes(hash(b)));
      assert.equal(await snapshot(repo), before, '02-P8: a refusal leaves the draft and the ledger untouched');

      await scenario.answer(await scenario.gate(b), 'Accept');
      const drafts = await scenario.count('note', 'plan-draft');
      assert.equal((await scenario.promote()).promotedFrom, b.entry.id);
      assert.equal(await scenario.count('note', 'plan-draft'), drafts);
      assert.equal(await scenario.count('note', 'plan'), 1);
      assert.deepEqual(await scenario.files(), ['plan-draft_2026-10-02T14-35.md', 'plan_2026-10-02T14-35-2.md']);
    });
  });

  for (const [label, later] of [
    ['a Reject', (s: Scenario, gate: LedgerEntry) => s.answer(gate, 'Reject')],
    ['a Revise', (s: Scenario, gate: LedgerEntry) => s.answer(gate, 'Revise')],
    ['a default', (s: Scenario, gate: LedgerEntry) => s.append({ kind: 'default-taken', route: s.routeId, gate: 'plan-accept', instance: null, answer: 'Reject', via: 'headless', object: gate.object })],
  ] as const) {
    it(`02-P4: ${label} after an Accept supersedes it`, async () => {
      await inRepo(async (repo) => {
        const scenario = await Scenario.start(repo);
        const gate = await scenario.gate(await scenario.draft('# Plan'));
        await scenario.answer(gate, 'Accept');
        await later(scenario, gate);
        await assert.rejects(scenario.promote(), refused('superseded'));
        assert.deepEqual(await scenario.files(), ['plan-draft_2026-10-02T14-35.md']);
      });
    });
  }

  it('02-P4: via flag is refused even when the port wrongly reports it honoured; so is an unbound or non-Accept source', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const gate = await scenario.gate(await scenario.draft('# Plan'));
      await scenario.answer(gate, 'Accept', { via: 'flag' });
      await assert.rejects(scenario.promote(), refused('not-accepted'));
      const wrong: RouteContextPort = { ...fakePort(repo), consent: async () => ({ state: 'honoured', source: { id: 'x', at: 't', kind: 'acceptance', route: 'r', gate: 'plan-accept', instance: null, answer: 'Accept', via: 'hook' }, object: null }) };
      await assert.rejects(scenario.promote({ context: wrong }), refused('not-accepted'));
      const unbound: RouteContextPort = { ...wrong, consent: async () => ({ state: 'honoured', source: { id: 'x', at: 't', kind: 'acceptance', gate: 'plan-accept', instance: 'g', answer: 'Accept', via: 'hook', unbound: true }, object: null }) };
      await assert.rejects(scenario.promote({ context: unbound }), refused('not-accepted'));
    });
  });

  it('02-P5: changed file bytes, and identical bytes in a different draft entry, are object-changed', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const a = await scenario.draft('# Plan');
      await scenario.answer(await scenario.gate(a), 'Accept');
      await writeFile(path.join(repo.root, a.path), 'edited');
      await assert.rejects(scenario.promote(), refused('object-changed'));
    });
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const a = await scenario.draft('# Plan');
      await scenario.answer(await scenario.gate(a), 'Accept');
      const b = await scenario.draft('# Plan');
      assert.equal(a.entry.contentHash, b.entry.contentHash);
      await assert.rejects(scenario.promote(), refused('object-changed'));
    });
  });

  it('02-P2/02-P3: no plan route, a foreign instance, a taken-over route and a draft outside the plan-check window', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const gate = await scenario.gate(await scenario.draft('# Plan'));
      await assert.rejects(scenario.promote({ session: 'cccccccc' }), refused('no-plan-route'));
      await scenario.append({ kind: 'acceptance', route: scenario.routeId, gate: 'plan-accept', instance: 'zzzzzzzz-99', answer: 'Accept', via: 'hook', object: gate.object });
      await assert.rejects(scenario.promote(), refused('unbound'));
      await scenario.answer(gate, 'Accept');
      await scenario.append(route(`${B}-1`, B, { resumes: `${A}-1`, adopts: true }));
      await assert.rejects(scenario.promote(), { code: 'route-taken-over' });
    });
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('# Plan');
      await scenario.append({ kind: 'revise', route: scenario.routeId, from: 'design', via: 'model', cycle: 1, reason: 'scope moved' });
      await assert.rejects(scenario.promote(), { code: 'plan-draft-missing' });
    });
  });

  it('02-P5: a legacy plan note neither satisfies nor blocks a promotion', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await writeFile(path.join(taskDir(repo), 'plan_old.md'), '**plan** — accepted\n\n# Old way\n');
      await appendLedger(nodeFileSystem, taskDir(repo), new Date(), 'legacy00', { kind: 'note', note: 'plan', path: `.ambicode/task/${TASK}/plan_old.md`, contentHash: 'h' });
      const gate = await scenario.gate(await scenario.draft('# Plan'));
      await scenario.answer(gate, 'Accept');
      assert.equal((await scenario.promote()).outcome, 'promoted');
    });
  });

  it('02-P7/S10: a crash after the rename and before the entry is repaired by the next call, with no new consent and no rename', async () => {
    await inRepo(async (repo) => {
      const crashing: FileSystem = {
        ...nodeFileSystem,
        appendText: async (file, text) => {
          if (text.includes('"promotedFrom"')) throw new Error('crash');
          return nodeFileSystem.appendText(file, text);
        },
      };
      const scenario = await Scenario.start(repo, crashing);
      const draft = await scenario.draft('# Plan');
      await scenario.answer(await scenario.gate(draft), 'Accept');
      await assert.rejects(scenario.promote(), /crash/);
      assert.deepEqual(await scenario.files(), ['plan_2026-10-02T14-35.md']);
      assert.equal(await scenario.count('note', 'plan'), 0);

      const renames: string[] = [];
      scenario.runtime = await runtimeFor(repo, { ...nodeFileSystem, rename: async (from, to) => void renames.push(from, to) });
      const consent = (await entriesOf(repo)).length;
      const repaired = await scenario.promote();
      assert.equal(repaired.outcome, 'repaired');
      assert.deepEqual(renames, []);
      assert.equal((await entriesOf(repo)).length, consent + 1);
      assert.equal((await scenario.promote()).outcome, 'plan-already-promoted');
    });
  });

  it('02-P7: neither file present is plan-draft-missing; a plan file with other bytes is object-changed', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      const draft = await scenario.draft('# Plan');
      await scenario.answer(await scenario.gate(draft), 'Accept');
      await rm(path.join(repo.root, draft.path));
      await assert.rejects(scenario.promote(), { code: 'plan-draft-missing' });
      await writeFile(path.join(repo.root, draft.path.replace('plan-draft_', 'plan_')), 'other bytes');
      await assert.rejects(scenario.promote(), refused('object-changed'));
    });
  });
});

describe('02-L7: who takes the lock', () => {
  const countingFs = (locks: string[]): FileSystem => ({
    ...nodeFileSystem,
    createExclusive: async (file, contents) => {
      if (file.endsWith('ledger.lock')) locks.push(file);
      return nodeFileSystem.createExclusive(file, contents);
    },
  });

  it('02-L7: saveNote and promotePlan without deps.ledger take exactly one lock', async () => {
    await inRepo(async (repo) => {
      const locks: string[] = [];
      const scenario = await Scenario.start(repo, countingFs(locks));
      const draft = await scenario.draft('# Plan');
      assert.equal(locks.length, 1);
      await scenario.answer(await scenario.gate(draft), 'Accept');
      await scenario.promote();
      assert.equal(locks.length, 2);
    });
  });

  it('02-L7: with deps.ledger they append through the held lock and acquire no other', async () => {
    await inRepo(async (repo) => {
      const locks: string[] = [];
      const scenario = await Scenario.start(repo, countingFs(locks));
      const draft = await scenario.draft('# Plan');
      await scenario.answer(await scenario.gate(draft), 'Accept');
      locks.length = 0;
      const dir = taskDir(repo);
      const outcome = await withLedgerLock(scenario.runtime.fs, dir, () => NOW, A, async (ledger) => {
        const note = await save({ runtime: scenario.runtime, session: A, context: null, ledger }, 'notes', 'inside the lock');
        const promoted = await scenario.promote({ ledger });
        return [note.entry.id, promoted.outcome];
      });
      assert.deepEqual(locks.length, 1);
      assert.equal(outcome[1], 'promoted');
      assert.match(String(outcome[0]), new RegExp(`^${A}-`));
      await assert.rejects(
        withLedgerLock(scenario.runtime.fs, dir, () => NOW, A, async () => save({ runtime: scenario.runtime, session: A, context: null }, 'notes', 'x')),
        { code: 'internal' },
      );
    });
  });
});

function hash(saved: { entry: LedgerEntry }): string {
  return String(saved.entry.contentHash).replace(/^sha256:/, '').slice(0, 12);
}
