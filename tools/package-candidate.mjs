import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Copied wholesale, filtered by extension, skipping dotfiles. `docs/` is not listed: it
// holds this repository's acceptance records, which must not ship; shipped docs are
// named individually in FILE_ALLOWLIST.
const DIRECTORY_ALLOWLIST = [
  { from: 'skills', extensions: ['.md'] },
  { from: 'prompts', extensions: ['.md'] },
  { from: 'policies', extensions: ['.yaml', '.md'] },
  { from: 'scripts/templates', extensions: ['.eta', '.css'] },
  { from: 'scripts/chunks', extensions: ['.mjs'] },
  { from: 'routes', extensions: ['.yaml', '.md'], exclude: ['README.md'] },
];

const FILE_ALLOWLIST = [
  { from: '.claude-plugin/plugin.json', mode: 0o644 },
  { from: 'bin/ambicode', mode: 0o755 },
  { from: 'bin/ambicode.cmd', mode: 0o644 },
  { from: 'scripts/ambicode.mjs', mode: 0o644 },
  { from: 'scripts/guard.mjs', mode: 0o644 },
  { from: 'hooks/hooks.json', mode: 0o644 },
  { from: 'docs/installation.md', mode: 0o644 },
  { from: 'docs/compatibility.md', mode: 0o644 },
  { from: 'docs/review.md', mode: 0o644 },
  { from: 'docs/rule-migration.md', mode: 0o644 },
];

const REPRODUCIBLE_MTIME = new Date(2020, 0, 1, 0, 0, 0, 0);

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

async function copyAllowedTree(fromDir, toDir, extensions, exclude = []) {
  let entries;
  try {
    entries = await readdir(fromDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyAllowedTree(from, to, extensions, exclude);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.includes(path.extname(entry.name)) || exclude.includes(entry.name)) continue;
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
    await copyAllowedTree(path.join(ROOT, dir.from), path.join(candidateDir, dir.from), dir.extensions, dir.exclude);
  }
  await normalizeTimestamps(candidateDir);
}

async function normalizeTimestamps(candidateDir) {
  for (const relativePath of await walkFiles(candidateDir)) {
    await utimes(path.join(candidateDir, relativePath), REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME);
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

async function checkRoutes(candidateDir) {
  const { validateRouteFiles } = await import('../src/harness/definition/routes.ts');
  await validateRouteFiles(candidateDir);
}

async function checkHooksManifest(candidateDir) {
  const manifestPath = path.join(candidateDir, 'hooks', 'hooks.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (cause) {
    throw new Error(`${manifestPath} is missing or not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
  }
  const events = Object.keys(manifest.hooks ?? {});
  const expectedEvents = ['PostToolUse', 'PreToolUse', 'SessionStart', 'UserPromptSubmit', 'PostCompact', 'SessionEnd'];
  for (const event of expectedEvents) {
    if (!events.includes(event)) throw new Error(`hooks/hooks.json is missing the "${event}" event.`);
  }
  for (const event of events) {
    for (const matcher of manifest.hooks[event]) {
      for (const entry of matcher.hooks ?? []) {
        // The guard is a second entry on purpose: it runs before every matching Bash call, and the CLI bundle starts 2.6x slower.
        const args = event === 'PreToolUse' ? ['${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs'] : ['${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs', 'hook'];
        if (entry.type !== 'command' || entry.command !== 'node' || JSON.stringify(entry.args) !== JSON.stringify(args)) {
          throw new Error(
            `hooks/hooks.json's "${event}" entry does not route through the single bundled entry point ` +
              '`node ${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs hook` in cross-platform exec form.',
          );
        }
      }
    }
  }
}

