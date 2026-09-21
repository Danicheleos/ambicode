// Assembles the installable AMBICODE plugin candidate under dist/, from an
// explicit file allowlist, and records what went into it (doc 03 P1.7 §1-2).
//
// Deliberately a plain Node script, not a packaging framework: the allowlist
// below is the actual contract for what ships, so it is easier to review as a
// short list here than as configuration for a generic bundler plugin.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

// Directories copied wholesale, filtered to these extensions and skipping any
// dotfile (so a stray `.DS_Store` or similar workstation file never ships).
// This is the "everything required at runtime" list from doc 03 P1.7 §1.
const DIRECTORY_ALLOWLIST = [
  { from: 'skills', extensions: ['.md'] },
  { from: 'prompts', extensions: ['.md'] },
  { from: 'policies', extensions: ['.yaml', '.md'] },
  { from: 'templates', extensions: ['.eta', '.css'] },
  { from: 'docs', extensions: ['.md'] },
];

// Individual files, each with the mode the installed copy must carry.
const FILE_ALLOWLIST = [
  { from: '.claude-plugin/plugin.json', mode: 0o644 },
  { from: 'bin/ambicode', mode: 0o755 },
  { from: 'scripts/ambicode.mjs', mode: 0o644 },
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}

async function canonicalVersion() {
  const pkg = await readJson('package.json');
  const plugin = await readJson('.claude-plugin/plugin.json');
  if (pkg.version !== plugin.version) {
    throw new Error(
      `package.json version "${pkg.version}" and .claude-plugin/plugin.json version "${plugin.version}" disagree. ` +
        'Fix one before packaging: this repository uses package.json as the canonical version source.',
    );
  }
  return pkg.version;
}

async function copyFileWithMode(from, to, mode) {
  await mkdir(path.dirname(to), { recursive: true });
  await rm(to, { force: true });
  const contents = await readFile(from);
  await writeFile(to, contents, { mode });
}

async function copyAllowedTree(fromDir, toDir, extensions) {
  let entries;
  try {
    entries = await readdir(fromDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // No dotfiles: workstation metadata never ships.
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyAllowedTree(from, to, extensions);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.includes(path.extname(entry.name))) continue;
    await copyFileWithMode(from, to, 0o644);
  }
}

async function buildCandidate(candidateDir) {
  await rm(candidateDir, { recursive: true, force: true });
  await mkdir(candidateDir, { recursive: true });

  for (const file of FILE_ALLOWLIST) {
    await copyFileWithMode(path.join(ROOT, file.from), path.join(candidateDir, file.from), file.mode);
  }
  for (const dir of DIRECTORY_ALLOWLIST) {
    await copyAllowedTree(path.join(ROOT, dir.from), path.join(candidateDir, dir.from), dir.extensions);
  }
}

async function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(absolute, base)));
    } else if (entry.isFile()) {
      out.push(path.relative(base, absolute).split(path.sep).join('/'));
    }
  }
  return out;
}

async function inventoryOf(candidateDir) {
  const files = (await walkFiles(candidateDir)).sort();
  const inventory = [];
  for (const relativePath of files) {
    const absolute = path.join(candidateDir, relativePath);
    const bytes = await readFile(absolute);
    const mode = (await stat(absolute)).mode & 0o777;
    inventory.push({
      path: relativePath,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mode: mode.toString(8),
    });
  }
  return inventory;
}

