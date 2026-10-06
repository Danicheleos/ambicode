import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
// @ts-expect-error untyped fixture modules
import { FIXTURES } from '../../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../../fixtures/materialize.mjs';
import { createRuntime } from '#composition/root';
import { parseArgs } from '#cli/args';
import { renderInit, runInit } from '#cli/commands/config/init';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseConfig } from '../load.ts';
import { buildProposal, MAX_PROPOSAL_BYTES, writeConfig } from './proposal.ts';
import { INIT_OPTIONS } from '#cli/types/commands';

const FIELDS = ['command', 'mode', 'configPath', 'configState', 'projects', 'ruleSources', 'gitignore', 'index', 'searchLayers', 'acceptanceField', 'removedFields', 'changes', 'notices', 'noticesOmitted', 'values', 'applyLine'];
const V1 = [
  '# the team config',
  'schemaVersion: 1',
  'baseline: origin/main # keep',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'page: { idleTimeoutSeconds: 1800, port: 45831 }',
  'requirements: { mcpServer: jira, lsp: [typescript-lsp@claude-plugins-official] }',
  'remoteChecks: { image: null }',
  'projects:',
  '  - id: app',
  '    root: .',
  '    ecosystem: typescript',
  '    commands: { lint: null, unit: { argv: ["./run-unit"] } } # mine',
  '',
].join('\n');

async function repoWith(files: Record<string, string>): Promise<TempRepo> {
  const repo = await TempRepo.create();
  for (const [file, text] of Object.entries({ 'src/app.ts': 'export const a = 1;\n', ...files })) await repo.write(file, text);
  await repo.commitAll('initial');
  return repo;
}

