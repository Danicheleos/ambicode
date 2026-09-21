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
//   node install-local.mjs install <candidate-dir> <claude-config-dir> \
//     [--scope user|project|local] [--project-dir <dir>]
//   node install-local.mjs uninstall <claude-config-dir> \
//     [--scope user|project|local] [--project-dir <dir>]
//   node install-local.mjs inspect <claude-config-dir>
//
// Example:
//   npm run package:candidate
//   node install-local.mjs install dist/ambicode-0.1.0 /tmp/ambicode-isolated-claude-config
//   node install-local.mjs inspect /tmp/ambicode-isolated-claude-config
//   node install-local.mjs uninstall /tmp/ambicode-isolated-claude-config
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKETPLACE_NAME = 'ambicode-team';
const SCOPES = ['user', 'project', 'local'];

function usageError(message) {
  console.error(`${message}\n`);
  console.error(
    [
      'Usage:',
      '  node install-local.mjs install <candidate-dir> <claude-config-dir> [--scope user|project|local] [--project-dir <dir>]',
      '  node install-local.mjs uninstall <claude-config-dir> [--scope user|project|local] [--project-dir <dir>]',
      '  node install-local.mjs inspect <claude-config-dir>',
    ].join('\n'),
  );
  process.exit(2);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'install' && command !== 'uninstall' && command !== 'inspect') {
    usageError(`Unknown command "${command ?? ''}". Expected "install", "uninstall", or "inspect".`);
  }

  const positionals = [];
  let scope = null;
  let scopeExplicit = false;
  let projectDir = null;
  let projectDirExplicit = false;
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
    } else if (value?.startsWith('-')) {
      usageError(`Unknown option "${value}".`);
    } else {
      positionals.push(value);
    }
  }

  if (scopeExplicit && !SCOPES.includes(scope)) usageError(`--scope must be one of: ${SCOPES.join(', ')}.`);

  const expectedPositionals = command === 'install' ? 2 : 1;
  if (positionals.length !== expectedPositionals) {
    usageError(
      command === 'install'
        ? 'Expected exactly two positional arguments: <candidate-dir> <claude-config-dir>.'
        : 'Expected exactly one positional argument: <claude-config-dir>.',
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
    const [candidateDir, configDir] = positionals;
    return {
      command,
      candidateDir: path.resolve(candidateDir),
      configDir: path.resolve(configDir),
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
    const [configDir] = positionals;
    return {
      command,
      configDir: path.resolve(configDir),
      scope,
      scopeExplicit,
      projectDir: projectDirExplicit ? path.resolve(projectDir) : null,
      projectDirExplicit,
    };
  }

  const [configDir] = positionals;
  return { command, configDir: path.resolve(configDir) };
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

function randomSuffix() {
  return randomBytes(6).toString('hex');
}

async function pathExists(candidate) {
  return stat(candidate).then(
    () => true,
    () => false,
  );
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

/**
 * The owned metadata this script persists on every successful install (P2.3
 * correction A): enough to identify the installed plugin version, scope, and
 * explicit project directory, so a later `uninstall` never has to guess or
 * accept an arbitrary caller-supplied scope for state it did not itself
 * record.
 */
async function readState(configDir) {
  let raw;
  try {
    raw = await readFile(statePath(configDir), 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string' || typeof parsed.scope !== 'string') {
    return null;
  }
  return {
    name: parsed.name,
    version: parsed.version,
    scope: parsed.scope,
    projectDir: typeof parsed.projectDir === 'string' ? parsed.projectDir : null,
  };
}

async function writeState(configDir, state) {
  await mkdir(installRoot(configDir), { recursive: true });
  await writeFile(statePath(configDir), `${JSON.stringify(state, null, 2)}\n`);
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
  try {
    const stdout = execFileSync('claude', args, {
      cwd: projectDir ?? undefined,
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === 'string' ? error.stdout : (error.stdout?.toString() ?? ''),
      stderr: typeof error.stderr === 'string' ? error.stderr : (error.stderr?.toString() ?? describe(error)),
    };
  }
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
        return { ok: true, plugins: Array.isArray(plugins) ? plugins : [], stderr: r.stderr };
      } catch (cause) {
        return { ok: false, plugins: [], stderr: `Could not parse \`claude plugin list --json\` output: ${describe(cause)}` };
      }
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

function failed(code, detail, native) {
  return { ok: false, code, detail, native: native ?? null };
}

/**
 * Installs, or upgrades an existing installation in place. P2.3 correction
 * A's ordering: stage and validate the replacement, publish it over the live
 * marketplace path (preserving the previous content under a rollback name,
 * never deleting it up front), drive the native operations against the
 * now-published content, and only on full success discard the rollback copy
 * and record owned state — any native failure restores the rollback copy and
 * returns a failure result without ever calling this "installed".
 */
export async function install({ candidateDir, configDir, scope, projectDir }, native = createRealNativeCommands()) {
  const { name, version } = await readCandidateIdentity(candidateDir);
  await mkdir(installRoot(configDir), { recursive: true });

  const marketDir = marketplaceDir(configDir);
  const marketExisted = await pathExists(marketDir);
  const stagingDir = path.join(installRoot(configDir), `.marketplace.staging-${randomSuffix()}`);

  await buildMarketplaceContent(stagingDir, candidateDir, name, version);
  try {
    await validateMarketplaceContent(stagingDir, name, version);
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

  const restore = async () => {
    await rm(marketDir, { recursive: true, force: true });
    if (rollbackDir !== null) await rename(rollbackDir, marketDir);
  };

  const runOptions = { configDir, projectDir };

  const addResult = await native.marketplaceAdd(marketDir, runOptions);
  if (!addResult.ok) {
    await restore();
    return failed('marketplace-add-failed', 'Adding the local marketplace failed.', addResult);
  }

  const updateMarketResult = await native.marketplaceUpdate(MARKETPLACE_NAME, runOptions);
  if (!updateMarketResult.ok) {
    await restore();
    return failed('marketplace-update-failed', 'Refreshing the local marketplace failed.', updateMarketResult);
  }

  const listResult = await native.pluginList(runOptions);
  const existing = listResult.ok ? findInstalled(listResult.plugins, name, scope) : null;

  if (existing === null) {
    const installResult = await native.pluginInstall(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
    if (!installResult.ok) {
      await restore();
      return failed('plugin-install-failed', 'Installing the plugin failed.', installResult);
    }
  } else if (existing.version !== version) {
    const updateResult = await native.pluginUpdate(`${name}@${MARKETPLACE_NAME}`, scope, runOptions);
    if (!updateResult.ok) {
      await restore();
      return failed('plugin-update-failed', 'Updating the plugin failed.', updateResult);
    }
  }
  // Already installed at the requested version and scope: nothing further to
  // mutate — an idempotent no-op success, proven by native structured state
  // (`plugin list --json`) rather than by swallowing an install failure.

  if (rollbackDir !== null) await rm(rollbackDir, { recursive: true, force: true });
  await writeState(configDir, { name, version, scope, projectDir });

  return ok({ name, version, scope, projectDir, marketDir });
}

/**
 * Uninstalls using the recorded scope/project directory (P2.3 correction A).
 * A caller-supplied `--scope`/`--project-dir` that conflicts with the record
 * is refused rather than honored — this script will not operate on one scope
 * while deleting the durable source another scope's installation depends on.
 * The durable directory is removed only once both the native plugin
 * uninstall and marketplace removal have succeeded (or were already a
 * no-op); any other failure leaves it in place as a recovery path.
 */
export async function uninstall(
  { configDir, scope: requestedScope, scopeExplicit, projectDir: requestedProjectDir, projectDirExplicit },
  native = createRealNativeCommands(),
) {
  const state = await readState(configDir);
  if (state === null) {
    return ok({ noop: true, message: `Nothing installed by install-local.mjs was found under CLAUDE_CONFIG_DIR=${configDir}.` });
  }

  if (scopeExplicit && requestedScope !== state.scope) {
    return failed(
      'scope-mismatch',
      `The recorded installation is scoped "${state.scope}"` +
        `${state.projectDir === null ? '' : ` (project dir ${state.projectDir})`}; refusing to uninstall scope ` +
        `"${requestedScope}" instead. Omit --scope to use the recorded scope, or pass --scope ${state.scope} to confirm it.`,
    );
  }
  if (projectDirExplicit && requestedProjectDir !== state.projectDir) {
    return failed(
      'scope-mismatch',
      `The recorded installation used project dir "${state.projectDir ?? '(none)'}"; refusing to use ` +
        `"${requestedProjectDir}" instead.`,
    );
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
}

export async function inspect({ configDir }, native = createRealNativeCommands()) {
  const state = await readState(configDir);
  if (state === null) {
    return ok({ installed: false, message: `No AMBICODE install-local.mjs installation found under CLAUDE_CONFIG_DIR=${configDir}.` });
  }
  const listResult = await native.pluginList({ configDir, projectDir: state.projectDir });
  return ok({
    installed: true,
    state,
    manifestPath: marketplaceManifestPath(marketplaceDir(configDir)),
    plugins: listResult.ok ? listResult.plugins : [],
  });
}

function printResult(command, result, options) {
  if (!result.ok) {
    console.error(`\n${command} failed: ${result.detail ?? '(no detail)'}`);
    if (result.native?.message) console.error(`  native: ${result.native.message}`);
    if (result.native?.stderr) console.error(`  ${result.native.stderr}`);
    process.exitCode = 1;
    return;
  }

  if (command === 'install') {
    console.log(`\nInstalled ${result.name}@${MARKETPLACE_NAME} (${result.version}) into CLAUDE_CONFIG_DIR=${options.configDir}.`);
    console.log(`Durable marketplace: ${result.marketDir}`);
    console.log('This directory is owned by AMBICODE and is not deleted automatically; removing the');
    console.log(`original candidate directory (${options.candidateDir}) does not affect this installation.`);
    console.log('Reverse this with:');
    console.log(`  node install-local.mjs uninstall ${options.configDir}`);
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
