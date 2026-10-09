import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { FIXTURE_PROPOSAL } from '#testing/fixtures/init-config';
import type { ProposalInput } from '#types/modules/config';
import { parseConfig } from '../load.ts';
import { buildProposal, configFileState, parseProposal, validateProposal, writeConfig } from './proposal.ts';
import { MAX_SCAN_BYTES, scanRepository } from './scan.ts';

const V1 = [
  '# the team config',
  'schemaVersion: 1',
  'baseline: origin/main # keep',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'requirements: { mcpServer: jira, lsp: [typescript-lsp@claude-plugins-official] }',
  'projects:',
  '  - id: app',
  '    root: .',
  '    ecosystem: typescript',
  '    commands: { lint: null, unit: { argv: ["./run-unit"] } } # mine',
  '',
].join('\n');

const proposalWith = (commands: Record<string, string[] | null>): ProposalInput => ({ ...FIXTURE_PROPOSAL, projects: [{ ...FIXTURE_PROPOSAL.projects[0]!, commands }] });

async function repoWith(files: Record<string, string>): Promise<TempRepo> {
  const repo = await TempRepo.create();
  for (const [file, text] of Object.entries({ 'src/app.ts': 'export const a = 1;\n', ...files })) await repo.write(file, text);
  await repo.commitAll('initial');
  return repo;
}

