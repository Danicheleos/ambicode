// $0 offline: what the plan route delivers as policy before the draft, on real plan.md files.
//   node evals/scripts/policy-plan-bench.mjs --collect   rebuild bench/policy-plan/plans.json from PLAN_ARCHIVE (the eval-archive traces/plugin directory)
//   node evals/scripts/policy-plan-bench.mjs [--out f]   run both setups, print markdown   (also: policy-bench.mjs --plan)
// Delivered: the plan stage on the run's own map paths, whole rules (the packs whose appliesTo match the map's files). Truth: every plan rule that
// resolves on the plan's Changes paths, which is what the plan must cite. A plan with no Changes path has no truth and is counted apart.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bench', 'policy-plan');
const json = (file) => JSON.parse(readFileSync(path.join(DATA, file), 'utf8'));
/** First stamp of the archived runs the bench draws on: the plan cases of 2026-10-26 after the plan route staged policy. */
const FIRST_STAMP = '2026-10-26T14';
const FIXTURE_OF = { 'plan-app': 'ts-app-medium-plan', 'plan-go': 'go-module-parcelhub', 'plan-ts': 'ts-service-lendbox', 'plan-py': 'py-service-tidewatch', 'plan-jvm': 'jvm-gradle-seedvault', 'plan-mono': 'monorepo-rust-ts-kiln' };

/**
 * The files a plan changes: the path of each bullet under a `Changes` marker, with or without backticks, a `:line` span or `new:`.
 * The marker is `Changes:`, `*Changes*:` or `- *Changes*:`; it ends at the next Goal/Checks marker or heading.
 * The first extractor knew only `*Changes*` at column 0 and missed 11 of 84 plans.
 */
