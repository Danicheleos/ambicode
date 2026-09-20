import { z } from 'zod';
import { ReviewerOutput } from '../contracts/review.ts';
import type { ProcessRunner } from '../ports/process.ts';
import type { Reviewer, ReviewerInvocation, ReviewerRequest } from '../ports/reviewer.ts';
import { AmbicodeError } from '../util/errors.ts';

/**
 * A fresh Claude Code process per review, through the shared process port
 * (doc 02). It is given three read tools, no MCP, no session on disk, and the
 * sanitized snapshot as its working directory — the product checkout is not an
 * accessible directory and no provider credential is passed.
 */

/** The only tools the reviewer may have. */
export const REVIEWER_TOOLS = ['Read', 'Grep', 'Glob'] as const;

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
 * Flags the isolation depends on. If the installed Claude Code does not offer
 * one of them, the boundary this review claims does not exist, so the review is
 * refused rather than run with less isolation than it reports (doc 02).
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
] as const;

const CAPABILITY_TIMEOUT_MS = 30_000;

/** The reviewer's JSON contract, handed to the process as a schema. */
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

/** The envelope `--output-format json` wraps the answer in. */
const Envelope = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  structured_result: z.unknown().optional(),
});

export interface ClaudeReviewerOptions {
  runner: ProcessRunner;
  /** Where the capability probe runs; the review itself runs in the snapshot. */
  cwd: string;
  /** Overridable so a test can point at a stub without a PATH lookup. */
  executable?: string;
  /** Bounded capture; a truncated answer is rejected, never half-parsed. */
  maxOutputBytes?: number;
}

export class ClaudeReviewer implements Reviewer {
  private readonly runner: ProcessRunner;
  private readonly cwd: string;
  private readonly executable: string;
  private readonly maxOutputBytes: number;

  constructor(options: ClaudeReviewerOptions) {
    this.runner = options.runner;
    this.cwd = options.cwd;
    this.executable = options.executable ?? 'claude';
    this.maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
  }

  /**
   * Proves the installed CLI still offers every flag the isolation is built
   * from. Managed policy can still impose behaviour this cannot see; M11 is
   * where that is checked against a live process.
   */
  async assertIsolationAvailable(): Promise<void> {
    const outcome = await this.runner.run({
      argv: [this.executable, '--help'],
      cwd: this.cwd,
      timeoutMs: CAPABILITY_TIMEOUT_MS,
      maxOutputBytes: 1024 * 1024,
    });

    if (outcome.kind === 'spawn-failed') {
      throw new AmbicodeError('reviewer-unavailable', 'Claude Code could not be started for the review.', {
        details: [
          outcome.failure ?? 'unknown spawn failure',
          `AMBICODE runs the reviewer as a separate "${this.executable}" process.`,
        ],
      });
    }
    if (outcome.kind === 'timed-out' || outcome.exitCode !== 0) {
      throw new AmbicodeError('reviewer-unavailable', 'Claude Code did not report its capabilities.', {
        details: [`${this.executable} --help ${outcome.kind === 'timed-out' ? 'timed out' : `exited ${outcome.exitCode}`}.`],
      });
    }

    const help = `${outcome.stdout}${outcome.stderr}`;
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

  /** The exact argument vector, exposed so the result can record what ran. */
  argvFor(request: ReviewerRequest): string[] {
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
      '--tools',
      REVIEWER_TOOLS.join(','),
      '--disallowedTools',
      DENIED_TOOLS.join(','),
      '--permission-prompts',
      'none',
      '--no-session-persistence',
      '--model',
      request.model,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(REVIEWER_JSON_SCHEMA),
    ];
  }

  async invoke(request: ReviewerRequest): Promise<ReviewerInvocation> {
    const argv = this.argvFor(request);
    const outcome = await this.runner.run({
      argv,
      // The sanitized snapshot, and nothing is added as an extra directory.
      cwd: request.workingDirectory,
      timeoutMs: request.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      // The prompt is large and may hold option-like text; stdin keeps it out
      // of the argument vector entirely.
      stdin: request.prompt,
    });

    if (outcome.kind === 'spawn-failed') {
      return fail(argv, 'spawn-failed', outcome.failure ?? 'the reviewer process could not be started');
    }
    if (outcome.kind === 'timed-out') {
      return fail(
        argv,
        'timed-out',
        `the reviewer did not answer within ${Math.round(request.timeoutMs / 1000)} seconds`,
      );
    }
    if (outcome.truncated) {
      return fail(argv, 'truncated', 'the reviewer produced more output than AMBICODE reads, so it was not parsed');
    }
    if (outcome.exitCode !== 0) {
      return fail(
        argv,
        'nonzero-exit',
        `the reviewer exited ${outcome.exitCode}: ${firstLine(outcome.stderr) || firstLine(outcome.stdout) || 'no diagnostic'}`,
      );
    }

    return parseReviewerOutput(outcome.stdout, argv);
  }
}

/**
 * Unwraps the CLI envelope and validates the answer against the shared Zod
 * contract. Anything that does not match is a review error with diagnostics,
 * never an empty finding list (doc 02).
 */
export function parseReviewerOutput(stdout: string, argv: readonly string[]): ReviewerInvocation {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    return fail(argv, 'unparsable', `the reviewer did not return JSON: ${messageOf(error)}`);
  }

  const parsedEnvelope = Envelope.safeParse(envelope);
  if (!parsedEnvelope.success) {
    return fail(argv, 'unparsable', 'the reviewer returned JSON that is not a Claude Code result envelope');
  }
  if (parsedEnvelope.data.is_error === true) {
    return fail(argv, 'reviewer-error', `the reviewer reported an error: ${describe(parsedEnvelope.data.result)}`);
  }

  const payload = parsedEnvelope.data.structured_result ?? parsedEnvelope.data.result ?? envelope;
  let candidate: unknown = payload;
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

function fail(argv: readonly string[], reason: string, detail: string): ReviewerInvocation {
  return { kind: 'error', reason, detail, argv };
}

function describe(value: unknown): string {
  return typeof value === 'string' ? firstLine(value) : JSON.stringify(value).slice(0, 200);
}

function firstLine(value: string): string {
  return value.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
