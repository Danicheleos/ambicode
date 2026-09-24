import path from 'node:path';
import { z } from 'zod';
import { ReviewerOutput, type ReviewerUsage } from '../contracts/review.ts';
import { markOwned } from '../page/cleanup.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
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
  // `--append-system-prompt` is deliberately absent: the reviewer passes the
  // file variant instead, and probing for the inline flag could never fail on
  // its own because its name is a prefix of both spellings of the file one.
  // `SYSTEM_PROMPT_FILE_HELP` below is the check that carries that weight.
] as const;

/**
 * The system prompt is handed over as a file, never as an argument.
 *
 * On Windows `claude` resolves to `claude.cmd`, which cannot be spawned
 * directly: it goes through `cmd.exe`, and `cmd.exe` treats CR and LF as
 * command separators with no escape available. An argument holding the
 * multi-line operating contract is therefore rejected outright — allowing it
 * would be a command-injection vector, and the contract is composed from
 * project-controlled policy packs. The file variant keeps every newline out of
 * the argument vector, so one code path works on Linux, macOS and Windows.
 */
export const SYSTEM_PROMPT_FILE_FLAG = '--append-system-prompt-file';

/**
 * `--help` does not print the flag literally: it lists
 * `--append-system-prompt <prompt>` and mentions the file variant only inside
 * the `--bare` description, spelled `--append-system-prompt[-file]`. Verified
 * against Claude Code 2.1.278, where the flag itself works. Accept either
 * spelling; a version that prints neither has no file variant to use.
 */
const SYSTEM_PROMPT_FILE_HELP = ['--append-system-prompt-file', '--append-system-prompt[-file]'];

/** The reviewer's own temporary directory, and the file inside it. */
const REVIEWER_PROMPT_PREFIX = 'ambicode-reviewer-';
const SYSTEM_PROMPT_FILE = 'system-prompt.md';

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
 * How many times Claude Code may re-ask the model to emit its answer in the
 * required shape (`MAX_STRUCTURED_OUTPUT_RETRIES`, default 5).
 *
 * This was `'1'` — no retry at all — on the reasoning that doc 02 forbids an
 * automatic model-repair loop. That conflated two different things. A retry
 * does not repair a *finding*: it tells the model its tool input did not match
 * the schema and asks for the same answer again, correctly serialized. What
 * doc 02 actually forbids is AMBICODE accepting an answer it has not checked,
 * and the guard for that is `parseReviewerOutput` below, which validates
 * against the Zod contract and fails the review rather than degrading to an
 * empty finding list. That guard is unaffected by this number.
 *
 * What `'1'` did buy was a review thrown away whenever the model mis-serialized
 * once — on a 19-file merge request, a hundred and sixty seconds of completed
 * analysis and a full model call, discarded, with a re-run as the only remedy.
 * That is the review-and-redo cycle this tool exists to avoid. Three bounds the
 * cost of a slip while leaving a persistent failure to fail.
 */
export const STRUCTURED_OUTPUT_ATTEMPTS = '3';

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
  /** Holds the system-prompt file for the life of the child process. */
  fs: FileSystem;
  /** Stamps that file's directory as AMBICODE's, so a sweep may reclaim it. */
  clock: Clock;
  /** Where the capability probe runs; the review itself runs in the snapshot. */
  cwd: string;
  /** Overridable so a test can point at a stub without a PATH lookup. */
  executable?: string;
  /** Bounded capture; a truncated answer is rejected, never half-parsed. */
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

  /**
   * The exact argument vector, exposed so the result can record what ran.
   *
   * `systemPromptFile` is the path `invoke` wrote the system prompt to. Every
   * element here is a single line by construction: the JSON arguments are
   * emitted without indentation, and the only multi-line value in the request
   * reaches the child through that file or through stdin.
   */
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
      '--tools',
      REVIEWER_TOOLS.join(','),
      '--disallowedTools',
      DENIED_TOOLS.join(','),
      '--permission-prompts',
      'none',
      '--no-session-persistence',
      '--model',
      request.model,
      // Only the shared operating contract and the reviewer role (doc 04 P2.4
      // correction E1); everything with change data, requirements, or diff
      // content stays in the ordinary user prompt below, never here.
      SYSTEM_PROMPT_FILE_FLAG,
      systemPromptFile,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(REVIEWER_JSON_SCHEMA),
    ];
  }

  async invoke(request: ReviewerRequest): Promise<ReviewerInvocation> {
    // Its own directory, outside the snapshot: the reviewer's file tools are
    // confined to `cwd`, so its system prompt never appears as a file it can
    // read back and never joins the material under review. The CLI reads it
    // before any of that applies.
    const promptDirectory = await this.fs.temporaryDirectory(REVIEWER_PROMPT_PREFIX);
    try {
      await markOwned(this.fs, promptDirectory, 'reviewer-prompt', this.clock, process.pid);
      const systemPromptFile = path.join(promptDirectory, SYSTEM_PROMPT_FILE);
      await this.fs.writeText(systemPromptFile, request.systemPrompt);
      return await this.run(request, this.argvFor(request, systemPromptFile));
    } finally {
      // The child has exited by now, so the file has been read.
      await this.fs.remove(promptDirectory).catch(() => undefined);
    }
  }

  private async run(request: ReviewerRequest, argv: string[]): Promise<ReviewerInvocation> {
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
      // Claude Code exits nonzero for an errored run but still prints its
      // result envelope, and that envelope is the only thing that says *what*
      // went wrong — the exit code says only that something did. Classifying
      // from the code alone made every named failure below unreachable, so a
      // schema-retry exhaustion was reported as a bare "nonzero-exit". An
      // envelope that parses as a successful answer is still not accepted
      // here: the process said it failed, and that is not overridden.
      const classified = outcome.stdout.trim() === '' ? null : parseReviewerOutput(outcome.stdout, argv);
      if (classified?.kind === 'error') return classified;
      const failed = fail(
        argv,
        'nonzero-exit',
        `the reviewer exited ${outcome.exitCode}: ${firstLine(outcome.stderr) || firstLine(outcome.stdout) || 'no diagnostic'}`,
      );
      return classified?.usage === undefined ? failed : { ...failed, usage: classified.usage };
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
        // The analysis itself is not recoverable from here, and guessing at it
        // from the model's prose would be inventing findings nothing checked.
        `the reviewer finished its analysis but could not express it in the required shape, ${STRUCTURED_OUTPUT_ATTEMPTS} attempt(s) running: ${describe(data.errors ?? data.result)}. Nothing it found survived, so there is no partial result to report. The target is pinned by revision, so re-running reviews the identical change.`,
      );
    }
    return fail(argv, 'reviewer-error', `the reviewer reported an error (${subtype}): ${describe(data.errors ?? data.result)}`);
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

/**
 * Read apart from `Envelope` so that an unexpected type here costs only the
 * number, never the review.
 */
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