export function changesPaths(text) {
  const out = new Set();
  let inside = false;
  for (const line of text.split('\n')) {
    if (/^\s*(?:[-*]\s+)?\*{0,2}Changes\*{0,2}:?\s*$/.test(line) || /^\s*(?:[-*]\s+)?\*{0,2}Changes\*{0,2}:/.test(line)) { inside = true; continue; }
    if (/^\s*(?:[-*]\s+)?\*{0,2}(Checks|Goal)\*{0,2}:?|^#/.test(line)) inside = false;
    if (!inside) continue;
    const match = line.match(/^\s*(?:[-*]|\d+[.)])\s+(?:new:\s*)?`?([\w@./-]+\.[A-Za-z0-9]+)(?::[\d,\- ]+)?`?(?=[\s:,;—-]|$)/);
    if (match !== null && match[1].includes('/')) out.add(match[1].replace(/^\.\//, ''));
  }
  return [...out];
}

/** Pure scoring of one plan. delivered/truth are arrays of rule ids. */
export function scorePlan({ delivered, truth }) {
  const diff = (a, b) => a.filter((id) => !b.includes(id));
  return { missed: diff(truth, delivered), extra: diff(delivered, truth) };
}

const avg = (rows, key) => (rows.length === 0 ? 0 : rows.reduce((total, row) => total + row[key], 0) / rows.length);

/** Averages over plans that have Changes paths; plans without them are counted and left out of every comparison. */
export function aggregatePlans(rows) {
  const scored = rows.filter((row) => row.changes > 0);
  return {
    plans: rows.length, noChanges: rows.length - scored.length, scored: scored.length,
    delivered: avg(scored, 'deliveredN'), truth: avg(scored, 'truthN'), missed: avg(scored, 'missedN'), extra: avg(scored, 'extraN'), bytes: avg(scored, 'bytes'),
    deliveredMax: Math.max(0, ...scored.map((row) => row.deliveredN)), bytesMax: Math.max(0, ...scored.map((row) => row.bytes)),
  };
}

/** Collect from the archive: one entry per plan.md with the ledger's map paths. */
export function collectPlans(archive) {
  const plans = [];
  const stamps = readdirSync(archive).filter((stamp) => stamp >= FIRST_STAMP).sort();
  for (const stamp of stamps) {
    for (const entry of readdirSync(path.join(archive, stamp)).filter((name) => name.startsWith('plan-') && name.endsWith('.ambicode')).sort()) {
      const name = entry.replace('.ambicode', '');
      const prefix = Object.keys(FIXTURE_OF).find((key) => name.startsWith(key));
      const tasks = path.join(archive, stamp, entry, '.ambicode', 'tasks');
      const task = readdirSync(tasks)[0];
      let body;
      try { body = readFileSync(path.join(tasks, task, 'plan.md'), 'utf8'); } catch { continue; }
      const ledger = readFileSync(path.join(tasks, task, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
      const mapPaths = ledger.find((row) => row.kind === 'map')?.paths ?? [];
      if (prefix === undefined) continue;
      plans.push({ id: `${stamp}/${name}`, case: name.replace(/-\d+$/, ''), fixture: FIXTURE_OF[prefix], mapPaths, changes: changesPaths(body) });
    }
  }
  return plans;
}

/** A scratch repository per fixture and setup: the fixture and, for the express setup, the stack packs the fixture declares. */
async function makeWorld(fixtureName, setup, scratchRoot) {
  const dir = path.join(scratchRoot, `${fixtureName}-${setup}`);
  const { materialize } = await import('../../fixtures/materialize.mjs');
  const { fixtureByName } = await import('../../fixtures/definitions.mjs');
  const fixture = fixtureByName(fixtureName);
  await materialize(fixture, dir, { ambicodeInit: true, stackPacks: setup === 'express' && (fixture.stackPacks ?? []).length > 0 });
  return dir;
}

export async function runPlans(setup) {
  const plans = json('plans.json');
  const { createRuntime } = await import('../../src/composition/root.ts');
  const { openWorkspace } = await import('../../src/modules/config/workspace.ts');
  const { resolvePolicyFor } = await import('../../src/modules/policy/resolve-for.ts');
  const { policyStage } = await import('../../src/modules/policy/stage.ts');
  const scratchRoot = mkdtempSync(path.join(os.tmpdir(), 'policy-plan-bench-'));
  const rows = [];
  const worlds = new Map();
  try {
    for (const plan of plans) {
      if (!worlds.has(plan.fixture)) {
        const dir = await makeWorld(plan.fixture, setup, scratchRoot);
        const runtime = await createRuntime({ cwd: dir });
        const workspace = await openWorkspace(runtime);
        worlds.set(plan.fixture, { runtime, workspace, project: workspace.config.projects[0] });
      }
      const { runtime, workspace, project } = worlds.get(plan.fixture);
      const stage = await policyStage({ runtime, project, activity: 'plan', paths: plan.mapPaths, stage: 'before-work' });
      const truth = plan.changes.length === 0 ? [] : (await resolvePolicyFor({ workspace, project, activity: 'plan', paths: plan.changes })).rules.map((rule) => rule.qualifiedId);
      const score = scorePlan({ delivered: stage.entry.ids, truth });
      rows.push({ id: plan.id, case: plan.case, fixture: plan.fixture, changes: plan.changes.length, deliveredN: stage.entry.ids.length, truthN: truth.length, missedN: score.missed.length, extraN: score.extra.length, bytes: stage.bytes });
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
  return rows;
}

const f1 = (value) => value.toFixed(2);
const line = (name, a) => `| ${name} | ${a.plans} | ${a.noChanges} | ${f1(a.delivered)} / ${a.deliveredMax} | ${f1(a.truth)} | ${f1(a.missed)} | ${f1(a.extra)} | ${Math.round(a.bytes)} / ${a.bytesMax} |`;

export function renderPlans(bySetup) {
  const out = ['# Policy plan bench', '', 'Delivered = the plan stage before the draft, on the map paths of the run, whole rules. Truth = every plan rule that resolves on the plan\'s Changes paths (the citations the plan must carry). Missed = in truth, not delivered; extra = delivered, not in truth. Cells with two numbers are mean / max over plans that have Changes paths.', ''];
  for (const [setup, rows] of Object.entries(bySetup)) {
    out.push(`## Setup: ${setup}`, '', '| group | plans | no Changes | delivered | truth | missed | extra | bytes |', '|---|---|---|---|---|---|---|---|');
    out.push(line('all', aggregatePlans(rows)));
    for (const fixture of [...new Set(rows.map((row) => row.fixture))]) out.push(line(fixture, aggregatePlans(rows.filter((row) => row.fixture === fixture))));
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

export async function main(argv) {
  if (argv.includes('--collect')) {
    if (!process.env.PLAN_ARCHIVE) throw new Error('PLAN_ARCHIVE is required: the traces/plugin directory of the eval archive');
    const plans = collectPlans(process.env.PLAN_ARCHIVE);
    writeFileSync(path.join(DATA, 'plans.json'), `${JSON.stringify(plans, null, 1)}\n`);
    process.stdout.write(`${plans.length} plans written to bench/policy-plan/plans.json, ${plans.filter((plan) => plan.changes.length === 0).length} without Changes paths\n`);
    return;
  }
  const text = renderPlans({ shipped: await runPlans('shipped'), express: await runPlans('express') });
  const out = argv.indexOf('--out');
  if (out !== -1) writeFileSync(path.resolve(argv[out + 1]), text);
  process.stdout.write(text);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('policy-plan-bench.mjs')) await main(process.argv.slice(2));
