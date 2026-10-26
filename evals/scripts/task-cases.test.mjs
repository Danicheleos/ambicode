// $0 checks of the task cases: the seeds are what the ledger reader accepts, the plans and investigations cite real lines of their
// fixture, the "kept" graders hold on the untouched fixture and the graders that measure the change do not. No model runs here.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { FIXTURES } from '../../fixtures/definitions.mjs';
import { parseEntry } from '../../src/platform/ledger/kinds.ts';
import { contentHash } from '../../src/util/hash.ts';
import { CASES, caseDir, render } from './cases.mjs';
import { INVESTIGATIONS, PLANS } from './task-seeds.mjs';

const FILES = render();
const taskCases = CASES.filter((c) => c.name.startsWith('task-'));
const seeded = taskCases.filter((c) => Object.keys(c.files ?? {}).some((name) => name.startsWith('seed/')));
const frontmatter = (text) => parse(text.split('---')[1]);
const STACKS = ['ts-service-lendbox', 'py-service-tidewatch', 'go-module-parcelhub', 'jvm-gradle-seedvault', 'monorepo-rust-ts-kiln'];
const APP = ['ts-app-medium', 'ts-app-medium-refund-bug'];

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
  it('are fifteen on the five stacks (one after a plan, one after an investigation, one bare each) and five on the app fixtures', () => {
    assert.equal(taskCases.length, 20);
    for (const stack of STACKS) {
      const own = taskCases.filter((c) => c.fixture === stack);
      assert.deepEqual(own.map((c) => c.name.replace(/^task-[a-z]+-/, '')).sort(), ['after-investigate', 'after-plan', 'bare']);
    }
    const narrow = taskCases.filter((c) => APP.includes(c.fixture));
    assert.equal(narrow.length, 5);
    assert.equal(taskCases.filter((c) => !STACKS.includes(c.fixture) && !APP.includes(c.fixture)).length, 0);
  });

  it('keep the budget of the task skill and never name the iteration of the review-loop case', () => {
    const limits = frontmatter(FILES.get(`${caseDir('cases', 'task-app-refund-multi-file')}/prompt.md`));
    assert.equal(limits.max_turns, 40);
    assert.ok(limits.allowed_tools.includes('Agent'), 'the implementer and the reviewer are subagents');
    const loop = taskCases.find((c) => c.name === 'task-app-review-fix-loop');
    assert.doesNotMatch(loop.prompt, /iteration \d/);
    assert.equal(frontmatter(FILES.get(`${caseDir('cases', loop.name)}/prompt.md`)).max_turns, 60);
    for (const c of taskCases.filter((x) => x !== loop)) assert.match(c.prompt, / --headless iteration 1 /, `${c.name} names its iteration, so no review runs unasked`);
  });

  describe('seeds', () => {
    it('are the ten after-plan and after-investigate cases, copied by the scaffold into .ambicode and absent from the bare arm', () => {
      assert.deepEqual(seeded.map((c) => c.name.replace(/^task-[a-z]+-/, '')).sort(), Array(5).fill(['after-investigate', 'after-plan']).flat().sort());
      for (const c of seeded) {
        assert.equal(c.bare, null);
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
        const kind = c.name.endsWith('after-plan') ? 'plan' : 'investigation';
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
        assert.equal(text.trim(), (kind === 'plan' ? PLANS : INVESTIGATIONS)[slug].trim());
      });

      it(`${c.name}: every path:line citation of the note names a line the fixture has`, () => {
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        const files = filesOf(c.fixture);
        const note = (c.name.endsWith('after-plan') ? PLANS : INVESTIGATIONS)[slug];
        const cited = [...note.matchAll(/(?<![\w./-])((?:[\w-]+\/)+[\w.-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g)];
        assert.ok(cited.length >= 3, 'a note cites its claims');
        for (const [, file, from, to] of cited) {
          assert.ok(files.has(file), `${file} is in ${c.fixture}`);
          const lines = files.get(file).replace(/\n$/, '').split('\n').length;
          assert.ok(Number(to ?? from) <= lines, `${file}:${from}${to ? `-${to}` : ''} is within its ${lines} lines`);
        }
      });
    }

    it('the plans give Iteration 1 the five fields routes/plan/design.md asks for', () => {
      for (const [slug, plan] of Object.entries(PLANS)) {
        assert.match(plan, /\| requirement \| section \| code \|/, slug);
        assert.match(plan, /## Iteration 1\b[\s\S]*\*Goal\*[\s\S]*\*Changes\*[\s\S]*\*Accept\*[\s\S]*\*Checks\*[\s\S]*\*Leaves out\*/, slug);
      }
    });
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
          else if (!GUARD.test(name)) assert.ok(!now, `${name} already passes on the untouched ${file}: it measures nothing`);
        }
      });
    }

    it('the ledger patterns read what the check, exit and revise entries look like', () => {
      const green = '{"id":"a-1","at":"x","route":"r","kind":"check","key":"app/unit","files":["a.js"],"exit":0,"phase":"green","tail":"","ms":3}';
      const red = green.replace('"exit":0', '"exit":1');
      const loop = taskCases.find((c) => c.name === 'task-app-review-fix-loop');
      const spec = (name) => frontmatter(loop.graders.find((g) => g.name === name).text);
      const pattern = (name) => new RegExp(spec(name).pattern);
      assert.ok(pattern('green-check-recorded').test(green));
      assert.ok(!pattern('green-check-recorded').test(red));
      const left = pattern('no-check-left-red');
      assert.ok(left.test(red), 'a red run alone is left red');
      assert.ok(!left.test(`${red}\n${green}`), 'a red run followed by a green one is recovered');
      assert.ok(left.test(`${green}\n${red}`), 'a green run followed by a red one is left red');
      const fixed = pattern('findings-fixed-and-checked');
      const finding = '{"id":"a-2","kind":"revise","route":"r","from":"fix","via":"code","cycle":1,"reason":"review-findings"}';
      assert.ok(fixed.test(`${green}`), 'no finding passes');
      assert.ok(!fixed.test(`${green}\n${finding}`), 'a finding with no check after it fails');
      assert.ok(fixed.test(`${green}\n${finding}\n${green}`), 'a finding followed by a green check passes');
    });

    it('the unique-code pattern of task-py-bare accepts a new TW code and refuses a reused one', () => {
      const c = taskCases.find((x) => x.name === 'task-py-bare');
      const spec = sourceGraders(c).find((g) => g.name === 'new-code-raised').spec;
      assert.ok(matches(spec, 'raise FutureReadingError("TW-204", "x")'));
      assert.ok(!matches(spec, 'raise StaleReadingError("TW-203", "x")'));
      const used = new Set([...[...filesOf(c.fixture).entries()].filter(([f]) => f.startsWith('src/')).flatMap(([, t]) => t.match(/TW-\d{3}/g) ?? [])]);
      for (const code of used) assert.ok(!matches(spec, `raise X("${code}", "y")`), `${code} is already used in the fixture`);
      assert.ok(!used.has('TW-204'));
    });

    it('a reference solution of each app case satisfies its regex graders', () => {
      // The fixture's own healthy sibling is the reference for the refund case: its repository and service are the fixed ones.
      const bug = filesOf('ts-app-medium-refund-bug');
      const fixed = filesOf('ts-app-medium');
      const c = taskCases.find((x) => x.name === 'task-app-refund-multi-file');
      const after = new Map(bug);
      for (const file of ['src/payments/repository.js', 'src/payments/service.js']) after.set(file, fixed.get(file));
      after.set('tests/payments/payments.test.js', `${fixed.get('tests/payments/payments.test.js')}\ntest('x', () => { payments.refund({ invoiceId: 1, amountCents: 1 }); expect(a.status).toBe('partially_paid'); });\n`);
      for (const { name, spec, file } of sourceGraders(c)) assert.ok(matches(spec, after.get(file)), `${name} accepts the reference`);
    });
  });

  it('every case reads its ledger by the prompt slug and the flags install jest only where the checks must run', () => {
    for (const c of taskCases) {
      const slug = /--task (\S+)/.exec(c.prompt)[1];
      assert.ok(c.graders.some((g) => g.text.includes(`/tasks/${slug}/ledger.jsonl`)), c.name);
      assert.equal(c.flags.includes('--install'), APP.includes(c.fixture), c.name);
    }
  });
});
