// Impact cases: "I am changing the signature of X; which other files use it?". Ticket-to-files localization is
// a vocabulary search, so every arm greps it (three-arm walk, 2026-10-02) and LSP never gets a chance to matter.
// Here the question is a reference query, and the ground truth is exact: the files the TypeScript language
// service reports as referencing the symbol, under the same tsconfig the eval's language server loads.
// Only names declared in two or more files qualify: that is where a name search and a reference query disagree.
// Cases go to evals/<project>/impact (gitignored, NDA). Commands: [--list] [--side BE|FE] [--limit <n>] [--benchmarks <absolute dir>] [--cases <absolute dir>].
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BENCH_PROJECTS, BENCHMARKS, CASES_ROOT, casePrefix, IMPACT_CASES_DIRECTORY, PROJECT_CODE_ROOTS, projectCasesDir, projectCodeDir } from '../shared/bench-paths.mjs';
import { DECLARATION_PATTERNS } from '../../../../src/types/modules/ecosystems.ts';
import { INVESTIGATE_COMMAND, writePluginPrompt } from '../harness/prompt-transport.mjs';
import { casePrompt, graderFiles, peekGraders, regexEscape, scaffoldFile } from './bench-cases.mjs';
import { tsconfigFor } from '../arms/lsp-arms.mjs';
import { codeRelFrom } from './base-scaffold.mjs';

const NOT_CODE_UNDER_TEST = /(\.(spec|test|mock|mocks|stories)\.ts$|\.d\.ts$|\/(mocks?|__mocks__|testing)\/)/;
const TRUTH_RANGE = { min: 3, max: 8 };

export function walk(directory, prefix = '') {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(directory, entry.name), relative));
    else if (entry.name.endsWith('.ts')) out.push(relative);
  }
  return out;
}

/** Exported functions, classes and enums, and arrow-function consts: the things whose signature a change alters. */
export function exportedSymbols(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const exported = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  const out = [];
  for (const node of source.statements) {
    if (!exported(node)) continue;
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) out.push({ name: node.name.text, position: node.name.getStart(source) });
    else if (ts.isVariableStatement(node))
      for (const declaration of node.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)))
          out.push({ name: declaration.name.text, position: declaration.name.getStart(source) });
  }
  return out;
}

/** Per name, how many of the files declare it (any declaration, exported or not). */
function countDeclarations(texts, names) {
  const wanted = new Set(names);
  const files = new Map();
  for (const [file, text] of texts)
    for (const line of text.split(/\r?\n/))
      for (const pattern of DECLARATION_PATTERNS) {
        const name = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(line)?.[1];
        if (name !== undefined && wanted.has(name)) files.set(name, (files.get(name) ?? new Set()).add(file));
      }
  return new Map([...files].map(([name, set]) => [name, { declarations: set.size }]));
}

const wordIn = (name) => new RegExp(`(?<![A-Za-z0-9_$])${regexEscape(name)}(?![A-Za-z0-9_$])`);

/**
 * `candidates` are symbols whose name occurs in 3 to 14 other source files, a cheap bound before asking the
 * language service. Each is then resolved exactly. `lookalikes` is what a name search gets wrong: files that
 * contain the word but do not reference this symbol.
 */
