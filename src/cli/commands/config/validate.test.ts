import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { configValidateCommand } from './validate.ts';

const project = (lines: string[], id = 'app') => [`  - id: ${id}`, ...lines, '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }', '    packs: []', '    commands: {}'];

async function validate(files: Record<string, string>, projectLines: string[], second?: string[]) {
  const repo = await TempRepo.create();
  try {
    for (const [file, text] of Object.entries(files)) await repo.write(file, text);
    await repo.commitAll('initial');
    const runtime = await createRuntime({ cwd: repo.root });
    const { FIXTURE_CONFIG } = await import('#testing/fixtures/init-config');
    const head = FIXTURE_CONFIG.slice(0, FIXTURE_CONFIG.indexOf('  - id: app'));
    await initConfig(runtime, `${[head.trimEnd(), ...project(projectLines), ...(second ? project(second, 'other') : [])].join('\n')}\n`);
    return await configValidateCommand.run(runtime, parseArgs('config validate', [], configValidateCommand.options));
  } finally {
    await repo.dispose();
  }
}

const CHECKS = '    checks: { unit: { all: "npm test", file: null } }';

describe('config validate warnings', () => {
  it('stays ok when checks exist and every paths and include entry matches a tracked file', async () => {
    const result = await validate({ 'dashboard/src/a.ts': 'x\n' }, ['    root: dashboard', '    paths: [src/]', '    include: ["src/**"]', CHECKS]);
    assert.equal(result.text, 'ok');
    assert.deepEqual((result.data as { warnings: string[] }).warnings, []);
    assert.equal(result.exitCode, 0);
  });

  it('warns on a project with empty checks, without failing', async () => {
    const result = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]', '    checks: {}']);
    assert.match(result.text, /warning: project "app": no checks/);
    assert.notEqual(result.text, 'ok');
    assert.equal(result.exitCode, 0);
  });

  it('warns on a project with no checks key', async () => {
    const result = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]']);
    assert.match(result.text, /no checks/);
  });

  it('warns on a paths entry that matches no tracked file under the root', async () => {
    const result = await validate({ 'dashboard/src/a.ts': 'x\n' }, ['    root: dashboard', '    paths: [dashboard]', CHECKS]);
    assert.match(result.text, /warning: project "app": paths entry "dashboard" matches no tracked file under dashboard/);
    assert.equal(result.exitCode, 0);
  });

  it('warns on an include glob that matches no tracked file under the root', async () => {
    const result = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]', '    include: ["**/*.rs"]', CHECKS]);
    assert.match(result.text, /warning: project "app": include entry "\*\*\/\*\.rs" matches no tracked file/);
  });

  it('warns on a project whose checks are all null', async () => {
    const result = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]', '    checks: { unit: { all: null, file: null } }']);
    assert.match(result.text, /warning: project "app": no checks/);
  });

  it('accepts a null check as unknown beside a configured one, and still warns when every check is null', async () => {
    const mixed = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]', '    checks: { unit: { all: "npm test", file: null }, typecheck: null }']);
    assert.equal(mixed.text, 'ok');
    const allNull = await validate({ 'src/a.ts': 'x\n' }, ['    root: .', '    paths: [src/]', '    checks: { unit: null, typecheck: null }']);
    assert.match(allNull.text, /warning: project "app": no checks/);
  });

  it('warns when projects sharing a root carry identical checks', async () => {
    const lines = ['    root: .', '    paths: [src/]', '    checks: { unit: { all: "./gradlew test", file: null } }'];
    const result = await validate({ 'src/a.ts': 'x\n' }, lines, lines);
    assert.match(result.text, /warning: projects "app", "other": same root \. and identical checks/);
    assert.equal(result.exitCode, 0);
  });

  it('does not warn when projects sharing a root scope their commands differently', async () => {
    const result = await validate(
      { 'src/a.ts': 'x\n' },
      ['    root: .', '    paths: [src/]', '    checks: { unit: { all: "./gradlew :a:test", file: null } }'],
      ['    root: .', '    paths: [src/]', '    checks: { unit: { all: "./gradlew :b:test", file: null } }'],
    );
    assert.equal(result.text, 'ok');
  });
});
