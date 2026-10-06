import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs } from '#cli/args';
import { runPolicyCheck, POLICY_CHECK_OPTIONS } from '#cli/commands/policy/policy-check';
import { routeTools } from '#cli/commands/route/route';
import { runRulesApply, runRulesRevert, RULES_APPLY_OPTIONS, RULES_REVERT_OPTIONS } from '#cli/commands/policy/rules';
import { createRuntime } from '#composition/root';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { initConfig } from '#testing/fixtures/init-config';
import { readLedger } from '#modules/evidence/ledger/ledger';
import { REPO_ROOT } from '#testing/paths';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';

const SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'rules-1';
const QUOTE = 'Services must never call the transport layer directly.';
const SECOND = 'Every service function has a test beside it.';
const GUIDE = `# Contributing\n\nWe keep layers apart.\n${QUOTE}\n${SECOND}\n`;
const BAD = 'Controllers must never touch the database.';

const rule = (id: string, instruction: string, quote: string): string =>
  [`  - id: ${id}`, '    category: architecture', `    instruction: ${JSON.stringify(instruction)}`, '    check: { kind: reviewer, explanation: judged from the diff }', '    source:', `      quote: ${JSON.stringify(quote)}`, '      location: CONTRIBUTING.md'].join('\n');
const pack = (id: string, rules: readonly string[], glob = 'src/users/**'): string =>
  ['schemaVersion: 1', `id: ${id}`, 'authority: team', 'appliesTo:', `  - "${glob}"`, 'activities: [review]', 'source:', '  location: CONTRIBUTING.md', 'rules:', ...rules, ''].join('\n');
const GOOD = pack('team-services', [rule('no-direct-transport', 'Keep services apart from the transport layer.', QUOTE), rule('tests-beside', 'Pair every service function with a test.', SECOND)]);

async function materialize(name: string): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-rules-')), 'repo');
  const outcome = await new NodeProcessRunner().run({ argv: ['node', path.join(REPO_ROOT, 'fixtures', 'materialize.mjs'), name, destination], cwd: REPO_ROOT, timeoutMs: 60_000, maxOutputBytes: 262_144, env: { kind: 'inherited' } });
  assert.equal(outcome.exitCode, 0, `materializing ${name} failed: ${outcome.stderr}${outcome.failure ?? ''}`);
  return destination;
}

async function world(options: { text?: string; headless?: boolean } = {}) {
  const root = await materialize('ts-feature-boundary');
  await writeFile(path.join(root, 'CONTRIBUTING.md'), GUIDE);
  const runtime: Runtime = await createRuntime({ cwd: root });
  await initConfig(runtime);
  const scratchpadDir = await runtime.fs.temporaryDirectory('ambicode-scratch-');
  const { engine } = await routeTools(runtime, null);
  const ledger = (task = TASK): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'task', task));
  const kinds = async (kind: string): Promise<LedgerEntry[]> => (await ledger()).filter((entry) => entry.kind === kind);
  const draft = (name: string, text: string): Promise<void> => writeFile(path.join(root, '.ambicode', 'policies', 'drafts', name), text).catch(async () => {
    await runtime.fs.mkdirp(path.join(root, '.ambicode', 'policies', 'drafts'));
    await writeFile(path.join(root, '.ambicode', 'policies', 'drafts', name), text);
  });
  const w = {
    root,
    runtime,
    ledger,
    kinds,
    draft,
    start: (input: Partial<Parameters<typeof engine.start>[0]> = {}) =>
      engine.start({ skill: 'rules', text: options.text ?? 'CONTRIBUTING.md', requirements: [], task: TASK, cwd: root, session: SESSION, channel: 'hook', scratchpadDir, ...(options.headless === true ? { headless: true } : {}), ...input }),
    /** A hook-bound answer to the latest print of a gate, as the AskUserQuestion hook records it. */
    async answer(gate: string, option: string) {
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === gate)!;
      return engine.advance({ task: TASK, session: SESSION, cause: 'gate-hook', answers: [{ gate, option, instance: print.id }], scratchpadDir });
    },
    check: (extra: readonly string[] = ['--task', TASK]) => runPolicyCheck(runtime, parseArgs('policy check', ['--drafts', ...extra], POLICY_CHECK_OPTIONS)),
    apply: () => runRulesApply(runtime, parseArgs('rules apply', ['--task', TASK], RULES_APPLY_OPTIONS)),
    revert: (id: string) => runRulesRevert(runtime, parseArgs('rules revert', [id], RULES_REVERT_OPTIONS)),
    config: () => readFile(path.join(root, '.ambicode', 'config.yaml'), 'utf8'),
    exists: (relative: string) => runtime.fs.exists(path.join(root, relative)),
    position: async () => (await engine.status(TASK, SESSION))[0]?.position,
    dispose: async () => {
      await rm(path.dirname(root), { recursive: true, force: true });
      await runtime.fs.remove(scratchpadDir);
    },
  };
  return w;
}

