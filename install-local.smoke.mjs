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
import { cp, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
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
    for (const skill of ['init', 'review', 'investigate', 'plan']) {
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
