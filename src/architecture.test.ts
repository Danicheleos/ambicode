import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, SRC_ROOT } from '#testing/paths';

/**
 * Imports point down only. `types` and `util` are usable from anywhere and import nothing above
 * them; `types` may name a platform type, never import a value. The top three are adapters.
 */
const RANK: Record<string, number> = {
  types: -1,
  util: -1,
  platform: 0,
  modules: 1,
  harness: 2,
  skills: 3,
  composition: 4,
  hook: 5,
  cli: 6,
  testing: 7,
};

/** Known crossings, removed as they are fixed; an entry that no longer occurs fails too. */
const ALLOWLIST = new Set<string>([
  'src/harness/engine/handlers.ts -> #skills/common',
  'src/harness/engine/handlers.ts -> #skills/init/handlers',
  'src/harness/engine/handlers.ts -> #skills/rules/handlers',
  'src/harness/engine/handlers.ts -> #skills/task/handlers',
  'src/harness/engine/handlers.ts -> #skills/review/handlers',
  'src/hook/events/prepare-on-skill.ts -> #cli/args',
  'src/hook/events/prepare-on-skill.ts -> #cli/commands/prepare/prepare',
  'src/hook/events/prompt-launch.ts -> #cli/args',
  'src/hook/events/prompt-launch.ts -> #cli/commands/route/route',
  'src/modules/checks/review-evaluation.ts -> #harness/engine/fold',
  'src/modules/checks/run/check-command.ts -> #harness/engine/context',
  'src/modules/checks/run/check-command.ts -> #harness/engine/fold',
  'src/modules/checks/run/check-command.ts -> #harness/gates/gates',
  'src/modules/checks/run/format.ts -> #harness/engine/context',
  'src/modules/evidence/notes.ts -> #harness/session/ownership',
  'src/modules/evidence/report/report.ts -> #harness/engine/fold',
  'src/modules/policy/authoring/rules.ts -> #harness/engine/context',
  'src/modules/requirements/envelope/conflict.ts -> #harness/gates/gates',
  'src/modules/requirements/envelope/envelope.ts -> #harness/engine/fold',
  'src/modules/workers/plan-check.ts -> #harness/engine/fold',
]);

const GUARD_BUNDLE_MAX_BYTES = 72 * 1024;

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) found.push(...sources(full));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const areaOf = (file: string): string => path.relative(SRC_ROOT, file).split(path.sep)[0]!;

function target(file: string, specifier: string): string | null {
  if (specifier.startsWith('#')) return path.join(SRC_ROOT, specifier.slice(1));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier);
  return null;
}

/** Statements that load another module: static imports, re-exports and dynamic imports. */
const STATEMENT = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'|import\(\s*'([^']+)'\s*\)/g;

function crossings(): string[] {
  const found: string[] = [];
  for (const file of sources(SRC_ROOT)) {
    const from = areaOf(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(STATEMENT)) {
      const specifier = match[4] ?? match[5]!;
      const resolved = target(file, specifier);
      if (resolved === null) continue;
      const to = areaOf(resolved);
      if (to === from) continue;
      const typeOnly = match[2] !== undefined || /^\{\s*(?:type\s+[^,}]+,?\s*)+\}$/.test(match[3] ?? '');
      const rankFrom = RANK[from]!;
      const rankTo = RANK[to]!;
      const allowed =
        rankFrom === -1 ? rankTo === -1 || (from === 'types' && rankTo === 0 && typeOnly) : rankTo < rankFrom;
      if (!allowed) found.push(`${path.relative(REPO_ROOT, file)} -> ${specifier}`);
    }
  }
  return found.sort();
}

describe('layer boundaries', () => {
  it('ranks every source area', () => {
    const areas = readdirSync(SRC_ROOT).filter((name) => statSync(path.join(SRC_ROOT, name)).isDirectory());
    assert.deepEqual(areas.filter((area) => RANK[area] === undefined), []);
  });

  it('imports only downward, apart from the allowlisted crossings', () => {
    const actual = crossings();
    assert.deepEqual(actual.filter((edge) => !ALLOWLIST.has(edge)), [], 'new upward imports');
    assert.deepEqual([...ALLOWLIST].filter((edge) => !actual.includes(edge)).sort(), [], 'fixed crossings still allowlisted');
  });

  const guard = path.join(REPO_ROOT, 'scripts', 'guard.mjs');
  it('keeps the guard bundle small and free of zod', { skip: !existsSync(guard) }, () => {
    const text = readFileSync(guard, 'utf8');
    assert.ok(text.length <= GUARD_BUNDLE_MAX_BYTES, `guard.mjs is ${text.length} bytes`);
    assert.ok(!/\bZodError\b|from ['"]zod['"]/.test(text), 'guard.mjs bundles zod');
  });
});
