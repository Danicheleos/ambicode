import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseDocument } from 'yaml';
import { parseArgs } from '#util/args';
import { parseConfig } from '#modules/config/load';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { createRuntime } from '#composition/root';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { FIXTURE_CONFIG, initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { configPacksCommand } from './packs.ts';

const NO_PACKS = FIXTURE_CONFIG.replace('packs: [builtin/common-design, builtin/common-code, builtin/common-errors, builtin/common-security, builtin/common-verification, builtin/common-checks]', 'packs: []').replace(', e2e: { all: null, file: null }', '');

async function angularRepo() {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"dependencies":{"@angular/core":"^20.0.0"}}\n');
  await repo.write('src/app/a.service.ts', 'export class A {}\n');
  await repo.commitAll('base');
  const runtime = await createRuntime({ cwd: repo.root });
  const config = await initConfig(runtime, `# kept\n${NO_PACKS}`);
  const run = () => configPacksCommand.run(runtime, parseArgs('config packs', [], configPacksCommand.options));
  return { repo, runtime, config, run };
}

describe('config packs', () => {
  it('copies each matched built-in to .ambicode/policies with replaces, lists it in policyFiles, keeps the config comments, reports a skipped pack with its reason, and the copies load clean', async () => {
    const { repo, runtime, config, run } = await angularRepo();
    try {
      const out = await run();
      const written = await runtime.fs.readText(config);
      assert.match(written, /^# kept/);
      const project = parseConfig(written).projects[0]!;
      assert.deepEqual(project.packs, [], 'no builtin/<id> reference is written');
      for (const file of ['angular/angular-http', 'common/common-design', 'common/common-verification', 'common/common-checks']) assert.ok(project.policyFiles.includes(`.ambicode/policies/${file}.yaml`), project.policyFiles.join(','));
      assert.ok(!project.policyFiles.some((file) => /express|python/.test(file)));
      const builtin = await runtime.fs.readText(path.join(builtinPoliciesDirectory(runtime.pluginRoot), 'angular', 'angular-http.yaml'));
      const copy = await runtime.fs.readText(path.join(repo.root, '.ambicode/policies/angular/angular-http.yaml'));
      assert.equal(copy, builtin.replace(/^id: .*$/m, (line) => `${line}\nreplaces: builtin/angular-http`), 'the built-in text verbatim plus the replaces line');
      assert.match(out.text, /\+ builtin\/angular-http: \.ambicode\/policies\/angular\/angular-http\.yaml written/);
      assert.match(out.text, /\+ builtin\/common-checks: \.ambicode\/policies\/common\/common-checks\.yaml written/, 'a project declaring no commands still gets the command-naming packs');
      assert.match(out.text, /- builtin\/express-http: no marker/);
      const loaded = await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: repo.root });
      assert.deepEqual(loaded.diagnostics, []);
      const quality = loaded.packs.find((pack) => pack.pack.id === 'common-design')!;
      assert.equal(quality.origin, 'project');
      assert.equal(quality.resolvedPrompts.length, 0);
    } finally {
      await repo.dispose();
    }
  });

  it('a second run leaves an edited copy byte-identical, reports it kept, and does not duplicate the policyFiles entry', async () => {
    const { repo, runtime, config, run } = await angularRepo();
    try {
      await run();
      const copyPath = path.join(repo.root, '.ambicode/policies/angular/angular-http.yaml');
      const edited = `${await runtime.fs.readText(copyPath)}\n# my edit\n`;
      await runtime.fs.writeText(copyPath, edited);
      const before = await runtime.fs.readText(config);
      const again = await run();
      assert.equal(await runtime.fs.readText(copyPath), edited);
      assert.equal(await runtime.fs.readText(config), before);
      assert.match(again.text, /\+ builtin\/angular-http: \.ambicode\/policies\/angular\/angular-http\.yaml kept \(edited or existing\)$/m);
    } finally {
      await repo.dispose();
    }
  });

  it('reports a built-in whose externalVersion differs from the copy, without touching the copy', async () => {
    const { repo, runtime, run } = await angularRepo();
    try {
      await run();
      const copyPath = path.join(repo.root, '.ambicode/policies/angular/angular-http.yaml');
      const old = (await runtime.fs.readText(copyPath)).replace('"angular-v2"', '"angular-v0"');
      await runtime.fs.writeText(copyPath, old);
      const again = await run();
      assert.match(again.text, /kept \(edited or existing\); builtin\/angular-http is angular-v2, your copy is angular-v0/);
      assert.equal(await runtime.fs.readText(copyPath), old);
    } finally {
      await repo.dispose();
    }
  });

  it('a copy and a builtin/<id> reference for the same pack resolve to one pack, the copy', async () => {
    const { repo, runtime, run } = await angularRepo();
    try {
      await run();
      const project = { ...parseConfig(await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'))).projects[0]!, packs: ['builtin/angular-http'] };
      const loaded = await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: repo.root });
      assert.deepEqual(loaded.diagnostics, []);
      const same = loaded.packs.filter((pack) => pack.pack.id === 'angular-http');
      assert.equal(same.length, 1);
      assert.equal(same[0]!.origin, 'project');
    } finally {
      await repo.dispose();
    }
  });

  it('a copy the user took out of policyFiles stays out on the next run and is reported as not listed', async () => {
    const { repo, runtime, config, run } = await angularRepo();
    try {
      await run();
      const document = parseDocument(await runtime.fs.readText(config));
      const list = document.getIn(['projects', 0, 'policyFiles']) as { items: { value: string }[] };
      list.items = list.items.filter((item) => !item.value.includes('common-code'));
      await runtime.fs.writeText(config, document.toString());
      const again = await run();
      assert.ok(!parseConfig(await runtime.fs.readText(config)).projects[0]!.policyFiles.some((file) => file.includes('common-code')));
      assert.match(again.text, /builtin\/common-code: \.ambicode\/policies\/common\/common-code\.yaml kept, not listed in policyFiles/);
    } finally {
      await repo.dispose();
    }
  });

  it('a listed copy from the flat layout stands for the built-in: no second copy is written and the pack set loads clean', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{"dependencies":{"@angular/core":"^20.0.0"}}\n');
      await repo.write('src/app/a.service.ts', 'export class A {}\n');
      const runtime = await createRuntime({ cwd: repo.root });
      const builtin = await runtime.fs.readText(path.join(builtinPoliciesDirectory(runtime.pluginRoot), 'angular', 'angular-http.yaml'));
      await repo.write('.ambicode/policies/angular-http.yaml', builtin.replace(/^id: .*$/m, (line) => `${line}\nreplaces: builtin/angular-http`));
      await repo.commitAll('base');
      const config = await initConfig(runtime, NO_PACKS);
      const document = parseDocument(await runtime.fs.readText(config));
      document.setIn(['projects', 0, 'policyFiles'], document.createNode(['.ambicode/policies/angular-http.yaml']));
      await runtime.fs.writeText(config, document.toString());
      const out = await configPacksCommand.run(runtime, parseArgs('config packs', [], configPacksCommand.options));
      assert.match(out.text, /builtin\/angular-http: \.ambicode\/policies\/angular-http\.yaml kept/);
      assert.ok(!(await runtime.fs.exists(path.join(repo.root, '.ambicode/policies/angular/angular-http.yaml'))));
      const project = parseConfig(await runtime.fs.readText(config)).projects[0]!;
      const loaded = await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: repo.root });
      assert.deepEqual(loaded.diagnostics, []);
    } finally {
      await repo.dispose();
    }
  });
});
