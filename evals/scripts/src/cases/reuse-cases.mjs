// Reuse cases: the ticket of a real change, asked as "survey what exists before building". The truth is what the
// merged change imported from modules that already existed (types, interfaces, constants, functions), checked
// against the snapshot. The score is how many of those the answer reuses and whether it proposes to create
// something that already exists. Cases go to evals/<project>/reuse (gitignored, NDA).
// Commands: [--list] [--side BE|FE] [--limit <n>] [--benchmarks <absolute dir>].
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BENCH_PROJECTS, BENCHMARKS, CASES_ROOT, casePrefix, PROJECT_CODE_ROOTS, projectCasesDir, projectCodeDir, REUSE_CASES_DIRECTORY, REUSE_EXPORTS_FILE } from '../shared/bench-paths.mjs';
import { baseOf, sideRelFrom, writeBaseScaffold } from './base-scaffold.mjs';
import { casePrompt, graderFiles, parseTicket, peekGraders } from './bench-cases.mjs';
import { walk } from './impact-cases.mjs';

const NOT_CODE = /(\.(spec|test|mock|mocks|stories)\.ts$|\.d\.ts$|\/(mocks?|__mocks__|testing)\/)/;
const MIN_SYMBOLS = 4;
const MAX_SYMBOLS = 14;
const MIN_FOLDERS = 3;

/** Names a TypeScript file exports, of any kind. */
export function exportedNames(text) {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true);
  const names = [];
  for (const node of source.statements) {
    const exported = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
    if (exported && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) names.push(node.name.text);
    else if (exported && ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const e of node.exportClause.elements) names.push(e.name.text);
    }
  }
  return names;
}

/** Per file of a patch, the names its added lines import. */
export function addedImports(patch) {
  const out = [];
  for (const chunk of patch.split(/^diff --git /m).slice(1)) {
    const file = /^a\/(\S+) b\//.exec(chunk)?.[1];
    if (!file) continue;
    const added = chunk.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
    for (const m of added.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g))
      out.push({ file, spec: m[2], names: m[1].split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) });
  }
  return out;
}

/** The module an import names, as a snapshot path; packages and modules the snapshot lacks give null. */
export function resolveModule(from, spec, root, exists) {
  const base = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)) : `${root}/${spec}`;
  const stem = base.replace(/\.(js|ts)$/, '');
  return [`${stem}.ts`, `${stem}/index.ts`].find(exists) ?? null;
}

export function reusedSymbols(patch, { root, absent, read, exists }) {
  const found = new Map();
  for (const imp of addedImports(patch)) {
    if (NOT_CODE.test(`/${imp.file}`)) continue;
    const module = resolveModule(imp.file, imp.spec, root, exists);
    if (module === null || absent.has(module) || NOT_CODE.test(`/${module}`)) continue;
    const here = new Set(exportedNames(read(module)));
    for (const name of imp.names) if (here.has(name) && !found.has(name)) found.set(name, module);
  }
  return found;
}

export function reuseGraderBody() {
  return `---
type: llm
focus: last_message
weight: 1
arm: both
---

The question asked for a survey of existing code before a change is built, ending in a \`## Reuse\` and a \`## New\`
section.

PASS if the final response has a \`## Reuse\` section with at least one bullet.
FAIL if it has none.
`;
}

/** The historical forced reuse arm remains until step 05 migrates this suite. */
export function reusePrompt(name, side, text, { forced = false } = {}) {
  return casePrompt({ name, side, kind: 'reuse', description: "Survey what exists before a real ticket is built, in a real codebase." }, `In the repository at \`repo/\`, the ticket below is about to be implemented.

<ticket>
${text}
</ticket>

Before anyone writes code, survey what already exists. The change must reuse existing types, interfaces, classes,
enums, constants and functions instead of recreating them, and it must not duplicate one under a new name.

End your answer with two sections.
\`## Reuse\`: every existing exported symbol the implementation should use, one bullet each, as
\`- \\\`path/relative/to/repo.ts\\\`: \\\`SymbolName\\\` — why\`.
\`## New\`: the symbols that do not exist yet and must be created, one bullet each, as \`- \\\`NewName\\\` — what it is\`.
Check before you call something new: a symbol that already exists, under any name, belongs under Reuse.
${forced ? '\nUse the ambicode investigate skill for this survey.\n' : ''}
\`repo/\` is the repository under investigation. Change into it with \`cd repo\` before running anything, and run
every command from there.

Answer the question; do not edit anything.
`);
}

