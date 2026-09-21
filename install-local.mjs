// Installs a packaged AMBICODE candidate into a chosen CLAUDE_CONFIG_DIR,
// through a temporary local marketplace generated for exactly this purpose
// (doc 03 P1.7 correction C; doc 08 "Distribution").
//
// AMBICODE is installed and used locally: there is no hosted, public, or
// private remote marketplace to publish to. Claude Code's own mechanism for
// installing a plugin from a directory is a marketplace whose one entry's
// `source` is a local path, so this script generates exactly that — a
// throwaway marketplace next to the candidate, never a durable published one
// — and drives `claude plugin marketplace add` / `claude plugin install`
// against it. `--uninstall` reverses the same way.
//
// Usage:
//   node install-local.mjs <candidate-dir> <claude-config-dir> [--uninstall] [--scope user|project|local]
//
// Example:
//   npm run package:candidate
//   node install-local.mjs dist/ambicode-0.1.0 /tmp/ambicode-isolated-claude-config
//   node install-local.mjs dist/ambicode-0.1.0 /tmp/ambicode-isolated-claude-config --uninstall
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MARKETPLACE_NAME = 'ambicode-team';

function usageError(message) {
  console.error(`${message}\n`);
  console.error('Usage: node install-local.mjs <candidate-dir> <claude-config-dir> [--uninstall] [--scope user|project|local]');
  process.exit(2);
}

function parseArgs(argv) {
  const positionals = [];
  let uninstall = false;
  let scope = 'user';
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--uninstall') {
      uninstall = true;
    } else if (value === '--scope') {
      scope = argv[i + 1];
      i += 1;
      if (scope === undefined) usageError('--scope needs a value.');
    } else if (value.startsWith('-')) {
      usageError(`Unknown option "${value}".`);
    } else {
      positionals.push(value);
    }
  }
  if (positionals.length !== 2) usageError('Expected exactly two positional arguments.');
  return { candidateDir: path.resolve(positionals[0]), configDir: path.resolve(positionals[1]), uninstall, scope };
}

async function readPluginIdentity(candidateDir) {
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

/** A marketplace whose one entry points at the candidate by local path — generated fresh, never committed or hosted. */
async function generateLocalMarketplace(candidateDir, name, version) {
  const marketplaceDir = await mkdtemp(path.join(tmpdir(), 'ambicode-local-marketplace-'));
  const pluginDirName = `${name}-${version}`;
  await cp(candidateDir, path.join(marketplaceDir, pluginDirName), { recursive: true });
  await mkdir(path.join(marketplaceDir, '.claude-plugin'), { recursive: true });
  const manifest = {
    name: MARKETPLACE_NAME,
    owner: { name: 'local install' },
    description: 'Generated for one local install-local.mjs run; not a hosted or published marketplace.',
    plugins: [{ name, source: `./${pluginDirName}`, version }],
  };
  await writeFile(
    path.join(marketplaceDir, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return marketplaceDir;
}

function run(args, configDir) {
  console.log(`$ CLAUDE_CONFIG_DIR=${configDir} claude ${args.join(' ')}`);
  execFileSync('claude', args, {
    stdio: 'inherit',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
}

async function install({ candidateDir, configDir, scope }) {
  const { name, version } = await readPluginIdentity(candidateDir);
  const marketplaceDir = await generateLocalMarketplace(candidateDir, name, version);
  console.log(`Generated temporary local marketplace at ${marketplaceDir}`);
  await mkdir(configDir, { recursive: true });
  run(['plugin', 'marketplace', 'add', marketplaceDir], configDir);
  run(['plugin', 'install', `${name}@${MARKETPLACE_NAME}`, '-s', scope, '-y'], configDir);
  console.log(`\nInstalled ${name}@${MARKETPLACE_NAME} (${version}) into CLAUDE_CONFIG_DIR=${configDir}.`);
  console.log(`The generated marketplace directory (${marketplaceDir}) is a one-time local-install`);
  console.log('transport; Claude Code has already copied what it needs into its own plugin cache,');
  console.log('so it may be deleted. Reverse this with:');
  console.log(`  node install-local.mjs ${candidateDir} ${configDir} --uninstall --scope ${scope}`);
}

async function uninstall({ candidateDir, configDir, scope }) {
  const { name } = await readPluginIdentity(candidateDir);
  run(['plugin', 'uninstall', `${name}@${MARKETPLACE_NAME}`, '-s', scope, '-y'], configDir);
  try {
    run(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME], configDir);
  } catch (error) {
    // Already gone, or never added under this exact name in this config
    // directory — not fatal to an uninstall whose primary job is the plugin.
    console.warn(`Note: could not remove marketplace "${MARKETPLACE_NAME}" (${error instanceof Error ? error.message : error}).`);
  }
  console.log(`\nUninstalled ${name}@${MARKETPLACE_NAME} from CLAUDE_CONFIG_DIR=${configDir}.`);
  console.log('Project-owned .ambicode/ state is untouched: it belongs to the product repository, not the plugin installation.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.uninstall) {
    await uninstall(options);
  } else {
    await install(options);
  }
}

await main();
