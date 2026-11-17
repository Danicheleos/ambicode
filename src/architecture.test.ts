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

// Cap = built size + 512 B headroom.
const GUARD_BUNDLE_MAX_BYTES = 26818 + 512;

/** Test files (*.test.ts) are not scanned for layer crossings by default: they may import across layers. */
function sources(directory: string, { tests = false, scripts = false } = {}): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) found.push(...sources(full, { tests, scripts }));
    else if ((name.endsWith('.ts') && (tests || !name.endsWith('.test.ts'))) || (scripts && name.endsWith('.mjs'))) found.push(full);
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
  /** The names taken from the module; null when the whole namespace is (`import * as`, `export *`, an undestructured `import()`). */
  names: string[] | null;
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
      const names: string[] | null =
        named !== undefined && ts.isNamespaceImport(named)
          ? null
          : [...(clause?.name === undefined ? [] : ['default']), ...(named !== undefined && ts.isNamedImports(named) ? named.elements.map((element) => (element.propertyName ?? element.name).text) : [])];
      found.push({ specifier: literal(node.moduleSpecifier)!, typeOnly, names });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      const clause = node.exportClause;
      const typeOnly =
        node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly));
      found.push({ specifier: literal(node.moduleSpecifier)!, typeOnly, names: clause !== undefined && ts.isNamedExports(clause) ? clause.elements.map((element) => (element.propertyName ?? element.name).text) : null });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = literal(node.moduleReference.expression);
      if (specifier !== null) found.push({ specifier, typeOnly: node.isTypeOnly, names: null });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = literal(node.arguments[0]);
      const binding = ts.isAwaitExpression(node.parent) && ts.isVariableDeclaration(node.parent.parent) ? node.parent.parent.name : undefined;
      const names = binding !== undefined && ts.isObjectBindingPattern(binding) ? binding.elements.map((element) => (element.propertyName ?? element.name).getText(source)) : null;
      if (specifier !== null) found.push({ specifier, typeOnly: false, names });
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

/**
 * Entry points are loaded by esbuild or the CLI, not imported: `main` is called from the bundle,
 * and the guard bundle has no importers by design.
 */
const ENTRY_POINTS = new Set(['src/cli/main.ts', 'src/hook/guard/guard.ts']);

/** Files outside `src/` that import from it (build and fixture scripts); their imports count as users. */
const OUTSIDE_IMPORTERS = ['tools', 'fixtures'];

const hasExportModifier = (node: ts.Node): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

function exportedNames(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  for (const node of source.statements) {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier === undefined && node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
      found.push(...node.exportClause.elements.map((element) => element.name.text));
    } else if (ts.isExportAssignment(node)) found.push('default');
    else if (!hasExportModifier(node)) continue;
    else if (ts.isVariableStatement(node)) found.push(...node.declarationList.declarations.map((declaration) => declaration.name.getText(source)));
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name === undefined) found.push('default');
    else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) found.push(node.name!.text);
  }
  return found;
}

/** Every export of a non-test source file that no other file imports; a test file counts as an importer. */
function unusedExports(): string[] {
  const used = new Map<string, Set<string> | null>();
  const importers = [...sources(SRC_ROOT, { tests: true }), ...OUTSIDE_IMPORTERS.flatMap((dir) => sources(path.join(REPO_ROOT, dir), { tests: true, scripts: true }))];
  for (const file of importers) {
    for (const { specifier, names } of loads(file)) {
      const resolved = target(file, specifier);
      if (resolved === null) continue;
      const key = resolved.replace(/\.ts$/, '');
      if (names === null) used.set(key, null);
      else if (used.get(key) !== null) used.set(key, new Set([...(used.get(key) ?? []), ...names]));
    }
  }
  const found: string[] = [];
  for (const file of sources(SRC_ROOT)) {
    const relative = posixRelative(REPO_ROOT, file);
    if (ENTRY_POINTS.has(relative)) continue;
    const users = used.get(file.replace(/\.ts$/, ''));
    if (users === null) continue;
    for (const name of exportedNames(file)) if (!users?.has(name)) found.push(`${relative}: ${name}`);
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

  it('exports only what another file imports', () => {
    assert.deepEqual(unusedExports(), [], 'unused exports: remove the `export`, or delete the symbol');
  });
});
