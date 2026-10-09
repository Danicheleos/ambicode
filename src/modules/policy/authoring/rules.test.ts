import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseDocument, type YAMLMap, type YAMLSeq } from 'yaml';
import { parseArgs } from '#util/args';
import { runRulesDiscover, RULES_DISCOVER_OPTIONS } from '#cli/commands/policy/rules';
import { createRuntime } from '#composition/root';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { discoverRules } from './rules.ts';
import { REPO_ROOT } from '#testing/paths';


async function repo() {
  const r = await TempRepo.create();
  await r.write('package.json', '{}\n');
  await r.write('src/a.ts', 'export const a = 1;\n');
  await r.write('CONTRIBUTING.md', '# Contributing\n');
  await r.write('docs/style.md', '# Style\n');
  await r.commitAll('base');
  const runtime = await createRuntime({ cwd: r.root });
  await initConfig(runtime);
  return { r, runtime };
}

describe('09-W1: rules discover', () => {
  it('09-W1: lists candidates, named files, missing files and urls', async () => {
    const { r, runtime } = await repo();
    try {
      const found = await discoverRules(runtime, []);
      assert.ok(found.candidates.includes('CONTRIBUTING.md'));
      const named = await discoverRules(runtime, ['docs/style.md', 'nope.md', 'https://example.invalid/page']);
      assert.deepEqual(named.named, ['docs/style.md']);
      assert.deepEqual(named.missing, ['nope.md']);
      assert.deepEqual(named.urls, ['https://example.invalid/page']);
      assert.match(named.text, /nope\.md/);
    } finally {
      await r.dispose();
    }
  });
});

describe('08-I1: rules discover --project', () => {
  it('08-I1: rules discover --project looks under that project root only; an unknown project is bad-argument', async () => {
    const { r, runtime } = await repo();
    try {
      await r.write('web/CLAUDE.md', '# Web rules\n');
      const configPath = path.join(r.root, '.ambicode', 'config.yaml');
      const document = parseDocument(await readFile(configPath, 'utf8'));
      const web = (document.getIn(['projects', 0]) as YAMLMap).clone() as YAMLMap;
      web.set('id', 'web');
      web.set('root', 'web');
      (document.get('projects') as YAMLSeq).add(web);
      await runtime.fs.writeText(configPath, document.toString());
      const discover = (...args: string[]) => runRulesDiscover(runtime, parseArgs('rules discover', args, RULES_DISCOVER_OPTIONS));
      assert.deepEqual((await discover('--project', 'web')).candidates, ['web/CLAUDE.md']);
      assert.deepEqual((await discover()).candidates, ['CONTRIBUTING.md', 'docs']);
      await assert.rejects(discover('--project', 'nope'), { code: 'bad-argument', field: '--project' });
    } finally {
      await r.dispose();
    }
  });
});

describe('09-M1: the skill', () => {
  it('09-M1: the body stays within 2,560 bytes and the tools no longer edit the configuration', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'skills', 'rules', 'SKILL.md'), 'utf8');
    const body = text.split('---\n').slice(2).join('---\n');
    assert.ok(Buffer.byteLength(body) <= 2_560, `${Buffer.byteLength(body)} bytes`);
    assert.match(text, /allowed-tools: .*Write\(\.ambicode\/policies\/drafts\/\*\*\)/);
    assert.doesNotMatch(text, /Edit\(\.ambicode\/config\.yaml\)/);
    assert.match(text, /disable-model-invocation: true/);
  });
});
