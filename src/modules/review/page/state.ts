import path from 'node:path';
import { AMBICODE_DIR } from '#types/defaults';
import type { FileSystem } from '#types/platform/ports';

/** What a later review needs to find the repository's running page server: where it listens and the secret that authorises /register. */
export interface PageState { port: number; secret: string }

const stateFile = (repositoryRoot: string): string => path.join(repositoryRoot, AMBICODE_DIR, 'page.json');

export async function readPageState(fs: FileSystem, repositoryRoot: string): Promise<PageState | null> {
  try {
    const parsed = JSON.parse(await fs.readText(stateFile(repositoryRoot))) as Partial<PageState>;
    return typeof parsed.port === 'number' && typeof parsed.secret === 'string' ? { port: parsed.port, secret: parsed.secret } : null;
  } catch {
    return null;
  }
}

/** Mode 600: whoever reads the secret can have a login link minted, so only the user may. */
export async function writePageState(fs: FileSystem, repositoryRoot: string, state: PageState): Promise<void> {
  await fs.mkdirp(path.join(repositoryRoot, AMBICODE_DIR));
  await fs.writeText(stateFile(repositoryRoot), `${JSON.stringify(state)}\n`, 0o600);
}

/** Only this server's own record goes: a successor may already have replaced it. */
export async function removePageState(fs: FileSystem, repositoryRoot: string, own: PageState): Promise<void> {
  const current = await readPageState(fs, repositoryRoot);
  if (current?.secret === own.secret) await fs.remove(stateFile(repositoryRoot));
}
