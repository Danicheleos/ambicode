// Real-ticket presets (light, average, large): each source case under `<assets>/presets/<preset>/<case>/` becomes one
// runnable case per skill it is eligible for, in `evals/common/presets/<preset>/<case>-<skill>/` (gitignored, NDA);
// the average preset is the core suite and goes to `evals/common/core/cases/`.
// Only what a run and its score need is written: the prompt, a base-commit scaffold, the truth and the graders. The
// source's file archives are not copied; the scaffold takes the whole base tree from the project's `.git` instead.
//   node evals/scripts/src/cases/preset-cases.mjs [--preset light|average|large] [--regenerate]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS, PRESET_NAMES, PRESETS, PROJECT_CODE_ROOTS, presetCasesDir, ROOT } from '../shared/bench-paths.mjs';
import { CASES_LOCK, withCasesLock } from '../harness/cases-lock.mjs';
import { GENERATION_MARKER, INVESTIGATE_COMMAND, PLAN_COMMAND, PRESET_TASK_COMMAND, PROMPT, REVIEW_COMMAND, SWAP_MARKER, writePluginPrompt } from '../harness/prompt-transport.mjs';
import { sideRelFrom, writeBaseScaffold } from './base-scaffold.mjs';
import { casePrompt, peekGraders, reviewGraderFiles } from './bench-cases.mjs';

/**
 * Per skill: the score kind, the plugin arm's command, the tools and the limits. Investigate keeps the curated
 * localize limits; plan, task and review get the task cases' 80 turns and 1800 s, since a large preset's change
 * runs to 10,321 lines and its review patch past the 1,000 lines the curated 900 s were sized for.
 */
export const PRESET_SKILLS = Object.freeze({
  investigate: { kind: 'localize', command: INVESTIGATE_COMMAND, tools: 'Read, Glob, Grep, Bash, Skill', turns: 40, seconds: 900 },
  // The plan route writes its body with Write (.ambicode/tasks/*/steps/plan-body.md); the graders refuse a write into the code.
  plan: { kind: 'plan', command: PLAN_COMMAND, tools: 'Read, Glob, Grep, Bash, Write, Skill', turns: 80, seconds: 1800 },
  task: { kind: 'task', command: PRESET_TASK_COMMAND, tools: 'Read, Glob, Grep, Bash, Edit, Write, Skill', turns: 80, seconds: 1800 },
  review: { kind: 'review', command: REVIEW_COMMAND, tools: 'Read, Glob, Grep, Bash, Skill', turns: 80, seconds: 1800 },
});

/** The source data sits under `benchmarks/` or `presets/`, the core cases' truth under `evals/common/`; a tool input naming any is a peek. */
export const PRESET_PEEK = 'benchmarks/|presets/|evals/common/';
/** A write under `repo/` whose first segment is not a dot directory, so `.ambicode/` notes pass; no lookahead, whose support the harness does not document. */
const CODE_WRITE = '"file_path":"[^"]*/repo/[^."]';
const TASK_ORACLE = 'oracle.patch';
const REVIEW_PATCH = 'review/change.patch';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function promptFile(name, project, skill, preset, body, walk) {
  const spec = PRESET_SKILLS[skill];
  return casePrompt({ name, side: project, kind: spec.kind, description: `The ${skill} skill on a real ${preset} ticket, in a real codebase.`, walk, tags: [preset] }, `${body.trim()}\n`)
    .replace(/^max_turns: .*$/m, `max_turns: ${spec.turns}`)
    .replace(/^timeout_seconds: .*$/m, `timeout_seconds: ${spec.seconds}`)
    .replace(/^allowed_tools: .*$/m, `allowed_tools: [${spec.tools}]`);
}

/** The judge that hands scoring the final message as its evidence, plus the no-write graders for read-only skills. */
export function fileGraders(truth) {
  const files = {
    'names-a-true-file.md': `---
type: llm
focus: last_message
weight: 3
arm: both
---

The request asked which files a ticket's change would touch. The change that
was actually merged touched these files:

${truth.map((p) => `- \`${p}\``).join('\n')}

