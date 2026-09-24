// Installs a packaged AMBICODE candidate into a chosen CLAUDE_CONFIG_DIR
// (doc 08 "Distribution"; doc 04 P2.2 correction A; doc 04 P2.3 correction A).
//
// AMBICODE is installed and used locally: there is no hosted, public, or
// private remote marketplace. Claude Code's own mechanism for installing a
// plugin from a directory is a marketplace whose one entry's `source` is a
// local path. Claude Code loads that local-directory source *in place* —
// the marketplace directory is not copied into a durable cache at install
// time — so the marketplace this script drives `claude plugin marketplace
// add`/`install` against must itself be durable, not a throwaway `/tmp`
// directory the caller is told it may delete.
//
// This script therefore owns one durable install layout beneath the chosen
// CLAUDE_CONFIG_DIR: `<config-dir>/ambicode-install/marketplace/`, holding a
// copy of the candidate plus the marketplace manifest that points at it, and
// `<config-dir>/ambicode-install/state.json`, the owned metadata that
// records which plugin version, scope, and (where applicable) project
// directory this script itself installed. That directory is never deleted
// except by this script's own successful `uninstall`.
//
// P2.3 correction A: every mutating step below happens in this order —
// build and validate the replacement in a sibling staging directory, publish
// it by renaming it over the live marketplace path only once it is fully
// validated (keeping the previous live content under a rollback name rather
// than deleting it), drive the native marketplace/plugin operations, and
// only *then* either discard the rollback copy and record success, or
// restore the rollback copy and report failure. "installed"/"uninstalled" is
// printed only once the whole operation has actually succeeded, and a
// failure exits nonzero while leaving a working installation in place.
//
// Usage:
//   node install-local.mjs install <candidate-dir> [--config-dir <dir>] \
//     [--scope user|project|local] [--project-dir <dir>]
//   node install-local.mjs uninstall [--config-dir <dir>] \
//     [--scope user|project|local] [--project-dir <dir>]
//   node install-local.mjs inspect [--config-dir <dir>]
//
// Example:
//   npm run package:candidate
//   node install-local.mjs install dist/ambicode-0.3.0
//   node install-local.mjs inspect
//   node install-local.mjs uninstall
import { execaSync } from 'execa';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKETPLACE_NAME = 'ambicode-team';
const SCOPES = ['user', 'project', 'local'];

function usageError(message) {
  console.error(`${message}\n`);
  console.error(
    [
      'Usage:',
      '  node install-local.mjs install <candidate-dir> [--config-dir <dir>] [--scope user|project|local] [--project-dir <dir>]',
      '  node install-local.mjs uninstall [--config-dir <dir>] [--scope user|project|local] [--project-dir <dir>]',
      '  node install-local.mjs inspect [--config-dir <dir>]',
    ].join('\n'),
  );
  process.exit(2);
}

export function defaultClaudeConfigDir(env = process.env, home = homedir()) {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  return path.resolve(configured === undefined || configured === '' ? path.join(home, '.claude') : configured);
}

export function parseArgs(argv, env = process.env, home = homedir()) {
  const [command, ...rest] = argv;
  if (command !== 'install' && command !== 'uninstall' && command !== 'inspect') {
    usageError(`Unknown command "${command ?? ''}". Expected "install", "uninstall", or "inspect".`);
  }

  const positionals = [];
  let scope = null;
  let scopeExplicit = false;
  let projectDir = null;
  let projectDirExplicit = false;
  let configDir = defaultClaudeConfigDir(env, home);
  let configDirExplicit = false;
  for (let i = 0; i < rest.length; i += 1) {
    const value = rest[i];
    if (value === '--scope') {
      scope = rest[i + 1] ?? usageError('--scope needs a value.');
      scopeExplicit = true;
      i += 1;
    } else if (value === '--project-dir') {
      projectDir = rest[i + 1] ?? usageError('--project-dir needs a value.');
      projectDirExplicit = true;
      i += 1;
    } else if (value === '--config-dir') {
      configDir = path.resolve(rest[i + 1] ?? usageError('--config-dir needs a value.'));
      configDirExplicit = true;
      i += 1;
    } else if (value?.startsWith('-')) {
      usageError(`Unknown option "${value}".`);
    } else {
      positionals.push(value);
    }
  }

  if (scopeExplicit && !SCOPES.includes(scope)) usageError(`--scope must be one of: ${SCOPES.join(', ')}.`);

  const expectedPositionals = command === 'install' ? 1 : 0;
  if (positionals.length !== expectedPositionals) {
    usageError(
      command === 'install'
        ? 'Expected exactly one positional argument: <candidate-dir>. Use --config-dir only for an intentionally isolated Claude configuration.'
        : 'Expected no positional arguments. Use --config-dir only for an intentionally isolated Claude configuration.',
    );
  }

  if (command === 'install') {
    // Fresh installs need an explicit scope; there is no prior recorded state
    // to fall back to, unlike uninstall.
    const effectiveScope = scopeExplicit ? scope : 'user';
    if ((effectiveScope === 'project' || effectiveScope === 'local') && !projectDirExplicit) {
      usageError(
        `--scope ${effectiveScope} writes settings into a target project's .claude/settings.json; pass --project-dir <dir> ` +
          'to say explicitly which project, rather than an incidental current working directory.',
      );
    }
    const [candidateDir] = positionals;
    return {
      command,
      candidateDir: path.resolve(candidateDir),
      configDir,
      configDirExplicit,
      scope: effectiveScope,
      projectDir: projectDirExplicit ? path.resolve(projectDir) : null,
    };
  }

  if (command === 'uninstall') {
    // Uninstall normally uses the recorded scope/project directory (P2.3
    // correction A). An explicit --scope/--project-dir here is compared
    // against that record, not a substitute for it.
    if (scopeExplicit && (scope === 'project' || scope === 'local') && !projectDirExplicit) {
      usageError(`--scope ${scope} needs an explicit --project-dir to compare against the recorded installation.`);
    }
    return {
      command,
      configDir,
      configDirExplicit,
      scope,
      scopeExplicit,
      projectDir: projectDirExplicit ? path.resolve(projectDir) : null,
      projectDirExplicit,
    };
  }

  return { command, configDir, configDirExplicit };
}

