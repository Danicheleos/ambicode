// $0 checks of the review cases: the truth resolves against the fixtures, the location and anchor graders accept a citation of an
// issue and refuse one that is not, and the categories are spread as the matrix promises. No model runs here.
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { CASES, caseDir, render } from './cases.mjs';
import { REVIEW_TRUTHS, anchorPattern, finalFiles, fixtureOf, issuePattern, locationPattern, tailOf, truthRecords } from './review-cases.mjs';

const FILES = render();
const reviewCases = CASES.filter((c) => c.name.startsWith('review-') && !c.tags.includes('rules'));
const frontmatter = (text) => parse(text.split('---')[1]);
const grader = (c, name) => c.graders.find((g) => g.name === name);
const CATEGORIES = ['team-rule', 'collected', 'arch-style', 'bloat', 'naming-comments', 'dead-dup', 'correctness', 'tests', 'error-security'];

/** Whether a deterministic grader passes on `text`: its pattern is found, or absent for `not_contains`. */
const passes = (text, spec) => new RegExp(spec.pattern).test(text) === (spec.match !== 'not_contains');
const planned = (c, truthName) => REVIEW_TRUTHS.find((t) => t.name === (truthName ?? c.name));

const loc = (file, from, to = from) => ({ file, lines: [from, to] });
const tinyFiles = new Map([['src/a/routes.ts', ''], ['src/b/routes.ts', ''], ['src/b/other.ts', '']]);

describe('review cases', () => {
  it('are the fourteen of the matrix, named review-<stack>-<topic>, on neutral fixtures, with the two clean controls', () => {
    assert.equal(reviewCases.length, 14);
    for (const c of reviewCases) {
      assert.match(c.name, /^review-(ts|py|go|jvm|mono)-[a-z-]+$/);
      assert.match(c.fixture, /^[a-z0-9-]+-review-\d$/);
      assert.doesNotMatch(c.description, /planted|truth/i);
    }
    assert.deepEqual(REVIEW_TRUTHS.filter((t) => t.control).map((t) => t.name), ['review-py-clean-plugin', 'review-mono-clean-rust']);
  });

  it('every category is planted at least twice, on at least two stacks', () => {
    for (const category of CATEGORIES) {
      const hits = REVIEW_TRUTHS.flatMap((t) => truthRecords(t).filter((r) => r.category === category).map(() => t.base));
      assert.ok(hits.length >= 2, `${category}: ${hits.length}`);
      assert.ok(new Set(hits).size >= 2, `${category} sits on one stack`);
    }
    for (const t of REVIEW_TRUTHS) for (const issue of t.issues) assert.ok(CATEGORIES.includes(issue.category), issue.category);
  });

  it('a defect case has one main issue and two or three others, none in the main category; a control has none', () => {
    for (const t of REVIEW_TRUTHS) {
      const records = truthRecords(t);
      if (t.control) assert.deepEqual(records, []);
      else {
        assert.equal(records.filter((r) => r.main).length, 1);
        assert.equal(records[0].main, true);
        assert.ok(records.length >= 3 && records.length <= 4, t.name);
        assert.ok(records.slice(1).every((r) => r.category !== records[0].category), `${t.name}: a secondary shares the main's category`);
      }
    }
  });

  it('task names and descriptions say nothing about the defect', () => {
    for (const c of reviewCases) {
      assert.match(c.prompt, /--task rev-\d+ /, c.name);
      assert.doesNotMatch(c.description, /import|name|test|loop|clock|html|escape|bypass|error|query|rule/i, c.description);
    }
    assert.equal(new Set(reviewCases.map((c) => c.prompt.match(/--task (\S+)/)[1])).size, 14);
  });

  it('the bare prompt and the plugin prompt carry no truth', () => {
    for (const c of reviewCases) {
      const model = [c.prompt, c.bare];
      for (const t of REVIEW_TRUTHS.filter((entry) => entry.name === c.name)) {
        for (const text of model) assert.doesNotMatch(text, new RegExp(t.topic), `${c.name}: ${text}`);
      }
    }
  });
});

