import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReviewResult } from '#types/modules/review';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { ReviewStore } from '../publication/store.ts';
import { reopenCommand } from './reopen.ts';
import { createPageServer } from './server.ts';
import { AUTHORITY, CountingIds, FakeClock, form, openPage, ORIGIN, templatesDirectory } from '#testing/fixtures/page-harness';
import { FakeProvider } from '#testing/fakes/fake-provider';
import { finding, publicationPositions, reviewResult } from '#testing/fixtures/review-fixture';
import { METRICS_FILE, recordSelection, selectionRows, type SelectionRow } from './selection-metrics.ts';
import type { FileSystem } from '#types/platform/ports';
import type { ParsedSubmission, PageModel } from '../types/page.ts';

const AT = '2026-09-20T12:00:00.000Z';

const model = (cards: { id: string; publishable: boolean; draft: string }[]): PageModel => ({ findings: cards }) as unknown as PageModel;
const submission = (selected: string[], drafts: Record<string, string>): ParsedSubmission =>
  ({ kind: 'ok', submissionId: 's1', selected: new Set(selected), drafts: new Map(Object.entries(drafts)) });
const outcome = (states: Record<string, string>) =>
  ({ submissionId: 's1', submittedAt: AT, stopped: false, stoppedReason: null, revisionState: null, outcomes: Object.entries(states).map(([findingId, state]) => ({ findingId, state, body: '', at: AT })) }) as never;

describe('selection rows (08-M2)', () => {
  const result = reviewResult({
    findings: [
      finding({ id: 'f-1', ruleRefs: ['rule-a', 'rule-b'], suggestedComment: 'one' }),
      finding({ id: 'f-2', suggestedComment: 'two' }),
      finding({ id: 'f-3', suggestedComment: 'three' }),
      finding({ id: 'f-4', suggestedComment: 'four' }),
      finding({ id: 'f-5', suggestedComment: 'five' }),
    ],
  });
  const rows = selectionRows({
    at: AT,
    result,
    model: model([
      { id: 'f-1', publishable: true, draft: 'one' },
      { id: 'f-2', publishable: false, draft: 'two' },
      { id: 'f-3', publishable: true, draft: 'three' },
      { id: 'f-4', publishable: true, draft: 'four' },
    ]),
    submission: submission(['f-1', 'f-3', 'f-4'], { 'f-1': 'one', 'f-3': 'three, reworded', 'f-4': 'four', 'f-2': 'two' }),
    outcome: outcome({ 'f-1': 'published', 'f-3': 'already-published', 'f-4': 'failed' }),
  });
  const row = (id: string): SelectionRow => rows.find((entry) => entry.findingId === id)!;

  it('08-M2: one row per finding of the result, in order, with the review id and time', () => {
    assert.deepEqual(rows.map((entry) => entry.findingId), ['f-1', 'f-2', 'f-3', 'f-4', 'f-5']);
    assert.ok(rows.every((entry) => entry.at === AT && entry.reviewId === result.reviewId));
  });

  it('08-M2: offered, selected, unedited and published', () => {
    assert.deepEqual([row('f-1').offered, row('f-1').selected, row('f-1').edited, row('f-1').posted], [true, true, false, true]);
  });

  it('08-M2: edited body and already-published count as posted', () => {
    assert.deepEqual([row('f-3').offered, row('f-3').selected, row('f-3').edited, row('f-3').posted], [true, true, true, true]);
  });

  it('08-M2: selected but failed is not posted', () => {
    assert.deepEqual([row('f-4').selected, row('f-4').posted], [true, false]);
  });

  it('08-M2: not offered, not selected, unedited draft resubmitted is all false', () => {
    assert.deepEqual([row('f-2').offered, row('f-2').selected, row('f-2').edited, row('f-2').posted], [false, false, false, false]);
  });

  it('08-M2: a finding absent from the page is not offered, has no draft edit and no outcome', () => {
    assert.deepEqual([row('f-5').offered, row('f-5').selected, row('f-5').edited, row('f-5').posted], [false, false, false, false]);
  });

  it('08-M2: rule is the first rule ref or null', () => {
    assert.deepEqual([row('f-1').rule, row('f-2').rule], ['rule-a', null]);
  });

  it('08-M2: an edit of an unselected finding is recorded as edited and not posted', () => {
    const [only] = selectionRows({
      at: AT,
      result: reviewResult({ findings: [finding({ id: 'f-9', suggestedComment: 'nine' })] }),
      model: model([{ id: 'f-9', publishable: true, draft: 'nine' }]),
      submission: submission([], { 'f-9': 'nine!' }),
      outcome: outcome({}),
    });
    assert.deepEqual([only!.selected, only!.edited, only!.posted], [false, true, false]);
  });
});

