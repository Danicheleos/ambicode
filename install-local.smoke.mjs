// A real isolated-config smoke test for durable local installation (doc 04
// P2.2 correction A). Not part of `npm run test:unit` (doc 07: unit tests do
// not chain a real CLI), and not a fake: it shells out to the real `claude`
// binary against an isolated CLAUDE_CONFIG_DIR that is created and destroyed
// here, exactly like `docs/installation.md` already documents by hand.
//
// What this proves, end to end:
//   1. install-local.mjs installs a packaged candidate into a fresh
//      CLAUDE_CONFIG_DIR.
//   2. The candidate directory used for that install (standing in for the
//      source checkout's `dist/`) is then deleted entirely.
//   3. A brand new `claude` process — not the one that ran the install —
//      still reports the plugin as installed and lists its skills. That new
//      process is the "fresh invocation / reload" proof this environment can
//      give non-interactively; it reads only what install-local.mjs
//      persisted under CLAUDE_CONFIG_DIR, nothing from the deleted directory.
//   4. install-local.mjs uninstalls cleanly without the deleted candidate
//      directory, and the durable install directory it owned is gone
//      afterward.
//
// Usage: node install-local.smoke.mjs
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function step(message) {
  console.log(`\n=== ${message} ===`);
}

function claude(args, configDir) {
  return execFileSync('claude', args, {
    cwd: ROOT,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: 'utf8',
  });
}

async function exists(candidate) {
  return stat(candidate).then(
    () => true,
    () => false,
  );
}

