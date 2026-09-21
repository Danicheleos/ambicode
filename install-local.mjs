// Installs a packaged AMBICODE candidate into a chosen CLAUDE_CONFIG_DIR
// (doc 08 "Distribution"; doc 04 P2.2 correction A).
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
// copy of the candidate plus the marketplace manifest that points at it.
// That directory is never deleted except by this script's own `uninstall`,
// and uninstall reads the plugin's identity back out of it — it does not
// need the original candidate directory (typically a source checkout's
// `dist/`) to still exist.
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
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MARKETPLACE_NAME = 'ambicode-team';
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

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'install' && command !== 'uninstall' && command !== 'inspect') {
    usageError(`Unknown command "${command ?? ''}". Expected "install", "uninstall", or "inspect".`);
  }

  const positionals = [];
  let scope = 'user';
  let projectDir = null;
  for (let i = 0; i < rest.length; i += 1) {
    const value = rest[i];
    if (value === '--scope') {
      scope = rest[i + 1] ?? usageError('--scope needs a value.');
      i += 1;
    } else if (value === '--project-dir') {
      projectDir = rest[i + 1] ?? usageError('--project-dir needs a value.');
      i += 1;
    } else if (value?.startsWith('-')) {
      usageError(`Unknown option "${value}".`);
    } else {
      positionals.push(value);
    }
  }

  if (!SCOPES.includes(scope)) usageError(`--scope must be one of: ${SCOPES.join(', ')}.`);
  if ((scope === 'project' || scope === 'local') && projectDir === null) {
    usageError(
      `--scope ${scope} writes settings into a target project's .claude/settings.json; pass --project-dir <dir> ` +
        'to say explicitly which project, rather than an incidental current working directory.',
    );
  }

  const expectedPositionals = command === 'install' ? 2 : 1;
  if (positionals.length !== expectedPositionals) {
    usageError(
      command === 'install'
        ? 'Expected exactly two positional arguments: <candidate-dir> <claude-config-dir>.'
        : 'Expected exactly one positional argument: <claude-config-dir>.',
    );
  }

  if (command === 'install') {
    const [candidateDir, configDir] = positionals;
    return {
      command,
      candidateDir: path.resolve(candidateDir),
      configDir: path.resolve(configDir),
      scope,
      projectDir: projectDir === null ? null : path.resolve(projectDir),
    };
  }
  const [configDir] = positionals;
  return {
    command,
    configDir: path.resolve(configDir),
    scope,
    projectDir: projectDir === null ? null : path.resolve(projectDir),
  };
}

/** `<config-dir>/ambicode-install/`: the one directory this script owns. */
function installRoot(configDir) {
  return path.join(configDir, 'ambicode-install');
}

function marketplaceDir(configDir) {
  return path.join(installRoot(configDir), 'marketplace');
}

function marketplaceManifestPath(configDir) {
  return path.join(marketplaceDir(configDir), '.claude-plugin', 'marketplace.json');
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

/** Reads the plugin identity back out of the durable marketplace, without needing the original candidate directory. */
async function readInstalledIdentity(configDir) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(marketplaceManifestPath(configDir), 'utf8'));
  } catch {
    return null;
  }
  const entry = Array.isArray(manifest.plugins) ? manifest.plugins[0] : undefined;
  if (entry === undefined || typeof entry.name !== 'string' || typeof entry.version !== 'string') return null;
  return { name: entry.name, version: entry.version, source: entry.source };
}

