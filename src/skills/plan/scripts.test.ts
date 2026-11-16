import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';
import { fencedRanges } from '#modules/evidence/task/iterations';

async function check(root: string, body: string | null) {
  const steps = path.join(root, '.ambicode/tasks/t/steps');
  await mkdir(steps, { recursive: true });
  if (body !== null) await writeFile(path.join(steps, '..', 'plan.md'), body);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/plan/scripts/plan-check.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'plan', repositoryRoot: root, taskDir: path.join(root, '.ambicode/tasks/t'), steps, args: {}, params: [], revise: null, raisedBy: null, headless: false, planFences: fencedRanges(body ?? '') }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  const out = JSON.parse(outcome.stdout) as { entries: { worker?: string; summary?: unknown }[]; payload?: string; failed?: { code: string; message: string; recoverable?: boolean; revise?: unknown } };
  // `entries` keeps the anchor rows; the claims row and list are read through `claims` and `payload`.
  return { ...out, entries: out.entries.filter((entry) => entry.worker !== 'plan-claims'), claims: out.entries.find((entry) => entry.worker === 'plan-claims')?.summary as { claims: number; unbacked: number; uncitedMap: number | null } | undefined };
}

describe('skills/plan/scripts/plan-check.mjs', () => {
  it('a body that was never written fails as plan-body-missing with the path to write, not a crash (a rejected Write once left exit 1 and a lost stack)', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, null);
      assert.equal(out.failed?.code, 'plan-body-missing');
      const where = path.join(root, '.ambicode/tasks/t/plan.md');
      assert.ok(out.failed!.message.includes(where), out.failed!.message);
      assert.equal(out.failed!.revise, undefined);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bad anchor is not a failure: paths are resolved, not checked', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\n`src/invoices/service.ts:900` `src/nope.ts:1` `../outside.ts:1`\n');
      assert.equal(out.failed, undefined);
      assert.deepEqual(out.entries, []);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('an anchor inside a ~~~ fence is not resolved, as in a ``` fence', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = '# Plan\n\n~~~\nsrc/ignored.ts:1\ninvoices.ts:1\n~~~\n';
      assert.deepEqual((await check(root, plan)).entries, []);
      assert.equal(await readFile(path.join(root, '.ambicode/tasks/t/plan.md'), 'utf8'), plan);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('completes a partial path naming one tracked file and leaves an ambiguous or missing one as written', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const resolved = await check(root, '# Plan\n\n`invoices.ts:1` and `invoices/service.ts:3-6`\n');
      assert.match(JSON.stringify(resolved.entries), /invoices\.ts:1 → src\/routes\/invoices\.ts:1; invoices\/service\.ts:3-6 → src\/invoices\/service\.ts:3-6/);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/routes/invoices.ts:1` and `src/invoices/service.ts:3-6`\n');
      assert.deepEqual((await check(root, await readFile(path.join(steps, '..', 'plan.md'), 'utf8'))).entries, []);
      // The run that failed: a bare name two files share, in a plan that anchors one of their directories.
      await check(root, '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `service.ts:4`\n');
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `src/invoices/service.ts:4`\n');
      const kept = await check(root, '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n');
      assert.deepEqual(kept.entries, []);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // jvm-chill: the model wrote `domain/src/test/.../GerminationRulesTest.kt:10-12`; exactly one tracked file fits, and resolve returned nothing.
  it('expands an elided path to the one tracked file between its prefix and suffix, and keeps an ambiguous, missing or out-of-range one as written', async () => {
    const root = await materialized('jvm-gradle-seedvault');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const resolved = await check(root, '# Plan\n\n`domain/src/test/.../GerminationRulesTest.kt:10-12`\n');
      assert.match(JSON.stringify(resolved.entries), /domain\/src\/test\/\.\.\.\/GerminationRulesTest\.kt:10-12 → domain\/src\/test\/[\w/]+GerminationRulesTest\.kt:10-12/);
      assert.deepEqual((await check(root, await readFile(path.join(steps, '..', 'plan.md'), 'utf8'))).entries, []);
      const kept = '# Plan\n\n`domain/.../GerminationRulesTest.kt:9000` `domain/.../Nope.kt:1` `.../build.gradle.kts:1`\n';
      assert.deepEqual((await check(root, kept)).entries, []);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), kept);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // 9 of 10 audited plan-check failures were the form of the path, not a missing file.
  it('rewrites an absolute path inside the repository and one led by the repository directory name, and keeps a bad one as written', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const name = path.basename(root);
      const resolved = await check(root, `# Plan\n\n\`${root}/src/invoices/service.ts:3-6\` and \`${name}/src/invoices/service.ts:3\`\n`);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.match(JSON.stringify(resolved.entries), /resolved: /);
      const bad = `# Plan\n\n\`${root}/src/invoices/service.ts:900\` \`${name}/src/nope.ts:1\` \`/etc/hosts.txt:1\`\n`;
      await check(root, bad);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), bad);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('picks among same-name files by the directories the plan anchors outside fences, not in example text', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = '# Plan\n\n~~~\n`src/invoices/model.ts:1`\n~~~\n\nsame throw style as `service.ts:4`\n';
      assert.deepEqual((await check(root, plan)).entries, []);
      assert.equal(await readFile(path.join(root, '.ambicode/tasks/t/plan.md'), 'utf8'), plan);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('lists the only/no-other claims of the plan prose with their backing, not fenced lines or ## Requirements quotes', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = [
        '# Plan', '', '## Requirements', '- "there is only one list" (Iteration 1)', '', '## Iteration 1: x', '',
        'The only wizard auto-open today is openRequiredWizards.',
        'No other caller of applyDiscount (Grep applyDiscount in src/, all 3 hits read). A second sentence; it has a plain one.',
        '```', 'no caller here', '```', 'Plain here.', '- *Checks*: none',
        'No test beside src/orders/invoice.ext (Glob src/orders/*invoice*).',
      ].join('\n');
      const out = await check(root, plan);
      assert.deepEqual(out.claims, { claims: 3, unbacked: 1, uncitedMap: null });
      assert.equal(out.payload, [
        '## Claims to check (3)',
        '1. plan.md:8 "The only wizard auto-open today is openRequiredWizards." — backing: none',
        '   hits: none',
        '2. plan.md:9 "No other caller of applyDiscount (Grep applyDiscount in src/, all 3 hits read)." — backing: (Grep applyDiscount in src/, all 3 hits read)',
        '   hits: none',
        '3. plan.md:15 "No test beside src/orders/invoice.ext (Glob src/orders/*invoice*)." — backing: (Glob src/orders/*invoice*)',
        '   hits: none',
      ].join('\n'));
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a label line is read after its `*Label*:` prefix: a Goal claim is listed, `*Checks*: none` is not', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\n- *Goal*: The only change is the page size.\n- *Checks*: none\n');
      assert.equal(out.payload, '## Claims to check (1)\n1. plan.md:3 "The only change is the page size." — backing: none\n   hits: no identifier in the claim');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a marker inside a backtick span or in an `only when/if/after/once/for/while` condition is no claim; `The only auto-open is X` is', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\nlaunch only when the flag is false.\nOpen it only if the user asks, only after load, only once, only for admins, only while idle.\nthe helper `a only b` stays.\nThe only auto-open is X.\n');
      assert.equal(out.payload, '## Claims to check (1)\n1. plan.md:6 "The only auto-open is X." — backing: none\n   hits: no identifier in the claim');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a claim lists the tracked lines that hold its identifiers as `path:line:` hits; a claim with none says so', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\nThe only reader of amountCents is the total.\nNo handler exists for nothingAtAll_here.\nThe only thing here is plain.\n');
      assert.match(out.payload ?? '', /"The only reader of amountCents is the total\." — backing: none\n {3}hits \(4 total, 4 shown\):\n(?: {5}.*\n)* {5}src\/invoices\/service\.ts:4: .*amountCents/);
      assert.match(out.payload ?? '', /nothingAtAll_here\.".*\n {3}hits: none\n/);
      assert.match(out.payload ?? '', /plain\."[^\n]*\n {3}hits: no identifier in the claim$/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a dotted file name is an identifier, and an untracked file holds hits like a tracked one; the run folder never does', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await writeFile(path.join(root, 'src/fresh.ts'), "import 'en.original.json';\n");
      const out = await check(root, '# Plan\n\nOnly en.json and en.original.json are edited.\n');
      assert.match(out.payload ?? '', /edited\."[^\n]*\n {3}hits \(1 total, 1 shown\):\n {5}src\/fresh\.ts:1: import 'en\.original\.json';$/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a map candidate is cited by its full path or its bare file name, not by another file that ends the same', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      await mkdir(steps, { recursive: true });
      const rows = ['src/legacy/service.ts', 'src/a.ts', 'src/routes/users.ts', 'src/invoices/model.ts'].map((file) => [file, 1, ['x']]);
      await writeFile(path.join(steps, '1-map.md'), `l1\nl2\nl3\n${JSON.stringify({ candidates: rows })}\n`);
      const out = await check(root, '# Plan\n\nChange `src/invoices/service.ts:3` and data.ts and `users.ts`.\nAlso src/invoices/model.ts.\n');
      assert.equal(out.claims?.uncitedMap, 2);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a map row that does not parse gives a null uncitedMap and no map section in the payload', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      await mkdir(steps, { recursive: true });
      await writeFile(path.join(steps, '1-map.md'), 'l1\nl2\nl3\n{"candidates":[["src/a.ts",1,["x"\n');
      const out = await check(root, '# Plan\n');
      assert.equal(out.claims?.uncitedMap, null);
      assert.equal(out.payload, '## Claims to check (0)');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('counts the map candidates whose file the plan never names in the summary, null when there is no map file', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const map = (...rows: unknown[][]) => `legend 1\nlegend 2\nlegend 3\n${JSON.stringify({ candidates: rows })}\n`;
      await mkdir(steps, { recursive: true });
      await writeFile(path.join(steps, '1-map.md'), map(['src/stale.ts', 1, ['x']]));
      await writeFile(path.join(steps, '2-map.md'), map(['src/invoices/service.ts', 9, ['a'], ['3-6']], ['src/legacy/invoice-export.ts', 5, ['b'], ['10', '20-22']], ['src/reports/monthly.ts', 4, ['c']]));
      const out = await check(root, '# Plan\n\nChange `src/invoices/service.ts:3`.\nAlso monthly.ts.\n');
      assert.equal(out.claims?.uncitedMap, 1);
      await rm(path.join(steps, '2-map.md'));
      await rm(path.join(steps, '1-map.md'));
      assert.equal((await check(root, '# Plan\n')).claims?.uncitedMap, null);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('`No spec exists`, `I found no test` and `no difference` sentences are claims', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\nNo spec exists beside the service.\nI found no test for it.\nIt mirrors the old one with no difference.\nNothing calls it.\n');
      assert.deepEqual(out.claims, { claims: 4, unbacked: 4, uncitedMap: null });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a plan with no such sentence lists no claims', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\n`src/invoices/service.ts:3` is called by the route.\n');
      assert.equal(out.payload, '## Claims to check (0)');
      assert.deepEqual(out.claims, { claims: 0, unbacked: 0, uncitedMap: null });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('runs as the plan-check step: the partial path is completed in plan.md and the route goes on to the gate', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.start();
      await plan.body('# Plan\n\n`limit.ts:1`\n');
      const next = await plan.next();
      assert.equal(next.position, 'plan-accept');
      assert.equal(await readFile(path.join(plan.fx.repo.root, '.ambicode/tasks', PLAN_TASK, 'plan.md'), 'utf8'), '# Plan\n\n`src/orders/limit.ts:1`\n');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).filter((entry) => entry['worker'] === 'plan-anchors').length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});
