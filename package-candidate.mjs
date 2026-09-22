// Assembles the installable AMBICODE plugin candidate under dist/, from an
// explicit file allowlist, and records what went into it (doc 03 P1.7 §1-2).
//
// Deliberately a plain Node script, not a packaging framework: the allowlist
// below is the actual contract for what ships, so it is easier to review as a
// short list here than as configuration for a generic bundler plugin.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

// Directories copied wholesale, filtered to these extensions and skipping any
// dotfile (so a stray `.DS_Store` or similar workstation file never ships).
// This is the "everything required at runtime" list from doc 03 P1.7 §1.
//
// `docs/` is deliberately NOT copied wholesale (doc 03 P1.7 correction B): a
// recursive copy picked up `docs/acceptance/**` — this repository's own dated
// acceptance records — which is build evidence, not a shipped document, and
// silently changed the candidate's file count between one packaging run and
// the acceptance record that described it. Shipped documentation is instead
// an explicit list in FILE_ALLOWLIST below, the same way the runtime files are.
const DIRECTORY_ALLOWLIST = [
  { from: 'skills', extensions: ['.md'] },
  { from: 'prompts', extensions: ['.md'] },
  { from: 'policies', extensions: ['.yaml', '.md'] },
  { from: 'templates', extensions: ['.eta', '.css'] },
];

// Individual files, each with the mode the installed copy must carry. This is
// the complete shipped-document allowlist for `docs/`: acceptance records,
// the release/pilot-owner checklist and anything else under `docs/` not named
// here is deliberately excluded from the candidate.
const FILE_ALLOWLIST = [
  { from: '.claude-plugin/plugin.json', mode: 0o644 },
  { from: 'bin/ambicode', mode: 0o755 },
  { from: 'bin/ambicode.cmd', mode: 0o644 },
  { from: 'scripts/ambicode.mjs', mode: 0o644 },
  { from: 'hooks/hooks.json', mode: 0o644 },
  { from: 'docs/installation.md', mode: 0o644 },
  { from: 'docs/compatibility.md', mode: 0o644 },
  { from: 'docs/review.md', mode: 0o644 },
  { from: 'docs/rule-migration.md', mode: 0o644 },
];

// Fixed so two packaging runs of identical content produce identical zip
// bytes (doc 03 P1.7 correction B): a freshly copied file's real mtime would
// otherwise differ between two runs a second apart and change every zip entry
// that carries a timestamp, even though nothing shipped actually changed.
// ZIP's DOS timestamp has no timezone. fflate deliberately uses local Date
// fields, so construct the fixed value in local time: every timezone then
// writes the same 2020-01-01 00:00 bytes instead of shifting a UTC instant.
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
  await normalizeTimestamps(candidateDir);
}

/** Every shipped file gets the same fixed mtime, so byte-reproducibility does
 * not depend on how quickly two packaging runs happen one after another. */
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

/**
 * The candidate-level version of doc 04 P2.2 correction B: every skill that
 * points at the shared MCP-acquisition procedure must do so through
 * `${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md`, never a path
 * relative to the product repository — a plugin loaded from Claude Code's own
 * cache has no such repository. Checked against the assembled candidate
 * itself, not only the source tree, because that is what a real install
 * actually loads.
 */
async function checkSharedResourceReferences(candidateDir) {
  const SHARED_RESOURCE = 'skills/shared/requirements-mcp.md';
  const PLUGIN_ROOT_REFERENCE = '${CLAUDE_PLUGIN_ROOT}/skills/shared/requirements-mcp.md';
  const EXPECTED_REFERRERS = ['review', 'investigate', 'plan', 'task', 'rules'];

  const sharedFile = path.join(candidateDir, SHARED_RESOURCE);
  if (!(await stat(sharedFile).then(() => true, () => false))) {
    throw new Error(`${SHARED_RESOURCE} is missing from the candidate; review/investigate/plan reference it.`);
  }

  const skillsDir = path.join(candidateDir, 'skills');
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const referrers = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    const text = await readFile(skillFile, 'utf8').catch(() => '');
    if (text === '') continue;

    const mentionsSharedFile = text.includes('requirements-mcp.md');
    if (!mentionsSharedFile) continue;
    referrers.push(entry.name);

    if (!text.includes(PLUGIN_ROOT_REFERENCE)) {
      throw new Error(
        `${entry.name}/SKILL.md references ${SHARED_RESOURCE} without the "${PLUGIN_ROOT_REFERENCE}" ` +
          'plugin-root substitution, so an installed plugin (not run from the product repository) could not resolve it.',
      );
    }
    // A bare, non-substituted reference anywhere in the same file is a
    // leftover source-checkout-relative path, not a second legitimate use.
    const bareReference = new RegExp(`(?<!\\$\\{CLAUDE_PLUGIN_ROOT\\}/)${SHARED_RESOURCE.replace(/\./g, '\\.')}`);
    if (bareReference.test(text)) {
      throw new Error(`${entry.name}/SKILL.md references ${SHARED_RESOURCE} by a path relative to the product repository.`);
    }
  }

  for (const expected of EXPECTED_REFERRERS) {
    if (!referrers.includes(expected)) {
      throw new Error(`Expected ${expected}/SKILL.md to reference the shared MCP-acquisition procedure, but it does not.`);
    }
  }
}

