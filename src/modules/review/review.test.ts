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
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });

  it('carries several requirements and their provenance into the result', async () => {
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
        output.reviewDirectory.includes(path.join('.ambicode', 'task', 'ORD-17', 'reviews')),
        output.reviewDirectory,
      );
      assert.ok(!path.basename(output.reviewDirectory).includes('ORD-17'), output.reviewId);
      assert.deepEqual(
        output.result.requirements.map((source) => source.id),
        ['ENG-orders', 'ORD-17'],
      );
      const kinds = new Set(output.result.provenance.map((entry) => entry.kind));
      assert.ok(kinds.has('requirement'));
      assert.ok(kinds.has('config'));

      await nodeFileSystem.remove(output.snapshotDirectory);
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
      assert.equal(error.code, 'requirements-unavailable');
      assert.equal(await nodeFileSystem.exists(path.join(context.repo.root, '.ambicode', 'reviews')), false);
    } finally {
      await context.dispose();
    }
  });

  it('stops on contradictory requirements before any check or model call', async () => {
    const context = await fixture();
    try {
      const evidence = await writeEvidence(context.repo, {
        mcpServer: null,
        sources: [
          retrieved(JIRA, 'ORD-17', 'Totals sum the amounts.'),
          retrieved(CONFLUENCE, 'ENG-orders', 'Totals count the amounts.'),
        ],
        conflicts: [
          { summary: 'one document says sum, the other says count', sourceIds: ['ORD-17', 'ENG-orders'] },
        ],
      });
      
      const error = await failure(() =>
        review(
          context.runtime,
          ['--requirement', JIRA, '--requirement', CONFLUENCE, '--evidence', evidence],
      ),
      );
      assert.equal(error.code, 'requirements-conflicting');
      // The review directory is created after the checks are planned, so its
      // absence shows nothing downstream of requirements ran.
      assert.equal(await nodeFileSystem.exists(path.join(context.repo.root, '.ambicode', 'reviews')), false);
    } finally {
      await context.dispose();
    }
  });
});

