// Runs the bundled CLI (`scripts/ambicode.mjs`) with real hook JSON on stdin,
// exactly as `hooks/hooks.json` invokes it, never the TypeScript source.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'scripts', 'ambicode.mjs');

/**
 * ENOENT is the only answer that means the bundle is missing; a transient EBUSY,
 * EPERM or EMFILE under many concurrent test files is retried.
 */
async function assertBundleBuilt(candidate) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return (await stat(candidate)).size;
    } catch (error) {
      if (error.code === 'ENOENT') {
        assert.fail(`${candidate} does not exist; run "npm run build" first.`);
      }
      if (attempt >= 4) {
        assert.fail(`${candidate} could not be checked after 5 attempts (${error.code}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function git(args, cwd) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x.com', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x.com' },
  });
}

const RUN = 'model: sonnet, effort: medium, timeoutMinutes: 15';
const CONFIG = [
  'schemaVersion: 4',
  'id: app',
  'context: { maxTotalTokens: 24000, maxFileTokens: 2500 }',
  'skills:',
  `  init: { ${RUN}, scout: { ${RUN} }, ruleSources: [presets, scout, manual, web] }`,
  `  review: { ${RUN}, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null, excludePaths: [] }`,
  `  task: { ${RUN}, checkTimeoutSeconds: 120 }`,
  `  plan: { ${RUN} }`,
  `  investigate: { ${RUN} }`,
  `  rules: { ${RUN} }`,
  'requirements: { runtimes: {}, mcps: [], lsps: [], env: [] }',
  'projects:',
  '  - id: app',
  '    root: .',
  '    paths: [src/]',
  '    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }',
  '    packs: [PACKS]',
  '    policyFiles: [POLICY]',
  '    commands: {}',
  '    checks: { lint: { all: null, file: null }, unit: { all: null, file: null }, e2e: { all: null, file: null } }',
  '',
].join('\n');

async function writePack(repo, instruction) {
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'reminders.yaml'),
    [
      'schemaVersion: 1',
      'id: orders-reminders',
      'authority: team',
      'appliesTo: ["src/orders/**"]',
      'activities: [task]',
      'source: { location: "built-artifact hook fixture" }',
      'rules:',
      '  - id: service-boundary',
      '    category: architecture',
      `    instruction: "${instruction}"`,
      '    check: { kind: reviewer, explanation: "manual read" }',
    ].join('\n') + '\n',
  );
}

async function makeFixtureRepo() {
  const repo = await mkdtemp(path.join(tmpdir(), 'ambicode-hook-artifact-'));
  git(['init', '-q', '--initial-branch=main', '.'], repo);
  await writeFile(path.join(repo, 'package.json'), '{"name":"app","version":"1.0.0"}\n');
  await mkdir(path.join(repo, 'src', 'orders'), { recursive: true });
  await writeFile(path.join(repo, 'src', 'orders', 'service.ts'), 'export const a = 1;\n');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'initial'], repo);

  await mkdir(path.join(repo, '.ambicode', 'policies'), { recursive: true });
  await writeFile(path.join(repo, '.ambicode', 'config.yaml'), CONFIG.replace('PACKS', '').replace('POLICY', '".ambicode/policies/reminders.yaml"'));
  await writePack(repo, 'Keep orders logic in the service layer.');
  return repo;
}

function runHookCli(payload) {
  return execFileSync('node', [BUNDLE, 'hook'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

describe('built-artifact regression: ambicode hook (P2.4 correction G/H)', () => {
  it('requires the bundle to have been built (npm run build) before this test runs', async () => {
    assert.ok((await assertBundleBuilt(BUNDLE)) > 0, `${BUNDLE} is empty`);
  });

  it('delivers the contract once, suppresses a repeat, and redelivers after a context reset', async () => {
    // The Edit/Write reminder branch (and its rule-content redelivery) is gone: it had no matcher in hooks.json
    // (cutting-down audit, wave 1). What the delivered/<kind> marker still guards is the operating contract.
    const repo = await makeFixtureRepo();
    const sessionId = randomUUID();
    const prompt = () => JSON.parse(runHookCli({ hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: repo }));
    try {
      const first = prompt();
      assert.equal(first.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
      assert.match(first.hookSpecificOutput?.additionalContext ?? '', /# AMBICODE operating contract/);
      assert.deepEqual(prompt(), {}, 'a repeated prompt in the same context must not repeat the contract');

      assert.deepEqual(JSON.parse(runHookCli({ hook_event_name: 'PostCompact', session_id: sessionId })), {});
      const afterReset = prompt();
      assert.match(afterReset.hookSpecificOutput?.additionalContext ?? '', /# AMBICODE operating contract/, 'a context reset must redeliver');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('PostCompact returns nothing, and the next UserPromptSubmit carries the contract', async () => {
    // Claude Code's hook schema has no `hookSpecificOutput` variant for PostCompact;
    // returning one is a validation error the user sees on every compaction.
    const repo = await makeFixtureRepo();
    const sessionId = randomUUID();
    try {
      const start = JSON.parse(runHookCli({ hook_event_name: 'SessionStart', session_id: sessionId }));
      assert.equal(start.hookSpecificOutput?.hookEventName, 'SessionStart');

      const compacted = JSON.parse(runHookCli({ hook_event_name: 'PostCompact', session_id: sessionId }));
      assert.deepEqual(compacted, {}, 'PostCompact must carry no hookSpecificOutput');

      const prompt = JSON.parse(
        runHookCli({ hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: repo }),
      );
      assert.equal(prompt.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
      assert.match(prompt.hookSpecificOutput?.additionalContext ?? '', /# AMBICODE operating contract/);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports the packaged plugin\'s hooks when installed (companion to install-local.smoke.mjs)', async () => {
    const manifest = JSON.parse(await readFile(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const events = Object.keys(manifest.hooks);
    assert.deepEqual(events.sort(), [
      'PostCompact',
      'PostToolUse',
      'PreToolUse',
      'SessionEnd',
      'SessionStart',
      'Stop',
      'UserPromptSubmit',
    ]);
    for (const event of events) {
      for (const matcher of manifest.hooks[event]) {
        for (const entry of matcher.hooks) {
          assert.equal(entry.type, 'command');
          assert.equal(entry.command, 'node');
          if (event === 'PreToolUse') {
            assert.deepEqual(entry.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs']);
            if (matcher.matcher === 'Bash') assert.match(entry.if, /^Bash\((git \*|glab mr\*|\*\.ambicode\/\*|\*ambicode\.mjs\*|rm \*|\*--include=\*|\*--exclude=\*|\*--exclude-dir=\*|cat \*|sed \*|head \*|tail \*)\)$/, 'the guard must not spawn for every Bash call');
            else assert.ok(['Write|Edit|MultiEdit|NotebookEdit', 'Read'].includes(matcher.matcher), matcher.matcher);
          } else {
            assert.deepEqual(entry.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs', 'hook']);
          }
        }
      }
    }
  });
});
