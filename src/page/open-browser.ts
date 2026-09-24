import type { ProcessRunner } from '../ports/process.ts';

/**
 * Opens the page in whatever the operator's desktop considers the browser.
 *
 * Failure is ordinary: a headless host, a remote session, or no handler
 * configured. It never stops the server, because the URL printed to the
 * terminal is the real interface and the browser launch is a convenience.
 */

export interface OpenResult {
  opened: boolean;
  detail: string;
}

export function openerArgv(platform: string, url: string): string[] {
  if (platform === 'darwin') return ['open', url];
  if (platform === 'win32') return ['cmd', '/c', 'start', '', url];
  return ['xdg-open', url];
}

export async function openInBrowser(
  runner: ProcessRunner,
  platform: string,
  url: string,
  cwd: string,
): Promise<OpenResult> {
  const argv = openerArgv(platform, url);
  const outcome = await runner.run({
    argv,
    cwd,
    timeoutMs: 10_000,
    maxOutputBytes: 8_192,
    // The operator's own desktop session decides which browser opens; this is
    // their environment, not the reviewer's.
    env: { kind: 'inherited' },
    // The browser inherits whatever pipes the opener has and keeps them open
    // for its whole life. With pipes, every Windows run reached this deadline
    // and reported "not opened" for a browser that had opened (runs 8335f588
    // through a0e87d39); the opener's output carries nothing anyway.
    output: 'ignore',
  });

  if (outcome.kind === 'spawn-failed') {
    return { opened: false, detail: `${argv[0]} could not be started (${outcome.failure ?? 'unknown'})` };
  }
  if (outcome.kind === 'timed-out') return { opened: false, detail: `${argv[0]} timed out` };
  if (outcome.exitCode !== 0) {
    return { opened: false, detail: `${argv[0]} exited with ${String(outcome.exitCode)}` };
  }
  return { opened: true, detail: `${argv[0]} was asked to open the page` };
}
