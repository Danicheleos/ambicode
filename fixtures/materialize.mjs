#!/usr/bin/env node
/**
 * Replays a fixture definition into a real git repository.
 *
 *   node fixtures/materialize.mjs <name> <destination> [--ambicode-init]
 *   node fixtures/materialize.mjs --all <destination-directory> [--ambicode-init]
 *   node fixtures/materialize.mjs --list
 *
 * The destination must be empty. Nothing is installed and no project script runs.
 *
 * --ambicode-init runs the built `ambicode init` right after the fixture's last
 * commit and commits what it wrote, before the uncommitted change is replayed.
 * Eval cases need it: without a config `ambicode review` stops at
 * `config-missing`, and running init inside the measured session puts the
 * config file and its `.gitignore` lines into the change under review.
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FIXTURES, fixtureByName } from './definitions.mjs';

const run = promisify(execFile);

/** The built CLI, which is what an installed plugin runs; `scripts/` is build output. */
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
    },
  });
}

/**
 * Ages every tracked file past git's racy-index window: a same-length rewrite
 * inside one timestamp tick otherwise leaves git trusting the cached stat, and
 * the fixture materializes a different scenario than the one it describes.
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

/** Writes the configuration `ambicode init` detects and commits it, index untouched otherwise. */
async function commitAmbicodeInit(destination) {
  try {
    await stat(BUNDLE);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${BUNDLE} does not exist; run "npm run build" first.`);
    throw error;
  }
  await run(process.execPath, [BUNDLE, 'init', '--json'], { cwd: destination });
  await git(destination, ['add', '-A']);
  await git(destination, ['commit', '-q', '-m', 'configure ambicode']);
  await settle(destination);
}

export async function materialize(fixture, destination, { ambicodeInit = false } = {}) {
  const lastCommit = fixture.steps.findLastIndex((step) => step.commit !== undefined);
  if (ambicodeInit && lastCommit === -1) {
    throw new Error(`fixture ${fixture.name} has no commit to configure on top of`);
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
  // A fixture must look the same on every machine, so the developer's global
  // ignore file does not get a say in what it contains.
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
      if (ambicodeInit && index === lastCommit) await commitAmbicodeInit(destination);
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
  const options = { ambicodeInit: rawArgv.includes('--ambicode-init') };
  const argv = rawArgv.filter((value) => value !== '--ambicode-init');
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
