import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '../../composition/root.ts';
import { contentHash } from '../../util/hash.ts';
import { TempRepo } from '../../testing/temp-repo.ts';
import { parseArgs } from '../args.ts';
import { NOTE_SAVE_OPTIONS, runNoteSave } from './note.ts';

const MAIN = path.join(import.meta.dirname, '..', 'main.ts');

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

  it('saves into the configured repository below the session directory, where the hook prepared', async () => {
    const run = async (cwd: string) =>
      runNoteSave(
        await createRuntime({ cwd, clock: { now: () => NOW, elapsed: () => 0 }, stdin: { read: async () => 'note' } }),
        parseArgs('note save', ['--task', 'x', '--kind', 'investigation'], NOTE_SAVE_OPTIONS),
      );
    const withConfiguredChild = async (parent: string) => {
      execFileSync('git', ['init', '-q', path.join(parent, 'repo')]);
      await mkdir(path.join(parent, 'repo', '.ambicode'), { recursive: true });
      await writeFile(path.join(parent, 'repo', '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    };
    // The eval sandbox's home is an unconfigured git tree holding repo/.
    await inRepo(async (home) => {
      await withConfiguredChild(home.root);
      const out = await run(home.root);
      assert.equal(out.path, 'repo/.ambicode/task/x/investigation_2026-10-02T14-35.md');
      assert.match(await readFile(path.join(home.root, out.path), 'utf8'), /note/);
      await assert.rejects(readdir(path.join(home.root, '.ambicode')));
    });
    const plain = await mkdtemp(path.join(tmpdir(), 'ambicode-note-parent-'));
    try {
      await withConfiguredChild(plain);
      assert.equal((await run(plain)).path, 'repo/.ambicode/task/x/investigation_2026-10-02T14-35.md');
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
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
      assert.deepEqual(lines.map((line) => [line.kind, line.note]), [['note', 'investigation'], ['note', 'notes']]);
      for (const line of lines) assert.match(line.id, /^[0-9a-f]{8}-1$/);
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

function cli(repo: TempRepo, argv: string[], input = ''): { status: number | null; stdout: string; stderr: string } {
  const { status, stdout, stderr } = spawnSync(process.execPath, [MAIN, ...argv], { cwd: repo.root, input, encoding: 'utf8' });
  return { status, stdout, stderr };
}

describe('the note and report commands', () => {
  it('02-D2: note promote refuses with session-unbound, naming decision 0-S, and writes nothing', async () => {
    await inRepo(async (repo) => {
      const out = cli(repo, ['note', 'promote', '--task', 'ORD-17']);
      assert.equal(out.status, 2);
      assert.match(out.stderr, /error \[session-unbound\]/);
      assert.match(out.stderr, /0-S/);
      await assert.rejects(readdir(path.join(repo.root, '.ambicode')));
    });
  });

  it('02-D2: a plan-draft save on a task with a live plan route refuses with session-unbound', async () => {
    await inRepo(async (repo) => {
      const dir = path.join(repo.root, '.ambicode/task/ORD-17');
      await mkdir(dir, { recursive: true });
      const route = { id: 'aaaaaaaa-1', at: 't', kind: 'route', skill: 'plan', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session: 'aaaaaaaa', epoch: 1 };
      await writeFile(path.join(dir, 'ledger.jsonl'), `${JSON.stringify(route)}\n`);
      const out = cli(repo, ['note', 'save', '--task', 'ORD-17', '--kind', 'plan-draft'], '# Plan');
      assert.match(out.stderr, /error \[session-unbound\]/);
      assert.deepEqual((await readdir(dir)).sort(), ['ledger.jsonl']);
    });
  });

  it('02-N5: --kind plan still saves, and says on standard error that it is deprecated', async () => {
    await inRepo(async (repo) => {
      const out = cli(repo, ['note', 'save', '--task', 'ORD-17', '--kind', 'plan', '--json'], '# Plan');
      assert.equal(out.status, 0);
      assert.match(out.stderr, /"--kind plan" is deprecated/);
      assert.equal(JSON.parse(out.stdout).kind, 'plan');
    });
  });

  it('02-N6/02-R7: note list --json and report --json print their shapes', async () => {
    await inRepo(async (repo) => {
      cli(repo, ['note', 'save', '--task', 'ORD-17', '--kind', 'investigation'], '# Findings');
      const list = JSON.parse(cli(repo, ['note', 'list', '--task', 'ORD-17', '--json']).stdout);
      assert.deepEqual(Object.keys(list), ['command', 'task', 'notes']);
      assert.deepEqual(Object.keys(list.notes[0]), ['id', 'note', 'path', 'at', 'heading', 'iteration', 'link']);
      assert.equal(list.notes[0].heading, 'Findings');
      const text = cli(repo, ['note', 'list', '--task', 'ORD-17']).stdout;
      assert.match(text, /investigation {2}\.ambicode\/task\/ORD-17\/investigation_.*Findings/);

      const report = JSON.parse(cli(repo, ['report', '--task', 'ORD-17', '--json']).stdout);
      assert.deepEqual(Object.keys(report), ['evidence', 'notVerified', 'hash']);
      assert.match(cli(repo, ['report', '--task', 'ORD-17']).stdout, new RegExp(`<!-- ambicode report ${report.hash} -->\n$`));
    });
  });

  it('02-A4: a ledger of 1 MiB warns on standard error, naming a separate task, and the save still succeeds', async () => {
    await inRepo(async (repo) => {
      const dir = path.join(repo.root, '.ambicode/task/ORD-17');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'ledger.jsonl'), '\n'.repeat(1_048_576));
      const out = cli(repo, ['note', 'save', '--task', 'ORD-17', '--kind', 'notes', '--json'], 'x');
      assert.equal(out.status, 0);
      assert.match(out.stderr, /--task ORD-17-2/);
      assert.equal(JSON.parse(out.stdout).command, 'note save');
    });
  });
});
