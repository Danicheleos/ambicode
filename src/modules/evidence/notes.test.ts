import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { appendLedger, readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { acceptPlan, planStatusOf, saveNote } from './notes.ts';
import type { Runtime } from '#types/composition';
import { LEDGER_FILE, type LedgerEntry, type NoteDeps } from '#types/modules/evidence';
import type { ConsentResult, CommandContext, RouteView } from '#types/harness';
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
    await mkdir(taskDir(repo), { recursive: true });
    await writeFile(path.join(taskDir(repo), LEDGER_FILE), '');
    await run(repo);
  } finally {
    await repo.dispose();
  }
}

const runtimeFor = (repo: TempRepo, fs: FileSystem = nodeFileSystem): Promise<Runtime> =>
  createRuntime({ cwd: repo.root, fs, clock: { now: () => NOW, elapsed: () => 0 } });

const taskDir = (repo: TempRepo, slug = TASK): string => path.join(repo.root, '.ambicode', 'tasks', slug);

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

const save = (deps: NoteDeps, kind: 'investigation' | 'notes', body: string | null) => saveNote(deps, { task: TASK, kind, body });

const entriesOf = async (repo: TempRepo): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, taskDir(repo));

describe('note save: kinds, bodies and headers', () => {
  it('02-N1: saves investigation and notes from a body', async () => {
    await inRepo(async (repo) => {
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const investigation = await save(deps, 'investigation', 'Finding\n');
      const notes = await save(deps, 'notes', 'work so far');
      assert.deepEqual([investigation.path, notes.path], [
        '.ambicode/tasks/ORD-17/investigation_2026-10-02T14-35.md',
        '.ambicode/tasks/ORD-17/notes.md',
      ]);
      await assert.rejects(save(deps, 'investigation', '  '), { code: 'bad-argument', field: 'stdin' });
      await assert.rejects(save(deps, 'notes', 'x'.repeat(262_145)), { code: 'bad-argument' });
      assert.equal((await save(deps, 'notes', 'x'.repeat(262_000))).kind, 'notes');
    });
  });

  it('02-N3: an investigation is stamped, collision-suffixed and recorded, with the author\'s words only', async () => {
    await inRepo(async (repo) => {
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      const first = await save(deps, 'investigation', '# Finding A');
      const second = await save(deps, 'investigation', '# Finding B');
      assert.match(second.path, /investigation_2026-10-02T14-35-2\.md$/);
      const text = await readFile(path.join(repo.root, first.path), 'utf8');
      assert.equal(text, '# Finding A\n');
      assert.deepEqual(
        { ...first.entry },
        { id: '1', at: first.entry.at, kind: 'note', note: 'investigation', path: first.path, contentHash: contentHash(text) },
      );
    });
  });

  it('06-N1: saveNote refuses kind plan before writing anything', async () => {
    await inRepo(async (repo) => {
      await seed(repo, [route('1', A)]);
      const before = await snapshot(repo);
      const deps = { runtime: await runtimeFor(repo), session: null, context: null };
      await assert.rejects(saveNote(deps, { task: TASK, kind: 'plan' as never, body: '# Plan' }), (error: AmbicodeError) => error.code === 'bad-argument' && error.field === 'kind');
      assert.equal(await snapshot(repo), before);
    });
  });
});

