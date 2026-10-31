// $0 checks of the investigate cases: every truth still holds in its fixture, the graders accept the right answer and refuse the
// plausible wrong ones, and the matrix is spread as promised. No model runs here.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { foundPaths, scoreFiles } from './metrics.mjs';
import { CASES, caseDir, render } from './cases.mjs';
import { INVESTIGATE_TRUTHS, decoyPattern, finalFiles, violations } from './investigate-cases.mjs';

const FILES = render();
const cases = CASES.filter((c) => c.name.startsWith('investigate-'));
const frontmatter = (text) => parse(text.split('---')[1]);
const grader = (c, name) => c.graders.find((g) => g.name === name);
const BROAD = ['ts-service-lendbox', 'py-service-tidewatch', 'go-module-parcelhub', 'jvm-gradle-seedvault', 'monorepo-rust-ts-kiln'];
const passes = (text, spec) => new RegExp(spec.pattern).test(text) === (spec.match !== 'not_contains');

describe('investigate cases', () => {
  it('are one per stack fixture, three on ts-app-medium and two on its deep variant, one case per truth', () => {
    assert.equal(cases.length, INVESTIGATE_TRUTHS.length);
    for (const fixture of BROAD) assert.equal(cases.filter((c) => c.fixture === fixture).length, 1, fixture);
    assert.equal(cases.filter((c) => c.fixture === 'ts-app-medium').length, 3);
    assert.equal(cases.filter((c) => c.fixture === 'ts-app-medium-deep').length, 2);
    assert.equal(cases.length, 10);
    assert.equal(new Set(cases.map((c) => c.prompt.match(/--task (\S+)/)[1])).size, cases.length, 'task slugs are unique');
  });

  it('descriptions and graders say nothing the model could read as the answer', () => {
    for (const c of cases) {
      assert.doesNotMatch(c.description, /TW-\d|7\.40|13_000|desk@|void|not wired|never|nobody|nothing|unused|decoy|frozen|duplicate|no sender|outbox|ramp|relay|legacy/i, c.description);
      assert.doesNotMatch(c.prompt, /decoy|legacy|unused|not wired/i, c.name);
    }
  });

  it('the plugin and the bare arm ask the same question, and the bare arm has the shared graders only', () => {
    for (const c of cases) {
      assert.equal(c.prompt.replace(/^\/ambicode:investigate --task \S+ /, ''), c.bare, c.name);
      assert.ok(c.graders.filter((g) => g.shared).length >= 4, `${c.name}: shared graders`);
      const bare = [...FILES.keys()].filter((file) => file.startsWith(`${caseDir('bare', c.name)}/graders/`));
      assert.equal(bare.length, c.graders.filter((g) => g.shared).length, c.name);
      for (const name of ['note-saved', 'citations-valid', 'route-done']) assert.ok(!bare.some((file) => file.endsWith(`/${name}.md`)), `${c.name}: ${name} is plugin-only`);
    }
  });
});

describe('the ledger graders read what the route writes', () => {
  const c = cases[0];
  const slug = c.prompt.match(/--task (\S+)/)[1];
  const front = (name) => frontmatter(grader(c, name).text);
  // Shapes taken from a real run of the route (key order is the order the engine appends them) and from investigate.route.test.ts.
  const note = '{"id":"w-9","at":"2026-10-23T00:00:00.000Z","kind":"note","note":"investigation","path":"notes/investigation.md","contentHash":"sha256:ab","route":"w-1"}';
  const check = (failed) => `{"id":"w-10","at":"2026-10-23T00:00:00.000Z","kind":"worker","worker":"check-citations","outcome":"ran","ms":3,"artifact":null,"summary":{"failed":${failed},"anchorsBad":${failed ? 1 : 0}},"route":"w-1"}`;
  const exit = (reason) => `{"id":"w-11","at":"2026-10-23T00:00:00.000Z","route":"w-1","kind":"exit","reason":"${reason}","complete":true}`;

  it('note-saved, citations-valid and route-done match a finished route and refuse a failed check or an early exit', () => {
    assert.equal(front('note-saved').target.path, `.ambicode/tasks/${slug}/ledger.jsonl`);
    assert.ok(passes(note, front('note-saved')));
    assert.ok(!passes('{"kind":"note","note":"plan"}', front('note-saved')));
    assert.ok(passes(check(false), front('citations-valid')));
    assert.ok(!passes(check(true), front('citations-valid')));
    assert.ok(passes(exit('done'), front('route-done')));
    assert.ok(!passes(exit('abandoned'), front('route-done')));
  });
});

