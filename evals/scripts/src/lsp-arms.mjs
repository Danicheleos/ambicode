// Builds the two plugin copies of the three-arm LSP eval: `lsp-only` (the control: a language server and
// nothing else) and `ambicode-lsp` (the packaged plugin plus the same server). The eval sandbox loads only
// the plugin under test, so LSP exists in a run only when that plugin declares it (probe 2026-10-02).
// Commands: [--case <name>]... [--out <dir>] [--impact|--reuse]. See evals/evals-core/README.md, "Three arms with LSP".
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS, CASES_LOCK, CURATED_CASES, IMPACT_CASES_DIRECTORY, REUSE_CASES_DIRECTORY, ROOT } from './evals-bench.mjs';

export const LSP_SERVERS = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact', '.mts': 'typescript', '.cts': 'typescript', '.mjs': 'javascript', '.cjs': 'javascript' },
  },
};

// The snapshots carry no root tsconfig, and without one the server builds an inferred project per open file
// and finds references only among the files that file imports. Every arm gets the same one.
export const TSCONFIG_OBJECT = {
  compilerOptions: { target: 'es2022', module: 'commonjs', noEmit: true, skipLibCheck: true, strict: false, experimentalDecorators: true, resolveJsonModule: true, esModuleInterop: true },
  include: ['**/*.ts'],
  exclude: ['node_modules'],
};
// The frontend imports from the code root ("state/auth.facade"), as its own tsconfig's baseUrl allows.
export const tsconfigFor = (root) => JSON.stringify({ ...TSCONFIG_OBJECT, compilerOptions: { ...TSCONFIG_OBJECT.compilerOptions, baseUrl: root } });
const BEFORE_INIT = 'git -C "$REPO" init -q';

export function withTsconfig(scaffold, root) {
  if (!scaffold.includes(BEFORE_INIT)) throw new Error(`scaffold has no "${BEFORE_INIT}" line to put the tsconfig before`);
  return scaffold.replace(BEFORE_INIT, `printf '%s\\n' '${tsconfigFor(root)}' > "$REPO/tsconfig.json"\n${BEFORE_INIT}`);
}

export function localizeCases(casesDir) {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== CASES_LOCK && !entry.name.includes('review'))
    .map((entry) => entry.name)
    .sort();
}

export function buildArms({ out, casesDir, dist, benchmarks, cases = localizeCases(casesDir) }) {
  if (!existsSync(path.join(dist, '.claude-plugin', 'plugin.json'))) throw new Error(`${dist} is not a packaged plugin: run \`npm run package:candidate\` first`);
  rmSync(out, { recursive: true, force: true });
  const arms = {
    'lsp-only': (dir) => {
      mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
      const manifest = { name: 'lsp-only', version: '0.0.0', description: 'Eval control: a TypeScript language server and nothing else.', lspServers: LSP_SERVERS };
      writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    },
    'ambicode-lsp': (dir) => {
      cpSync(dist, dir, { recursive: true });
      const file = path.join(dir, '.claude-plugin', 'plugin.json');
      writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), lspServers: LSP_SERVERS }, null, 2)}\n`);
    },
  };
  for (const [name, make] of Object.entries(arms)) {
    const dir = path.join(out, name);
    make(dir);
    // The harness refuses symlinks under --eval-dir, so cases are real copies; the scaffolds reach the data through
    // `../../../../benchmarks`, one symlink at the plugin root.
    for (const id of cases) {
      const target = path.join(dir, 'evals', 'evals-core', 'cases', id);
      cpSync(path.join(casesDir, id), target, { recursive: true });
      const scaffold = path.join(target, 'scaffold.sh');
      const { root } = JSON.parse(readFileSync(path.join(target, 'truth.json'), 'utf8'));
      writeFileSync(scaffold, withTsconfig(readFileSync(scaffold, 'utf8'), root), { mode: 0o755 });
    }
    symlinkSync(benchmarks, path.join(dir, 'benchmarks'));
  }
  return { arms: Object.keys(arms).map((name) => path.join(out, name)), cases };
}

function main(argv) {
  const cases = [];
  let out = path.join(ROOT, '.tmp', 'lsp-arms');
  let casesDir = CURATED_CASES;
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--case') cases.push(argv[i + 1]);
    else if (argv[i] === '--out') out = path.resolve(argv[i + 1]);
    else if (argv[i] === '--impact' || argv[i] === '--reuse') {
      casesDir = path.join(BENCHMARKS, argv[i] === '--impact' ? IMPACT_CASES_DIRECTORY : REUSE_CASES_DIRECTORY);
      i -= 1;
    }
    else throw new Error(`unknown argument ${argv[i]}; usage: lsp-arms.mjs [--case <name>]... [--out <dir>] [--impact]`);
  }
  const { version } = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const built = buildArms({ out, casesDir, dist: path.join(ROOT, 'dist', `ambicode-${version}`), benchmarks: BENCHMARKS, ...(cases.length ? { cases } : {}) });
  console.log(`built ${built.arms.join(' and ')} with ${built.cases.length} case(s): ${built.cases.join(', ')}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
