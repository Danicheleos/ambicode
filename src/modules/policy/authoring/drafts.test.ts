import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { runPolicyCheck, POLICY_CHECK_OPTIONS } from '#cli/commands/policy/policy-check';
import { createRuntime } from '#composition/root';
import { openWorkspace } from '#modules/config/workspace';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { checkDrafts } from './drafts.ts';
import { DRAFTS_DIR } from '#types/modules/policy';

const QUOTE = 'Services must never call the transport layer directly.';
const GUIDE = `# Contributing\n\nWe keep layers apart.\n${QUOTE}\nTests live beside the code.\n`;

const rule = (id: string, instruction: string, quote: string | null, location = 'CONTRIBUTING.md'): string =>
  [
    `  - id: ${id}`,
    '    category: architecture',
    `    instruction: ${JSON.stringify(instruction)}`,
    '    check: { kind: reviewer, explanation: judged from the diff }',
    ...(quote === null ? [] : ['    source:', `      quote: ${JSON.stringify(quote)}`, `      location: ${JSON.stringify(location)}`]),
  ].join('\n');

const pack = (rules: readonly string[], glob = 'src/**'): string =>
  ['schemaVersion: 1', 'id: team-a', 'authority: team', 'appliesTo:', `  - "${glob}"`, 'activities: [review]', 'source:', '  location: CONTRIBUTING.md', 'rules:', ...rules, ''].join('\n');

async function drafted(files: Record<string, string>) {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{}\n');
  await repo.write('src/a.ts', 'export const a = 1;\n');
  await repo.write('CONTRIBUTING.md', GUIDE);
  await repo.commitAll('base');
  const runtime = await createRuntime({ cwd: repo.root });
  await initConfig(runtime);
  for (const [name, text] of Object.entries(files)) await repo.write(`${DRAFTS_DIR}/${name}`, text);
  const workspace = await openWorkspace(runtime);
  return { repo, runtime, workspace, check: () => checkDrafts(runtime, workspace, { project: null }) };
}

const codes = (check: Awaited<ReturnType<Awaited<ReturnType<typeof drafted>>['check']>>): string[] => check.diagnostics.map((diagnostic) => diagnostic.code);