/**
 * Doc 04 P2.4 correction G2/I4: the packaged hook manifest ships, declares
 * every documented event this plugin uses, and routes each one through the
 * single bundled `ambicode hook` entry point — never a second executable or
 * a shell/jq parser — checked against the assembled candidate itself.
 */
async function checkHooksManifest(candidateDir) {
  const manifestPath = path.join(candidateDir, 'hooks', 'hooks.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (cause) {
    throw new Error(`${manifestPath} is missing or not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
  }
  const events = Object.keys(manifest.hooks ?? {});
  const expectedEvents = ['PostToolUse', 'SessionStart', 'UserPromptSubmit', 'PostCompact', 'SessionEnd'];
  for (const event of expectedEvents) {
    if (!events.includes(event)) throw new Error(`hooks/hooks.json is missing the "${event}" event.`);
  }
  for (const event of events) {
    for (const matcher of manifest.hooks[event]) {
      for (const entry of matcher.hooks ?? []) {
        if (
          entry.type !== 'command' ||
          entry.command !== 'node' ||
          JSON.stringify(entry.args) !== JSON.stringify(['${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs', 'hook'])
        ) {
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
 * Zips the already-built `<stagingParent>/ambicode-<version>` directory with a
 * pure JavaScript ZIP implementation. The prior Info-ZIP subprocess made an
 * otherwise Node-only package fail on a normal Windows machine. Sorted input,
 * fixed timestamps and explicit Unix mode attributes keep the archive bytes
 * reproducible on every host without requiring an OS `zip` executable.
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
  await checkSharedResourceReferences(candidateDir);
  await checkHooksManifest(candidateDir);

  const inventory = await inventoryOf(candidateDir);
  await mkdir(DIST, { recursive: true });
  const inventoryPath = path.join(DIST, `ambicode-${version}.inventory.json`);
  await writeFile(inventoryPath, `${JSON.stringify({ version, files: inventory }, null, 2)}\n`);

  // The zip is an optional, byte-reproducible convenience artifact, not part
  // of local installation: `install-local.mjs` installs the candidate
  // directory itself (doc 03 P1.7 correction C — installation is local, and a
  // local-path marketplace source needs no archive).
  const { zipPath, sha256: zipDigest } = await buildZip(DIST, version);
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
 * file set, every content hash, and the zip's own bytes are identical (doc 03
 * P1.7 correction B: "compare the two zip SHA-256 values").
 */
async function checkReproducible() {
  // Rebuilds the bundle itself between the two packaging attempts, so this
  // proves the whole pipeline — esbuild bundling included, not only the file
  // copy — is deterministic from the same source and the same lockfile.
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  const first = await packageInto(await mkdtemp(path.join(tmpdir(), 'ambicode-repro-a-')));
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });
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

/** Builds into `<parentDir>/ambicode-<version>` so both reproducibility
 * attempts produce the same in-zip entry name regardless of their own
 * (necessarily distinct) temporary parent directory. */
async function packageInto(parentDir) {
  const version = await canonicalVersion();
  const candidateDir = path.join(parentDir, `ambicode-${version}`);
  await buildCandidate(candidateDir);
  const inventory = await inventoryOf(candidateDir);
  const { sha256: zipSha256 } = await buildZip(parentDir, version);
  await rm(parentDir, { recursive: true, force: true });
  // The version is not part of the file-set comparison; only the shipped
  // content, which is what "the same file set" means here.
  return {
    inventory: inventory.map(({ path: p, bytes, sha256, mode }) => ({ path: p, bytes, sha256, mode })),
    zipSha256,
  };
}

const mode = process.argv[2];
if (mode === '--check-reproducible') {
  await checkReproducible();
} else {
  await main();
}
