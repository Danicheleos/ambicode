import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { foundPaths } from './metrics.mjs';
import { NAVIGATOR_ORDER, STEP_WEIGHT, ancestorShares, ANCESTOR_SHARE, navTruth, navigatorSources, renderNavigator, scoreNavigator, writeNavigator } from './navigator-cases.mjs';

// A made-up bench and cases dir: the real ones are NDA assets that are not in git.
function assets() {
  const root = mkdtempSync(path.join(tmpdir(), 'nav-assets-'));
  const bench = path.join(root, 'bench', 'repo');
  mkdirSync(path.join(bench, '.git'), { recursive: true });
  const casesDir = path.join(root, 'cases');
  for (const id of NAVIGATOR_ORDER) {
    const dir = path.join(casesDir, `fe-vs-${id}-investigate`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'prompt.md'), `---\nname: x\n---\nintro\n\n<ticket>\nTICKET-${id}: add [a.b] field\n</ticket>\n`);
    writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ truth: ['main/assets/i18n/en.json', `main/app/${id}.ts`, 'main/[id]/page.ts', `main/app/${id}.spec.ts`, `main/app/${id}.component.scss`, `main/app/${id}.component.html`, `main/app/${id}.stories.ts`] }));
  }
  return { root, env: { NAV_BENCH: bench, NAV_CASES: casesDir } };
}