function run(args, { configDir, projectDir }) {
  console.log(`$ CLAUDE_CONFIG_DIR=${configDir} claude ${args.join(' ')}`);
  execFileSync('claude', args, {
    stdio: 'inherit',
    cwd: projectDir ?? undefined,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
}

/** Best-effort: some subcommands (e.g. a `remove` for a marketplace never added) are allowed to fail. */
function runAllowingFailure(args, options) {
  try {
    run(args, options);
    return true;
  } catch (error) {
    console.warn(`Note: "claude ${args.join(' ')}" failed (${error instanceof Error ? error.message : error}).`);
    return false;
  }
}

/**
 * Writes the durable copy of the candidate and its marketplace manifest,
 * replacing whatever this script previously installed at this config dir —
 * this is what makes `install` idempotent and upgrade-safe. The marketplace
 * directory is never `/tmp`; it lives under the chosen CLAUDE_CONFIG_DIR and
 * is meant to survive terminal restarts, plugin reloads, removal of the
 * source checkout's `dist/`, and ordinary temp-directory cleanup.
 */
async function writeDurableMarketplace(candidateDir, configDir, name, version) {
  const marketDir = marketplaceDir(configDir);
  const pluginDirName = `${name}-${version}`;
  const pluginCopyDir = path.join(marketDir, pluginDirName);

  // Idempotent/deterministic: always replace this exact version's copy, and
  // remove any *other* previously installed version's copy so repeated
  // installs/upgrades do not accumulate AMBICODE-owned orphans.
  const previous = await readInstalledIdentity(configDir);
  if (previous !== null && previous.name === name && previous.version !== version) {
    await rm(path.join(marketDir, `${previous.name}-${previous.version}`), { recursive: true, force: true });
  }
  await rm(pluginCopyDir, { recursive: true, force: true });
  await mkdir(marketDir, { recursive: true });
  await cp(candidateDir, pluginCopyDir, { recursive: true });

  await mkdir(path.join(marketDir, '.claude-plugin'), { recursive: true });
  const manifest = {
    name: MARKETPLACE_NAME,
    owner: { name: 'local install' },
    description: 'AMBICODE local-install marketplace: durable under CLAUDE_CONFIG_DIR, never hosted or published.',
    plugins: [{ name, source: `./${pluginDirName}`, version }],
  };
  await writeFile(
    marketplaceManifestPath(configDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return marketDir;
}

async function install({ candidateDir, configDir, scope, projectDir }) {
  const { name, version } = await readCandidateIdentity(candidateDir);
  const marketDir = await writeDurableMarketplace(candidateDir, configDir, name, version);
  await mkdir(configDir, { recursive: true });

  const runOptions = { configDir, projectDir };
  // First install at this config dir: `add`. A later install/upgrade against
  // the same durable directory: `update` refreshes Claude Code's own record
  // of a marketplace it already knows, which is the native idempotent path.
  const added = runAllowingFailure(['plugin', 'marketplace', 'add', marketDir], runOptions);
  if (!added) run(['plugin', 'marketplace', 'update', MARKETPLACE_NAME], runOptions);

  const installed = runAllowingFailure(
    ['plugin', 'install', `${name}@${MARKETPLACE_NAME}`, '-s', scope, '-y'],
    runOptions,
  );
  if (!installed) run(['plugin', 'update', `${name}@${MARKETPLACE_NAME}`, '-s', scope, '-y'], runOptions);

  console.log(`\nInstalled ${name}@${MARKETPLACE_NAME} (${version}) into CLAUDE_CONFIG_DIR=${configDir}.`);
  console.log(`Durable marketplace: ${marketDir}`);
  console.log('This directory is owned by AMBICODE and is not deleted automatically; removing the');
  console.log(`original candidate directory (${candidateDir}) does not affect this installation.`);
  console.log('Reverse this with:');
  console.log(`  node install-local.mjs uninstall ${configDir} --scope ${scope}${projectDir === null ? '' : ` --project-dir ${projectDir}`}`);
}

async function uninstall({ configDir, scope, projectDir }) {
  const identity = await readInstalledIdentity(configDir);
  if (identity === null) {
    console.log(`Nothing installed by install-local.mjs was found under CLAUDE_CONFIG_DIR=${configDir}. Nothing to do.`);
    return;
  }

  const runOptions = { configDir, projectDir };
  runAllowingFailure(['plugin', 'uninstall', `${identity.name}@${MARKETPLACE_NAME}`, '-s', scope, '-y'], runOptions);
  runAllowingFailure(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME], runOptions);

  // Only the durable directory this script itself owns is removed. Nothing
  // under a product repository's own `.ambicode/` (config, policy, reviews,
  // notes) is touched — that state belongs to the product repository, not to
  // this plugin installation, and lives nowhere under CLAUDE_CONFIG_DIR.
  await rm(installRoot(configDir), { recursive: true, force: true });

  console.log(`\nUninstalled ${identity.name}@${MARKETPLACE_NAME} (${identity.version}) from CLAUDE_CONFIG_DIR=${configDir}.`);
  console.log(`Removed the durable install directory (${installRoot(configDir)}).`);
  console.log('Project-owned .ambicode/ state is untouched: it belongs to the product repository, not the plugin installation.');
}

async function inspect({ configDir }) {
  const identity = await readInstalledIdentity(configDir);
  if (identity === null) {
    console.log(`No AMBICODE install-local.mjs installation found under CLAUDE_CONFIG_DIR=${configDir}.`);
    return;
  }
  console.log(`Durable marketplace manifest: ${marketplaceManifestPath(configDir)}`);
  console.log(`Plugin: ${identity.name}@${MARKETPLACE_NAME} (${identity.version}), source ${identity.source}`);
  console.log('');
  // A fresh `claude` process reading this CLAUDE_CONFIG_DIR back is the
  // closest non-interactive proof available that a later invocation or
  // reload still sees the plugin: it is not the same process that installed
  // it, and it reads only what was persisted to disk.
  run(['plugin', 'list'], { configDir, projectDir: null });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'install') await install(options);
  else if (options.command === 'uninstall') await uninstall(options);
  else await inspect(options);
}

await main();