const rowsOf = (...ids: string[]): SelectionRow[] => ids.map((id, index) => ({ at: AT, reviewId: 'r-1', findingId: id, rule: null, offered: true, selected: index === 0, edited: false, posted: index === 0 }));
const written = (result: object = reviewResult()): string => `${JSON.stringify(result, null, 2)}\n`;

async function withDirectory(body: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-test-metrics-'));
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('recordSelection (08-M3)', () => {
  it('08-M3: appends the rows to the nearest .ambicode ancestor and one selection element to result.json', async () => {
    await withDirectory(async (root) => {
      const directory = path.join(root, '.ambicode', 'reviews', 'r-1');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'result.json'), written());
      const appended: string[] = [];
      const fs: FileSystem = { ...nodeFileSystem, appendText: async (target, text) => { appended.push(target); await nodeFileSystem.appendText(target, text); } };
      await recordSelection(fs, directory, rowsOf('f-1', 'f-2'));
      assert.deepEqual(appended, [path.join(root, '.ambicode', METRICS_FILE)]);
      const lines = (await readFile(path.join(root, '.ambicode', METRICS_FILE), 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line) as SelectionRow);
      assert.deepEqual(lines, rowsOf('f-1', 'f-2'));
      assert.deepEqual(Object.keys(lines[0]!), ['at', 'reviewId', 'findingId', 'rule', 'offered', 'selected', 'edited', 'posted']);
      const saved = ReviewResult.parse(JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8')));
      assert.deepEqual(saved.selection, [{ submittedAt: AT, rows: [{ findingId: 'f-1', offered: true, selected: true, edited: false, posted: true }, { findingId: 'f-2', offered: true, selected: false, edited: false, posted: false }] }]);
      assert.deepEqual((await readdir(directory)).sort(), ['result.json']);
    });
  });

  it('08-M3: a second submit appends a second line group and a second selection element', async () => {
    await withDirectory(async (root) => {
      const directory = path.join(root, '.ambicode', 'reviews', 'r-1');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'result.json'), written());
      await recordSelection(nodeFileSystem, directory, rowsOf('f-1'));
      await recordSelection(nodeFileSystem, directory, rowsOf('f-1', 'f-2'));
      const saved = ReviewResult.parse(JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8')));
      assert.equal(saved.selection?.length, 2);
      assert.equal((await readFile(path.join(root, '.ambicode', METRICS_FILE), 'utf8')).trimEnd().split('\n').length, 3);
    });
  });

  it('08-M3: result.json is written temp-then-rename', async () => {
    await withDirectory(async (root) => {
      const directory = path.join(root, '.ambicode', 'reviews', 'r-1');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'result.json'), written());
      const calls: string[] = [];
      const fs: FileSystem = {
        ...nodeFileSystem,
        writeText: async (target, text) => { calls.push(`write ${path.basename(target)}`); await nodeFileSystem.writeText(target, text); },
        rename: async (from, to) => { calls.push(`rename ${path.basename(from)} ${path.basename(to)}`); await nodeFileSystem.rename(from, to); },
      };
      await recordSelection(fs, directory, rowsOf('f-1'));
      assert.equal(calls.length, 2);
      assert.match(calls[0]!, /^write result\.json\./);
      assert.match(calls[1]!, /^rename result\.json\.\S+ result\.json$/);
    });
  });

  it('08-M3: a review directory outside .ambicode writes only result.json', async () => {
    await withDirectory(async (root) => {
      const directory = path.join(root, 'plain', 'r-1');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'result.json'), written());
      await recordSelection(nodeFileSystem, directory, rowsOf('f-1'));
      assert.deepEqual((await readdir(directory)).sort(), ['result.json']);
      assert.deepEqual(await readdir(path.join(root, 'plain')), ['r-1']);
      assert.deepEqual((await readdir(root)).sort(), ['plain']);
      assert.equal(ReviewResult.parse(JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8'))).selection?.length, 1);
    });
  });

  it('08-M3: empty rows write nothing', async () => {
    await withDirectory(async (root) => {
      const directory = path.join(root, '.ambicode', 'reviews', 'r-1');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'result.json'), written());
      const before = await readFile(path.join(directory, 'result.json'), 'utf8');
      await recordSelection(nodeFileSystem, directory, []);
      assert.equal(await readFile(path.join(directory, 'result.json'), 'utf8'), before);
      assert.deepEqual(await readdir(path.join(root, '.ambicode')), ['reviews']);
    });
  });
});

describe('result.json without selection (D9)', () => {
  it('D9: parses and re-serializes byte-identically under ReviewResult', () => {
    const text = written(ReviewResult.parse(reviewResult()));
    const parsed = ReviewResult.parse(JSON.parse(text));
    assert.equal(parsed.selection, undefined);
    assert.ok(`${JSON.stringify(parsed, null, 2)}\n` === text, 're-serialized bytes differ');
  });
});