describe('navigator cases', () => {
  it('without the assets nothing is rendered and nothing throws', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'nav-none-'));
    assert.equal(navigatorSources({ NAV_BENCH: path.join(empty, 'x'), NAV_CASES: path.join(empty, 'y') }), null);
    assert.equal(writeNavigator(empty, { NAV_BENCH: path.join(empty, 'x'), NAV_CASES: path.join(empty, 'y') }), 0);
    assert.equal(existsSync(path.join(empty, 'cases', 'navigator')), false);
  });

  it('renders both arms in date order; the arms differ only in the context copy, the tools, the relay and the step grader', () => {
    const { env } = assets();
    const files = renderNavigator(navigatorSources(env));
    const dirs = (tree) => [...new Set([...files.keys()].filter((f) => f.startsWith(`${tree}/navigator/`)).map((f) => f.split('/')[2]))];
    assert.deepEqual(dirs('cases'), NAVIGATOR_ORDER.map((id, i) => `${String(i + 1).padStart(2, '0')}-fe-vs-${id}-navigator`));
    assert.deepEqual(dirs('bare'), dirs('cases'));
    const first = dirs('cases')[0];
    assert.doesNotMatch(files.get(`cases/navigator/${first}/scaffold.sh`), /features\.md|\.ambicode\/navigator/, 'no navigator map: the navigator reads only the context');
    assert.match(files.get(`cases/navigator/${first}/scaffold.sh`), /cp -R '.*\.ambicode\/context' \.ambicode\/context/);
    assert.match(files.get(`cases/navigator/${first}/scaffold.sh`), /cp '.*\.ambicode\/config\.yaml' \.ambicode\/config\.yaml/, 'map needs the config');
    assert.doesNotMatch(files.get(`bare/navigator/${first}/scaffold.sh`), /\.ambicode\/context|config\.yaml/);
    assert.match(files.get(`bare/navigator/${first}/scaffold.sh`), /--exclude=\.\/\.ambicode/, 'both arms start without the bench .ambicode/');
    const prompt = (tree) => files.get(`${tree}/navigator/${first}/prompt.md`);
    const body = (tree) => prompt(tree).split('---\n\n')[1];
    assert.match(prompt('cases'), /TICKET-438/);
    assert.doesNotMatch(body('cases'), /navigator|ambicode/i, 'the request names neither the agent nor the plugin');
    assert.equal(body('cases'), body('bare'), 'one contract for both arms');
    assert.match(prompt('bare'), /allowed_tools: \[Read, Grep, Glob\]\n/);
    assert.doesNotMatch(prompt('bare'), /append_system_prompt/);
    assert.match(prompt('cases'), /allowed_tools: \[Agent\]\nappend_system_prompt: 'Answer only through the ambicode:navigator agent\.[^\n]*in the foreground[^\n]*without its descriptions[^\n]*'\n/, 'the plugin arm only relays the navigator');
    assert.match(first, /^01-fe-vs-438-navigator$/);
    const graders = (tree) => [...files.keys()].filter((f) => f.startsWith(`${tree}/navigator/${first}/graders/`)).map((f) => path.basename(f, '.md'));
    assert.deepEqual(graders('cases').filter((g) => !graders('bare').includes(g)), ['navigator-called']);
    assert.deepEqual(graders('bare').filter((g) => g.startsWith('recall-')), ['recall-01-app', 'recall-02-id'], 'one grader per truth folder; the i18n and spec files are not in the nav truth');
  });

  it('recall graders match a path only inside the files block; the steps carry the step weight', () => {
    const { env } = assets();
    const files = renderNavigator(navigatorSources(env));
    const key = [...files.keys()].find((f) => f.includes('/graders/recall-') && f.startsWith('cases/'));
    const pattern = new RegExp(/pattern: '(.*)'\n/.exec(files.get(key))[1], 'm');
    assert.match(key, /recall-01-app\.md$/);
    assert.equal(pattern.test('```files\nmain/app/438.ts\n```'), true);
    assert.equal(pattern.test('x\n```files\nzzz/other.ts\n./main/app/438.ts  \n```\nWhy:'), true);
    assert.equal(pattern.test('main/app/438.ts\n```files\nzzz/other.ts\n```'), false);
    assert.equal(pattern.test('```files\nzzz/other.ts\n```\n```files\nmain/app/x.ts\n```'), false, 'second block');
    assert.equal(pattern.test('```files\nmain/app/438.ts\n```'.replace('```files', '```text')), false);
    for (const f of files.keys()) if (/graders\/(files-block|navigator-called)\.md$/.test(f)) assert.match(files.get(f), new RegExp(`weight: ${STEP_WEIGHT}\\n`));
    assert.match(files.get(key), /\nweight: 1\n/);
  });

  it('truth.json carries the folder rule as data for the graders and the viewer', () => {
    const { env } = assets();
    const evalsDir = mkdtempSync(path.join(tmpdir(), 'nav-evals-'));
    writeNavigator(evalsDir, env);
    const truth = JSON.parse(readFileSync(path.join(evalsDir, 'cases', 'navigator', '02-fe-vs-6141-navigator', 'truth.json'), 'utf8'));
    assert.deepEqual(truth, {
      name: 'fe-vs-6141-navigator',
      source: 'files-block',
      level: 'folder',
      ancestorShare: ANCESTOR_SHARE,
      relevant: ['main/app/6141.ts', 'main/[id]/page.ts'],
      allowed: ['main/assets/i18n/en.json', 'main/app/6141.spec.ts', 'main/app/6141.component.scss', 'main/app/6141.component.html', 'main/app/6141.stories.ts'],
      ancestors: { main: { relevant: 0, total: 0 } },
    });
  });

  it('a companion-only directory becomes a directory item; a directory with a logic file stays a file item', () => {
    assert.deepEqual(navTruth(['a/x.component.html', 'a/x.component.scss', 'a/y.spec.ts', 'b/c.ts', 'b/c.component.html', 'i18n/en.json', 'a/i18n/en.json']), ['a/', 'b/c.ts']);
  });

  it('a template-only case gets a directory item whose folder grader takes the folder, anything under it, an ancestor or a file in an ancestor', () => {
    const { env, root } = assets();
    writeFileSync(path.join(root, 'cases', 'fe-vs-6141-investigate', 'truth.json'), JSON.stringify({ truth: ['m/t/t.component.html', 'm/t/t.component.scss', 'm/l/l.ts'] }));
    const files = renderNavigator({ ...navigatorSources(env), files: ['m/t/t.component.ts', 'm/l/l.ts', 'm/index.ts'] });
    const key = [...files.keys()].find((f) => /6141.*\/graders\/recall-01/.test(f) && f.startsWith('cases/'));
    assert.match(key, /recall-01-t\.md$/);
    const pattern = new RegExp(/pattern: '(.*)'\n/.exec(files.get(key))[1], 'm');
    for (const ok of ['m/t/', 'm/t', './m/t/', 'm/t/t.component.ts', 'm/t/t.component.html', 'm/t/sub/x.ts', 'm/', 'm/index.ts']) assert.equal(pattern.test(`\`\`\`files\n${ok}\n\`\`\``), true, ok);
    for (const bad of ['m', 'm/tt/x.ts', 'm/other/', 'm/other/x.ts', 'mm/x.ts', 'other.ts']) assert.equal(pattern.test(`\`\`\`files\n${bad}\n\`\`\``), false, bad);
    const truth = JSON.parse(files.get('cases/navigator/02-fe-vs-6141-navigator/truth.json'));
    assert.deepEqual(truth.relevant, ['m/t/', 'm/l/l.ts']);
  });

  it('PARITY: the share of passing folder graders equals the recall of scoreNavigator for the same answer', () => {
    const { env, root } = assets();
    const truth = ['a/b/c/one.ts', 'a/b/d/two.ts', 'x/y/', 'p/q/r.ts', 'p/q/r2.ts'];
    // Source folders: a has 7 (a, a/b, a/b/c, a/b/d, a/b/e, a/w, a/v), 2 covered: rejected. a/b has 4, 2 covered: exactly half. x has 2 (x, x/y), 1 covered. p has 2 (p, p/q), 1 covered.
    const bench = ['a/b/c/one.ts', 'a/b/d/two.ts', 'a/b/e/other.ts', 'a/b/index.ts', 'a/top.ts', 'a/w/z1.ts', 'a/v/z2.ts', 'a/z3.ts', 'x/y/k.ts', 'x/m.ts', 'p/q/r.ts', 'p/q/r2.ts', 'p/s.ts', 'a/b/c/one.spec.ts'];
    writeFileSync(path.join(root, 'cases', 'fe-vs-6141-investigate', 'truth.json'), JSON.stringify({ truth }));
    const files = renderNavigator({ ...navigatorSources(env), files: bench });
    const ancestors = ancestorShares(truth, bench);
    assert.deepEqual(ancestors, { a: { relevant: 2, total: 7 }, 'a/b': { relevant: 2, total: 4 }, x: { relevant: 1, total: 2 }, p: { relevant: 1, total: 2 } });
    assert.deepEqual(JSON.parse(files.get('cases/navigator/02-fe-vs-6141-navigator/truth.json')).ancestors, ancestors);
    const patterns = [...files.keys()].filter((f) => /6141.*\/graders\/recall-/.test(f) && f.startsWith('cases/')).map((f) => new RegExp(/pattern: '(.*)'\n/.exec(files.get(f))[1], /flags: (\w+)/.exec(files.get(f))?.[1]));
    assert.equal(patterns.length, 4);
    const shipped = JSON.parse(files.get('cases/navigator/02-fe-vs-6141-navigator/truth.json'));
    const answers = {
      'file inside folder': 'a/b/c/one.ts',
      'deeper subfolder': 'a/b/c/deep/er/z.ts',
      'ancestor dir': 'a/b',
      'broad ancestor below the share': './a/',
      'file in broad ancestor': 'a/top.ts',
      'ancestor at exactly half': 'a/b',
      'ancestor above half': 'p/',
      'file in ancestor above half': 'p/s.ts',
      'half ancestor of a dir item': 'x/',
      'file in half ancestor': 'x/m.ts',
      'file in ancestor dir': 'a/b/index.ts',
      'sibling': 'a/b/e/other.ts',
      'unrelated': 'q/r.ts',
      'folder itself': 'x/y/',
      'file in folder': 'x/y/k.html',
      'top-level file': 'package.json',
      'several': 'a/b/c/one.ts\nx/y/deep/m.ts\nq/r.ts',
    };
    const check = (label, text) => {
      const expected = scoreNavigator(shipped, foundPaths(text, 'files-block')).recall;
      assert.ok(Math.abs(patterns.filter((re) => re.test(text)).length / patterns.length - expected) < 0.001, label);
    };
    for (const [label, body] of Object.entries(answers)) check(label, `intro\n\`\`\`files\n${body}\n\`\`\`\n`);
    check('prose-only mention', 'see a/b/c/one.ts and x/y/\n```files\nq/r.ts\n```');
    check('second block ignored', '```files\nq/r.ts\n```\n```files\na/b/c/one.ts\n```');
    check('no block', 'a/b/c/one.ts');
  });

  it('scoreNavigator: folders are covered by files, folders below, or accepted ancestors; extra and the no-list contract follow metrics.mjs', () => {
    const truth = { relevant: ['m/a/x.ts', 'm/b/'], allowed: ['m/c/y.ts'], ancestorShare: 0.5, ancestors: { m: { relevant: 1, total: 4 }, 'm/a': { relevant: 1, total: 2 }, q: { relevant: 2, total: 2 } } };
    assert.deepEqual(scoreNavigator(truth, ['m/a/other.ts', 'm/b/deep/z.ts']), { recall: 1, precision: 1, f1: 1, missed: [], extra: [], contract: true });
    assert.deepEqual(scoreNavigator(truth, ['m/z.ts']), { recall: 0, precision: 0, f1: 0, missed: ['m/a', 'm/b'], extra: ['m'], contract: true }, 'an ancestor below the share covers nothing');
    assert.equal(scoreNavigator({ ...truth, ancestorShare: 0.25 }, ['m/z.ts']).recall, 1, 'exactly the share');
    assert.equal(scoreNavigator({ ...truth, ancestors: {} }, ['m/z.ts']).recall, 0, 'absent from the map');
    const shipped = (relevant, total) => scoreNavigator({ ...truth, ancestorShare: ANCESTOR_SHARE, ancestors: { m: { relevant, total } } }, ['m/z.ts']).recall;
    assert.deepEqual([shipped(3, 10), shipped(2, 7)], [1, 0], 'the shipped share is 0.3: 3/10 counts, 2/7 does not');
    assert.deepEqual(scoreNavigator(truth, ['m/a/x.ts', 'm/c/y.ts', 'm/d/z.ts']), { recall: 0.5, precision: 0.667, f1: 0.572, missed: ['m/b'], extra: ['m/d'], contract: true }, 'allowed folder is correct, sibling is extra');
    assert.deepEqual(scoreNavigator(truth, null), { recall: 0, precision: null, f1: 0, missed: ['m/a', 'm/b'], extra: [], contract: false });
    assert.deepEqual(scoreNavigator(truth, ['package.json']), { recall: 0, precision: null, f1: 0, missed: ['m/a', 'm/b'], extra: [], contract: true }, 'a top-level file is no folder');
  });

  it('ancestor shares count source folders: one big folder does not outweigh several small relevant ones', () => {
    const big = Array.from({ length: 50 }, (_, i) => `big/f${i}.ts`);
    const bench = [...big, 'big/one/a.ts', 'big/two/b.ts', 'big/three/c.ts', 'big/spec/x.spec.ts', 'big/tpl/t.component.html'];
    // Files: 3 of 54 relevant. Folders: big, one, two, three hold logic files; the template and spec folders do not count; 3 of 4 covered.
    assert.deepEqual(ancestorShares(['big/one/a.ts', 'big/two/b.ts', 'big/three/c.ts'], bench), { big: { relevant: 3, total: 4 } });
    assert.deepEqual(ancestorShares(['big/one/a.ts', 'big/two/b.ts'], bench), { big: { relevant: 2, total: 4 } }, 'exactly half');
    assert.deepEqual(ancestorShares(['big/one/a.ts'], []), { big: { relevant: 0, total: 0 } }, 'an empty ancestor');
    assert.deepEqual(ancestorShares(['big/one/'], ['big/one/deep/q.ts', 'big/f.ts']), { big: { relevant: 1, total: 2 } }, 'below a directory item is covered');
  });
});
