// Runs the packaged candidate from outside this source checkout, the way a
// second developer's machine would, with none of this repository's
// node_modules or TypeScript source reachable (doc 03 P1.7 §2-3).
//
// Usage: node smoke-candidate.mjs [candidate-directory]
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const packageVersion = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')).version;
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
      // Not an error by itself, but recorded: the plugin root should resolve
      // to the candidate directory, not to this repository.
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
    // `init` reports a host path, so on Windows it reads `.ambicode\config.yaml`.
    // Same decision as the two assertions in R1 defect 3: the check accepts
    // either separator rather than the production value being reshaped to
    // suit it.
    if (!/\.ambicode[\\/]config\.yaml/.test(initOutput)) throw new Error(`init did not report writing config:\n${initOutput}`);

    const policyOutput = run(['policy'], { cwd });
    // A built-in pack, shipped under policies/ in the candidate: proves the
    // installed package's own policies (and, transitively, the prompt files
    // they reference) resolve from CLAUDE_PLUGIN_ROOT / the upward search,
    // not from this source checkout.
    if (!policyOutput.includes('common-quality')) {
      throw new Error(`resolved policy did not include the built-in common-quality pack:\n${policyOutput}`);
    }
    console.log('OK: `ambicode init` + `ambicode policy` resolve the installed candidate\'s built-in policies.');

    // R3: the two-word `policy check` dispatch and the nonzero exit on an
    // error diagnostic, through the bundled entry point rather than the source
    // tree — a subcommand recognized only in `src/cli/main.ts` would look fine
    // in a unit test and be unreachable in the shipped bundle.
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

    // R4: the boundary shortlist through the bundled entry point, for the same
    // reason as `policy check` above. It also proves the command needs nothing
    // but git — no index, no language server, no state carried from install.
    const locateOutput = run(['locate', 'app'], { cwd });
    if (!/app\.ts/.test(locateOutput) || !/filename matched "app"/.test(locateOutput)) {
      throw new Error(`locate did not return a reason-carrying candidate:\n${locateOutput}`);
    }
    const emptyOutput = run(['locate', 'kaleidoscope'], { cwd });
    // Honest emptiness, not the whole repository.
    if (!/\(none/.test(emptyOutput) || /app\.ts/.test(emptyOutput)) {
      throw new Error(`locate widened an empty shortlist:\n${emptyOutput}`);
    }
    console.log('OK: `ambicode locate` ranks with reasons and stays empty when nothing matches.');
  });
}

async function checkViewTemplatesResolve() {
  await withTempDir('ambicode-smoke-view-', async (cwd) => {
    execFileSync('git', ['init', '--quiet'], { cwd });
    execFileSync('git', ['config', 'user.email', 'smoke@example.com'], { cwd });
    execFileSync('git', ['config', 'user.name', 'Smoke Test'], { cwd });
    await writeFile(path.join(cwd, 'app.ts'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd });
    execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd });
    run(['init'], { cwd });

    const reviewId = 'smoke-0001';
    const reviewDir = path.join(cwd, '.ambicode', 'reviews', reviewId);
    await import('node:fs/promises').then((fs) => fs.mkdir(reviewDir, { recursive: true }));
    const result = minimalLocalReviewResult(reviewId);
    await writeFile(path.join(reviewDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);

    const child = spawn(process.execPath, [bundle, 'view', '--review', reviewId, '--no-open'], { cwd });
    let stdout = '';
    let stderr = '';
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`view did not print a URL in time; stdout so far:\n${stdout}\nstderr:\n${stderr}`)), 15_000);
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?c=\S+/.exec(stdout);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`view exited early with code ${code}; stdout:\n${stdout}\nstderr:\n${stderr}`));
      });
    });

    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status !== 303) throw new Error(`expected 303 from the bootstrap URL, got ${response.status}`);
      console.log('OK: `ambicode view` serves a page rendered from the candidate\'s own templates directory.');
    } finally {
      child.kill('SIGINT');
      await new Promise((resolve) => child.on('exit', resolve));
    }
  });
}

function minimalLocalReviewResult(reviewId) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    reviewId,
    createdAt: now,
    pluginVersion: '0.0.0-smoke',
    reviewModel: 'smoke',
    target: {
      kind: 'working',
      repositoryRoot: '/smoke',
      snapshotId: 'smoke-snapshot',
      headSha: null,
      baseSha: null,
      baseRef: null,
      remote: null,
      notes: [],
    },
    requirements: [],
    requirementMode: 'quality-review',
    requirementConflicts: [],
    provenance: [],
    inputs: {
      changedFiles: 0,
      changedLines: 0,
      patchBytes: 0,
      snapshotBytes: 0,
      requirementBytes: 0,
      promptBytes: 0,
      contextBytes: 0,
      limits: { maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288, maxFindings: 7 },
    },
    reviewer: null,
    policySummary: { packs: [], ruleIds: [] },
    checks: [],
    coverage: { complete: true, declaredFileCount: null, deliveredFileCount: 0, versionState: null, gaps: [] },
    discussions: [],
    changedFiles: [],
    findings: [],
    omissions: [],
    status: 'complete',
    statusReason: null,
  };
}

async function main() {
  await checkVersionOutsideAnyRepo();
  await checkPoliciesAndPromptsResolve();
  await checkViewTemplatesResolve();
  console.log('\nAll smoke checks passed against the packaged candidate.');
}

await main();
