import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const candidateDir = path.resolve(process.argv[2] ?? path.join('dist', `ambicode-${packageVersion}`));
const bundle = path.resolve(candidateDir, 'scripts/ambicode.mjs');

function run(args, options = {}) {
  return execFileSync(process.execPath, [bundle, ...args], { encoding: 'utf8', ...options });
}

async function withTempDir(prefix, task) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await task(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function checkVersionOutsideAnyRepo() {
  await withTempDir('ambicode-smoke-plain-', async (cwd) => {
    const output = run(['version'], { cwd });
    if (!output.includes('ambicode plugin root:')) throw new Error(`unexpected version output: ${output}`);
    if (output.includes(candidateDir.split('/').slice(0, -1).join('/')) === false) {
      // Not an error by itself; the assertion below is the one that decides.
    }
    if (!output.includes(path.resolve(candidateDir))) {
      throw new Error(`plugin root did not resolve to the candidate directory:\n${output}`);
    }
    console.log('OK: `ambicode version` runs outside any repository and resolves its own plugin root.');
  });
}

async function checkPoliciesAndPromptsResolve() {
  await withTempDir('ambicode-smoke-repo-', async (cwd) => {
    execFileSync('git', ['init', '--quiet'], { cwd });
    execFileSync('git', ['config', 'user.email', 'smoke@example.com'], { cwd });
    execFileSync('git', ['config', 'user.name', 'Smoke Test'], { cwd });
    await writeFile(path.join(cwd, 'app.ts'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd });
    execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd });

    const initOutput = run(['init'], { cwd });
    // On Windows `init` reports `.ambicode\config.yaml`, so either separator is accepted.
    if (!/\.ambicode[\\/]config\.yaml/.test(initOutput)) throw new Error(`init did not report writing config:\n${initOutput}`);

    const policyOutput = run(['policy'], { cwd });
    if (!policyOutput.includes('common-quality')) {
      throw new Error(`resolved policy did not include the built-in common-quality pack:\n${policyOutput}`);
    }
    console.log('OK: `ambicode init` + `ambicode policy` resolve the installed candidate\'s built-in policies.');

    // Through the bundle: a subcommand dispatched only in `src/cli/main.ts` would pass unit
    // tests and be unreachable in the shipped bundle.
    await mkdir(path.join(cwd, '.ambicode', 'policies'), { recursive: true });
    const candidatePack = path.join('.ambicode', 'policies', 'smoke.yaml');
    await writeFile(
      path.join(cwd, candidatePack),
      [
        'schemaVersion: 1',
        'id: smoke',
        'authority: team',
        'appliesTo: ["**/*.ts"]',
        'activities: [review]',
        'source: { location: "smoke-candidate.mjs" }',
        'rules: []',
        '',
      ].join('\n'),
    );
    const checkOutput = run(['policy', 'check', candidatePack], { cwd });
    if (!/appliesTo/.test(checkOutput) || !/1 file/.test(checkOutput)) {
      throw new Error(`policy check did not report what the candidate pack's glob matches:\n${checkOutput}`);
    }

    await writeFile(path.join(cwd, candidatePack), 'schemaVersion: 2\n');
    let failed = false;
    try {
      run(['policy', 'check', candidatePack], { cwd, stdio: 'pipe' });
    } catch (error) {
      failed = true;
      if (error.status !== 1) throw new Error(`policy check exited ${error.status}, expected 1`);
    }
    if (!failed) throw new Error('policy check accepted an invalid pack');
    console.log('OK: `ambicode policy check` validates a candidate pack and exits nonzero on an error.');

    const locateOutput = run(['locate', 'app'], { cwd });
    if (!/app\.ts/.test(locateOutput) || !/filename matched "app"/.test(locateOutput)) {
      throw new Error(`locate did not return a reason-carrying candidate:\n${locateOutput}`);
    }
    const emptyOutput = run(['locate', 'kaleidoscope'], { cwd });
    if (!/\(none/.test(emptyOutput) || /app\.ts/.test(emptyOutput)) {
      throw new Error(`locate widened an empty shortlist:\n${emptyOutput}`);
    }
    console.log('OK: `ambicode locate` ranks with reasons and stays empty when nothing matches.');
  });
}



async function main() {
  await checkVersionOutsideAnyRepo();
  await checkPoliciesAndPromptsResolve();
  console.log('\nAll smoke checks passed against the packaged candidate.');
}

await main();
