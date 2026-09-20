import { z } from 'zod';
import type { ProcessRunner } from '../../ports/process.ts';

/**
 * Every GitLab request is `glab api` through the shared process port (doc 11).
 * There is no GitLab SDK, no direct HTTP client, no shell pipeline, and nothing
 * parses `glab mr view` or any other human-formatted output: the transport
 * returns JSON and every response is validated with Zod before it is used.
 */

export const GLAB_TIMEOUT_MS = 60_000;
export const GLAB_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** GitLab's own maximum; asking for more is silently capped, so it is not asked. */
export const PAGE_SIZE = 100;

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'failed'; message: string; details: string[] };

export interface GitLabApiOptions {
  runner: ProcessRunner;
  /** Host with its port, taken from the merge request URL. */
  host: string;
  /** Where glab runs. Its configuration is per-host, never per-checkout. */
  cwd: string;
  executable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ApiRequest {
  /** Path after `/api/v4/`, already encoded by the caller. */
  path: string;
  /** Appended as a query string; values are encoded here. */
  query?: Readonly<Record<string, string | number>>;
  method?: 'GET' | 'POST';
  /** POST body, sent as JSON on stdin so no value reaches the argument vector. */
  body?: unknown;
}

export class GitLabApi {
  private readonly runner: ProcessRunner;
  private readonly host: string;
  private readonly cwd: string;
  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: GitLabApiOptions) {
    this.runner = options.runner;
    this.host = options.host;
    this.cwd = options.cwd;
    this.executable = options.executable ?? 'glab';
    this.timeoutMs = options.timeoutMs ?? GLAB_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? GLAB_MAX_OUTPUT_BYTES;
  }

  /** The exact vector, so a test can assert the host and the encoded identity. */
  argvFor(request: ApiRequest): string[] {
    const query = Object.entries(request.query ?? {})
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return [
      this.executable,
      'api',
      // Explicit on every request: glab otherwise infers a host from the
      // current checkout's remote, which is not what the URL named (doc 03).
      '--hostname',
      this.host,
      '--method',
      request.method ?? 'GET',
      ...(request.body === undefined ? [] : ['--input', '-']),
      query === '' ? request.path : `${request.path}?${query}`,
    ];
  }

  async request<T>(request: ApiRequest, schema: z.ZodType<T>): Promise<ApiResult<T>> {
    const argv = this.argvFor(request);
    const outcome = await this.runner.run({
      argv,
      cwd: this.cwd,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      // glab reads its own token store and the operator's proxy settings.
      env: { kind: 'inherited', overrides: { NO_COLOR: '1', GLAB_CHECK_UPDATE: 'false' } },
      ...(request.body === undefined ? {} : { stdin: JSON.stringify(request.body) }),
    });

    if (outcome.kind === 'spawn-failed') {
      return failed(`glab could not be started: ${outcome.failure ?? 'unknown spawn failure'}.`, [
        'AMBICODE talks to GitLab only through the glab CLI; install it and run `glab auth login` for this host.',
      ]);
    }
    if (outcome.kind === 'timed-out') {
      return failed(`glab api ${request.path} timed out after ${Math.round(this.timeoutMs / 1000)}s.`);
    }
    // A capped response is not a short response: parsing a prefix would invent
    // a complete answer out of an incomplete one (doc 11).
    if (outcome.truncated) {
      return failed(`glab api ${request.path} produced more output than AMBICODE reads, so it was not parsed.`, [
        'The response was not parsed and nothing was inferred from its prefix.',
      ]);
    }
    if (outcome.exitCode !== 0) {
      return failed(`glab api ${request.path} failed with exit code ${String(outcome.exitCode)}.`, [
        firstLine(outcome.stderr) || firstLine(outcome.stdout) || 'glab produced no diagnostic.',
      ]);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outcome.stdout);
    } catch (error) {
      return failed(`glab api ${request.path} did not return JSON.`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return failed(`The GitLab response for ${request.path} does not match what AMBICODE expects.`, [
        ...validated.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
        'AMBICODE will not work from a response it could not validate.',
      ]);
    }
    return { kind: 'ok', value: validated.data };
  }

  /**
   * Reads a paginated collection to its end. GitLab returns 20 items by default
   * and never says "there is more" in the body, so the first page is not the
   * collection (doc 03 P1.5): pages are requested until one comes back shorter
   * than the page size, and a failure on any page fails the whole listing
   * rather than returning a plausible prefix.
   */
  async collect<T>(
    request: ApiRequest,
    itemSchema: z.ZodType<T>,
    options: { maxItems?: number } = {},
  ): Promise<ApiResult<{ items: T[]; capped: boolean; pages: number }>> {
    const arraySchema = z.array(itemSchema);
    const items: T[] = [];
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
    let page = 1;

    for (;;) {
      const result = await this.request(
        { ...request, query: { ...(request.query ?? {}), per_page: PAGE_SIZE, page } },
        arraySchema,
      );
      if (result.kind !== 'ok') {
        return failed(`${result.message} (page ${page} of ${request.path})`, [
          ...result.details,
          `${items.length} item(s) had already been read; a partial listing is not returned as a complete one.`,
        ]);
      }

      items.push(...result.value);
      // A final page that is short — including an empty one — ends the listing.
      if (result.value.length < PAGE_SIZE) return { kind: 'ok', value: { items, capped: false, pages: page } };
      if (items.length >= maxItems) {
        return { kind: 'ok', value: { items: items.slice(0, maxItems), capped: true, pages: page } };
      }
      page += 1;
    }
  }
}

function failed<T>(message: string, details: string[] = []): ApiResult<T> {
  return { kind: 'failed', message, details };
}

function firstLine(value: string): string {
  return value.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}
