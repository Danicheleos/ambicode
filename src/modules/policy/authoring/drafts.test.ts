import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs } from '#util/args';
import { runPolicyCheck, POLICY_CHECK_OPTIONS } from '#cli/commands/policy/policy-check';
import { createRuntime } from '#composition/root';
import { openWorkspace } from '#modules/config/workspace';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { checkDrafts } from './drafts.ts';
import { DRAFTS_DIR, PolicyPack } from '#types/modules/policy';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { REPO_ROOT } from '#testing/paths';

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

describe('a draft is not cut from a file Claude Code loads itself', () => {
  it('a rule quoting CLAUDE.md, .claude/rules or a nested CLAUDE.md is an error, a CONTRIBUTING.md quote is not', async () => {
    const d = await drafted({
      'a.yaml': pack([
        rule('from-root', 'Keep services apart from transport.', QUOTE, 'CLAUDE.md'),
        rule('from-rules', 'Keep tests beside the code always.', QUOTE, '.claude/rules/tests.md:3'),
        rule('from-nested', 'Keep layers apart in this folder.', QUOTE, 'src/users/CLAUDE.md'),
        rule('from-guide', 'Keep the transport layer behind services.', QUOTE),
      ]),
    });
    try {
      await d.repo.write('CLAUDE.md', GUIDE);
      const check = await d.check();
      const flagged = check.diagnostics.filter((diagnostic) => diagnostic.code === 'pack-source-autoloaded').map((diagnostic) => diagnostic.message);
      assert.equal(flagged.length, 3);
      assert.ok(flagged.some((message) => message.includes('from-root')) && !flagged.some((message) => message.includes('from-guide')));
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });
});

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

describe('one rule is stated once', () => {
  const preset = PolicyPack.parse(parseYaml(readFileSync(path.join(REPO_ROOT, 'policies', 'common', 'common-design.yaml'), 'utf8'))).rules[0]!;

  it('a draft that restates an enabled preset instruction, in other case, spacing and punctuation, is rejected and blocks its pack', async () => {
    const reworded = preset.instruction.replace(/\s+/g, '  ').toUpperCase().replace(/\.?\s*$/, '!!');
    const d = await drafted({ 'a.yaml': pack([rule('my-own-id', reworded, QUOTE)]) });
    try {
      const check = await d.check();
      const found = check.diagnostics.find((diagnostic) => diagnostic.code === 'pack-rule-duplicate');
      assert.ok(found !== undefined && found.message.includes(`common-design/${preset.id}`), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });

  it('a draft rule that reuses an enabled rule id is rejected even with new wording', async () => {
    const d = await drafted({ 'a.yaml': pack([rule(preset.id, 'Something this project states in its own words.', QUOTE)]) });
    try {
      assert.ok(codes(await d.check()).includes('pack-rule-duplicate'));
    } finally {
      await d.repo.dispose();
    }
  });

  it('a draft that paraphrases an enabled rule, or an earlier draft, warns with the rule it resembles and does not block', async () => {
    const half = preset.instruction.split(/(?<=\.)\s/)[0]!.replace(/\.$/, '');
    const d = await drafted({
      'a.yaml': pack([rule('my-own-need', `In this project, ${half.toLowerCase()} and nothing more.`, QUOTE), rule('layers', 'Keep the transport layer behind the services always.', QUOTE)]),
      'b.yaml': pack([rule('layers-again', 'Always keep transport layer behind services.', QUOTE)]).replace('id: team-a', 'id: team-b'),
    });
    try {
      const check = await d.check();
      const similar = check.diagnostics.filter((diagnostic) => diagnostic.code === 'pack-rule-similar');
      assert.equal(similar.length, 2, JSON.stringify(similar.map((entry) => entry.message)));
      assert.ok(similar.some((entry) => entry.severity === 'warning' && entry.message.includes('my-own-need') && entry.message.includes(`common-design/${preset.id}`)));
      assert.ok(similar.some((entry) => entry.message.includes('team-b') && entry.message.includes('team-a/layers')));
      assert.equal(check.ok, true, JSON.stringify(check.diagnostics));
    } finally {
      await d.repo.dispose();
    }
  });

  it('unrelated rules do not warn as similar', async () => {
    const d = await drafted({ 'a.yaml': pack([rule('one', 'Keep the transport layer behind the services.', QUOTE), rule('two', 'Tests live beside the code they cover.', 'Tests live beside the code.')]) });
    try {
      assert.ok(!codes(await d.check()).includes('pack-rule-similar'));
    } finally {
      await d.repo.dispose();
    }
  });

  it('a web rule with inherited authority passes with its URL flagged unchecked', async () => {
    const url = 'https://example.invalid/practice';
    const web = pack([rule('web-practice', 'Prefer small, named exports from a module.', 'Prefer small named exports from modules.', url)]).replace('authority: team', 'authority: inherited');
    const d = await drafted({ 'a.yaml': web });
    try {
      const check = await d.check();
      assert.ok(codes(check).includes('pack-quote-unchecked'));
      assert.equal(check.ok, true, JSON.stringify(check.diagnostics));
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
    const commonDesign = (rules: readonly string[]): string =>
      ['schemaVersion: 1', 'id: common-design', 'authority: team', 'appliesTo:', '  - "src/**"', 'activities: [review]', 'source:', '  location: CONTRIBUTING.md', 'rules:', ...rules, ''].join('\n');
    const d = await drafted({ 'a.yaml': commonDesign([rule('one', 'First rule.', QUOTE)]) });
    try {
      const project = d.workspace.config.projects.find((candidate) => candidate.id === 'app' || d.workspace.config.projects.length === 1)!;
      assert.ok(project.packs.includes('builtin/common-design'), 'the fixture must already enable this built-in');
      const check = await checkDrafts(d.runtime, d.workspace, { project: project.id });
      assert.ok(codes(check).includes('pack-duplicate-id'), JSON.stringify(check.diagnostics));
      assert.equal(check.ok, false);
    } finally {
      await d.repo.dispose();
    }
  });

  it('09-Q2: a draft that replaces the enabled built-in of the same id is accepted', async () => {
    const replacement = pack([rule('one', 'First rule.', QUOTE)]).replace('id: team-a', 'id: common-design\nreplaces: builtin/common-design');
    const d = await drafted({ 'a.yaml': replacement });
    try {
      const project = d.workspace.config.projects[0]!;
      assert.ok(project.packs.includes('builtin/common-design'), 'the fixture must already enable this built-in');
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
