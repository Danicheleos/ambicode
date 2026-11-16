import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';
import { fencedRanges, planSectionsOf } from '#modules/evidence/task/iterations';

async function check(root: string, body: string | null, params: string[] = [], ticket: string[] = []) {
  const steps = path.join(root, '.ambicode/tasks/t/steps');
  await mkdir(steps, { recursive: true });
  if (body !== null) await writeFile(path.join(steps, '..', 'plan.md'), body);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/plan/scripts/plan-check.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'plan', repositoryRoot: root, taskDir: path.join(root, '.ambicode/tasks/t'), steps, args: {}, params, revise: null, raisedBy: null, headless: false, planSections: planSectionsOf(body ?? ''), planFences: fencedRanges(body ?? ''), captured: await Promise.all(ticket.map(async (content, at) => { const file = path.join(root, `r${at}.json`); await writeFile(file, JSON.stringify({ key: `r${at}`, content })); return { key: `r${at}`, path: file }; })) }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { failed: boolean; anchorsBad: number; anchors?: string[]; requirements?: string[]; requirementsBad?: number; requirementsChecked?: boolean; requirementsReason?: string; } }[]; failed?: { code: string; message: string; recoverable?: boolean; revise?: unknown } };
}

describe('skills/plan/scripts/plan-check.mjs', () => {
  it('accepts anchors that exist, rejects a missing file and a line past the end, and ignores fenced code', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const good = await check(root, '# Plan\n\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.equal(good.failed, undefined);
      assert.equal(good.entries[0]!.summary.anchorsBad, 0);
      const bad = await check(root, '# Plan\n\n`src/invoices/service.ts:900` `src/nope.ts:1` `../outside.ts:1`\n\n```\nsrc/ignored.ts:1\n```\n');
      assert.equal(bad.failed?.code, 'plan-check-failed');
      assert.equal(bad.entries[0]!.summary.anchorsBad, 3);
      assert.match(bad.failed!.message, /^3 bad anchors: src\/invoices\/service\.ts:900 line-out-of-range.*src\/nope\.ts:1 missing-file.*\.\.\/outside\.ts:1 outside-repository$/);
      assert.equal(bad.failed?.revise, undefined, 'a failed check is recorded, never sent back');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a version or an address followed by a line number is not an anchor', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, '# Plan\n\nPin v1.2:3, see 10.0.0.1:80 and 2.4.1:12, but `src/invoices/service.ts:3` is real and `src/nope.ts:1` is not.\n');
      assert.deepEqual(out.entries[0]!.summary.anchors, ['src/nope.ts:1 missing-file']);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a body that was never written fails both modes as plan-body-missing with the path to write, not a crash (a rejected Write once left exit 1 and a lost stack)', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      for (const params of [[], ['resolve']]) {
        const out = await check(root, null, params);
        assert.equal(out.failed?.code, 'plan-body-missing');
        const where = path.join(root, '.ambicode/tasks/t/plan.md');
        assert.ok(out.failed!.message.includes(where), out.failed!.message);
        assert.equal(out.failed!.revise, undefined);
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bad anchor fails the check with the listed anchors in the summary, and a coverage table is not checked', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const bad = await check(root, '# Plan\n\n`src/invoices/service.ts:3-6` `src/invoices/service.ts:999`\n\n| requirement | section | code |\n|---|---|---|\n| totals | Iteration 1 | |\n');
      assert.equal(bad.failed?.code, 'plan-check-failed');
      assert.equal(bad.entries[0]!.summary.anchorsBad, 1);
      assert.match(bad.failed!.message, /1 bad anchors: src\/invoices\/service\.ts:999 line-out-of-range/);
      assert.equal(bad.entries[0]!.summary.anchors?.length, 1);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('an anchor inside a ~~~ fence is neither checked nor resolved, as in a ``` fence', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = '# Plan\n\n~~~\nsrc/ignored.ts:1\ninvoices.ts:1\n~~~\n';
      assert.equal((await check(root, plan)).entries[0]!.summary.anchorsBad, 0);
      assert.deepEqual((await check(root, plan, ['resolve'])).entries, []);
      assert.equal(await readFile(path.join(root, '.ambicode/tasks/t/plan.md'), 'utf8'), plan);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('resolve completes a partial path naming one tracked file and leaves an ambiguous or missing one to the check', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const resolved = await check(root, '# Plan\n\n`invoices.ts:1` and `invoices/service.ts:3-6`\n', ['resolve']);
      assert.match(JSON.stringify(resolved.entries), /invoices\.ts:1 → src\/routes\/invoices\.ts:1; invoices\/service\.ts:3-6 → src\/invoices\/service\.ts:3-6/);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/routes/invoices.ts:1` and `src/invoices/service.ts:3-6`\n');
      const after = await check(root, await readFile(path.join(steps, '..', 'plan.md'), 'utf8'));
      assert.equal(after.failed, undefined);
      // The run that failed: a bare name two files share, in a plan that anchors one of their directories.
      await check(root, '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `service.ts:4`\n', ['resolve']);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/invoices/model.ts:1`; same throw style as `src/invoices/service.ts:4`\n');
      const kept = await check(root, '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n', ['resolve']);
      assert.deepEqual(kept.entries, []);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`service.ts:3` `invoices.ts:900` `nope.ts:1`\n');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bare name that is not a path at the root lists its tracked homes in the bad-anchor reply, and a name nobody tracks lists none', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const bad = await check(root, '# Plan\n\n`service.ts:4` `nope.ts:1`\n');
      assert.match(bad.entries[0]!.summary.anchors![0]!, /^service\.ts:4 ambiguous \(candidates: .*src\/invoices\/service\.ts/);
      assert.equal(bad.entries[0]!.summary.anchors![1], 'nope.ts:1 missing-file');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // k12 1094: `round.py:152` named two tracked files and was reported as missing-file.
  it('a bare name several tracked files share is ambiguous and lists every candidate, a name with one tracked home stays missing-file', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const homes = ['src/domain/round/round.py', 'src/adapters/round.py', 'src/api/round.py', 'src/cli/round.py', 'src/lib/only.py'];
      for (const home of homes) {
        await mkdir(path.dirname(path.join(root, home)), { recursive: true });
        await writeFile(path.join(root, home), 'x = 1\n');
      }
      const git = await new NodeProcessRunner().run({ argv: ['git', 'add', ...homes], cwd: root, timeoutMs: 30_000, maxOutputBytes: 65_536, env: { kind: 'inherited' }, stdin: '' });
      assert.equal(git.exitCode, 0, git.stderr);
      const bad = await check(root, '# Plan\n\n`round.py:152` `only.py:900`\n');
      const [ambiguous, single] = bad.entries[0]!.summary.anchors!;
      assert.match(ambiguous!, /^round\.py:152 ambiguous \(candidates: /);
      for (const home of homes.slice(0, 4)) assert.ok(ambiguous!.includes(home), `${home} missing from: ${ambiguous}`);
      assert.equal(single, 'only.py:900 missing-file (tracked: src/lib/only.py)');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // jvm-chill: the model wrote `domain/src/test/.../GerminationRulesTest.kt:10-12`; exactly one tracked file fits, and resolve returned nothing.
  it('resolve expands an elided path to the one tracked file between its prefix and suffix, and keeps an ambiguous, missing or out-of-range one for the check', async () => {
    const root = await materialized('jvm-gradle-seedvault');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const resolved = await check(root, '# Plan\n\n`domain/src/test/.../GerminationRulesTest.kt:10-12`\n', ['resolve']);
      assert.match(JSON.stringify(resolved.entries), /domain\/src\/test\/\.\.\.\/GerminationRulesTest\.kt:10-12 → domain\/src\/test\/[\w/]+GerminationRulesTest\.kt:10-12/);
      const after = await check(root, await readFile(path.join(steps, '..', 'plan.md'), 'utf8'));
      assert.equal(after.failed, undefined);
      const kept = '# Plan\n\n`domain/.../GerminationRulesTest.kt:9000` `domain/.../Nope.kt:1` `.../build.gradle.kts:1`\n';
      assert.deepEqual((await check(root, kept, ['resolve'])).entries, []);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), kept);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  // 9 of 10 audited plan-check failures were the form of the path, not a missing file.
  it('resolve rewrites an absolute path inside the repository and one led by the repository directory name, and keeps a bad one for the check', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const steps = path.join(root, '.ambicode/tasks/t/steps');
      const name = path.basename(root);
      const resolved = await check(root, `# Plan\n\n\`${root}/src/invoices/service.ts:3-6\` and \`${name}/src/invoices/service.ts:3\`\n`, ['resolve']);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), '# Plan\n\n`src/invoices/service.ts:3-6` and `src/invoices/service.ts:3`\n');
      assert.match(JSON.stringify(resolved.entries), /resolved: /);
      assert.equal((await check(root, await readFile(path.join(steps, '..', 'plan.md'), 'utf8'))).failed, undefined);
      const bad = `# Plan\n\n\`${root}/src/invoices/service.ts:900\` \`${name}/src/nope.ts:1\` \`/etc/hosts.txt:1\`\n`;
      await check(root, bad, ['resolve']);
      assert.equal(await readFile(path.join(steps, '..', 'plan.md'), 'utf8'), bad);
      const checked = await check(root, bad);
      assert.equal(checked.entries[0]!.summary.anchorsBad, 3);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('runs as the plan-check step: the failure is recorded and the route goes on to the gate', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.start();
      await plan.body('# Plan\n\n`src/orders/limit.ts:99`\n');
      const back = await plan.next();
      assert.equal(back.position, 'plan-accept');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('plan-check requirements word for word', () => {
  const TICKET = 'The report lists every overdue invoice with its customer name.\nExports   keep the **column order** of the screen.';
  const plan = (...entries: string[]) => `# Plan\n\n## Requirements\n\n${entries.map((entry) => `- ${entry} (Iteration 1)`).join('\n')}\n\n## Iteration 1: x\n`;
  const run = async (body: string, ticket: string[] = [TICKET]) => {
    const root = await materialized('ts-feature-boundary');
    try { return (await check(root, body, [], ticket)).entries[0]!.summary; } finally { await rm(path.dirname(root), { recursive: true, force: true }); }
  };

  it('a paraphrased entry is a miss showing the plan entry and the closest ticket sentence, recorded without a redraft', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, plan('"The report shows all invoices that are overdue, with customer names"'), [], [TICKET]);
      const summary = out.entries[0]!.summary;
      assert.equal(summary.requirementsBad, 1);
      assert.equal(summary.requirements?.length, 1);
      assert.equal(summary.requirements![0], 'requirement not word for word: plan "The report shows all invoices that are overdue, with customer names" vs ticket "The report lists every overdue invoice with its customer name."');
      assert.equal(summary.anchorsBad, 0);
      assert.equal(out.failed?.revise, undefined);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a long piece and a long ticket line are shown whole, and every missed requirement and bad anchor is listed (eval ledgers: 4 runs with >3 anchors, 12 with >3 requirements, 8 clipped at 240)', async () => {
    const long = `${'long ticket sentence '.repeat(20)}end.`;
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const body = `# Plan\n\n${names.map((n) => `\`src/${n}.ts:1\``).join(' ')}\n\n## Requirements\n\n${names.map((n) => `- "${n} ${long} changed"`).join('\n')}\n\n## Iteration 1: x\n`;
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, body, [], [long]);
      const message = out.failed!.message;
      assert.match(message, /^5 bad anchors, 5 requirements not word for word: /);
      for (const n of names) {
        assert.ok(message.includes(`src/${n}.ts:1 missing-file`), `${n} anchor listed`);
        assert.ok(message.includes(`"${n} ${long} changed"`), `${n} requirement whole`);
      }
      assert.ok(out.entries[0]!.summary.requirements![0]!.includes(`vs ticket "${long}"`), 'closest ticket line whole');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('12 bad anchors and 12 paraphrased requirements are all in the message and the summary', async () => {
    const names = Array.from({ length: 12 }, (_, at) => `n${at}`);
    const body = `# Plan\n\n${names.map((n) => `\`src/${n}.ts:1\``).join(' ')}\n\n## Requirements\n\n${names.map((n) => `- "${n} paraphrase"`).join('\n')}\n\n## Iteration 1: x\n`;
    const root = await materialized('ts-feature-boundary');
    try {
      const out = await check(root, body, [], ['the ticket says something else entirely']);
      assert.match(out.failed!.message, /^12 bad anchors, 12 requirements not word for word: /);
      for (const n of names) assert.ok(out.failed!.message.includes(`src/${n}.ts:1 missing-file`) && out.failed!.message.includes(`"${n} paraphrase"`), `${n} is listed`);
      assert.equal(out.entries[0]!.summary.anchors!.length, 12);
      assert.equal(out.entries[0]!.summary.requirements!.length, 12);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a verbatim entry passes, as does one that differs only in case, whitespace, emphasis or backticks', async () => {
    const summary = await run(plan('"The report lists every overdue invoice with its customer name."', '"exports keep the `column order` of the   screen."', '"Exports keep the column order"'));
    assert.equal(summary.requirementsBad, 0);
    assert.equal(summary.requirementsChecked, true);
    assert.equal(summary.failed, false);
  });

  it('an unquoted bullet is checked as written without its trailing iteration note', async () => {
    const summary = await run('# Plan\n\n## Requirements\n- Exports keep the column order of the screen. (Iterations 1, 2)\n- Reports show overdue invoices only (Iteration 1)\n\n## Iteration 1: x\n');
    assert.equal(summary.requirementsBad, 1);
    assert.match(summary.requirements![0]!, /^requirement not word for word: plan "Reports show overdue invoices only" vs ticket "/);
  });

  it('an already-met note after the iteration note is stripped like it, quoted or not', async () => {
    const summary = await run('# Plan\n\n## Requirements\n- "The report lists every overdue invoice with its customer name." (Iteration 1) (already met: src/report.ts:12)\n- Exports keep the column order of the screen. (Iteration 1) (already met: src/export.ts:3)\n\n## Iteration 1: x\n');
    assert.equal(summary.requirementsBad, 0);
    assert.equal(summary.requirementsChecked, true);
  });

  it('a label-prefixed quoted verbatim ticket sentence counts as word for word, with or without the label in the ticket', async () => {
    const labelled = await run(plan('FR-NOM-1A: "The report lists every overdue invoice with its customer name."'), ['FR-NOM-1A: The report lists every overdue invoice with its customer name.']);
    assert.equal(labelled.requirementsBad, 0);
    assert.equal(labelled.requirementsChecked, true);
    assert.equal((await run(plan('FR-NOM-1A: "The report lists every overdue invoice with its customer name."'))).requirementsBad, 0);
  });

  it('a bullet with quotes is checked per quoted piece: the plan prose around them (label, connectors, notes) is not checked', async () => {
    const ticket = ['The report lists every overdue invoice with its customer name.\nExports keep the column order of the screen.\nA failed export shows a retry button.'];
    const summary = await run(plan('Observed: "The report lists every overdue invoice" and "keep the column order" shown, alongside "A failed export shows a retry button."', '"The report lists" no longer takes district', 'FR-9: "Exports keep the column order of the screen."'), ticket);
    assert.equal(summary.requirementsBad, 0);
    assert.equal(summary.requirementsChecked, true);
  });

  it('a straight-quoted piece holding typographic quotes is one piece, and a straight-quoted aside after it is not read as a piece starting at the closing quote (eval 2026-11-12T08-15-04)', async () => {
    const ticket = ['When the setting is “No,” the system shall open the screen.\nNo path.'];
    const summary = await run('# Plan\n\n## Requirements\n\n- "When the setting is “No,” the system shall open the screen." (Iteration 2; the "No" path is the default)\n\n## Iteration 1: x\n', ticket);
    assert.equal(summary.requirementsBad, 0);
    assert.equal(summary.failed, false);
  });

  it('a label inside the quote is stripped from that piece, even when the ticket puts a title line between the id and the sentence', async () => {
    const ticket = ['FR-ADV-9\n**Overdue list**\nThe report lists every overdue invoice with its customer name.'];
    const summary = await run(plan('"FR-ADV-9: The report lists every overdue invoice with its customer name."'), ticket);
    assert.equal(summary.requirementsBad, 0);
  });

  it('a paraphrase still misses: an unquoted reworded bullet, and a quoted piece not in the ticket (one miss per bullet, naming the missed piece)', async () => {
    const summary = await run(plan('Reports show overdue invoices only', 'Seen: "The report lists" and "shows all invoices that are overdue" and "Exports keep"'));
    assert.equal(summary.requirementsBad, 2);
    assert.match(summary.requirements![1]!, /^requirement not word for word: plan "shows all invoices that are overdue" vs ticket "/);
  });

  it('a heading inside a ~~~ fence does not end ## Requirements, as the shared section rule says', async () => {
    const summary = await run('# Plan\n\n## Requirements\n~~~md\n## Notes\n~~~\n- "Reports show overdue invoices only" (Iteration 1)\n');
    assert.equal(summary.requirementsBad, 1);
  });

  it('resolve picks among same-name files by the directories the plan anchors outside fences, not in example text', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = '# Plan\n\n~~~\n`src/invoices/model.ts:1`\n~~~\n\nsame throw style as `service.ts:4`\n';
      assert.deepEqual((await check(root, plan, ['resolve'])).entries, []);
      assert.equal(await readFile(path.join(root, '.ambicode/tasks/t/plan.md'), 'utf8'), plan);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bullet inside a fence within ## Requirements is example text, not a requirement', async () => {
    for (const fence of ['~~~', '```']) {
      const summary = await run(`# Plan\n\n## Requirements\n- "The report lists every overdue invoice with its customer name." (Iteration 1)\n${fence}md\n- "Never asked for" (Iteration 1)\n${fence}\n`);
      assert.equal(summary.requirementsChecked, true, fence);
      assert.equal(summary.requirementsBad, 0, fence);
    }
  });

  it('an empty bullet is no entry: it neither passes through includes("") nor hides a real miss beside it', async () => {
    const summary = await run('# Plan\n\n## Requirements\n- (Iteration 1)\n- "Reports show overdue invoices only" (Iteration 1)\n');
    assert.equal(summary.requirementsBad, 1);
  });

  it('no captured ticket, or no entry under ## Requirements, is reported as not checked, never as passed', async () => {
    const cases = [[await run(plan('"anything"'), []), 'no captured ticket'], [await run('# Plan\n\nno section\n'), 'no ## Requirements section'], [await run('# Plan\n\n## Requirements\n\nno bullets\n'), 'no entries under ## Requirements'], [await run('# Plan\n\n## Requirements\n- (Iteration 1)\n- ""\n'), 'no entries under ## Requirements']] as const;
    for (const [summary, reason] of cases) {
      assert.equal(summary.requirementsReason, reason);
      assert.equal(summary.requirementsChecked, false);
      assert.equal(summary.requirementsBad, undefined);
      assert.equal(summary.failed, false);
    }
  });
});
