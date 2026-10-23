#!/usr/bin/env node
/**
 * Usage: <name> <empty-destination>  [--install] [--ambicode-init] [--context] [--policy]
 * Without --install no project script runs. --ambicode-init commits the config and ignore lines the pure writer produces
 * before the uncommitted change is replayed, keeping the config out of the reviewed change.
 * --context (needs --ambicode-init) then writes fixtures/contexts/<fixture>.md into the gitignored .ambicode/context through
 * the real `ambicode context write`, standing in for what /ambicode:init's scout leaves behind.
 * --policy (needs --ambicode-init) writes fixtures/policies/<fixture>.yaml to the gitignored .ambicode/policies/team-rules.yaml
 * and lists it in the project's policyFiles, the place `ambicode rules apply` puts an accepted project pack.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { SUPPORTED_SCHEMA_VERSION } from '../src/types/modules/config.ts';
import { fixtureByName } from './definitions.mjs';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function git(cwd, args) {
  await run('git', args, {
    cwd,
    env: {
      ...process.env,
      LC_ALL: 'C',
      LANG: 'C',
      GIT_AUTHOR_NAME: 'AMBICODE Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'AMBICODE Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      // Fixed so a fixture always gets the same commits and review `snapshotId`,
      // which the replay reviewer keys on.
      GIT_AUTHOR_DATE: FIXTURE_DATE,
      GIT_COMMITTER_DATE: FIXTURE_DATE,
    },
  });
}

export const FIXTURE_DATE = '2026-01-01T00:00:00Z';

/**
 * Ages every tracked file past git's racy-index window: a same-length rewrite
 * inside one timestamp tick otherwise leaves git trusting the cached stat.
 */
async function settle(destination) {
  const past = new Date(Date.now() - 10_000);
  const { stdout } = await run('git', ['ls-files', '-z'], { cwd: destination });
  for (const relative of stdout.split('\0').filter((value) => value !== '')) {
    try {
      await utimes(path.join(destination, relative), past, past);
    } catch {
      // A path a later step removes needs no timestamp.
    }
  }
  await git(destination, ['update-index', '--refresh', '-q']);
}

export function installPlanFor(fixture, destination) {
  return (fixture.install ?? []).map(([executable, ...args]) => [
    executable.includes('/') ? path.join(destination, executable) : executable,
    ...args,
  ]);
}

async function install(fixture, destination) {
  for (const [executable, ...args] of installPlanFor(fixture, destination)) {
    await run(executable, args, { cwd: destination, maxBuffer: 16 * 1024 * 1024 });
  }
  // A zero exit is not an install: under NODE_ENV=production npm skips every
  // devDependency and still exits 0.
  const missing = [];
  for (const relative of fixture.provides ?? []) {
    await stat(path.join(destination, relative)).catch(() => missing.push(relative));
  }
  if (missing.length > 0) {
    throw new Error(`installing ${fixture.name} exited 0 but did not provide ${missing.join(', ')}`);
  }
  const { stdout } = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: destination });
  if (stdout !== '') {
    throw new Error(`installing ${fixture.name} left changes git can see:\n${stdout}`);
  }
}

/** Stands in for the model's judgment: one root project; a wired slot gets the installed tool that serves it, found by looking for the binary. */
async function ignoredFor(destination) {
  const { stdout } = await run('git', ['ls-files', '-o', '-i', '--exclude-standard', '--directory'], { cwd: destination });
  return stdout.split('\n').map((line) => line.trim()).filter((line) => line.endsWith('/') && !line.startsWith('.ambicode/')).sort();
}

