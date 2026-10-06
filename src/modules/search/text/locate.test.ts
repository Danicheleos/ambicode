import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#cli/args';
import { initConfig } from '#testing/fixtures/init-config';
import { runLocate } from '#cli/commands/search/locate';
import { createRuntime } from '#composition/root';
import { ProjectConfig } from '#types/modules/config';
import { PREPARE_SHORTLIST_LIMIT, type LocateCandidate } from '#types/modules/search';
import { Git } from '#platform/git/git';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { locate, pathHit, shortlistRules, termsFromRequirements } from './locate.ts';
import { matchesGlob } from '#util/glob';
import { REPO_ROOT } from '#testing/paths';
import { LOCATE_OPTIONS } from '#cli/types/commands';
import type { FileSystem } from '#types/platform/ports';

/**
 * In `ts-feature-boundary` the decoy `src/legacy/invoice-export.ts` carries the
 * term in its name and text like the real feature files; only co-change tells them apart.
 */

const repositoryRoot = REPO_ROOT;

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

function wholeRepositoryProject(id = 'app'): ProjectConfig {
  // Ranking tests see every file; what may be listed at all is tested in 'R4 which files may be listed'.
  return ProjectConfig.parse({ id, root: '.', ecosystem: 'typescript', shortlist: {} });
}

function gitFor(root: string): Git {
  return new Git({ runner: new NodeProcessRunner(), repositoryRoot: root });
}

function rankOf(candidates: readonly LocateCandidate[], candidatePath: string): number {
  return candidates.findIndex((candidate) => candidate.path === candidatePath);
}

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

      // The decoy does hold the word, so it stays in the list, below the boundary.
      assert.ok(paths.includes('src/legacy/invoice-export.ts'));
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
        project: ProjectConfig.parse({ id: 'api', root: 'services/api', ecosystem: 'python', shortlist: {} }),
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
      await initConfig(await createRuntime({ cwd: root }));

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
      for (const candidate of output.candidates) {
        assert.deepEqual(Object.keys(candidate).sort(), ['path', 'reasons', 'score']);
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('completes well inside a second on this repository', async () => {
    // A generous ceiling: a regression into an indexing pass would not be subtle.
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
    assert.ok(terms.indexOf('InvoiceService') < terms.indexOf('negative'));
    for (const boilerplate of ['must', 'should', 'this', 'where', 'than']) {
      assert.ok(!terms.includes(boilerplate), `"${boilerplate}" should not be a search term`);
    }
  });

  it('finds the boundary from the requirement text alone, through the same envelope every command reads', async () => {
    const root = await materialize('ts-feature-boundary');
    try {
      await initConfig(await createRuntime({ cwd: root }));

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

      // The configuration init wrote lists source only, so the boundary's test file is not on the list.
      const paths = output.candidates.map((candidate) => candidate.path);
      for (const boundary of BOUNDARY.filter((file) => !file.includes('.test.'))) {
        assert.ok(paths.includes(boundary), `${boundary} is missing; got ${paths.join(', ')}`);
      }
      assert.ok(!paths.includes('tests/invoices.test.ts'), paths.join(', '));
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
 * Translation files hold the ticket's own words and a locale family co-changes
 * perfectly with itself, while the code spells "Order/Refund" as `order-refund`.
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

      // Within the ten `prepare` actually sends, not merely somewhere in a longer list.
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

      const constants = shortlist.candidates.find((candidate) => candidate.path === 'src/features/orders/constants/refund-limits.constants.ts');
      assert.ok(constants !== undefined, 'co-change found nothing the terms did not already name');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});

/**
 * Spellings are the one place a language convention could hide, so one name is
 * checked the five ways five ecosystems write it.
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

describe('R4 path signal without a glob per file', () => {
  /** The glob-based reference `pathHit` must agree with. */
  function globHit(lowerPath: string, form: string): 'directory' | 'filename' | null {
    if (matchesGlob(lowerPath, `**/*${form}*/**`)) return 'directory';
    return matchesGlob(lowerPath, `**/*${form}*`) ? 'filename' : null;
  }

  it('gives exactly the answer the two globs gave, on this repository and on the edge cases', async () => {
    const tracked = await gitFor(repositoryRoot).listFiles(null);
    const edges = [
      'a/.foo/b.ts', 'a/.foo.ts', 'a/x.foo.ts', '.github/foo.yml', '.github/foo/x.yml',
      'a/foo/.x/b.ts', 'a/foo/.env', 'foo.ts', 'foo/b.ts', 'a/xfooy/b.ts', 'a/foo',
      'Src/Orders/Refund.ts', 'src/orders.ts', 'xsrc/ordersy/z.ts', 'a/b+c/d.ts', 'a/b.c/d.ts',
      'a/bxc/d.ts', 'a/x.env', 'a/é/d.ts', 'a/order-refund/x.ts', 'a/order_refund.py',
    ];
    const paths = [...new Set([...tracked, ...edges])].map((value) => value.toLowerCase());
    const forms = new Set(['foo', 'src/orders', '.env', 'b+c', 'b.c', 'é', 'order-refund', 'orderrefund', '.ts', 'x']);
    for (const value of paths) {
      for (const word of value.split(/[/._-]/)) if (word.length >= 3) forms.add(word);
    }

    const seen = { directory: 0, filename: 0, none: 0, hiddenByDot: 0 };
    const disagreements: string[] = [];
    for (const form of forms) {
      for (const value of paths) {
        const expected = globHit(value, form);
        const actual = pathHit(value, form);
        if (actual !== expected && disagreements.length < 10) {
          disagreements.push(`${JSON.stringify(form)} in ${value}: glob ${expected}, now ${actual}`);
        }
        seen[expected ?? 'none'] += 1;
        // The case a plain substring test gets wrong.
        if (expected === null && value.includes(form) && value.split('/').some((part) => part.startsWith('.'))) {
          seen.hiddenByDot += 1;
        }
      }
    }
    assert.deepEqual(disagreements, []);
    // Equality means nothing unless every answer the glob can give was given.
    for (const [outcome, count] of Object.entries(seen)) assert.ok(count > 0, `no case produced ${outcome}`);
  });
});

