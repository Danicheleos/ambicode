import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';

async function check(root: string, body: string | null, params: string[] = [], required: string[] | null = null) {
  const steps = path.join(root, '.ambicode/tasks/t/steps');
  await mkdir(steps, { recursive: true });
  if (required !== null) await writeFile(path.join(steps, '..', 'ledger.jsonl'), `${JSON.stringify({ id: '1', at: 't', kind: 'policy', stage: 'required', ids: required })}\n`);
  if (body !== null) await writeFile(path.join(steps, '..', 'plan.md'), body);
  const outcome = await new NodeProcessRunner().run({
    argv: [process.execPath, path.join(REPO_ROOT, 'skills/plan/scripts/plan-check.mjs')],
    cwd: root,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
    stdin: JSON.stringify({ task: 't', skill: 'plan', repositoryRoot: root, taskDir: path.join(root, '.ambicode/tasks/t'), steps, args: {}, params, revise: null, raisedBy: null, headless: false }),
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  return JSON.parse(outcome.stdout) as { entries: { summary: { failed: boolean; anchorsBad: number; anchors?: string[]; policyMissing?: string[]; policyRepeated?: string[] } }[]; failed?: { code: string; message: string; recoverable?: boolean; revise?: { args: Record<string, string[]> } } };
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
      assert.equal(bad.failed?.revise?.args['bad anchors']?.length, 3);
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
        assert.deepEqual(out.failed!.revise, { args: { 'plan body': [out.failed!.message] } });
      }
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a bad anchor fails the check with the listed anchors as revise args, and a coverage table is not checked', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const bad = await check(root, '# Plan\n\n`src/invoices/service.ts:3-6` `src/invoices/service.ts:999`\n\n| requirement | section | code |\n|---|---|---|\n| totals | Iteration 1 | |\n');
      assert.equal(bad.failed?.code, 'plan-check-failed');
      assert.equal(bad.entries[0]!.summary.anchorsBad, 1);
      assert.match(bad.failed!.message, /1 bad anchors: src\/invoices\/service\.ts:999 line-out-of-range/);
      assert.deepEqual(bad.failed!.revise, { args: { 'bad anchors': bad.entries[0]!.summary.anchors } });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  const REQUIRED = ['common-design/need', 'common-design/scope'];
  const ANCHORED = '`src/invoices/service.ts:3-6`';

  it('a delivered rule the Changes paths reach must be cited: a missing id fails with its name, applied-at and not-applicable both pass', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const none = await check(root, `# Plan\n\n${ANCHORED}\n`, [], REQUIRED);
      assert.equal(none.failed?.code, 'plan-check-failed');
      assert.deepEqual(none.entries[0]!.summary.policyMissing, REQUIRED);
      assert.equal(none.entries[0]!.summary.anchorsBad, 0);
      assert.match(none.failed!.message, /^2 policy rules not cited: common-design\/need, common-design\/scope$/);
      assert.deepEqual(Object.keys(none.failed!.revise!.args), ['policy citations']);
      assert.deepEqual(none.failed!.revise!.args['policy citations']!.slice(1), REQUIRED);
      const one = await check(root, `# Plan\n\n${ANCHORED}\n\n## Policies\n- common-design/need: applied at src/invoices/service.ts:3\n`, [], REQUIRED);
      assert.deepEqual(one.entries[0]!.summary.policyMissing, ['common-design/scope']);
      const both = await check(root, `# Plan\n\n${ANCHORED}\n\n## Policies\n- \`common-design/need\`: applied at src/invoices/service.ts:3\n- common-design/scope: not applicable: no new surface\n`, [], REQUIRED);
      assert.equal(both.failed, undefined);
      assert.equal(both.entries[0]!.summary.policyMissing, undefined);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a rule cited on two lines fails recoverably through the same revise, naming the id; one line with several locations passes', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const once = await check(root, `# Plan\n\n${ANCHORED}\n\n## Policies\ncommon-design/need: applied at src/invoices/service.ts:3, src/invoices/service.ts:5\ncommon-design/scope: not applicable: none\n`, [], REQUIRED);
      assert.equal(once.failed, undefined);
      const twice = await check(root, `# Plan\n\n${ANCHORED}\n\n## Policies\ncommon-design/need: applied at src/invoices/service.ts:3\ncommon-design/need: applied at src/invoices/service.ts:5\ncommon-design/scope: not applicable: none\n`, [], REQUIRED);
      assert.equal(twice.failed?.code, 'plan-check-failed');
      assert.equal(twice.failed?.recoverable, true);
      assert.deepEqual(twice.entries[0]!.summary.policyRepeated, ['common-design/need']);
      assert.equal(twice.entries[0]!.summary.policyMissing, undefined);
      assert.match(twice.failed!.message, /^1 policy rules cited on more than one line: common-design\/need$/);
      assert.deepEqual(Object.keys(twice.failed!.revise!.args), ['policy citations']);
      const accepted = await check(root, `# Plan\n\n${ANCHORED}\n\ncommon-design/need: applied at src/invoices/service.ts:3\ncommon-design/need: not applicable: x\ncommon-design/scope: not applicable: none\n`, ['accept'], REQUIRED);
      assert.equal(accepted.failed, undefined);
      assert.deepEqual(accepted.entries[0]!.summary.policyRepeated, ['common-design/need']);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a rule applied to a file the plan creates is cited by its path alone; an existing file, or a new one the plan never names, still needs path:line', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const plan = (cite: string): string => `# Plan\n\n${ANCHORED} and \`new: src/invoices/csv.ts\`\n\n## Policies\n${cite}\ncommon-design/scope: not applicable: none\n`;
      const created = await check(root, plan('common-design/need: applied at src/invoices/csv.ts'), [], REQUIRED);
      assert.equal(created.failed, undefined, JSON.stringify(created.failed));
      const mixed = await check(root, plan('common-design/need: applied at src/invoices/service.ts:3, src/invoices/csv.ts'), [], REQUIRED);
      assert.equal(mixed.failed, undefined);
      const existing = await check(root, plan('common-design/need: applied at src/invoices/service.ts'), [], REQUIRED);
      assert.deepEqual(existing.entries[0]!.summary.policyMissing, ['common-design/need']);
      const unnamed = await check(root, `# Plan\n\n${ANCHORED}\n\ncommon-design/need: applied at src/invoices/other.ts\ncommon-design/scope: not applicable: none\n`, [], REQUIRED);
      assert.deepEqual(unnamed.entries[0]!.summary.policyMissing, ['common-design/need']);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('a citation needs an anchor after "applied at" and a reason after "not applicable", and one inside a fence does not count', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const weak = [`# Plan\n\n${ANCHORED}\n`, 'common-design/need: applied', 'common-design/scope: not applicable:', '```', 'common-design/need: not applicable: fenced', '```', ''].join('\n');
      const out = await check(root, weak, [], REQUIRED);
      assert.deepEqual(out.entries[0]!.summary.policyMissing, REQUIRED);
      const prefixed = await check(root, `# Plan\n\n${ANCHORED}\nx/common-design/need: not applicable: other\ncommon-design/scope: not applicable: none\n`, [], REQUIRED);
      assert.deepEqual(prefixed.entries[0]!.summary.policyMissing, ['common-design/need'], 'an id inside a longer path is not the rule');
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('an applied-at citation with a bad anchor is a bad anchor, and a bad anchor plus a missing citation fail together in one revise', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const body = `# Plan\n\n${ANCHORED}\n\ncommon-design/need: applied at src/invoices/service.ts:999\ncommon-design/scope: not applicable: none\n`;
      const bad = await check(root, body, [], REQUIRED);
      assert.equal(bad.entries[0]!.summary.anchorsBad, 1);
      assert.equal(bad.entries[0]!.summary.policyMissing, undefined);
      assert.deepEqual(Object.keys(bad.failed!.revise!.args), ['bad anchors']);
      const mixed = await check(root, `# Plan\n\n${ANCHORED} \`src/invoices/service.ts:999\`\n`, [], REQUIRED);
      assert.deepEqual(Object.keys(mixed.failed!.revise!.args), ['bad anchors', 'policy citations']);
      assert.match(mixed.failed!.message, /^1 bad anchors: .*; 2 policy rules not cited: /);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('nothing is required without a recorded required entry or with an empty one, and accept records the missing ids without failing', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      assert.equal((await check(root, `# Plan\n\n${ANCHORED}\n`)).failed, undefined);
      assert.equal((await check(root, `# Plan\n\n${ANCHORED}\n`, [], [])).failed, undefined);
      const accepted = await check(root, `# Plan\n\n${ANCHORED}\n`, ['accept'], REQUIRED);
      assert.equal(accepted.failed, undefined);
      assert.deepEqual(accepted.entries[0]!.summary.policyMissing, REQUIRED);
      assert.equal(accepted.entries[0]!.summary.failed, true);
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
      assert.match(bad.entries[0]!.summary.anchors![0]!, /^service\.ts:4 missing-file \(tracked: .*src\/invoices\/service\.ts/);
      assert.equal(bad.entries[0]!.summary.anchors![1], 'nope.ts:1 missing-file');
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

  it('runs as the plan-check step: the failure sends the route back to draft', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.start();
      await plan.body('# Plan\n\n`src/orders/limit.ts:99`\n');
      const back = await plan.next();
      assert.equal(back.position, 'draft');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});