async function configFor(destination, wires, policyFiles = []) {
  const ignored = await ignoredFor(destination);
  const tools = {
    lint: [['node_modules/.bin/eslint', '{file}'], ['.venv/bin/ruff', 'check {file}']],
    unit: [['node_modules/.bin/jest', '--findRelatedTests {file}'], ['.venv/bin/python', '-m pytest {file}']],
  };
  const checks = { lint: { all: null, file: null }, unit: { all: null, file: null } };
  for (const slot of wires) {
    for (const [binary, rest] of tools[slot] ?? []) {
      if (!(await access(path.join(destination, binary)).then(() => true, () => false))) continue;
      const command = `./${binary} ${rest}`;
      checks[slot] = { all: command.replace(' {file}', ''), file: command };
    }
  }
  const python = await access(path.join(destination, 'pyproject.toml')).then(() => true, () => false);
  const run = { model: 'sonnet', effort: 'medium', timeoutMinutes: 15 };
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    id: 'app',
    context: { maxTotalTokens: 24000, maxFileTokens: 2500, maxIndexTokens: 5000 },
    skills: {
      init: { ...run, scout: run },
      review: { ...run, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null, excludePaths: [] },
      task: { ...run, checkTimeoutSeconds: 120 },
      plan: run,
      investigate: run,
      rules: run,
    },
    requirements: { runtimes: {}, mcps: [], lsps: [], env: [] },
    projects: [{ id: 'app', root: '.', paths: [], ecosystem: { languages: [python ? 'python' : 'typescript'], frameworks: [], packageManager: null }, include: [], exclude: [], ignored, packs: ['builtin/common-design', 'builtin/common-code', 'builtin/common-errors', 'builtin/common-security', 'builtin/common-verification', 'builtin/common-checks'], policyFiles, commands: {}, checks }],
  };
}

/** A variant (ts-app-medium-refund-bug) shares its base fixture's file: same tree layout, so the longest name given as a prefix serves. */
async function bundleFor(folder, extension, fixture) {
  const dir = path.join(REPO_ROOT, 'fixtures', folder);
  const names = (await readdir(dir)).filter((file) => file.endsWith(extension)).map((file) => file.slice(0, -extension.length));
  const match = names.filter((name) => fixture.name === name || fixture.name.startsWith(`${name}-`)).sort((a, b) => b.length - a.length)[0];
  if (match === undefined) throw new Error(`no file in fixtures/${folder} for ${fixture.name}`);
  return readFile(path.join(dir, `${match}${extension}`), 'utf8');
}

/** Goes through the CLI so the bundle faces the same checkContext limits a scout's would; run npm run build first. */
async function writeContext(fixture, destination) {
  const cli = path.join(REPO_ROOT, 'scripts', 'ambicode.mjs');
  await stat(cli).catch(() => { throw new Error(`${cli} is missing: run npm run build before materializing with --context`); });
  const bundle = await bundleFor('contexts', '.md', fixture);
  const child = run(process.execPath, [cli, 'context', 'write', '--replace'], { cwd: destination, maxBuffer: 16 * 1024 * 1024 });
  child.child.stdin.end(bundle);
  try {
    const { stdout } = await child;
    if (JSON.parse(stdout).check.problems.length > 0) throw new Error(stdout);
  } catch (error) {
    throw new Error(`context write failed for ${fixture.name}: ${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`);
  }
}

const TEAM_POLICY = '.ambicode/policies/team-rules.yaml';

/** `wires` holds only after an install, so it is empty without one. */
async function commitAmbicodeInit(fixture, destination, wires, policy) {
  const { createRuntime } = await import('../src/composition/root.ts');
  const { openRepository } = await import('../src/platform/git/open.ts');
  const runtime = await createRuntime({ cwd: destination });
  const { repositoryRoot } = await openRepository(runtime);
  await mkdir(path.join(repositoryRoot, '.ambicode'), { recursive: true });
  const policyFiles = policy ? [TEAM_POLICY] : [];
  if (policy) {
    await mkdir(path.join(repositoryRoot, '.ambicode', 'policies'), { recursive: true });
    await writeFile(path.join(repositoryRoot, TEAM_POLICY), await bundleFor('policies', '.yaml', fixture));
  }
  await writeFile(path.join(repositoryRoot, '.ambicode', 'config.yaml'), stringifyYaml(await configFor(destination, wires, policyFiles)));
  await writeFile(path.join(repositoryRoot, '.gitignore'), '.ambicode/\n', { flag: 'a' });
  if (wires.length > 0) {
    const config = parseYaml(await readFile(path.join(destination, '.ambicode', 'config.yaml'), 'utf8'));
    const root = config.projects.find((project) => project.root === '.');
    if (root === undefined) throw new Error(`${fixture.name}: init configured no project at the repository root`);
    const unwired = wires.filter((slot) => root.checks?.[slot]?.all == null).map((slot) => `checks.${slot}`);
    if (unwired.length > 0) {
      throw new Error(`${fixture.name}: init left ${unwired.join(', ')} unwired after the install`);
    }
  }
  await git(destination, ['add', '-A']);
  await git(destination, ['add', '-f', '.ambicode/config.yaml']);
  await git(destination, ['commit', '-q', '-m', 'configure ambicode']);
  await settle(destination);
}