describe('R4 which files may be listed', () => {
  const FILES: Record<string, string> = {
    'src/cart/cart.service.ts': 'export const cart = 1;\n',
    'src/cart/cart.service.spec.ts': 'cart\n',
    'src/cart/cart.component.html': '<p>cart</p>\n',
    'src/cart/cart.component.scss': '.cart {}\n',
    'src/cart/cart.d.ts': 'declare const cart: 1;\n',
    'src/cart/cart.vue': '<template>cart</template>\n',
    'src/cart/__tests__/cart.ts': 'cart\n',
    'docs/cart.md': 'cart\n',
    'src/assets/i18n/cart.json': '{"cart": 1}\n',
  };

  async function shortlistOf(project: Record<string, unknown>): Promise<{ paths: string[]; limitations: string[] }> {
    const repo = await TempRepo.create();
    try {
      for (const [file, body] of Object.entries(FILES)) await repo.write(file, body);
      for (let index = 0; index < 20; index += 1) await repo.write(`src/other/f${index}.ts`, 'export const other = 1;\n');
      await repo.commitAll('initial');
      const found = await locate({
        git: gitFor(repo.root),
        project: ProjectConfig.parse({ id: 'app', root: '.', ecosystem: 'typescript', ...project }),
        terms: ['cart'],
        limit: 20,
      });
      return { paths: found.candidates.map((c) => c.path).sort(), limitations: found.limitations };
    } finally {
      await repo.dispose();
    }
  }

  it('lists only source files by default, and says how many it left out', async () => {
    const { paths, limitations } = await shortlistOf({});
    assert.deepEqual(paths, ['src/cart/cart.service.ts', 'src/cart/cart.vue']);
    assert.ok(limitations.some((line) => /^7 matching file\(s\) are not listed: .*projects\[\]\.shortlist/.test(line)), limitations.join(' | '));
  });

  it('follows the include and exclude lists in config.yaml', async () => {
    const widened = await shortlistOf({ shortlist: { include: ['**/*.ts', '**/*.html'], exclude: ['**/*.spec.ts', '**/*.d.ts', '**/__tests__/**'] } });
    assert.deepEqual(widened.paths, ['src/cart/cart.component.html', 'src/cart/cart.service.ts']);
  });

  it('lists everything when both lists are empty', async () => {
    const { paths, limitations } = await shortlistOf({ shortlist: {} });
    assert.equal(paths.length, Object.keys(FILES).length);
    assert.ok(!limitations.some((line) => line.includes('are not listed')));
  });

  it('has a default for every ecosystem the config accepts', () => {
    for (const ecosystem of ['typescript', 'python'] as const) {
      const rules = shortlistRules(ProjectConfig.parse({ id: 'app', root: '.', ecosystem }));
      assert.ok(rules.include.length > 0 && rules.exclude.length > 0, ecosystem);
    }
  });
});

describe('R4 ranking by how specific a term is', () => {
  it('ranks the file holding the rare term above files holding the common one', async () => {
    const repo = await TempRepo.create();
    try {
      for (let index = 1; index <= 12; index += 1) {
        const name = `src/f${String(index).padStart(2, '0')}.ts`;
        const body = index <= 6 ? 'export const common = 1;\n' : index === 12 ? 'export const rare = 1;\n' : 'export const other = 1;\n';
        await repo.write(name, body);
      }
      await repo.commitAll('initial');

      const shortlist = await locate({ git: gitFor(repo.root), project: wholeRepositoryProject(), terms: ['common', 'rare'], limit: 20 });

      // f01 sorts first on a tie; only the term's reach puts f12 ahead of it.
      assert.equal(shortlist.candidates[0]?.path, 'src/f12.ts', shortlist.candidates.map((c) => `${c.path}:${c.score}`).join(' '));
    } finally {
      await repo.dispose();
    }
  });
});

describe('R4 terms from the words inside an identifier', () => {
  it('offers the words of a compound identifier beside the identifier', () => {
    const terms = termsFromRequirements([{ title: '', content: 'OrderRefundService rejects a negative amount' }]);

    assert.ok(terms.includes('OrderRefundService'), terms.join(', '));
    for (const word of ['order', 'refund']) assert.ok(terms.includes(word), `"${word}" missing from ${terms.join(', ')}`);
  });
});
