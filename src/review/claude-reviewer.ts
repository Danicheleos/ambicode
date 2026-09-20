import { z } from 'zod';
import { ReviewerOutput } from '../contracts/review.ts';
import type { EnvironmentPolicy, ProcessRunner } from '../ports/process.ts';
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

/**
 * The only host variables the reviewer process receives: what the runtime needs
 * to start and what authenticates it to the model provider. Everything else the
 * developer's shell holds — `GITLAB_TOKEN`, `GLAB_TOKEN`, `GH_TOKEN`, Jira and
 * registry tokens, database URLs, cloud workload identity — is absent from the
 * child process, not merely unused by it (doc 02, "Reviewer invocation").
 *
 * `HOME` and the XDG locations stay because subscription/keychain
 * authentication is the supported configuration and it reads them; an
 * API-key or OAuth-token configuration is carried by the ANTHROPIC/CLAUDE
 * names below.
 */
export const REVIEWER_ENV_ALLOWLIST = [
  // Runtime.
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TERM',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  // TLS trust and egress, without which the model call cannot be made at all.
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
  // Model authentication only.
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/**
 * Claude Code retries a StructuredOutput call that fails schema validation, up
 * to `MAX_STRUCTURED_OUTPUT_RETRIES` (default 5) times, and the retries are
 * invisible in the result envelope. Doc 02 forbids an automatic model-repair
 * loop, so the cap is set to one attempt deliberately: a schema failure comes
 * back as `error_max_structured_output_retries` and becomes a review error,
 * rather than a quietly repaired finding list.
 */
export const STRUCTURED_OUTPUT_ATTEMPTS = '1';

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

/**
 * The envelope `--print --output-format json` emits. Schema-constrained output
 * arrives in `structured_output`; `result` carries the assistant's final text,
 * which is not the answer when a schema is in force. A successful run is
 * `{type:"result", subtype:"success", is_error:false, …, structured_output:{…}}`
 * and a failed one carries an error subtype such as
 * `error_max_structured_output_retries` with `is_error:true`.
 */
const Envelope = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  structured_output: z.unknown().optional(),
  errors: z.unknown().optional(),
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
      env: reviewerEnvironment(),
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
      env: reviewerEnvironment(),
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
 * The reviewer's environment: runtime and model authentication, and nothing
 * else the host happens to hold. The structured-output retry cap is set here
 * rather than left to its default, so a schema failure is reported instead of
 * repaired (see `STRUCTURED_OUTPUT_ATTEMPTS`).
 */
export function reviewerEnvironment(): EnvironmentPolicy {
  return {
    kind: 'replacement',
    allow: [...REVIEWER_ENV_ALLOWLIST],
    set: { MAX_STRUCTURED_OUTPUT_RETRIES: STRUCTURED_OUTPUT_ATTEMPTS },
  };
}

/**
 * Unwraps the CLI envelope and validates the answer against the shared Zod
 * contract. Anything that does not match is a review error with diagnostics,
 * never an empty finding list (doc 02).
 *
 * Schema-constrained output lives in `structured_output`. When that field is
 * present it is the answer, and `result` — which holds the model's final prose
 * — is not consulted, so a chatty closing sentence cannot be mistaken for a
 * malformed answer. Only an envelope without the field falls back to parsing
 * `result`, which is what an installation without structured-output support
 * returns.
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

  const data = parsedEnvelope.data;
  if (data.is_error === true) {
    const subtype = data.subtype ?? 'unknown';
    return fail(
      argv,
      subtype === 'error_max_structured_output_retries' ? 'structured-output-exhausted' : 'reviewer-error',
      `the reviewer reported an error (${subtype}): ${describe(data.errors ?? data.result)}`,
    );
  }

  if (data.structured_output === undefined || data.structured_output === null) {
    // A `result` field can still carry the answer on an installation that does
    // not implement structured output; anything else is a missing answer, and
    // that is distinct from an answer that failed validation.
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
