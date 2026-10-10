import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { initConfig } from '#testing/fixtures/init-config';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { createRuntime } from '#composition/root';
import { parseHunks } from '#platform/git/diff';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { isAmbicodeError } from '#util/errors';
import { validateFindings } from './findings/validate.ts';
import { readLedger } from '#platform/ledger/ledger';
import type { Runtime } from '#types/composition';
import type { DiffFile } from '#types/platform/git';

const JIRA = 'https://example.atlassian.net/browse/ORD-17';
const CONFLUENCE = 'https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders';

interface Fixture {
  repo: TempRepo;
  runtime: Runtime;
  dispose(): Promise<void>;
}

async function fixture(options: { source?: string } = {}): Promise<Fixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders.ts', 'export function total(amounts: number[]) {\n  return amounts.length;\n}\n');
  await repo.commitAll('initial');

  const setup = await createRuntime({ cwd: repo.root });
  await initConfig(setup);

  await repo.write(
    'src/orders.ts',
    options.source ??
      'export function total(amounts: number[]) {\n  return amounts.reduce((a, b) => a + b, 0);\n}\n',
  );

  const runtime = await createRuntime({ cwd: repo.root });
  return {
    repo,
    runtime,
    dispose: async () => {
      await repo.dispose();
    },
  };
}

async function writeEvidence(repo: TempRepo, document: unknown): Promise<string> {
  await repo.write('evidence.json', `${JSON.stringify(document, null, 2)}\n`);
  return path.join(repo.root, 'evidence.json');
}

function retrieved(url: string, id: string, content: string) {
  return {
    id,
    url,
    title: `Requirement ${id}`,
    retrievedAt: '2026-09-20T09:00:00.000Z',
    sourceVersion: '3',
    content,
    citations: [],
    status: 'retrieved' as const,
    failureReason: null,
    retrievedVia: 'mcp__atlassian__getJiraIssue',
  };
}

async function review(runtime: Runtime, argv: string[]) {
  return await runReview(runtime, parseArgs('review', argv, REVIEW_OPTIONS));
}

function failure(run: () => Promise<unknown>): Promise<{ code: string; details: string[] }> {
  return run().then(
    () => assert.fail('expected the review to be refused'),
    (error: unknown) => {
      assert.ok(isAmbicodeError(error), `expected an AmbicodeError, got ${String(error)}`);
      return { code: error.code, details: error.details };
    },
  );
}

describe('U16 requirement modes end to end', () => {
  it('reviews without a requirement URL and labels the result a quality review', async () => {
    const context = await fixture();
    try {
            const output = await review(context.runtime, []);

      assert.equal(output.result.requirementMode, 'quality-review');
      assert.deepEqual(output.result.requirements, []);
      assert.ok(
        output.reviewDirectory.includes(path.join('.ambicode', 'reviews')),
        output.reviewDirectory,
      );
      assert.match(
        output.result.omissions.join('\n'),
        /No requirement was supplied, so this is a quality review/,
      );
    } finally {
      await context.dispose();
    }
  });

  it('carries several requirements into the result', async () => {
    const context = await fixture();
    try {
      const evidence = await writeEvidence(context.repo, {
        mcpServer: null,
        sources: [
          retrieved(JIRA, 'ORD-17', 'Totals sum the amounts.'),
          retrieved(CONFLUENCE, 'ENG-orders', 'Totals are computed once, at the edge.'),
        ],
        conflicts: [],
      });

            const output = await review(
        context.runtime,
        ['--requirement', JIRA, '--requirement', CONFLUENCE, '--evidence', evidence],
      );

      assert.equal(output.result.requirementMode, 'requirement-based');
      assert.ok(
        output.reviewDirectory.includes(path.join('.ambicode', 'reviews', 'ORD-17')),
        output.reviewDirectory,
      );
      
      assert.deepEqual(
        output.result.requirements.map((source) => source.id),
        ['ORD-17', 'ENG-orders'],
      );
    } finally {
      await context.dispose();
    }
  });

  it('blocks the review when a supplied requirement was not retrieved', async () => {
    const context = await fixture();
    try {
      const evidence = await writeEvidence(context.repo, {
        mcpServer: null,
        sources: [{ ...retrieved(JIRA, 'ORD-17', ''), status: 'forbidden', failureReason: 'no read access' }],
        conflicts: [],
      });
      
      const error = await failure(() =>
        review(context.runtime, ['--requirement', JIRA, '--evidence', evidence]),
      );
      assert.equal(error.code, 'requirements-not-retrieved');
      assert.equal(await nodeFileSystem.exists(path.join(context.repo.root, '.ambicode', 'reviews')), false);
    } finally {
      await context.dispose();
    }
  });

});

