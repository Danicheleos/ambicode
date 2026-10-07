import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Fallback install version when the devDependency is absent; the adapter's argument table was checked against 2.31. */
export const CODEINDEX_VERSION = '2.31.4';
export const VENDOR_DIR = path.join(ROOT, 'vendor', 'codeindex');
const ENTRY = path.join(VENDOR_DIR, 'scripts', 'cli.mjs');

/** The built CLI only: `src/` (TypeScript sources) and the browser engine are not needed to run it. */
const SHIPPED = ['LICENSE', 'scripts/cli.mjs', 'scripts/engine.mjs', 'scripts/grammars'];

const exists = (file) => stat(file).then(() => true, () => false);
const installedVersion = async (dir) => JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')).version;
/** The copy carries no package.json; its CLI reports the version it was built as. */
const vendoredVersion = () => {
  try {
    return execFileSync(process.execPath, [ENTRY, '--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

async function copyBuilt(from) {
  await rm(VENDOR_DIR, { recursive: true, force: true });
  for (const entry of SHIPPED) await cp(path.join(from, entry), path.join(VENDOR_DIR, entry), { recursive: true });
}

/** Copies the devDependency's built CLI into `vendor/codeindex` (gitignored), else installs it into a temp directory; the plugin ships that copy. */
export async function vendorCodeindex() {
  const installed = path.join(ROOT, 'node_modules', '@maxgfr', 'codeindex');
  const fresh = (await exists(ENTRY)) && !(await exists(path.join(VENDOR_DIR, 'src'))) && !(await exists(path.join(VENDOR_DIR, 'package.json')));
  if (await exists(path.join(installed, 'scripts', 'cli.mjs'))) {
    if (!fresh || vendoredVersion() !== (await installedVersion(installed))) await copyBuilt(installed);
    return VENDOR_DIR;
  }
  if (fresh) return VENDOR_DIR;
  const work = await mkdtemp(path.join(tmpdir(), 'ambicode-codeindex-'));
  try {
    execFileSync('npm', ['install', '--prefix', work, '--no-save', '--no-audit', '--no-fund', `@maxgfr/codeindex@${CODEINDEX_VERSION}`], { stdio: 'inherit' });
    await copyBuilt(path.join(work, 'node_modules', '@maxgfr', 'codeindex'));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return VENDOR_DIR;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`codeindex ${CODEINDEX_VERSION} → ${path.relative(ROOT, await vendorCodeindex())}`);