describe('files that rely on the change', () => {
  async function dependentsFixture(): Promise<Fixture> {
    const repo = await TempRepo.create();
    await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
    await repo.write('src/pricing/pricing.service.ts', 'export function computeShipping(weight: number) {\n  return weight * 2;\n}\n');
    await repo.write('src/checkout/checkout.ts', "import { computeShipping } from '../../pricing/pricing.service';\nexport const fee = computeShipping(3);\n");
    await repo.write('src/checkout/checkout.spec.ts', "import { computeShipping } from '../../pricing/pricing.service';\ncomputeShipping(1);\n");
    await repo.write('docs/pricing.md', 'computeShipping is documented here\n');
    await repo.write('src/other/legacy.ts', 'export const legacy = 1;\n');
    for (let index = 0; index < 20; index += 1) await repo.write(`src/other/f${index}.ts`, `export const other${index} = ${index};\n`);
    await repo.commitAll('initial');
    await initConfig(await createRuntime({ cwd: repo.root }));
    await repo.write('src/pricing/pricing.service.ts', 'export function shippingFee(weight: number) {\n  return weight * 3;\n}\n');
    return { repo, runtime: await createRuntime({ cwd: repo.root }), dispose: () => repo.dispose() };
  }

  it('gives the reviewer the unchanged source files that use a name the change removed, and says so', async () => {
    const context = await dependentsFixture();
    try {
            const output = await review(context.runtime, []);

      assert.ok(await nodeFileSystem.exists(path.join(output.snapshotDirectory, 'files', 'src/checkout/checkout.ts')), output.result.omissions.join(' | '));
      assert.ok(!(await nodeFileSystem.exists(path.join(output.snapshotDirectory, 'files', 'docs/pricing.md'))), 'prose is not a dependent');
      assert.ok(
        output.result.omissions.some((line) => line.includes('mention names this change adds, removes or renames') && line.includes('src/checkout/checkout.ts')),
        output.result.omissions.join(' | '),
      );
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });

  it('finds them for a branch review too, reading the committed revision', async () => {
    const context = await dependentsFixture();
    try {
      await context.repo.commitAll('rename the function');
      const output = await review(context.runtime, ['--branch', '--base', 'HEAD~1']);
      assert.ok(await nodeFileSystem.exists(path.join(output.snapshotDirectory, 'files', 'src/checkout/checkout.ts')), output.result.omissions.join(' | '));
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });

  it('adds the files --context names, and refuses --context for a merge request', async () => {
    const context = await dependentsFixture();
    try {
      const output = await review(context.runtime, ['--context', 'src/other/legacy.ts']);
      assert.ok(await nodeFileSystem.exists(path.join(output.snapshotDirectory, 'files', 'src/other/legacy.ts')));
      await nodeFileSystem.remove(output.snapshotDirectory);

      const refused = await failure(() => review(context.runtime, ['--mr', 'https://gitlab.example.com/g/p/-/merge_requests/1', '--context', 'src/a.ts']));
      assert.equal(refused.code, 'bad-argument');
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
      supportingLocations: [] as {
        oldPath: string | null;
        newPath: string | null;
        side: 'old' | 'new';
        line: number;
      }[],
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
      reviewId: 'r1',
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

  it('makes an unverifiable supporting location invalid too', () => {
    const result = expectInvalid(
      run([
        {
          ...candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }),
          supportingLocations: [
            { oldPath: 'src/invented.ts', newPath: 'src/invented.ts', side: 'new' as const, line: 1 },
          ],
        },
      ]),
    );
    assert.match(result.rejections.join('\n'), /a supporting location is unverifiable/);
  });

  describe('a supporting location may name code the change affects without touching', () => {
    // The change sits on lines 1-3 and its consequence on line 29, which no hunk covers.
    const longer = `${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n')}\n`;
    const snapshotText = new Map([
      ['src/orders.ts', longer],
      ['src/cart.ts', 'export const cart = [];\nexport const size = cart.length;\n'],
    ]);
    const primary = { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new' as const, line: 2 };
    const supported = (extra: { oldPath: string | null; newPath: string | null; side: 'old' | 'new'; line: number }) =>
      run([{ ...candidate(primary), supportingLocations: [extra] }], { snapshotText });

    it('accepts an unchanged line of a changed file on the new side', () => {
      const findings = expectOk(supported({ oldPath: null, newPath: 'src/orders.ts', side: 'new', line: 29 }));
      assert.deepEqual(findings[0]?.supportingLocations, [
        { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 29 },
      ]);
    });

    it('accepts a line of an unchanged mirrored neighbour, naming it on both sides', () => {
      const findings = expectOk(supported({ oldPath: null, newPath: 'src/cart.ts', side: 'new', line: 2 }));
      assert.deepEqual(findings[0]?.supportingLocations, [
        { oldPath: 'src/cart.ts', newPath: 'src/cart.ts', side: 'new', line: 2 },
      ]);
    });

    it('still refuses the same line as the primary location, which is where a comment would go', () => {
      const result = expectInvalid(
        run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 29 })], { snapshotText }),
      );
      assert.match(result.rejections.join('\n'), /line 29 is not present on the new side/);
    });

    it('refuses a line past the end of the mirrored file', () => {
      const result = expectInvalid(supported({ oldPath: null, newPath: 'src/cart.ts', side: 'new', line: 3 }));
      assert.match(result.rejections.join('\n'), /line 3 is past the end of "src\/cart\.ts", which has 2 line\(s\)/);
    });

    it('keeps the old side to the diff, because the pre-image is not mirrored', () => {
      const result = expectInvalid(supported({ oldPath: 'src/orders.ts', newPath: null, side: 'old', line: 29 }));
      assert.match(result.rejections.join('\n'), /line 29 is not present on the old side/);
    });
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

  it('gives the same finding the same id twice', () => {
    const one = expectOk(run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 })]));
    const two = expectOk(run([candidate({ oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 })]));
    assert.equal(one[0]?.id, two[0]?.id);
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
      assert.match(config, /policyFiles: \[\]/);
      await nodeFileSystem.writeText(
        configPath,
        config.replace('policyFiles: []', 'policyFiles: [".ambicode/policies/broken-review.yaml"]'),
      );

            const output = await review(context.runtime, []);

      assert.ok(
        output.result.omissions.some((entry) => entry.includes('path-missing')),
        `expected an omission naming the unreadable prompt; got: ${JSON.stringify(output.result.omissions)}`,
      );
      assert.equal(output.result.status, 'partial');
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });

  it('does not surface a diagnostic from a pack that does not apply to this review as an omission', async () => {
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
        config.replace('policyFiles: []', 'policyFiles: [".ambicode/policies/broken-plan-only.yaml"]'),
      );

            const output = await review(context.runtime, []);

      // The pack only declares activities: [plan], so its broken prompt is
      // irrelevant to this review and must not appear as a coverage gap.
      assert.ok(!output.result.omissions.some((entry) => entry.includes('path-missing')));
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });
});

