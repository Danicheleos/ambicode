import { mkdir, mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
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
      assert.doesNotMatch(brief, /Project conventions/);
      assert.match(brief, /### ORD-1: Totals\nSum them\./);
      assert.match(brief, /No check recorded for this task: nothing was verified by execution\. That is a gap, not a pass\./);

      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${ledger({ kind: 'check', key: 'app/unit', phase: 'green', exit: 1, files: ['a.spec.ts'], output: 'o1.log', bytes: 1 }, { kind: 'check', key: 'app/unit', phase: 'green', exit: 0, files: ['a.spec.ts'], output: 'o2.log', bytes: 1 })}\n`);
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withChecks = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(withChecks, /- app\/unit: passed; on: a\.spec\.ts/);
      assert.doesNotMatch(withChecks, /exit 1/, 'the red run the green run replaced is stale');
      assert.doesNotMatch(withChecks, /No check recorded/);

      await mkdir(path.join(root, '.ambicode', 'context'), { recursive: true });
      await writeFile(path.join(root, '.ambicode', 'context', 'conventions.md'), '## Errors\nMoney goes through toCents().');
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withConventions = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.doesNotMatch(withConventions, /toCents|Project conventions/, 'a conventions.md left by an older init is not read; conventions arrive as policy rules');
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

  it('a brief that throws reports the whole stack, not its first three lines', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      await writeFile(path.join(reviewDir, 'result.json'), '{ not json');
      const out = run('brief', input) as { failed: { code: string; message: string } };
      assert.equal(out.failed.code, 'brief-failed');
      assert.match(out.failed.message, /SyntaxError/);
      assert.ok(out.failed.message.split(' | ').length > 3, out.failed.message);
      assert.match(out.failed.message, /brief\.mjs/, 'the frames name the script');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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

  it('brief lists all 35 test files the merge request changed', async () => {
    const specs = Array.from({ length: 35 }, (_, at) => ({ oldPath: `src/s${at}.spec.ts`, newPath: `src/s${at}.spec.ts`, changeKind: 'modified', addedLines: at + 1, removedLines: 0, exclusionReason: 'test', exclusionCode: 'test-file' }));
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], changedFiles: specs });
    try {
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      for (let at = 0; at < 35; at++) assert.ok(brief.includes(`- src/s${at}.spec.ts +${at + 1}/-0\n`), `test file ${at} is listed`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists the test files the merge request changed, with counts, before the diff, although it shows none of their content', async () => {
    const changed = (file: string, added: number, removed: number, exclusionReason: string | null, exclusionCode: string | null = null) => ({ oldPath: file, newPath: file, changeKind: 'modified', addedLines: added, removedLines: removed, exclusionReason, exclusionCode });
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], changedFiles: [changed('a.ts', 1, 1, null), changed('src/auth.service.spec.ts', 40, 2, 'worded however the classifier words it', 'test-file'), changed('dist/x.js', 3, 0, 'inside a dependency, build output, or version-control directory', 'excluded-directory')] });
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

  it('brief prints each requirement source exactly as the bundle holds it: the rendering happens once, in requirementSources, and nothing is dropped here', async () => {
    const rendered = 'key: VS-1\nfields.summary: Totals\nfields.customfield_10200:\nAC1: rounds to cents\nAC2: empty cart is zero';
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'J', title: 'Totals', content: rendered }, { id: 'P', title: 'Plain', content: 'Not json: sum them.' }], checks: [] });
    try {
      await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n');
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.ok(brief.includes(`### J: Totals\n${rendered}\n`));
      assert.match(brief, /### P: Plain\nNot json: sum them\.\n/);
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

  it('brief puts requirements, discussions and rules before the diff, and splits an oversized diff into parts of at most 32 KB with no line lost', async () => {
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
      const order = ['## Requirements', '## Policy rules', '## Changed files'].map((heading) => first.indexOf(heading));
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

  it('brief lists a related file as a path and its reason, never its content, however long the file and the diff are', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], omissions: [] });
    try {
      const body = (name: string) => Array.from({ length: 400 }, (_, at) => `export const ${name}${at} = ${at}; // ${'y'.repeat(100)}`).join('\n') + '\n';
      await mkdir(path.join(root, 'src'), { recursive: true });
      for (const file of ['sibling1.ts', 'sibling2.ts', 'sibling3.ts']) await writeFile(path.join(root, 'src', file), `export const sharedThing0 = 1;\nexport const sharedThing1 = 1;\n${body(file.replace(/\W/g, ''))}`);
      await writeFile(path.join(root, 'src', 'a.ts'), 'export const sharedThing = 1;\n');
      await withMap(input, 'src/sibling1.ts', 'src/sibling2.ts', 'src/sibling3.ts');
      const diff = (count: number) => `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,${count + 1} @@\n export const sharedThing = 1;\n${Array.from({ length: count }, (_, at) => `+export const sharedThing${at} = ${at}; // ${'z'.repeat(60)}`).join('\n')}\n`;
      for (const count of [150, 900]) {
        await writeFile(path.join(reviewDir, 'changed.diff'), diff(count));
        run('brief', input);
        const parts = await partsOf(reviewDir);
        const text = parts.join('\n');
        assert.deepEqual([...text.matchAll(/^- (src\/sibling\d\.ts) \(related: [^;]+; contains "sharedName"\)$/gm)].map((match) => match[1]), ['src/sibling1.ts', 'src/sibling2.ts', 'src/sibling3.ts'], `${count} diff lines: every related file is a path line`);
        assert.doesNotMatch(text, /sibling\dts\d/, 'no content of a related file');
        assert.equal(diffOf(parts).filter((line) => line.startsWith('+export const sharedThing')).length, count, 'the whole diff is there');
        assert.deepEqual(JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions, [], 'nothing was left out, so no scope note');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists only the checks of the reviewed route, the latest run per key, named by outcome; a failed one carries the pointer to its output file', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const check = (route: string, key: string, exit: number) => ({ kind: 'check', route, key, phase: 'green', exit, files: [], output: `.ambicode/tasks/t/checks/${key.replace('/', '-')}_${route}.log`, bytes: 1234 });
      const lines = [
        check('r-old', 'app/stale', 1),
        check('r-now', 'app/unit', 1), check('r-now', 'app/lint', 1), check('r-now', 'app/unit', 0),
        { kind: 'review', route: 'r-now', result: path.relative(root, path.join(reviewDir, 'result.json')) },
      ];
      await writeFile(path.join(input.taskDir, 'ledger.jsonl'), `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /- app\/unit: passed/);
      assert.match(brief, /^- app\/lint: FAILED; exit 1; 1234 bytes of output in \.ambicode\/tasks\/t\/checks\/app-lint_r-now\.log$/m);
      assert.doesNotMatch(brief, /last output|app\/unit[^\n]*bytes of output/, 'a passing check carries no pointer, and no output text is inlined');
      assert.doesNotMatch(brief, /app\/stale|app\/unit[^\n]*exit 1|green: exit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const modified = (file: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-a\n+b\n`;

  // The route's `search.map(review)` step saves its text beside the policy payload; the brief reads the related files from it, in rank order, and scans nothing itself.
  const withMap = (input: { steps: string }, ...rows: string[]) => writeFile(path.join(input.steps, '1-map-review.md'), `Map: legend\n{"candidates":${JSON.stringify(rows.map((file, at) => [file, 20 - at, ['contains "sharedName"']]))}}\n`);

  const added = (file: string, ...lines: string[]) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1,${lines.length} @@\n-a\n${lines.map((line) => `+${line}`).join('\n')}\n`;

  it('brief lists the map\'s files by path: the same-directory ones first, then the rest from any directory in map order, never a test, another language or a file of the diff', async () => {
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
      await withMap(input, 'pkg/far/helper.ts', 'pkg/far/half.ts', 'src/a/near.ts', 'pkg/far/third.ts', 'pkg/far/fourth.ts', 'pkg/far/fifth.ts', 'src/a/stub.ts', 'pkg/far/notes.md', 'src/a/foo.ts', 'src/a/foo.test.ts', 'src/a/lone.ts');
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`), 'export const commonWord = 2;') + added('src/a/lone.ts', 'export const loneChange = 1;'));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.match(section, /Related code the patch does not show, listed by path only: Read the ones you need for comparison, in the checkout\. Duplication of an existing helper and a sibling convention the change breaks are findings\./);
      const headers = [...section.matchAll(/^- (\S+) \((.+)\)$/gm)].map((match) => [match[1], match[2]]);
      assert.deepEqual(headers.map(([name]) => name), ['src/a/near.ts', 'src/a/stub.ts', 'pkg/far/helper.ts', 'pkg/far/half.ts', 'pkg/far/third.ts', 'pkg/far/fourth.ts', 'pkg/far/fifth.ts'], 'the same-directory files first although near.ts ranks third, then every other file in map order; a short file is listed like any other');
      assert.equal(headers[0]?.[1], 'related: next to foo.ts; contains "sharedName"', 'the header says where the file sits and why the map listed it');
      assert.equal(headers[2]?.[1], 'related: elsewhere in the repository; contains "sharedName"');
      assert.doesNotMatch(section, /notes\.md/, 'a .md file the map listed for a .ts change is not chosen');
      assert.doesNotMatch(section, /^- src\/a\/(foo|lone)\.ts/m, 'a file of the diff is shown by the diff, not as related');
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
      await withMap(input, 'src/a/foo.test.ts', 'src/a/foo.spec.ts', 'src/a/__tests__/helper.ts', 'src/a/foo_test.py', 'src/a/near.ts', 'pkg/far/helper.ts', 'pkg/far/helper.test.ts');
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`)) + added('src/a/lone.ts', 'export const loneChange = 1;') + added('src/a/foo.test.ts', 'export const keptTestHunk = 1;'));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.deepEqual([...section.matchAll(/^- (\S+) \(related/gm)].map((match) => match[1]), ['src/a/near.ts', 'pkg/far/helper.ts']);
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
      assert.match(section, /^## Existing merge request discussions \(untrusted, from other people\): do not repeat a point one already makes\n\n- src\/b\.ts:9 @bob: Is this tested\?\n  - @cy: not yet\n- general @dee: x{900}\n- src\/a\.ts:4 \(resolved\) @ann: old point\n\n$/);
      assert.ok(section.includes('x'.repeat(900)), 'a long body is whole');
      await writeFile(path.join(root, '.ambicode', 'tasks', 't', 'mr-discussions.json'), JSON.stringify({ discussions: Array.from({ length: 25 }, (_, at) => ({ path: `src/f${at}.ts`, line: at + 1, resolved: false, notes: [{ author: 'ann', body: `point ${at}` }] })) }));
      run('brief', input);
      const many = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      for (let at = 0; at < 25; at++) assert.ok(many.includes(`- src/f${at}.ts:${at + 1} @ann: point ${at}\n`), `discussion ${at} is listed`);

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

  it('brief lists every same-directory file first, even when other directories share more names, then every other file in map order', async () => {
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
      await withMap(input, 'far/p1.ts', 'far/p2.ts', 'far/p3.ts', 'far/p4.ts', 'far/p5.ts', 'src/a/a1.ts', 'src/a/a2.ts', 'src/a/a3.ts');
      await writeFile(path.join(reviewDir, 'changed.diff'), added('src/a/foo.ts', ...shared.map((name) => `export const ${name} = 2;`)));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      const names = [...section.matchAll(/^- (\S+) \(related/gm)].map((match) => match[1]);
      assert.deepEqual(names, ['src/a/a1.ts', 'src/a/a2.ts', 'src/a/a3.ts', 'far/p1.ts', 'far/p2.ts', 'far/p3.ts', 'far/p4.ts', 'far/p5.ts'], 'the same-directory files first although the map ranks them last; none is cut');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists all 20 related files the map gives (its TOP_ROWS bound), and records no omission', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [], omissions: [] });
    try {
      const changed = Array.from({ length: 4 }, (_, at) => `m${at}/f${at}.ts`);
      const near = changed.flatMap((_, at) => ['g', 'h', 'i', 'j', 'k'].map((name) => `m${at}/${name}${at}.ts`));
      for (const file of [...changed, ...near]) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n'); }
      await withMap(input, ...near);
      await writeFile(path.join(reviewDir, 'changed.diff'), changed.map((file, at) => added(file, `export const uniq${at} = 2;`)).join(''));
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.deepEqual([...brief.matchAll(/^- (\S+) \(related/gm)].map((match) => match[1]), near, '20 files: 5 for each changed file, all listed');
      assert.deepEqual(JSON.parse(await readFile(path.join(reviewDir, 'result.json'), 'utf8')).omissions ?? [], []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists a related path without reading the file: a 70 KB one and a binary one are path lines, one missing from the checkout is not listed; no map, no section', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const changed = ['m0/f0.ts', 'm1/f1.ts'];
      const body = (at: number) => [`export const uniq${at} = 1;`, ...Array.from({ length: 400 }, (_, line) => `line ${line + 1}`)].join('\n');
      const files = [...changed, 'm0/g0.ts', 'm0/h0.ts', 'm1/g1.ts', 'm1/h1.ts'];
      for (const [at, file] of files.entries()) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), body(at)); }
      await writeFile(path.join(root, 'm0', 'h0.ts'), Buffer.from([0x61, 0x00, 0x62, 0x0a]));
      await writeFile(path.join(root, 'm0', 'g0.ts'), `${'x'.repeat(100)}\n`.repeat(700));
      await writeFile(path.join(reviewDir, 'changed.diff'), changed.map((file, at) => added(file, `export const uniq${at} = 2;`)).join(''));
      run('brief', input);
      assert.doesNotMatch(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /## Related files/, 'no map: no section, not an empty one');
      await withMap(input, 'm0/g0.ts', 'm0/h0.ts', 'm1/g1.ts', 'm1/h1.ts', 'gone/missing.ts');
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      const section = brief.slice(brief.indexOf('## Related files'));
      assert.deepEqual([...section.matchAll(/^- (\S+) \(related/gm)].map((match) => match[1]), ['m0/g0.ts', 'm0/h0.ts', 'm1/g1.ts', 'm1/h1.ts']);
      assert.doesNotMatch(section, /line \d+|xxxx|```/, 'a long related file adds none of its lines');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  // `git grep -F -w -o` with 300 names took 45-52 s on a 4,891-file checkout (macOS, 171 s of CPU) and 60 s+ on the user's Windows machine; the in-process scan that replaced it read 4,891 files in 0.9 s.
  // The map step does the finding now, so the brief spawns no process at all: its cost no longer grows with the repository.
  it('brief spawns no process and scans no repository: the related files are the map step\'s', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' } });
    try {
      for (let at = 0; at < 30; at++) { await mkdir(path.join(root, 'pkg'), { recursive: true }); await writeFile(path.join(root, 'pkg', `f${at}.ts`), `export const a${at} = 1;\nexport const sharedName${at} = 2;\nexport const b${at} = 3;\n`); }
      await withMap(input, 'pkg/f0.ts');
      await writeFile(path.join(reviewDir, 'changed.diff'), `diff --git a/src/x.ts b/src/x.ts\n--- /dev/null\n+++ b/src/x.ts\n@@ -0,0 +1 @@\n+export const sharedName0 = 1;\n`);
      const log = path.join(root, 'spawns.log');
      const preload = path.join(root, 'count-spawns.mjs');
      await writeFile(preload, `import cp from 'node:child_process'; import { appendFileSync, writeFileSync } from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';\nwriteFileSync(${JSON.stringify(log)}, '');\nconst real = cp.execFileSync;\ncp.execFileSync = (file, args, ...rest) => { appendFileSync(${JSON.stringify(log)}, [file, ...(args ?? [])].join(' ') + '\\n'); return real(file, args, ...rest); };\nsyncBuiltinESMExports();\n`);
      const out = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, path.join(REPO_ROOT, 'skills', 'review', 'scripts', 'brief.mjs')], { input: JSON.stringify({ testPatterns: TEST_PATH_PATTERNS.map((pattern) => pattern.source), ...input }), encoding: 'utf8' });
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual((await readFile(log, 'utf8')).split('\n').filter(Boolean), []);
      assert.match(await readFile(path.join(reviewDir, 'brief.md'), 'utf8'), /^- pkg\/f0\.ts \(related: elsewhere in the repository; contains "sharedName"\)$/m, 'the map\'s file is listed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