PASS if the final response presents at least one of those files as a file the
change would touch. A path written relative to \`repo/\`, with or without a
leading \`./\`, counts as the same file.
FAIL if it names none of them as part of the change.
`,
  };
  for (const tool of ['Edit', 'Write']) files[`no-code-${tool.toLowerCase()}.md`] = `---
type: tool_used
tool: ${tool}
input_match: '${CODE_WRITE}'
min: 0
max: 0
weight: 1
arm: both
---

This skill does not change the code: no ${tool} call on a file under \`repo/\` outside its dot directories (\`.ambicode/\` holds the skill's notes).
`;
  return files;
}

/** The skills a source case is eligible for, in a fixed order. */
export const eligibleSkills = (source) => Object.keys(PRESET_SKILLS).filter((skill) => source.evaluations?.[skill]?.eligible === true);

/**
 * The walkthrough set, `<id>-<skill>` names: per project and skill, the eligible ticket whose merged change touched
 * the fewest files (then the first id). One case per skill and project keeps `evals:walk` few enough to read every trace.
 */
export function walkCases(sources) {
  const walk = new Set();
  const touched = (s) => s.touched ?? Infinity;
  for (const project of [...new Set(sources.map((s) => s.source.project))].sort())
    for (const skill of Object.keys(PRESET_SKILLS)) {
      const pick = sources
        .filter((s) => s.source.project === project && eligibleSkills(s.source).includes(skill))
        .sort((a, b) => touched(a) - touched(b) || a.source.id.localeCompare(b.source.id))[0];
      if (pick) walk.add(`${pick.source.id}-${skill}`);
    }
  return walk;
}

