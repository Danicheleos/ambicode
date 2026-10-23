// Each review fixture materializes with the scaffold its case uses, and the truth names only lines the uncommitted change adds.
// The diff is the one a working-target review sees: untracked files included, so everything is staged in the throwaway copy first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REVIEW_TRUTHS, fixtureOf, truthRecords } from '../evals/scripts/review-cases.mjs';
import { fixtureByName } from './definitions.mjs';
import { materialize } from './materialize.mjs';

const CLI = path.join(path.dirname(import.meta.dirname), 'scripts', 'ambicode.mjs');
// The fixture code carries no label and no plugin vocabulary; the wording belongs to the case files.
const LABELLED = /\b(TODO|FIXME|HACK|XXX|unused|bug|buggy|ambicode|reviewer)\b/i;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

/** `{ file: Set<newSideLine> }` of every line the working tree adds over HEAD, and the added text. */
function addedLines(cwd) {
  git(cwd, 'add', '-A');
  const added = new Map();
  const text = [];
  let file = null;
  let line = 0;
  for (const row of git(cwd, 'diff', '--cached', '-U0', 'HEAD').split('\n')) {
    if (row.startsWith('+++ b/')) {
      file = row.slice('+++ b/'.length);
      added.set(file, new Set());
    } else if (row.startsWith('@@')) line = Number(/\+(\d+)/.exec(row)[1]);
    else if (row.startsWith('+') && file !== null) {
      added.get(file).add(line);
      text.push(row.slice(1));
      line += 1;
    }
  }
  return { added, text };
}

describe('review fixtures', () => {
  for (const truth of REVIEW_TRUTHS) {
    it(`${fixtureOf(truth)}: scaffold files exist and the first location of every issue starts on an added line of the diff`, async () => {
      const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-review-fixture-'));
      const destination = path.join(parent, 'repo');
      try {
        await materialize(fixtureByName(fixtureOf(truth)), destination, { ambicodeInit: true, context: true, policy: truth.policy });
        const ambicode = path.join(destination, '.ambicode');
        assert.ok(existsSync(path.join(ambicode, 'config.yaml')));
        assert.ok(existsSync(path.join(ambicode, 'context', 'conventions.md')));
        assert.equal(existsSync(path.join(ambicode, 'policies', 'team-rules.yaml')), truth.policy);
        if (truth.policy) {
          const out = execFileSync(process.execPath, [CLI, 'policy', 'check', path.join(ambicode, 'policies', 'team-rules.yaml')], { cwd: destination, encoding: 'utf8' });
          assert.match(out, /No errors/);
        }

        const { added, text } = addedLines(destination);
        assert.ok([...added.values()].some((lines) => lines.size > 0), 'the change adds lines');
        for (const row of text) assert.doesNotMatch(row, LABELLED, row);
        const total = [...added.values()].reduce((sum, lines) => sum + lines.size, 0);
        assert.ok(added.size >= 2 && added.size <= 8, `${added.size} files`);
        assert.ok(total >= 40 && total <= 150, `${total} added lines`);
        for (const record of truthRecords(truth)) {
          const first = record.locations[0];
          const lines = added.get(first.file.split(path.sep).join('/'));
          assert.ok(lines !== undefined, `${first.file} is in the diff`);
          assert.ok(lines.has(first.lines[0]), `${first.file}:${first.lines[0]} is an added line`);
        }
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }
});
