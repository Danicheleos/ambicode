import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { parseArgs } from '../cli/args.ts';
import { INIT_OPTIONS, runInit } from '../cli/commands/init.ts';
import { REVIEW_OPTIONS, runReview, renderReview } from '../cli/commands/review.ts';
import { createRuntime } from '../composition/root.ts';
import type { ReviewerOutput } from '../contracts/review.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '../ports/process.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { REVIEWER_REPLAY_VARIABLE, ReplayReviewer, type ReviewerRecordings } from './replay-reviewer.ts';

class ClaudeGuard implements ProcessRunner {
  readonly claudeCalls: ProcessRequest[] = [];
  private readonly inner = new NodeProcessRunner(process.env);
  private readonly claude: FakeProcessRunner | undefined;

  constructor(claude?: FakeProcessRunner) {
    this.claude = claude;
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    if (request.argv[0] !== 'claude') return await this.inner.run(request);
    this.claudeCalls.push(request);
    if (this.claude !== undefined) return await this.claude.run(request);
    return {
      kind: 'spawn-failed',
      exitCode: null,
      stdout: '',
      stderr: '',
      truncated: false,
      durationMs: 0,
      failure: 'this test does not allow a reviewer process',
    };
  }
}

const ORDINARY_REVIEWER_KEYS = [
  'status',
  'model',
  'timeoutSeconds',
  'tools',
  'isolation',
  'rejections',
  'detail',
  'durationMs',
  'usage',
  'rejectedOutputRef',
];

const FINDING: ReviewerOutput['findings'][number] = {
  risk: 'high',
  confidence: 'high',
  category: 'correctness',
  location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 },
  supportingLocations: [],
  explanation: 'The total now sums the amounts; callers counted on the length.',
  suggestedComment: 'Is the change from a count to a sum intended?',
  ruleRefs: [],
  requirementRefs: [],
};

function recordings(snapshotId: string, output: Partial<ReviewerOutput> = {}): ReviewerRecordings {
  return {
    schemaVersion: 1,
    recordings: [
      {
        snapshotId,
        case: 'orders',
        model: 'sonnet',
        recordedFrom: 'evals/results/reviewer-x/raw/orders-ambicode-1.json',
        output: { findings: output.findings ?? [FINDING], coverageNotes: output.coverageNotes ?? ['Read src/orders.ts.'] },
      },
    ],
  };
}

describe('replay reviewer, selected by EVAL_AMBICODE_REVIEWER_REPLAY', () => {
  let repo: TempRepo;
  let scratch: string;
  let file: string;

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
    await repo.write('src/orders.ts', 'export function total(amounts: number[]) {\n  return amounts.length;\n}\n');
    await repo.commitAll('initial');
    await runInit(await createRuntime({ cwd: repo.root }), parseArgs('init', [], INIT_OPTIONS));
    await repo.write(
      'src/orders.ts',
      'export function total(amounts: number[]) {\n  return amounts.reduce((a, b) => a + b, 0);\n}\n',
    );
    // Outside the repository: inside it, the file would be part of the change.
    scratch = await mkdtemp(path.join(os.tmpdir(), 'ambicode-replay-'));
    file = path.join(scratch, 'recordings.json');
  });

  afterEach(async () => {
    await repo.dispose();
    await rm(scratch, { recursive: true, force: true });
  });

  async function review(env: Record<string, string | undefined>, runner: ProcessRunner) {
    const runtime = await createRuntime({ cwd: repo.root, env, runner });
    return await runReview(runtime, parseArgs('review', [], REVIEW_OPTIONS));
  }

  function without(...names: string[]): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const name of names) delete env[name];
    return env;
  }

  async function snapshotOfChange(): Promise<string> {
    const output = await review({ ...without(REVIEWER_REPLAY_VARIABLE), [REVIEWER_REPLAY_VARIABLE]: '/nonexistent' }, new ClaudeGuard());
    return output.result.target.snapshotId;
  }

  it('answers from the recording for this snapshot, labelled in result.json and on the summary line', async () => {
    const snapshotId = await snapshotOfChange();
    await writeFile(file, JSON.stringify(recordings(snapshotId)));
    const runner = new ClaudeGuard();

    const output = await review({ ...without(REVIEWER_REPLAY_VARIABLE), [REVIEWER_REPLAY_VARIABLE]: file }, runner);

    assert.equal(runner.claudeCalls.length, 0, 'a replay starts no reviewer process');
    const reviewer = output.result.reviewer;
    assert.ok(reviewer);
    assert.equal(reviewer.status, 'ok');
    assert.equal(reviewer.source, 'replay');
    assert.deepEqual(reviewer.tools, []);
    assert.deepEqual(reviewer.isolation, []);
    assert.match(reviewer.detail ?? '', /^replayed: no model was called in this run\. .*sonnet recording of orders/);
    assert.equal(output.result.findings.length, 1);
    assert.match(output.result.findings[0]?.evidence ?? '', /amounts\.reduce/);
    assert.ok(output.result.omissions.includes('Read src/orders.ts.'));
    assert.equal(output.result.status, 'partial');
    assert.match(output.result.statusReason ?? '', /replayed from a recording; no model reviewed the change in this run/);

    const onDisk = JSON.parse(await readFile(output.resultPath, 'utf8'));
    assert.equal(onDisk.reviewer.source, 'replay');
    assert.equal(Object.keys(onDisk.reviewer)[0], 'status');
    const summary = renderReview(output).split('\n').find((line) => line.startsWith('   reviewer '));
    assert.match(summary ?? '', /^ {3}reviewer {4}ok — model \S+, REPLAYED from a recording \(no model call\), tools \(none\)/);
  });

  it('fails, with the reason and the source, when no recording has this snapshot', async () => {
    await writeFile(file, JSON.stringify(recordings('working-0000000000000000')));
    const runner = new ClaudeGuard();

    const output = await review({ ...without(REVIEWER_REPLAY_VARIABLE), [REVIEWER_REPLAY_VARIABLE]: file }, runner);

    assert.equal(runner.claudeCalls.length, 0, 'a miss does not fall back to a model');
    const reviewer = output.result.reviewer;
    assert.ok(reviewer);
    assert.equal(reviewer.status, 'failed');
    assert.equal(reviewer.source, 'replay');
    assert.match(
      reviewer.detail ?? '',
      new RegExp(`^replay-miss: no recording for snapshot ${output.result.target.snapshotId} in .*recorded: orders working-0000000000000000`),
    );
    assert.equal(output.result.status, 'error');
    assert.deepEqual(output.result.findings, []);
    assert.match(renderReview(output), /REPLAYED from a recording/);
  });

  it('validates a replayed answer like any other, and refuses one this change cannot hold', async () => {
    const snapshotId = await snapshotOfChange();
    const elsewhere = { ...FINDING, location: { ...FINDING.location, oldPath: 'src/other.ts', newPath: 'src/other.ts' } };
    await writeFile(file, JSON.stringify(recordings(snapshotId, { findings: [elsewhere] })));

    const output = await review({ ...without(REVIEWER_REPLAY_VARIABLE), [REVIEWER_REPLAY_VARIABLE]: file }, new ClaudeGuard());

    assert.equal(output.result.reviewer?.status, 'failed');
    assert.equal(output.result.reviewer?.source, 'replay');
    assert.match(output.result.reviewer?.detail ?? '', /^invalid-output: /);
    assert.deepEqual(output.result.findings, []);
  });

  it('without the variable runs the process reviewer and writes the reviewer record as before', async () => {
    for (const env of [without(REVIEWER_REPLAY_VARIABLE), { ...without(REVIEWER_REPLAY_VARIABLE), [REVIEWER_REPLAY_VARIABLE]: '' }]) {
      const claude = new FakeProcessRunner()
        .stubArgv(['claude', '--help'], {
          stdout:
            '--print --safe-mode --restricted --strict-mcp-config --tools --disallowedTools ' +
            '--no-session-persistence --permission-prompts --output-format --model --json-schema ' +
            '--append-system-prompt[-file]',
        })
        .stubArgv(['claude', '--print'], { stdout: JSON.stringify({ result: { findings: [], coverageNotes: [] } }) });
      const runner = new ClaudeGuard(claude);

      const output = await review(env, runner);

      assert.deepEqual(
        runner.claudeCalls.map((call) => call.argv.slice(0, 2)),
        [['claude', '--help'], ['claude', '--print']],
      );
      const onDisk = JSON.parse(await readFile(output.resultPath, 'utf8'));
      assert.deepEqual(Object.keys(onDisk.reviewer), ORDINARY_REVIEWER_KEYS);
      assert.equal(onDisk.reviewer.status, 'ok');
      assert.doesNotMatch(renderReview(output), /REPLAY/i);
    }
  });
});