async function checkLauncherExecutable(candidateDir) {
  if (process.platform === 'win32') {
    const windowsLauncher = await readFile(path.join(candidateDir, 'bin/ambicode.cmd'), 'utf8');
    if (!windowsLauncher.includes('scripts\\ambicode.mjs')) {
      throw new Error('bin/ambicode.cmd does not route to the bundled Node entry point.');
    }
    return;
  }
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

/**
 * Pure JavaScript zip, so packaging needs no OS `zip` executable (absent on Windows). Sorted
 * input, fixed timestamps and explicit Unix modes keep the bytes reproducible on every host.
 */
async function buildZip(stagingParent, version) {
  const entryName = `ambicode-${version}`;
  const files = (await walkFiles(path.join(stagingParent, entryName))).sort();
  const zipPath = path.join(stagingParent, `${entryName}.zip`);
  await rm(zipPath, { force: true });
  const entries = {};
  for (const relativePath of files) {
    const absolutePath = path.join(stagingParent, entryName, relativePath);
    const mode = (await stat(absolutePath)).mode & 0o777;
    entries[`${entryName}/${relativePath}`] = [
      await readFile(absolutePath),
      { mtime: REPRODUCIBLE_MTIME, os: 3, attrs: mode << 16 },
    ];
  }
  await writeFile(zipPath, zipSync(entries, { level: 9, mtime: REPRODUCIBLE_MTIME }));
  const sha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
  return { zipPath, sha256 };
}

async function main() {
  execFileSync('node', ['tools/build.mjs'], { cwd: ROOT, stdio: 'inherit' });

  const version = await canonicalVersion();
  const candidateDir = path.join(DIST, `ambicode-${version}`);

  await buildCandidate(candidateDir);
  await checkLauncherExecutable(candidateDir);
  await checkNoForbiddenDependencies(candidateDir);
  await checkNoWorkstationPaths(candidateDir);
  await checkHooksManifest(candidateDir);
  await checkRoutes(candidateDir);

  const inventory = await inventoryOf(candidateDir);
  await mkdir(DIST, { recursive: true });
  const inventoryPath = path.join(DIST, `ambicode-${version}.inventory.json`);
  await writeFile(inventoryPath, `${JSON.stringify({ version, files: inventory }, null, 2)}\n`);

  const { zipPath, sha256: zipDigest } = await buildZip(DIST, version);
  await writeFile(path.join(DIST, `ambicode-${version}.zip.sha256`), `${zipDigest}  ambicode-${version}.zip\n`);

  console.log(`Candidate directory: ${candidateDir}`);
  console.log(`Inventory:           ${inventoryPath} (${inventory.length} files)`);
  console.log(`Archive:              ${zipPath}`);
  console.log(`Archive sha256:       ${zipDigest}`);
  return { candidateDir, inventoryPath, zipPath, zipDigest, version, inventory };
}

async function checkReproducible() {
  execFileSync('node', ['tools/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  const first = await packageInto(await mkdtemp(path.join(tmpdir(), 'ambicode-repro-a-')));
  execFileSync('node', ['tools/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  const second = await packageInto(await mkdtemp(path.join(tmpdir(), 'ambicode-repro-b-')));

  if (JSON.stringify(first.inventory) !== JSON.stringify(second.inventory)) {
    throw new Error('Two packaging runs from the same source produced different file sets or hashes.');
  }
  if (first.zipSha256 !== second.zipSha256) {
    throw new Error(
      `Two packaging runs produced the same file set but different zip bytes ` +
        `(${first.zipSha256} vs ${second.zipSha256}). The archive is not reproducible even though its contents are.`,
    );
  }
  console.log(
    `Reproducible: ${first.inventory.length} files, identical paths/sizes/sha256 digests, ` +
      `and identical zip sha256 (${first.zipSha256}) across two independent runs.`,
  );
}

async function packageInto(parentDir) {
  const version = await canonicalVersion();
  const candidateDir = path.join(parentDir, `ambicode-${version}`);
  await buildCandidate(candidateDir);
  const inventory = await inventoryOf(candidateDir);
  const { sha256: zipSha256 } = await buildZip(parentDir, version);
  await rm(parentDir, { recursive: true, force: true });
  return {
    inventory: inventory.map(({ path: p, bytes, sha256, mode }) => ({ path: p, bytes, sha256, mode })),
    zipSha256,
  };
}

/**
 * Validates the candidate, not the checkout: the repository's root CLAUDE.md, which never
 * ships, fails `validate . --strict`.
 */
function validatePlugin(candidateDir) {
  // A command string, not an args array: `claude` is a PATH shim on Windows so
  // a shell-less spawn is ENOENT, and args plus `shell: true` is DEP0190. Only
  // `dist/ambicode-<semver>` is interpolated, which cannot contain a space.
  const target = path.relative(ROOT, candidateDir).split(path.sep).join('/');
  execSync(`claude plugin validate ${target} --strict`, { cwd: ROOT, stdio: 'inherit' });
}

const mode = process.argv[2];
if (mode === '--check-reproducible') {
  await checkReproducible();
} else {
  const { candidateDir } = await main();
  if (mode === '--validate-plugin') validatePlugin(candidateDir);
}