describe('locationPattern', () => {
  const pattern = (location, files = tinyFiles) => new RegExp(locationPattern(location, files));
  const hit = (text, location, files) => pattern(location, files).test(text);

  it('names a file by its shortest unique tail, down to the basename', () => {
    assert.equal(tailOf('src/b/other.ts', tinyFiles), 'other.ts');
    assert.equal(tailOf('src/a/routes.ts', tinyFiles), 'a/routes.ts');
  });

  it('accepts a line, a range, a list and a hash form that reach the window of 3', () => {
    const where = loc('src/b/other.ts', 20, 22);
    for (const text of ['other.ts:17', 'other.ts:25', '`other.ts` (line 21)', 'src/b/other.ts:20', 'other.ts lines 21-30', 'other.ts:1-18', 'other.ts:10-500',
      'other.ts:3, 21', 'other.ts:3,9 and 24', 'other.ts#L21-L30', 'other.ts:19\u201340', 'other.ts: 19']) {
      assert.ok(hit(text, where), text);
    }
  });

  it('refuses a line outside the window, a longer number, a range that stops short and another file', () => {
    const where = loc('src/b/other.ts', 20, 22);
    for (const text of ['other.ts:16', 'other.ts:26', 'other.ts:210', 'other.ts:1-15', 'other.ts:30-40', 'a/other.ts5:20', 'xother.ts:20', 'routes.ts:20', 'other.tsx:20']) {
      assert.equal(hit(text, where), false, text);
    }
    assert.equal(hit('a/routes.ts:20', loc('src/b/routes.ts', 20)), false);
    assert.equal(hit('b/routes.ts:20', loc('src/b/routes.ts', 20)), true);
  });

  it('takes a one-line location at line 1 and a window that starts at 1', () => {
    assert.ok(hit('other.ts:1', loc('src/b/other.ts', 3)));
    assert.ok(hit('other.ts:6', loc('src/b/other.ts', 3)));
    assert.equal(hit('other.ts:7', loc('src/b/other.ts', 3)), false);
    assert.equal(hit('other.ts:1-9', loc('src/b/other.ts', 20)), false);
  });
});

describe('anchorPattern with a gap', () => {
  const gap = new RegExp(anchorPattern({ ids: ['chargeLateFees'], gap: true }));

  it('credits an identifier next to a phrase saying a test is absent', () => {
    for (const text of ['chargeLateFees has no test', 'No test covers chargeLateFees', 'chargeLateFees is untested', 'tests for chargeLateFees are missing', 'chargeLateFees: no unit tests, and no coverage', 'Without a test, chargeLateFees can regress']) {
      assert.match(text, gap, text);
    }
  });

  it('refuses a remark that only mentions a test, a longer word or a test file', () => {
    for (const text of ['a unit test would have caught chargeLateFees', 'chargeLateFees was retested', 'the latest chargeLateFees is tested', 'chargeLateFees is covered by test/billing.test.ts', 'there is no test', 'chargeLateFees does not handle errors. Tests pass.', 'no tests/test_peaks.py:12 for chargeLateFees']) {
      assert.doesNotMatch(text, gap, text);
    }
  });
});

describe('anchorPattern', () => {
  const anchor = new RegExp(anchorPattern({ ids: ['chargeLateFees', 'summarize'], near: 'test|untested|coverage' }));

  it('takes an identifier and a keyword near each other, in either order, in any case', () => {
    for (const text of ['chargeLateFees has no test', 'No Coverage for `chargeLateFees`', 'summarize is UNTESTED', 'the test skips\nchargeLateFees entirely']) assert.match(text, anchor, text);
  });

  it('refuses a keyword alone, an identifier alone, part of a longer identifier and a pair that stand far apart', () => {
    for (const text of ['there is no test', 'chargeLateFees groups by member', 'chargeLateFeesBatch is untested', `chargeLateFees ${'x'.repeat(260)} untested`, 'chargelatefees has no test']) {
      assert.doesNotMatch(text, anchor, text);
    }
  });

  it('takes a keyword only when it stands alone: not inside a longer word, an identifier or a path', () => {
    for (const text of ['chargeLateFees was retested', 'the latest chargeLateFees', 'chargeLateFees untestable', 'chargeLateFees in tests/test_x.py', 'chargeLateFees and test_summary']) {
      assert.doesNotMatch(text, anchor, text);
    }
    assert.match('chargeLateFees: no test.', anchor);
  });

  it('refuses a keyword that the identifier itself supplies', () => {
    assert.throws(() => anchorPattern({ ids: ['test/summary.ts'], near: 'test|coverage' }), /identifier/);
  });

  it('refuses keywords that are not a plain list', () => {
    assert.throws(() => anchorPattern({ ids: ['a'], near: '(a|b)+' }), /plain/);
  });
});