describe('09-Q1: drafts carry a source', () => {
  it('09-Q1: a draft rule without source is pack-invalid', async () => {
    const d = await drafted({ 'a.yaml': pack([rule('no-source', 'Keep services apart from transport.', null)]) });
    try {
      const check = await d.check();
      assert.ok(codes(check).includes('pack-invalid'));
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q1: a quote shorter than 20 characters is pack-invalid', async () => {
    const d = await drafted({ 'a.yaml': pack([rule('short', 'Keep services apart from transport.', 'Never call it')]) });
    try {
      const check = await d.check();
      assert.ok(check.diagnostics.some((diagnostic) => diagnostic.code === 'pack-invalid' && /shorter than 20/.test(diagnostic.message)));
    } finally {
      await d.repo.dispose();
    }
  });
});

describe('09-Q3: quotes are verified', () => {
  it('09-Q3: a file quote matches across a line break and ignores a :line suffix', async () => {
    const d = await drafted({ 'a.yaml': pack([rule('wrapped', 'Keep layers apart.', 'We keep layers apart. Services must never call the transport layer directly.', 'CONTRIBUTING.md:3')]) });
    try {
      const check = await d.check();
      assert.ok(!codes(check).includes('pack-quote-missing'), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, true);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q3: an absent quote and a missing file are pack-quote-missing with the reason', async () => {
    const d = await drafted({
      'a.yaml': pack([rule('absent', 'Keep layers apart.', 'Controllers must never touch the database.'), rule('gone', 'Other.', QUOTE, 'docs/missing.md')]),
    });
    try {
      const check = await d.check();
      assert.deepEqual(check.notMigrated.map((entry) => [entry.rule, entry.reason]), [['team-a/absent', 'pack-quote-missing: not in file'], ['team-a/gone', 'pack-quote-missing: file missing']]);
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q3: a URL quote is not verified and warns', async () => {
    const url = 'https://wiki.example.invalid/wiki/spaces/ENG/pages/123456/Rules';
    const d = await drafted({ 'a.yaml': pack([rule('page', 'Keep layers apart.', QUOTE, url)]) });
    try {
      const check = await d.check();
      assert.ok(codes(check).includes('pack-quote-unchecked'), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, true);
    } finally {
      await d.repo.dispose();
    }
  });
});

describe('09-Q2: policy check --drafts', () => {
  it('09-Q2: positional files with --drafts are refused as bad-argument', async () => {
    const d = await drafted({});
    try {
      await assert.rejects(runPolicyCheck(d.runtime, parseArgs('policy check', ['--drafts', 'x.yaml'], POLICY_CHECK_OPTIONS)), { code: 'bad-argument' });
      await assert.rejects(runPolicyCheck(d.runtime, parseArgs('policy check', ['--task', 'x', 'x.yaml'], POLICY_CHECK_OPTIONS)), { code: 'bad-argument' });
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q2: rulesBySource sums to the drafts rule count and the command prints it', async () => {
    const d = await drafted({
      'a.yaml': pack([rule('one', 'First rule.', QUOTE), rule('two', 'Second rule here.', 'Tests live beside the code.')]),
      'b.yaml': pack([rule('three', 'Third rule here.', QUOTE)]).replace('id: team-a', 'id: team-b'),
    });
    try {
      const output = await runPolicyCheck(d.runtime, parseArgs('policy check', ['--drafts', '--json'], POLICY_CHECK_OPTIONS));
      assert.equal(output.drafts?.rules, 3);
      assert.equal(Object.values(output.drafts!.rulesBySource).reduce((sum, count) => sum + count, 0), 3);
      assert.deepEqual(output.drafts!.rulesBySource, { 'CONTRIBUTING.md': 3 });
      assert.equal(output.ok, true);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q2: a draft that repeats an already-enabled pack id is reported before it is applied', async () => {
    const commonQuality = (rules: readonly string[]): string =>
      ['schemaVersion: 1', 'id: common-quality', 'authority: team', 'appliesTo:', '  - "src/**"', 'activities: [review]', 'source:', '  location: CONTRIBUTING.md', 'rules:', ...rules, ''].join('\n');
    const d = await drafted({ 'a.yaml': commonQuality([rule('one', 'First rule.', QUOTE)]) });
    try {
      const project = d.workspace.config.projects.find((candidate) => candidate.id === 'app' || d.workspace.config.projects.length === 1)!;
      assert.ok(project.packs.includes('builtin/common-quality'), 'the fixture must already enable this built-in');
      const check = await checkDrafts(d.runtime, d.workspace, { project: project.id });
      assert.ok(codes(check).includes('pack-duplicate-id'), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q2: a draft that replaces the enabled built-in of the same id is accepted', async () => {
    const replacement = pack([rule('one', 'First rule.', QUOTE)]).replace('id: team-a', 'id: common-quality\nreplaces: builtin/common-quality');
    const d = await drafted({ 'a.yaml': replacement });
    try {
      const project = d.workspace.config.projects[0]!;
      assert.ok(project.packs.includes('builtin/common-quality'), 'the fixture must already enable this built-in');
      const check = await checkDrafts(d.runtime, d.workspace, { project: project.id });
      assert.ok(!codes(check).includes('pack-duplicate-id'), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, true);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q2: a glob that matches nothing is reported and an empty drafts directory is an error', async () => {
    const d = await drafted({ 'a.yaml': pack([rule('one', 'First rule.', QUOTE)], 'nowhere/**') });
    try {
      assert.ok(codes(await d.check()).includes('pack-glob-matches-nothing'));
      await d.repo.run(['rm', '-r', '-f', `${DRAFTS_DIR}`]);
      assert.ok(codes(await d.check()).includes('drafts-empty'));
    } finally {
      await d.repo.dispose();
    }
  });
});
