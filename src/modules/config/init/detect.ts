import path from 'node:path';
import type { Ecosystem } from '#types/primitives';
import type { Runtime } from '#types/composition';
import type { DirectoryEntry, FileSystem } from '#types/platform/ports';
import type { DetectedProject, DetectedFormat, DetectedCommand } from '../types/init.ts';
import { isObject } from '#util/guards';

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

export async function detectProjects(fs: FileSystem, repositoryRoot: string): Promise<DetectedProject[]> {
  const roots = await findProjectRoots(fs, repositoryRoot);
  const projects: DetectedProject[] = [];
  const usedIds = new Set<string>();

  for (const { relativeRoot, ecosystem } of roots) {
    const absoluteRoot = path.join(repositoryRoot, relativeRoot);
    const detected =
      ecosystem === 'typescript'
        ? await detectTypescript(fs, absoluteRoot)
        : await detectPython(fs, absoluteRoot);
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

async function findProjectRoots(fs: FileSystem, repositoryRoot: string): Promise<RootCandidate[]> {
  const found: RootCandidate[] = [];

  const walk = async (absolute: string, relative: string, depth: number): Promise<void> => {
    let entries: DirectoryEntry[];
    try {
      entries = await fs.readdir(absolute);
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

async function readJson(fs: FileSystem, absolutePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readText(absolutePath)) as Record<string, unknown>;
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

function packageScripts(manifest: Record<string, unknown> | null): Map<string, string> {
  const scripts = new Map<string, string>();
  const section = manifest?.['scripts'];
  if (section === null || typeof section !== 'object') return scripts;
  for (const [name, value] of Object.entries(section as Record<string, unknown>)) {
    if (typeof value === 'string') scripts.set(name, value);
  }
  return scripts;
}

function scriptInvoking(
  scripts: ReadonlyMap<string, string>,
  tools: readonly string[],
): { name: string; tool: string } | null {
  for (const [name, line] of scripts) {
    for (const tool of tools) {
      // Word-bounded so "eslint-config-x" is not read as a call to eslint.
      if (new RegExp(`(^|[\\s/])${tool}([\\s]|$)`).test(line)) return { name, tool };
    }
  }
  return null;
}

type Detected = Pick<DetectedProject, 'lint' | 'unit' | 'e2e' | 'format' | 'frameworkPacks' | 'notices'>;

/** Formatters by tool name, in detection order: argv = [installed binary, ...args] (09-E3). */
async function detectFormat(
  formatters: readonly (readonly [tool: string, args: readonly string[]])[],
  binary: (name: string) => Promise<string | null>,
  declared: ReadonlySet<string>,
): Promise<DetectedFormat | null> {
  for (const [tool, args] of formatters) {
    const bin = await binary(tool);
    if (bin !== null) return { argv: [bin, ...args], notice: `found ${bin}` };
  }
  const named = formatters.find(([tool]) => declared.has(tool));
  return named === undefined ? null : { argv: null, notice: `${named[0]} is declared but not installed; install dependencies, then re-run init` };
}

async function detectTypescript(fs: FileSystem, absoluteRoot: string): Promise<Detected> {
  const manifest = await readJson(fs, path.join(absoluteRoot, 'package.json'));
  const declared = declaredDependencies(manifest);
  const scripts = packageScripts(manifest);
  const notices: string[] = [];

  const scriptNotice = (slot: string, found: { name: string; tool: string }): string =>
    `package.json defines "npm run ${found.name}", which invokes ${found.tool}. AMBICODE does not run package scripts for ${slot}: a wrapper cannot be scoped to the changed files, and ${found.tool} cannot be asked through it which tests a change affects. Point the ${slot} argv at ./node_modules/.bin/${found.tool} instead.`;

  const binary = async (name: string): Promise<string | null> => {
    const relative = `./node_modules/.bin/${name}`;
    return (await fs.exists(path.join(absoluteRoot, 'node_modules', '.bin', name))) ? relative : null;
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
    const script = scriptInvoking(scripts, ['eslint']);
    if (script !== null) {
      notices.push(scriptNotice('lint', script));
      return { argv: null, adapter: 'eslint', notice: `only found via "npm run ${script.name}"` };
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
    const script = scriptInvoking(scripts, ['vitest', 'jest']);
    if (script !== null) {
      notices.push(scriptNotice('unit', script));
      return {
        argv: null,
        adapter: script.tool === 'jest' ? 'jest' : 'vitest',
        notice: `only found via "npm run ${script.name}"`,
      };
    }
    return null;
  })();

  const e2e = await (async (): Promise<DetectedCommand | null> => {
    const bin = await binary('playwright');
    const script = scriptInvoking(scripts, ['playwright']);
    if (bin === null && !declared.has('@playwright/test') && script === null) return null;
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
  else if (scripts.size > 0) {
    notices.push(
      `package.json declares ${scripts.size} script(s) (${[...scripts.keys()].sort().join(', ')}). They are read as evidence only and are never executed by detection.`,
    );
  }
  const framework = FRAMEWORKS.find((candidate) => declared.has(candidate.dependency));
  if (framework !== undefined) {
    notices.push(
      `package.json declares ${framework.dependency}, so the ${framework.name} packs are enabled: ${framework.packs.join(', ')}.`,
    );
  }
  const format = await detectFormat([['prettier', ['--write', '--', '{files}']]], binary, declared);
  return { lint, unit, e2e, format, frameworkPacks: framework === undefined ? [] : [...framework.packs], notices };
}

async function detectPython(fs: FileSystem, absoluteRoot: string): Promise<Detected> {
  const notices: string[] = [];
  const declared = await readPythonDependencies(fs, absoluteRoot);

  const venvBinary = async (name: string): Promise<string | null> => {
    for (const directory of ['.venv', 'venv']) {
      const candidates = [
        ['bin', name],
        ['Scripts', `${name}.exe`],
        ['Scripts', name],
      ] as const;
      for (const [binaryDirectory, executable] of candidates) {
        if (await fs.exists(path.join(absoluteRoot, directory, binaryDirectory, executable))) {
          return `./${directory}/${binaryDirectory}/${executable}`;
        }
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
  const format = await detectFormat([['black', ['--', '{files}']], ['ruff', ['format', '--', '{files}']]], venvBinary, declared);
  return { lint, unit, e2e: null, format, frameworkPacks: [], notices };
}

async function readPythonDependencies(fs: FileSystem, absoluteRoot: string): Promise<Set<string>> {
  const names = new Set<string>();
  const add = (specifier: string) => {
    const name = specifier.trim().split(/[<>=!~\[;\s]/)[0]?.toLowerCase();
    if (name !== undefined && name !== '') names.add(name);
  };

  try {
    const text = await fs.readText(path.join(absoluteRoot, 'pyproject.toml'));
    // A shallow scan, not a TOML parser: a wrong guess yields a null command.
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
      const text = await fs.readText(path.join(absoluteRoot, file));
      for (const line of text.split('\n')) {
        if (line.trim() !== '' && !line.trimStart().startsWith('#')) add(line);
      }
    } catch {
      /* absent is not an error */
    }
  }
  return names;
}

/**
 * First match wins. Angular precedes Express because an Angular SSR app also
 * declares express, and the Express globs would then claim every Angular service.
 */
const FRAMEWORKS = [
  {
    dependency: '@angular/core',
    name: 'Angular',
    packs: [
      'builtin/angular-architecture',
      'builtin/angular-components',
      'builtin/angular-http',
      'builtin/angular-state',
      'builtin/angular-style',
    ],
  },
  {
    dependency: 'express',
    name: 'Express',
    packs: ['builtin/express-errors', 'builtin/express-http', 'builtin/express-persistence', 'builtin/express-style'],
  },
] as const;

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
      notice:
        'No local refs/remotes/origin/HEAD was found, so no baseline was recorded. Branch review needs --base until you set one.',
    };
  }
  return { baseline: originHead, notice: `baseline taken from refs/remotes/origin/HEAD (${originHead})` };
}

const SCAN_TIMEOUT_MS = 10_000;
const SCAN_MAX_OUTPUT_BYTES = 65_536;

/** `codeindex scan`'s languages and file count for `profile.index` (amended 05-A8, 09-P3); null when the output is not that shape.
 * The pinned v2.31.4 CLI emits `fileCount` and `languages` as a histogram (`{typescript: 1, markdown: 1}`). */
export async function scanCodeindex(runtime: Runtime, binary: string, projectRoot: string): Promise<{ languages: string[]; files: number } | null> {
  const outcome = await runtime.runner.run({ argv: [binary, 'scan', '--repo', '.'], cwd: projectRoot, timeoutMs: SCAN_TIMEOUT_MS, maxOutputBytes: SCAN_MAX_OUTPUT_BYTES, env: { kind: 'inherited' } });
  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) return null;
  try {
    const parsed: unknown = JSON.parse(outcome.stdout);
    if (!isObject(parsed) || !isObject(parsed['languages']) || typeof parsed['fileCount'] !== 'number') return null;
    return { languages: Object.keys(parsed['languages']).sort(), files: parsed['fileCount'] };
  } catch {
    return null;
  }
}