export function analyse(sideDir, root) {
  const files = walk(sideDir);
  const code = files.filter((f) => !NOT_CODE_UNDER_TEST.test(`/${f}`));
  const texts = new Map(files.map((f) => [f, readFileSync(path.join(sideDir, f), 'utf8')]));
  const candidates = [];
  const symbols = new Map(code.map((file) => [file, exportedSymbols(file, texts.get(file))]));
  const census = countDeclarations(new Map(code.map((f) => [f, texts.get(f)])), [...new Set([...symbols.values()].flat().map((s) => s.name))]);
  for (const file of code)
    for (const symbol of symbols.get(file)) {
      const declarations = census.get(symbol.name)?.declarations ?? 0;
      if (declarations < 2) continue;
      const re = wordIn(symbol.name);
      const mentions = code.filter((f) => f !== file && re.test(texts.get(f)));
      if (mentions.length >= TRUTH_RANGE.min && mentions.length <= 14) candidates.push({ ...symbol, file, mentions, declarations });
    }
  const absolute = (f) => path.join(sideDir, f);
  const host = {
    getScriptFileNames: () => files.map(absolute),
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
    getCurrentDirectory: () => sideDir,
    getCompilationSettings: () => ts.convertCompilerOptionsFromJson({ ...JSON.parse(tsconfigFor('.')).compilerOptions }, sideDir).options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
  const service = ts.createLanguageService(host);
  const found = [];
  for (const candidate of candidates) {
    const references = service.getReferencesAtPosition(absolute(candidate.file), candidate.position) ?? [];
    const referencing = [...new Set(references.map((r) => path.relative(sideDir, r.fileName).split(path.sep).join('/')))].filter((f) => f !== candidate.file && !NOT_CODE_UNDER_TEST.test(`/${f}`));
    if (referencing.length < TRUTH_RANGE.min || referencing.length > TRUTH_RANGE.max) continue;
    const lookalikes = candidate.mentions.filter((f) => !referencing.includes(f));
    const hidden = referencing.filter((f) => !candidate.mentions.includes(f));
    found.push({ name: candidate.name, file: `${root}/${candidate.file}`, truth: referencing.map((f) => `${root}/${f}`).sort(), lookalikes: lookalikes.map((f) => `${root}/${f}`), hidden: hidden.length, declarations: candidate.declarations });
  }
  return found;
}

/** One case per name: its declaration with the most lookalikes and hidden references, ties by path. */
export function pickHard(found, limit) {
  const score = (f) => f.lookalikes.length + f.hidden;
  const best = new Map();
  for (const f of found) {
    const kept = best.get(f.name);
    if (!kept || score(f) > score(kept) || (score(f) === score(kept) && f.file < kept.file)) best.set(f.name, f);
  }
  const hard = [...best.values()].filter((f) => score(f) >= 1);
  hard.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const chosen = [];
  const folders = new Set();
  for (const f of hard) {
    const folder = f.file.split('/').slice(0, 3).join('/');
    if (folders.has(folder)) continue;
    folders.add(folder);
    chosen.push(f);
    if (chosen.length === limit) break;
  }
  return chosen;
}

export function impactPrompt(name, side, symbol) {
  return casePrompt({ name, side, kind: 'impact', description: "List the files that use one exported function, in a real codebase." }, `In the repository at \`repo/\`, I am about to change the signature of \`${symbol.name}\`, exported from
\`${symbol.file}\`. Every caller has to be updated, so I need to know which files use it.

Which other existing files use \`${symbol.name}\`? Count a file only if it refers to this symbol. A file that mentions
the same word for something else does not count. Leave out tests and mocks. End your answer with a \`## Files\`
section that lists each file by its path relative to \`repo/\`, one per line as a bullet, with a few words on how it
uses the symbol. The file that defines \`${symbol.name}\` does not belong in the list.

\`repo/\` is the repository under investigation. Change into it with \`cd repo\` before running anything, and run
every command from there.

Answer the question; do not edit anything.
`);
}

export function writeImpactCase(out, side, symbol, benchmarks = BENCHMARKS) {
  const name = `${casePrefix(side)}-impact-${symbol.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;
  const directory = path.join(out, name);
  mkdirSync(path.join(directory, 'graders'), { recursive: true });
  const root = PROJECT_CODE_ROOTS[side];
  const graders = graderFiles(symbol.truth, root);
  graders['names-a-true-file.md'] = graders['names-a-true-file.md']
    .replace("The question asked which existing files a ticket's change would have to touch.\nThe change that was actually merged touched these files:", `The question asked which existing files use \`${symbol.name}\`. These files reference it:`)
    .replace('as a file the\nchange would touch.', 'as a file that uses it.')
    .replace('as part of the change.', 'as a user of the symbol.');
  for (const [file, body] of Object.entries({ ...graders, ...peekGraders() })) writeFileSync(path.join(directory, 'graders', file), body);
  writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  writeFileSync(path.join(directory, 'prompt.md'), impactPrompt(name, side, symbol));
  writePluginPrompt(directory, INVESTIGATE_COMMAND);
  writeFileSync(path.join(directory, 'scaffold.sh'), scaffoldFile(codeRelFrom(directory, benchmarks, side), root), { mode: 0o755 });
  writeFileSync(path.join(directory, 'truth.json'), JSON.stringify({ kind: 'impact', side, ticket: `IMPACT-${symbol.name}`, root, symbol: symbol.name, declarations: symbol.declarations, definedIn: symbol.file, truth: symbol.truth, lookalikes: symbol.lookalikes, missingFromSnapshot: [] }, null, 2));
  return name;
}

function main(argv) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const list = argv.includes('--list');
  const sides = option('--side') ? [option('--side')] : BENCH_PROJECTS;
  const limit = Number(option('--limit', '4'));
  const benchmarks = option('--benchmarks', BENCHMARKS);
  const casesRoot = option('--cases', CASES_ROOT);
  for (const [flag, dir] of [['--benchmarks', benchmarks], ['--cases', casesRoot]]) if (!path.isAbsolute(dir)) throw new Error(`${flag} must be an absolute directory, got ${dir}`);
  let cases = 0;
  const written = [];
  const outs = [];
  for (const side of sides) {
    const out = projectCasesDir(IMPACT_CASES_DIRECTORY, side, casesRoot);
    outs.push(out);
    if (!list) rmSync(out, { recursive: true, force: true });
    const sideDir = path.join(projectCodeDir(benchmarks, side), PROJECT_CODE_ROOTS[side]);
    if (!existsSync(sideDir)) throw new Error(`no code root at ${sideDir}`);
    const found = analyse(sideDir, PROJECT_CODE_ROOTS[side]);
    const chosen = pickHard(found, limit);
    console.log(`${side}: ${found.length} symbols with ${TRUTH_RANGE.min}-${TRUTH_RANGE.max} referencing files, ${chosen.length} chosen`);
    for (const symbol of chosen) {
      console.log(`  ${symbol.name} (${symbol.file}): ${symbol.truth.length} true, ${symbol.lookalikes.length} lookalike, ${symbol.hidden} not found by name`);
      if (!list) written.push(writeImpactCase(out, side, symbol, benchmarks));
    }
    console.log(`${side}: ${chosen.length} cases`);
    cases += chosen.length;
  }
  console.log(`estimate: ${cases} cases × 3 runs × 2 arms × $0.18/run ≈ $${(cases * 3 * 2 * 0.18).toFixed(2)} (estimate, not an authorization)`);
  if (!list) console.log(`wrote ${written.length} case(s) to ${outs.join(', ')}`);
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
