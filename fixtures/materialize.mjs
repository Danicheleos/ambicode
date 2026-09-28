#!/usr/bin/env node
/**
 * Usage: <name> <empty-destination> | --all <directory> | --list  [--install] [--ambicode-init]
 * Without --install no project script runs. --ambicode-init commits init's output
 * before the uncommitted change is replayed, keeping the config out of the reviewed change.
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { FIXTURES, fixtureByName } from './definitions.mjs';

const run = promisify(execFile);

const BUNDLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ambicode.mjs');

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

/** `wires` holds only after an install, so it is empty without one. */
async function commitAmbicodeInit(fixture, destination, wires) {
  try {
    await stat(BUNDLE);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${BUNDLE} does not exist; run "npm run build" first.`);
    throw error;
  }
  await run(process.execPath, [BUNDLE, 'init', '--json'], { cwd: destination });
  if (wires.length > 0) {
    const config = parseYaml(await readFile(path.join(destination, '.ambicode', 'config.yaml'), 'utf8'));
    const root = config.projects.find((project) => project.root === '.');
    if (root === undefined) throw new Error(`${fixture.name}: init configured no project at the repository root`);
    const unwired = wires.filter((slot) => root.checks?.[slot] == null).map((slot) => `checks.${slot}`);
    if (unwired.length > 0) {
      throw new Error(`${fixture.name}: init left ${unwired.join(', ')} unwired after the install`);
    }
  }
  await git(destination, ['add', '-A']);
  await git(destination, ['commit', '-q', '-m', 'configure ambicode']);
  await settle(destination);
}

export async function materialize(fixture, destination, { install: installing = false, ambicodeInit = false } = {}) {
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
        await commitAmbicodeInit(fixture, destination, installing ? (fixture.wires ?? []) : []);
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
  const options = { install: rawArgv.includes('--install'), ambicodeInit: rawArgv.includes('--ambicode-init') };
  const argv = rawArgv.filter((value) => value !== '--install' && value !== '--ambicode-init');
  if (argv.includes('--list') || argv.length === 0) {
    for (const fixture of FIXTURES) {
      process.stdout.write(`${fixture.name.padEnd(24)} ${fixture.summary}\n`);
      process.stdout.write(`${''.padEnd(24)} covers: ${fixture.covers.join(', ')}\n`);
    }
    return 0;
  }

  if (argv[0] === '--all') {
    const root = argv[1];
    if (root === undefined) {
      process.stderr.write('--all needs a destination directory\n');
      return 2;
    }
    for (const fixture of FIXTURES) {
      const destination = path.resolve(root, fixture.name);
      await materialize(fixture, destination, options);
      process.stdout.write(`${fixture.name}\t${destination}\n`);
    }
    return 0;
  }

  const [name, destination] = argv;
  const fixture = name === undefined ? null : fixtureByName(name);
  if (fixture === null) {
    process.stderr.write(`unknown fixture "${name ?? ''}"; run with --list\n`);
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
