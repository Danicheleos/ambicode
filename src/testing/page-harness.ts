import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { PublicationPositions, PublicationRecord } from '../contracts/publication.ts';
import type { ReviewResult } from '../contracts/review.ts';
import type { Clock } from '../ports/clock.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import type { IdSource } from '../ports/ids.ts';
import { createPageServer, SESSION_COOKIE, type PageServer } from '../page/server.ts';
import { reopenCommand } from '../page/reopen.ts';
import { ReviewStore } from '../publication/store.ts';
import { FakeProvider } from './fake-provider.ts';
import { publicationPositions, reviewResult } from './review-fixture.ts';

/**
 * Starts the page with Fastify's injection transport and no socket, so the
 * tests exercise the real routes, hooks, cookies, CSRF and templates without
 * binding a port or opening a browser.
 */

export const AUTHORITY = '127.0.0.1:7777';
export const ORIGIN = `http://${AUTHORITY}`;

export const templatesDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates',
);

/** A clock a test moves deliberately, so nothing depends on wall time. */
export class FakeClock implements Clock {
  private current: number;
  constructor(start = Date.parse('2026-09-20T12:00:00.000Z')) {
    this.current = start;
  }
  now(): Date {
    return new Date(this.current);
  }
  elapsed(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

/** Counted identifiers, so a test can name the capability it expects. */
export class CountingIds implements IdSource {
  private counter = 0;
  private readonly prefix: string;
  /** Two servers in one test must not mint the same values, so each gets a prefix. */
  constructor(prefix = 'a') {
    this.prefix = prefix;
  }
  reviewId(): string {
    this.counter += 1;
    return `review-${this.prefix}${this.counter}`;
  }
  capability(): string {
    this.counter += 1;
    return `cap-${this.prefix}${this.counter}-${'x'.repeat(24)}`;
  }
  csrfToken(): string {
    this.counter += 1;
    return `csrf-${this.prefix}${this.counter}`;
  }
}

let harnessCounter = 0;

export interface HarnessOptions {
  result?: ReviewResult;
  positions?: PublicationPositions | null;
  provider?: FakeProvider | null;
  idleTimeoutSeconds?: number;
  record?: PublicationRecord;
  processId?: number;
}

export interface Harness {
  server: PageServer;
  provider: FakeProvider | null;
  store: ReviewStore;
  clock: FakeClock;
  directory: string;
  result: ReviewResult;
  dispose(): Promise<void>;
}

export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-page-test-'));
  const clock = new FakeClock();
  const store = new ReviewStore(nodeFileSystem, clock, directory);
  const result = options.result ?? reviewResult();
  const positions =
    options.positions === undefined ? publicationPositions(result) : options.positions;
  const provider = options.provider === undefined ? new FakeProvider() : options.provider;
  const record = options.record ?? (await store.readPublication(result.reviewId));
  if (options.record !== undefined) await store.writePublication(options.record);

  const server = await createPageServer({
    fs: nodeFileSystem,
    clock,
    ids: new CountingIds(`h${(harnessCounter += 1)}-`),
    store,
    result,
    positions,
    record,
    provider,
    templatesDirectory,
    idleTimeoutSeconds: options.idleTimeoutSeconds ?? 1800,
    reopenCommand: reopenCommand(result.reviewId),
    authority: AUTHORITY,
    processId: options.processId ?? process.pid,
  });

  return {
    server,
    provider,
    store,
    clock,
    directory,
    result,
    dispose: async () => {
      await server.stop('test finished');
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/**
 * A second `ambicode view` process against the same saved review: a fresh
 * server, a fresh capability and session, reading whatever the first process
 * left on disk. Used to prove that persisted drafts survive a reopen while
 * checkbox selection does not (doc 03 P1.7 correction E).
 */
export async function reopenHarness(harness: Harness): Promise<Harness> {
  const record = await harness.store.readPublication(harness.result.reviewId);
  const positions = await harness.store.readPositions();
  const server = await createPageServer({
    fs: nodeFileSystem,
    clock: harness.clock,
    ids: new CountingIds(`h${(harnessCounter += 1)}-`),
    store: harness.store,
    result: harness.result,
    positions,
    record,
    provider: harness.provider,
    templatesDirectory,
    idleTimeoutSeconds: 1800,
    reopenCommand: reopenCommand(harness.result.reviewId),
    authority: AUTHORITY,
    processId: process.pid,
  });
  return {
    server,
    provider: harness.provider,
    store: harness.store,
    clock: harness.clock,
    directory: harness.directory,
    result: harness.result,
    dispose: async () => {
      await server.stop('test finished');
    },
  };
}

export interface OpenedPage {
  html: string;
  cookies: string;
  csrfToken: string;
  submissionId: string;
}

/** Consumes the capability and lands on the clean URL, as a browser would. */
export async function openPage(harness: Harness): Promise<OpenedPage> {
  const bootstrap = await harness.server.app.inject({
    method: 'GET',
    url: `/?c=${harness.server.capability}`,
    headers: { host: AUTHORITY },
  });
  if (bootstrap.statusCode !== 303) {
    throw new Error(`bootstrap failed with ${bootstrap.statusCode}: ${bootstrap.body}`);
  }
  const jar = cookieJar(bootstrap.cookies);

  const page = await harness.server.app.inject({
    method: 'GET',
    url: '/',
    headers: { host: AUTHORITY, cookie: jar.header() },
  });
  jar.absorb(page.cookies);

  return {
    html: page.body,
    cookies: jar.header(),
    csrfToken: hiddenField(page.body, '_csrf', ''),
    submissionId: hiddenField(page.body, 'submissionId', ''),
  };
}

/** A page with no findings renders no form, so the fallback is a real case. */
export function hiddenField(html: string, name: string, fallback?: string): string {
  const match = new RegExp(`name="${name}" value="([^"]*)"`).exec(html);
  if (match === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`no hidden field "${name}" in the rendered page`);
  }
  return match[1] as string;
}

interface Jar {
  absorb(cookies: readonly { name: string; value: string }[]): void;
  header(): string;
}

export function cookieJar(initial: readonly { name: string; value: string }[] = []): Jar {
  const values = new Map<string, string>();
  const absorb = (cookies: readonly { name: string; value: string }[]): void => {
    for (const cookie of cookies) values.set(cookie.name, cookie.value);
  };
  absorb(initial);
  return {
    absorb,
    header: () =>
      [...values.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; '),
  };
}

export { SESSION_COOKIE };

/** Encodes a form the way the page's own browser submission would. */
export function form(fields: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(one)}`);
    }
  }
  return parts.join('&');
}
