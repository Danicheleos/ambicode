// Shared synthetic fixtures; no real benchmark data is read here.
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import path from 'node:path';
import { CURATED_EVAL_DIR } from '../shared/bench-paths.mjs';
import { generate } from '../cases/bench-cases.mjs';
import { createHash } from 'node:crypto';
import { CASES_LOCK } from '../harness/cases-lock.mjs';

export const tally = (xs) => xs.reduce((out, x) => ({ ...out, [x]: (out[x] ?? 0) + 1 }), {});

export const M = ['--model', 'claude-sonnet-5-5', '--max-cost-usd', '1'];

export const CHANGE = `diff --git a/app/orders/service.ts b/app/orders/service.ts
--- a/app/orders/service.ts
+++ b/app/orders/service.ts
@@ -1 +1 @@
-export const total = 0;
+export const total = 2;
diff --git a/app/orders/model.ts b/app/orders/model.ts
new file mode 100644
--- /dev/null
+++ b/app/orders/model.ts
@@ -0,0 +1 @@
+export type Order = { discount: number };
`;

export const ticket = (text, truth) => `# T\n\n## build:context prompt\n\n${text}\n\n## TRUE RELATED CODE\n\n${truth.map((p) => `- \`${p}\``).join('\n')}\n`;

export function frontmatter(file) {
  const source = readFileSync(file, 'utf8');
  return parseYaml(/^---\n([\s\S]*?)\n---/.exec(source)[1]);
}

export const event = (type, extra) => JSON.stringify({ type, ...extra });

export const toolUse = (name, input) => event('assistant', { message: { content: [{ type: 'tool_use', name, input }] } });

export const HELPER = 'node "/p/scripts/ambicode.mjs"';

export const TRACE = [
  event('system', { subtype: 'init', model: 'claude-sonnet-5-5' }),
  toolUse('Skill', { skill: 'ambicode:investigate', args: 'q' }),
  // The skill body is in the trace too, and names the helper: it is not a call.
  event('user', { message: { content: [{ type: 'text', text: `Run ${HELPER} prepare --activity investigate --json` }] } }),
  toolUse('Bash', { command: `cd repo && ${HELPER} prepare --activity investigate --json 2>&1 | head -c 6000` }),
  toolUse('Bash', { command: `${HELPER} prepare --activity investigate --json --term x` }),
  toolUse('Bash', { command: 'cd repo && grep -rn amount src | head -20' }),
  toolUse('Bash', { command: 'sed -n 1,40p src/a.ts; cat src/b.ts' }),
  toolUse('Bash', { command: 'npm test' }),
  toolUse('Bash', { command: `${HELPER} review --branch 2>&1 | tail -150` }),
  event('user', { message: { content: [{ type: 'tool_result', content: 'reviewer    ok — model sonnet, REPLAYED from a recording (no model call)' }] } }),
  toolUse('Read', { file_path: 'src/a.ts' }),
  toolUse('Grep', { pattern: 'x' }),
  'not json',
].join('\n');

export const PAD = ' The steps to reproduce and the acceptance criteria follow in detail.'.repeat(5);

export function syntheticBenchmarks(root, { localize = 6, review = 5 } = {}) {
  const benchmarks = path.join(root, 'evals', 'benchmarks');
  for (const side of ['AA', 'BB']) {
    const base = path.join(benchmarks, side);
    const code = path.join(base, 'project');
    mkdirSync(path.join(code, 'app', 'mod'), { recursive: true });
    mkdirSync(path.join(base, 'assets'), { recursive: true });
    mkdirSync(path.join(code, '.ambicode'), { recursive: true });
    writeFileSync(path.join(code, '.ambicode', 'config.yaml'), 'schemaVersion: 1\n');
    for (let f = 0; f < 3; f++) writeFileSync(path.join(code, 'app', 'mod', `f${f}.ts`), `export const v${f} = ${f};\n`);
    for (let t = 0; t < Math.max(localize, review); t++) {
      const truth = t < localize ? ['app/mod/f0.ts', 'app/mod/f1.ts'] : ['app/mod/f0.ts'];
      writeFileSync(path.join(base, 'assets', `T-${t}.md`), ticket(`Ticket ${t} changes how amounts are computed.${PAD}`, truth));
      if (t >= review) continue;
      const dir = path.join(base, 'reviews', `T-${t}`, `${t}-abcdef12`);
      mkdirSync(path.join(dir, 'base', 'app', 'mod'), { recursive: true });
      writeFileSync(path.join(dir, 'base', 'app', 'mod', 'f0.ts'), 'export const v0 = -1;\n');
      writeFileSync(path.join(dir, 'absent.txt'), '');
      writeFileSync(path.join(dir, 'change.patch'), CHANGE);
      writeFileSync(path.join(dir, 'threads.json'), JSON.stringify([{ path: 'app/mod/f0.ts', newLine: 1, body: `Thread ${t}.` }]));
    }
  }
  return benchmarks;
}

export function syntheticPlugin(root, benchmarks, { name = 'ambicode', pick = { localize: 1, review: 1 } } = {}) {
  const plugin = path.join(root, `plugin-${name}`);
  mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name }));
  const casesDir = path.join(plugin, ...CURATED_EVAL_DIR.split('/'), 'cases');
  generate({ benchmarks, out: casesDir, pick });
  return { plugin, casesDir };
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export const lockEntry = (f) => f.split(path.sep).includes(CASES_LOCK);

export const snapshot = (dir) =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true })
      .filter((f) => !lockEntry(f))
      .sort()
      .map((f) => [f, statSync(path.join(dir, f)).isFile() ? sha256(readFileSync(path.join(dir, f))) : 'dir']),
  );

export const jsonOf = (argv) => argv[argv.indexOf('--json') + 1];

export const neverSpawn = () => {
  throw new Error('spawned');
};