for (const t of INVESTIGATE_TRUTHS) {
  const c = cases.find((entry) => entry.name === t.name);
  const files = finalFiles(t.fixture);
  const paths = [...files.keys()];

  describe(t.name, () => {
    it('every named file and every anchor is in the fixture, and every "nothing calls it" claim holds', () => {
      for (const file of [...t.relevant, ...t.allowed, ...t.decoys, ...t.cites]) assert.ok(files.has(file), `${file} is not in ${t.fixture}`);
      for (const [file, text] of t.anchors) assert.equal((files.get(file) ?? '').split(text).length - 1 >= 1, true, `${file} lacks: ${text}`);
      assert.deepEqual(violations(t, files), []);
      assert.ok(t.absent.length >= 1 || t.anchors.length >= 1);
    });

    it('relevant, allowed and decoys do not overlap, and each cited file is relevant or allowed', () => {
      const all = [...t.relevant, ...t.allowed, ...t.decoys];
      assert.equal(new Set(all).size, all.length, 'a file is in two sets');
      for (const file of t.cites) assert.ok(t.relevant.includes(file) || t.allowed.includes(file), file);
      assert.ok(t.relevant.length >= 1);
    });

    it('is set up like the other route cases: fixed slug, init and context, ledger paths below the slug, a metric on the files', () => {
      assert.equal(c.flags, '--ambicode-init --context');
      assert.ok(c.prompt.startsWith('/ambicode:investigate --task inv-'));
      assert.equal(c.metrics.source, t.files === false ? 'citations' : 'files-section');
      assert.deepEqual(c.metrics.relevant, t.relevant);
      assert.ok(FILES.has(`${caseDir('cases', c.name)}/prompt.md`));
      assert.match(FILES.get(`${caseDir('cases', c.name)}/prompt.md`), /max_turns: (2\d|3\d)\n/);
      assert.match(c.prompt, t.files === false ? /^(?!.*## Files)/ : /## Files/);
    });

    it('a right answer passes the citation graders and scores full recall and precision on the files metric', () => {
      const cited = t.cites.map((file) => `${file}:1`).join('\n');
      for (const file of t.cites) assert.ok(c.graders.some((g) => g.shared && g.name.startsWith('cites-') && passes(cited, frontmatter(g.text))), file);
      if (t.files === false) return;
      const answer = `${cited}\n## Files\n${t.relevant.map((file) => `- ${file}`).join('\n')}\n`;
      const score = scoreFiles(c.metrics, foundPaths(answer, 'files-section'));
      assert.deepEqual([score.missed, score.precision], [[], 1]);
    });

    if (t.decoys.length > 0 && t.files !== false) {
      it('the decoy grader refuses a Files section that lists a decoy and accepts one that only mentions it above', () => {
        const spec = frontmatter(grader(c, 'files-skip-decoys').text);
        assert.equal(spec.match, 'not_contains');
        assert.equal(spec.pattern, decoyPattern(t.decoys));
        for (const decoy of t.decoys) {
          assert.equal(passes(`prose\n## Files\n- ${t.relevant[0]}\n- ${decoy}\n`, spec), false, decoy);
          assert.equal(passes(`${decoy} is not part of it.\n## Files\n- ${t.relevant[0]}\n`, spec), true, decoy);
        }
        assert.equal(passes(`## Files\n${t.relevant.map((file) => `- ${file}`).join('\n')}\n`, spec), true);
        assert.equal(passes(`## Files\n\n${t.relevant.map((file) => `- ${file}`).join('\n')}\n`, spec), true, 'a blank line after the heading');
        for (const decoy of t.decoys) assert.equal(passes(`## Files\n\n- ${t.relevant[0]}\n- ${decoy}\n`, spec), false, `${decoy} below a blank line`);
      });
    }

    it('the files metric scores a decoy in the list as an extra and a missing relevant file as a miss', () => {
      if (t.files === false) {
        const found = foundPaths(t.decoys.length > 0 ? t.decoys.map((d) => `${d}:3`).join(' ') : 'src/invented/reminders.js:9', 'citations');
        assert.ok(scoreFiles(c.metrics, found).extra.length >= 1, 'an invented citation is an extra');
        return;
      }
      const wrong = foundPaths(`## Files\n${[t.relevant[0], t.decoys[0] ?? 'src/invented.js'].map((file) => `- ${file}`).join('\n')}\n`, 'files-section');
      const score = scoreFiles(c.metrics, wrong);
      assert.ok(score.extra.length >= 1 || t.decoys.length === 0);
      assert.ok(score.recall < 1 || t.relevant.length === 1);
    });
  });
}

describe('facts and citations accept the right wording and refuse the plausible wrong answer', () => {
  const pick = (name, grader_) => cases.find((c) => c.name === name).graders.find((g) => g.name === grader_);
  const spec = (name, grader_) => frontmatter(pick(name, grader_).text);
  const wrongAndRight = [
    ['investigate-go-label-bay', 'price-7-40', 'price: 7.40', 'price: 3.50'],
    ['investigate-ts-extend-late-fee', 'fee-100-cents', 'two days late is 100 cents', 'nine days late is 450 cents'],
    ['investigate-mono-max-setpoint', 'limit-13000', 'MAX_SETPOINT_DC is 13_000', 'the limit is 1300'],
    ['investigate-app-segment-flow-2', 'gold-threshold', 'gold needs 500000 cents', 'gold needs 5000 cents'],
    ['investigate-app-segment-flow-2', 'window-365', 'a 365 day window', 'a 30 day window'],
    ['investigate-app-optout-files-2', 'lists-a-test', '- tests/customers/service.test.js', '- src/customers/service.js'],
    ['investigate-py-unit-adapters', 'weir-centimetres', 'weir_levels reads centimetres', 'weir_levels reads millimetres'],
  ];
  for (const [name, graderName, right, wrong] of wrongAndRight) {
    it(`${name}/${graderName}`, () => {
      assert.ok(passes(right, spec(name, graderName)), right);
      assert.ok(!passes(wrong, spec(name, graderName)), wrong);
    });
  }

  it('a citation grader needs a line number and takes the path with or without a leading directory', () => {
    const g = spec('investigate-ts-extend-late-fee', 'cites-application-extend-ts');
    for (const ok of ['src/contexts/lending/application/extend.ts:12', 'repo/src/contexts/lending/application/extend.ts:10-20', '`src/contexts/lending/application/extend.ts:3`']) assert.ok(passes(ok, g), ok);
    for (const no of ['src/contexts/lending/application/extend.ts has no cap', 'extend.ts:12']) assert.ok(!passes(no, g), no);
  });

  it('an app answer that lists the legacy export in its files fails the decoy grader; one that cites it in prose passes', () => {
    const g = spec('investigate-app-total-legacy', 'files-skip-decoys');
    assert.ok(!passes('## Files\n- src/invoices/service.js\n- src/legacy/invoice-total.js\n', g));
    assert.ok(passes('src/legacy/invoice-total.js is frozen and unused here.\n## Files\n- src/invoices/service.js\n', g));
  });
});

describe('the deep app variant', () => {
  const base = finalFiles('ts-app-medium');
  const deep = finalFiles('ts-app-medium-deep');

  it('adds to the base fixture and changes only the files APP_DEEP overrides, so the plan and task truths on the base hold', () => {
    const changed = [...deep.keys()].filter((file) => base.get(file) !== deep.get(file)).sort();
    assert.deepEqual(changed, ['src/config.js', 'src/customers/patch.js', 'src/customers/segments.js', 'src/customers/service.js', 'src/customers/window.js', 'src/invoices/repository.js']);
    for (const file of base.keys()) assert.ok(deep.has(file), file);
  });

  it('the obvious symbol alone does not find the cause: the symptom file does not hold the window or the whitelist', () => {
    const segments = deep.get('src/customers/segments.js');
    assert.doesNotMatch(segments, /365|segmentWindowDays|setUTCDate/);
    assert.doesNotMatch(deep.get('src/customers/routes.js'), /receipt|patchable|FIELDS/i);
    assert.doesNotMatch(deep.get('src/customers/service.js'), /validateString\(patch|patch\.phone/);
    for (const file of deep.keys()) if (file.startsWith('src/') && file !== 'src/customers/patch.js') assert.doesNotMatch(deep.get(file), /receiptChannels/, file);
  });
});

describe('the decoy grader reads the entries of the Files list, not the prose around it', () => {
  const g = frontmatter(grader(cases.find((c) => c.name === 'investigate-app-optout-files-2'), 'files-skip-decoys').text);
  // The shape of the optout-files-2 plugin answer of 2026-10-23: a "Files that change" heading with a numbered list, then decisions in prose that name a ruled-out file.
  const answer = (tail) => `## Files that change\n1. \`src/customers/patch.js\`: add the field (\`src/customers/patch.js:4-8\`).\n2. \`src/notifications/handlers.js\`: use the chosen channels.\n\n### Decisions\n- The \`smsReceipts\` flag (\`src/flags.js:4\`) may still gate SMS.\n${tail}`;

  it('passes a decoy named only in prose below a "## Files that change" heading', () => {
    assert.ok(passes(answer('\n## Files\nsrc/customers/patch.js\nsrc/notifications/handlers.js\n'), g));
    assert.ok(passes(answer(''), g));
  });

  it('fails a decoy that is an entry of the list, whatever the bullet, number or backticks, and under any heading suffix', () => {
    for (const entry of ['- src/flags.js', '* `src/flags.js`', '3. src/flags.js: unrelated', '- **src/flags.js**']) {
      assert.ok(!passes(`## Files that change\n- src/customers/patch.js\n${entry}\n`, g), entry);
    }
    assert.ok(!passes(answer('\n## Files\nsrc/customers/patch.js\nsrc/flags.js\n'), g));
    assert.ok(passes('## Files\n- src/flags.json\n- src/customers/patch.js\n', g), 'a longer name is not the decoy');
  });
});

