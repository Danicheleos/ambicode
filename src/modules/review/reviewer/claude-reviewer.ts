import path from 'node:path';
import { z } from 'zod';
import { ReviewerOutput, REVIEWER_TOOLS, type ReviewerUsage } from '#types/modules/review';
import { markOwned } from '../page/cleanup.ts';
import { AmbicodeError, messageOf } from '#util/errors';
import { runWorkerProcess } from '#modules/workers/process-runner';
import { describeOutcome } from '#platform/ports/process';
import { STRUCTURED_OUTPUT_ATTEMPTS } from '#types/modules/workers';
import type { Clock, FileSystem, ProcessRunner, Reviewer, ReviewerInvocation, ReviewerRequest } from '#types/platform/ports';

/**
 * A fresh Claude Code process per review: three read tools, no MCP, no session on
 * disk, the sanitized snapshot as cwd. The checkout is not accessible and no
 * provider credential is passed.
 */

/** Named explicitly as well, so a default that changes cannot quietly add one. */
const DENIED_TOOLS = [
  'Bash',
  'Write',
  'Edit',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
] as const;

/**
 * If the installed Claude Code lacks any of these, the isolation the review claims
 * does not exist, so the review is refused.
 */
export const REQUIRED_FLAGS = [
  '--print',
  '--safe-mode',
  '--restricted',
  '--strict-mcp-config',
  '--tools',
  '--disallowedTools',
  '--no-session-persistence',
  '--permission-prompts',
  '--output-format',
  '--model',
  // `--append-system-prompt` is absent: its name prefixes both spellings of the file
  // variant, so probing for it could never fail. `SYSTEM_PROMPT_FILE_HELP` is the check.
] as const;

/**
 * A file, never an argument: on Windows `claude.cmd` runs through `cmd.exe`, which
 * treats CR and LF as command separators with no escape, so the multi-line
 * contract (built from project policy packs) would be an injection vector.
 */
const SYSTEM_PROMPT_FILE_FLAG = '--append-system-prompt-file';

/**
 * `--help` spells the file variant only as `--append-system-prompt[-file]` inside
 * `--bare` (Claude Code 2.1.278). Accept either spelling; a version printing
 * neither has no file variant.
 */
const SYSTEM_PROMPT_FILE_HELP = ['--append-system-prompt-file', '--append-system-prompt[-file]'];

const REVIEWER_PROMPT_PREFIX = 'ambicode-reviewer-';
const SYSTEM_PROMPT_FILE = 'system-prompt.md';

const CAPABILITY_TIMEOUT_MS = 30_000;

export const REVIEWER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings', 'coverageNotes'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['risk', 'confidence', 'category', 'location', 'explanation', 'suggestedComment'],
        properties: {
          risk: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string' },
          location: { $ref: '#/$defs/location' },
          supportingLocations: { type: 'array', items: { $ref: '#/$defs/location' } },
          explanation: { type: 'string' },
          suggestedComment: { type: 'string' },
          ruleRefs: { type: 'array', items: { type: 'string' } },
          requirementRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    coverageNotes: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    location: {
      type: 'object',
      additionalProperties: false,
      required: ['oldPath', 'newPath', 'side', 'line'],
      properties: {
        oldPath: { type: ['string', 'null'] },
        newPath: { type: ['string', 'null'] },
        side: { type: 'string', enum: ['old', 'new'] },
        line: { type: 'integer', minimum: 1 },
      },
    },
  },
} as const;

const Envelope = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  structured_output: z.unknown().optional(),
  errors: z.unknown().optional(),
});

interface ClaudeReviewerOptions {
  runner: ProcessRunner;
  fs: FileSystem;
  clock: Clock;
  cwd: string;
  executable?: string;
  maxOutputBytes?: number;
}

export class ClaudeReviewer implements Reviewer {
  private readonly runner: ProcessRunner;
  private readonly fs: FileSystem;
  private readonly clock: Clock;
  private readonly cwd: string;
  private readonly executable: string;
  private readonly maxOutputBytes: number;

  constructor(options: ClaudeReviewerOptions) {
    this.runner = options.runner;
    this.fs = options.fs;
    this.clock = options.clock;
    this.cwd = options.cwd;
    this.executable = options.executable ?? 'claude';
    this.maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
  }

