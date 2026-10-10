import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ticketOf } from './shortlist-recall.mjs';

describe('ticketOf', () => {
  it('returns the text between the ticket tags, trimmed', () => {
    assert.equal(ticketOf('Find the files.\n<ticket>\n  Export is slow.\n  See ORD-1.\n</ticket>\nThanks'), 'Export is slow.\n  See ORD-1.');
  });

  it('is null for a prompt without a ticket, so a review case is skipped rather than searched with nothing', () => {
    assert.equal(ticketOf('Review this merge request.'), null);
  });
});

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONFIG } from '../../../../src/testing/fixtures/route-fixture.ts';
import { parseArgv, shortlistRecall, summarize } from './shortlist-recall.mjs';

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function sideRepo(root, files) {
  write(root, { '.ambicode/config.yaml': `${CONFIG}\n`, ...files });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init');
}

/** Two synthetic sides; each case's truth is a file the ticket names plus one it does not. */
function bench() {
  const root = mkdtempSync(path.join(tmpdir(), 'recall-'));
  const side = (name) => ({
    'src/billing/invoiceTotals.ts': 'export function invoiceTotals() { return 1; }\n',
    'src/legacy/settle.ts': 'export function settleLedger() { return 2; }\n',
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`src/other/${name}-${i}.ts`, `export const value${i} = ${i};\n`])),
  });
  sideRepo(path.join(root, 'BE-express'), side('be'));
  sideRepo(path.join(root, 'FE-angular'), side('fe'));
  for (const s of ['BE-express', 'FE-angular']) {
    write(path.join(root, 'evals', s, 'full', `secret-case-${s}`), {
      'truth.json': JSON.stringify({ side: s, truth: ['src/billing/invoiceTotals.ts', 'src/legacy/settle.ts'] }),
      'prompt.md': '<ticket>\nFix `invoiceTotals` rounding in the confidential module.\n</ticket>\n',
    });
  }
  return { root, cases: path.join(root, 'evals'), repos: { 'BE-express': path.join(root, 'BE-express'), 'FE-angular': path.join(root, 'FE-angular') } };
}

describe('offline map recall', () => {
  it('--cases takes an absolute path only; cases come from <cases>/<project>/full', async () => {
    assert.throws(() => parseArgv(['be', 'fe', '--cases', 'rel/dir']), /absolute path/);
    assert.deepEqual([parseArgv(['be', 'fe', '15', '--cases', '/tmp/b']).cases, parseArgv(['be', 'fe', '15']).limit], ['/tmp/b', 15]);
    const fx = bench();
    try {
      const rows = await shortlistRecall({ repos: fx.repos, cases: fx.cases });
      assert.deepEqual(rows.map((row) => row.side), ['BE-express', 'FE-angular']);
      assert.ok(rows.every((row) => row.recall >= 0.5), JSON.stringify(rows));
      assert.equal(existsSync(path.join(fx.repos['BE-express'], '.ambicode', 'tasks')), false, 'no ledger written');
      const text = summarize(rows).join('\n');
      assert.match(text, /^BE-express: n=1 recall@15 \d\.\d{3}$/m);
      for (const secret of ['secret-case', 'confidential', 'invoiceTotals', 'src/', 'settle']) assert.ok(!text.includes(secret), secret);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });
});
