import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const candidateDir = path.resolve(process.argv[2] ?? path.join('dist', `ambicode-${packageVersion}`));
const bundle = path.resolve(candidateDir, 'scripts/ambicode.mjs');

const RUN = 'model: sonnet, effort: medium, timeoutMinutes: 15';
const CONFIG = [
  'schemaVersion: 4',
  'id: app',
  'context: { maxTotalTokens: 24000, maxFileTokens: 2500 }',
  'skills:',
  `  init: { ${RUN}, scout: { ${RUN} }, ruleSources: [presets, scout, manual, web] }`,
  `  review: { ${RUN}, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null, excludePaths: [] }`,
  `  task: { ${RUN}, checkTimeoutSeconds: 120 }`,
  `  plan: { ${RUN} }`,
  `  investigate: { ${RUN} }`,
  `  rules: { ${RUN} }`,
  'requirements: { runtimes: {}, mcps: [], lsps: [], env: [] }',
  'projects:',
  '  - id: app',
  '    root: .',
  '    paths: [src/]',
  '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
  '    packs: [PACKS]',
  '    policyFiles: [POLICY]',
  '    commands: {}',
  '    checks: { lint: { all: null, file: null }, unit: { all: null, file: null }, e2e: { all: null, file: null } }',
  '',
].join('\n');

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

    await mkdir(path.join(cwd, '.ambicode'), { recursive: true });
    await writeFile(path.join(cwd, '.ambicode', 'config.yaml'), CONFIG.replace('PACKS', 'builtin/common-quality, builtin/common-checks').replace('POLICY', ''));
    const validateOutput = run(['config', 'validate'], { cwd });
    if (!/^ok/m.test(validateOutput)) throw new Error(`config validate did not accept the v4 config:\n${validateOutput}`);

    console.log('OK: `ambicode config validate` accepts the installed candidate\'s v4 config with built-in packs.');

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
    // The glob counter left with the second audit; a valid pack prints its id and "No errors".
    if (!/smoke\.yaml: smoke/.test(checkOutput) || !/No errors/.test(checkOutput)) {
      throw new Error(`policy check did not accept the candidate pack:\n${checkOutput}`);
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

    const mapOutput = run(['map', '--term', 'app'], { cwd });
    // The reasons sit inside compact JSON, so the quotes around the term are escaped.
    if (!/app\.ts/.test(mapOutput) || !/filename matched \\"app\\"/.test(mapOutput)) {
      throw new Error(`map did not return a reason-carrying candidate:\n${mapOutput}`);
    }
    const emptyOutput = run(['map', '--term', 'kaleidoscope'], { cwd });
    if (/app\.ts/.test(emptyOutput)) {
      throw new Error(`map widened an empty shortlist:\n${emptyOutput}`);
    }
    console.log('OK: `ambicode map` ranks with reasons and stays empty when nothing matches.');
  });
}



async function main() {
  await checkVersionOutsideAnyRepo();
  await checkPoliciesAndPromptsResolve();
  console.log('\nAll smoke checks passed against the packaged candidate.');
}

await main();
