import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import ts from 'typescript';
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
const ALLOWLIST = new Set<string>([]);

// Phase 4 rewrite (structural parser, no read/glob/--task rows): 76295 B before, 26444 B built with the opaque-word rule. Cap = 26208 + 512; Phase 7 (plan check and rules discover left the CLI): 26152 B, cap lowered to match; second audit (ownership takeover branch, dead kinds): 24426 B; init redesign (no config/.gitignore rows): 24340 B.
const GUARD_BUNDLE_MAX_BYTES = 24340 + 512;

/** Test files (*.test.ts) are deliberately not scanned: they may import across layers. */
function sources(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) found.push(...sources(full));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const posixRelative = (from: string, file: string): string => path.relative(from, file).split(path.sep).join('/');

const areaOf = (file: string): string => posixRelative(SRC_ROOT, file).split('/')[0]!;

function target(file: string, specifier: string): string | null {
  if (specifier.startsWith('#')) return path.join(SRC_ROOT, specifier.slice(1));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier);
  return null;
}

interface Load {
  specifier: string;
  typeOnly: boolean;
}

/** Everything that loads another module: static imports, re-exports, `import x = require()` and dynamic imports. */
function loads(file: string): Load[] {
  const found: Load[] = [];
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const literal = (node: ts.Node | undefined): string | null =>
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined && named !== undefined && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly)));
      found.push({ specifier: literal(node.moduleSpecifier)!, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      const clause = node.exportClause;
      const typeOnly =
        node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly));
      found.push({ specifier: literal(node.moduleSpecifier)!, typeOnly });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = literal(node.moduleReference.expression);
      if (specifier !== null) found.push({ specifier, typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = literal(node.arguments[0]);
      if (specifier !== null) found.push({ specifier, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function crossings(): string[] {
  const found: string[] = [];
  for (const file of sources(SRC_ROOT)) {
    const from = areaOf(file);
    for (const { specifier, typeOnly } of loads(file)) {
      const resolved = target(file, specifier);
      if (resolved === null) continue;
      const to = areaOf(resolved);
      if (to === from) continue;
      const rankFrom = RANK[from]!;
      const rankTo = RANK[to]!;
      const allowed =
        rankFrom === -1 ? rankTo === -1 || (from === 'types' && rankTo === 0 && typeOnly) : rankTo < rankFrom;
      if (!allowed) found.push(`${posixRelative(REPO_ROOT, file)} -> ${specifier}`);
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
    const bytes = Buffer.byteLength(text);
    assert.ok(bytes <= GUARD_BUNDLE_MAX_BYTES, `guard.mjs is ${bytes} bytes`);
    assert.ok(!/\bZodError\b|from ['"]zod['"]/.test(text), 'guard.mjs bundles zod');
  });
});