async function startServer(options: { failMetrics?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-test-page-'));
  const directory = path.join(root, '.ambicode', 'reviews', 'review-1');
  await mkdir(directory, { recursive: true });
  const result = reviewResult();
  await writeFile(path.join(directory, 'result.json'), written(result));
  const clock = new FakeClock();
  const logs: string[] = [];
  const fs: FileSystem = options.failMetrics === true ? { ...nodeFileSystem, appendText: async () => { throw new Error('disk full'); } } : nodeFileSystem;
  const store = new ReviewStore(nodeFileSystem, clock, directory);
  const provider = new FakeProvider();
  const server = await createPageServer({
    fs, clock, ids: new CountingIds('m-'), store, result, positions: publicationPositions(result), record: await store.readPublication(result.reviewId), provider,
    templatesDirectory, idleTimeoutSeconds: 1800, reopenCommand: reopenCommand(result.reviewId), authority: AUTHORITY, processId: process.pid, log: (line) => logs.push(line),
  });
  return { root, directory, server, provider, logs, store, result, dispose: async () => { await server.stop('test finished'); await rm(root, { recursive: true, force: true }); } };
}

async function submit(s: Awaited<ReturnType<typeof startServer>>, beforePost: () => void = () => {}) {
  const harness = { server: s.server } as never;
  const page = await openPage(harness);
  beforePost();
  return s.server.app.inject({
    method: 'POST',
    url: '/publish',
    headers: { host: AUTHORITY, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', cookie: page.cookies },
    payload: form({ _csrf: page.csrfToken, submissionId: page.submissionId, 'body_f-aaaa': 'Please seed the reduce.', 'body_f-bbbb': 'A second comment.', 'select_f-aaaa': 'on' }),
  });
}

describe('selection metrics through the page server (08-M1)', () => {
  it('08-M1: a submit writes one row per finding to metrics.jsonl and one selection element to result.json', async () => {
    const s = await startServer();
    try {
      const response = await submit(s);
      assert.equal(response.statusCode, 303);
      const lines = (await readFile(path.join(s.root, '.ambicode', METRICS_FILE), 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line) as SelectionRow);
      assert.deepEqual(lines.map((row) => row.findingId), ['f-aaaa', 'f-bbbb', 'f-cccc']);
      const byId = new Map(lines.map((row) => [row.findingId, row]));
      assert.deepEqual([byId.get('f-aaaa')!.offered, byId.get('f-aaaa')!.selected, byId.get('f-aaaa')!.posted], [true, true, true]);
      assert.deepEqual([byId.get('f-bbbb')!.selected, byId.get('f-bbbb')!.posted], [false, false]);
      assert.deepEqual([byId.get('f-cccc')!.offered, byId.get('f-cccc')!.selected], [false, false]);
      assert.equal(s.provider.published.length, 1);
      const saved = ReviewResult.parse(JSON.parse(await readFile(path.join(s.directory, 'result.json'), 'utf8')));
      assert.equal(saved.selection?.length, 1);
      assert.deepEqual(saved.selection![0]!.rows.map((row) => row.findingId), ['f-aaaa', 'f-bbbb', 'f-cccc']);
    } finally {
      await s.dispose();
    }
  });

  it('08-M1: a failing metrics write is logged and the submit still succeeds and publishes', async () => {
    const s = await startServer({ failMetrics: true });
    try {
      const response = await submit(s);
      assert.equal(response.statusCode, 303);
      assert.equal(s.provider.published.length, 1);
      assert.ok(s.logs.some((line) => /selection metrics not recorded: disk full/.test(line)));
      assert.equal((await s.store.readPublication(s.result.reviewId)).submissions.length, 1);
    } finally {
      await s.dispose();
    }
  });
});

describe('selection rows that fail to build (08-M1)', () => {
  it('08-M1: a throw while building the selection rows is logged and the submit still succeeds and publishes', async () => {
    const s = await startServer();
    try {
      const response = await submit(s, () => { (s.result.findings[0] as { ruleRefs: unknown }).ruleRefs = undefined; });
      assert.equal(response.statusCode, 303);
      assert.equal(s.provider.published.length, 1);
      assert.ok(s.logs.some((line) => /selection metrics not recorded:/.test(line)), s.logs.join(' | '));
      assert.equal((await s.store.readPublication(s.result.reviewId)).submissions.length, 1);
    } finally {
      await s.dispose();
    }
  });
});

describe('publication code never writes metrics (08-M4)', () => {
  it('08-M4: nothing under src/publication imports or names the metrics module or file', async () => {
    const directory = path.join(import.meta.dirname, '..', 'publication');
    const sources = (await readdir(directory)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    assert.ok(sources.length > 0);
    for (const name of sources) {
      const text = await readFile(path.join(directory, name), 'utf8');
      assert.ok(!/selection-metrics|metrics\.jsonl|recordSelection|METRICS_FILE/.test(text), name);
    }
  });
});