const codeOf = (promise: Promise<unknown>): Promise<{ code?: string; details?: string[] }> => promise.then(() => ({}), (error: { code?: string; details?: string[] }) => error);

/** Start, choose the sources, and leave the route at the draft step. */
async function atDraft(w: Awaited<ReturnType<typeof world>>) {
  const first = await w.start();
  assert.equal(first.position, 'sources');
  return { first, draftStep: await w.answer('sources', 'use these sources') };
}

/** Three failing checks of a permanently bad quote: the route moves forward to the table. */
async function exhaust(w: Awaited<ReturnType<typeof world>>) {
  await atDraft(w);
  let next: string | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) next = (await w.check()).next;
  return next!;
}

describe('09-T2: B13 the disposition and the ledger cap', () => {
  it('09-T2: a disposition far over the ledger-entry cap still reaches rules-table', async () => {
    const w = await world();
    try {
      await atDraft(w);
      for (let pid = 0; pid < 5; pid += 1) {
        const rules = Array.from({ length: 70 }, (_, n) => rule(`rule-${n}`, `Keep boundary ${pid}-${n} in the service layer.`, QUOTE));
        await w.draft(`services-${pid}.yaml`, pack(`team-services-${pid}`, rules));
      }
      const checked = await w.check();
      assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
      assert.equal(await w.position(), 'rules-table');
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T1: the rules route', () => {
  it('09-T1: discover lists the candidates at the sources gate, whose default stops the route', async () => {
    const w = await world();
    try {
      const { first, draftStep } = await atDraft(w);
      assert.match(first.text, /Rule sources found: CONTRIBUTING\.md/);
      assert.match(first.text, /default if nobody answers/);
      assert.equal(draftStep.position, 'draft');
      assert.match(draftStep.text, /Write rule drafts/);
      assert.match(draftStep.text, /Projects \(pass --project/);
    } finally {
      await w.dispose();
    }
  });

  it('09-T1: none — stop ends the route as human before anything is drafted', async () => {
    const w = await world();
    try {
      await w.start();
      const stopped = await w.answer('sources', 'none — stop');
      assert.equal(stopped.position, 'complete');
      assert.equal((await w.kinds('exit')).at(-1)?.['reason'], 'human');
      assert.equal(await w.exists('.ambicode/policies/drafts'), false);
    } finally {
      await w.dispose();
    }
  });

  it('09-T1: a free-text answer at sources revises discover with the named files', async () => {
    const w = await world({ text: '' });
    try {
      const first = await w.start();
      const second = await w.answer('sources', 'CONTRIBUTING.md');
      assert.equal(second.position, 'sources');
      assert.match(second.text, /Named in the request: CONTRIBUTING\.md/);
      assert.deepEqual((await w.kinds('revise')).at(-1)?.['args'], { source: ['CONTRIBUTING.md'] });
      assert.doesNotMatch(first.text, /Named in the request/);
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T5: the walk-through on ts-feature-boundary', () => {
  it('09-T1: 09-T5: 09-T6: discover, a bad quote fails the check, the fix passes, Apply all wires the pack, revert moves it back', async () => {
    const w = await world();
    try {
      await atDraft(w);
      const policies = '.ambicode/policies';
      await w.draft('team-services.yaml', pack('team-services', [rule('no-direct-transport', 'Keep services apart from the transport layer.', QUOTE), rule('tests-beside', 'Pair every service function with a test.', BAD)]));
      const failed = await w.check();
      assert.equal(failed.ok, false);
      assert.ok(failed.diagnostics.some((diagnostic) => diagnostic.code === 'pack-quote-missing'));
      assert.match(failed.next ?? '', /Write rule drafts/);
      assert.match(failed.next ?? '', /pack-quote-missing/);
      assert.match(failed.next ?? '', /not migrated: pack-quote-missing team-services\/tests-beside/);
      assert.equal(await w.position(), 'draft');

      await w.draft('team-services.yaml', GOOD);
      const passed = await w.check();
      assert.equal(passed.ok, true);
      assert.match(passed.next ?? '', /Disposition if you choose Apply all:/);
      assert.match(passed.next ?? '', /team-services\/no-direct-transport: applied/);
      assert.equal(await w.position(), 'rules-table');
      assert.doesNotMatch(await w.config(), /team-services/, 'nothing is wired before the answer');

      const before = await w.config();
      const accepted = await w.answer('rules-table', 'Apply all');
      assert.equal(accepted.position, 'apply');
      assert.match(accepted.text, /rules apply --task rules-1/);
      assert.doesNotMatch(await w.config(), /team-services/, 'the answer alone wires nothing');

      const applied = await w.apply();
      assert.equal((applied.packs as unknown[]).length, 1);
      assert.deepEqual((applied.packs as { id: string; path: string; rules: number }[])[0], { id: 'team-services', path: `${policies}/team-services.yaml`, rules: 2 });
      const probe = (applied.probes as { covered: { ok: boolean }; uncovered: { ok: boolean } }[])[0]!;
      assert.equal(probe.covered.ok, true);
      assert.equal(probe.uncovered.ok, true);
      assert.match(String(applied.next), /team-services/, 'the route closes with the table');
      assert.equal(await w.position(), 'complete');
      assert.equal(await w.exists(`${policies}/team-services.yaml`), true);
      assert.equal(await w.exists(`${policies}/drafts/team-services.yaml`), false);
      const wired = await w.config();
      assert.ok(wired.includes('.ambicode/policies/team-services.yaml'));
      for (const line of before.split('\n').filter((candidate) => candidate.trim() !== '' && !candidate.includes('policyFiles'))) assert.ok(wired.includes(line), `kept: ${line}`);
      const note = await readFile(path.join(w.root, '.ambicode', 'task', TASK, 'steps', 'rules-apply.md'), 'utf8');
      assert.match(note, /<!-- ambicode rules sha256:[0-9a-f]+ -->/);

      const entries = await w.ledger();
      assert.equal(entries.filter((entry) => entry.kind === 'policy' && entry['stage'] === 'drafts').length, 2, 'one entry per check, none from the handler');
      assert.equal(entries.filter((entry) => entry.kind === 'policy' && entry['stage'] === 'apply').length, 1);

      const reverted = await w.revert('team-services');
      assert.equal(reverted.to, `${policies}/drafts/team-services.yaml`);
      assert.equal(await w.exists(`${policies}/drafts/team-services.yaml`), true);
      assert.equal(await w.exists(`${policies}/team-services.yaml`), false);
      assert.doesNotMatch(await w.config(), /team-services/);
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T2: a human who does not apply', () => {
  it('09-T2: 09-T4: Discard drafts wires nothing, keeps the drafts and rules apply refuses', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      await w.check();
      const closed = await w.answer('rules-table', 'Discard drafts');
      assert.equal(closed.position, 'complete');
      assert.match(closed.text, /No pack was applied/);
      assert.equal(await w.exists('.ambicode/policies/drafts/team-services.yaml'), true);
      assert.equal((await codeOf(w.apply())).code, 'session-unbound', 'the closed route no longer owns the session');
      assert.doesNotMatch(await w.config(), /team-services/);
    } finally {
      await w.dispose();
    }
  });

  it('09-T2: a headless run takes the table default and applies nothing', async () => {
    const w = await world({ headless: true });
    try {
      await w.start({ answers: [{ gate: 'sources', option: 'use these sources' }] });
      await w.draft('team-services.yaml', GOOD);
      const checked = await w.check();
      assert.equal(await w.position(), 'complete');
      assert.match(String(checked.next), /No pack was applied/);
      assert.equal((await w.kinds('default-taken')).at(-1)?.['answer'], 'Discard drafts');
      assert.equal((await w.kinds('policy')).filter((entry) => entry['stage'] === 'apply').length, 0);
      assert.equal(await w.exists('.ambicode/policies/drafts/team-services.yaml'), true);
    } finally {
      await w.dispose();
    }
  });

  it('09-T2: 09-T4: before any answer rules apply refuses with rules-apply-unconfirmed', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      await w.check();
      const refused = await codeOf(w.apply());
      assert.equal(refused.code, 'rules-apply-unconfirmed');
      assert.ok(refused.details?.includes('reason: no-answer'));
      assert.equal(await w.exists('.ambicode/policies/team-services.yaml'), false);
    } finally {
      await w.dispose();
    }
  });

  it('09-T2: D9: Apply with changes and free text revise draft and leave no pack live', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      await w.check();
      const revised = await w.answer('rules-table', 'Apply with changes');
      assert.equal(revised.position, 'draft');
      assert.equal((await w.kinds('revise')).at(-1)?.['from'], 'draft');
      await w.check();
      const free = await w.answer('rules-table', 'narrow the glob to users only');
      assert.equal(free.position, 'draft');
      assert.deepEqual((await w.kinds('revise')).at(-1)?.['args'], { change: ['narrow the glob to users only'] });
      assert.equal((await w.kinds('revise')).at(-1)?.['via'], 'gate');
      assert.doesNotMatch(await w.config(), /team-services/);
      assert.equal((await w.kinds('policy')).filter((entry) => entry['stage'] === 'apply').length, 0);
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T4: the object the answer consented to', () => {
  it('09-T4: a draft edited after Apply all is object-changed and nothing is written', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      await w.check();
      await w.answer('rules-table', 'Apply all');
      await w.draft('team-services.yaml', GOOD.replace('Pair every service function with a test.', 'Pair every service function with a unit test.'));
      const refused = await codeOf(w.apply());
      assert.equal(refused.code, 'rules-apply-unconfirmed');
      assert.ok(refused.details?.includes('reason: object-changed'));
      assert.equal(await w.exists('.ambicode/policies/team-services.yaml'), false);
      assert.doesNotMatch(await w.config(), /team-services/);
    } finally {
      await w.dispose();
    }
  });

  it('09-T4: with no route at all rules apply is session-unbound, and a route of another skill is no-rules-route', async () => {
    const w = await world();
    try {
      assert.equal((await codeOf(w.apply())).code, 'session-unbound');
      await w.start({ skill: 'investigate', text: 'how do invoices work', task: TASK });
      const refused = await codeOf(w.apply());
      assert.equal(refused.code, 'rules-apply-unconfirmed');
      assert.ok(refused.details?.includes('reason: no-rules-route'));
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T3: a permanently bad quote', () => {
  it('09-T3: exactly 3 draft deliveries, then not migrated and the table', async () => {
    const w = await world();
    try {
      await w.draft('team-services.yaml', pack('team-services', [rule('no-direct-transport', 'Keep services apart from the transport layer.', QUOTE), rule('tests-beside', 'Pair every service function with a test.', BAD)]));
      const table = await exhaust(w);
      const delivered = (await w.kinds('step')).filter((entry) => entry['step'] === 'draft' && entry['status'] === 'delivered');
      assert.equal(delivered.length, 3);
      assert.ok((await w.kinds('limit')).some((entry) => entry['which'] === 'repeat' && entry['step'] === 'draft'));
      assert.equal(await w.position(), 'rules-table');
      assert.match(table, /team-services\/tests-beside: not migrated: pack-quote-missing: not in file/);
      assert.match(table, /team-services\/no-direct-transport: applied/);
    } finally {
      await w.dispose();
    }
  });

  it('09-T5: D10: Apply all drops the quote-failing rule and skips the pack whose glob matches nothing', async () => {
    const w = await world();
    try {
      await w.draft('team-services.yaml', pack('team-services', [rule('no-direct-transport', 'Keep services apart from the transport layer.', QUOTE), rule('tests-beside', 'Pair every service function with a test.', BAD)]));
      await w.draft('team-nowhere.yaml', pack('team-nowhere', [rule('somewhere', 'Keep things somewhere sensible.', QUOTE)], 'nowhere/**'));
      await exhaust(w);
      await w.answer('rules-table', 'Apply all');
      const applied = await w.apply();
      assert.deepEqual((applied.packs as { id: string; rules: number }[]).map((entry) => [entry.id, entry.rules]), [['team-services', 1]]);
      assert.deepEqual(applied.skipped, [{ file: '.ambicode/policies/drafts/team-nowhere.yaml', reason: 'pack-glob-matches-nothing' }]);
      assert.deepEqual((applied.notMigrated as { rule: string }[]).map((entry) => entry.rule), ['team-services/tests-beside']);
      const live = await readFile(path.join(w.root, '.ambicode', 'policies', 'team-services.yaml'), 'utf8');
      assert.ok(live.includes('no-direct-transport') && !live.includes('tests-beside'));
      assert.equal(await w.exists('.ambicode/policies/drafts/team-nowhere.yaml'), true);
      assert.equal(await w.exists('.ambicode/policies/team-nowhere.yaml'), false);
      assert.match(String(applied.next), /not migrated: team-services\/tests-beside/);
    } finally {
      await w.dispose();
    }
  });

  it('09-T5: a pack whose live file exists is refused as bad-argument before anything is written', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      await w.draft('other.yaml', pack('team-other', [rule('other-rule', 'Another sensible rule here.', SECOND)]));
      await w.check();
      await w.answer('rules-table', 'Apply all');
      await writeFile(path.join(w.root, '.ambicode', 'policies', 'team-services.yaml'), 'occupied\n');
      const refused = await codeOf(w.apply());
      assert.equal(refused.code, 'bad-argument');
      assert.equal(await w.exists('.ambicode/policies/drafts/other.yaml'), true);
      assert.doesNotMatch(await w.config(), /team-other/);
    } finally {
      await w.dispose();
    }
  });
});

describe('09-Q5: policy check --drafts and the ledger', () => {
  it('09-Q5: without --task nothing is recorded and no tail runs', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      const output = await w.check([]);
      assert.equal(output.ok, true);
      assert.equal(output.next, undefined);
      assert.equal((await w.kinds('policy')).filter((entry) => entry['stage'] === 'drafts').length, 0);
      assert.equal(await w.position(), 'draft');
    } finally {
      await w.dispose();
    }
  });

  it('09-Q5: with --task the entry carries the aggregate hash, the files and the error count, once, with one tail', async () => {
    const w = await world();
    try {
      await atDraft(w);
      await w.draft('team-services.yaml', GOOD);
      const output = await w.check();
      const entries = (await w.kinds('policy')).filter((entry) => entry['stage'] === 'drafts');
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!['path'], '.ambicode/policies/drafts');
      assert.equal(entries[0]!['contentHash'], output.drafts!.aggregateHash);
      assert.equal(entries[0]!['errors'], 0);
      assert.deepEqual((entries[0]!['drafts'] as { path: string }[]).map((file) => file.path), ['.ambicode/policies/drafts/team-services.yaml']);
      assert.equal((await w.kinds('step')).filter((entry) => entry['step'] === 'draft' && entry['status'] === 'completed').length, 1);
    } finally {
      await w.dispose();
    }
  });
});

describe('09-T1: route text', () => {
  it('09-T1: the step instructions stay under 1,500 characters and name no ecosystem', async () => {
    for (const name of ['rules-draft', 'rules-apply-run']) {
      const text = await readFile(path.join(REPO_ROOT, 'routes', 'steps', `${name}.md`), 'utf8');
      assert.ok(text.trim().length <= 1_500, `${name} is ${text.trim().length} characters`);
      assert.doesNotMatch(text, /typescript|python|angular|express|eslint|jest/i);
    }
    const route = await readFile(path.join(REPO_ROOT, 'routes', 'rules.yaml'), 'utf8');
    assert.match(route, /modelSteps: 8/);
    assert.doesNotMatch(route, /typescript|python|angular/i);
  });
});
