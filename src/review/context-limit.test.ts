import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '../cli/args.ts';
import { INIT_OPTIONS, runInit } from '../cli/commands/init.ts';
import { REVIEW_OPTIONS, runReview } from '../cli/commands/review.ts';
import { createRuntime, type Runtime } from '../composition/root.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import type { Reviewer, ReviewerInvocation, ReviewerRequest } from '../ports/reviewer.ts';
import { byteLength } from '../snapshot/limits.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { isAmbicodeError } from '../util/errors.ts';

/**
 * `review.maxContextBytes` bounds everything the model is handed: the composed
 * canonical prompt — role and contract prompts, scoped policy, requirements,
 * prior discussion, check evidence and the patch — plus the mirrored tree the
 * reviewer can read. Requirement content is part of that, and a requirement
 * larger than the limit must refuse the review rather than be trimmed to fit.
 */

const JIRA = 'https://example.atlassian.net/browse/ORD-17';

class CountingReviewer implements Reviewer {
  readonly requests: ReviewerRequest[] = [];
  async invoke(request: ReviewerRequest): Promise<ReviewerInvocation> {
    this.requests.push(request);
    return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] };
  }
}

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
  await runInit(setup, parseArgs('init', [], INIT_OPTIONS));

  const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
  const config = await nodeFileSystem.readText(configPath);
  await nodeFileSystem.writeText(
    configPath,
    config.replace(/maxContextBytes: \d+/, `maxContextBytes: ${maxContextBytes}`),
  );

  // Committed, so the working diff is the one source edit below rather than
  // the configuration init just wrote.
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
  it('refuses a requirement larger than the limit before calling the reviewer', async () => {
    const context = await fixture(8_192);
    try {
      // The patch is two lines; the requirement alone is over the limit.
      const huge = 'The orders service must reject negative amounts. '.repeat(400);
      assert.ok(byteLength(huge) > 8_192);
      const evidencePath = await evidence(context.repo, huge);

      const reviewer = new CountingReviewer();
      const error = await refusal(() =>
        runReview(
          context.runtime,
          parseArgs('review', ['--requirement', JIRA, '--evidence', evidencePath], REVIEW_OPTIONS),
          { reviewer },
        ),
      );

      assert.equal(error.code, 'input-too-large');
      // The reviewer was never started, and the measurement names the part
      // that was large rather than only the total.
      assert.equal(reviewer.requests.length, 0);
      assert.match(error.details.join('\n'), /measured components:/);
      assert.match(error.details.join('\n'), /requirement content: \d+ bytes/);
      assert.match(error.details.join('\n'), /does not truncate a change or a requirement to fit/);
    } finally {
      await context.dispose();
    }
  });

  it('counts the composed prompt, not only the patch, against the limit', async () => {
    // The patch is tiny but the canonical prompts, policy and scaffolding are
    // not: a limit that only saw the patch would let this through.
    const context = await fixture(4_096);
    try {
      const reviewer = new CountingReviewer();
      const error = await refusal(() =>
        runReview(context.runtime, parseArgs('review', [], REVIEW_OPTIONS), { reviewer }),
      );

      assert.equal(error.code, 'input-too-large');
      assert.equal(reviewer.requests.length, 0);
      assert.match(error.details.join('\n'), /composed prompt: \d+ bytes/);
      assert.match(error.details.join('\n'), /mirrored files the reviewer can read: \d+ bytes/);
    } finally {
      await context.dispose();
    }
  });

  it('measures the prompt that was actually composed and records it in the result', async () => {
    const context = await fixture(524_288);
    try {
      const reviewer = new CountingReviewer();
      const output = await runReview(context.runtime, parseArgs('review', [], REVIEW_OPTIONS), {
        reviewer,
      });

      const sent = reviewer.requests[0]?.prompt ?? '';
      assert.equal(output.result.inputs.promptBytes, byteLength(sent));
      assert.equal(
        output.result.inputs.contextBytes,
        output.result.inputs.promptBytes + output.result.inputs.snapshotBytes,
      );
      assert.ok(output.result.inputs.promptBytes > output.result.inputs.patchBytes);
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await context.dispose();
    }
  });
});