function writeCase(out, { sourceDir, source, skill, preset, benchmarks, walk }) {
  const name = `${source.id}-${skill}`;
  const dir = path.join(out, name);
  const project = source.project;
  const root = PROJECT_CODE_ROOTS[project];
  if (!root) throw new Error(`${source.id}: project ${project} has no code root in PROJECT_CODE_ROOTS`);
  mkdirSync(path.join(dir, 'graders'), { recursive: true });
  const spec = PRESET_SKILLS[skill];
  const evaluation = source.evaluations[skill];
  const base = skill === 'review' ? source.review.base : source.implementation.base;
  if (evaluation.fixture_commit && evaluation.fixture_commit !== base) throw new Error(`${name}: fixture commit ${evaluation.fixture_commit} is not the recorded base ${base}`);
  writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  writeFileSync(path.join(dir, PROMPT), promptFile(name, project, skill, preset, readFileSync(path.join(sourceDir, evaluation.prompt), 'utf8'), walk.has(name)));
  writePluginPrompt(dir, spec.command);
  const common = { kind: spec.kind, preset, side: project, ticket: source.ticket, root };
  let graders;
  if (skill === 'review') {
    const threads = readJson(path.join(sourceDir, evaluation.oracle));
    if (threads.length === 0) throw new Error(`${name}: an eligible review with no thread`);
    mkdirSync(path.join(dir, path.dirname(REVIEW_PATCH)), { recursive: true });
    copyFileSync(path.join(sourceDir, evaluation.input_patch), path.join(dir, REVIEW_PATCH));
    graders = reviewGraderFiles(threads);
    const labels = threads.map((t) => t.classification?.label ?? 'unclassified');
    writeFileSync(path.join(dir, 'truth.json'), `${JSON.stringify({ ...common, version: source.review.version, threads: threads.length, labels }, null, 2)}\n`);
  } else {
    const changed = readJson(path.join(sourceDir, 'oracle', 'changed-files.json'));
    const truth = { ...common, truth: changed.touched, existing: changed.existing_at_base, created: changed.created, deleted: changed.deleted };
    if (skill === 'task') {
      copyFileSync(path.join(sourceDir, 'oracle', 'change.patch'), path.join(dir, TASK_ORACLE));
      truth.oracle = TASK_ORACLE;
      graders = {};
    } else graders = fileGraders(changed.touched);
    writeFileSync(path.join(dir, 'truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
  }
  for (const [file, body] of Object.entries({ ...graders, ...peekGraders(PRESET_PEEK) })) writeFileSync(path.join(dir, 'graders', file), body);
  // The whole tree: tests, manifests and config outside the code root are part of the change and of its checks.
  writeBaseScaffold(dir, { sideRel: sideRelFrom(dir, benchmarks, project), base, root, wholeTree: true, applyPatch: skill === 'review' ? REVIEW_PATCH : null });
  return { name, skill, kind: spec.kind, side: project };
}

/** Rewrites `out` for one preset under its cases lock; an outstanding swap or interrupted generation needs `regenerate`. */
export function generatePreset({ preset, presets = PRESETS, benchmarks = BENCHMARKS, out = presetCasesDir(preset), regenerate = false }) {
  const sourceRoot = path.join(presets, preset);
  if (!existsSync(sourceRoot)) throw new Error(`no preset source at ${sourceRoot}`);
  mkdirSync(out, { recursive: true });
  return withCasesLock(out, 'generate', () => {
    const pending = [SWAP_MARKER, GENERATION_MARKER].filter((marker) => existsSync(path.join(out, marker)));
    if (pending.length && !regenerate) throw new Error(`${out} has ${pending.join(' and ')}: \`restore-prompts\` puts a swap back, \`--regenerate\` recreates the cases`);
    writeFileSync(path.join(out, GENERATION_MARKER), '');
    for (const entry of readdirSync(out)) if (entry !== CASES_LOCK && entry !== GENERATION_MARKER) rmSync(path.join(out, entry), { recursive: true, force: true });
    const written = [];
    const sources = {};
    const ids = readdirSync(sourceRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(sourceRoot, e.name, 'case.json'))).map((e) => e.name).sort();
    const read = ids.map((id) => {
      const sourceDir = path.join(sourceRoot, id);
      const bytes = readFileSync(path.join(sourceDir, 'case.json'));
      const source = JSON.parse(bytes.toString('utf8'));
      if (source.id !== id || source.preset !== preset) throw new Error(`${sourceDir}: case.json names ${source.preset}/${source.id}`);
      sources[id] = `sha256:${sha256(bytes)}`;
      const changed = path.join(sourceDir, 'oracle', 'changed-files.json');
      return { sourceDir, source, touched: existsSync(changed) ? readJson(changed).touched.length : undefined };
    });
    const walk = walkCases(read);
    for (const { sourceDir, source } of read) for (const skill of eligibleSkills(source)) written.push(writeCase(out, { sourceDir, source, skill, preset, benchmarks, walk }));
    const bySkill = Object.fromEntries(Object.keys(PRESET_SKILLS).map((skill) => [skill, written.filter((w) => w.skill === skill).map((w) => w.name)]));
    writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify({ preset, sources, counts: Object.fromEntries(Object.entries(bySkill).map(([s, n]) => [s, n.length])), cases: bySkill, walk: [...walk].sort() }, null, 2)}\n`);
    rmSync(path.join(out, GENERATION_MARKER));
    return { preset, out, written };
  });
}

function main(argv) {
  const option = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const chosen = option('--preset');
  if (chosen !== undefined && !PRESET_NAMES.includes(chosen)) throw new Error(`--preset takes ${PRESET_NAMES.join(', ')}, not ${chosen}`);
  for (const preset of chosen ? [chosen] : PRESET_NAMES) {
    const { out, written } = generatePreset({ preset, regenerate: argv.includes('--regenerate') });
    const counts = Object.entries(Object.groupBy(written, (w) => w.skill)).map(([skill, rows]) => `${skill} ${rows.length}`).join(', ');
    console.log(`${preset}: wrote ${written.length} case(s) to ${path.relative(ROOT, out)} (${counts})`);
  }
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