describe('U17 location validation', () => {
  const section = [
    'diff --git a/src/orders.ts b/src/orders.ts',
    'index 1111111..2222222 100644',
    '--- a/src/orders.ts',
    '+++ b/src/orders.ts',
    '@@ -1,3 +1,3 @@',
    ' export function total(amounts: number[]) {',
    '-  return amounts.length;',
    '+  return amounts.reduce((a, b) => a + b, 0);',
    ' }',
  ].join('\n');

  const file: DiffFile = {
    oldPath: 'src/orders.ts',
    newPath: 'src/orders.ts',
    changeKind: 'modified',
    binary: false,
    addedLines: 1,
    removedLines: 1,
    hunks: parseHunks(section),
    patchSection: section,
  };

  function candidate(location: { oldPath: string | null; newPath: string | null; side: 'old' | 'new'; line: number }) {
    return {
      risk: 'high' as const,
      confidence: 'high' as const,
      category: 'correctness',
      location,
      explanation: 'x',
      suggestedComment: 'y',
      ruleRefs: [] as string[],
      requirementRefs: [] as string[],
    };
  }

  function run(findings: ReturnType<typeof candidate>[], overrides: Partial<Parameters<typeof validateFindings>[0]> = {}) {
    return validateFindings({
      output: { findings, coverageNotes: [] },
      files: [file],
      snapshotText: new Map([
        ['src/orders.ts', 'export function total(amounts: number[]) {\n  return amounts.reduce((a, b) => a + b, 0);\n}\n'],
      ]),
      maxFindings: 7,
      knownRuleIds: new Set(['common-quality/reuse-before-reimplementing']),
      knownRequirementIds: new Set(['ORD-17']),
      ...overrides,
    });
  }

  function expectOk(result: ReturnType<typeof validateFindings>) {
    assert.equal(result.kind, 'ok', `expected a valid result, got ${JSON.stringify(result)}`);
    return result.kind === 'ok' ? result.findings : [];
  }

  function expectInvalid(result: ReturnType<typeof validateFindings>) {
    assert.equal(result.kind, 'invalid', 'expected the reviewer result to be invalid');
    return result.kind === 'invalid' ? result : { reason: '', rejections: [] as string[] };
  }

  it('makes a path that is not in the reviewed change an invalid reviewer result', () => {
    const result = expectInvalid(
      run([candidate({ oldPath: 'src/invented.ts', newPath: 'src/invented.ts', side: 'new', line: 2 })]),
    );
    assert.match(result.rejections.join('\n'), /is not a file in this review/);
    assert.match(result.reason, /could not be verified against the pinned change/);
  });

  it('makes a line the change does not address an invalid reviewer result', () => {
    const result = expectInvalid(
      run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 99 })]),
    );
    assert.match(result.rejections.join('\n'), /line 99 is not present on the new side/);
  });

  it('does not expose the surviving findings when one location is unverifiable', () => {
    const result = expectInvalid(
      run([
        candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }),
        candidate({ oldPath: 'src/invented.ts', newPath: 'src/invented.ts', side: 'new', line: 1 }),
      ]),
    );
    assert.equal(result.rejections.length, 1);
    assert.ok(!('findings' in result));
  });

  it('rejects a side the location does not name a path for', () => {
    const result = expectInvalid(
      run([candidate({ oldPath: null, newPath: 'src/orders.ts', side: 'old', line: 2 })]),
    );
    assert.match(result.rejections.join('\n'), /no oldPath was given/);
  });

  it('quotes two lines either side of the location and marks the commented line', () => {
    const longer = `${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n')}\n`;
    const findings = expectOk(
      run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 })], {
        snapshotText: new Map([['src/orders.ts', longer]]),
      }),
    );
    // Line 2 has only one line above it, so the window is clipped at the top.
    assert.equal(findings[0]?.evidence, ['1: line 1', '2: line 2 <---', '3: line 3', '4: line 4'].join('\n'));

    const section = [
      'diff --git a/src/orders.ts b/src/orders.ts',
      '--- a/src/orders.ts',
      '+++ b/src/orders.ts',
      '@@ -10 +10 @@',
      '-old line 10',
      '+line 10',
    ].join('\n');
    const middle: DiffFile = { ...file, hunks: parseHunks(section), patchSection: section };
    const centred = expectOk(
      run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 10 })], {
        files: [middle],
        snapshotText: new Map([['src/orders.ts', longer]]),
      }),
    );
    assert.equal(
      centred[0]?.evidence,
      ['8: line 8', '9: line 9', '10: line 10 <---', '11: line 11', '12: line 12'].join('\n'),
    );

    // A CRLF checkout keeps the marker on its line, and the final newline adds no empty line.
    const tail = expectOk(
      run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 })], {
        snapshotText: new Map([['src/orders.ts', 'a\r\nb\r\nc\r\n']]),
      }),
    );
    assert.equal(tail[0]?.evidence, ['1: a', '2: b <---', '3: c'].join('\n'));
  });

  it('accepts an old-side location and quotes the removed line from the diff', () => {
    const findings = expectOk(
      run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'old', line: 2 })]),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.evidence ?? '', /amounts\.length/);
  });

  it('takes the paths from the bundle rather than from the model', () => {
    const findings = expectOk(
      run([candidate({ oldPath: null, newPath: 'src/orders.ts', side: 'new', line: 2 })]),
    );
    assert.equal(findings[0]?.location.oldPath, 'src/orders.ts');
  });

  it('invalidates the result rather than rewriting a reference it does not know', () => {
    const result = expectInvalid(
      run([
        {
          ...candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }),
          ruleRefs: ['invented/rule', 'common-quality/reuse-before-reimplementing'],
          requirementRefs: ['NOPE-1'],
        },
      ]),
    );
    assert.match(result.rejections.join('\n'), /invented\/rule/);
    assert.match(result.rejections.join('\n'), /NOPE-1/);
  });

  it('keeps references the review does know', () => {
    const findings = expectOk(
      run([
        {
          ...candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }),
          ruleRefs: ['common-quality/reuse-before-reimplementing'],
          requirementRefs: ['ORD-17'],
        },
      ]),
    );
    assert.deepEqual(findings[0]?.ruleRefs, ['common-quality/reuse-before-reimplementing']);
    assert.deepEqual(findings[0]?.requirementRefs, ['ORD-17']);
  });

  it('rejects an oversized result instead of trimming it into a complete-looking one', () => {
    const many = Array.from({ length: 4 }, (_, index) => ({
      ...candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }),
      suggestedComment: `comment ${index}`,
    }));
    const result = expectInvalid(run(many, { maxFindings: 2 }));
    assert.match(result.reason, /above the configured limit of 2/);
    assert.match(result.reason, /does not silently keep the first 2/);
  });

  it('numbers findings f1, f2 in the order the reviewer gave them', () => {
    const at = (line: number) => candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line });
    assert.deepEqual(expectOk(run([at(2), at(3)])).map((finding) => finding.id), ['f1', 'f2']);
  });
});

