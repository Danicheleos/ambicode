import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveEnvironment } from '../ports/process.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import {
  ClaudeReviewer,
  REVIEWER_ENV_ALLOWLIST,
  STRUCTURED_OUTPUT_ATTEMPTS,
  parseReviewerOutput,
  reviewerEnvironment,
} from './claude-reviewer.ts';

/**
 * The P1.4 corrections that concern the reviewer process: what environment it
 * receives, what envelope its answer arrives in, and whether Claude Code is
 * allowed to repair a schema failure behind AMBICODE's back.
 */

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'reviewer-envelopes',
);

function envelope(name: string): Promise<string> {
  return readFile(path.join(fixtures, name), 'utf8');
}

const ARGV = ['claude', '--print'];

function stubbedHelp(): FakeProcessRunner {
  return new FakeProcessRunner().stubArgv(['claude', '--help'], {
    stdout: [
      '--print --safe-mode --restricted --strict-mcp-config --tools --disallowedTools',
      '--no-session-persistence --permission-prompts --output-format --model --json-schema',
      '--append-system-prompt',
    ].join('\n'),
  });
}

describe('the reviewer receives only runtime and model authentication', () => {
  /** A host environment holding exactly the kinds of secret a developer has. */
  const host = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/dev',
    LANG: 'en_US.UTF-8',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    // Sentinels: every one of these must be absent from the child.
    GITLAB_TOKEN: 'glpat-SENTINEL-GITLAB',
    GLAB_TOKEN: 'glpat-SENTINEL-GLAB',
    GITHUB_TOKEN: 'ghp-SENTINEL-GITHUB',
    JIRA_API_TOKEN: 'SENTINEL-JIRA',
    NPM_TOKEN: 'SENTINEL-NPM',
    DATABASE_URL: 'postgres://user:SENTINEL-DB@db.internal/app',
    AWS_SECRET_ACCESS_KEY: 'SENTINEL-AWS',
    ACME_DEPLOY_KEY: 'SENTINEL-UNRELATED',
  };

  it('keeps every provider, ticket, registry, database and cloud secret out of the process', () => {
    const resolved = resolveEnvironment(reviewerEnvironment(), host);
    const serialized = JSON.stringify(resolved);

    for (const name of [
      'GITLAB_TOKEN',
      'GLAB_TOKEN',
      'GITHUB_TOKEN',
      'JIRA_API_TOKEN',
      'NPM_TOKEN',
      'DATABASE_URL',
      'AWS_SECRET_ACCESS_KEY',
      'ACME_DEPLOY_KEY',
    ]) {
      assert.equal(resolved[name], undefined, `${name} reached the reviewer`);
    }
    // Not merely unset: the value itself appears nowhere in the environment.
    assert.ok(!serialized.includes('SENTINEL'), serialized);
  });

  it('keeps the runtime and model-authentication inputs the reviewer needs', () => {
    const resolved = resolveEnvironment(reviewerEnvironment(), host);
    assert.equal(resolved.PATH, '/usr/bin:/bin');
    // HOME stays because subscription/keychain authentication reads it.
    assert.equal(resolved.HOME, '/home/dev');
    assert.equal(resolved.LANG, 'en_US.UTF-8');
    assert.equal(resolved.ANTHROPIC_API_KEY, 'sk-ant-test');
  });

  it('carries the same policy into the real spawn request, not only the helper', async () => {
    const runner = stubbedHelp().stubArgv(['claude', '--print'], {
      stdout: await envelope('success-structured-output.json'),
    });
    const reviewer = new ClaudeReviewer({ runner, cwd: '/work' });
    await reviewer.assertIsolationAvailable();
    await reviewer.invoke({
      systemPrompt: 'contract + role',
      prompt: 'review this',
      workingDirectory: '/tmp/ambicode-snapshot-x',
      model: 'sonnet',
      timeoutMs: 1_000,
    });

    for (const call of runner.calls) {
      assert.equal(call.env.kind, 'replacement');
      if (call.env.kind !== 'replacement') continue;
      assert.ok(!call.env.allow.includes('GITLAB_TOKEN'));
      assert.ok(!call.env.allow.includes('GLAB_TOKEN'));
      assert.deepEqual(resolveEnvironment(call.env, host).GITLAB_TOKEN, undefined);
    }
  });

  it('names no provider or ticket variable in its allowlist at all', () => {
    const suspicious = /GITLAB|GLAB|GITHUB|GH_|JIRA|ATLASSIAN|CONFLUENCE|NPM|PYPI|DOCKER|AWS|GOOGLE|AZURE|DATABASE|POSTGRES|MYSQL|REDIS/i;
    const offenders = REVIEWER_ENV_ALLOWLIST.filter((name) => suspicious.test(name));
    assert.deepEqual(offenders, []);
  });

  it('sets the structured-output retry cap deliberately rather than taking the default', async () => {
    const runner = stubbedHelp().stubArgv(['claude', '--print'], {
      stdout: await envelope('success-structured-output.json'),
    });
    await new ClaudeReviewer({ runner, cwd: '/work' }).invoke({
      systemPrompt: 's',
      prompt: 'p',
      workingDirectory: '/tmp/s',
      model: 'sonnet',
      timeoutMs: 1_000,
    });

    const call = runner.calls.at(-1);
    assert.ok(call);
    assert.equal(call.env.kind, 'replacement');
    if (call.env.kind !== 'replacement') return;
    // Claude Code retries a failed StructuredOutput call up to five times by
    // default. One attempt means a schema failure is reported, not repaired.
    assert.equal(call.env.set?.MAX_STRUCTURED_OUTPUT_RETRIES, STRUCTURED_OUTPUT_ATTEMPTS);
    assert.equal(STRUCTURED_OUTPUT_ATTEMPTS, '1');
  });
});

