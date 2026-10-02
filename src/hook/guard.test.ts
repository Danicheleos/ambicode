import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { blockedOperation, guardDecision } from './guard-core.ts';

const asks = [
  'git commit -m "x"',
  'git push origin main',
  'git push --force',
  'git stash',
  'git stash pop',
  'git reset --hard HEAD~1',
  'git checkout -- src/a.ts',
  'git clean -fd',
  'cd repo && git commit --amend',
  'npm test; git push',
  'git -C ../other commit -m x',
  'git -c user.name=a commit -m x',
  'echo done | git stash',
  'glab mr create --fill',
];
const passes = [
  'git status --short',
  'git diff HEAD',
  'git log --oneline -5',
  'git stash list',
  'git stash show -p',
  'git show HEAD',
  'git branch --show-current',
  'git commit-tree',
  'echo "git commit is forbidden"',
  "grep -rn 'git push' docs",
  'node scripts/ambicode.mjs review --branch',
  'glab auth status',
  'ls src',
];

describe('the git-write guard decides on the command text alone', () => {
  for (const command of asks) {
    it(`asks for: ${command}`, () => {
      const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }) as {
        hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string };
      };
      assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /user decides/);
    });
  }
  for (const command of passes) {
    it(`leaves alone: ${command}`, () => {
      assert.equal(blockedOperation(command), null);
      assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }), {});
    });
  }

  it('ignores other tools, other events and malformed input', () => {
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 42 } }), {});
    assert.deepEqual(guardDecision({}), {});
  });
});

describe('the built guard entry', () => {
  const built = new URL('../../scripts/guard.mjs', import.meta.url);
  it('answers on stdin/stdout and survives garbage', { skip: !existsSync(built) }, () => {
    const run = (stdin: string) => execFileSync('node', [built.pathname], { input: stdin, encoding: 'utf8' });
    const asked = JSON.parse(run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } })));
    assert.equal(asked.hookSpecificOutput.permissionDecision, 'ask');
    assert.deepEqual(JSON.parse(run('not json')), {});
  });
});

describe('the task-directory guard sends notes through note save', () => {
  const decide = (tool_name: string, tool_input: Record<string, unknown>) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input }) as {
      hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string };
    };

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/.ambicode/task/ORD-17/investigation_2026-10-02T12-00.md' }],
    ['Write', { file_path: '.ambicode/task/x/plan_t.md' }],
    ['Edit', { file_path: '/repo/.ambicode/task/x/notes.md' }],
    ['MultiEdit', { file_path: 'C:\\repo\\.ambicode\\task\\x\\notes.md' }],
    ['Bash', { command: 'mkdir -p .ambicode/task/X && cat > .ambicode/task/X/inv.md <<EOF\nnote\nEOF' }],
    ['Bash', { command: 'd=.ambicode/task/X; f=$d/inv.md; cat > "$f" <<EOF\nnote\nEOF' }],
    ['Bash', { command: 'echo hi | tee .ambicode/task/X/n.md' }],
    ['Bash', { command: 'rm .ambicode/task/X/plan.md' }],
    ['Write', { file_path: '/repo/.ambicode/task/X/ledger.jsonl' }],
    ['Bash', { command: 'echo \'{"id":"L9","kind":"acceptance"}\' >> .ambicode/task/X/ledger.jsonl' }],
  ] as const) {
    it(`denies ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      const out = decide(tool, input);
      assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /note save/);
    });
  }

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/src/a.ts' }],
    ['Write', { file_path: '/repo/.ambicode/config.yaml' }],
    ['Write', { file_path: '/repo/docs/.ambicode-task-notes.md' }],
    ['Read', { file_path: '/repo/.ambicode/task/x/plan.md' }],
    ['Bash', { command: 'cat .ambicode/task/x/plan.md' }],
    ['Bash', { command: 'ls .ambicode/task && grep -rn foo .ambicode/task/x 2>&1 | head' }],
    ['Bash', { command: 'grep -rn foo .ambicode/task/x > /dev/null' }],
    ['Bash', { command: 'node "/p/scripts/ambicode.mjs" note save --task X --kind investigation <<\'EOF\'\nsee .ambicode/task/X > older\nEOF' }],
    ['Bash', { command: 'echo done > /tmp/out.txt' }],
  ] as const) {
    it(`leaves alone ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      assert.deepEqual(decide(tool, input), {});
    });
  }
});

describe('the task-directory message names a command that runs as written', () => {
  it('substitutes the plugin root the hook was given', () => {
    const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.ambicode/task/x/p.md' } }, '/opt/plugin') as {
      hookSpecificOutput: { permissionDecisionReason: string };
    };
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /node "\/opt\/plugin\/scripts\/ambicode\.mjs" note save/);
  });
});
