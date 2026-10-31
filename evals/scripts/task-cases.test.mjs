// $0 checks of the task cases: the seeds are what the ledger reader accepts, the investigation cites real lines of its
// fixture, the "kept" graders hold on the untouched fixture and the graders that measure the change do not. No model runs here.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { FIXTURES } from '../../fixtures/definitions.mjs';
import { parseEntry } from '../../src/platform/ledger/kinds.ts';
import { contentHash } from '../../src/util/hash.ts';
import { CASES, caseDir, render } from './cases.mjs';
import { INVESTIGATIONS } from './task-seeds.mjs';

const FILES = render();
const taskCases = CASES.filter((c) => c.name.startsWith('task-') && !c.tags.includes('rules'));
const seeded = taskCases.filter((c) => Object.keys(c.files ?? {}).some((name) => name.startsWith('seed/')));
const frontmatter = (text) => parse(text.split('---')[1]);
const STACKS = ['jvm-gradle-seedvault'];
const APP = ['ts-app-medium-sites'];

/** The files a fixture holds once its steps ran (writes and deletes; no git, no install). */
const filesOf = (name) => {
  const out = new Map();
  for (const step of FIXTURES.find((f) => f.name === name).steps) {
    for (const [file, text] of Object.entries(step.write ?? {})) out.set(file, text);
    for (const file of step.delete ?? []) out.delete(file);
  }
  return out;
};
const sourceGraders = (c) =>
  c.graders.flatMap((g) => {
    const spec = frontmatter(g.text);
    const target = spec.target;
    return spec.type === 'regex' && typeof target === 'object' && target.source === 'file' && !target.path.startsWith('.ambicode/') ? [{ name: g.name, spec, file: target.path }] : [];
  });
const matches = (spec, text) => new RegExp(spec.pattern).test(text) === (spec.match !== 'not_contains');