  async assertIsolationAvailable(): Promise<void> {
    const probe = await runWorkerProcess(this.runner, {
      argv: [this.executable, '--help'],
      cwd: this.cwd,
      timeoutMs: CAPABILITY_TIMEOUT_MS,
      maxOutputBytes: 1024 * 1024,
    });

    const { outcome } = probe;
    const failure = probe.kind === 'failed' ? probe.reason : null;
    if (failure === 'spawn-failed') {
      throw new AmbicodeError('reviewer-unavailable', 'Claude Code could not be started for the review.', {
        details: [
          outcome.failure ?? 'unknown spawn failure',
          `AMBICODE runs the reviewer as a separate "${this.executable}" process.`,
        ],
      });
    }
    if (failure === 'timed-out' || outcome.exitCode !== 0) {
      throw new AmbicodeError('reviewer-unavailable', 'Claude Code did not report its capabilities.', {
        details: [`${this.executable} --help ${describeOutcome(outcome)}.`],
      });
    }

    const help = `${outcome.stdout}${outcome.stderr}`;
    if (!SYSTEM_PROMPT_FILE_HELP.some((spelling) => help.includes(spelling))) {
      throw new AmbicodeError(
        'reviewer-unavailable',
        `The installed Claude Code does not offer ${SYSTEM_PROMPT_FILE_FLAG}, so the review was not run.`,
        {
          details: [
            'AMBICODE hands the reviewer its system prompt as a file rather than as an argument.',
            'A multi-line argument cannot be passed to claude.cmd on Windows: cmd.exe treats CR and LF as command separators, so it would be a command-injection vector.',
            'Update Claude Code to a version that offers the file variant.',
          ],
        },
      );
    }

    const missing = REQUIRED_FLAGS.filter((flag) => !help.includes(flag));
    if (missing.length > 0) {
      throw new AmbicodeError(
        'reviewer-isolation-unavailable',
        'The installed Claude Code does not offer the options the reviewer isolation is built from, so the review was not run.',
        {
          details: [
            `Missing: ${missing.join(', ')}.`,
            'AMBICODE will not run a reviewer with less isolation than its result claims.',
            'Update Claude Code, or record this environment as unable to run independent review.',
          ],
        },
      );
    }
  }

  argvFor(request: ReviewerRequest, systemPromptFile: string): string[] {
    return [
      this.executable,
      '--print',
      // No CLAUDE.md, skills, plugins, hooks, MCP servers or output styles.
      '--safe-mode',
      // No command-running tools, no settings files, file tools confined to cwd.
      '--restricted',
      // Only servers from --mcp-config, and that config declares none.
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--disallowedTools',
      DENIED_TOOLS.join(','),
      '--permission-prompts',
      'none',
      '--no-session-persistence',
      '--model',
      request.model,
      SYSTEM_PROMPT_FILE_FLAG,
      systemPromptFile,
      '--output-format',
      'json',
    ];
  }

  async invoke(request: ReviewerRequest): Promise<ReviewerInvocation> {
    // Outside the snapshot: file tools are confined to `cwd`, so the reviewer can't
    // read its system prompt back or treat it as material under review.
    const promptDirectory = await this.fs.temporaryDirectory(REVIEWER_PROMPT_PREFIX);
    try {
      await markOwned(this.fs, promptDirectory, 'reviewer-prompt', this.clock, process.pid);
      const systemPromptFile = path.join(promptDirectory, SYSTEM_PROMPT_FILE);
      await this.fs.writeText(systemPromptFile, request.systemPrompt);
      return await this.run(request, this.argvFor(request, systemPromptFile));
    } finally {
      await this.fs.remove(promptDirectory).catch(() => undefined);
    }
  }

  private async run(request: ReviewerRequest, baseArgv: string[]): Promise<ReviewerInvocation> {
    const result = await runWorkerProcess(this.runner, {
      argv: baseArgv,
      cwd: request.workingDirectory,
      timeoutMs: request.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      // Large and may hold option-like text; stdin keeps it out of the argument vector.
      stdin: request.prompt,
      purpose: 'reviewer',
      tools: REVIEWER_TOOLS,
      jsonSchema: REVIEWER_JSON_SCHEMA,
    });
    const { outcome, argv } = result;

    if (result.kind === 'ok') return parseReviewerOutput(outcome.stdout, argv);
    switch (result.reason) {
      case 'spawn-failed':
        return fail(argv, 'spawn-failed', outcome.failure ?? 'the reviewer process could not be started');
      case 'timed-out':
        return fail(argv, 'timed-out', `the reviewer did not answer within ${Math.round(request.timeoutMs / 1000)} seconds`);
      case 'truncated':
        return fail(argv, 'truncated', 'the reviewer produced more output than AMBICODE reads, so it was not parsed');
    }
    // A nonzero exit still prints the envelope, the only thing that says what went
    // wrong. An envelope that parses as success is still not accepted: the process
    // said it failed.
    const classified = outcome.stdout.trim() === '' ? null : parseReviewerOutput(outcome.stdout, argv);
    if (classified?.kind === 'error') return classified;
    const failed = fail(
      argv,
      'nonzero-exit',
      `the reviewer exited ${outcome.exitCode}: ${firstLine(outcome.stderr) || firstLine(outcome.stdout) || 'no diagnostic'}`,
    );
    return classified?.usage === undefined ? failed : { ...failed, usage: classified.usage };
  }
}