async function main() {
  step('Package the candidate (npm run package:candidate)');
  execFileSync('node', ['package-candidate.mjs'], { cwd: ROOT, stdio: 'inherit' });

  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const realCandidateDir = path.join(ROOT, 'dist', `ambicode-${version}`);
  if (!(await exists(realCandidateDir))) {
    throw new Error(`Expected packaged candidate at ${realCandidateDir}; run npm run package:candidate first.`);
  }

  // A private copy standing in for "the source checkout's dist directory":
  // this smoke test deletes *this* copy, never the developer's own dist/.
  const ephemeralCandidateDir = await mkdtemp(path.join(tmpdir(), 'ambicode-smoke-candidate-'));
  const candidateDir = path.join(ephemeralCandidateDir, `ambicode-${version}`);
  await cp(realCandidateDir, candidateDir, { recursive: true });

  const configDir = await mkdtemp(path.join(tmpdir(), 'ambicode-smoke-config-'));

  try {
    step(`Install into an isolated CLAUDE_CONFIG_DIR=${configDir}`);
    execFileSync('node', ['install-local.mjs', 'install', candidateDir, configDir], { cwd: ROOT, stdio: 'inherit' });

    step('Inspect immediately after install');
    execFileSync('node', ['install-local.mjs', 'inspect', configDir], { cwd: ROOT, stdio: 'inherit' });

    step('Same-version reinstall is idempotent (D2.4 correction D10)');
    execFileSync('node', ['install-local.mjs', 'install', candidateDir, configDir], { cwd: ROOT, stdio: 'inherit' });
    {
      const listed = claude(['plugin', 'list', '--json'], configDir);
      const entries = JSON.parse(listed).filter((entry) => entry.id === 'ambicode@ambicode-team');
      if (entries.length !== 1) throw new Error(`Expected exactly one ambicode@ambicode-team entry after a same-version reinstall, found ${entries.length}.`);
    }

    step('Version upgrade in place (P2.4 correction D)');
    const upgradedCandidateDir = await mkdtemp(path.join(tmpdir(), 'ambicode-smoke-upgrade-'));
    const upgradedPluginDir = path.join(upgradedCandidateDir, `ambicode-${version}-upgrade`);
    await cp(candidateDir, upgradedPluginDir, { recursive: true });
    const upgradedVersion = '0.1.1-smoke';
    {
      const manifestPath = path.join(upgradedPluginDir, '.claude-plugin', 'plugin.json');
      const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8'));
      manifest.version = upgradedVersion;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    execFileSync('node', ['install-local.mjs', 'install', upgradedPluginDir, configDir], { cwd: ROOT, stdio: 'inherit' });
    {
      const listed = JSON.parse(claude(['plugin', 'list', '--json'], configDir));
      const entry = listed.find((candidate) => candidate.id === 'ambicode@ambicode-team');
      if (entry?.version !== upgradedVersion) {
        throw new Error(`Expected the upgraded version "${upgradedVersion}" after install-local.mjs install, got ${JSON.stringify(entry)}.`);
      }
    }
    await rm(upgradedCandidateDir, { recursive: true, force: true });

    step('Attempted user→project scope change is refused, leaving only the original user installation (P2.4 correction D2)');
    {
      const scopeChangeProjectDir = await mkdtemp(path.join(tmpdir(), 'ambicode-smoke-project-'));
      try {
        let refused = false;
        try {
          execFileSync(
            'node',
            ['install-local.mjs', 'install', candidateDir, configDir, '--scope', 'project', '--project-dir', scopeChangeProjectDir],
            { cwd: ROOT, stdio: 'pipe' },
          );
        } catch {
          refused = true;
        }
        if (!refused) throw new Error('Expected a user→project scope change to be refused, but install-local.mjs exited 0.');
        const listed = JSON.parse(claude(['plugin', 'list', '--json'], configDir));
        const scopes = listed.filter((entry) => entry.id === 'ambicode@ambicode-team').map((entry) => entry.scope);
        if (scopes.length !== 1 || scopes[0] !== 'user') {
          throw new Error(`Expected only the original "user" scope installation to remain, found scopes: ${JSON.stringify(scopes)}.`);
        }
      } finally {
        await rm(scopeChangeProjectDir, { recursive: true, force: true });
      }
    }

    step('Corrupt installer state is refused as an actionable failure (P2.4 correction D4)');
    {
      const corruptConfigDir = await mkdtemp(path.join(tmpdir(), 'ambicode-smoke-corrupt-'));
      try {
        await mkdir(path.join(corruptConfigDir, 'ambicode-install'), { recursive: true });
        await writeFile(path.join(corruptConfigDir, 'ambicode-install', 'state.json'), '{ not valid json');
        let refused = false;
        try {
          execFileSync('node', ['install-local.mjs', 'install', candidateDir, corruptConfigDir], { cwd: ROOT, stdio: 'pipe' });
        } catch {
          refused = true;
        }
        if (!refused) throw new Error('Expected install to refuse corrupt installer state, but it exited 0.');
      } finally {
        await rm(corruptConfigDir, { recursive: true, force: true });
      }
    }

    step(`Delete the candidate directory used for install (${ephemeralCandidateDir})`);
    await rm(ephemeralCandidateDir, { recursive: true, force: true });
    if (await exists(candidateDir)) throw new Error('Candidate directory still exists after deletion.');

    step('Fresh `claude` process, with the candidate directory gone: plugin still listed');
    const list = claude(['plugin', 'list'], configDir);
    console.log(list);
    if (!/ambicode@ambicode-team/.test(list)) {
      throw new Error('Expected "ambicode@ambicode-team" in `claude plugin list` after the candidate directory was deleted.');
    }

    step('Fresh `claude` process: plugin details still report its skills');
    const details = claude(['plugin', 'details', 'ambicode@ambicode-team'], configDir);
    console.log(details);
    for (const skill of ['init', 'review', 'investigate', 'plan', 'task']) {
      if (!details.includes(skill)) {
        throw new Error(`Expected skill "${skill}" in \`claude plugin details\` output.`);
      }
    }

    step('No workstation-specific absolute path leaked into the installed cache');
    const installedFiles = await walk(configDir);
    const forbidden = [ROOT, process.env.HOME ?? ''].filter((value) => value.length > 3);
    for (const file of installedFiles) {
      if (!/\.(mjs|js|json|md)$/.test(file)) continue;
      const text = await (await import('node:fs/promises')).readFile(file, 'utf8').catch(() => '');
      for (const needle of forbidden) {
        if (needle !== '' && text.includes(needle)) {
          throw new Error(`${file} contains a workstation-specific path "${needle}".`);
        }
      }
    }

    step('Uninstall without the original candidate directory existing');
    execFileSync('node', ['install-local.mjs', 'uninstall', configDir], { cwd: ROOT, stdio: 'inherit' });

    step('Fresh `claude` process: plugin no longer listed');
    const afterUninstall = claude(['plugin', 'list'], configDir);
    console.log(afterUninstall || '(no plugins installed)');
    if (/ambicode@ambicode-team/.test(afterUninstall)) {
      throw new Error('Expected "ambicode@ambicode-team" to be gone from `claude plugin list` after uninstall.');
    }

    step('The durable install directory owned by AMBICODE is gone');
    if (await exists(path.join(configDir, 'ambicode-install'))) {
      throw new Error('Expected the durable install directory to be removed by uninstall.');
    }

    console.log('\nSMOKE TEST PASSED: durable install, inspect, deleted-candidate reload, uninstall.');
  } finally {
    await rm(configDir, { recursive: true, force: true });
    await rm(ephemeralCandidateDir, { recursive: true, force: true });
  }
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...(await walk(absolute)));
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}

await main();
