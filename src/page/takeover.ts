import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FileSystem } from '../ports/filesystem.ts';

/**
 * One review page per machine, on a fixed port, so a new `ambicode view`
 * replaces the previous one instead of leaving it serving a stale review.
 *
 * The running page records a shutdown token in a control file beside the
 * port. A newcomer that finds the port taken presents that token over
 * loopback; only a page that wrote it will stop. Anything else holding the
 * port is left alone, and the newcomer falls back to a port the OS picks.
 */

export const TAKEOVER_HEADER = 'x-ambicode-takeover';

const ControlFile = z.strictObject({
  tool: z.literal('ambicode'),
  port: z.number().int().positive(),
  pid: z.number().int().positive(),
  token: z.string().min(16),
});
type ControlFile = z.infer<typeof ControlFile>;

/**
 * In the host temporary root: the port is global to the machine, not to a
 * repository. On a shared `/tmp` another local user could read it and stop
 * the page, which costs a reopen; publishing still needs the session and CSRF
 * token, which never leave the browser.
 */
export function controlFilePath(fs: FileSystem, port: number): string {
  return path.join(fs.temporaryRoot(), `ambicode-view-${port}.json`);
}

export async function writeControlFile(fs: FileSystem, entry: Omit<ControlFile, 'tool'>): Promise<void> {
  await fs.writeText(controlFilePath(fs, entry.port), `${JSON.stringify({ tool: 'ambicode', ...entry })}\n`);
}

/** Removes the file only while it is still this page's: a successor owns it otherwise. */
export async function removeControlFile(fs: FileSystem, port: number, token: string): Promise<void> {
  const current = await readControlFile(fs, port);
  if (current?.token !== token) return;
  await fs.remove(controlFilePath(fs, port)).catch(() => undefined);
}

async function readControlFile(fs: FileSystem, port: number): Promise<ControlFile | null> {
  try {
    const parsed = ControlFile.safeParse(JSON.parse(await fs.readText(controlFilePath(fs, port))));
    return parsed.success && parsed.data.port === port ? parsed.data : null;
  } catch {
    return null;
  }
}

export type TakeoverResult = { kind: 'stopped' } | { kind: 'refused'; reason: string };

/** Asks the page on `port` to stop. Resolves once it has answered, not once the port is free. */
export async function requestTakeover(
  fs: FileSystem,
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TakeoverResult> {
  const control = await readControlFile(fs, port);
  if (control === null) {
    return { kind: 'refused', reason: `port ${port} is in use, and no AMBICODE review page recorded it` };
  }
  let response: Response;
  try {
    response = await fetchImpl(`http://127.0.0.1:${port}/takeover`, {
      method: 'POST',
      headers: { [TAKEOVER_HEADER]: control.token },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    return { kind: 'refused', reason: `port ${port} did not answer as a review page (${messageOf(error)})` };
  }
  if (response.ok) return { kind: 'stopped' };
  if (response.status === 409) {
    return { kind: 'refused', reason: `the review page on port ${port} is publishing comments, so it was left running` };
  }
  return { kind: 'refused', reason: `port ${port} refused to stop (HTTP ${response.status})` };
}

/**
 * How long a replaced page gets to release the port: 20 × 100 ms. Measured on
 * Windows 11 with Fastify 5.12.5 and an idle keep-alive connection open: the
 * port was bindable 3 ms after close, because Fastify drops idle connections.
 */
const RELEASE_ATTEMPTS = 20;
const RELEASE_INTERVAL_MS = 100;

/**
 * The preferred port, taking it over from a previous review page if one holds
 * it. Anything that is not a review page keeps its port, and this page moves
 * to one the OS picks and says so, rather than failing to open.
 */
export async function bindPort(
  app: FastifyInstance,
  fs: FileSystem,
  preferred: number,
): Promise<{ port: number; note: string | null }> {
  const listen = async (port: number): Promise<number> => {
    await app.listen({ host: '127.0.0.1', port });
    const address = app.server.address();
    return address !== null && typeof address === 'object' ? address.port : 0;
  };
  const tryListen = async (port: number): Promise<number | null> => {
    try {
      return await listen(port);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') return null;
      throw error;
    }
  };

  if (preferred === 0) return { port: await listen(0), note: null };
  const first = await tryListen(preferred);
  if (first !== null) return { port: first, note: null };

  const takeover = await requestTakeover(fs, preferred);
  let reason: string;
  if (takeover.kind === 'stopped') {
    // It answers before it closes its listener.
    for (let attempt = 0; attempt < RELEASE_ATTEMPTS; attempt += 1) {
      await delay(RELEASE_INTERVAL_MS);
      const port = await tryListen(preferred);
      if (port !== null) return { port, note: `Stopped the previous review page on port ${preferred}.` };
    }
    reason = `the previous review page on port ${preferred} did not release it within ${(RELEASE_ATTEMPTS * RELEASE_INTERVAL_MS) / 1000}s`;
  } else {
    reason = takeover.reason;
  }
  const port = await listen(0);
  return { port, note: `Not on port ${preferred}: ${reason}. This page is on port ${port} instead.` };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