/**
 * Anything off the Zod contract is a review error, never an empty finding list.
 * `structured_output` wins, so closing prose in `result` cannot look malformed;
 * `result` is parsed only when the field is absent.
 */
export function parseReviewerOutput(stdout: string, argv: readonly string[]): ReviewerInvocation {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    return fail(argv, 'unparsable', `the reviewer did not return JSON: ${messageOf(error)}`);
  }
  const invocation = parseEnvelope(envelope, stdout, argv);
  const usage = usageOf(envelope);
  return usage === null ? invocation : { ...invocation, usage };
}

function parseEnvelope(envelope: unknown, stdout: string, argv: readonly string[]): ReviewerInvocation {
  const parsedEnvelope = Envelope.safeParse(envelope);
  if (!parsedEnvelope.success) {
    return fail(argv, 'unparsable', 'the reviewer returned JSON that is not a Claude Code result envelope');
  }

  const data = parsedEnvelope.data;
  if (data.is_error === true) {
    const subtype = data.subtype ?? 'unknown';
    if (subtype === 'error_max_structured_output_retries' || subtype === 'structured_output_retry_exhausted') {
      return fail(
        argv,
        'structured-output-exhausted',
        `the reviewer finished its analysis but could not express it in the required shape, ${STRUCTURED_OUTPUT_ATTEMPTS} attempt(s) running: ${describe(data.errors ?? data.result)}. Nothing it found survived, so there is no partial result to report. The target is pinned by revision, so re-running reviews the identical change.`,
      );
    }
    return fail(argv, 'reviewer-error', `the reviewer reported an error (${subtype}): ${describe(data.errors ?? data.result)}`);
  }

  if (data.structured_output === undefined || data.structured_output === null) {
    if (data.result === undefined || data.result === null) {
      return fail(
        argv,
        'no-structured-output',
        'the reviewer returned a result envelope with no structured_output, so it produced no answer to validate',
      );
    }
    return validateAnswer(data.result, argv, stdout);
  }

  return validateAnswer(data.structured_output, argv, stdout);
}

function validateAnswer(payload: unknown, argv: readonly string[], stdout: string): ReviewerInvocation {
  let candidate = payload;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return fail(argv, 'unparsable', `the reviewer's answer is not JSON: ${messageOf(error)}`);
    }
  }

  const parsed = ReviewerOutput.safeParse(candidate);
  if (!parsed.success) {
    return fail(
      argv,
      'schema',
      `the reviewer's answer does not match the required schema: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return { kind: 'ok', output: parsed.data, rawLength: stdout.length, argv };
}

function usageOf(data: unknown): ReviewerUsage | null {
  if (data === null || typeof data !== 'object') return null;
  const envelope = data as Record<string, unknown>;
  const tokens = envelope['usage'];
  const tokenCounts = recordOf(tokens);
  const usage: ReviewerUsage = {
    turns: count(envelope['num_turns']),
    apiDurationMs: count(envelope['duration_api_ms']),
    outputTokens: count(tokenCounts['output_tokens']),
    costUsd: amount(envelope['total_cost_usd']),
    thinkingTokens: count(recordOf(tokenCounts['output_tokens_details'])['thinking_tokens']),
  };
  return Object.values(usage).every((value) => value === null) ? null : usage;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function fail(argv: readonly string[], reason: string, detail: string): ReviewerInvocation {
  return { kind: 'error', reason, detail, argv };
}

function describe(value: unknown): string {
  return typeof value === 'string' ? firstLine(value) : JSON.stringify(value).slice(0, 200);
}

function firstLine(value: string): string {
  return value.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}
