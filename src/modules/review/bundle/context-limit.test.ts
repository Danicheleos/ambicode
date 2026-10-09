import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { initConfig } from '#testing/fixtures/init-config';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { createRuntime } from '#composition/root';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { byteLength } from '../snapshot/limits.ts';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { isAmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';

const JIRA = 'https://example.atlassian.net/browse/ORD-17';

interface Fixture {
  repo: TempRepo;
  runtime: Runtime;
  dispose(): Promise<void>;
}

async function fixture(maxContextBytes: number): Promise<Fixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/orders.ts', 'export const total = 0;\n');
  await repo.commitAll('initial');

  const setup = await createRuntime({ cwd: repo.root });
  await initConfig(setup);

  const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
  const config = await nodeFileSystem.readText(configPath);
  await nodeFileSystem.writeText(
    configPath,
    config.replace(/maxContextBytes: (\d+|null)/, `maxContextBytes: ${maxContextBytes}`),
  );

  // Committed, so the working diff is only the source edit below, not the
  // configuration init just wrote.
  await repo.commitAll('ambicode setup');

  await repo.write('src/orders.ts', 'export const total = 1;\n');
  return { repo, runtime: await createRuntime({ cwd: repo.root }), dispose: () => repo.dispose() };
}

async function evidence(repo: TempRepo, content: string): Promise<string> {
  await repo.write(
    'evidence.json',
    `${JSON.stringify({
      mcpServer: null,
      sources: [
        {
          id: 'ORD-17',
          url: JIRA,
          title: 'Sum the amounts',
          retrievedAt: '2026-09-20T09:00:00.000Z',
          sourceVersion: '3',
          updatedAt: '2026-09-19T12:00:00.000Z',
          content,
          citations: [],
          status: 'retrieved',
          failureReason: null,
          retrievedVia: 'mcp__atlassian__getJiraIssue',
        },
      ],
      conflicts: [],
    })}\n`,
  );
  return path.join(repo.root, 'evidence.json');
}

function refusal(run: () => Promise<unknown>): Promise<{ code: string; details: string[] }> {
  return run().then(
    () => assert.fail('expected the review to be refused'),
    (error: unknown) => {
      assert.ok(isAmbicodeError(error), `expected an AmbicodeError, got ${String(error)}`);
      return { code: error.code, details: error.details };
    },
  );
}

describe('U17 the context limit covers the whole model input', () => {
  it('refuses a requirement larger than the limit before any check runs', async () => {
    const context = await fixture(8_192);
    try {
      const huge = 'The orders service must reject negative amounts. '.repeat(400);
      assert.ok(byteLength(huge) > 8_192);
      const evidencePath = await evidence(context.repo, huge);

      const error = await refusal(() =>
        runReview(
          context.runtime,
          parseArgs('review', ['--requirement', JIRA, '--evidence', evidencePath], REVIEW_OPTIONS),
        ),
      );

      assert.equal(error.code, 'input-too-large');
      assert.match(error.details.join('\n'), /measured components:/);
      assert.match(error.details.join('\n'), /requirement content: \d+ bytes/);
      assert.match(error.details.join('\n'), /does not truncate a change or a requirement to fit/);
    } finally {
      await context.dispose();
    }
  });
});
