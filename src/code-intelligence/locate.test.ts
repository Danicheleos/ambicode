import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../cli/args.ts';
import { INIT_OPTIONS, runInit } from '../cli/commands/init.ts';
import { LOCATE_OPTIONS, runLocate } from '../cli/commands/locate.ts';
import { createRuntime } from '../composition/root.ts';
import { ProjectConfig } from '../contracts/config.ts';
import type { LocateCandidate } from '../contracts/locate.ts';
import { Git } from '../git/git.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import { locate, PREPARE_SHORTLIST_LIMIT, termsFromRequirements } from './locate.ts';

/**
 * R4: the boundary shortlist has to beat the thing it replaces — an agent
 * grepping for a keyword — or it is not worth the git calls. These tests run
 * against `ts-feature-boundary`, a fixture built so that keyword matching
 * alone gets the answer wrong: the decoy `src/legacy/invoice-export.ts` has
 * the term in its filename and in its text, exactly like the route and the
 * test that really belong to the feature. Only co-change tells them apart.
 *
 * The fixture is materialized by the shipped `fixtures/materialize.mjs`, so
 * these tests exercise the same repository the eval case scaffolds rather
 * than a second copy that can drift from it.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BOUNDARY = [
  'src/invoices/model.ts',
  'src/invoices/service.ts',
  'src/routes/invoices.ts',
  'tests/invoices.test.ts',
];
const DECOYS = ['src/legacy/invoice-export.ts', 'src/reports/monthly.ts', 'docs/glossary.md'];

async function materialize(name: string): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-locate-')), 'repo');
  const runner = new NodeProcessRunner();
  const outcome = await runner.run({
    argv: ['node', path.join(repositoryRoot, 'fixtures', 'materialize.mjs'), name, destination],
    cwd: repositoryRoot,
    timeoutMs: 60_000,
    maxOutputBytes: 262_144,
    env: { kind: 'inherited' },
  });
  assert.equal(outcome.exitCode, 0, `materializing ${name} failed: ${outcome.stderr}${outcome.failure ?? ''}`);
  return destination;
}

/** One project covering the whole repository, without needing a config file. */
function wholeRepositoryProject(id = 'app'): ProjectConfig {
  return ProjectConfig.parse({ id, root: '.', ecosystem: 'typescript' });
}

function gitFor(root: string): Git {
  return new Git({ runner: new NodeProcessRunner(), repositoryRoot: root });
}

function rankOf(candidates: readonly LocateCandidate[], candidatePath: string): number {
  return candidates.findIndex((candidate) => candidate.path === candidatePath);
}

/** Records every mutating call, so a write behind the port's back is visible. */
function recording(inner: FileSystem): { fs: FileSystem; mutations: string[] } {
  const mutations: string[] = [];
  return {
    mutations,
    fs: {
      ...inner,
      writeText: async (absolutePath, contents) => {
        mutations.push(`write ${absolutePath}`);
        await inner.writeText(absolutePath, contents);
      },
      createExclusive: async (absolutePath, contents) => {
        mutations.push(`create ${absolutePath}`);
        return inner.createExclusive(absolutePath, contents);
      },
      mkdirp: async (absolutePath) => {
        mutations.push(`mkdir ${absolutePath}`);
        await inner.mkdirp(absolutePath);
      },
      temporaryDirectory: async (prefix) => {
        mutations.push(`temp ${prefix}`);
        return inner.temporaryDirectory(prefix);
      },
      rename: async (from, to) => {
        mutations.push(`rename ${from}`);
        await inner.rename(from, to);
      },
      copyFile: async (from, to) => {
        mutations.push(`copy ${to}`);
        await inner.copyFile(from, to);
      },
      remove: async (absolutePath) => {
        mutations.push(`remove ${absolutePath}`);
        await inner.remove(absolutePath);
      },
      setTimes: async (absolutePath, time) => {
        mutations.push(`times ${absolutePath}`);
        await inner.setTimes(absolutePath, time);
      },
    },
  };
}

