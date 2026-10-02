// Impact cases: "I am changing the signature of X; which other files use it?". Ticket-to-files localization is
// a vocabulary search, so every arm greps it (three-arm walk, 2026-10-02) and LSP never gets a chance to matter.
// Here the question is a reference query, and the ground truth is exact: the files the TypeScript language
// service reports as referencing the symbol, under the same tsconfig the eval's language server loads.
// Cases go to benchmarks/impact-cases (gitignored, NDA). Commands: [--list] [--side BE|FE] [--limit <n>].
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BENCHMARKS, graderFiles, IMPACT_CASES_DIRECTORY, peekGraders, regexEscape, scaffoldFile } from './evals-bench.mjs';
import { tsconfigFor } from './lsp-arms.mjs';

const ROOTS = { BE: 'src', FE: 'main' };
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
  for (const file of code)
    for (const symbol of exportedSymbols(file, texts.get(file))) {
      const re = wordIn(symbol.name);
      const mentions = code.filter((f) => f !== file && re.test(texts.get(f)));
      if (mentions.length >= TRUTH_RANGE.min && mentions.length <= 14) candidates.push({ ...symbol, file, mentions });
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
    found.push({ name: candidate.name, file: `${root}/${candidate.file}`, truth: referencing.map((f) => `${root}/${f}`).sort(), lookalikes: lookalikes.map((f) => `${root}/${f}`), hidden: hidden.length });
  }
  return found;
}

/** Name searches get these wrong, so they are the cases where a reference query has something to add. */
export function pickHard(found, limit) {
  const byName = new Map();
  for (const f of found) byName.set(f.name, (byName.get(f.name) ?? 0) + 1);
  const hard = found.filter((f) => byName.get(f.name) === 1 && (f.lookalikes.length >= 1 || f.hidden >= 1));
  hard.sort((a, b) => b.lookalikes.length + b.hidden - (a.lookalikes.length + a.hidden) || a.name.localeCompare(b.name));
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
  return `---
name: ${name}
description: List the files that use one exported function, in a real codebase.
tags: ["bench", "impact", ${JSON.stringify(side.toLowerCase())}]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at \`repo/\`, I am about to change the signature of \`${symbol.name}\`, exported from
\`${symbol.file}\`. Every caller has to be updated, so I need to know which files use it.

Which other existing files use \`${symbol.name}\`? Count a file only if it refers to this symbol. A file that mentions
the same word for something else does not count. Leave out tests and mocks. End your answer with a \`## Files\`
section that lists each file by its path relative to \`repo/\`, one per line as a bullet, with a few words on how it
uses the symbol. The file that defines \`${symbol.name}\` does not belong in the list.

\`repo/\` is the repository under investigation. Change into it with \`cd repo\` before running anything, and run
every command from there.

Answer the question; do not edit anything.
`;
}

export function writeImpactCase(out, side, symbol) {
  const name = `${side.toLowerCase()}-impact-${symbol.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;
  const directory = path.join(out, name);
  mkdirSync(path.join(directory, 'graders'), { recursive: true });
  const root = ROOTS[side];
  const graders = graderFiles(symbol.truth, root);
  graders['names-a-true-file.md'] = graders['names-a-true-file.md']
    .replace("The question asked which existing files a ticket's change would have to touch.\nThe change that was actually merged touched these files:", `The question asked which existing files use \`${symbol.name}\`. These files reference it:`)
    .replace('as a file the\nchange would touch.', 'as a file that uses it.')
    .replace('as part of the change.', 'as a user of the symbol.');
  delete graders['helper-ran.md'];
  for (const [file, body] of Object.entries({ ...graders, ...peekGraders() })) writeFileSync(path.join(directory, 'graders', file), body);
  writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  writeFileSync(path.join(directory, 'prompt.md'), impactPrompt(name, side, symbol));
  writeFileSync(path.join(directory, 'scaffold.sh'), scaffoldFile('../../../../benchmarks/' + side, root), { mode: 0o755 });
  writeFileSync(path.join(directory, 'truth.json'), JSON.stringify({ kind: 'impact', side, ticket: `IMPACT-${symbol.name}`, root, symbol: symbol.name, definedIn: symbol.file, truth: symbol.truth, lookalikes: symbol.lookalikes, missingFromSnapshot: [] }, null, 2));
  return name;
}

function main(argv) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const list = argv.includes('--list');
  const sides = option('--side') ? [option('--side')] : ['BE', 'FE'];
  const limit = Number(option('--limit', '4'));
  const out = path.join(BENCHMARKS, IMPACT_CASES_DIRECTORY);
  if (!list) rmSync(out, { recursive: true, force: true });
  const written = [];
  for (const side of sides) {
    const sideDir = path.join(BENCHMARKS, side, 'src');
    if (!existsSync(sideDir)) throw new Error(`no snapshot at ${sideDir}`);
    const found = analyse(sideDir, ROOTS[side]);
    const chosen = pickHard(found, limit);
    console.log(`${side}: ${found.length} symbols with ${TRUTH_RANGE.min}-${TRUTH_RANGE.max} referencing files, ${chosen.length} chosen`);
    for (const symbol of chosen) {
      console.log(`  ${symbol.name} (${symbol.file}): ${symbol.truth.length} true, ${symbol.lookalikes.length} lookalike, ${symbol.hidden} not found by name`);
      if (!list) written.push(writeImpactCase(out, side, symbol));
    }
  }
  if (!list) console.log(`wrote ${written.length} case(s) to ${out}`);
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
