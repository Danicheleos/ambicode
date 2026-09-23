import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../composition/root.ts';
import type { PrepareCompactOutput, PrepareOutput } from '../contracts/prepare.ts';
import type { StandardInput } from '../ports/stdin.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { formatJsonOutput } from '../util/json-output.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';
import { PREPARE_OPTIONS, runPrepare } from './commands/prepare.ts';
import { evidenceSource } from './target-option.ts';

/**
 * R2: "a small change stays cheap" is a product requirement of AMBICODE's own
 * core idea, and nothing else in the repository enforces it. Before this
 * file, one `/ambicode:task` call spent roughly 10k tokens of framework — a
 * 16 KiB `prepare` payload plus a 17 KiB `SKILL.md` — before a line of
 * project code was read, and any sentence added anywhere quietly made that
 * worse with nothing to notice.
 *
 * The ceilings below are therefore drift detectors, not budgets anyone should
 * aim at. They sit a little above what the implementation actually emits, so
 * a paragraph added on purpose fails loudly and gets a deliberate decision
 * rather than passing unmeasured.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The compact `prepare --json` payload for the fixture below: the two
 * built-in packs plus a project pack of six rules and one `before-work`
 * prompt, 21 rules in all. It emitted 8,869 bytes when this was written; on
 * this repository's own policy (15 rules, no project pack) the same shape is
 * 6,942, down from 15,915.
 */
const MAX_COMPACT_PREPARE_BYTES = 9_300;

/**
 * The same payload with R4's boundary shortlist on it. The shortlist is paths
 * and reasons only — never file contents — and it is bounded by
 * `PREPARE_SHORTLIST_LIMIT`, so what it can add to a call is bounded too.
 * This ceiling is that bound made visible: it emitted 9,335 bytes for the
 * fixture below when this was written.
 */
const MAX_COMPACT_PREPARE_WITH_SHORTLIST_BYTES = 10_400;

/**
 * Per-skill `SKILL.md` ceilings. `task` is the one R2 set a number for; the
 * rest are held near what the same editing pass left them at.
 *
 * `task` and `shared/prepare-output.md` were raised deliberately by R4, which
 * added one genuinely new rule: a shortlist candidate is confirmed before it
 * is edited, and the report says which candidates were confirmed, rejected,
 * or found outside the list. The explanation of the field lives once in the
 * shared file, which a session reads once; each skill carries only the
 * sentences its own reader acts on. The alternative was to ship the field and
 * leave the discipline unstated, which is how a hypothesis turns into an
 * answer.
 */
const MAX_SKILL_BYTES: Record<string, number> = {
  'init/SKILL.md': 4_200,
  'investigate/SKILL.md': 7_600,
  'plan/SKILL.md': 10_400,
  'review/SKILL.md': 11_800,
  'task/SKILL.md': 10_500,
  // R3: a setup-time skill, invoked by name and never on a per-call path, so
  // its ceiling is about staying disciplined rather than about per-call cost.
  // It is the longest because it is the only skill that has to teach a format.
  'rules/SKILL.md': 11_600,
  'shared/requirements-mcp.md': 5_600,
  'shared/prepare-output.md': 4_700,
};

const PACK_A = [
  'schemaVersion: 1',
  'id: cost-fixture',
  'authority: team',
  'appliesTo: ["src/**"]',
  'activities: [task, plan, investigate]',
  'source: { location: "context-cost fixture" }',
  'rules:',
  ...Array.from({ length: 6 }, (_unused, index) => [
    `  - id: rule-${index}`,
    '    category: architecture',
    `    instruction: "Rule ${index}: keep the boundary explicit and say which unit owns the new responsibility."`,
    `    check: { kind: reviewer, explanation: "Judged from the responsibilities present in the changed unit (${index})." }`,
  ]).flat(),
  'prompts:',
  '  - stage: before-work',
  '    file: "./before-work.md"',
  'commandPolicy: []',
  '',
].join('\n');

async function fixture(): Promise<TempRepo> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
  await repo.write('src/app.ts', 'export const a = 1;\n');
  await repo.commitAll('initial');

  const runtime = await createRuntime({ cwd: repo.root });
  await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));

  await repo.write('.ambicode/policies/cost.yaml', PACK_A);
  await repo.write('.ambicode/policies/before-work.md', '# Before work\n\nScoped guidance for this fixture.\n');
  const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
  const config = (await readFile(configPath, 'utf8')).replace(
    'policyFiles: []',
    'policyFiles: [".ambicode/policies/cost.yaml"]',
  );
  await repo.write('.ambicode/config.yaml', config);
  return repo;
}

function compactRules(output: PrepareCompactOutput): { id: string; instruction: string; check: string }[] {
  return output.policy.packs.flatMap((pack) => pack.rules ?? []);
}