describe('init proposal from the model', () => {
  it('a fresh config is schema 3 with the proposed project, null slots, and no search section; building it writes nothing', async () => {
    const repo = await repoWith({});
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const proposal = await buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []);
      assert.equal(proposal.configState, 'missing');
      assert.equal(execFileSync('git', ['status', '--porcelain', '--ignored'], { cwd: repo.root, encoding: 'utf8' }), '');
      await writeConfig(runtime.fs, repo.root, proposal, []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.match(text, /^schemaVersion: 3$/m);
      for (const field of [/onInvalid:/, /acceptanceField: null/, /^guard:\n\s+askOutsideMap: false/m, /format: null/, /typecheck: null/]) assert.match(text, field);
      assert.doesNotMatch(text, /^search:|lsp|^workers:/m);
      const project = parseConfig(text).projects[0]!;
      assert.deepEqual([project.id, project.packs], ['app', ['builtin/common-quality', 'builtin/common-checks']]);
    } finally {
      await repo.dispose();
    }
  });

  it('proposed commands become config slots: test is unit, lint gets a check, an unknown ecosystem is generic', async () => {
    const repo = await repoWith({});
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const input = { ...proposalWith({ test: ['vitest', 'related', '--run', '{files}'], lint: ['eslint', '--', '{files}'], typecheck: ['tsc', '--noEmit'] }), requirements: { mcpServer: 'atlassian' } };
      input.projects[0]!.ecosystem = 'Go';
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, input, []), []);
      const config = parseConfig(await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml')));
      const project = config.projects[0]!;
      assert.equal(project.ecosystem, 'generic');
      assert.deepEqual(project.commands['unit'], { argv: ['vitest', 'related', '--run', '{files}'] });
      assert.deepEqual(project.commands['typecheck'], { argv: ['tsc', '--noEmit'] });
      assert.equal(project.checks['lint']?.adapter, 'eslint');
      assert.equal(project.checks['unit']?.adapter, 'vitest');
      assert.equal(config.requirements.mcpServer, 'atlassian');
    } finally {
      await repo.dispose();
    }
  });

  it('a schema 1 file migrates to 3 with comments and other values kept; removed fields are named', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1 });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const proposal = await buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []);
      assert.equal(proposal.configState, 'legacy');
      assert.ok(proposal.notices.includes('config-field-removed: requirements.lsp'));
      await writeConfig(runtime.fs, repo.root, proposal, []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      for (const kept of [/^# the team config$/m, /^baseline: origin\/main # keep$/m, /# mine/, /mcpServer: jira/, /^schemaVersion: 3$/m]) assert.match(text, kept);
      assert.doesNotMatch(text, /lsp/);
    } finally {
      await repo.dispose();
    }
  });

  it('a proposal fills missing slots only, an explicit null stays, an accepted --set overrides', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1 });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const input = proposalWith({ lint: ['./lint'], test: ['./other'], typecheck: ['./tsc'] });
      const plain = await buildProposal(runtime, repo.root, input, []);
      assert.ok(plain.changes.some((change) => change.includes('"typecheck" command')));
      await writeConfig(runtime.fs, repo.root, plain, []);
      const kept = parseConfig(await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'))).projects[0]!.commands;
      assert.equal(kept['lint'], null, 'an explicit null is kept');
      assert.deepEqual(kept['unit'], { argv: ['./run-unit'] }, 'a set command is kept');
      const set = [{ key: 'projects.app.commands.lint', value: ['./lint'] }] as const;
      const overridden = await buildProposal(runtime, repo.root, input, set);
      assert.ok(overridden.changes.includes('Set "projects.app.commands.lint" to ["./lint"] (accepted).'));
      await assert.rejects(buildProposal(runtime, repo.root, input, [{ key: 'projects.web.commands.lint', value: null }]), (error: { code?: string }) => error.code === 'bad-argument');
    } finally {
      await repo.dispose();
    }
  });

  it('re-init adds a project at a new root, the missing authoring section and the proposed packs; a set shortlist and editReminders: false stay', async () => {
    const existing = [
      'schemaVersion: 3',
      'baseline: origin/main',
      'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288, onInvalid: void }',
      'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
      'requirements: { mcpServer: null, acceptanceField: null }',
      'guard: { askOutsideMap: false }',
      'projects:',
      '  - id: app',
      '    root: .',
      '    ecosystem: typescript',
      '    packs: [builtin/common-quality]',
      '    shortlist: { include: ["lib/**"], exclude: [] }',
      'authoring: { editReminders: false }',
      '',
    ].join('\n');
    const repo = await repoWith({ '.ambicode/config.yaml': existing, 'services/api/main.py': 'x = 1\n' });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const input = { ...FIXTURE_PROPOSAL, projects: [...FIXTURE_PROPOSAL.projects, { id: 'api', root: 'services/api', ecosystem: 'python', shortlist: ['**/*.py'], commands: {}, packs: ['builtin/python-quality'] }] };
      const proposal = await buildProposal(runtime, repo.root, input, []);
      assert.ok(proposal.changes.includes('Added project "api" for root "services/api".'));
      assert.ok(proposal.changes.some((change) => change.startsWith('Enabled builtin/common-checks')));
      await writeConfig(runtime.fs, repo.root, proposal, []);
      const config = parseConfig(await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml')));
      assert.deepEqual(config.projects.map((project) => project.id), ['app', 'api']);
      assert.deepEqual(config.projects[0]!.shortlist?.include, ['lib/**']);
      assert.equal(config.authoring.editReminders, false);
      assert.equal(config.projects[1]!.ecosystem, 'python');
      const again = await buildProposal(runtime, repo.root, input, []);
      assert.deepEqual(again.changes, [], 'a second run proposes nothing');
    } finally {
      await repo.dispose();
    }
  });

  it('an old config without an authoring section gets the documented default, visibly', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1 });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const proposal = await buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []);
      assert.ok(proposal.changes.includes('Added "authoring.editReminders: true" (the documented default).'));
    } finally {
      await repo.dispose();
    }
  });

  it('two unchanged arrays with equal values and an anchored array keep their own source bytes', async () => {
    const unit = '      unit: { argv: [ "npm", "test" ] } # padded';
    const e2e = "      e2e: { argv: ['npm','test'] } # compact";
    const anchored = '      lint: { argv: ["npx", &linter "eslint", "."] }';
    const format = ['      format:', '        argv:', '          - *linter', '          - "--fix"'].join('\n');
    const config = V1.replace('    commands: { lint: null, unit: { argv: ["./run-unit"] } } # mine', ['    commands:', unit, e2e, anchored, format].join('\n'));
    const repo = await repoWith({ '.ambicode/config.yaml': config });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []), []);
      const text = await runtime.fs.readText(path.join(repo.root, '.ambicode/config.yaml'));
      assert.ok(text.includes(`${unit}\n${e2e}\n${anchored}\n`), text);
      assert.deepEqual(parseConfig(text).projects[0]!.commands['format']?.argv, ['eslint', '--fix']);
    } finally {
      await repo.dispose();
    }
  });

  it('schemaVersion 4 refuses the proposal, writing nothing', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': V1.replace('schemaVersion: 1', 'schemaVersion: 4') });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await assert.rejects(buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []), (error: { code?: string }) => error.code === 'config-schema-too-new');
      assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo.root, encoding: 'utf8' }), '');
    } finally {
      await repo.dispose();
    }
  });

  it('an unparsable file raises config-unparsable unless regenerate is asked for', async () => {
    const repo = await repoWith({ '.ambicode/config.yaml': 'schemaVersion: [3\n' });
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      assert.equal((await configFileState(runtime.fs, repo.root)).parses, false);
      await assert.rejects(buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, []), (error: { code?: string }) => error.code === 'config-unparsable');
      assert.equal((await buildProposal(runtime, repo.root, FIXTURE_PROPOSAL, [], { regenerate: true })).configState, 'unparsable-backed-up');
    } finally {
      await repo.dispose();
    }
  });
});

