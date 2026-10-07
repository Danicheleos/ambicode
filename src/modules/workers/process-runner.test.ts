import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClaudeReviewer, REVIEWER_JSON_SCHEMA } from '#modules/review/reviewer/claude-reviewer';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { reviewerIo } from '#testing/fakes/reviewer-io';
import { defaultWorkerEnvironment, runWorkerProcess, type WorkerProcessRequest } from './process-runner.ts';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';

const BASE = { argv: ['claude', '--print'], cwd: '/w', timeoutMs: 5_000, maxOutputBytes: 100 };

function exited(over: Partial<ProcessOutcome> = {}): Partial<ProcessOutcome> {
  return { kind: 'exited', exitCode: 0, ...over };
}

async function run(request: Partial<WorkerProcessRequest>, outcome: Partial<ProcessOutcome> = exited()) {
  const runner = new FakeProcessRunner().stub(() => true, outcome);
  const result = await runWorkerProcess(runner, { ...BASE, ...request });
  return { runner, result };
}

const BASELINE_ENV = {
  kind: 'replacement',
  allow: [
    'PATH', 'HOME', 'USER', 'TMPDIR', 'CLAUDE_CODE_TMPDIR', 'LANG', 'LC_ALL', 'TERM',
    'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
  ],
  set: { MAX_STRUCTURED_OUTPUT_RETRIES: '3' },
};

const SCHEMA = JSON.stringify(REVIEWER_JSON_SCHEMA);
const SYSTEM_FILE = '<system-prompt-file>';
const BASELINE_ARGV = [
  'claude', '--print', '--safe-mode', '--restricted', '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}',
  '--disallowedTools', 'Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent',
  '--permission-prompts', 'none', '--no-session-persistence', '--model', 'sonnet',
  '--append-system-prompt-file', SYSTEM_FILE, '--output-format', 'json', '--tools', 'Read,Grep,Glob', '--json-schema', SCHEMA,
];
const BASELINE_REQUESTS: ProcessRequest[] = [
  { argv: ['claude', '--help'], cwd: '/work', timeoutMs: 30_000, maxOutputBytes: 1024 * 1024, env: BASELINE_ENV as never },
  {
    argv: BASELINE_ARGV, cwd: '/tmp/ambicode-snapshot-x', timeoutMs: 1_000, maxOutputBytes: 4 * 1024 * 1024,
    env: BASELINE_ENV as never, stdin: 'review this',
  },
];

describe('process runner', () => {
  it('06-W1: appends optional flags only when present, in order', async () => {
    const all = await run({ maxTurns: 4, maxBudgetUsd: 0.5, jsonSchema: { a: 1 }, tools: ['Read', 'Grep'] });
    assert.deepEqual(all.runner.calls[0]?.argv, [
      'claude', '--print', '--tools', 'Read,Grep', '--json-schema', '{"a":1}', '--max-budget-usd', '0.5', '--max-turns', '4',
    ]);
    const some = await run({ maxTurns: 2, tools: ['Read'] });
    assert.deepEqual(some.runner.calls[0]?.argv, ['claude', '--print', '--tools', 'Read', '--max-turns', '2']);
    const none = await run({});
    assert.deepEqual(none.runner.calls[0]?.argv, BASE.argv);
  });

  it('06-W1: calls the runner once with exactly the request fields, stdin only when given', async () => {
    const without = await run({});
    assert.equal(without.runner.calls.length, 1);
    assert.deepEqual(without.runner.calls[0], { ...BASE, env: defaultWorkerEnvironment() });
    const withStdin = await run({ stdin: 'hi', env: { kind: 'inherited' } });
    assert.deepEqual(withStdin.runner.calls[0], { ...BASE, env: { kind: 'inherited' }, stdin: 'hi' });
  });

  it('06-W1: the default environment is the replacement allowlist', () => {
    assert.deepEqual(defaultWorkerEnvironment(), BASELINE_ENV);
  });

  it('06-W2: classifies ok and carries the argv and outcome', async () => {
    const { result } = await run({ tools: ['Read'] }, exited({ stdout: 'x' }));
    assert.equal(result.kind, 'ok');
    assert.deepEqual(result.argv, ['claude', '--print', '--tools', 'Read']);
    assert.equal(result.outcome.stdout, 'x');
  });

  it('06-W2: spawn-failed, timed-out, truncated, nonzero-exit', async () => {
    const reason = async (outcome: Partial<ProcessOutcome>) => {
      const { result } = await run({}, outcome);
      return result.kind === 'failed' ? result.reason : result.kind;
    };
    assert.equal(await reason({ kind: 'spawn-failed', failure: 'ENOENT' }), 'spawn-failed');
    assert.equal(await reason({ kind: 'timed-out' }), 'timed-out');
    assert.equal(await reason(exited({ truncated: true })), 'truncated');
    assert.equal(await reason(exited({ exitCode: 2 })), 'nonzero-exit');
  });

  it('06-W2: precedence is spawn-failed, timed-out, truncated, nonzero-exit', async () => {
    const reason = async (outcome: Partial<ProcessOutcome>) => {
      const { result } = await run({}, outcome);
      return result.kind === 'failed' ? result.reason : result.kind;
    };
    assert.equal(await reason({ kind: 'spawn-failed', truncated: true, exitCode: 1 }), 'spawn-failed');
    assert.equal(await reason({ kind: 'timed-out', truncated: true, exitCode: 1 }), 'timed-out');
    assert.equal(await reason(exited({ truncated: true, exitCode: 1 })), 'truncated');
  });

  it('06-W3: the reviewer sends the baseline requests and the same environment', async () => {
    const help = ['--print --safe-mode --restricted --strict-mcp-config --tools --disallowedTools',
      '--no-session-persistence --permission-prompts --output-format --model --json-schema',
      '--append-system-prompt[-file]'].join('\n');
    const runner: ProcessRunner & { calls: ProcessRequest[] } = new FakeProcessRunner()
      .stubArgv(['claude', '--help'], { stdout: help })
      .stubArgv(['claude', '--print'], { stdout: '{}' });
    const io = reviewerIo();
    const reviewer = new ClaudeReviewer({ runner, ...io, cwd: '/work' });
    await reviewer.assertIsolationAvailable();
    await reviewer.invoke({
      systemPrompt: 'sys', prompt: 'review this', workingDirectory: '/tmp/ambicode-snapshot-x', model: 'sonnet', timeoutMs: 1_000,
    });
    assert.deepEqual(runner.calls.map((call) => call.purpose), [undefined, 'reviewer']);
    const captured = runner.calls.map(({ purpose: _purpose, ...call }) => ({ ...call, argv: call.argv.map((a) => (a.endsWith('system-prompt.md') ? SYSTEM_FILE : a)) }));
    assert.deepEqual(captured, BASELINE_REQUESTS);
  });
});