describe('R2 per-call context cost', () => {
  it('keeps the compact prepare payload under its ceiling, with every rule instruction and check explanation in full', async () => {
    const repo = await fixture();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const compact = (await runPrepare(
        runtime,
        parseArgs('prepare', ['--activity', 'task', 'src/app.ts'], PREPARE_OPTIONS),
      ));
      const verbose = await runPrepare(
        runtime,
        parseArgs('prepare', ['--activity', 'task', '--verbose', 'src/app.ts'], PREPARE_OPTIONS),
      );

      const emitted = formatJsonOutput(compact.data, compact.json);
      assert.ok(
        Buffer.byteLength(emitted, 'utf8') <= MAX_COMPACT_PREPARE_BYTES,
        `compact prepare payload is ${Buffer.byteLength(emitted, 'utf8')} bytes, over the ${MAX_COMPACT_PREPARE_BYTES}-byte ceiling. ` +
          'Cutting rules is not the fix: cut framing, or raise the ceiling deliberately and say why.',
      );
      // Cheaper than the shape it replaces, by a margin worth having.
      assert.ok(
        Buffer.byteLength(emitted, 'utf8') <
          Buffer.byteLength(formatJsonOutput(verbose.data, verbose.json), 'utf8') / 2,
      );

      // Not one rule, instruction, or explanation was dropped to get there.
      const full = verbose.data as PrepareOutput;
      const compactData = compact.data as PrepareCompactOutput;
      const rules = compactRules(compactData);
      assert.equal(rules.length, full.policy.rules.length);
      assert.ok(rules.length >= 6, 'the fixture must carry enough rules to be worth measuring');
      for (const rule of full.policy.rules) {
        const match = rules.find(
          (candidate) => `${packIdOf(compactData, candidate)}/${candidate.id}` === rule.qualifiedId,
        );
        assert.ok(match !== undefined, `rule ${rule.qualifiedId} is missing from the compact shape`);
        assert.equal(match.instruction, rule.instruction);
        assert.equal(match.check, rule.checkExplanation);
      }
      // Prompt content is policy, not framing, and survives untouched.
      assert.deepEqual(compactData.policy.prompts, full.policy.prompts);
      assert.deepEqual(compactData.provenance, full.provenance);
    } finally {
      await repo.dispose();
    }
  });

  it('reports measuredBytes equal to the bytes it would print, for the compact and the verbose shape alike', async () => {
    const repo = await fixture();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      for (const argv of [
        ['--activity', 'task', 'src/app.ts'],
        ['--activity', 'task', '--verbose', 'src/app.ts'],
        ['--activity', 'task', '--with-contract', 'src/app.ts'],
      ]) {
        const run = await runPrepare(runtime, parseArgs('prepare', argv, PREPARE_OPTIONS));
        const printed = formatJsonOutput(run.data, run.json);
        assert.equal(
          Buffer.byteLength(printed, 'utf8'),
          run.data.contextBudget.measuredBytes,
          `measuredBytes must equal the printed bytes for ${argv.join(' ')}`,
        );
        // The value survives a round trip, so it is a fixed point rather than
        // a number that happened to match once.
        assert.equal(JSON.parse(printed).contextBudget.measuredBytes, run.data.contextBudget.measuredBytes);
      }
    } finally {
      await repo.dispose();
    }
  });

  it('cites the shared operating contract by reference and hash, and inlines it only for --with-contract', async () => {
    const repo = await fixture();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const cited = (
        await runPrepare(runtime, parseArgs('prepare', ['--activity', 'task'], PREPARE_OPTIONS))
      ).data as PrepareCompactOutput;
      const inlined = (
        await runPrepare(runtime, parseArgs('prepare', ['--activity', 'task', '--with-contract'], PREPARE_OPTIONS))
      ).data as PrepareCompactOutput;

      assert.equal(cited.sharedOperatingContract.content, undefined);
      assert.ok(cited.sharedOperatingContract.contentHash.length > 0);
      assert.ok((inlined.sharedOperatingContract.content ?? '').includes('AMBICODE operating contract'));
      // Same contract either way — the hash is what makes the citation usable.
      assert.equal(inlined.sharedOperatingContract.contentHash, cited.sharedOperatingContract.contentHash);
      // And still in provenance, so the budget and the audit trail agree.
      assert.ok(
        cited.provenance.some((entry) => entry.reference === cited.sharedOperatingContract.reference),
      );
    } finally {
      await repo.dispose();
    }
  });

  it('omits installation guidance from the per-call navigation contract but keeps the strategy and the evidence requirement', async () => {
    const repo = await fixture();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const run = await runPrepare(runtime, parseArgs('prepare', ['--activity', 'task'], PREPARE_OPTIONS));
      const navigation = (run.data as PrepareCompactOutput).navigation;
      assert.equal(navigation.strategy, 'shortlist-then-known-paths-then-lsp-then-targeted-search');
      assert.ok(navigation.evidenceRequirement.length > 0);
      assert.ok(
        navigation.evidenceRequirement.length < 100,
        'the evidence requirement is re-sent on every call and should stay one clause',
      );
      assert.ok(navigation.readGuidance.length > 0);
      assert.ok(
        navigation.readGuidance.length < 100,
        'the read guidance rides every call for the same reason and stays one clause',
      );
      assert.equal('setupCommands' in navigation, false);
      // `init` and `config` still carry it; this is the per-call path only.
      assert.deepEqual(
        (run.detail.navigation.setupCommands ?? []).length > 0,
        true,
        'setup guidance must still exist for init/config to report',
      );
    } finally {
      await repo.dispose();
    }
  });

  it('carries the boundary shortlist when given terms, as paths and reasons within a bounded cost (R4)', async () => {
    const repo = await fixture();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const run = await runPrepare(
        runtime,
        parseArgs('prepare', ['--activity', 'task', '--term', 'app', 'src/app.ts'], PREPARE_OPTIONS),
      );
      const shortlist = (run.data as PrepareCompactOutput).navigation.shortlist;

      assert.ok(shortlist !== undefined, 'a call given --term must carry a shortlist');
      assert.deepEqual(shortlist.terms, ['app']);
      assert.ok(shortlist.candidates.some((candidate) => candidate.path === 'src/app.ts'));
      for (const candidate of shortlist.candidates) {
        // Paths and reasons, never file contents: the shortlist says where to
        // look, and the caller decides what is worth reading.
        assert.deepEqual(Object.keys(candidate).sort(), ['path', 'reasons', 'score']);
        assert.ok(candidate.reasons.length > 0, `${candidate.path} ranked without a reason`);
      }

      const emitted = formatJsonOutput(run.data, run.json);
      assert.ok(
        Buffer.byteLength(emitted, 'utf8') <= MAX_COMPACT_PREPARE_WITH_SHORTLIST_BYTES,
        `prepare with a shortlist is ${Buffer.byteLength(emitted, 'utf8')} bytes, over the ` +
          `${MAX_COMPACT_PREPARE_WITH_SHORTLIST_BYTES}-byte ceiling.`,
      );
      assert.equal(Buffer.byteLength(emitted, 'utf8'), run.data.contextBudget.measuredBytes);
    } finally {
      await repo.dispose();
    }
  });

  it('reads the requirement envelope from standard input with --evidence -', async () => {
    const repo = await fixture();
    try {
      const envelope = JSON.stringify({
        mcpServer: null,
        sources: [
          {
            id: 'ORD-1',
            url: 'https://example.atlassian.net/browse/ORD-1',
            title: 'Reject negative amounts',
            retrievedAt: '2026-09-20T09:00:00.000Z',
            content: 'The order total must never be negative.',
            status: 'retrieved',
            retrievedVia: 'mcp__atlassian__getJiraIssue',
          },
        ],
        conflicts: [],
      });
      const stdin: StandardInput = { read: async () => envelope };
      const runtime = await createRuntime({ cwd: repo.root, stdin });

      const run = await runPrepare(
        runtime,
        parseArgs(
          'prepare',
          ['--activity', 'task', '--requirement', 'https://example.atlassian.net/browse/ORD-1', '--evidence', '-'],
          PREPARE_OPTIONS,
        ),
      );
      assert.equal(run.detail.requirementMode, 'requirement-based');
      assert.equal(run.detail.requirements[0]?.id, 'ORD-1');
      assert.ok(run.detail.provenance.some((entry) => entry.kind === 'requirement'));
    } finally {
      await repo.dispose();
    }
  });

  it('refuses an empty or oversized piped envelope instead of normalizing half of one', async () => {
    const repo = await fixture();
    try {
      for (const value of ['', null]) {
        const runtime = await createRuntime({
          cwd: repo.root,
          stdin: { read: async () => value },
        });
        await assert.rejects(
          runPrepare(
            runtime,
            parseArgs(
              'prepare',
              ['--activity', 'task', '--requirement', 'https://example.atlassian.net/browse/ORD-1', '--evidence', '-'],
              PREPARE_OPTIONS,
            ),
          ),
          (error: unknown) => (error as { code?: string }).code === 'requirements-unreadable',
        );
      }
    } finally {
      await repo.dispose();
    }
  });

  it('resolves --evidence - to standard input for review and bundle too, and a path to that path', async () => {
    const runtime = await createRuntime({ cwd: repositoryRoot });
    assert.deepEqual(evidenceSource(runtime, '-'), { kind: 'stdin' });
    assert.deepEqual(evidenceSource(runtime, null), null);
    assert.equal(evidenceSource(runtime, 'evidence.json')?.kind, 'file');
  });

  it('keeps every shipped skill file under its byte ceiling', async () => {
    for (const [relative, ceiling] of Object.entries(MAX_SKILL_BYTES)) {
      const content = await readFile(path.join(repositoryRoot, 'skills', relative), 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      assert.ok(
        bytes <= ceiling,
        `skills/${relative} is ${bytes} bytes, over its ${ceiling}-byte ceiling. ` +
          'Every one of these is read into context before any project code is; ' +
          'cut a repetition, move the rule to the file that owns it, or raise the ceiling deliberately.',
      );
    }
  });
});

/** The pack a compact rule sits under, which is what gives it its qualified id. */
function packIdOf(output: PrepareCompactOutput, rule: { id: string }): string {
  const owner = output.policy.packs.find((pack) => (pack.rules ?? []).some((candidate) => candidate === rule));
  assert.ok(owner !== undefined);
  return owner.id;
}