describe('replay reviewer, reading the recordings file', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), 'ambicode-replay-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const request = { systemPrompt: 's', prompt: 'p', workingDirectory: '/snapshot', model: 'sonnet', timeoutMs: 1 };

  async function invoke(recordingsPath: string, snapshotId = 'working-1') {
    return await new ReplayReviewer({ fs: nodeFileSystem, recordingsPath, snapshotId }).invoke(request);
  }

  async function reasonFor(contents: string | null, recordingsPath = path.join(scratch, 'recordings.json')) {
    if (contents !== null) await writeFile(recordingsPath, contents);
    const invocation = await invoke(recordingsPath);
    assert.equal(invocation.kind, 'error');
    return invocation.kind === 'error' ? `${invocation.reason}: ${invocation.detail}` : '';
  }

  it('refuses a relative path, which would resolve inside the repository under review', async () => {
    assert.match(await reasonFor(null, 'fixtures/reviewer-recordings.json'), /^replay-unreadable: .* must be an absolute path/);
  });

  it('names a missing file, a non-JSON file and a malformed one as distinct failures', async () => {
    assert.match(await reasonFor(null), /^replay-unreadable: cannot read /);
    assert.match(await reasonFor('{'), /^replay-invalid: .* is not JSON/);
    assert.match(await reasonFor(JSON.stringify({ schemaVersion: 1, recordings: [{ snapshotId: 'working-1' }] })), /^replay-invalid: .*recordings\.0/);
  });

  it('refuses two recordings for one snapshot rather than choosing between them', async () => {
    const twice = recordings('working-1');
    twice.recordings.push({ ...twice.recordings[0]!, case: 'orders-again' });
    assert.match(await reasonFor(JSON.stringify(twice)), /^replay-invalid: .* holds 2 recordings for snapshot working-1/);
  });

  it('always says where the answer came from', async () => {
    const recordingsPath = path.join(scratch, 'recordings.json');
    await writeFile(recordingsPath, JSON.stringify(recordings('working-1')));
    const invocation = await invoke(recordingsPath);
    assert.equal(invocation.kind, 'ok');
    assert.deepEqual(invocation.argv, ['replay', recordingsPath, 'working-1']);
    assert.match(invocation.kind === 'ok' ? (invocation.detail ?? '') : '', /evals\/results\/reviewer-x\/raw\/orders-ambicode-1\.json/);
  });
});