function main(argv) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const list = argv.includes('--list');
  const sides = option('--side') ? [option('--side')] : BENCH_PROJECTS;
  const limit = Number(option('--limit', '4'));
  const benchmarks = option('--benchmarks', BENCHMARKS);
  const casesRoot = option('--cases', CASES_ROOT);
  for (const [flag, dir] of [['--benchmarks', benchmarks], ['--cases', casesRoot]]) if (!path.isAbsolute(dir)) throw new Error(`${flag} must be an absolute directory, got ${dir}`);
  for (const side of sides) {
    const out = projectCasesDir(REUSE_CASES_DIRECTORY, side, casesRoot);
    if (!list) {
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
    }
    const root = PROJECT_CODE_ROOTS[side];
    const sideDir = path.join(projectCodeDir(benchmarks, side), root);
    const files = new Set(walk(sideDir).map((f) => `${root}/${f}`));
    const read = (p) => readFileSync(path.join(sideDir, p.slice(root.length + 1)), 'utf8');
    const exports = {};
    for (const f of files) if (!NOT_CODE.test(`/${f}`)) for (const n of exportedNames(read(f))) (exports[n] ??= []).push(f);
    const candidates = [];
    const reviews = path.join(benchmarks, side, 'reviews');
    for (const ticket of readdirSync(reviews, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const asset = path.join(benchmarks, side, 'assets', `${ticket.name}.md`);
      if (!existsSync(asset)) continue;
      const parsed = parseTicket(readFileSync(asset, 'utf8'));
      if (parsed.error || parsed.text.length < 300) continue;
      for (const version of readdirSync(path.join(reviews, ticket.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const dir = path.join(reviews, ticket.name, version.name);
        if (!existsSync(path.join(dir, 'change.patch'))) continue;
        const absentFile = path.join(dir, 'absent.txt');
        const absent = new Set(existsSync(absentFile) ? readFileSync(absentFile, 'utf8').split('\n').filter(Boolean) : []);
        const symbols = reusedSymbols(readFileSync(path.join(dir, 'change.patch'), 'utf8'), { root, absent, read, exists: (p) => files.has(p) });
        const folders = new Set([...symbols.values()].map((p) => path.posix.dirname(p)));
        if (symbols.size >= MIN_SYMBOLS && symbols.size <= MAX_SYMBOLS && folders.size >= MIN_FOLDERS)
          candidates.push({ ticket: ticket.name, dir, text: parsed.text, symbols, folders: folders.size });
      }
    }
    const best = new Map();
    for (const c of candidates) if (!best.has(c.ticket) || best.get(c.ticket).folders < c.folders) best.set(c.ticket, c);
    const chosen = [];
    const covered = new Set();
    // Greedy: a ticket whose symbols are mostly taken by one already chosen would test the same lookups again.
    for (const c of [...best.values()].sort((x, y) => y.folders - x.folders || y.symbols.size - x.symbols.size || x.ticket.localeCompare(y.ticket))) {
      if (chosen.length === limit) break;
      if ([...c.symbols.keys()].filter((n) => covered.has(n)).length > c.symbols.size / 2) continue;
      chosen.push(c);
      for (const n of c.symbols.keys()) covered.add(n);
    }
    console.log(`${side}: ${best.size} tickets qualify, ${chosen.length} chosen`);
    for (const c of chosen) {
      console.log(`  ${c.ticket}: ${c.symbols.size} existing symbols in ${c.folders} folders: ${[...c.symbols.keys()].join(', ')}`);
      if (list) continue;
      for (const forced of [false, true]) {
      const name = `${casePrefix(side)}-reuse-${c.ticket.toLowerCase()}${forced ? '-forced' : ''}`;
      const dir = path.join(out, name);
      mkdirSync(path.join(dir, 'graders'), { recursive: true });
      const graders = { ...graderFiles([], root), 'names-a-true-file.md': reuseGraderBody() };
      delete graders['helper-ran.md'];
      for (const [file, body] of Object.entries({ ...graders, ...peekGraders() })) writeFileSync(path.join(dir, 'graders', file), body);
      writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
      writeFileSync(path.join(dir, 'prompt.md'), reusePrompt(name, side, c.text, { forced }));
      writeBaseScaffold(dir, { sideRel: sideRelFrom(dir, benchmarks, side), ...baseOf(c.dir), withhold: [], setup: null });
      writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ kind: 'reuse', ...(forced ? { variant: 'forced' } : {}), side, ticket: c.ticket, root, truth: [...c.symbols.keys()], definedIn: Object.fromEntries(c.symbols), missingFromSnapshot: [] }, null, 2));
      }
    }
    if (!list) writeFileSync(path.join(out, REUSE_EXPORTS_FILE), JSON.stringify(exports));
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
