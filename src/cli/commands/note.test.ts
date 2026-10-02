import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '../../composition/root.ts';
import { contentHash } from '../../util/hash.ts';
import { TempRepo } from '../../testing/temp-repo.ts';
import { parseArgs } from '../args.ts';
import { NOTE_SAVE_OPTIONS, runNoteSave } from './note.ts';

const NOW = new Date(2026, 9, 2, 14, 35);

async function save(repo: TempRepo, argv: string[], body: string | null) {
  const runtime = await createRuntime({
    cwd: repo.root,
    clock: { now: () => NOW, elapsed: () => 0 },
    stdin: { read: async () => body },
  });
  return runNoteSave(runtime, parseArgs('note save', argv, NOTE_SAVE_OPTIONS));
}

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

describe('note save owns the name, the time and the label of a task note', () => {
  it('stamps the clock into the name and labels an investigation note', async () => {
    await inRepo(async (repo) => {
      const out = await save(repo, ['--task', 'ORD-17', '--kind', 'investigation'], 'Finding: validate() lives in service.ts:12\n');
      assert.equal(out.path, '.ambicode/task/ORD-17/investigation_2026-10-02T14-35.md');
      const text = await readFile(path.join(repo.root, out.path), 'utf8');
      assert.match(text, /^\*\*investigation note\*\* — not an accepted plan/);
      assert.match(text, /Finding: validate\(\)/);
    });
  });

  it('does not label twice when the body already starts with the label, and labels a plan "accepted"', async () => {
    await inRepo(async (repo) => {
      const plan = await save(repo, ['--task', 'ORD-17', '--kind', 'plan'], '**plan** — accepted\n\n# Plan\n');
      const text = await readFile(path.join(repo.root, plan.path), 'utf8');
      assert.equal(text.match(/\*\*plan\*\*/g)?.length, 1);
      const bare = await save(repo, ['--task', 'ORD-18', '--kind', 'plan'], '# Plan\n');
      assert.match(await readFile(path.join(repo.root, bare.path), 'utf8'), /^\*\*plan\*\* — accepted\n\n# Plan/);
    });
  });

  it('keeps two saves in the same minute apart instead of overwriting', async () => {
    await inRepo(async (repo) => {
      const first = await save(repo, ['--task', 'x', '--kind', 'investigation'], 'one');
      const second = await save(repo, ['--task', 'x', '--kind', 'investigation'], 'two');
      assert.notEqual(first.path, second.path);
      assert.match(second.path, /T14-35-2\.md$/);
      assert.match(await readFile(path.join(repo.root, first.path), 'utf8'), /one/);
    });
  });

  it('writes notes.md as the one resumable file, replaced on the next save', async () => {
    await inRepo(async (repo) => {
      await save(repo, ['--task', 'x', '--kind', 'notes'], 'first');
      const out = await save(repo, ['--task', 'x', '--kind', 'notes'], 'second');
      assert.equal(out.path, '.ambicode/task/x/notes.md');
      const text = await readFile(path.join(repo.root, out.path), 'utf8');
      assert.match(text, /second/);
      assert.doesNotMatch(text, /first/);
    });
  });

  it('cannot be steered out of the task directory by the slug', async () => {
    await inRepo(async (repo) => {
      const out = await save(repo, ['--task', '../../src/evil', '--kind', 'investigation'], 'x');
      assert.match(out.path, /^\.ambicode\/task\/[A-Za-z0-9._-]+\/investigation_/);
      assert.ok(!out.path.includes('..'));
    });
  });

  it('records each save in the task ledger with the hash of what was written', async () => {
    await inRepo(async (repo) => {
      const out = await save(repo, ['--task', 'ORD-17', '--kind', 'investigation'], 'one');
      await save(repo, ['--task', 'ORD-17', '--kind', 'notes'], 'two');
      const lines = (await readFile(path.join(repo.root, '.ambicode/task/ORD-17/ledger.jsonl'), 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(lines.map((line) => [line.id, line.kind, line.note]), [['L1', 'note', 'investigation'], ['L2', 'note', 'notes']]);
      assert.equal(lines[0].path, out.path);
      assert.equal(lines[0].contentHash, contentHash(await readFile(path.join(repo.root, out.path), 'utf8')));
    });
  });

  it('refuses a missing kind, a missing task and an empty body, writing nothing', async () => {
    await inRepo(async (repo) => {
      await assert.rejects(save(repo, ['--task', 'x'], 'body'), /--kind/);
      await assert.rejects(save(repo, ['--kind', 'plan'], 'body'), /--task/);
      await assert.rejects(save(repo, ['--task', 'x', '--kind', 'plan'], '  \n'), /standard input/);
      await assert.rejects(save(repo, ['--task', 'x', '--kind', 'plan'], null), /standard input/);
      await assert.rejects(readFile(path.join(repo.root, '.ambicode/task/x/plan.md')));
      await assert.rejects(readdir(path.join(repo.root, '.ambicode/task')));
    });
  });
});
