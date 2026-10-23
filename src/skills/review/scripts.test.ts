import { mkdir, mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '#testing/paths';
import { TEST_PATH_PATTERNS } from '#util/path-classes';

const run = (name: string, input: Record<string, unknown>): Record<string, any> => {
  const out = spawnSync(process.execPath, [path.join(REPO_ROOT, 'skills', 'review', 'scripts', `${name}.mjs`)], { input: JSON.stringify({ testPatterns: TEST_PATH_PATTERNS.map((pattern) => pattern.source), ...input }), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
};

describe('review scripts (C7)', () => {
  it('brief lists the new-side and old-side lines each hunk shows, the policy text, the requirements and the check entries of the task', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-brief-'));
    try {
      const taskDir = path.join(root, '.ambicode', 'tasks', 't');
      const reviewDir = path.join(root, '.ambicode', 'reviews', 'r1');
      await mkdir(path.join(taskDir, 'steps'), { recursive: true });
      await mkdir(reviewDir, { recursive: true });
      const patch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+more\n keep2\n';
      await writeFile(path.join(reviewDir, 'changed.diff'), patch);
      await writeFile(path.join(reviewDir, 'result.json'), JSON.stringify({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'ORD-1', title: 'Totals', content: 'Sum them.' }], checks: [] }));
      const ledger = (...extra: object[]) => [{ kind: 'review', result: path.relative(root, path.join(reviewDir, 'result.json')) }, ...extra].map((entry) => JSON.stringify(entry)).join('\n');
      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${ledger()}\n`);
      await writeFile(path.join(taskDir, 'steps', 'x-policy-before-work-review.md'), 'RULE no-eval: never eval.');
      const out = run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      assert.equal(out['payload'], `brief: ${path.join(reviewDir, 'brief.md')}\nanswer: ${path.join(reviewDir, 'answer.json')}`);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /### a\.ts \[modified\]\nnew-side lines: 3-6\nold-side lines: 3-5/);
      assert.match(brief, /RULE no-eval: never eval\./);
      assert.doesNotMatch(brief, /changed\.diff/);
      assert.match(brief, /## Project conventions\n\nSource: .*conventions\.md\n\n\(none recorded\)/);
      assert.match(brief, /### ORD-1: Totals\nSum them\./);
      assert.match(brief, /No check recorded for this task: nothing was verified by execution\. That is a gap, not a pass\./);

      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${ledger({ kind: 'check', key: 'app/unit', phase: 'red', exit: 1, files: ['a.spec.ts'] }, { kind: 'check', key: 'app/unit', phase: 'green', exit: 0, files: ['a.spec.ts'] })}\n`);
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withChecks = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(withChecks, /- app\/unit: passed; on: a\.spec\.ts/);
      assert.doesNotMatch(withChecks, /exit 1/, 'the red run the green run replaced is stale');
      assert.doesNotMatch(withChecks, /No check recorded/);

      await mkdir(path.join(root, '.ambicode', 'context'), { recursive: true });
      await writeFile(path.join(root, '.ambicode', 'context', 'conventions.md'), '## Errors\nMoney goes through toCents().');
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withConventions = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(withConventions, /## Project conventions\n\nSource: .*conventions\.md\n\n#### Errors\nMoney goes through toCents\(\)\.\n\n## Check results/, 'the file\'s headings nest under the section');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const fixture = async (result: Record<string, unknown> | null) => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-brief-'));
    const taskDir = path.join(root, '.ambicode', 'tasks', 't');
    const reviewDir = path.join(root, '.ambicode', 'reviews', 'r1');
    await mkdir(path.join(taskDir, 'steps'), { recursive: true });
    await mkdir(reviewDir, { recursive: true });
    await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n');
    const entries = result === null ? [] : [{ kind: 'review', result: path.relative(root, path.join(reviewDir, 'result.json')) }];
    if (result !== null) await writeFile(path.join(reviewDir, 'result.json'), JSON.stringify(result));
    await writeFile(path.join(taskDir, 'ledger.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n'));
    return { root, reviewDir, input: { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') } };
  };

  it('brief with no review on record fails review-missing instead of delivering nothing', async () => {
    const { root, reviewDir, input } = await fixture(null);
    try {
      assert.deepEqual(run('brief', input), { failed: { code: 'review-missing', message: 'no review on record for this task; nothing to brief' } });
      await assert.rejects(readFile(path.join(reviewDir, 'brief.md')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief numbers every diff line with its file line: the new side for added and context lines, the old side for removed ones', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+more\n keep2\n@@ -40 +41 @@\n-x\n+y\n');
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.ok(brief.includes('\n 3  keep\n 4 -old\n 4 +new\n 5 +more\n 6  keep2\n@@ -40 +41 @@\n40 -x\n41 +y\n'), brief);
      assert.equal(await readFile(path.join(reviewDir, 'changed.diff'), 'utf8').then((text) => text.startsWith('diff --git a/a.ts')), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('every variant of the opening carries the sentence on diff line numbers: the checkout of a merge request head, a diff-only one, and a working tree', async () => {
    for (const target of [{ kind: 'merge-request', snapshotId: 'm-1', repositoryRoot: '/elsewhere/checkout' }, { kind: 'merge-request', snapshotId: 'm-1', diffOnly: 'no head' }, { kind: 'working', snapshotId: 'w-1' }]) {
      const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target, requirements: [], checks: [] });
      try {
        run('brief', input);
        assert.match(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /Each diff line starts with its file line number \(new side for \+ and context lines, old side for - lines\): a finding names that number, not a position in this brief\.\nA finding may name only a line listed below/, JSON.stringify(target));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it('a front matter larger than one part is split across parts on line boundaries: no part over the budget, no line lost, the diff not cut', async () => {
    const lines = Array.from({ length: 900 }, (_, at) => `requirement line ${at} ${'r'.repeat(80)}`);
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'ORD-1', title: 'Big', content: lines.join('\n') }], checks: [] });
    try {
      run('brief', input);
      const parts = await partsOf(reviewDir);
      assert.ok(parts.length >= 3, `${parts.length} parts`);
      for (const part of parts) assert.ok(Buffer.byteLength(part) <= 32 * 1024, `${Buffer.byteLength(part)} bytes`);
      const text = parts.join('\n');
      for (const line of lines) assert.ok(text.includes(line), line);
      assert.ok(text.includes('+b'), 'the diff is there');
      assert.match(parts[0]!, /This brief has \d+ parts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists the test files the merge request changed, with counts, before the diff, although it shows none of their content', async () => {
    const changed = (file: string, added: number, removed: number, exclusionReason: string | null) => ({ oldPath: file, newPath: file, changeKind: 'modified', addedLines: added, removedLines: removed, exclusionReason });
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], changedFiles: [changed('a.ts', 1, 1, null), changed('src/auth.service.spec.ts', 40, 2, 'test code, which merge-request review leaves out unless --with-tests is passed'), changed('dist/x.js', 3, 0, 'inside a dependency, build output, or version-control directory')] });
    try {
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /## Test files changed in this merge request \(not under review, content not shown\)\n\n- src\/auth\.service\.spec\.ts \+40\/-2\n/);
      assert.ok(brief.indexOf('## Test files changed') < brief.indexOf('## Changed files'));
      assert.doesNotMatch(brief, /dist\/x\.js/);
      assert.doesNotMatch(brief, /\n## Test files changed[^]*\n- a\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief renders a captured ticket as its description, not as the raw JSON; text that is not JSON stays as captured', async () => {
    const jira = JSON.stringify({ issues: { nodes: [{ key: 'VS-1', self: 'https://api.atlassian.com/ex/jira/x/rest/api/3/issue/1', fields: { summary: 'Totals', issuetype: { description: 'A user goal.', name: 'Story' }, description: '## User Story\n\nSum the totals.' } }] } });
    const adf = JSON.stringify({ fields: { summary: 'S', description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First.' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Second.' }] }] } } });
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'J', title: 'Totals', content: jira }, { id: 'A', title: 'S', content: adf }, { id: 'P', title: 'Plain', content: 'Not json: sum them.' }, { id: 'E', title: 'Empty', content: JSON.stringify({ fields: { summary: 'E', description: null } }) }], checks: [] });
    try {
      await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n');
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /### J: Totals\n## User Story\n\nSum the totals\.\n\n/);
      assert.doesNotMatch(brief, /api\.atlassian\.com|A user goal/);
      assert.match(brief, /### A: S\nFirst\.\nSecond\.\n/);
      assert.match(brief, /### P: Plain\nNot json: sum them\.\n/);
      assert.match(brief, /### E: Empty\n\{"fields":\{"summary":"E","description":null\}\}\n/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const addedFile = (file: string, count: number) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${count} @@\n${Array.from({ length: count }, (_, at) => `+export const value${at} = ${at}; // ${'x'.repeat(60)}`).join('\n')}\n`;
  /** The diff text of every part, with the file line numbers the brief prints in front of the rows taken off. */
  const diffOf = (parts: string[]): string[] => parts.flatMap((part) => [...part.matchAll(/```diff\n([\s\S]*?)\n```/g)].flatMap((match) => match[1]!.split('\n').map((line) => line.replace(/^\s*\d+ (?=[+\- ])/, ''))));
  const partsOf = async (reviewDir: string): Promise<string[]> => {
    const names = (await readdir(reviewDir)).filter((name) => /^brief(-\d+)?\.md$/.test(name)).sort((x, y) => Number(/\d+/.exec(x)?.[0] ?? 1) - Number(/\d+/.exec(y)?.[0] ?? 1));
    return Promise.all(names.map((name) => readFile(path.join(reviewDir, name), 'utf8')));
  };

  it('brief puts requirements, discussions, rules and conventions before the diff, and splits an oversized diff into parts of at most 32 KB with no line lost', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'ORD-1', title: 'Totals', content: 'Sum them.' }], checks: [], omissions: [{ kind: 'attention', text: 'earlier gap' }] });
    try {
      const patch = addedFile('big.ts', 1200) + addedFile('mid.ts', 200) + addedFile('small.ts', 5);
      await writeFile(path.join(reviewDir, 'changed.diff'), patch);
      await writeFile(path.join(input.taskDir, 'steps', 'x-policy-before-work-review.md'), `RULE no-eval: never eval.\n${'rule text\n'.repeat(200)}`);
      const out = run('brief', input);
      assert.equal(out['failed'], undefined);
      const parts = await partsOf(reviewDir);
      assert.ok(parts.length >= 3, `${parts.length} parts`);
      for (const part of parts) assert.ok(Buffer.byteLength(part) <= 32 * 1024, `${Buffer.byteLength(part)} bytes`);
      const [first] = parts as [string];
      const order = ['## Requirements', '## Policy rules', '## Project conventions', '## Changed files'].map((heading) => first.indexOf(heading));
      assert.ok(order.every((at) => at >= 0));
      assert.deepEqual(order, [...order].sort((x, y) => x - y));
      assert.match(first, /### ORD-1: Totals\nSum them\./);
      assert.equal(first.split('rule text').length - 1, 200, 'the rules are whole');
      assert.match(first, new RegExp(`This brief has ${parts.length} parts: brief\\.md, brief-2\\.md`));
      assert.match(first, new RegExp(`\\(continued in brief-2\\.md, part 2 of ${parts.length}\\)\\n?$`));
      assert.match(parts[1]!, new RegExp(`^# Review brief r1, part 2 of ${parts.length}`));
      assert.doesNotMatch(parts.at(-1)!, /continued in/);
      // Nothing is lost: the parts' diff text is the input, in order.
      assert.deepEqual(diffOf(parts), patch.trimEnd().split('\n'));
      assert.match(out['payload'], new RegExp(`^The brief has ${parts.length} parts; Read every part, in order, before writing:\\nbrief \\(part 1 of ${parts.length}\\): .*brief\\.md\\nbrief \\(part 2 of ${parts.length}\\): .*brief-2\\.md\\n`));
      assert.match(out['payload'], /\nanswer: .*answer\.json$/);
      // A split file lists in each part only the lines of that part.
      assert.match(first, /### big\.ts \[added\]\nnew-side lines: 1-\d+\n/);
      assert.match(parts[1]!, /### big\.ts \[added\]\nnew-side lines: \d+-\d+\n/);
      assert.deepEqual(JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions, [{ kind: 'attention', text: 'earlier gap' }], 'a split is not a gap: nothing is added to the result');

      await writeFile(path.join(reviewDir, 'changed.diff'), addedFile('small.ts', 5));
      const small = run('brief', input);
      assert.equal(small['payload'], `brief: ${path.join(reviewDir, 'brief.md')}\nanswer: ${path.join(reviewDir, 'answer.json')}`);
      assert.deepEqual((await readdir(reviewDir)).filter((name) => name.startsWith('brief')), ['brief.md'], 'a rerun leaves no older part behind');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief splits at hunk boundaries: a file that is not split keeps its header, a split file continues at an @@ line', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], omissions: [] });
    try {
      const hunk = (start: number) => `@@ -${start},40 +${start},40 @@\n${Array.from({ length: 40 }, (_, at) => ` context${start + at} ${'y'.repeat(70)}`).join('\n')}\n`;
      const patch = `diff --git a/h.ts b/h.ts\n--- a/h.ts\n+++ b/h.ts\n${Array.from({ length: 30 }, (_, at) => hunk(1 + at * 100)).join('')}`;
      await writeFile(path.join(reviewDir, 'changed.diff'), patch);
      run('brief', input);
      const parts = await partsOf(reviewDir);
      assert.ok(parts.length >= 2);
      assert.match(parts[1]!, /```diff\n@@ -\d+,40 \+\d+,40 @@\n/, 'the next part starts at a hunk');
      assert.deepEqual(diffOf(parts), patch.trimEnd().split('\n'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief trims related files only beyond the 60 KB total, names the cut, and does not mark the review partial for it', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], omissions: [] });
    try {
      const body = (name: string) => Array.from({ length: 100 }, (_, at) => `export const ${name}${at} = ${at}; // ${'y'.repeat(100)}`).join('\n') + '\n';
      await mkdir(path.join(root, 'src'), { recursive: true });
      for (const file of ['sibling1.ts', 'sibling2.ts', 'sibling3.ts']) await writeFile(path.join(root, 'src', file), `export const sharedThing0 = 1;\nexport const sharedThing1 = 1;\n${body(file.replace(/\W/g, ''))}`);
      await writeFile(path.join(root, 'src', 'a.ts'), 'export const sharedThing = 1;\n');
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      const diff = (count: number) => `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,${count + 1} @@\n export const sharedThing = 1;\n${Array.from({ length: count }, (_, at) => `+export const sharedThing${at} = ${at}; // ${'z'.repeat(60)}`).join('\n')}\n`;
      await writeFile(path.join(reviewDir, 'changed.diff'), diff(150));
      run('brief', input);
      const small = await partsOf(reviewDir);
      assert.ok(small.join('').includes('### src/sibling1.ts (related'), 'with room, the related files are in');
      assert.doesNotMatch(small.join(''), /related files? omitted/);

      await writeFile(path.join(reviewDir, 'changed.diff'), diff(450));
      run('brief', input);
      const large = await partsOf(reviewDir);
      const text = large.join('');
      assert.ok(Buffer.byteLength(text) <= 60 * 1024 + 2048, `${Buffer.byteLength(text)} bytes`);
      assert.match(text, /^related files: none \(brief size budget reached\)$/m, 'no related file fits: one line, no names');
      assert.doesNotMatch(text, /sibling\d\.ts/);
      assert.equal(diffOf(large).filter((line) => line.startsWith('+export const sharedThing')).length, 450, 'the whole diff is there');
      const kept = JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions as { kind: string; text: string }[];
      assert.deepEqual(kept.map((entry) => entry.kind), ['scope'], 'a dropped related file is not a gap in the diff: it is scope, never attention');
      assert.match(kept[0]!.text, /no related file fit the brief's size budget/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists only the checks of the reviewed route, the latest run per key, named by outcome', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const check = (route: string, key: string, exit: number) => ({ kind: 'check', route, key, phase: 'green', exit, files: [] });
      const lines = [
        check('r-old', 'app/stale', 1),
        check('r-now', 'app/unit', 1), check('r-now', 'app/lint', 1), check('r-now', 'app/unit', 0),
        { kind: 'review', route: 'r-now', result: path.relative(root, path.join(reviewDir, 'result.json')) },
      ];
      await writeFile(path.join(input.taskDir, 'ledger.jsonl'), `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /- app\/unit: passed/);
      assert.match(brief, /- app\/lint: FAILED \(exit 1\)/);
      assert.doesNotMatch(brief, /app\/stale|app\/unit[^\n]*exit 1|green: exit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const modified = (file: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-a\n+b\n`;

  const added = (file: string, ...lines: string[]) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1,${lines.length} @@\n-a\n${lines.map((line) => `+${line}`).join('\n')}\n`;

  it('brief inlines the same-directory files that share names, then the files that share the most names with the patch from any directory', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const body = (...names: string[]) => names.map((name) => `export const ${name} = 1;`).join('\n') + '\n';
      const shared = ['parseWidgetRows', 'normalizeSku', 'zoneLabel', 'retryBudget', 'ledgerKey', 'taxBracket'];
      const files: Record<string, string> = {
        'src/a/foo.ts': body('old1', 'old2', 'old3'),
        'src/a/foo.test.ts': body('t1', 't2', 't3'),
        'src/a/lone.ts': body('old1', 'old2', 'old3'),
        'src/a/stub.ts': body(...shared.slice(0, 2)),
        'src/a/near.ts': body('parseWidgetRows', 'x1', 'x2'),
        'pkg/far/helper.ts': body(...shared),
        'pkg/far/half.ts': body(...shared.slice(0, 4)),
        'pkg/far/third.ts': body(...shared.slice(0, 3)),
        'pkg/far/fourth.ts': body(...shared.slice(0, 2), 'p1'),
        'pkg/far/fifth.ts': body(shared[0] ?? '', 'p2', 'p3'),
        'pkg/far/notes.md': '# notes\nledgerKey taxBracket zoneLabel\nthird line\n',
        'pkg/far/only-common.ts': body('commonWord', 'q1', 'q2'),
        ...Object.fromEntries(Array.from({ length: 12 }, (_, at) => [`fill/f${at}.ts`, body('commonWord', `fill${at}`, `fillB${at}`)])),
      };
      for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
      await writeFile(path.join(root, 'pkg/far/doc.md'), '# only a title\n');
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`), 'export const commonWord = 2;') + added('src/a/lone.ts', 'export const loneChange = 1;'));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.match(section, /Related code the patch does not show, for comparison: duplication of an existing helper and a sibling convention the change breaks are findings\./);
      const headers = [...section.matchAll(/^### (\S+) \((.+)\)$/gm)].map((match) => [match[1], match[2]]);
      assert.deepEqual(headers.map(([name]) => name), ['src/a/near.ts', 'pkg/far/helper.ts', 'pkg/far/half.ts', 'pkg/far/third.ts', 'pkg/far/fourth.ts'], 'tests, then the reserved same-directory file (1 shared name), then the top 4 other files by shared names; the fifth loses the cap');
      assert.equal(headers[1]?.[1], 'related: shares 6 names with the change: ledgerKey, retryBudget, taxBracket, zoneLabel, normalizeSku', 'the header names the 5 rarest of the 6 shared names');
      assert.doesNotMatch(section, /commonWord|only-common|stub\.ts|doc\.md|notes\.md/, 'a name in more than 20% of the files, a 2-line file, a 1-line file and a .md file sharing 3 rare names with a .ts change are not chosen');
      assert.doesNotMatch(section, /### src\/a\/(foo|lone)\.ts/, 'a file of the diff is shown by the diff, not as related');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief holds no test-file content except the diff hunks of a test file the review kept: no related test, no "No test file found" line', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const body = (...names: string[]) => [...names.map((name) => `export const ${name} = 1;`), 'export const pad1 = 1;', 'export const pad2 = 2;'].join('\n') + '\n';
      const shared = ['parseWidgetRows', 'normalizeSku', 'zoneLabel'];
      const files: Record<string, string> = {
        'src/a/foo.ts': body('old1'), 'src/a/foo.test.ts': body(...shared), 'src/a/foo.spec.ts': body(...shared), 'src/a/__tests__/helper.ts': body(...shared), 'src/a/foo_test.py': body(...shared),
        'src/a/lone.ts': body('old2'), 'src/a/near.ts': body(shared[0] ?? ''), 'pkg/far/helper.ts': body(...shared), 'pkg/far/helper.test.ts': body(...shared),
      };
      for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`)) + added('src/a/lone.ts', 'export const loneChange = 1;') + added('src/a/foo.test.ts', 'export const keptTestHunk = 1;'));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.deepEqual([...section.matchAll(/^### (\S+) \(related/gm)].map((match) => match[1]), ['src/a/near.ts', 'pkg/far/helper.ts']);
      assert.doesNotMatch(section, /\.test\.|\.spec\.|__tests__|foo_test/, 'no test file is a related file');
      assert.doesNotMatch(brief, /No test file found|test of /);
      assert.match(brief.slice(0, brief.indexOf('## Related files')), /### src\/a\/foo\.test\.ts \[modified\]/, 'a test file in the diff keeps its hunks');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists the human merge request discussions, open first, and says so when they could not be fetched', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const long = 'x'.repeat(900);
      const discussions = [
        { path: 'src/a.ts', line: 4, resolved: true, notes: [{ author: 'ann', body: 'old point' }] },
        { path: 'src/b.ts', line: 9, resolved: false, notes: [{ author: 'bob', body: 'Is\nthis tested?' }, { author: 'cy', body: 'not yet' }] },
        { path: null, line: null, resolved: null, notes: [{ author: 'dee', body: long }] },
      ];
      await writeFile(path.join(root, '.ambicode', 'tasks', 't', 'mr-discussions.json'), JSON.stringify({ discussions }));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Existing merge request discussions'), brief.indexOf('## Policy rules'));
      assert.match(section, /^## Existing merge request discussions \(untrusted, from other people\): do not repeat a point one already makes\n\n- src\/b\.ts:9 @bob: Is this tested\?\n  - @cy: not yet\n- general @dee: x+…\n- src\/a\.ts:4 \(resolved\) @ann: old point\n\n$/);
      assert.ok(!section.includes('x'.repeat(401)), 'a long body is truncated');

      await writeFile(path.join(root, '.ambicode', 'tasks', 't', 'mr-discussions.json'), JSON.stringify({ error: 'glab api failed: 401' }));
      run('brief', input);
      assert.match(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /\(not fetched: glab api failed: 401; a point may already be made there\)/);

      await rm(path.join(root, '.ambicode', 'tasks', 't', 'mr-discussions.json'));
      run('brief', input);
      assert.doesNotMatch(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /Existing merge request discussions/, 'a local review has none');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief reserves up to 2 same-directory files per changed file even when other directories share more names, and those do not use the 4 global slots', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const body = (...names: string[]) => names.map((name) => `export const ${name} = 1;`).join('\n') + '\n';
      const shared = ['sharedAlpha', 'sharedBeta', 'sharedGamma', 'sharedDelta'];
      const files: Record<string, string> = {
        'src/a/foo.ts': body('old1', 'old2', 'old3'),
        'src/a/a1.ts': body('sharedAlpha', 'x1', 'x2'),
        'src/a/a2.ts': body('sharedBeta', 'x3', 'x4'),
        'src/a/a3.ts': body('sharedGamma', 'x5', 'x6'),
        'far/p1.ts': body(...shared),
        'far/p2.ts': body(...shared.slice(0, 3)),
        'far/p3.ts': body(...shared.slice(0, 2), 'y1'),
        'far/p4.ts': body(shared[1] ?? '', shared[2] ?? '', 'y2'),
        'far/p5.ts': body(shared[0] ?? '', shared[3] ?? '', 'y3'),
      };
      for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`)));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      const names = [...section.matchAll(/^### (\S+) \(related/gm)].map((match) => match[1]);
      assert.deepEqual(names, ['src/a/a1.ts', 'src/a/a2.ts', 'far/p1.ts', 'far/p2.ts', 'far/p3.ts', 'far/p4.ts'], 'the 2 same-directory files first although each shares 1 name; a third same-directory file and the fifth far file lose');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief reports as omitted only selected related files the budget cut, by name, not every repository file that shares a name', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const body = (...names: string[]) => [...names.map((name) => `export const ${name} = 1;`), ...Array.from({ length: 150 }, (_, at) => `export const pad${at} = ${at};`)].join('\n') + '\n';
      const files: Record<string, string> = { 'src/a/foo.ts': body('old1'), 'src/a/a1.ts': body('sharedAlpha'), 'src/a/a2.ts': body('sharedAlpha'), ...Object.fromEntries(Array.from({ length: 30 }, (_, at) => [`far/p${String(at).padStart(2, '0')}.ts`, body('sharedAlpha', 'sharedBeta')])),
        // A name in more than 20% of the files is noise, so the repository needs enough unrelated files for 32 sharers to stay under it.
        ...Object.fromEntries(Array.from({ length: 200 }, (_, at) => [`fill/f${at}.ts`, `export const fill${at} = 1;\n`])) };
      for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', 'export const sharedAlpha = 2;', 'export const sharedBeta = 2;'));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const shown = [...brief.matchAll(/^### (\S+) \(related/gm)].map((match) => match[1]);
      assert.deepEqual(shown, ['src/a/a1.ts', 'src/a/a2.ts', 'far/p00.ts'], 'the 300-line total fits three files of 100 lines');
      assert.match(brief, /… \(3 related files omitted \(size budget\): far\/p01\.ts, far\/p02\.ts, far\/p03\.ts\)/, '2 near + 4 global files were selected; 3 were cut; the other 26 candidates were never selected');
      const scope = JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions as { kind: string; text: string }[];
      assert.deepEqual(scope, [{ kind: 'scope', text: '3 related files were cut from the brief (size budget) and not read: far/p01.ts, far/p02.ts, far/p03.ts.' }]);
      run('brief', input);
      assert.equal(JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions.length, 1, 'a rerun replaces the note');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief with no related file left under the total budget says so in one line and names none', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const body = (...names: string[]) => [...names.map((name) => `export const ${name} = 1;`), ...Array.from({ length: 150 }, (_, at) => `export const pad${at} = ${at};`)].join('\n') + '\n';
      for (const [file, text] of Object.entries({ 'src/a/foo.ts': body('old1'), 'src/a/a1.ts': body('sharedAlpha'), ...Object.fromEntries(Array.from({ length: 200 }, (_, at) => [`fill/f${at}.ts`, `export const fill${at} = 1;\n`])) })) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });
      const big = Array.from({ length: 600 }, (_, at) => `export const sharedAlpha${at} = '${'x'.repeat(90)}';`);
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', 'export const sharedAlpha = 2;', ...big) + added('src/b/bar.ts', ...big));
      run('brief', input);
      const text = (await partsOf(reviewDir)).join('\n');
      assert.match(text, /^related files: none \(brief size budget reached\)$/m);
      assert.doesNotMatch(text, /related files? omitted|src\/a\/a1\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief caps each related file and the section, marks truncation, skips binary and oversize files, and omits the section outside a git repository', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const changed = Array.from({ length: 8 }, (_, at) => `m${at}/f${at}.ts`);
      const body = (at: number) => [`export const uniq${at} = 1;`, ...Array.from({ length: 150 }, (_, line) => `line ${line + 1}`)].join('\n');
      const files = changed.flatMap((file, at) => [file, `m${at}/g${at}.ts`, `m${at}/h${at}.ts`]);
      for (const [at, file] of files.entries()) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), body(Math.floor(at / 3))); }
      await writeFile(path.join(root, 'm0', 'h0.ts'), Buffer.from([0x61, 0x00, 0x62, 0x0a]));
      await writeFile(path.join(root, 'm0', 'g0.ts'), 'x'.repeat(70 * 1024));
      await writeFile(path.join(reviewDir, 'changed.diff'), changed.map((file, at) => added(file, `export const uniq${at} = 2;`)).join(''));
      run('brief', input);
      assert.doesNotMatch(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /## Related files/, 'no git: no section, not an empty one');
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', '-A', '--', ...files], { cwd: root });
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.doesNotMatch(section, /### m0\/(g0|h0)\.ts/, 'binary and oversize files are skipped');
      assert.ok(section.indexOf('### m1/g1.ts') < section.indexOf('### m1/h1.ts') && section.includes('### m2/g2.ts'), 'the skipped files do not stop the next ones');
      assert.match(section, /### m1\/g1\.ts \(related[^\n]*\n```\n  1 export const uniq1 = 1;\n/);
      assert.equal(section.match(/^… \(first 100 lines shown; 51 more not included\)$/gm)?.length, 3, 'per-file cap 100 lines; 3 files fill the 300-line total');
      assert.match(section, /\n100 line 99\n… \(first 100 lines shown; 51 more not included\)\n```\n/);
      assert.doesNotMatch(section, /line 100\n/);
      assert.equal(section.split('\n').filter((line) => /^ *\d+ (line \d+|export const uniq\d+ = 1;)$/.test(line)).length, 300);
      assert.match(section, /… \(\d+ related files omitted \(size budget\): m\d\//, 'the cut is announced with names, not silent');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