for (const t of REVIEW_TRUTHS) {
  const c = reviewCases.find((entry) => entry.name === t.name);
  const files = finalFiles(fixtureOf(t));
  const records = truthRecords(t);

  describe(t.name, () => {
    it('truth file, scaffold flags and graders', () => {
      assert.equal(JSON.parse(c.files['review-truth.json']).length, t.issues.length);
      assert.equal(c.fixture, fixtureOf(t));
      assert.match(c.flags, /^--ambicode-init --context( --policy)?$/);
      assert.equal(c.flags.includes('--policy'), t.policy);
      assert.equal(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`));
      assert.ok(c.bare !== null && c.graders.some((g) => g.name === 'reviewer-invoked') && c.graders.some((g) => g.name === 'review-recorded'));
      assert.ok(FILES.has(`${caseDir('cases', c.name)}/review-truth.json`));
      assert.ok(!FILES.has(`${caseDir('bare', c.name)}/review-truth.json`));
    });

    it('every location names one file of the repository and a window shared with another issue of the same file is declared', () => {
      const all = records.flatMap((record) => record.locations.map((location) => ({ record, location })));
      for (const { location } of all) {
        const tail = tailOf(location.file, files);
        assert.equal([...files.keys()].filter((file) => file === tail || file.endsWith(`/${tail}`)).length, 1, `${tail} names one file`);
        assert.ok(location.file.endsWith(tail));
      }
      for (const a of all) for (const b of all) {
        if (a.record === b.record || a.location.file !== b.location.file) continue;
        const [af, at] = a.location.lines;
        const [bf, bt] = b.location.lines;
        if (af - 3 > bt + 3 || bf - 3 > at + 3) continue;
        const declared = (x, y) => t.issues.find((issue) => issue.id === x.id).overlaps?.includes(y.id);
        assert.ok(declared(a.record, b.record) || declared(b.record, a.record), `${a.record.id} and ${b.record.id} windows overlap in ${a.location.file} without a declaration`);
      }
      for (const record of records) {
        assert.ok(record.locations.length >= 1 && record.anchors.length >= 1, record.id);
        for (const anchor of record.anchors) assert.doesNotThrow(() => anchorPattern(anchor));
      }
    });

    if (t.control) {
      it('the plugin arm fails on a medium or high risk in answer.json, the llm judge runs in both arms', () => {
        const g = grader(c, 'no-high-risk-finding');
        const front = frontmatter(g.text);
        assert.equal(front.match, 'not_contains');
        assert.equal(front.target.path, `.ambicode/reviews/${c.prompt.match(/--task (\S+)/)[1]}/1/answer.json`);
        for (const hit of ['"risk": "high"', '"risk":"medium"', '"risk" : "high"']) assert.equal(passes(hit, front), false, hit);
        for (const clean of ['"risk": "low"', '{"findings":[]}', '"risk":"low","confidence":"high"']) assert.equal(passes(clean, front), true, clean);
        assert.equal(grader(c, 'no-defect-claimed').shared, true);
        assert.equal(c.graders.some((g) => g.name.startsWith('found-')), false);
      });

      it('the judge rubric names the sound parts and defines the false alarm', () => {
        const body = grader(c, 'no-defect-claimed').text;
        assert.ok(body.includes(t.fine));
        assert.match(body, /FAIL only if/);
        assert.match(body, /the answer is PASS/);
      });
    }

    if (!t.control) it('the plugin arm reads the printed report, the bare arm the final message, weights 2 for main and 1 for the rest', () => {
      const main = grader(c, 'found-main');
      assert.equal(frontmatter(main.text).target.path.endsWith('/1/report.txt'), true);
      assert.equal(frontmatter(main.bare.text).target, 'last_message');
      for (const record of records) {
        const g = grader(c, `found-${record.id}`);
        assert.equal(g.shared, true, record.id);
        assert.equal(frontmatter(g.text).weight, record.main ? 2 : 1);
        assert.equal(frontmatter(g.bare.text).weight, record.main ? 2 : 1);
        assert.equal(frontmatter(g.text).pattern, frontmatter(g.bare.text).pattern);
      }
      for (const name of ['main-nature', 'no-false-claim']) assert.equal(grader(c, name).shared, true, name);
      assert.equal(frontmatter(grader(c, 'finding-recorded').text).weight, 2);
    });

    if (!t.control) it('the no-false-claim judge sees every real issue and the sound parts, and fails only on a sound part or a claimed pass', () => {
      const body = grader(c, 'no-false-claim').text;
      for (const record of records) assert.ok(body.includes(record.what), record.id);
      assert.ok(body.includes(t.fine));
      assert.match(body, /\(a\) a finding whose complaint is about a sound part/);
      assert.match(body, /\(b\) a statement that a test, check, build or run passed/);
      assert.doesNotMatch(body, /file that is not in the list/);
      assert.match(body, /the answer is PASS/);
    });
  });
}

/** What a reviewer could write about one issue, in one style; `pad` adds report prose around it. */
const STYLES = {
  fullPath: (record, files, k) => `${record.locations[k].file}:${record.locations[k].lines[0]} flags this.`,
  basename: (record, files, k) => `\`${tailOf(record.locations[k].file, files)}\` (line ${record.locations[k].lines[1]}) flags this.`,
  range: (record, files, k) => `${tailOf(record.locations[k].file, files)} lines ${Math.max(1, record.locations[k].lines[0] - 2)}-${record.locations[k].lines[1] + 40} flags this.`,
  list: (record, files, k) => `${tailOf(record.locations[k].file, files)}:1, ${record.locations[k].lines[1] + 2} flags this.`,
};
const anchorText = (record) => {
  const [{ ids, near, gap }] = record.anchors;
  return gap ? `${ids[0]} has no test.` : `${ids[0]} is a problem: ${near.split('|')[0]}.`;
};
const LOCATION_STYLES = Object.keys(STYLES);
// The fixed parts of a printed report (src/modules/review/findings/report.ts), so no anchor can be credited by its boilerplate.
const REPORT_HEAD = `1. WHAT WAS REVIEWED
   review      review-20261021-151616  (partial: The review ran, with gaps: no check recorded, so nothing was verified by execution.)
   mode        quality-review
   target      working (working-e34159754a4badc1)
   measured    4 file(s), 66 line(s), 3619 model-input byte(s)
   note        Untracked files that git does not ignore are included as additions.
   requirements  none supplied; this is a quality review

2. FINDINGS

`;
const REPORT_TAIL = `
3. CHECKS AND VERIFICATION EVIDENCE
   No check recorded for this task. Nothing was verified by execution: that is a gap, not a pass.

4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE
   - No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.
`;

// Remarks the re-audit found crediting an unrelated issue (substring near-words, generic id and keyword pairs), each with the
// issues it may credit now.
const PROBES = {
  'review-ts-boundary': [
    { text: 'chargeLateFees was retested and the latest build is green.', credits: [] },
    { text: 'chargeLateFees has no test.', credits: ['s2'] },
  ],
  'review-ts-strategy': [
    { text: 'A unit test would catch a bad FeeStrategy.', credits: [] },
    { text: 'FeeStrategyFactory has no test.', credits: ['s3'] },
  ],
  'review-py-error-codes': [
    { text: 'ingest is tested with a batch of three readings.', credits: [] },
    { text: 'ingest leaves the earlier readings already stored when a later one fails.', credits: ['s2'] },
  ],
  'review-py-peak-window': [
    { text: 'tests/test_peaks.py covers the handler for high_water_hours and the latest data.', credits: [] },
    { text: 'high_water_hours has no test for the last hour.', credits: ['s2'] },
  ],
  'review-go-swallowed-error': [
    { text: 'There is no test where Advance returns an error.', credits: ['s2'] },
    { text: 'Advance returns an error that is swallowed; a test would have caught it.', credits: ['main'] },
  ],
  'review-go-handler-bypass': [
    { text: 'BayHandler bypasses the planner; a test would have caught it.', credits: ['main'] },
    { text: 'BayHandler has no test.', credits: ['s1'] },
  ],
  'review-jvm-retire-rule': [
    { text: 'RetirementRules.check uses an inverted isBefore; a unit test would have caught it.', credits: ['main'] },
    { text: 'RetirementRules has no test.', credits: ['s1'] },
  ],
  'review-mono-notes-html': [
    { text: 'addNote has no test.', credits: ['s2'] },
  ],
};

describe('synthetic outputs against the deterministic graders', () => {
  for (const t of REVIEW_TRUTHS.filter((entry) => !entry.control)) {
    const c = reviewCases.find((entry) => entry.name === t.name);
    const files = finalFiles(fixtureOf(t));
    const records = truthRecords(t);
    const specs = (record) => [frontmatter(grader(c, `found-${record.id}`).text), frontmatter(grader(c, `found-${record.id}`).bare.text)];
    const verdicts = (text) => Object.fromEntries(records.map((record) => [record.id, specs(record).map((spec) => passes(text, spec))]));
    const only = (ids) => Object.fromEntries(records.map((record) => [record.id, [ids.includes(record.id), ids.includes(record.id)]]));
    const frame = (...parts) => `${REPORT_HEAD}${parts.map((part, i) => `   [medium/medium] finding f${i + 1}\n   ${part}\n`).join('\n')}${REPORT_TAIL}`;

    it(`${t.name}: a perfect output in mixed styles credits every issue in both arms, any style credits its own issue`, () => {
      const mixed = records.map((record, i) => (i % 5 === 4 ? anchorText(record) : STYLES[LOCATION_STYLES[i % 4]](record, files, i % record.locations.length)));
      assert.deepEqual(verdicts(frame(...mixed)), only(records.map((r) => r.id)));
      for (const record of records) {
        for (const style of LOCATION_STYLES) {
          for (let k = 0; k < record.locations.length; k += 1) {
            assert.deepEqual(verdicts(frame(STYLES[style](record, files, k)))[record.id], [true, true], `${record.id} ${style} #${k}`);
          }
        }
        assert.deepEqual(verdicts(frame(anchorText(record)))[record.id], [true, true], `${record.id} anchor only`);
      }
    });

    it(`${t.name}: an exact citation credits only its issue and the issues it declares overlap with, an anchor credits no other`, () => {
      for (const record of records) {
        const exact = [STYLES.fullPath, STYLES.basename].flatMap((style) => record.locations.map((_, k) => style(record, files, k)));
        const shared = t.issues.filter((issue) => issue.id === record.id || issue.overlaps?.includes(record.id) || t.issues.find((x) => x.id === record.id).overlaps?.includes(issue.id)).map((issue) => issue.id);
        for (const text of exact) {
          const credited = Object.entries(verdicts(frame(text))).filter(([, both]) => both[0] && both[1]).map(([id]) => id);
          assert.ok(credited.includes(record.id) && credited.every((id) => shared.includes(id)), `${record.id}: ${text} credited ${credited}`);
        }
        assert.deepEqual(verdicts(frame(anchorText(record))), only([record.id]), `${record.id}: ${anchorText(record)}`);
      }
    });

    it(`${t.name}: empty output, a report of nothing, lines moved by ten and a wrong file credit nothing`, () => {
      for (const text of ['', frame('None. The reviewer identified no material issue.'), 'Looks fine to me. No issues found.']) assert.deepEqual(verdicts(text), only([]));
      for (const record of records) {
        for (const id of record.anchors.flatMap((anchor) => anchor.ids)) assert.deepEqual(verdicts(frame(`\`${id}\` is part of this change.`)), only([]), `${record.id}: ${id} alone`);
      }
      const windows = (file) => records.flatMap((record) => record.locations.filter((location) => location.file === file).map((location) => location.lines));
      for (const record of records) {
        for (const location of record.locations) {
          const [from, to] = location.lines;
          const near = windows(location.file);
          const free = Array.from({ length: 60 }, (_, i) => [from - 10 - i, to + 10 + i]).flat().find((n) => n > 0 && near.every(([f, e]) => n < f - 3 || n > e + 3));
          assert.ok(free !== undefined, `${record.id}: no line ten away from every window of ${location.file}`);
          assert.deepEqual(verdicts(frame(`${tailOf(location.file, files)}:${free} flags this.`))[record.id], [false, false], `${record.id} shifted to ${free}`);
          const other = [...files.keys()].find((file) => !file.startsWith('.') && /\.(ts|py|go|kt|rs)$/.test(file) && !records.some((r) => r.locations.some((l) => l.file === file)));
          assert.ok(other !== undefined);
          assert.deepEqual(verdicts(frame(`${tailOf(other, files)}:${from} flags this.`)), only([]), `wrong file ${other}`);
        }
      }
    });

    it(`${t.name}: the audit probes, a remark about one issue credits only that issue`, () => {
      for (const { text, credits } of PROBES[t.name] ?? []) assert.deepEqual(verdicts(frame(text)), only(credits), text);
      for (const record of records.filter((r) => r.anchors.some((a) => a.gap))) {
        for (const id of record.anchors.filter((a) => a.gap).flatMap((a) => a.ids)) {
          for (const text of [`a unit test would have caught a bug in ${id}`, `${id} was retested on the latest build`, `${id} is exercised by tests/test_peaks.py:12 and a test`]) {
            assert.equal(verdicts(frame(text))[record.id][0], false, `${record.id}: ${text}`);
          }
        }
      }
    });

    it(`${t.name}: the plugin arm reads the report file and the bare arm the final message`, () => {
      for (const record of records) {
        const [plugin, bare] = specs(record);
        assert.match(frontmatter(grader(c, `found-${record.id}`).text).target.path, /\/1\/report\.txt$/);
        assert.equal(frontmatter(grader(c, `found-${record.id}`).bare.text).target, 'last_message');
        assert.equal(plugin.pattern, bare.pattern);
        assert.equal(issuePattern(record, files), plugin.pattern);
      }
    });
  }

  for (const t of REVIEW_TRUTHS.filter((entry) => entry.control)) {
    const c = reviewCases.find((entry) => entry.name === t.name);
    const spec = frontmatter(grader(c, 'no-high-risk-finding').text);
    const answer = (...risks) => JSON.stringify({ findings: risks.map((risk, i) => ({ id: `f${i + 1}`, risk, confidence: 'medium' })) });

    it(`${t.name}: a clean answer and a low finding pass, a medium or high finding fails`, () => {
      assert.equal(passes(answer(), spec), true);
      assert.equal(passes(answer('low', 'low'), spec), true);
      assert.equal(passes(answer('low', 'medium'), spec), false);
      assert.equal(passes(answer('high'), spec), false);
      assert.equal(passes(JSON.stringify({ findings: [{ risk: 'medium' }] }, null, 2), spec), false);
    });
  }

  it('every defect case has a control-free grader set: no found-* grader on a control, no no-defect judge on a defect case', () => {
    for (const c of reviewCases) {
      const control = planned(c).control === true;
      assert.equal(c.graders.some((g) => g.name.startsWith('found-')), !control, c.name);
      assert.equal(c.graders.some((g) => g.name === 'no-defect-claimed'), control, c.name);
    }
  });
});

describe('the tail path of every location', () => {
  it('is never empty and the file keeps its own name', () => {
    for (const t of REVIEW_TRUTHS) {
      const files = finalFiles(fixtureOf(t));
      for (const record of truthRecords(t)) for (const { file } of record.locations) assert.equal(path.basename(tailOf(file, files)), path.basename(file));
    }
  });
});