describe('B8 an applicable policy diagnostic becomes an explicit coverage omission, not a silent drop', () => {
  it('surfaces an unreadable applicable review prompt as an omission and keeps the reviewer running, but marks the result partial', async () => {
    const context = await fixture();
    try {
      await context.repo.write(
        '.ambicode/policies/broken-review.yaml',
        [
          'schemaVersion: 1',
          'id: broken-review',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [review]',
          'source: { location: "test" }',
          'prompts: [{ stage: before-review, file: "./missing.md" }]',
        ].join('\n') + '\n',
      );
      const configPath = path.join(context.repo.root, '.ambicode', 'config.yaml');
      const config = await nodeFileSystem.readText(configPath);
      assert.doesNotMatch(config, /policyFiles/);
      await nodeFileSystem.writeText(
        configPath,
        config.replace(/^(\s+packs: .*)$/m, '$1\n    policyFiles: [".ambicode/policies/broken-review.yaml"]'),
      );

            const output = await review(context.runtime, []);

      assert.ok(
        output.result.omissions.some((entry) => entry.includes('path-missing')),
        `expected an omission naming the unreadable prompt; got: ${JSON.stringify(output.result.omissions)}`,
      );
      assert.equal(output.result.status, 'partial');
    } finally {
      await context.dispose();
    }
  });

  it('surfaces an error from any loaded pack as an omission, applicable to the review or not (diagnostics carry no pack activity to filter by)', async () => {
    const context = await fixture();
    try {
      await context.repo.write(
        '.ambicode/policies/broken-plan-only.yaml',
        [
          'schemaVersion: 1',
          'id: broken-plan-only',
          'authority: team',
          'appliesTo: ["**/*"]',
          'activities: [plan]',
          'source: { location: "test" }',
          'prompts: [{ stage: before-work, file: "./missing.md" }]',
        ].join('\n') + '\n',
      );
      const configPath = path.join(context.repo.root, '.ambicode', 'config.yaml');
      const config = await nodeFileSystem.readText(configPath);
      await nodeFileSystem.writeText(
        configPath,
        config.replace(/^(\s+packs: .*)$/m, '$1\n    policyFiles: [".ambicode/policies/broken-plan-only.yaml"]'),
      );

            const output = await review(context.runtime, []);

      assert.ok(output.result.omissions.some((entry) => entry.includes('path-missing')), JSON.stringify(output.result.omissions));
    } finally {
      await context.dispose();
    }
  });
});

