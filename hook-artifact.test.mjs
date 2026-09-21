// Built-artifact regression test for `ambicode hook` (doc 04 P2.4
// correction G/H; K.5): runs the actual bundled CLI (`scripts/ambicode.mjs`),
// piping real PostToolUse/SessionStart JSON to its stdin exactly the way
// `hooks/hooks.json` invokes it, never the TypeScript source directly.
//
// Proves, against the real bundled artifact:
//   1. A matching edit reminder is delivered once.
//   2. A repeated edit of the same file is suppressed.
//   3. A changed rule content hash redelivers it.
//   4. A context reset (SessionStart) redelivers it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(ROOT, 'scripts', 'ambicode.mjs');

async function exists(candidate) {
  return stat(candidate).then(() => true, () => false);
}

function git(args, cwd) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x.com', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x.com' },
  });
}

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
      '    remindOnEdit: true',
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
  await writeFile(
    path.join(repo, '.ambicode', 'config.yaml'),
    [
      'schemaVersion: 1',
      'baseline: ""',
      'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
      'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
      'page: { idleTimeoutSeconds: 1800 }',
      'requirements: { mcpServer: null }',
      'authoring: { editReminders: true }',
      'projects:',
      '  - id: app',
      '    root: .',
      '    ecosystem: typescript',
      '    packs: []',
      '    policyFiles: [".ambicode/policies/reminders.yaml"]',
      '    commands: { lint: null, unit: null, e2e: null }',
      '    checks: { lint: null, unit: null, e2e: null }',
      'remoteChecks: { image: null }',
      '',
    ].join('\n'),
  );
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
    assert.ok(await exists(BUNDLE), `${BUNDLE} does not exist; run "npm run build" first.`);
  });

  it('delivers once, suppresses a repeat, redelivers on rule-content change, and redelivers after a context reset', async () => {
    const repo = await makeFixtureRepo();
    const sessionId = randomUUID();
    const filePath = path.join(repo, 'src', 'orders', 'service.ts');
    const postToolUse = () => ({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      cwd: repo,
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
    });

    try {
      const first = JSON.parse(runHookCli(postToolUse()));
      assert.equal(first.hookSpecificOutput?.hookEventName, 'PostToolUse');
      assert.match(first.hookSpecificOutput?.additionalContext ?? '', /orders-reminders\/service-boundary/);

      const second = JSON.parse(runHookCli(postToolUse()));
      assert.deepEqual(second, {}, 'a repeated edit of the same file must be suppressed');

      await writePack(repo, 'Keep orders logic in the service layer, without exception.');
      const third = JSON.parse(runHookCli(postToolUse()));
      assert.equal(third.hookSpecificOutput?.hookEventName, 'PostToolUse', 'a changed rule content hash must redeliver');

      const reset = JSON.parse(runHookCli({ hook_event_name: 'SessionStart', session_id: sessionId }));
      assert.deepEqual(reset, {});
      const fourth = JSON.parse(runHookCli(postToolUse()));
      assert.equal(fourth.hookSpecificOutput?.hookEventName, 'PostToolUse', 'a context reset must redeliver');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports the packaged plugin\'s hooks when installed (companion to install-local.smoke.mjs)', () => {
    // The exact registration is proved end to end by install-local.smoke.mjs
    // ("claude plugin details" reporting "Hooks (4)"); this just proves the
    // manifest file itself is well-formed JSON with the four events wired to
    // the same bundled entry point, since that is what ships in the candidate.
    const manifest = JSON.parse(execFileSync('cat', [path.join(ROOT, 'hooks', 'hooks.json')], { encoding: 'utf8' }));
    const events = Object.keys(manifest.hooks);
    assert.deepEqual(events.sort(), ['PostCompact', 'PostToolUse', 'SessionEnd', 'SessionStart']);
    for (const event of events) {
      for (const matcher of manifest.hooks[event]) {
        for (const entry of matcher.hooks) {
          assert.equal(entry.type, 'command');
          assert.equal(entry.command, '${CLAUDE_PLUGIN_ROOT}/bin/ambicode hook');
        }
      }
    }
  });
});
