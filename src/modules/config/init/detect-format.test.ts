import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { detectProjects } from './detect.ts';

async function formatOf(files: Record<string, string>) {
  const repo = await TempRepo.create();
  try {
    for (const [name, text] of Object.entries(files)) await repo.write(name, text);
    const runtime = await createRuntime({ cwd: repo.root });
    const [project] = await detectProjects(runtime.fs, repo.root);
    return project!.format;
  } finally {
    await repo.dispose();
  }
}

describe('09-E3: formatter detection is keyed by tool (per 03c)', () => {
  it('09-E3: an installed prettier gives its binary with --write -- {files}', async () => {
    const format = await formatOf({ 'package.json': '{"name":"a"}', 'node_modules/.bin/prettier': '#!/bin/sh\n' });
    assert.deepEqual(format?.argv, ['./node_modules/.bin/prettier', '--write', '--', '{files}']);
  });

  it('09-E3: prettier declared but not installed gives a null argv and a notice naming it', async () => {
    const format = await formatOf({ 'package.json': '{"name":"a","devDependencies":{"prettier":"^3"}}' });
    assert.equal(format?.argv, null);
    assert.match(format!.notice, /prettier is declared but not installed/);
  });

  it('09-E3: no formatter and none declared gives null', async () => {
    assert.equal(await formatOf({ 'package.json': '{"name":"a"}' }), null);
  });

  it('09-E3: an installed black gives its venv binary with -- {files}', async () => {
    const format = await formatOf({ 'pyproject.toml': '[project]\nname = "a"\n', '.venv/bin/black': '#!/bin/sh\n' });
    assert.deepEqual(format?.argv, ['./.venv/bin/black', '--', '{files}']);
  });

  it('09-E3: ruff alone gives its venv binary with format -- {files}', async () => {
    const format = await formatOf({ 'pyproject.toml': '[project]\nname = "a"\n', '.venv/bin/ruff': '#!/bin/sh\n' });
    assert.deepEqual(format?.argv, ['./.venv/bin/ruff', 'format', '--', '{files}']);
  });

  it('09-E3: black wins over ruff when both are installed', async () => {
    const format = await formatOf({ 'pyproject.toml': '[project]\nname = "a"\n', '.venv/bin/black': '', '.venv/bin/ruff': '' });
    assert.equal(format?.argv?.[0], './.venv/bin/black');
  });
});
