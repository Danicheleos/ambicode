import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { assembleEngine } from '#testing/fixtures/route-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { FIXTURE_CONFIG } from '#testing/fixtures/init-config';
import { REPO_ROOT } from '#testing/paths';
import './handlers.ts';
import { MODULE_HANDLERS } from '../common.ts';

const SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';

async function started(root: string) {
  await mkdir(path.join(root, '.ambicode'), { recursive: true });
  await writeFile(path.join(root, '.ambicode/config.yaml'), FIXTURE_CONFIG);
  const step = { 'routes/rules/draft.md': await readFile(path.join(REPO_ROOT, 'routes/rules/draft.md'), 'utf8'), 'routes/rules/apply-run.md': '' };
  const assembled = await assembleEngine({ root, routes: { rules: await readFile(path.join(REPO_ROOT, 'routes/rules/rules.yaml'), 'utf8') }, step });
  const engine = assembled.build({ 'policy.enabled': MODULE_HANDLERS['policy.enabled']! });
  const first = await engine.start({ skill: 'rules', text: 'use CONTRIBUTING.md and https://wiki.example.invalid/rules', requirements: [], cwd: root, session: SESSION, channel: 'hook' });
  return { engine, assembled, first };
}

describe('skills/rules/scripts', () => {
  it('the draft step tells the model to skip a statement no check could decide, within 1500 characters', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'routes/rules/draft.md'), 'utf8');
    assert.match(text, /vague wish no check could decide/);
    assert.ok(text.length < 1500, String(text.length));
  });

  it('discover.mjs names candidate files, the file the request names and the url to fetch', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n');
      const { first } = await started(root);
      assert.equal(first.position, 'sources');
      assert.match(first.text, /CONTRIBUTING\.md/);
      assert.match(first.text, /https:\/\/wiki\.example\.invalid\/rules/);
      assert.doesNotMatch(first.text, /Drafts already in/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('discover.mjs does not offer the files Claude Code loads itself, and lists the other guideline docs', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await mkdir(path.join(root, '.claude/rules'), { recursive: true });
      await mkdir(path.join(root, 'src/users'), { recursive: true });
      await writeFile(path.join(root, '.claude/CLAUDE.md'), '# Rules\n');
      await writeFile(path.join(root, '.claude/rules/security.md'), '# Security\n');
      await writeFile(path.join(root, 'src/users/CLAUDE.md'), '# Users\n');
      await writeFile(path.join(root, 'CLAUDE.local.md'), '# Mine\n');
      await new Promise((resolve) => execFile('git', ['add', '-A'], { cwd: root }, resolve));
      const { first } = await started(root);
      assert.match(first.text, /Rule sources found: /);
      assert.doesNotMatch(first.text, /CLAUDE/);
      assert.doesNotMatch(first.text, /\.claude\/rules/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('drafts already written (by init) reach the draft step', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await mkdir(path.join(root, '.ambicode/policies/drafts'), { recursive: true });
      await writeFile(path.join(root, '.ambicode/policies/drafts/observed-conventions.yaml'), 'schemaVersion: 1\n');
      const { engine, assembled, first } = await started(root);
      assert.doesNotMatch(first.text, /Drafts already in/);
      const print = (await assembled.runtime.fs.readText(path.join(root, '.ambicode/tasks', first.task, 'ledger.jsonl'))).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>).findLast((entry) => entry['kind'] === 'gate')!;
      const next = await engine.advance({ task: first.task, cause: 'gate-hook', answers: [{ gate: 'sources', option: 'use these sources', instance: print['id'] as string }] });
      assert.match(next.text, /Drafts already in \.ambicode\/policies\/drafts\/ \(written by init\): observed-conventions\.yaml/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('chosen.mjs lets the route reach draft once a source is chosen', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n');
      const { engine, assembled, first } = await started(root);
      const ledger = async () => (await assembled.runtime.fs.readText(path.join(root, '.ambicode/tasks', first.task, 'ledger.jsonl'))).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
      const print = (await ledger()).findLast((entry) => entry['kind'] === 'gate' && entry['gate'] === 'sources')!;
      const next = await engine.advance({ task: first.task, cause: 'gate-hook', answers: [{ gate: 'sources', option: 'use these sources', instance: print['id'] as string }] });
      assert.equal(next.position, 'draft');
      assert.match(next.text, /config\.yaml/);
      assert.match(next.text, /Rules already in force[^\n]*\n- common-design\/need: /);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  const answered = async (root: string, option: string) => {
    await writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n');
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs/x.md'), '# X\n');
    const { engine, assembled, first } = await started(root);
    const ledger = async () => (await assembled.runtime.fs.readText(path.join(root, '.ambicode/tasks', first.task, 'ledger.jsonl'))).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
    const print = (await ledger()).findLast((entry) => entry['kind'] === 'gate' && entry['gate'] === 'sources')!;
    return engine.advance({ task: first.task, cause: 'gate-hook', answers: [{ gate: 'sources', option, instance: print['id'] as string }] });
  };

  it('a free answer sends the drafter only the sources it names; "use these sources" sends the found list', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const free = await answered(root, 'docs/x.md');
      assert.equal(free.position, 'draft');
      assert.match(free.text, /docs\/x\.md/);
      assert.doesNotMatch(free.text, /Rule sources found/);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
    const again = await materialized('ts-feature-boundary');
    try {
      assert.match((await answered(again, 'use these sources')).text, /Rule sources found: .*CONTRIBUTING\.md/);
    } finally {
      await rm(path.dirname(again), { recursive: true, force: true });
    }
  });

  it('a typed "none" or "stop" stops the route before any draft', async () => {
    for (const typed of ['none', 'stop']) {
      const root = await materialized('ts-feature-boundary');
      try {
        const next = await answered(root, typed);
        assert.notEqual(next.position, 'draft', typed);
        assert.doesNotMatch(next.text, /Rule sources found/, typed);
      } finally {
        await rm(path.dirname(root), { recursive: true, force: true });
      }
    }
  });

  it('a start-time --answer to the free sources gate is read like a later one: free text and a capitalised label', async () => {
    for (const [option, expected] of [['docs/x.md', /docs\/x\.md/], ['Use These Sources', /Rule sources found/]] as const) {
      const root = await materialized('ts-feature-boundary');
      try {
        await mkdir(path.join(root, 'docs'), { recursive: true });
        await writeFile(path.join(root, 'docs/x.md'), '# X\n');
        await mkdir(path.join(root, '.ambicode'), { recursive: true });
        await writeFile(path.join(root, '.ambicode/config.yaml'), FIXTURE_CONFIG);
        const assembled = await assembleEngine({ root, routes: { rules: await readFile(path.join(REPO_ROOT, 'routes/rules/rules.yaml'), 'utf8') }, step: { 'routes/rules/draft.md': 'draft', 'routes/rules/apply-run.md': '' } });
        const engine = assembled.build({ 'policy.enabled': MODULE_HANDLERS['policy.enabled']! });
        const message = await engine.start({ skill: 'rules', text: 'rules', requirements: [], cwd: root, session: SESSION, channel: 'cli', answers: [{ gate: 'sources', option }] });
        assert.equal(message.position, 'draft', option);
        assert.match(message.text, expected, option);
      } finally {
        await rm(path.dirname(root), { recursive: true, force: true });
      }
    }
  });
});