export async function materialize(fixture, destination, { install: installing = false, ambicodeInit = false, context = false, policy = false } = {}) {
  if ((context || policy) && !ambicodeInit) throw new Error('--context and --policy need --ambicode-init');
  const lastCommit = fixture.steps.findLastIndex((step) => step.commit !== undefined);
  if ((ambicodeInit || installing) && lastCommit === -1) {
    throw new Error(`fixture ${fixture.name} has no commit to install or configure on top of`);
  }

  await mkdir(destination, { recursive: true });
  const existing = await readdir(destination);
  if (existing.length > 0) {
    throw new Error(`destination is not empty: ${destination}`);
  }

  await git(destination, ['init', '-q', '--initial-branch=main', '.']);
  await git(destination, ['config', 'user.email', 'fixture@example.invalid']);
  await git(destination, ['config', 'user.name', 'AMBICODE Fixture']);
  await git(destination, ['config', 'commit.gpgsign', 'false']);
  // git 2.55 starts `maintenance run --auto` detached after a commit and repacks .git/objects for a second; the eval harness lists the run dir once and rejects the run when it changes (4 bare runs scored 0 for it on 2026-10-23).
  await git(destination, ['config', 'maintenance.auto', 'false']);
  await git(destination, ['config', 'gc.auto', '0']);
  // The developer's global ignore file must not change what a fixture contains.
  await git(destination, ['config', 'core.excludesFile', '/dev/null']);

  for (const [index, step] of fixture.steps.entries()) {
    if (step.write !== undefined) {
      for (const [relative, contents] of Object.entries(step.write)) {
        const absolute = path.join(destination, relative);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, contents, 'utf8');
      }
    }
    if (step.delete !== undefined) {
      for (const relative of step.delete) {
        await rm(path.join(destination, relative), { force: true });
      }
    }
    if (step.move !== undefined) {
      for (const [from, to] of step.move) {
        await mkdir(path.dirname(path.join(destination, to)), { recursive: true });
        await git(destination, ['mv', from, to]);
      }
    }
    if (step.stage !== undefined) {
      await git(destination, ['add', '--', ...step.stage]);
    }
    if (step.commit !== undefined) {
      await git(destination, ['add', '-A']);
      await git(destination, ['commit', '-q', '-m', step.commit]);
      await settle(destination);
      // Install before init, so init detects the runner the install provides.
      if (installing && index === lastCommit) await install(fixture, destination);
      if (ambicodeInit && index === lastCommit) {
        await commitAmbicodeInit(fixture, destination, installing ? (fixture.wires ?? []) : [], policy);
        if (context) await writeContext(fixture, destination);
      }
    }
    if (step.branch !== undefined) {
      await git(destination, ['checkout', '-q', '-b', step.branch]);
    }
    if (step.switch !== undefined) {
      await git(destination, ['checkout', '-q', step.switch]);
    }
  }

  return destination;
}

async function main(rawArgv) {
  const options = { install: rawArgv.includes('--install'), ambicodeInit: rawArgv.includes('--ambicode-init'), context: rawArgv.includes('--context'), policy: rawArgv.includes('--policy') };
  const argv = rawArgv.filter((value) => !['--install', '--ambicode-init', '--context', '--policy'].includes(value));
  const [name, destination] = argv;
  const fixture = name === undefined ? null : fixtureByName(name);
  if (fixture === null) {
    process.stderr.write(`unknown fixture "${name ?? ''}"\n`);
    return 2;
  }
  if (destination === undefined) {
    process.stderr.write('a destination directory is required\n');
    return 2;
  }
  await materialize(fixture, path.resolve(destination), options);
  process.stdout.write(`${path.resolve(destination)}\n`);
  return 0;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('materialize.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
