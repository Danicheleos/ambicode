import { z } from 'zod';
import type { DeliveryCertainty } from '../../contracts/provider.ts';
import type { ProcessRunner } from '../../ports/process.ts';

export const GLAB_TIMEOUT_MS = 60_000;
export const GLAB_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** GitLab's own maximum; asking for more is silently capped. */
export const PAGE_SIZE = 100;

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'failed'; message: string; details: string[]; certainty: DeliveryCertainty };

export interface GitLabApiOptions {
  runner: ProcessRunner;
  host: string;
  cwd: string;
  executable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ApiRequest {
  path: string;
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

  argvFor(request: ApiRequest): string[] {
    const query = Object.entries(request.query ?? {})
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return [
      this.executable,
      'api',
      // glab otherwise infers the host from the checkout's remote, not the one the URL named.
      '--hostname',
      this.host,
      '--method',
      request.method ?? 'GET',
      // `glab api --input -` sets no Content-Type of its own, and GitLab answers HTTP 415 before
      // it looks at the request at all.
      ...(request.body === undefined
        ? []
        : ['--header', 'Content-Type: application/json', '--input', '-']),
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
      env: { kind: 'inherited', overrides: { NO_COLOR: '1', GLAB_CHECK_UPDATE: 'false' } },
      ...(request.body === undefined ? {} : { stdin: JSON.stringify(request.body) }),
    });

    if (outcome.kind === 'spawn-failed') {
      // Never started, so provably nothing was sent: the only case allowed to claim `before-send`.
      return failed(
        `glab could not be started: ${outcome.failure ?? 'unknown spawn failure'}.`,
        ['AMBICODE talks to GitLab only through the glab CLI; install it and run `glab auth login` for this host.'],
        'before-send',
      );
    }
    // A started process may already have been acted on by GitLab, so everything below is
    // `uncertain`. Never narrow this by matching message text.
    if (outcome.kind === 'timed-out') {
      return failed(`glab api ${request.path} timed out after ${Math.round(this.timeoutMs / 1000)}s.`);
    }
    if (outcome.truncated) {
      return failed(`glab api ${request.path} produced more output than AMBICODE reads, so it was not parsed.`, [
        'The response was not parsed and nothing was inferred from its prefix.',
      ]);
    }
    if (outcome.exitCode !== 0) {
      // In the message, not only in details: a publication outcome records the message alone.
      const diagnostic =
        firstLine(outcome.stderr) || firstLine(outcome.stdout) || 'glab produced no diagnostic.';
      return failed(
        `glab api ${request.path} failed with exit code ${String(outcome.exitCode)}: ${diagnostic}`,
        [diagnostic],
      );
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

  async graphql<T>(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    schema: z.ZodType<T>,
  ): Promise<ApiResult<T>> {
    return await this.request({ path: 'graphql', method: 'POST', body: { query, variables } }, schema);
  }

  /**
   * GitLab never says "there is more", so pages are read until a short one; a failed page fails the
   * whole listing, and `maxItems` is a hard ceiling even when one page exceeds it.
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
        return failed(
          `${result.message} (page ${page} of ${request.path})`,
          [
            ...result.details,
            `${items.length} item(s) had already been read; a partial listing is not returned as a complete one.`,
          ],
          result.certainty,
        );
      }

      items.push(...result.value);

      if (items.length > maxItems) {
        return { kind: 'ok', value: { items: items.slice(0, maxItems), capped: true, pages: page } };
      }
      if (result.value.length < PAGE_SIZE) {
        return { kind: 'ok', value: { items, capped: false, pages: page } };
      }
      page += 1;
    }
  }
}

function failed<T>(
  message: string,
  details: string[] = [],
  certainty: DeliveryCertainty = 'uncertain',
): ApiResult<T> {
  return { kind: 'failed', message, details, certainty };
}

function firstLine(value: string): string {
  return value.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}
