import { describeOutcome, outcomeFailure } from '#platform/ports/process';
import type { ProcessRunner } from '#types/platform/ports';

/**
 * Failure is ordinary (headless host, remote session, no handler) and never
 * stops the server: the URL printed to the terminal is the real interface.
 */

interface OpenResult {
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
    env: { kind: 'inherited' },
    // The browser inherits the opener's pipes and holds them open for its whole
    // life, so on Windows a browser that had opened still hit this deadline.
    output: 'ignore',
  });

  if (outcomeFailure(outcome) !== null) return { opened: false, detail: `${argv[0]} ${describeOutcome(outcome)}` };
  return { opened: true, detail: `${argv[0]} was asked to open the page` };
}
