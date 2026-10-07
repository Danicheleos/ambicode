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
import { M6, parseArgv, shortlistRecall, summarize } from './shortlist-recall.mjs';

const PROFILE = '    profile: { stamp: { commit: "", files: 0 }, sources: [ts], companions: [], catalogs: [], featureKinds: [], exportOnly: false }';

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function sideRepo(root, files) {
  write(root, { '.ambicode/config.yaml': `${CONFIG.replace('  - { id: app, root: ".", ecosystem: typescript }', '  - id: app\n    root: "."\n    ecosystem: typescript')}\n${PROFILE}\n`, ...files });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init');
}

/** Two synthetic sides; each case's truth is a file named by the ticket plus one only an index finds. */
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

const fakeIndex = () => {
  const status = { tool: 'codeindex', state: 'fresh', fresh: true, builtMs: 1, reason: null };
  let built = 0;
  return {
    get built() { return built; },
    name: 'codeindex',
    build: async () => { built += 1; return status; },
    status: async () => status,
    find: async () => ({ ok: true, value: [{ name: 'x', path: 'src/legacy/settle.ts', line: 1, kind: 'function' }], status }),
    refs: async () => ({ ok: false, status }),
    relates: async () => ({ ok: false, status }),
    delta: async () => ({ ok: false, status }),
  };
};

describe('05-O offline recall', () => {
  it('05-O1, 05-O6: on synthetic roots, --cases and --index-dir take absolute paths only; cases come from <cases>/<project>/full', async () => {
    assert.throws(() => parseArgv(['be', 'fe', '--cases', 'rel/dir']), /absolute path/);
    assert.throws(() => parseArgv(['be', 'fe', '--codeindex', 'bin/codeindex', '--index-dir', 'rel']), /absolute path/);
    assert.throws(() => parseArgv(['be', 'fe', '--codeindex', '/bin/codeindex']), /go together/);
    const parsed = parseArgv(['be', 'fe', '15', '--cases', '/tmp/b', '--codeindex', '/x/codeindex', '--index-dir', '/tmp/i']);
    assert.deepEqual([parsed.cases, parsed.limit, parsed.codeindex], ['/tmp/b', 15, { bin: '/x/codeindex', indexDir: '/tmp/i' }]);
    const fx = bench();
    try {
      const rows = await shortlistRecall({ repos: fx.repos, cases: fx.cases });
      assert.deepEqual(rows.map((row) => row.side), ['BE-express', 'FE-angular']);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('05-O2: arms (a), (b), (c) score the same terms; the index is built once per side; (c) is null without codeindex', async () => {
    const fx = bench();
    try {
      const plain = await shortlistRecall({ repos: fx.repos, cases: fx.cases });
      assert.ok(plain.every((row) => row.c === null && row.a === 0.5 && row.b === 0.5), JSON.stringify(plain));
      const indexes = {};
      const rows = await shortlistRecall({ repos: fx.repos, cases: fx.cases, adapterFor: async (side) => (indexes[side] = fakeIndex()) });
      assert.ok(rows.every((row) => row.c === 1 && row.b === 0.5), JSON.stringify(rows));
      assert.deepEqual([indexes['BE-express'].built, indexes['FE-angular'].built], [1, 1]);
      assert.equal(existsSync(path.join(fx.repos['BE-express'], '.ambicode', 'task')), false, 'no ledger written');
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('05-O3: the summary is numbers only, no case name, ticket text, term or path', async () => {
    const fx = bench();
    try {
      const text = summarize(await shortlistRecall({ repos: fx.repos, cases: fx.cases, adapterFor: async () => fakeIndex() })).join('\n');
      assert.match(text, /^BE-express: n=1 recall@15 \(a\) 0\.500 \(b\) 0\.500 \(c\) 1\.000 \(c\)-\(b\) 0\.500$/m);
      for (const secret of ['secret-case', 'confidential', 'invoiceTotals', 'src/', 'settle']) assert.ok(!text.includes(secret), secret);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  const rows = (a, b, c) => ['BE-express', 'FE-angular'].map((side) => ({ side, truth: 1, a: a[side], b: b[side], c: c === null ? null : c[side] }));

  it('05-O4: (a) reproduces M6 at three decimals', () => {
    assert.ok(summarize(rows(M6, M6, null)).includes('(a) reproduces M6: yes (expected BE-express 0.499, FE-angular 0.123)'));
    assert.ok(summarize(rows({ 'BE-express': 0.5004, 'FE-angular': 0.123 }, M6, null)).includes('(a) reproduces M6: no (expected BE-express 0.499, FE-angular 0.123)'));
  });

  it('05-O5: every 5-I branch', () => {
    const last = (lines) => lines.at(-1);
    assert.equal(last(summarize(rows(M6, M6, { 'BE-express': M6['BE-express'] + 0.04, 'FE-angular': M6['FE-angular'] + 0.049 }))), '5-I: none');
    assert.equal(last(summarize(rows(M6, M6, { 'BE-express': M6['BE-express'], 'FE-angular': M6['FE-angular'] + 0.05 }))), '5-I: report');
    assert.equal(last(summarize(rows(M6, M6, { 'BE-express': M6['BE-express'] + 0.0496, 'FE-angular': M6['FE-angular'] + 0.0496 }))), '5-I: none', 'decided on the raw gain, not the printed one');
    assert.equal(last(summarize(rows(M6, M6, null))), '5-I: pending ((c) was not run)');
    assert.equal(last(summarize(rows({ 'BE-express': 0.4, 'FE-angular': 0.1 }, M6, { 'BE-express': 0.9, 'FE-angular': 0.9 }))), '5-I: pending ((a) did not reproduce M6)');
  });
});