/** Fails loudly rather than shipping a path that only works on this machine. */
async function checkNoWorkstationPaths(candidateDir) {
  const forbidden = [ROOT, process.env.HOME ?? ''].filter((value) => value.length > 3);
  const files = await walkFiles(candidateDir);
  const offenders = [];
  for (const relativePath of files) {
    if (!/\.(mjs|js|json|md|css|eta)$/.test(relativePath)) continue;
    const text = await readFile(path.join(candidateDir, relativePath), 'utf8').catch(() => '');
    for (const needle of forbidden) {
      if (needle !== '' && text.includes(needle)) offenders.push(`${relativePath} contains "${needle}"`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`Developer-specific absolute paths leaked into the candidate:\n  ${offenders.join('\n  ')}`);
  }
}

async function checkLauncherExecutable(candidateDir) {
  const mode = (await stat(path.join(candidateDir, 'bin/ambicode'))).mode & 0o777;
  if ((mode & 0o111) === 0) {
    throw new Error(`bin/ambicode is not executable in the candidate (mode ${mode.toString(8)}).`);
  }
}

async function checkNoForbiddenDependencies(candidateDir) {
  const forbiddenPaths = ['node_modules', 'package.json', 'package-lock.json', 'tsconfig.json', 'src'];
  for (const name of forbiddenPaths) {
    const exists = await stat(path.join(candidateDir, name)).then(() => true, () => false);
    if (exists) {
      throw new Error(`${name} must not appear in the installed candidate, but it does.`);
    }
  }
}

async function main() {
  // Always packages a freshly compiled helper, never whatever `scripts/`
  // happens to hold from an earlier run (doc 03 P1.7 §1: installation must
  // not depend on an ignored local build output that nobody re-checked).
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });

  const version = await canonicalVersion();
  const candidateDir = path.join(DIST, `ambicode-${version}`);

  await buildCandidate(candidateDir);
  await checkLauncherExecutable(candidateDir);
  await checkNoForbiddenDependencies(candidateDir);
  await checkNoWorkstationPaths(candidateDir);

  const inventory = await inventoryOf(candidateDir);
  await mkdir(DIST, { recursive: true });
  const inventoryPath = path.join(DIST, `ambicode-${version}.inventory.json`);
  await writeFile(inventoryPath, `${JSON.stringify({ version, files: inventory }, null, 2)}\n`);

  // Zipped so the private marketplace's `archive` source type (sha256-pinned)
  // can install it once the release owner hosts it; see doc 03 P1.7 §3.
  const zipPath = path.join(DIST, `ambicode-${version}.zip`);
  await rm(zipPath, { force: true });
  execFileSync('zip', ['-rX', zipPath, `ambicode-${version}`], { cwd: DIST, stdio: 'inherit' });
  const zipDigest = createHash('sha256').update(await readFile(zipPath)).digest('hex');
  await writeFile(path.join(DIST, `ambicode-${version}.zip.sha256`), `${zipDigest}  ambicode-${version}.zip\n`);

  console.log(`Candidate directory: ${candidateDir}`);
  console.log(`Inventory:           ${inventoryPath} (${inventory.length} files)`);
  console.log(`Archive:              ${zipPath}`);
  console.log(`Archive sha256:       ${zipDigest}`);
  return { candidateDir, inventoryPath, zipPath, zipDigest, version, inventory };
}

/**
 * Packages twice, into two independent temporary directories built from the
 * same checked-out source and the same lockfile, and asserts the resulting
 * file set and every content hash are identical (doc 03 P1.7 §2, "a check
 * that rebuilding ... produces the intended file set").
 */
async function checkReproducible() {
  // Rebuilds the bundle itself between the two packaging attempts, so this
  // proves the whole pipeline — esbuild bundling included, not only the file
  // copy — is deterministic from the same source and the same lockfile.
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  const first = await packageInto(await mkdtemp(path.join(tmpdir(), 'ambicode-repro-a-')));
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  const second = await packageInto(await mkdtemp(path.join(tmpdir(), 'ambicode-repro-b-')));
  const a = JSON.stringify(first);
  const b = JSON.stringify(second);
  if (a !== b) {
    throw new Error('Two packaging runs from the same source produced different file sets or hashes.');
  }
  console.log(`Reproducible: ${first.length} files, identical paths, sizes and sha256 digests across two runs.`);
}

async function packageInto(candidateDir) {
  await buildCandidate(candidateDir);
  const inventory = await inventoryOf(candidateDir);
  await rm(candidateDir, { recursive: true, force: true });
  // The version and mtimes are not part of the comparison; only the shipped
  // file set and its content, which is what "the same file set" means here.
  return inventory.map(({ path: p, bytes, sha256, mode }) => ({ path: p, bytes, sha256, mode }));
}

const mode = process.argv[2];
if (mode === '--check-reproducible') {
  await checkReproducible();
} else {
  await main();
}