describe('a review with no reviewer yet', () => {
  it('writes the evidence bundle and reports the reviewer as pending, with no reviewer run', async () => {
    const context = await fixture();
    try {
      const output = await review(context.runtime, []);
      assert.equal(output.result.reviewer, null);
      assert.deepEqual(output.result.findings, []);
      assert.equal(output.result.status, 'partial');
      assert.equal(output.result.statusReason, 'reviewer pending: run the ambicode:reviewer subagent, then `review record`');
      assert.ok(await context.runtime.fs.exists(output.resultPath));
      assert.ok(await context.runtime.fs.exists(output.reportPath));
      const diff = await context.runtime.fs.readText(path.join(output.reviewDirectory, 'changed.diff'));
      assert.match(diff, /\+  return amounts\.reduce/);
      assert.match(await context.runtime.fs.readText(path.join(output.reviewDirectory, 'files.txt')), /src\/orders\.ts/);
      assert.equal(await context.runtime.fs.exists(path.join(output.reviewDirectory, 'files')), false, 'nothing is mirrored');
    } finally {
      await context.dispose();
    }
  });

  it('lists the task\'s recorded checks in result.checks and has none outside a task', async () => {
    const context = await fixture();
    try {
      const dir = path.join(context.repo.root, '.ambicode', 'tasks', 'ORD-17');
      await nodeFileSystem.mkdirp(dir);
      await nodeFileSystem.writeText(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({ id: 'L1', at: '2026-09-20T09:00:00.000Z', kind: 'check', key: 'app/unit', phase: 'green', exit: 0, files: ['src/orders.test.ts'], tail: '', ms: 5 })}\n`);
      const inTask = await review(context.runtime, ['--task', 'ORD-17']);
      assert.deepEqual(inTask.result.checks, [{ key: 'app/unit', phase: 'green', exit: 0, files: ['src/orders.test.ts'] }]);
      assert.deepEqual((await review(context.runtime, [])).result.checks, []);
    } finally {
      await context.dispose();
    }
  });

  it('refuses a merge-request target with mr-diff-missing until the MCP diff is captured', async () => {
    const context = await fixture();
    try {
      const refused = await failure(() => review(context.runtime, ['--mr', 'https://gitlab.example.com/g/p/-/merge_requests/1']));
      assert.equal(refused.code, 'mr-diff-missing');
    } finally {
      await context.dispose();
    }
  });
});

describe('a review inside a task leaves evidence in the task ledger', () => {
  it('records status and reviewerRan false, and writes none for a run with no task', async () => {
    const context = await fixture();
    try {
      const inTask = await review(context.runtime, ['--task', 'ORD-17']);
      const ledger = await readLedger(nodeFileSystem, path.join(context.repo.root, '.ambicode', 'tasks', 'ORD-17'));
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0]?.kind, 'review');
      assert.equal(ledger[0]?.reviewId, inTask.reviewId);
      assert.equal(ledger[0]?.status, inTask.result.status);
      assert.equal(ledger[0]?.reviewerRan, false);

      const loose = await review(context.runtime, []);
      assert.ok(!(await nodeFileSystem.exists(path.join(context.repo.root, '.ambicode', 'tasks', 'ledger.jsonl'))));
      assert.ok(!loose.reviewDirectory.includes(`${path.sep}task${path.sep}`));
    } finally {
      await context.dispose();
    }
  });
});
