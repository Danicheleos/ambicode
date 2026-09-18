import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AdapterId, Ecosystem } from '../contracts/primitives.ts';
import { normalizeRelative } from '../util/paths.ts';

/**
 * Detection reads manifests and looks for installed executables. It never runs
 * a project script and never installs anything (doc 05).
 */

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ambicode',
]);

const MAX_DEPTH = 4;

export interface DetectedCommand {
  argv: string[] | null;
  adapter: AdapterId;
  /** Why the command is null, or how the executable was found. */
  notice: string;
}

export interface DetectedProject {
  id: string;
  root: string;
  ecosystem: Ecosystem;
  lint: DetectedCommand | null;
  unit: DetectedCommand | null;
  e2e: DetectedCommand | null;
  notices: string[];
}

export async function detectProjects(repositoryRoot: string): Promise<DetectedProject[]> {
  const roots = await findProjectRoots(repositoryRoot);
  const projects: DetectedProject[] = [];
  const usedIds = new Set<string>();

  for (const { relativeRoot, ecosystem } of roots) {
    const absoluteRoot = path.join(repositoryRoot, relativeRoot);
    const detected =
      ecosystem === 'typescript'
        ? await detectTypescript(absoluteRoot)
        : await detectPython(absoluteRoot);
    projects.push({
      id: uniqueId(projectId(relativeRoot, ecosystem), usedIds),
      root: relativeRoot === '' ? '.' : relativeRoot,
      ecosystem,
      ...detected,
    });
  }
  return projects;
}

function projectId(relativeRoot: string, ecosystem: Ecosystem): string {
  if (relativeRoot === '') return ecosystem === 'python' ? 'python' : 'app';
  const slug = relativeRoot
    .split('/')
    .filter((segment) => segment !== '')
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? ecosystem : slug;
}

function uniqueId(candidate: string, used: Set<string>): string {
  let id = candidate;
  let counter = 2;
  while (used.has(id)) {
    id = `${candidate}-${counter}`;
    counter += 1;
  }
  used.add(id);
  return id;
}

interface RootCandidate {
  relativeRoot: string;
  ecosystem: Ecosystem;
}