describe('R4 boundary shortlist', () => {
  it('ranks the four files of the real boundary above the decoys that share the keyword', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['invoice'],
        limit: 20,
      });

      const paths = shortlist.candidates.map((candidate) => candidate.path);
      for (const boundary of BOUNDARY) {
        assert.ok(paths.includes(boundary), `${boundary} is missing from the shortlist`);
      }
      const worstBoundary = Math.max(...BOUNDARY.map((file) => rankOf(shortlist.candidates, file)));
      for (const decoy of DECOYS) {
        const decoyRank = rankOf(shortlist.candidates, decoy);
        assert.ok(
          decoyRank > worstBoundary,
          `decoy ${decoy} ranked at ${decoyRank}, at or above the boundary's worst rank ${worstBoundary}`,
        );
      }

      // The decoy is in the list — it does hold the word — but below the
      // boundary. Dropping it would be a different, less honest claim.
      assert.ok(paths.includes('src/legacy/invoice-export.ts'));
      // And the shortlist is a shortlist: the users feature is not in it.
      assert.ok(!paths.some((candidate) => candidate.startsWith('src/users/')));
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('promotes the route and the test through co-change, and says so in the reason', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['invoice'],
        limit: 20,
      });

      for (const file of ['src/routes/invoices.ts', 'tests/invoices.test.ts']) {
        const candidate = shortlist.candidates.find((entry) => entry.path === file);
        assert.ok(candidate !== undefined, `${file} is missing`);
        assert.ok(
          candidate.reasons.some((reason) =>
            /^changed with src\/invoices\/(model|service)\.ts in 3 of 3 commits$/.test(reason),
          ),
          `${file} carries no co-change reason: ${candidate.reasons.join(' | ')}`,
        );
      }

      // The decoy shares the keyword and nothing else: no co-change reason,
      // which is exactly why it ranks below files with the same keyword score.
      const decoy = shortlist.candidates.find((entry) => entry.path === 'src/legacy/invoice-export.ts');
      assert.ok(decoy !== undefined);
      assert.ok(!decoy.reasons.some((reason) => reason.startsWith('changed with')));
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('reports a term that matched nothing as a limitation, without dropping the terms that did match', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['invoice', 'kaleidoscope'],
        limit: 20,
      });

      assert.ok(
        shortlist.limitations.some((limitation) => limitation.includes('"kaleidoscope"')),
        `no limitation named the unmatched term: ${shortlist.limitations.join(' | ')}`,
      );
      assert.ok(shortlist.candidates.some((candidate) => candidate.path === 'src/invoices/model.ts'));
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('stays empty when nothing matches, instead of widening to the whole project', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['kaleidoscope'],
        limit: 20,
      });

      assert.deepEqual(shortlist.candidates, []);
      assert.ok(shortlist.limitations.length > 0, 'an empty shortlist must say why it is empty');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('refuses to answer with the project when a term reaches most of it', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      // "src" is in nearly every path here. A term that broad describes the
      // project, not a boundary inside it, so it contributes nothing.
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['src'],
        limit: 20,
      });

      assert.deepEqual(shortlist.candidates, []);
      assert.ok(
        shortlist.limitations.some((limitation) => limitation.includes('which is not a shortlist')),
        shortlist.limitations.join(' | '),
      );
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('bounds the list to --limit and says how many further candidates it did not show', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['invoice'],
        limit: 2,
      });

      assert.equal(shortlist.candidates.length, 2);
      assert.ok(
        shortlist.limitations.some((limitation) => /further candidate\(s\) scored/.test(limitation)),
        shortlist.limitations.join(' | '),
      );
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('scopes to one project of a monorepository and excludes what review already excludes', async () => {
    const root = await materialize('monorepo-mixed');
    try {
      const git = gitFor(root);
      const shortlist = await locate({
        git,
        project: ProjectConfig.parse({ id: 'api', root: 'services/api', ecosystem: 'python' }),
        terms: ['handle'],
        limit: 20,
      });

      assert.ok(shortlist.candidates.length > 0);
      for (const candidate of shortlist.candidates) {
        assert.ok(
          candidate.path.startsWith('services/api/'),
          `${candidate.path} is outside the project the request named`,
        );
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('builds no index and writes nothing: the injected filesystem observes no mutation', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      await runInit(await createRuntime({ cwd: root }), parseArgs('init', [], INIT_OPTIONS));

      const recorder = recording(nodeFileSystem);
      const runtime = await createRuntime({ cwd: root, fs: recorder.fs });
      const output = await runLocate(runtime, parseArgs('locate', ['invoice'], LOCATE_OPTIONS));

      assert.equal(output.command, 'locate');
      assert.ok(output.candidates.length > 0);
      assert.deepEqual(
        recorder.mutations,
        [],
        `locate mutated the filesystem: ${recorder.mutations.join(', ')}`,
      );
      // And no candidate carries file contents: paths and reasons only.
      for (const candidate of output.candidates) {
        assert.deepEqual(Object.keys(candidate).sort(), ['path', 'reasons', 'score']);
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('completes well inside a second on this repository', async () => {
    // Acceptance 3. A generous ceiling: the point is that this is on-demand
    // git work, not an indexing pass, and a regression into one would not be
    // subtle. Measured on the AMBICODE repository (Windows 11, git 2.53) when
    // this was written: 228ms in-process for three terms, and about 410ms for
    // a real `ambicode locate` invocation including node's own start-up.
    const started = Date.now();
    const shortlist = await locate({
      git: gitFor(repositoryRoot),
      project: wholeRepositoryProject(),
      terms: ['navigation', 'shortlist', 'publication'],
      limit: 20,
    });
    const elapsed = Date.now() - started;

    assert.ok(shortlist.candidates.length > 0);
    assert.ok(elapsed < 3_000, `the shortlist took ${elapsed}ms on this repository`);
  });
});

describe('R4 terms from requirement text', () => {
  it('prefers identifier-shaped tokens and drops boilerplate', () => {
    const terms = termsFromRequirements([
      {
        title: 'Reject negative invoice amounts',
        content:
          'The InvoiceService must reject a negative amount rather than clamping it. This should be validated where order_total is computed.',
      },
    ]);

    assert.ok(terms.includes('InvoiceService'), terms.join(', '));
    assert.ok(terms.includes('order_total'), terms.join(', '));
    assert.ok(terms.includes('invoice') || terms.includes('Invoice'), terms.join(', '));
    // Identifier-shaped tokens come first, because a requirement that names
    // code is naming the boundary.
    assert.ok(terms.indexOf('InvoiceService') < terms.indexOf('negative'));
    for (const boilerplate of ['must', 'should', 'this', 'where', 'than']) {
      assert.ok(!terms.includes(boilerplate), `"${boilerplate}" should not be a search term`);
    }
  });

  it('finds the boundary from the requirement text alone, through the same envelope every command reads', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      await runInit(await createRuntime({ cwd: root }), parseArgs('init', [], INIT_OPTIONS));

      const envelope = JSON.stringify({
        mcpServer: 'frozen-evidence',
        sources: [
          {
            id: 'INV-7',
            url: 'https://example.atlassian.net/browse/INV-7',
            title: 'Invoice totals must include tax',
            retrievedAt: '2026-09-20T09:00:00.000Z',
            content: 'The invoice total must include the tax amount for every currency.',
            status: 'retrieved',
            retrievedVia: 'mcp__atlassian__getJiraIssue',
          },
        ],
        conflicts: [],
      });
      const runtime = await createRuntime({ cwd: root, stdin: { read: async () => envelope } });
      const output = await runLocate(runtime, parseArgs('locate', ['--evidence', '-'], LOCATE_OPTIONS));

      const paths = output.candidates.map((candidate) => candidate.path);
      for (const boundary of BOUNDARY) {
        assert.ok(paths.includes(boundary), `${boundary} is missing; got ${paths.join(', ')}`);
      }
      // Derived terms are a heuristic, and the output says so rather than
      // presenting them as the caller's own.
      assert.ok(
        output.limitations.some((limitation) => limitation.includes('derived from the requirement text')),
        output.limitations.join(' | '),
      );
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});

/**
 * The failure this fixture records happened in the field: a real ticket
 * ("raise the Order/Refund amount limit") produced a ten-candidate
 * shortlist of ten translation files, and the agent fell back to grepping for
 * the constant itself — the exact work the shortlist exists to replace.
 *
 * Two things went wrong, and both are general. The words a requirement uses
 * are the words a translation file holds, and three overlapping mentions
 * outscored a directory named for the feature. And a locale family that an
 * export rewrites as a block co-changes perfectly with itself, which looks
 * like the strongest possible boundary signal and carries no information at
 * all. Meanwhile the code spelled the ticket's name as `order-refund` and
 * `orderRefund`, neither of which a search for "Order/Refund" ever finds.
 */
describe('R4 shortlist against the prose of a ticket', () => {
  it('ranks the code above the translation family that carries the same words', async () => {
    const root = await materialize('ts-locale-decoys');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['Order/Refund', 'ORD-17', 'ORD-17-1', 'refund-limit'],
        limit: 20,
      });

      const paths = shortlist.candidates.map((candidate) => candidate.path);
      const worstCode = Math.max(rankOf(shortlist.candidates, 'src/features/orders/order-refund/services/order-refund-form.service.ts'), rankOf(shortlist.candidates, 'src/features/orders/order-refund/services/order-refund-form.service.spec.ts'));
      assert.ok(paths.includes('src/features/orders/order-refund/services/order-refund-form.service.ts'), `the form service is missing: ${paths.join(', ')}`);
      for (const locale of paths.filter((candidate) => candidate.startsWith('src/assets/i18n/'))) {
        assert.ok(
          rankOf(shortlist.candidates, locale) > worstCode,
          `${locale} ranked above the code the ticket is about`,
        );
      }

      // Within the shortlist a caller actually receives, not merely somewhere
      // in a longer list: `prepare` sends ten.
      assert.ok(
        shortlist.candidates.slice(0, PREPARE_SHORTLIST_LIMIT).some((candidate) => candidate.path === 'src/features/orders/order-refund/services/order-refund-form.service.ts'),
        `the form service is outside the first ${PREPARE_SHORTLIST_LIMIT} candidates`,
      );
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('finds a name the code spells with another separator, and says which spelling matched', async () => {
    const root = await materialize('ts-locale-decoys');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['Order/Refund'],
        limit: 20,
      });

      const target = shortlist.candidates.find((candidate) => candidate.path === 'src/features/orders/order-refund/services/order-refund-form.service.ts');
      assert.ok(target !== undefined, 'the directory spelled `order-refund` was not found');
      // The reason names the spelling that matched, not the term the caller
      // typed: a reader has to be able to see why this file is here.
      assert.ok(
        target.reasons.some((reason) => reason.includes('"order-refund", a path spelling of "Order/Refund"')),
        target.reasons.join(' | '),
      );
      assert.ok(
        target.reasons.some((reason) => reason.includes('"orderrefund", a compact spelling of "Order/Refund"')),
        target.reasons.join(' | '),
      );
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('does not join the words of a number, because that makes a different number', async () => {
    const root = await materialize('ts-locale-decoys');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['250.5', 'Order/Refund'],
        limit: 40,
      });

      const illustration = shortlist.candidates.find((candidate) => candidate.path === 'src/assets/illustrations/outline.svg');
      assert.equal(
        illustration,
        undefined,
        `"2505" reached SVG path data: ${illustration?.reasons.join(' | ') ?? ''}`,
      );

      // The guard is about digits, not about joining: a term that holds a word
      // still gets its compact spelling.
      const compact = shortlist.candidates.find((candidate) =>
        candidate.reasons.some((reason) => reason.includes('"orderrefund", a compact spelling of "Order/Refund"')),
      );
      assert.ok(compact !== undefined, shortlist.candidates.map((candidate) => candidate.reasons.join(' | ')).join('\n'));
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('never lets mentions add up to having the boundary named', async () => {
    const root = await materialize('ts-locale-decoys');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['Order/Refund', 'ORD-17', 'ORD-17-1'],
        limit: 20,
      });

      const locale = shortlist.candidates.find((candidate) =>
        candidate.path.startsWith('src/assets/i18n/'),
      );
      assert.ok(locale !== undefined);
      // Three mentions, and still worth less than one directory named for the
      // term. Overlapping terms are not independent evidence.
      assert.equal(locale.reasons.filter((reason) => reason.startsWith('contains')).length, 3);
      assert.ok(locale.score < 5, `three mentions scored ${locale.score}`);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('drops the co-change of a set that is maintained as a block, and says so', async () => {
    const root = await materialize('ts-locale-decoys');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['Order/Refund', 'ORD-17'],
        limit: 20,
      });

      for (const candidate of shortlist.candidates) {
        if (!candidate.path.startsWith('src/assets/i18n/')) continue;
        assert.ok(
          !candidate.reasons.some((reason) => reason.startsWith('changed with')),
          `${candidate.path} was credited for moving with its own family`,
        );
      }
      assert.ok(
        shortlist.limitations.some((limitation) =>
          limitation.includes('maintained as a block'),
        ),
        shortlist.limitations.join(' | '),
      );

      // And the signal still does the job it exists for: the constants file
      // carries none of the ticket's words and is found only by moving with
      // the code that does.
      const constants = shortlist.candidates.find((candidate) => candidate.path === 'src/features/orders/constants/refund-limits.constants.ts');
      assert.ok(constants !== undefined, 'co-change found nothing the terms did not already name');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});

/**
 * Nothing in the shortlist reads a language. Files come from `git ls-files`,
 * contents from `git grep -i -F`, paths from globs, and relatedness from the
 * commit history — none of which knows what a `.ts` file is. The spellings
 * are the one place a convention could hide, so this is where it is checked:
 * one name, the five ways five ecosystems write it, five unrelated roots.
 */
describe('R4 shortlist across ecosystems and layouts', () => {
  it('finds one name under the spelling each ecosystem uses', async () => {
    const root = await materialize('polyglot-spellings');
    try {
      const shortlist = await locate({
        git: gitFor(root),
        project: wholeRepositoryProject(),
        terms: ['Order/Refund'],
        limit: 20,
      });

      const expected = [
        ['services/order_refund/refund_limits.py', 'order_refund'],
        ['platform/src/main/java/com/acme/orderrefund/RefundLimits.java', 'orderrefund'],
        ['internal/orderrefund/limits.go', 'orderrefund'],
        ['lib/order_refund/limits.c', 'order_refund'],
        ['app/order-refund/limits.rb', 'order-refund'],
      ] as const;

      for (const [file, spelling] of expected) {
        const candidate = shortlist.candidates.find((entry) => entry.path === file);
        assert.ok(
          candidate !== undefined,
          `${file} is missing: ${shortlist.candidates.map((entry) => entry.path).join(', ')}`,
        );
        // The reason names the spelling that matched, so a reader can see
        // that the shortlist understood the project's convention.
        assert.ok(
          candidate.reasons.some((reason) =>
            reason.includes(`"${spelling}", a path spelling of "Order/Refund"`),
          ),
          `${file}: ${candidate.reasons.join(' | ')}`,
        );
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