describe('the real Claude Code structured-output envelope', () => {
  it('reads the answer from structured_output and ignores the closing prose', async () => {
    const invocation = parseReviewerOutput(await envelope('success-structured-output.json'), ARGV);
    assert.equal(invocation.kind, 'ok');
    if (invocation.kind !== 'ok') return;
    assert.equal(invocation.output.findings.length, 1);
    assert.equal(invocation.output.findings[0]?.location.line, 2);
    assert.deepEqual(invocation.output.coverageNotes, [
      'Callers of total() outside the snapshot were not available.',
    ]);
  });

  it('still accepts an answer that arrives only as a JSON string in result', async () => {
    const invocation = parseReviewerOutput(await envelope('success-legacy-result-string.json'), ARGV);
    assert.equal(invocation.kind, 'ok');
    if (invocation.kind !== 'ok') return;
    assert.deepEqual(invocation.output.findings, []);
  });

  it('keeps missing, malformed, exhausted, errored and truncated envelopes distinct', async () => {
    const cases: [string, string][] = [
      ['missing-structured-output.json', 'no-structured-output'],
      ['malformed-structured-output.json', 'schema'],
      ['error-retry-exhausted.json', 'structured-output-exhausted'],
      ['error-during-execution.json', 'reviewer-error'],
    ];
    for (const [file, reason] of cases) {
      const invocation = parseReviewerOutput(await envelope(file), ARGV);
      assert.equal(invocation.kind, 'error', file);
      assert.equal(invocation.kind === 'error' ? invocation.reason : null, reason, file);
    }

    const truncated = parseReviewerOutput(await envelope('truncated.txt'), ARGV);
    assert.equal(truncated.kind === 'error' ? truncated.reason : null, 'unparsable');
  });

  it('does not parse `result` when structured_output is present but invalid', async () => {
    // The prose in `result` says "Findings returned." A parser that fell back
    // to it on a schema failure would turn a rejected answer into a clean one.
    const invocation = parseReviewerOutput(await envelope('malformed-structured-output.json'), ARGV);
    assert.equal(invocation.kind, 'error');
    if (invocation.kind !== 'error') return;
    assert.equal(invocation.reason, 'schema');
    assert.match(invocation.detail, /does not match the required schema/);
  });

  it('reports a truncated capture before it reaches the parser', async () => {
    const runner = new FakeProcessRunner().stubArgv(['claude', '--print'], {
      stdout: await envelope('truncated.txt'),
      truncated: true,
    });
    const invocation = await new ClaudeReviewer({ runner, cwd: '/w' }).invoke({
      systemPrompt: 's',
      prompt: 'p',
      workingDirectory: '/tmp/s',
      model: 'sonnet',
      timeoutMs: 1_000,
    });
    assert.equal(invocation.kind === 'error' ? invocation.reason : null, 'truncated');
  });
});