/** Gate answers over a real ledger; the engine is step 03's, so a fake reads the same ledger and answers as 01-contracts §6 says. */
function fakePort(repo: TempRepo): CommandContext {
  const read = (): Promise<LedgerEntry[]> => entriesOf(repo);
  const answers = (entries: LedgerEntry[], gate: string): LedgerEntry[] =>
    entries.filter((entry) => ['acceptance', 'declined', 'default-taken'].includes(entry.kind) && entry.gate === gate && entry.unbound !== true);
  const afterDraft = (entries: LedgerEntry[]): LedgerEntry[] => entries.slice(entries.findLastIndex((entry) => entry.kind === 'revise' && entry.from === 'draft') + 1);
  return {
    async open(_task, session) {
      const entries = await read();
      const mine = entries.filter((entry) => entry.kind === 'route' && entry.skill === 'plan' && entry.session === session).at(-1);
      if (mine === undefined || entries.some((entry) => entry.kind === 'exit' && entry.route === mine.id)) return null;
      return { task: TASK, routeId: mine.id, chainIds: [mine.id], skill: 'plan', session, mode: 'interactive', channel: 'hook', trusted: true, position: 'plan-accept' };
    },
    entries: () => read(),
    raise: async () => {
      throw new Error('the fake port raises no gate');
    },
    async window(_view, _step) {
      return afterDraft(await read());
    },
    async consent(view: RouteView, gate: string): Promise<ConsentResult> {
      const entries = afterDraft(await read());
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
  routeId = '1';
  prints = 0;
  constructor(repo: TempRepo) {
    this.repo = repo;
  }
  static async start(repo: TempRepo, fs?: FileSystem): Promise<Scenario> {
    const scenario = new Scenario(repo);
    scenario.runtime = await runtimeFor(repo, fs);
    await scenario.append(route('1', A));
    return scenario;
  }
  async append(entry: object): Promise<LedgerEntry> {
    return (await appendLedger(nodeFileSystem, taskDir(this.repo), NOW, entry as { kind: string })).entry;
  }
  /** The model's Write: the task's one plan file. */
  async draft(body: string): Promise<string> {
    const file = path.join(taskDir(this.repo), 'plan.md');
    await writeFile(file, body);
    return file;
  }
  async gate(): Promise<LedgerEntry> {
    this.prints += 1;
    return this.append({ kind: 'gate', route: this.routeId, gate: 'plan-accept', class: 'declared', question: 'Accept?', print: this.prints });
  }
  async answer(gate: LedgerEntry, answer: string, extra: object = {}): Promise<LedgerEntry> {
    return this.append({ kind: 'acceptance', route: this.routeId, gate: 'plan-accept', instance: gate.id, answer, via: 'hook', ...extra });
  }
  deps(overrides: Partial<NoteDeps> = {}): NoteDeps {
    return { runtime: this.runtime, session: A, context: fakePort(this.repo), ...overrides };
  }
  accept(overrides: Partial<NoteDeps> = {}, anchorsBad = 0) {
    return acceptPlan(this.deps(overrides), TASK, anchorsBad);
  }
  files = async (): Promise<string[]> => (await readdir(taskDir(this.repo))).filter((name) => name.endsWith('.md')).sort();
  count = async (kind: string, note?: string): Promise<number> => (await entriesOf(this.repo)).filter((entry) => entry.kind === kind && (note === undefined || entry.note === note)).length;
}

const refused = (reason: string) => (error: AmbicodeError) => error.code === 'plan-not-accepted' && error.details.includes(`reason: ${reason}`);

describe('plan accept: the plan file, as it is when the user answers, becomes the accepted plan', () => {
  const plan = (scenario: Scenario): Promise<string> => readFile(path.join(taskDir(scenario.repo), 'plan.md'), 'utf8');
  const planNotes = async (repo: TempRepo): Promise<LedgerEntry[]> => (await entriesOf(repo)).filter((entry) => entry.kind === 'note' && entry.note === 'plan');

  it('02-P1: no session or no context refuses before anything is read', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await assert.rejects(scenario.accept({ session: null }), { code: 'plan-not-accepted' });
      await assert.rejects(scenario.accept({ session: null, context: null }), { code: 'plan-not-accepted' });
    });
  });

  it('02-P6: Accept sets status: accepted in place, keeps the other frontmatter keys and records the hash of the file as written', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('---\nstatus: draft\ntitle: T\n---\n\n# Plan A\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept({}, 2);
      const text = await plan(scenario);
      assert.equal(text, '---\nstatus: accepted\ntitle: T\n---\n\n# Plan A\n');
      assert.equal(planStatusOf(text), 'accepted');
      const [note] = await planNotes(repo);
      assert.deepEqual([note?.path, note?.contentHash, note?.anchorsBad, note?.route], [`.ambicode/tasks/${TASK}/plan.md`, contentHash(text), 2, '1']);
      assert.deepEqual(await scenario.files(), ['plan.md']);
    });
  });

  it('a plan with no frontmatter gets one; one without a status line gets the line', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('# Plan\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept();
      assert.equal(await plan(scenario), '---\nstatus: accepted\n---\n\n# Plan\n');
    });
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('---\ntitle: T\n---\n# Plan\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept();
      assert.equal(await plan(scenario), '---\ntitle: T\nstatus: accepted\n---\n# Plan\n');
    });
  });

  it('REPRO: a user edit between the gate and the answer is accepted as it is, not re-asked', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('---\nstatus: draft\n---\n# Plan A\n');
      const gate = await scenario.gate();
      await scenario.draft('---\nstatus: draft\n---\n# Edited by the user\n');
      await scenario.answer(gate, 'Accept');
      await scenario.accept();
      assert.match(await plan(scenario), /status: accepted\n---\n# Edited by the user/);
      assert.equal((await planNotes(repo)).length, 1);
    });
  });

  it('a second accepted plan for the same task replaces plan.md and the latest plan note carries its hash', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('# Plan A\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept();
      await scenario.draft('# Plan B\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept();
      const plans = await planNotes(repo);
      assert.equal(plans.length, 2);
      assert.equal(plans.at(-1)?.contentHash, contentHash(await plan(scenario)));
      assert.notEqual(plans[0]?.contentHash, plans[1]?.contentHash);
    });
  });

  for (const [label, later] of [
    ['a Reject', (s: Scenario, gate: LedgerEntry) => s.answer(gate, 'Reject')],
    ['a Revise', (s: Scenario, gate: LedgerEntry) => s.answer(gate, 'Revise')],
    ['a default', (s: Scenario, gate: LedgerEntry) => s.append({ kind: 'default-taken', route: s.routeId, gate: 'plan-accept', instance: null, answer: 'Reject', via: 'headless', object: gate.object })],
  ] as const) {
    it(`02-P4: ${label} after an Accept supersedes it and the file stays a draft`, async () => {
      await inRepo(async (repo) => {
        const scenario = await Scenario.start(repo);
        await scenario.draft('---\nstatus: draft\n---\n# Plan\n');
        const gate = await scenario.gate();
        await scenario.answer(gate, 'Accept');
        await later(scenario, gate);
        await assert.rejects(scenario.accept(), refused('superseded'));
        assert.equal(planStatusOf(await plan(scenario)), 'draft');
        assert.equal((await planNotes(repo)).length, 0);
      });
    });
  }

  it('02-P4: via flag is refused even when the port wrongly reports it honoured; so is an unbound or non-Accept source', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('# Plan\n');
      const gate = await scenario.gate();
      await scenario.answer(gate, 'Accept', { via: 'flag' });
      await assert.rejects(scenario.accept(), refused('not-accepted'));
      const wrong: CommandContext = { ...fakePort(repo), consent: async () => ({ state: 'honoured', source: { id: 'x', at: 't', kind: 'acceptance', route: 'r', gate: 'plan-accept', instance: null, answer: 'Accept', via: 'hook' }, object: null }) };
      await assert.rejects(scenario.accept({ context: wrong }), refused('not-accepted'));
      const unbound: CommandContext = { ...wrong, consent: async () => ({ state: 'honoured', source: { id: 'x', at: 't', kind: 'acceptance', gate: 'plan-accept', instance: 'g', answer: 'Accept', via: 'hook', unbound: true }, object: null }) };
      await assert.rejects(scenario.accept({ context: unbound }), refused('not-accepted'));
      assert.equal(await plan(scenario), '# Plan\n');
    });
  });

  it('02-P2/02-P3: no plan route, a foreign instance and an interrupted route', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.draft('# Plan\n');
      const gate = await scenario.gate();
      await assert.rejects(scenario.accept({ session: 'cccccccc' }), refused('no-plan-route'));
      await scenario.append({ kind: 'acceptance', route: scenario.routeId, gate: 'plan-accept', instance: '99', answer: 'Accept', via: 'hook' });
      await assert.rejects(scenario.accept(), refused('unbound'));
      await scenario.answer(gate, 'Accept');
      await scenario.append({ at: 't', kind: 'exit', route: '1', reason: 'interrupted' });
      await scenario.append(route('9', B));
      await assert.rejects(scenario.accept(), refused('no-plan-route'));
    });
  });

  it('02-P7: a missing or empty plan.md is plan-draft-missing', async () => {
    await inRepo(async (repo) => {
      const scenario = await Scenario.start(repo);
      await scenario.answer(await scenario.gate(), 'Accept');
      await assert.rejects(scenario.accept(), { code: 'plan-draft-missing' });
      await scenario.draft('  \n');
      await assert.rejects(scenario.accept(), { code: 'plan-draft-missing' });
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

  it('02-L7: saveNote and acceptPlan without deps.ledger take exactly one lock', async () => {
    await inRepo(async (repo) => {
      const locks: string[] = [];
      const scenario = await Scenario.start(repo, countingFs(locks));
      await save({ runtime: scenario.runtime, session: A, context: null }, 'notes', 'x');
      assert.equal(locks.length, 1);
      await scenario.draft('# Plan\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      await scenario.accept();
      assert.equal(locks.length, 2);
    });
  });

  it('02-L7: with deps.ledger they append through the held lock and acquire no other', async () => {
    await inRepo(async (repo) => {
      const locks: string[] = [];
      const scenario = await Scenario.start(repo, countingFs(locks));
      await scenario.draft('# Plan\n');
      await scenario.answer(await scenario.gate(), 'Accept');
      locks.length = 0;
      const dir = taskDir(repo);
      const outcome = await withLedgerLock(scenario.runtime.fs, dir, () => NOW, async (ledger) => {
        const note = await save({ runtime: scenario.runtime, session: A, context: null, ledger }, 'notes', 'inside the lock');
        await scenario.accept({ ledger });
        return note.entry.id;
      });
      assert.deepEqual(locks.length, 1);
      assert.match(String(outcome), /^\d+$/);
      await assert.rejects(
        withLedgerLock(scenario.runtime.fs, dir, () => NOW, async () => save({ runtime: scenario.runtime, session: A, context: null }, 'notes', 'x')),
        { code: 'internal' },
      );
    });
  });
});