async function findProjectRoots(repositoryRoot: string): Promise<RootCandidate[]> {
  const found: RootCandidate[] = [];

  const walk = async (absolute: string, relative: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

    // A workspace root holding only a package.json with `workspaces` is still a
    // TypeScript project root; membership uses the most-specific root later.
    if (names.has('package.json')) found.push({ relativeRoot: relative, ecosystem: 'typescript' });
    if (names.has('pyproject.toml') || names.has('setup.py') || names.has('setup.cfg')) {
      found.push({ relativeRoot: relative, ecosystem: 'python' });
    }

    if (depth >= MAX_DEPTH) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      await walk(path.join(absolute, entry.name), relative === '' ? entry.name : `${relative}/${entry.name}`, depth + 1);
    }
  };

  await walk(repositoryRoot, '', 0);
  return found;
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(absolutePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(absolutePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function declaredDependencies(manifest: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const section = manifest?.[field];
    if (section !== null && typeof section === 'object') {
      for (const name of Object.keys(section as Record<string, unknown>)) names.add(name);
    }
  }
  return names;
}

async function detectTypescript(
  absoluteRoot: string,
): Promise<Pick<DetectedProject, 'lint' | 'unit' | 'e2e' | 'notices'>> {
  const manifest = await readJson(path.join(absoluteRoot, 'package.json'));
  const declared = declaredDependencies(manifest);
  const notices: string[] = [];

  const binary = async (name: string): Promise<string | null> => {
    const relative = `./node_modules/.bin/${name}`;
    return (await exists(path.join(absoluteRoot, 'node_modules', '.bin', name))) ? relative : null;
  };

  const lint = await (async (): Promise<DetectedCommand | null> => {
    const bin = await binary('eslint');
    if (bin !== null) {
      return { argv: [bin, '--', '{files}'], adapter: 'eslint', notice: `found ${bin}` };
    }
    if (declared.has('eslint')) {
      return {
        argv: null,
        adapter: 'eslint',
        notice: 'eslint is declared in package.json but not installed; install dependencies, then re-run init',
      };
    }
    return null;
  })();

  const unit = await (async (): Promise<DetectedCommand | null> => {
    const vitest = await binary('vitest');
    if (vitest !== null) {
      return { argv: [vitest, 'run', '{files}'], adapter: 'vitest', notice: `found ${vitest}` };
    }
    const jest = await binary('jest');
    if (jest !== null) {
      return { argv: [jest, '--runTestsByPath', '{files}'], adapter: 'jest', notice: `found ${jest}` };
    }
    for (const name of ['vitest', 'jest'] as const) {
      if (declared.has(name)) {
        return {
          argv: null,
          adapter: name,
          notice: `${name} is declared in package.json but not installed; install dependencies, then re-run init`,
        };
      }
    }
    return null;
  })();

  const e2e = await (async (): Promise<DetectedCommand | null> => {
    const bin = await binary('playwright');
    if (bin === null && !declared.has('@playwright/test')) return null;
    // Left null on purpose: an existing e2e setup may start services, so it is
    // not treated as a bounded command without the owner saying so (doc 05).
    notices.push(
      'Playwright was detected but the e2e command is left null: an existing e2e setup may start services or depend on a running environment. Configure it deliberately if its scope is bounded.',
    );
    return {
      argv: null,
      adapter: 'playwright',
      notice: 'detected but not configured; declare its argv once you have confirmed the scope it runs',
    };
  })();

  if (manifest === null) notices.push('package.json could not be parsed; commands were left null');
  return { lint, unit, e2e, notices };
}

async function detectPython(
  absoluteRoot: string,
): Promise<Pick<DetectedProject, 'lint' | 'unit' | 'e2e' | 'notices'>> {
  const notices: string[] = [];
  const declared = await readPythonDependencies(absoluteRoot);

  const venvBinary = async (name: string): Promise<string | null> => {
    for (const directory of ['.venv', 'venv']) {
      if (await exists(path.join(absoluteRoot, directory, 'bin', name))) {
        return `./${directory}/bin/${name}`;
      }
    }
    return null;
  };

  const lint = await (async (): Promise<DetectedCommand | null> => {
    const bin = await venvBinary('ruff');
    if (bin !== null) return { argv: [bin, 'check', '--', '{files}'], adapter: 'ruff', notice: `found ${bin}` };
    if (declared.has('ruff')) {
      return {
        argv: null,
        adapter: 'ruff',
        notice:
          'ruff is declared but no project virtual environment was found; point the argv at the interpreter you use',
      };
    }
    return null;
  })();

  const unit = await (async (): Promise<DetectedCommand | null> => {
    const python = (await venvBinary('python')) ?? (await venvBinary('python3'));
    const pytest = await venvBinary('pytest');
    if (python !== null && pytest !== null) {
      return {
        argv: [python, '-m', 'pytest', '--', '{files}'],
        adapter: 'pytest',
        notice: `found ${pytest}`,
      };
    }
    if (declared.has('pytest')) {
      return {
        argv: null,
        adapter: 'pytest',
        notice:
          'pytest is declared but no project virtual environment was found; point the argv at the interpreter you use',
      };
    }
    return null;
  })();

  if (declared.size === 0) {
    notices.push('No Python dependency declarations were readable; commands were left null');
  }
  return { lint, unit, e2e: null, notices };
}

async function readPythonDependencies(absoluteRoot: string): Promise<Set<string>> {
  const names = new Set<string>();
  const add = (specifier: string) => {
    const name = specifier.trim().split(/[<>=!~\[;\s]/)[0]?.toLowerCase();
    if (name !== undefined && name !== '') names.add(name);
  };

  try {
    const text = await readFile(path.join(absoluteRoot, 'pyproject.toml'), 'utf8');
    // Deliberately a shallow scan, not a TOML parser: detection only needs to
    // know whether a tool is mentioned, and a wrong guess yields a null command.
    for (const match of text.matchAll(/"([A-Za-z0-9._-]+(?:\[[^\]]*\])?[^"]*)"/g)) {
      if (match[1] !== undefined) add(match[1]);
    }
    for (const match of text.matchAll(/^\s*\[tool\.([a-z0-9_-]+)/gm)) {
      if (match[1] !== undefined) names.add(match[1].toLowerCase());
    }
  } catch {
    /* absent is not an error */
  }

  for (const file of ['requirements.txt', 'requirements-dev.txt', 'dev-requirements.txt']) {
    try {
      const text = await readFile(path.join(absoluteRoot, file), 'utf8');
      for (const line of text.split('\n')) {
        if (line.trim() !== '' && !line.trimStart().startsWith('#')) add(line);
      }
    } catch {
      /* absent is not an error */
    }
  }
  return names;
}

/** Built-in packs offered for an ecosystem. Framework packs stay opt-in. */
export function suggestedPacks(ecosystem: Ecosystem): string[] {
  return ecosystem === 'python'
    ? ['builtin/common-quality', 'builtin/common-checks', 'builtin/python-quality']
    : ['builtin/common-quality', 'builtin/common-checks'];
}

export async function detectBaseline(
  repositoryRoot: string,
  readOriginHead: (repositoryRoot: string) => Promise<string | null>,
): Promise<{ baseline: string; notice: string }> {
  const originHead = await readOriginHead(repositoryRoot);
  if (originHead === null) {
    return {
      baseline: '',
      // Never guess `main` (doc 05).
      notice:
        'No local refs/remotes/origin/HEAD was found, so no baseline was recorded. Branch review needs --base until you set one.',
    };
  }
  return { baseline: originHead, notice: `baseline taken from refs/remotes/origin/HEAD (${originHead})` };
}

/** Used by init to keep a user's existing YAML comments and edits in view. */
export function parseExistingConfigDocument(raw: string): unknown {
  try {
    return parseYaml(raw);
  } catch {
    return null;
  }
}

export function relativeRootOf(repositoryRoot: string, absolute: string): string {
  return normalizeRelative(path.relative(repositoryRoot, absolute));
}
