import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime, type Runtime } from '../composition/root.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { FakeProvider } from '../testing/fake-provider.ts';
import { ProviderRegistry } from '../providers/registry.ts';
import { GitHubProvider } from '../providers/github/provider.ts';
import { CountingIds, FakeClock } from '../testing/page-harness.ts';
import { publicationPositions, reviewResult } from '../testing/review-fixture.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';
import { renderView, runView, VIEW_OPTIONS } from './commands/view.ts';

/**
 * The reopen command itself: what it accepts, what it refuses, and that it
 * neither binds a socket nor launches a browser when a test says not to.
 */

interface Fixture {
  repo: TempRepo;
  runtime: Runtime;
  reviewDirectory: string;
  dispose(): Promise<void>;
}

async function fixture(options: { kind?: 'merge-request' | 'working' } = {}): Promise<Fixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders.ts', 'export const total = 0;\n');
  await repo.commitAll('initial');

  const setup = await createRuntime({ cwd: repo.root });
  await runInit(setup, parseArgs('init', [], INIT_OPTIONS));

  const result = reviewResult(
    options.kind === 'working' ? { kind: 'working', remote: null } : {},
  );
  const reviewDirectory = path.join(repo.root, '.ambicode', 'reviews', result.reviewId);
  await nodeFileSystem.mkdirp(reviewDirectory);
  await nodeFileSystem.writeText(
    path.join(reviewDirectory, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  if (options.kind !== 'working') {
    await nodeFileSystem.writeText(
      path.join(reviewDirectory, 'publication-positions.json'),
      `${JSON.stringify(publicationPositions(result), null, 2)}\n`,
    );
  }

  const runtime = await createRuntime({
    cwd: repo.root,
    clock: new FakeClock(),
    ids: new CountingIds('view-'),
    providers: new ProviderRegistry([new FakeProvider(), new GitHubProvider()]),
  });
  return { repo, runtime, reviewDirectory, dispose: () => repo.dispose() };
}

function view(runtime: Runtime, argv: string[]) {
  return runView(runtime, parseArgs('view', argv, VIEW_OPTIONS), {
    listen: false,
    openBrowser: false,
  });
}

/**
 * A review saved beside the plan and the investigation of the same task. The
 * id stays short because `.ambicode/task/<slug>/` already names the ticket, so
 * resolving it means asking each task directory rather than reading the id.
 */
async function taskFixture(slug: string, reviewId: string): Promise<Fixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders.ts', 'export const total = 0;\n');
  await repo.commitAll('initial');

  const setup = await createRuntime({ cwd: repo.root });
  await runInit(setup, parseArgs('init', [], INIT_OPTIONS));

  const result = { ...reviewResult({ kind: 'working', remote: null }), reviewId };
  const reviewDirectory = path.join(repo.root, '.ambicode', 'task', slug, 'reviews', reviewId);
  await nodeFileSystem.mkdirp(reviewDirectory);
  await nodeFileSystem.writeText(
    path.join(reviewDirectory, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  const runtime = await createRuntime({
    cwd: repo.root,
    clock: new FakeClock(),
    ids: new CountingIds('view-'),
    providers: new ProviderRegistry([new FakeProvider(), new GitHubProvider()]),
  });
  return { repo, runtime, reviewDirectory, dispose: () => repo.dispose() };
}

describe('the reopen command', () => {
  it('finds a review inside the task directory it belongs to', async () => {
    const context = await taskFixture('ORD-17', 'local_2026-09-22T14-35');
    try {
      const output = await view(context.runtime, ['--review', 'local_2026-09-22T14-35']);
      assert.ok(
        output.reviewDirectory.endsWith(
          path.join('.ambicode', 'task', 'ORD-17', 'reviews', 'local_2026-09-22T14-35'),
        ),
        output.reviewDirectory,
      );
      await output.stop('test finished');
    } finally {
      await context.dispose();
    }
  });

  it('refuses an id two task directories both hold, rather than opening whichever came first', async () => {
    const context = await taskFixture('ORD-17', 'local_2026-09-22T14-35');
    try {
      // Two tasks reviewed in the same minute: rare, and silently opening the
      // wrong one would be worse than saying so.
      const twin = path.join(
        context.repo.root,
        '.ambicode',
        'task',
        'ORD-42',
        'reviews',
        'local_2026-09-22T14-35',
      );
      await nodeFileSystem.mkdirp(twin);
      await nodeFileSystem.writeText(path.join(twin, 'result.json'), '{}\n');

      await assert.rejects(
        () => view(context.runtime, ['--review', 'local_2026-09-22T14-35']),
        (error: unknown) => isAmbicodeError(error) && error.code === 'review-ambiguous',
      );
    } finally {
      await context.dispose();
    }
  });
  it('loads a saved review by its id and reports what the page offers', async () => {
    const context = await fixture();
    try {
      const output = await view(context.runtime, ['--review', 'r-0001']);
      assert.equal(output.reviewId, 'r-0001');
      assert.ok(output.reviewDirectory.endsWith(path.join('.ambicode', 'reviews', 'r-0001')));
      assert.equal(output.publicationAvailable, true);
      assert.match(renderView(output), /Review r-0001 is open/);
      assert.match(renderView(output), /Selected comments can be published/);
      await output.stop('test finished');
    } finally {
      await context.dispose();
    }
  });

  it('accepts the path of a saved result.json', async () => {
    const context = await fixture();
    try {
      const output = await view(context.runtime, [
        '--review',
        path.join(context.reviewDirectory, 'result.json'),
      ]);
      assert.ok(output.reviewDirectory.endsWith(path.join('.ambicode', 'reviews', 'r-0001')));
      await output.stop('test finished');
    } finally {
      await context.dispose();
    }
  });

  it('says a local review has no publication action', async () => {
    const context = await fixture({ kind: 'working' });
    try {
      const output = await view(context.runtime, ['--review', 'r-0001']);
      assert.equal(output.publicationAvailable, false);
      assert.match(renderView(output), /no remote publication action/);
      await output.stop('test finished');
    } finally {
      await context.dispose();
    }
  });

  it('refuses a path outside the repository review directory', async () => {
    const context = await fixture();
    try {
      await assert.rejects(
        () => view(context.runtime, ['--review', '../../../etc']),
        (error: unknown) => {
          assert.ok(isAmbicodeError(error));
          assert.equal(error.code, 'review-outside-repository');
          return true;
        },
      );
    } finally {
      await context.dispose();
    }
  });

  it('refuses a review id that does not exist', async () => {
    const context = await fixture();
    try {
      await assert.rejects(
        () => view(context.runtime, ['--review', 'r-9999']),
        (error: unknown) => {
          assert.ok(isAmbicodeError(error));
          assert.equal(error.code, 'review-not-found');
          return true;
        },
      );
    } finally {
      await context.dispose();
    }
  });

  it('refuses a missing --review before anything is read', async () => {
    const context = await fixture();
    try {
      await assert.rejects(
        () => view(context.runtime, []),
        (error: unknown) => {
          assert.ok(isAmbicodeError(error));
          assert.equal(error.code, 'bad-argument');
          assert.match(error.details.join('\n'), /ambicode view --review <review-id>/);
          return true;
        },
      );
    } finally {
      await context.dispose();
    }
  });

  it('refuses a saved result that does not validate', async () => {
    const context = await fixture();
    try {
      await nodeFileSystem.writeText(
        path.join(context.reviewDirectory, 'result.json'),
        '{"schemaVersion": 1, "reviewId": "r-0001"}\n',
      );
      await assert.rejects(
        () => view(context.runtime, ['--review', 'r-0001']),
        (error: unknown) => {
          assert.ok(isAmbicodeError(error));
          assert.equal(error.code, 'review-result-invalid');
          assert.match(error.details.join('\n'), /will not display or publish from a result/);
          return true;
        },
      );
    } finally {
      await context.dispose();
    }
  });
});