describe('09-P: the proposal', () => {
  it('09-P1/09-P2/D1: init and init --dry-run print every field and write nothing; missing config is input', async () => {
    const repo = await repoWith({});
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      for (const flags of [[], ['--dry-run']]) {
        const output = await runInit(runtime, parseArgs('init', flags, INIT_OPTIONS));
        assert.ok(output.mode === 'dry-run');
        assert.deepEqual(Object.keys(output).sort(), [...FIELDS].sort());
        assert.equal(output.configState, 'missing');
        assert.match(renderInit(output), /dry run: nothing was written/);
      }
      assert.equal(execFileSync('git', ['status', '--porcelain', '--ignored'], { cwd: repo.root, encoding: 'utf8' }), '');
    } finally {
      await repo.dispose();
    }
  });

  it('09-C6: the proposal names no language server and prints no navigation block', async () => {
    const repo = await repoWith({ 'package.json': '{}\n' });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));
      const text = `${renderInit(output)}\n${JSON.stringify(output)}`;
      assert.doesNotMatch(text, /lsp|language server|code intelligence/i);
    } finally {
      await repo.dispose();
    }
  });

  it('09-P3/09-P4: a found codeindex with 5-I pending proposes none; an explicit override adds both index layers', async () => {
    const repo = await repoWith({ 'node_modules/.bin/codeindex': '#!/bin/sh\n' });
    try {
      execFileSync('chmod', ['+x', path.join(repo.root, 'node_modules/.bin/codeindex')]);
      const runtime = await createRuntime({ cwd: repo.root });
      const plain = await buildProposal(runtime, repo.root, []);
      assert.equal(plain.index.tool, 'codeindex');
      assert.equal(plain.index.proposed, 'none');
      assert.equal(plain.index.decision5I, 'pending');
      assert.ok(!plain.searchLayers.prompt.includes('index.find'));
      const chosen = await buildProposal(runtime, repo.root, [{ key: 'search.index', value: 'codeindex' }]);
      assert.equal(chosen.index.proposed, 'codeindex');
      assert.equal(chosen.searchLayers.prompt.at(-1), 'index.find');
      assert.equal(chosen.searchLayers.context.at(-1), 'index.relates');
      assert.equal(chosen.values, 'search.index="codeindex"');
    } finally {
      await repo.dispose();
    }
  });

  it('amended 05-A8/09-P3: a real codeindex scan (fileCount, a languages histogram) fills profile.index', async () => {
    const repo = await repoWith({ 'node_modules/.bin/codeindex': '#!/bin/sh\n' });
    try {
      execFileSync('chmod', ['+x', path.join(repo.root, 'node_modules/.bin/codeindex')]);
      const summary = { engineVersion: '2.31.4', fileCount: 2, languages: { typescript: 1, markdown: 1 }, capped: false, excluded: 0, skipped: {} };
      const actual = new NodeProcessRunner();
      const runner = { run: (request: Parameters<typeof actual.run>[0]) => (request.argv.includes('scan') ? Promise.resolve({ kind: 'exited' as const, exitCode: 0, stdout: JSON.stringify(summary), stderr: '', truncated: false, durationMs: 0, failure: null }) : actual.run(request)) };
      const runtime = await createRuntime({ cwd: repo.root, runner });
      const proposal = await buildProposal(runtime, repo.root, []);
      assert.equal(proposal.index.tool, 'codeindex');
      assert.deepEqual(proposal.projects[0]?.profile?.index, { tool: 'codeindex', files: 2, languages: ['markdown', 'typescript'] });
    } finally {
      await repo.dispose();
    }
  });

  it('09-P4: an existing file keeps its explicit layer lists; an index change adds or removes only the index layers', async () => {
    const repo = await repoWith({});
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const configPath = path.join(repo.root, '.ambicode/config.yaml');
      const text = await runtime.fs.readText(configPath);
      await runtime.fs.writeText(configPath, text.replace(/prompt:\n(\s+- \S+\n)+/, 'prompt:\n      - grep\n'));
      const on = [{ key: 'search.index', value: 'codeindex' }] as const;
      const added = await buildProposal(runtime, repo.root, on);
      assert.deepEqual(added.searchLayers.prompt, ['grep', 'index.find']);
      await writeConfig(runtime.fs, repo.root, added, on);
      const off = [{ key: 'search.index', value: 'none' }] as const;
      const removed = await buildProposal(runtime, repo.root, off);
      assert.deepEqual(removed.searchLayers.prompt, ['grep']);
      assert.ok(!removed.searchLayers.context.includes('index.relates'));
    } finally {
      await repo.dispose();
    }
  });

  it('09-P5: the JSON proposal stays within 6,144 bytes on every fixture', { timeout: 600_000 }, async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-proposal-'));
    try {
      for (const fixture of FIXTURES as { name: string }[]) {
        const destination = path.join(parent, fixture.name);
        await materialize(fixture, destination);
        const runtime = await createRuntime({ cwd: destination });
        const proposal = await buildProposal(runtime, destination, []);
        assert.ok(Buffer.byteLength(JSON.stringify(proposal)) <= MAX_PROPOSAL_BYTES, `${fixture.name}: ${Buffer.byteLength(JSON.stringify(proposal))} bytes`);
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('09-C: the writer', () => {
  it('09-C2: a fresh config is schema 3 with every v3 field and no requirements.lsp', async () => {
    const repo = await repoWith({ 'package.json': '{}\n' });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.match(text, /^schemaVersion: 3$/m);
      for (const field of [/onInvalid:/, /acceptanceField: null/, /^search:\n\s+index: none/m, /^workers:\n\s+approved: \[\]/m, /^guard:\n\s+askOutsideMap: false/m, /format: null|format:\n/]) assert.match(text, field);
      assert.doesNotMatch(text, /lsp/);
    } finally {
      await repo.dispose();
    }
  });

  it('09-C3: a schema 1 file migrates to 3 with comments and other values kept; removed fields are named', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1 });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const proposal = await buildProposal(runtime, repo.root, []);
      assert.equal(proposal.configState, 'legacy');
      assert.deepEqual(proposal.removedFields, ['requirements.lsp']);
      assert.ok(proposal.changes.includes('Removed "requirements.lsp" (no longer read).'));
      await writeConfig(runtime.fs, repo.root, proposal, []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.match(text, /^# the team config$/m);
      assert.match(text, /^baseline: origin\/main # keep$/m);
      assert.match(text, /# mine/);
      assert.match(text, /mcpServer: jira/);
      assert.match(text, /^schemaVersion: 3$/m);
      assert.doesNotMatch(text, /lsp/);
    } finally {
      await repo.dispose();
    }
  });

  it('09-C4/D17: detection fills missing slots only, an explicit null stays, an accepted --set overrides', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1, 'package.json': JSON.stringify({ scripts: { lint: 'eslint .' } }) });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const plain = await buildProposal(runtime, repo.root, []);
      assert.equal(plain.projects[0]?.commands['lint'], null, 'an explicit null is kept');
      assert.deepEqual(plain.projects[0]?.commands['unit'], ['./run-unit']);
      const set = [{ key: 'projects.app.commands.lint', value: ['./lint'] }, { key: 'requirements.mcpServer', value: null }] as const;
      const overridden = await buildProposal(runtime, repo.root, set);
      assert.deepEqual(overridden.projects[0]?.commands['lint'], ['./lint']);
      assert.ok(overridden.changes.includes('Set "projects.app.commands.lint" to ["./lint"] (accepted).'));
      await writeConfig(runtime.fs, repo.root, overridden, set);
      assert.match(await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml')), /mcpServer: null/);
      await assert.rejects(buildProposal(runtime, repo.root, [{ key: 'projects.web.commands.lint', value: null }]), (error: { code?: string }) => error.code === 'bad-argument');
    } finally {
      await repo.dispose();
    }
  });

  it('09-C3/09-C4: a backfilled format slot leaves the existing argv array and comment byte-exact', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1, 'package.json': '{}\n' });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const line = (await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'))).split('\n').find((candidate) => candidate.includes('commands:'))!;
      assert.match(line, /argv: \["\.\/run-unit"\]/);
      assert.match(line, /format: null/);
      assert.match(line, /# mine$/);
    } finally {
      await repo.dispose();
    }
  });

  it('09-C3: two unchanged arrays with equal values keep their own source spacing', async () => {
    const unit = '      unit: { argv: [ "npm", "test" ] } # padded';
    const e2e = "      e2e: { argv: ['npm','test'] } # compact";
    const config = V1.replace('    commands: { lint: null, unit: { argv: ["./run-unit"] } } # mine', ['    commands:', unit, e2e, '      lint: null', '      format: null'].join('\n'));
    const repo = await repoWith({ '.ambicode/config.yaml': config });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.ok(text.includes(`${unit}\n${e2e}\n`), text);
    } finally {
      await repo.dispose();
    }
  });

  it('09-C3: an anchored array, an array holding an anchor and their aliases survive the migration byte-exact', async () => {
    const unit = '      unit: { argv: &runner ["npm", "test"] }';
    const e2e = '      e2e: { argv: *runner }';
    const lint = '      lint: { argv: ["npx", &linter "eslint", "."] }';
    const format = ['      format:', '        argv:', '          - *linter', '          - "--fix"'].join('\n');
    const config = V1.replace('    commands: { lint: null, unit: { argv: ["./run-unit"] } } # mine', ['    commands:', unit, e2e, lint, format].join('\n'));
    const repo = await repoWith({ '.ambicode/config.yaml': config });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.ok(text.includes(`${unit}\n${e2e}\n${lint}\n`), text);
      const commands = parseConfig(text).projects[0]!.commands;
      assert.deepEqual([commands.e2e?.argv, commands.lint?.argv, commands.format?.argv], [['npm', 'test'], ['npx', 'eslint', '.'], ['eslint', '--fix']]);
    } finally {
      await repo.dispose();
    }
  });

  it('09-C5: schemaVersion 4 refuses the dry run and the writer, writing nothing', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1.replace('schemaVersion: 1', 'schemaVersion: 4') });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await assert.rejects(runInit(runtime, parseArgs('init', ['--dry-run'], INIT_OPTIONS)), (error: { code?: string }) => error.code === 'config-schema-too-new');
      assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo.root, encoding: 'utf8' }), '');
    } finally {
      await repo.dispose();
    }
  });
});