describe('a check waiting for authorization', () => {
  /** A unit check whose mapping selector always exceeds its own file limit. */
  async function gatedFixture(): Promise<Fixture> {
    const context = await fixture();
    await context.repo.write('tests/a.test.ts', "test('a', () => {});\n");
    await context.repo.write('tests/b.test.ts', "test('b', () => {});\n");
    await context.repo.commitAll('tests');
    // That commit swept up `fixture`'s uncommitted edit, and an unchanged tree
    // selects no test at all.
    await context.repo.write(
      'src/orders.ts',
      'export function total(amounts: number[]) {\n  return amounts.reduce((a, b) => a + b, 0);\n}\n\nexport const zero = 0;\n',
    );
    await context.repo.write(
      '.ambicode/config.yaml',
      [
        'schemaVersion: 1',
        'baseline: ""',
        'review:',
        '  model: sonnet',
        '  timeoutSeconds: 300',
        '  maxFindings: 7',
        '  maxChangedFiles: 50',
        '  maxChangedLines: 2000',
        '  maxContextBytes: 524288',
        'checks:',
        '  timeoutSeconds: 120',
        '  maxSelectedTestFiles: 20',
        'requirements:',
        '  mcpServer: null',
        'authoring:',
        '  editReminders: true',
        'projects:',
        '  - id: app',
        '    root: .',
        '    ecosystem: typescript',
        '    packs:',
        '      - builtin/common-quality',
        '      - builtin/common-checks',
        '    policyFiles: []',
        '    commands:',
        '      unit:',
        '        argv: [node, -e, ""]',
        '    checks:',
        '      unit:',
        '        command: unit',
        '        adapter: vitest',
        '        selector:',
        '          kind: mapping',
        '          maxFiles: 1',
        '          mappings:',
        '            - source: ["src/**"]',
        '              tests: ["tests/*.test.ts"]',
        '',
      ].join('\n'),
    );
    return context;
  }

  it('stops at the evidence while a check waits', async () => {
    const context = await gatedFixture();
    try {
            const output = await review(context.runtime, []);

      assert.equal(output.awaitingAuthorization, true);
      assert.equal(output.result.reviewer, null, 'no reviewer ran, so there is no reviewer run to report');
      assert.equal(output.pendingApprovals.length, 1);
      assert.equal(output.pendingApprovals[0]?.approvalKey, 'app/unit');

      assert.deepEqual(output.result.findings, []);
      assert.equal(output.result.status, 'partial');
      assert.ok(output.result.statusReason?.includes('app/unit'), output.result.statusReason ?? '');
      assert.ok(
        output.result.omissions.some((omission) =>
          omission.includes('--decline <key> reviews without one; approving one needs a human answer on the review route'),
        ),
        output.result.omissions.join(' | '),
      );

      assert.ok(await context.runtime.fs.exists(output.resultPath));
      assert.ok(await context.runtime.fs.exists(output.reportPath));
    } finally {
      await context.dispose();
    }
  });

  it('takes --decline as an answer, so one run covers the whole review', async () => {
    const context = await gatedFixture();
    try {
            const output = await review(context.runtime, ['--decline', 'app/unit']);

      assert.equal(output.awaitingAuthorization, false);
      assert.deepEqual(output.pendingApprovals, [], 'a declined check is answered, not waiting');

      const unit = output.result.checks.find((check) => check.checkId === 'unit');
      assert.equal(unit?.status, 'skipped');
      assert.ok(
        unit?.limitations.some((limitation) => limitation.includes('declined this run')),
        unit?.limitations.join(' | ') ?? '',
      );
      assert.equal(output.result.status, 'partial');
    } finally {
      await context.dispose();
    }
  });

  it('08-P1: a typed --approve outside a route approves nothing: the check stays waiting, the note points to the route and the report suggests no --approve', async () => {
    const context = await gatedFixture();
    try {
            const output = await review(context.runtime, ['--approve', 'app/unit']);

      assert.equal(output.awaitingAuthorization, true);
      assert.deepEqual(output.pendingApprovals.map((approval) => approval.approvalKey), ['app/unit']);
      assert.ok(output.result.omissions.some((omission) => /typed --approve approves nothing outside a route \(app\/unit\).*route start review/.test(omission)), output.result.omissions.join(' | '));
      assert.equal(output.result.checks.find((check) => check.checkId === 'unit')?.status === 'passed', false);
      const report = await context.runtime.fs.readText(output.reportPath);
      assert.match(report, /waiting for authorization\n {5}app\/unit\n/);
      assert.doesNotMatch(report, /--approve (app\/unit|<key>)/);
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
      assert.equal(output.awaitingAuthorization, false);
      assert.equal(output.result.reviewer, null);
      assert.deepEqual(output.result.findings, []);
      assert.equal(output.result.status, 'partial');
      assert.equal(output.result.statusReason, 'reviewer pending: run the ambicode:reviewer subagent, then `review record`');
      assert.ok(await context.runtime.fs.exists(output.resultPath));
      assert.ok(await context.runtime.fs.exists(output.reportPath));
      await nodeFileSystem.remove(output.snapshotDirectory);
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
  it('records status, reviewerRan false, findings and checks, and writes none for a run with no task', async () => {
    const context = await fixture();
    try {
      const inTask = await review(context.runtime, ['--task', 'ORD-17']);
      const ledger = await readLedger(nodeFileSystem, path.join(context.repo.root, '.ambicode', 'task', 'ORD-17'));
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0]?.kind, 'review');
      assert.equal(ledger[0]?.reviewId, inTask.reviewId);
      assert.equal(ledger[0]?.status, inTask.result.status);
      assert.equal(ledger[0]?.reviewerRan, false);
      assert.deepEqual(ledger[0]?.waiting, []);
      await nodeFileSystem.remove(inTask.snapshotDirectory);

      const loose = await review(context.runtime, []);
      assert.ok(!(await nodeFileSystem.exists(path.join(context.repo.root, '.ambicode', 'task', 'ledger.jsonl'))));
      assert.ok(!loose.reviewDirectory.includes(`${path.sep}task${path.sep}`));
      await nodeFileSystem.remove(loose.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });
});