describe('proposal validation names the field', () => {
  const YAML = 'projects:\n  - id: app\n    root: .\n    ecosystem: typescript\n    packs: [builtin/common-quality]\n';

  it('reads the YAML bare or inside a yaml fence and applies the defaults', () => {
    for (const text of [YAML, `Here it is:\n\`\`\`yaml\n${YAML}\`\`\`\n`]) {
      const input = parseProposal(text);
      assert.deepEqual([input.projects[0]!.shortlist, input.projects[0]!.commands, input.requirements.mcpServer], [[], {}, null]);
    }
  });

  it('refuses an unknown key, a bad id and a non-argv command, each naming its field', () => {
    const refuses = (text: string, field: string): void => assert.throws(() => parseProposal(text), (error: { code?: string; field?: string }) => error.code === 'init-proposal-invalid' && error.field === field, field);
    refuses(`${YAML}    framework: angular\n`, 'projects.0');
    refuses(YAML.replace('id: app', 'id: App'), 'projects.0.id');
    refuses(`${YAML}    commands: { lint: "eslint ." }\n`, 'projects.0.commands.lint');
    refuses('projects: []\n', 'projects');
    refuses('projects: [', 'yaml');
  });

  it('refuses an unknown pack, a missing root, a repeated id and a command that does not start', async () => {
    const repo = await repoWith({});
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const refuses = async (text: string, field: string): Promise<void> => {
        await assert.rejects(validateProposal(runtime, repo.root, parseProposal(text)), (error: { code?: string; field?: string }) => error.code === 'init-proposal-invalid' && error.field === field, field);
      };
      await refuses(YAML.replace('common-quality', 'no-such-pack'), 'projects.0.packs');
      await refuses(YAML.replace('root: .', 'root: nowhere'), 'projects.0.root');
      await refuses(`${YAML}  - id: app\n    root: src\n    ecosystem: x\n`, 'projects.1.id');
      await refuses(`${YAML}    commands: { lint: [no-such-linter, "{files}"] }\n`, 'projects.0.commands.lint');
      await validateProposal(runtime, repo.root, parseProposal(`${YAML}    commands: { format: ["git", "--version"] }\n`));
      await repo.write('node_modules/.bin/eslint', '#!/bin/sh\n');
      execFileSync('chmod', ['+x', path.join(repo.root, 'node_modules/.bin/eslint')]);
      await validateProposal(runtime, repo.root, parseProposal(`${YAML}    commands: { lint: [eslint, "--", "{files}"] }\n`));
    } finally {
      await repo.dispose();
    }
  });
});

describe('the scan', () => {
  it('lists manifests, lockfiles, scripts, tools, packs and rule sources within the byte cap, and skips node_modules and vendor', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'root', scripts: { test: 'vitest run', lint: 'eslint .' } }),
      'package-lock.json': '{}',
      'node_modules/dep/package.json': '{}',
      'vendor/lib/go.mod': 'module x',
      'services/api/pyproject.toml': '[project]\nname="api"\n',
      'services/api/requirements-dev.txt': 'pytest\n',
      'go/go.mod': 'module y\n',
      'CLAUDE.md': '# rules\n',
      'node_modules/.bin/eslint': '#!/bin/sh\n',
    };
    for (let at = 0; at < 60; at += 1) files[`apps/app${at}/package.json`] = JSON.stringify({ name: `app${at}`, scripts: { build: 'x'.repeat(80) } });
    const repo = await repoWith(files);
    try {
      execFileSync('chmod', ['+x', path.join(repo.root, 'node_modules/.bin/eslint')]);
      const status = (): string => execFileSync('git', ['status', '--porcelain'], { cwd: repo.root, encoding: 'utf8' });
      const before = status();
      const runtime = await createRuntime({ cwd: repo.root });
      const text = await scanRepository(runtime, repo.root, await configFileState(runtime.fs, repo.root));
      assert.ok(Buffer.byteLength(text) <= MAX_SCAN_BYTES, `${Buffer.byteLength(text)} bytes`);
      for (const expected of ['package.json (/, apps/app0', '+57', 'pyproject.toml (services/api)', 'requirements-dev.txt (services/api)', 'go.mod (go)', 'package-lock.json', '"test":"vitest run"', 'eslint', 'builtin/python-quality', 'CLAUDE.md', 'config: absent']) assert.ok(text.includes(expected), `${expected} in:\n${text}`);
      assert.ok(!text.includes('node_modules/dep') && !text.includes('vendor/lib'), 'skipped directories');
      assert.equal(status(), before, 'the scan writes nothing');
    } finally {
      await repo.dispose();
    }
  });

  it('reports the config as parsable or unparsable', async () => {
    for (const [raw, word] of [[V1, 'parsable'], ['schemaVersion: [3\n', 'unparsable']] as const) {
      const repo = await repoWith({ '.ambicode/config.yaml': raw });
      try {
        const runtime = await createRuntime({ cwd: repo.root });
        assert.match(await scanRepository(runtime, repo.root, await configFileState(runtime.fs, repo.root)), new RegExp(`config: ${word}$`));
      } finally {
        await repo.dispose();
      }
    }
  });
});
