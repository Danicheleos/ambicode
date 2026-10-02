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