describe('task cases', () => {
  it('are two: one after an investigation on the seedvault stack, one on the app fixture', () => {
    assert.deepEqual(taskCases.map((c) => c.name).sort(), ['task-app-segments-void', 'task-jvm-after-investigate']);
    assert.deepEqual(taskCases.filter((c) => STACKS.includes(c.fixture)).map((c) => c.name), ['task-jvm-after-investigate']);
    assert.deepEqual(taskCases.filter((c) => APP.includes(c.fixture)).map((c) => c.name), ['task-app-segments-void']);
  });

  it('keep the budget of the task skill and name their iteration, so no review runs unasked', () => {
    const limits = frontmatter(FILES.get(`${caseDir('cases', 'task-app-segments-void')}/prompt.md`));
    assert.equal(limits.max_turns, 40);
    assert.ok(limits.allowed_tools.includes('Agent'), 'the implementer and the reviewer are subagents');
    for (const c of taskCases) assert.match(c.prompt, / --headless iteration 1 /, `${c.name} names its iteration, so no review runs unasked`);
  });

  describe('seeds', () => {
    it('is the one investigation case, copied by the scaffold into .ambicode; the bare arm gets the same note as prompt text and no seed', () => {
      assert.deepEqual(seeded.map((c) => c.name.replace(/^task-[a-z]+-/, '')).sort(), ['after-investigate']);
      for (const c of seeded) {
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        const note = INVESTIGATIONS[slug].trim();
        assert.ok(c.bare.includes(note), `${c.name}: the bare prompt carries the note text`);
        assert.doesNotMatch(c.bare, /ambicode|\.ambicode|--task/i);
        assert.doesNotMatch(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), /seed\/|--ambicode-init|--policy|--stack-packs/);
        assert.ok(FILES.has(`${caseDir('bare', c.name)}/graders/no-git-mutation.md`));
        assert.ok(![...FILES.keys()].some((f) => f.startsWith(`${caseDir('bare', c.name)}/graders/`) && /ledger\.jsonl|\.ambicode\//.test(FILES.get(f))), `${c.name}: no bare grader reads the plugin's ledger`);
        assert.match(FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`), /cp -R "\$\(dirname "\$0"\)\/seed\/\." "\$PWD\/\.ambicode\/"/);
      }
      for (const c of taskCases.filter((x) => !seeded.includes(x))) {
        assert.doesNotMatch(FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`), /seed\//);
        if (c.bare !== null) assert.doesNotMatch(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), /seed\/|--ambicode-init/);
      }
    });

    for (const c of seeded) {
      it(`${c.name}: the ledger line is a note entry the real reader accepts, for the file beside it, under the prompt's slug`, () => {
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        const kind = 'investigation';
        const ledgerText = c.files[`seed/tasks/${slug}/ledger.jsonl`];
        const lines = ledgerText.trim().split('\n');
        assert.equal(lines.length, 1);
        const parsed = parseEntry(JSON.parse(lines[0]));
        assert.ok(parsed.ok, JSON.stringify(parsed));
        assert.equal(parsed.entry.kind, 'note');
        assert.equal(parsed.entry.note, kind);
        assert.match(parsed.entry.path, new RegExp(`^\\.ambicode/tasks/${slug}/(plan|investigation_[0-9T-]+)\\.md$`));
        const text = c.files[`seed/${parsed.entry.path.replace(/^\.ambicode\//, '')}`];
        assert.equal(parsed.entry.contentHash, contentHash(text));
        assert.deepEqual(Object.keys(c.files).sort(), [`seed/tasks/${slug}/ledger.jsonl`, `seed/${parsed.entry.path.replace(/^\.ambicode\//, '')}`].sort());
        assert.equal(text.replace(/^---\nstatus: accepted\n---\n\n/, '').trim(), INVESTIGATIONS[slug].trim());
      });

      it(`${c.name}: every path:line citation of the note names a line the fixture has`, () => {
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        const files = filesOf(c.fixture);
        const note = INVESTIGATIONS[slug];
        const cited = [...note.matchAll(/(?<![\w./-])((?:[\w-]+\/)+[\w.-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g)];
        assert.ok(cited.length >= 3, 'a note cites its claims');
        for (const [, file, from, to] of cited) {
          assert.ok(files.has(file), `${file} is in ${c.fixture}`);
          const lines = files.get(file).replace(/\n$/, '').split('\n').length;
          assert.ok(Number(to ?? from) <= lines, `${file}:${from}${to ? `-${to}` : ''} is within its ${lines} lines`);
        }
      });
    }
  });

  describe('graders', () => {
    // A guard holds before and after the change; every other file grader measures the change, so it must not already pass on the untouched fixture.
    const GUARD = /kept|reused|imported|no-|not-edited|not-written|untouched|target-check|stale-check|late-fee|green|route-done|exit|assertFails|test-checks/;
    for (const c of taskCases) {
      it(`${c.name}: the guards hold and the measuring graders fail on the fixture as materialized`, () => {
        const files = filesOf(c.fixture);
        const read = sourceGraders(c);
        assert.ok(read.length >= 2, 'at least two result graders');
        for (const { name, spec, file } of read) {
          if (!files.has(file)) {
            assert.ok(!/kept/.test(name), `${name}: ${file} exists in the fixture`);
            continue;
          }
          const now = matches(spec, files.get(file));
          if (/kept/.test(name)) assert.ok(now, `${name} holds on the untouched ${file}`);
          // A `no-` guard forbids something the change could add: it must pass before the change, or it fails every run (no-literal-boundaries matched the fixture's own 24 * 60 * 60).
          else if (spec.match === 'not_contains' && /^no-/.test(name)) assert.ok(now, `${name} fails on the untouched ${file}: it would fail a run that does nothing wrong`);
          else if (!GUARD.test(name)) assert.ok(!now, `${name} already passes on the untouched ${file}: it measures nothing`);
        }
      });
    }

    it('the green-check pattern reads what the check entry looks like', () => {
      const green = '{"id":"a-1","at":"x","route":"r","kind":"check","key":"app/unit","files":["a.js"],"exit":0,"phase":"green","tail":"","ms":3}';
      const c = taskCases.find((x) => x.name === 'task-app-segments-void');
      const pattern = new RegExp(frontmatter(c.graders.find((g) => g.name === 'green-check-recorded').text).pattern);
      assert.ok(pattern.test(green));
      assert.ok(!pattern.test(green.replace('"exit":0', '"exit":1')));
    });

  });

  it('the no-duplication graders accept a shared helper and refuse the same rule written in each leaf', () => {
    const grader = (caseName, name) => sourceGraders(taskCases.find((x) => x.name === caseName)).find((g) => g.name === name).spec;
    const once = grader('task-app-segments-void', 'no-void-rule-in-both-readers');
    const list = grader('task-app-segments-void', 'one-list-call');
    const helper = "function billable(id) { return invoices.list({ customerId: id }).filter((i) => i.status !== STATUS.VOID); }\nconst a = billable(1); const b = billable(2);";
    const leaves = "const a = invoices.list({ customerId }).filter((i) => i.status !== STATUS.VOID);\nconst b = invoices.list({ customerId }).filter((i) => i.status !== STATUS.VOID);";
    assert.ok(matches(once, helper) && matches(list, helper));
    assert.ok(!matches(once, leaves) && !matches(list, leaves));
  });

  it('segments-void on the sites fixture: a fix through the shared helper passes every grader, the rule copied into a leaf fails', () => {
    const c = taskCases.find((x) => x.name === 'task-app-segments-void');
    assert.equal(c.fixture, 'ts-app-medium-sites');
    const base = filesOf(c.fixture);
    const reference = new Map(base);
    reference.set('src/customers/segments.js', "const billable = (customerId) => invoices.list({ customerId }).filter(status.isBillable);\nconst a = billable(id).length;");
    reference.set('src/customers/statement.js', 'const mine = invoices.list({ customerId }).filter(status.isBillable);');
    reference.set('tests/customers/segments.test.js', `${base.get('tests/customers/segments.test.js')}\ninvoices.voidInvoice(1);\n`);
    for (const { name, spec, file } of sourceGraders(c)) assert.ok(matches(spec, reference.get(file)), `${name} accepts the shared-helper fix`);
    const leaf = new Map(reference);
    leaf.set('src/customers/statement.js', "const mine = invoices.list({ customerId }).filter((i) => i.status !== 'void');");
    const failing = sourceGraders(c).filter(({ spec, file }) => !matches(spec, leaf.get(file))).map((g) => g.name);
    assert.deepEqual(failing, ['no-void-literal-in-statement']);
    leaf.set('src/customers/segments.js', "const a = invoices.list({ customerId }).filter((i) => i.status !== STATUS.VOID);\nconst b = invoices.list({ customerId }).filter((i) => i.status !== STATUS.VOID);");
    assert.deepEqual(sourceGraders(c).filter(({ spec, file }) => !matches(spec, leaf.get(file))).map((g) => g.name).sort(), ['no-void-literal-in-statement', 'no-void-rule-in-both-readers', 'one-list-call']);
  });

  it('every task-tune case scores the workspace diff and names the files the change touches', () => {
    for (const c of taskCases.filter((x) => x.tags.includes('task-tune'))) {
      assert.equal(c.metrics?.source, 'changed', c.name);
      assert.ok(c.metrics.relevant.length >= 2, c.name);
      assert.ok([...c.metrics.relevant, ...c.metrics.allowed].some((f) => /test/i.test(f)), `${c.name}: a test file is named`);
    }
  });

  it('exactly the two cases carry the task-tune tag', () => {
    assert.equal(taskCases.filter((c) => c.tags.includes('task-tune')).length, 2);
  });

  it('every case reads its ledger by the prompt slug and the flags install jest only where the checks must run', () => {
    for (const c of taskCases) {
      const slug = /--task (\S+)/.exec(c.prompt)[1];
      assert.ok(c.graders.some((g) => g.text.includes(`/tasks/${slug}/ledger.jsonl`)), c.name);
      assert.equal(c.flags.includes('--install'), APP.includes(c.fixture), c.name);
    }
  });
});
