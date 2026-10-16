import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('discover.mjs lists drafts already written (by init) so the draft step keeps them', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      await mkdir(path.join(root, '.ambicode/policies/drafts'), { recursive: true });
      await writeFile(path.join(root, '.ambicode/policies/drafts/observed-conventions.yaml'), 'schemaVersion: 1\n');
      const { first } = await started(root);
      assert.match(first.text, /Drafts already in \.ambicode\/policies\/drafts\/ \(written by init\): observed-conventions\.yaml/);
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
      const next = await engine.advance({ task: first.task, session: SESSION, cause: 'gate-hook', answers: [{ gate: 'sources', option: 'use these sources', instance: print['id'] as string }] });
      assert.equal(next.position, 'draft');
      assert.match(next.text, /config\.yaml/);
      assert.match(next.text, /Rules already in force[^\n]*\n- common-design\/need: /);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
