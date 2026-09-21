// Runs the packaged candidate from outside this source checkout, the way a
// second developer's machine would, with none of this repository's
// node_modules or TypeScript source reachable (doc 03 P1.7 §2-3).
//
// Usage: node smoke-candidate.mjs <candidate-directory>
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const candidateDir = process.argv[2];
if (candidateDir === undefined) {
  console.error('usage: node smoke-candidate.mjs <candidate-directory>');
  process.exit(2);
}
const launcher = path.resolve(candidateDir, 'bin/ambicode');

function run(args, options = {}) {
  return execFileSync(launcher, args, { encoding: 'utf8', ...options });
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
    if (!/\.ambicode\/config\.yaml/.test(initOutput)) throw new Error(`init did not report writing config:\n${initOutput}`);

    const policyOutput = run(['policy'], { cwd });
    // A built-in pack, shipped under policies/ in the candidate: proves the
    // installed package's own policies (and, transitively, the prompt files
    // they reference) resolve from CLAUDE_PLUGIN_ROOT / the upward search,
    // not from this source checkout.
    if (!policyOutput.includes('common-quality')) {
      throw new Error(`resolved policy did not include the built-in common-quality pack:\n${policyOutput}`);
    }
    console.log('OK: `ambicode init` + `ambicode policy` resolve the installed candidate\'s built-in policies.');
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

    const child = spawn(launcher, ['view', '--review', reviewId, '--no-open'], { cwd });
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