/** `<config-dir>/ambicode-install/`: the one directory this script owns. */
function installRoot(configDir) {
  return path.join(configDir, 'ambicode-install');
}

function marketplaceDir(configDir) {
  return path.join(installRoot(configDir), 'marketplace');
}

function marketplaceManifestPath(marketDir) {
  return path.join(marketDir, '.claude-plugin', 'marketplace.json');
}

function statePath(configDir) {
  return path.join(installRoot(configDir), 'state.json');
}

function lockPath(configDir) {
  return path.join(installRoot(configDir), 'lock.json');
}

function journalPath(configDir) {
  return path.join(installRoot(configDir), 'recovery-journal.json');
}

function randomSuffix() {
  return randomBytes(6).toString('hex');
}

async function pathExists(candidate) {
  return stat(candidate).then(
    () => true,
    () => false,
  );
}

/** Stable content identity for detecting a changed candidate that reused its version. */
async function candidateFingerprint(root) {
  const hash = createHash('sha256');
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolute);
        hash.update(`file\0${relative}\0${bytes.length}\0`);
        hash.update(bytes);
      } else {
        throw new InstallError('invalid-candidate', `Candidate contains an unsupported filesystem entry: ${relative}.`);
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

/** `null` when the source does not exist yet (e.g. a project dir not yet created); realpath'd otherwise so scope comparison is never fooled by a symlinked prefix (P2.4 correction D3). */
async function canonicalize(candidate) {
  if (candidate === null) return null;
  try {
    return await realpath(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

/**
 * An ownership lock so two installer processes never mutate the same install
 * root concurrently (P2.4 correction D11). A stale lock — its recorded pid no
 * longer running — is reclaimed; a live one is refused outright rather than
 * silently waited on, so a caller sees the conflict instead of two processes
 * racing to publish the same marketplace directory.
 */
async function acquireLock(configDir) {
  await mkdir(installRoot(configDir), { recursive: true });
  const target = lockPath(configDir);
  const record = { pid: process.pid, acquiredAt: new Date().toISOString() };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      return { release: () => rm(target, { force: true }) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let holder;
    try {
      holder = JSON.parse(await readFile(target, 'utf8'));
    } catch {
      holder = null;
    }
    const holderPid = typeof holder?.pid === 'number' ? holder.pid : null;
    if (holderPid !== null && isProcessAlive(holderPid)) {
      throw new InstallError(
        'locked',
        `Another install-local.mjs process (pid ${holderPid}) is already mutating ${installRoot(configDir)}. ` +
          'Wait for it to finish, or remove the lock file yourself if you are certain it is not actually running: ' +
          `${target}`,
      );
    }
    // Stale: the recorded process is gone. Reclaim by removing it and retrying once.
    await rm(target, { force: true });
  }
  throw new InstallError('locked', `Could not acquire the install lock at ${target} after reclaiming a stale one.`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM'; // Exists, just not signalable by us — still alive.
  }
}

async function readCandidateIdentity(candidateDir) {
  const manifestPath = path.join(candidateDir, '.claude-plugin', 'plugin.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (cause) {
    throw new Error(`Could not read ${manifestPath}: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`${manifestPath} is missing "name" or "version".`);
  }
  return { name: manifest.name, version: manifest.version };
}

const SUPPORTED_STATE_SCHEMA_VERSION = 1;

/**
 * The owned metadata this script persists on every successful install (P2.3
 * correction A; P2.4 correction D4): enough to identify the installed
 * plugin version, scope, and explicit project directory, so a later
 * `uninstall` never has to guess or accept an arbitrary caller-supplied
 * scope for state it did not itself record.
 *
 * Returns a tagged result that keeps "absent" (nothing installed by this
 * script, a genuine no-op) strictly apart from "corrupt" (the file exists
 * but is unreadable, invalid JSON, missing required fields, or declares a
 * schema version this script does not understand) — the latter is an
 * actionable failure a caller must resolve, never silently treated the same
 * as "nothing to do here".
 */
async function readStateStrict(configDir) {
  const target = statePath(configDir);
  let raw;
  try {
    raw = await readFile(target, 'utf8');
  } catch (cause) {
    if (cause.code === 'ENOENT') return { kind: 'absent' };
    return { kind: 'corrupt', reason: `could not read ${target}: ${describe(cause)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { kind: 'corrupt', reason: `${target} is not valid JSON: ${describe(cause)}` };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { kind: 'corrupt', reason: `${target} must contain a JSON object` };
  }
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== SUPPORTED_STATE_SCHEMA_VERSION) {
    return {
      kind: 'corrupt',
      reason: `${target} declares schemaVersion ${JSON.stringify(parsed.schemaVersion)}; this script supports ${SUPPORTED_STATE_SCHEMA_VERSION}`,
    };
  }
  if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string' || typeof parsed.scope !== 'string') {
    return { kind: 'corrupt', reason: `${target} is missing required field "name", "version", or "scope"` };
  }
  if (!SCOPES.includes(parsed.scope)) {
    return { kind: 'corrupt', reason: `${target} declares unsupported scope ${JSON.stringify(parsed.scope)}` };
  }
  if (parsed.projectDir !== null && parsed.projectDir !== undefined && typeof parsed.projectDir !== 'string') {
    return { kind: 'corrupt', reason: `${target} field "projectDir" must be a string or null` };
  }
  return {
    kind: 'ok',
    state: {
      name: parsed.name,
      version: parsed.version,
      scope: parsed.scope,
      projectDir: typeof parsed.projectDir === 'string' ? parsed.projectDir : null,
    },
  };
}

async function writeState(configDir, state) {
  await mkdir(installRoot(configDir), { recursive: true });
  const target = statePath(configDir);
  const temporary = `${target}.tmp-${process.pid}-${randomSuffix()}`;
  let handle = null;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ schemaVersion: SUPPORTED_STATE_SCHEMA_VERSION, ...state }, null, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

/**
 * Builds the complete replacement marketplace content — the candidate copy
 * plus the manifest that points at it — at `targetDir`, which must not yet
 * exist. Nothing at the live marketplace path is touched by this step (P2.3
 * correction A, "build and validate a replacement in a sibling staging
 * directory").
 */
async function buildMarketplaceContent(targetDir, candidateDir, name, version) {
  const pluginDirName = `${name}-${version}`;
  await mkdir(targetDir, { recursive: true });
  await cp(candidateDir, path.join(targetDir, pluginDirName), { recursive: true });
  await mkdir(path.join(targetDir, '.claude-plugin'), { recursive: true });
  const manifest = {
    name: MARKETPLACE_NAME,
    owner: { name: 'local install' },
    description: 'AMBICODE local-install marketplace: durable under CLAUDE_CONFIG_DIR, never hosted or published.',
    plugins: [{ name, source: `./${pluginDirName}`, version }],
  };
  await writeFile(
    marketplaceManifestPath(targetDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * Validates the staged content before it is ever published or handed to a
 * native command (P2.3 correction A: a malformed candidate must be caught
 * here, not misreported as an "already installed" native failure). Checks
 * that the manifest parses and that the copied plugin's own manifest agrees
 * with the identity this script read from the source candidate directory.
 */
async function validateMarketplaceContent(targetDir, name, version) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(marketplaceManifestPath(targetDir), 'utf8'));
  } catch (cause) {
    throw new InstallError('invalid-candidate', `Staged marketplace manifest is not valid JSON: ${describe(cause)}`);
  }
  const entry = Array.isArray(manifest.plugins) ? manifest.plugins[0] : undefined;
  if (entry === undefined || entry.name !== name || entry.version !== version) {
    throw new InstallError('invalid-candidate', 'Staged marketplace manifest does not match the candidate identity.');
  }
  const pluginManifestPath = path.join(targetDir, entry.source, '.claude-plugin', 'plugin.json');
  let pluginManifest;
  try {
    pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'));
  } catch (cause) {
    throw new InstallError('invalid-candidate', `Could not read the staged plugin's own manifest: ${describe(cause)}`);
  }
  if (pluginManifest.name !== name || pluginManifest.version !== version) {
    throw new InstallError('invalid-candidate', 'The staged plugin manifest disagrees with the candidate identity.');
  }
}

class InstallError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function describe(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Wraps a real `claude` invocation, in a plain shape a fake can produce
 * without shelling out (P2.3 correction A: "inject or fake native command
 * outcomes"). Never throws: a failing native command is data, not a thrown
 * error, so callers decide what a given failure means.
 */
function runClaude(args, { configDir, projectDir }) {
  const result = execaSync('claude', args, {
    cwd: projectDir ?? undefined,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: 'utf8',
    stdin: 'ignore',
    reject: false,
  });
  return {
    ok: result.exitCode === 0 && !result.failed,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : (result.shortMessage ?? result.message ?? ''),
  };
}

/** `--json` always prints one structured result line, on success or failure. */
function parseJsonCommandResult(raw) {
  let json = null;
  try {
    json = JSON.parse(raw.stdout);
  } catch {
    // No parseable JSON on stdout: a failure this script did not anticipate
    // (e.g. the executable itself is missing). Never guessed as "already
    // present" — that classification only ever comes from a real structured
    // outcome (P2.3 correction A).
  }
  if (json !== null && typeof json === 'object' && typeof json.outcome === 'string') {
    return {
      ok: json.outcome === 'ok',
      outcome: json.outcome,
      failureCode: typeof json.failureCode === 'string' ? json.failureCode : null,
      message: typeof json.message === 'string' ? json.message : null,
      raw: json,
      stderr: raw.stderr,
    };
  }
  return { ok: false, outcome: 'failed', failureCode: null, message: raw.stderr || null, raw: null, stderr: raw.stderr };
}

/**
 * The real native command adapter. Every method returns a normalized,
 * never-throwing outcome so `install`/`uninstall` can react to *what actually
 * happened* — a structured `--json` result where the native CLI offers one,
 * otherwise a classified text outcome — rather than treating every nonzero
 * exit the same way.
 */
export function createRealNativeCommands() {
  return {
    marketplaceAdd(dir, opts) {
      const r = runClaude(['plugin', 'marketplace', 'add', dir], opts);
      return { ok: r.ok, stdout: r.stdout, stderr: r.stderr };
    },
    marketplaceUpdate(name, opts) {
      const r = runClaude(['plugin', 'marketplace', 'update', name], opts);
      return { ok: r.ok, stdout: r.stdout, stderr: r.stderr };
    },
    marketplaceRemove(name, opts) {
      const r = runClaude(['plugin', 'marketplace', 'remove', name], opts);
      // The real CLI's only distinguishable text signal for this case
      // (`marketplace remove`/`marketplace update` have no --json form).
      const notFound = !r.ok && /not found/i.test(r.stderr);
      return { ok: r.ok, notFound, stdout: r.stdout, stderr: r.stderr };
    },
    pluginInstall(pluginId, scope, opts) {
      return parseJsonCommandResult(runClaude(['plugin', 'install', pluginId, '-s', scope, '-y', '--json'], opts));
    },
    pluginUpdate(pluginId, scope, opts) {
      return parseJsonCommandResult(runClaude(['plugin', 'update', pluginId, '-s', scope, '-y', '--json'], opts));
    },
    pluginUninstall(pluginId, scope, opts) {
      return parseJsonCommandResult(runClaude(['plugin', 'uninstall', pluginId, '-s', scope, '-y', '--json'], opts));
    },
    pluginList(opts) {
      const r = runClaude(['plugin', 'list', '--json'], opts);
      if (!r.ok) return { ok: false, plugins: [], stderr: r.stderr };
      try {
        const plugins = JSON.parse(r.stdout);
        if (!Array.isArray(plugins)) {
          // Malformed/truncated structured data (P2.4 correction D5): never
          // silently treated as "the empty list", which downstream logic
          // would otherwise read as "nothing installed".
          return { ok: false, plugins: [], stderr: '`claude plugin list --json` did not return a JSON array' };
        }
        return { ok: true, plugins, stderr: r.stderr };
      } catch (cause) {
        return { ok: false, plugins: [], stderr: `Could not parse \`claude plugin list --json\` output: ${describe(cause)}` };
      }
    },
    /**
     * Strict validation against the *staged* candidate, before it is ever
     * published over the live marketplace path or handed to a native
     * install/update (P2.4 correction D6): `claude plugin validate <dir>
     * --strict --json` treats warnings as failures too.
     */
    pluginValidateStrict(pluginDir) {
      const result = execaSync('claude', ['plugin', 'validate', pluginDir, '--strict', '--json'], {
        encoding: 'utf8',
        stdin: 'ignore',
        reject: false,
      });
      const r = {
        ok: result.exitCode === 0 && !result.failed,
        stdout: typeof result.stdout === 'string' ? result.stdout : '',
        stderr: typeof result.stderr === 'string' ? result.stderr : (result.shortMessage ?? result.message ?? ''),
      };
      let report = null;
      try {
        report = JSON.parse(r.stdout);
      } catch {
        // Handled below as a failure with no parsed report.
      }
      const success = report !== null && typeof report === 'object' && report.success === true;
      return { ok: success, report, stderr: r.stderr };
    },
  };
}

function findInstalled(plugins, name, scope) {
  const id = `${name}@${MARKETPLACE_NAME}`;
  return plugins.find((entry) => entry?.id === id && entry?.scope === scope) ?? null;
}

function ok(detail) {
  return { ok: true, ...detail };
}

function failed(code, detail, native, journal) {
  return { ok: false, code, detail, native: native ?? null, journal: journal ?? null };
}

/**
 * Runs compensating actions in their explicit recovery order. Callers arrange
 * that order around the dependency they are restoring: a fresh install removes
 * plugin and marketplace registrations before removing their source; an
 * upgrade restores the prior source before refreshing/downgrading native
 * state from it. Every normalized `{ok:false}` result must be converted to a
 * thrown error by the action itself, because the native adapter deliberately
 * never throws. A failed compensation therefore always creates a journal.
 */
async function failWithCompensation(configDir, code, detail, native, compensations) {
  const failures = [];
  for (const action of compensations) {
    try {
      await action.undo();
    } catch (error) {
      failures.push({ description: action.description, error: describe(error) });
      // Later actions may remove state the failed action still depends on.
      // Stop at the first failed compensation and leave the remaining source
      // intact for the recovery journal's manual steps.
      break;
    }
  }
  if (failures.length === 0) {
    await rm(journalPath(configDir), { force: true }).catch(() => {});
    return failed(code, detail, native);
  }

  const journal = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    failedOperation: code,
    detail,
    failedCompensations: failures,
    recoveryInstructions: [
      `Automatic recovery could not complete after "${code}" failed.`,
      `${failures.length} compensating step(s) also failed: ${failures.map((f) => `${f.description} (${f.error})`).join('; ')}.`,
      `Inspect ${installRoot(configDir)} by hand: it may hold a ".marketplace.rollback-*" directory (the previous working content) and/or a ".marketplace.staging-*" directory (the attempted replacement) — neither has been deleted.`,
      `The native marketplace "${MARKETPLACE_NAME}" and any plugin registered from it may be inconsistent. Inspect with: claude plugin list --json  (CLAUDE_CONFIG_DIR=${configDir})  and  claude plugin marketplace list`,
      `Clear it by hand if needed: claude plugin uninstall <id>@${MARKETPLACE_NAME} -s <scope>  then  claude plugin marketplace remove ${MARKETPLACE_NAME}`,
      `Once resolved by hand, remove ${journalPath(configDir)} yourself, or re-run "node install-local.mjs uninstall --config-dir <dir>" to attempt a clean removal.`,
    ],
  };
  await mkdir(installRoot(configDir), { recursive: true });
  await writeFile(journalPath(configDir), `${JSON.stringify(journal, null, 2)}\n`);
  return failed(code, detail, native, journal);
}

/**
 * D8: the postcondition is verified through the same structured plugin state
 * a caller would inspect, not inferred from "the native command returned
 * ok" — exact plugin id, scope, project path where applicable, expected
 * version, enabled/loadable status, and no reported load errors.
 */
function verifyPostcondition(plugins, { name, version, scope, canonicalProjectDir }) {
  const id = `${name}@${MARKETPLACE_NAME}`;
  const entry = plugins.find((candidate) => candidate?.id === id && candidate?.scope === scope);
  if (entry === undefined) {
    return { ok: false, reason: `no plugin entry with id "${id}" and scope "${scope}" was found in structured plugin state after install` };
  }
  if (entry.version !== version) {
    return { ok: false, reason: `plugin "${id}" reports version "${entry.version}", expected "${version}"` };
  }
  if (entry.enabled !== undefined && entry.enabled !== true) {
    return { ok: false, reason: `plugin "${id}" is not enabled (enabled: ${JSON.stringify(entry.enabled)})` };
  }
  if ((scope === 'project' || scope === 'local') && canonicalProjectDir !== null) {
    if (typeof entry.projectPath !== 'string') {
      return { ok: false, reason: `plugin "${id}" does not report the required project path for scope "${scope}"` };
    }
    if (entry.projectPath !== canonicalProjectDir) {
      return { ok: false, reason: `plugin "${id}" reports project path "${entry.projectPath}", expected "${canonicalProjectDir}"` };
    }
  }
  if (Array.isArray(entry.errors) && entry.errors.length > 0) {
    return { ok: false, reason: `plugin "${id}" reports load errors: ${entry.errors.join('; ')}` };
  }
  return { ok: true };
}

/**
 * Installs, or upgrades an existing installation in place (P2.3 correction
 * A; P2.4 correction D). One `CLAUDE_CONFIG_DIR/ambicode-install` is one
 * owned installation:
 *
 *  1. An ownership lock keeps two installer processes from racing (D11).
 *  2. Existing state is read and strictly validated *before* anything is
 *     changed (D1/D4): corruption is an actionable failure, not treated as
 *     "nothing installed".
 *  3. A scope or canonical project directory that differs from an existing
 *     installation's is refused before any mutation (D2/D3) — scope
 *     migration is an explicit uninstall followed by install, never this.
 *  4. The replacement is staged and strictly validated (`claude plugin
 *     validate --strict`) before it is ever published (D6), then published
 *     atomically over the live marketplace path, preserving the previous
 *     content under a rollback name rather than deleting it up front.
 *  5. Every native mutation pushes its own compensation before the next
 *     step runs, so a failure partway through unwinds exactly what
 *     happened, in the right order (D7).
 *  6. Success is proven by re-reading structured plugin state, never
 *     inferred from a native command's exit code alone (D5/D8).
 *  7. State is written before the rollback copy is discarded, so a
 *     state-write failure is itself compensated rather than losing the
 *     recovery path first (D9).
 */
export async function install({ candidateDir, configDir, scope, projectDir }, native = createRealNativeCommands()) {
  const canonicalProjectDir = await canonicalize(projectDir);
  const { name, version } = await readCandidateIdentity(candidateDir);

  let lock;
  try {
    lock = await acquireLock(configDir);
  } catch (error) {
    if (error instanceof InstallError) return failed(error.code, error.message);
    throw error;
  }
  try {
    const existing = await readStateStrict(configDir);
    if (existing.kind === 'corrupt') {
      return failed(
        'state-corrupt',
        `Existing installer state is corrupt (${existing.reason}). Resolve it by hand — inspect or remove ` +
          `${installRoot(configDir)} — before installing again; this script never overwrites unreadable state.`,
      );
    }
    const priorState = existing.kind === 'ok' ? existing.state : null;

    if (priorState !== null) {
      const priorCanonicalProjectDir = await canonicalize(priorState.projectDir);
      if (priorState.scope !== scope || priorCanonicalProjectDir !== canonicalProjectDir) {
        return failed(
          'scope-mismatch',
          `An installation already exists with scope "${priorState.scope}"` +
            `${priorState.projectDir === null ? '' : ` (project dir ${priorState.projectDir})`}; refusing to install ` +
            `scope "${scope}"${canonicalProjectDir === null ? '' : ` (project dir ${canonicalProjectDir})`} instead. ` +
            'Scope migration requires an explicit "node install-local.mjs uninstall" followed by a fresh install.',
        );
      }
      if (priorState.version === version) {
        const priorCandidateDir = path.join(marketplaceDir(configDir), `${priorState.name}-${priorState.version}`);
        if (!(await pathExists(priorCandidateDir))) {
          return failed(
            'same-version-source-missing',
            `The recorded ${name} ${version} source is missing, so a same-version reinstall cannot prove what Claude has cached. ` +
              'Uninstall and install again, or build a candidate with a new version.',
          );
        }
        const [incomingFingerprint, priorFingerprint] = await Promise.all([
          candidateFingerprint(candidateDir),
          candidateFingerprint(priorCandidateDir),
        ]);
        if (incomingFingerprint !== priorFingerprint) {
          return failed(
            'same-version-content-changed',
            `Candidate content changed while version stayed ${JSON.stringify(version)}. Claude Code treats a same-version update as already current and would keep stale cached skills. ` +
              'For development, use claude --plugin-dir and /reload-plugins. For an installed candidate, bump the version before reinstalling.',
          );
        }
      }
    }

    const marketDir = marketplaceDir(configDir);
    const marketExisted = await pathExists(marketDir);
    const stagingDir = path.join(installRoot(configDir), `.marketplace.staging-${randomSuffix()}`);
    const pluginDirName = `${name}-${version}`;

    await buildMarketplaceContent(stagingDir, candidateDir, name, version);
    try {
      await validateMarketplaceContent(stagingDir, name, version);
      const strict = await native.pluginValidateStrict(path.join(stagingDir, pluginDirName));
      if (!strict.ok) {
        throw new InstallError(
          'plugin-validation-failed',
          `Strict plugin validation failed for the staged candidate: ${describe(strict.report ?? strict.stderr)}`,
        );
      }
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true });
      if (error instanceof InstallError) return failed(error.code, error.message);
      throw error;
    }

    const rollbackDir = marketExisted
      ? path.join(installRoot(configDir), `.marketplace.rollback-${randomSuffix()}`)
      : null;
    if (rollbackDir !== null) await rename(marketDir, rollbackDir);
    await rename(stagingDir, marketDir);

    const runOptions = { configDir, projectDir: canonicalProjectDir };
    // Stored in the exact order recovery must run. Fresh-install native
    // registrations are prepended before the filesystem restore. Upgrade
    // refresh/downgrade actions are appended after the prior filesystem has
    // been restored.
    const compensations = [
      {
        description: 'restore the previous marketplace directory content',
        undo: async () => {
          await rm(marketDir, { recursive: true, force: true });
          if (rollbackDir !== null) await rename(rollbackDir, marketDir);
        },
      },
    ];

    if (!marketExisted) {
      compensations.unshift({
        description: 'remove the marketplace registration this install may have created',
        undo: async () => {
          const result = await native.marketplaceRemove(MARKETPLACE_NAME, runOptions);
          if (!result.ok && result.notFound !== true) {
            throw new Error(result.stderr || 'marketplace removal returned an unsuccessful outcome');
          }
        },
      });
    } else {
      compensations.push({
        description: 'refresh the marketplace after restoring its previous directory content',
        undo: async () => {
          const result = await native.marketplaceUpdate(MARKETPLACE_NAME, runOptions);
          if (!result.ok) throw new Error(result.stderr || 'marketplace refresh returned an unsuccessful outcome');
        },
      });
    }

    const addResult = await native.marketplaceAdd(marketDir, runOptions);
    if (!addResult.ok) {
      return await failWithCompensation(configDir, 'marketplace-add-failed', 'Adding the local marketplace failed.', addResult, compensations);
    }
    const updateMarketResult = await native.marketplaceUpdate(MARKETPLACE_NAME, runOptions);
    if (!updateMarketResult.ok) {
      return await failWithCompensation(configDir, 'marketplace-update-failed', 'Refreshing the local marketplace failed.', updateMarketResult, compensations);
    }

    const listResult = await native.pluginList(runOptions);
    if (!listResult.ok) {
      // D5: malformed/failed structured state is never read as "not installed".
      return await failWithCompensation(
        configDir,
        'plugin-list-failed',
        'Could not read structured plugin state, so installation status could not be determined.',
        listResult,
        compensations,
      );
    }
    const priorNative = findInstalled(listResult.plugins, name, scope);

    if (priorNative === null) {
      compensations.unshift({
        description: 'uninstall the plugin registration this install may have created',
        undo: async () => {
          const result = await native.pluginUninstall(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
          if (!result.ok && result.failureCode !== 'not_installed') {
            throw new Error(result.message || result.stderr || 'plugin uninstall returned an unsuccessful outcome');
          }
        },
      });
      const installResult = await native.pluginInstall(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
      if (!installResult.ok) {
        return await failWithCompensation(configDir, 'plugin-install-failed', 'Installing the plugin failed.', installResult, compensations);
      }
    } else if (priorNative.version !== version) {
      const priorVersion = priorNative.version;
      compensations.push({
        description: `restore plugin version ${priorVersion} after restoring the previous marketplace`,
        undo: async () => {
          const result = await native.pluginUpdate(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
          if (!result.ok) throw new Error(result.message || result.stderr || 'plugin downgrade returned an unsuccessful outcome');
          const listed = await native.pluginList(runOptions);
          if (!listed.ok) throw new Error(listed.stderr || 'could not verify the restored plugin version');
          const restored = findInstalled(listed.plugins, name, scope);
          if (restored?.version !== priorVersion) {
            throw new Error(`restored plugin reports version ${JSON.stringify(restored?.version)}, expected ${JSON.stringify(priorVersion)}`);
          }
        },
      });
      const updateResult = await native.pluginUpdate(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
      if (!updateResult.ok) {
        return await failWithCompensation(configDir, 'plugin-update-failed', 'Updating the plugin failed.', updateResult, compensations);
      }
    }
    // Else: already installed at the requested version and scope — an
    // idempotent no-op, proven by native structured state rather than by
    // swallowing an install failure (D10: no fake version bump needed).

    const verifyResult = await native.pluginList(runOptions);
    if (!verifyResult.ok) {
      return await failWithCompensation(
        configDir,
        'postcondition-unverifiable',
        'Could not re-read structured plugin state to verify the install actually took effect.',
        verifyResult,
        compensations,
      );
    }
    const postcondition = verifyPostcondition(verifyResult.plugins, { name, version, scope, canonicalProjectDir });
    if (!postcondition.ok) {
      return await failWithCompensation(configDir, 'postcondition-failed', `Postcondition failed: ${postcondition.reason}.`, verifyResult, compensations);
    }

    // D9: state is written before the rollback copy is discarded. A
    // state-write failure is itself compensated (the rollback directory is
    // still there, so native state and the filesystem are unwound together)
    // rather than losing the recovery path first.
    try {
      await writeState(configDir, { name, version, scope, projectDir: canonicalProjectDir });
    } catch (error) {
      return await failWithCompensation(configDir, 'state-write-failed', `Recording installer state failed: ${describe(error)}.`, null, compensations);
    }
    if (rollbackDir !== null) await rm(rollbackDir, { recursive: true, force: true });
    await rm(journalPath(configDir), { force: true }).catch(() => {});

    return ok({ name, version, scope, projectDir, marketDir });
  } finally {
    await lock.release();
  }
}

/**
 * Uninstalls using the recorded scope/project directory (P2.3 correction A;
 * P2.4 correction D). A caller-supplied `--scope`/`--project-dir` that
 * conflicts with the record is refused rather than honored — this script
 * will not operate on one scope while deleting the durable source another
 * scope's installation depends on. The durable directory is removed only
 * once both the native plugin uninstall and marketplace removal have
 * succeeded (or were already a no-op); any other failure leaves it in place
 * as a recovery path.
 */
export async function uninstall(
  { configDir, scope: requestedScope, scopeExplicit, projectDir: requestedProjectDir, projectDirExplicit },
  native = createRealNativeCommands(),
) {
  let lock;
  try {
    lock = await acquireLock(configDir);
  } catch (error) {
    if (error instanceof InstallError) return failed(error.code, error.message);
    throw error;
  }
  try {
    const existing = await readStateStrict(configDir);
    if (existing.kind === 'corrupt') {
      return failed(
        'state-corrupt',
        `Existing installer state is corrupt (${existing.reason}). Resolve it by hand — inspect or remove ` +
          `${installRoot(configDir)} — this script will not guess what to uninstall from unreadable state.`,
      );
    }
    if (existing.kind === 'absent') {
      return ok({ noop: true, message: `Nothing installed by install-local.mjs was found under CLAUDE_CONFIG_DIR=${configDir}.` });
    }
    const state = existing.state;

    if (scopeExplicit && requestedScope !== state.scope) {
      return failed(
        'scope-mismatch',
        `The recorded installation is scoped "${state.scope}"` +
          `${state.projectDir === null ? '' : ` (project dir ${state.projectDir})`}; refusing to uninstall scope ` +
          `"${requestedScope}" instead. Omit --scope to use the recorded scope, or pass --scope ${state.scope} to confirm it.`,
      );
    }
    if (projectDirExplicit) {
      const canonicalRequested = await canonicalize(requestedProjectDir);
      const canonicalRecorded = await canonicalize(state.projectDir);
      if (canonicalRequested !== canonicalRecorded) {
        return failed(
          'scope-mismatch',
          `The recorded installation used project dir "${state.projectDir ?? '(none)'}"; refusing to use ` +
            `"${requestedProjectDir}" instead.`,
        );
      }
    }

    const scope = state.scope;
    const projectDir = state.projectDir;
    const runOptions = { configDir, projectDir };
    const marketDir = marketplaceDir(configDir);

    const uninstallResult = await native.pluginUninstall(`${state.name}@${MARKETPLACE_NAME}`, scope, runOptions);
    const uninstallAccepted = uninstallResult.ok || uninstallResult.failureCode === 'not_installed';
    if (!uninstallAccepted) {
      return failed('plugin-uninstall-failed', 'Uninstalling the plugin failed.', uninstallResult);
    }

    const removeResult = await native.marketplaceRemove(MARKETPLACE_NAME, runOptions);
    const removeAccepted = removeResult.ok || removeResult.notFound === true;
    if (!removeAccepted) {
      return failed('marketplace-remove-failed', 'Removing the local marketplace failed.', removeResult);
    }

    await rm(marketDir, { recursive: true, force: true });
    await rm(installRoot(configDir), { recursive: true, force: true });

    return ok({ name: state.name, version: state.version, scope, projectDir });
  } finally {
    // The lock file lives under installRoot(configDir), which a successful
    // uninstall above already removed entirely; releasing a lock whose file
    // is already gone is a harmless no-op (`rm(..., { force: true })`).
    await lock.release();
  }
}

export async function inspect({ configDir }, native = createRealNativeCommands()) {
  const existing = await readStateStrict(configDir);
  if (existing.kind === 'corrupt') {
    return failed(
      'state-corrupt',
      `Existing installer state at ${statePath(configDir)} is corrupt: ${existing.reason}.`,
    );
  }
  if (existing.kind === 'absent') {
    return ok({ installed: false, message: `No AMBICODE install-local.mjs installation found under CLAUDE_CONFIG_DIR=${configDir}.` });
  }
  const state = existing.state;
  const listResult = await native.pluginList({ configDir, projectDir: state.projectDir });
  if (!listResult.ok) {
    return failed(
      'plugin-list-failed',
      `Installer state exists, but Claude Code's installed-plugin state could not be read for CLAUDE_CONFIG_DIR=${configDir}.`,
      listResult,
    );
  }
  const postcondition = verifyPostcondition(listResult.plugins, {
    name: state.name,
    version: state.version,
    scope: state.scope,
    canonicalProjectDir: await canonicalize(state.projectDir),
  });
  if (!postcondition.ok) {
    return failed('postcondition-failed', `Installer state and Claude Code disagree: ${postcondition.reason}.`, listResult);
  }
  return ok({
    installed: true,
    state,
    manifestPath: marketplaceManifestPath(marketplaceDir(configDir)),
    plugins: listResult.plugins,
  });
}

function printResult(command, result, options) {
  if (!result.ok) {
    console.error(`\n${command} failed: ${result.detail ?? '(no detail)'}`);
    if (result.native?.message) console.error(`  native: ${result.native.message}`);
    if (result.native?.stderr) console.error(`  ${result.native.stderr}`);
    if (result.journal !== null && result.journal !== undefined) {
      console.error(`\nRecovery needed — a compensating step also failed. Journal: ${journalPath(options.configDir)}`);
      for (const line of result.journal.recoveryInstructions ?? []) console.error(`  ${line}`);
    }
    process.exitCode = 1;
    return;
  }

  if (command === 'install') {
    console.log(`\nInstalled ${result.name}@${MARKETPLACE_NAME} (${result.version}) into CLAUDE_CONFIG_DIR=${options.configDir}.`);
    console.log(`Durable marketplace: ${result.marketDir}`);
    console.log('This directory is owned by AMBICODE and is not deleted automatically; removing the');
    console.log(`original candidate directory (${options.candidateDir}) does not affect this installation.`);
    if (options.configDirExplicit) {
      console.log('This is an isolated/custom Claude configuration. Ordinary `claude plugin list` will not see it unless');
      console.log(`CLAUDE_CONFIG_DIR is also set to ${options.configDir}. Use this configuration-safe verification instead:`);
      console.log(`  node install-local.mjs inspect --config-dir "${options.configDir}"`);
    } else {
      console.log('Verify it in the normal Claude configuration with:');
      console.log('  claude plugin list');
      console.log('  claude plugin details ambicode@ambicode-team');
    }
    console.log('Start or reload Claude Code from the target repository, then run /ambicode:init.');
    console.log('Reverse this with:');
    console.log(
      options.configDirExplicit
        ? `  node install-local.mjs uninstall --config-dir "${options.configDir}"`
        : '  node install-local.mjs uninstall',
    );
    return;
  }

  if (command === 'uninstall') {
    if (result.noop) {
      console.log(result.message);
      return;
    }
    console.log(`\nUninstalled ${result.name}@${MARKETPLACE_NAME} (${result.version}) from CLAUDE_CONFIG_DIR=${options.configDir}.`);
    console.log(`Removed the durable install directory (${installRoot(options.configDir)}).`);
    console.log('Project-owned .ambicode/ state is untouched: it belongs to the product repository, not the plugin installation.');
    return;
  }

  // inspect
  if (!result.installed) {
    console.log(result.message);
    return;
  }
  console.log(`Durable marketplace manifest: ${result.manifestPath}`);
  console.log(`Plugin: ${result.state.name}@${MARKETPLACE_NAME} (${result.state.version}), scope ${result.state.scope}`);
  console.log('');
  console.log(JSON.stringify(result.plugins, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === 'install') result = await install(options);
  else if (options.command === 'uninstall') result = await uninstall(options);
  else result = await inspect(options);
  printResult(options.command, result, options);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await main();
