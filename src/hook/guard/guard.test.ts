import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { guardDecision } from './guard-core.ts';
import { fsGuardState } from './guard-state.ts';
import { LEDGER_FILE, type LedgerEntry } from '#types/modules/evidence';
import { ACTIVE_ROUTE_FILE, GUARD_LEDGER_FILE, GUARD_STATE_DIR_NAME, LEDGER_LIMIT, type GuardInput, type GuardState } from '../types/guard.ts';
import { HOOK_STATE_DIR_NAME } from '#types/platform/claude';

type Output = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string } };

// Unit tests read `sed` the GNU way wherever they run; the BSD reading has its own cases.
const bash = (command: string, extra: Partial<GuardInput> = {}, platform = 'linux') =>
  guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra }, undefined, undefined, platform) as Output;
const decisionOf = (out: Output) => out.hookSpecificOutput?.permissionDecision;

const asks = [
  'git commit -m "x"',
  'git push origin main',
  'git push --force',
  'git stash',
  'git stash pop',
  'git stash save wip',
  'git stash drop',
  'git stash push -m wip',
  'git stash -u',
  'git reset --hard HEAD~1',
  'git checkout -- src/a.ts',
  'git clean -fd',
  'git clean -fdx',
  'git rebase main',
  'git merge feature',
  'git branch -D x',
  'git branch --delete --force x',
  'cd repo && git commit --amend',
  'npm test; git push',
  'git -C ../other commit -m x',
  'git -C repo commit -m "x"',
  'git -c user.name=a commit -m x',
  'git --git-dir .git --work-tree . push',
  'echo done | git stash',
  'glab mr create',
  'glab mr create --fill',
  'env GIT_TRACE=1 git push',
  'time git push',
  'if git commit -m x; then echo ok; fi',
  'echo "$(git push)"',
  '/usr/bin/git push',
  'git stash -m list',
  'git stash -mlist',
  'git stash --message show',
  'git stash --message=list',
  'git stash -- list',
  'git stash -q list',
  'git stash "$ACTION"',
  'git status; echo ${X:-$(git push)}',
  'git status; echo "${X:-`git push`}"',
  'git status; echo $(( $(git push) + 1 ))',
];
const passes = [
  'git status',
  'git status --short',
  'git diff',
  'git diff HEAD',
  'git log',
  'git log --oneline -5',
  'git stash list',
  'git stash show -p',
  'git show HEAD',
  'git branch --show-current',
  'git branch -d merged',
  'git commit-tree',
  'echo "git commit"',
  'echo "git commit is forbidden"',
  "grep -rn 'git push' docs",
  'git log 2>&1',
  'git log > /dev/null',
  'node scripts/ambicode.mjs review --branch',
  'glab auth status',
  'ls src',
];

describe('the git-write guard decides on the command structure', () => {
  for (const command of asks) {
    it(`asks for: ${command}`, () => {
      const out = bash(command);
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /user decides/);
    });
  }
  for (const command of passes) {
    it(`leaves alone: ${command}`, () => assert.deepEqual(bash(command), {}));
  }

  it('names the operation it asks about', () => {
    assert.match(bash('git -C repo rebase main').hookSpecificOutput!.permissionDecisionReason, /`git rebase`/);
    assert.match(bash('git branch -D x').hookSpecificOutput!.permissionDecisionReason, /`git branch -D`/);
    assert.match(bash('git stash').hookSpecificOutput!.permissionDecisionReason, /`git stash`/);
    assert.match(bash('git stash pop').hookSpecificOutput!.permissionDecisionReason, /`git stash pop`/);
    assert.match(bash('glab mr create').hookSpecificOutput!.permissionDecisionReason, /`glab mr`/);
  });

  it('asks once per operation and names every one in a compound command', () => {
    const reason = bash('git commit -m x && git push && git push').hookSpecificOutput!.permissionDecisionReason;
    assert.equal(reason.match(/`git push`/g)?.length, 1);
    assert.match(reason, /`git commit`/);
  });

  it('runs the plugin\'s own command held in a variable as written out in full, and says so; the rest still stops', () => {
    const cli = '/x/ambicode/scripts/ambicode.mjs';
    const rewritten = (command: string): string => {
      const out = bash(command);
      assert.equal(decisionOf(out), 'allow', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /ran `\$[ARX]` as the plugin's command written out in full/, command);
      return (out.hookSpecificOutput as unknown as { updatedInput: { command: string } }).updatedInput.command;
    };
    // The four shapes seen in 05_0035 and 06_1010.
    assert.equal(rewritten(`A="node ${cli} read --task N"; $A src/a.ts src/u.ts:130:260; ls src/`), `A="node ${cli} read --task N"; node ${cli} read --task N src/a.ts src/u.ts:130:260; ls src/`);
    assert.equal(rewritten(`A="${cli}"; node "$A" read --task O src/a.ts`), `A="${cli}"; node ${cli} read --task O src/a.ts`);
    assert.equal(rewritten(`R='node ${cli} read --task t'; $R src/a.ts 2>&1 | head -300`), `R='node ${cli} read --task t'; node ${cli} read --task t src/a.ts 2>&1 | head -300`);
    assert.equal(rewritten(`A="node ${cli}"; \${A} read --task t src/a.ts`), `A="node ${cli}"; node ${cli} read --task t src/a.ts`);
    // The rewritten command is judged like any other: a git push after it still asks.
    assert.equal(decisionOf(bash(`R="node ${cli}"; $R read --task t a.ts; git push`)), 'ask');
    // A value the rewrite does not read stays refused with the old message.
    const out = bash(`R=node\\ ${cli}; $R read --task t src/a.ts`);
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /write the plugin's command out in full .*not through `\$R`/);
    assert.equal(decisionOf(bash(`R='node ${cli} read'; $X src/a.ts`)), 'ask');
    assert.equal(decisionOf(bash('G=git; $G push')), 'ask');
  });

  it('ignores other tools, other events and malformed input', () => {
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 42 } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 7 } }), {});
    assert.deepEqual(guardDecision({}), {});
  });
});

describe('rm -r of the working directory or above asks', () => {
  for (const command of ['rm -rf .', 'rm -rf /', 'rm -r ./', 'rm -rf ~', 'rm -rf *', 'rm -fr ..', 'rm --recursive --force .']) {
    it(`asks for: ${command}`, () => {
      const out = bash(command);
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /`rm -r /);
    });
  }
  it('asks for the repository root given as the absolute cwd or an ancestor of it', () => {
    assert.equal(decisionOf(bash('rm -rf /work/repo', { cwd: '/work/repo' })), 'ask');
    assert.equal(decisionOf(bash('rm -rf /work', { cwd: '/work/repo' })), 'ask');
    assert.equal(decisionOf(bash('rm -rf ../repo', { cwd: '/work/repo' })), 'ask');
  });
  for (const command of ['rm -rf dist', 'rm -f .', 'rm -rf ./build/*']) {
    it(`leaves alone: ${command}`, () => assert.deepEqual(bash(command, { cwd: '/work/repo' }), {}));
  }
});

describe('the task-directory guard sends notes through note save', () => {
  const decide = (tool_name: string, tool_input: Record<string, unknown>, extra: Partial<GuardInput> = {}) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra }, undefined, undefined, 'linux') as Output;

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/.ambicode/task/ORD-17/investigation_2026-10-02T12-00.md' }],
    ['Write', { file_path: '.ambicode/task/x/plan_t.md' }],
    ['Edit', { file_path: '/repo/.ambicode/task/x/notes.md' }],
    ['MultiEdit', { file_path: 'C:\\repo\\.ambicode\\task\\x\\notes.md' }],
    ['NotebookEdit', { notebook_path: '/repo/.ambicode/task/x/n.ipynb' }],
    ['Write', { file_path: '/repo/.ambicode/./task/x/notes.md' }],
    ['Write', { file_path: '/repo/src/../.ambicode/task/x/notes.md' }],
    ['Write', { file_path: '/repo/.ambicode/task/x/steps/other.md' }],
    ['Bash', { command: 'echo x > .ambicode/task/T/plan.md' }],
    ['Bash', { command: 'tee .ambicode/task/T/notes.md' }],
    ['Bash', { command: "sed -i 's/a/b/' .ambicode/task/T/notes.md" }],
    ['Bash', { command: 'cp a.md .ambicode/task/T/b.md' }],
    ['Bash', { command: 'mkdir -p .ambicode/task/X && cat > .ambicode/task/X/inv.md <<EOF\nnote\nEOF' }],
    ['Bash', { command: 'echo hi | tee .ambicode/task/X/n.md' }],
    ['Bash', { command: 'rm .ambicode/task/X/plan.md' }],
    ['Bash', { command: 'mv .ambicode/task/X/plan.md /tmp/' }],
    ['Bash', { command: 'cd .ambicode/task/X && echo x > notes.md' }],
    ['Bash', { command: 'echo "$(echo x > .ambicode/task/X/n.md)"' }],
    ['Write', { file_path: '/repo/.ambicode/task/X/ledger.jsonl' }],
    ['Bash', { command: 'echo \'{"id":"L9","kind":"acceptance"}\' >> .ambicode/task/X/ledger.jsonl' }],
    ['Bash', { command: 'git push && echo x > .ambicode/task/X/n.md' }],
    ['Bash', { command: 'cd /tmp > .ambicode/task/T/x' }],
    ['Bash', { command: 'cd /tmp 2> .ambicode/task/T/x' }],
    ['Bash', { command: 'cd /tmp >> .ambicode/task/T/x' }],
    ['Bash', { command: 'pushd /tmp > .ambicode/task/T/x' }],
    ['Bash', { command: 'cd .ambicode/task/T &> .ambicode/task/T/x' }],
    ['Bash', { command: 'env -C .ambicode/task/T tee notes.md </dev/null' }],
    ['Bash', { command: 'env --chdir=.ambicode/task/T tee notes.md' }],
    ['Bash', { command: 'sudo -D.ambicode/task/T tee notes.md' }],
    ['Bash', { command: 'cd .ambicode && (cd task/T && tee notes.md)' }],
    ['Bash', { command: 'cp a.md -t.ambicode/task/T' }],
    ['Bash', { command: 'mv a.md -t.ambicode/task/T' }],
    ['Bash', { command: 'cp a.md --target-directory .ambicode/task/T' }],
    ['Bash', { command: 'cp -rt.ambicode/task/T a.md' }],
  ] as const) {
    it(`denies ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      const out = decide(tool, input);
      assert.equal(decisionOf(out), 'deny');
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /note save/);
    });
  }

  it('resolves relative targets against the hook cwd', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'echo x > notes.md' }, { cwd: '/repo/.ambicode/task/X' })), 'deny');
    assert.equal(decisionOf(decide('Write', { file_path: 'notes.md' }, { cwd: '/repo/.ambicode/task/X' })), 'deny');
    assert.deepEqual(decide('Bash', { command: 'echo x > notes.md' }, { cwd: '/repo/docs' }), {});
  });

  // G14: an opaque target may or may not be the task directory; asking costs a click, denying costs a legitimate write.
  for (const command of [
    'echo x > $OUT',
    'd=.ambicode/task/X; f=$d/inv.md; cat > "$f" <<EOF\nnote\nEOF',
    'cp a.md $DIR',
    'tee "${TARGET}"',
    'echo x > "$ROOT/.ambicode/task/X/n.md"',
    'cd "$D" && echo x > notes.md',
    'cd /tmp > "$OUT"',
    'pushd /tmp 2> $ERR',
    'cp a.md -t"$D"',
    'env -C "$D" tee notes.md',
    'f() { cd /tmp; }; echo x > notes.md',
  ]) {
    it(`asks, never denies, for an opaque write target: ${JSON.stringify(command).slice(0, 60)}`, () => {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot tell where this writes/);
    });
  }

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/src/a.ts' }],
    ['Write', { file_path: '/repo/.ambicode/config.yaml' }],
    ['Write', { file_path: '/repo/.gitignore' }],
    ['Write', { file_path: '/repo/docs/.ambicode-task-notes.md' }],
    ['Read', { file_path: '/repo/.ambicode/task/x/plan.md' }],
    ['Bash', { command: 'cat .ambicode/task/x/plan.md' }],
    ['Bash', { command: 'ls .ambicode/task && grep -rn foo .ambicode/task/x 2>&1 | head' }],
    ['Bash', { command: 'grep -rn foo .ambicode/task/x > /dev/null' }],
    ['Bash', { command: 'node "/p/scripts/ambicode.mjs" note save --task X --kind investigation <<\'EOF\'\nsee .ambicode/task/X > older\nEOF' }],
    ['Bash', { command: 'echo done > /tmp/out.txt' }],
    ['Bash', { command: 'grep foo > out.txt' }],
    ['Bash', { command: 'echo ".ambicode/task"' }],
    ['Bash', { command: 'cp .ambicode/task/X/plan.md /tmp/plan.md' }],
    ['Bash', { command: "sed -i 's#.ambicode/task/#x#' src/a.ts" }],
    ['Bash', { command: 'cp -- --target-directory=.ambicode/task/T outside-copy' }],
    ['Bash', { command: '(cd .ambicode/task/T); echo x > notes.md' }],
    ['Bash', { command: 'cd .ambicode/task/T | cat; echo x > notes.md' }],
    ['Bash', { command: 'echo "$(echo x > notes.md)"; cd .ambicode/task/T' }],
    ['Bash', { command: 'cd .ambicode/task/T & echo x > notes.md' }],
    ['Bash', { command: 'env -C .ambicode/task/T cat notes.md > copy.md' }],
    ['Bash', { command: 'cd .ambicode/task/T &> x' }],
  ] as const) {
    it(`leaves alone ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      assert.deepEqual(decide(tool, input), {});
    });
  }
});

describe('directory changes stay in their own shell scope', () => {
  const inTask = { cwd: '/repo/.ambicode/task/T' };
  const outside = { cwd: '/repo' };
  it('a subshell or sibling substitution that leaves the task directory does not move the write after it', () => {
    assert.equal(decisionOf(bash('(cd /tmp); : .ambicode/task; echo x > notes.md', inTask)), 'deny');
    assert.equal(decisionOf(bash('echo "$(cd /tmp)" "$(echo x > notes.md)"; : .ambicode/task', inTask)), 'deny');
    assert.equal(decisionOf(bash('cd /tmp | cat; echo x > notes.md', inTask)), 'deny');
    assert.equal(decisionOf(bash('cd /tmp & echo x > notes.md', inTask)), 'deny');
  });
  it('a directory change in the shell itself moves later writes', () => {
    assert.deepEqual(bash('cd /tmp && echo x > notes.md', inTask), {});
    assert.deepEqual(bash('cd /tmp || exit 1; echo x > notes.md', inTask), {});
    assert.deepEqual(bash('cd /tmp || { echo no; return 1; }; echo x > notes.md', inTask), {});
    assert.equal(decisionOf(bash('cd .ambicode/task/T && echo x > notes.md', outside)), 'deny');
    assert.equal(decisionOf(bash('cd .ambicode && (cd task/T && tee n.md)', outside)), 'deny');
  });
  it('the last element of a pipeline may run in the shell (zsh, lastpipe), so its cd leaves later writes unplaced', () => {
    assert.equal(decisionOf(bash('cat x | cd /tmp; echo x > notes.md', inTask)), 'ask');
  });
  it('a cd that may not run (after && or ||, in a branch or loop body) leaves later writes unplaced', () => {
    for (const command of [
      'false && cd /tmp; echo x > notes.md',
      'test -d x || cd /tmp; echo x > notes.md',
      'if false; then cd /tmp; fi; echo x > notes.md',
      'if c; then cd /tmp; else echo x > notes.md; fi',
      'while false; do cd /tmp; done; echo x > notes.md',
      'for f in a; do cd /tmp; done; echo x > notes.md',
      'case $x in a) cd /tmp;; esac; echo x > notes.md',
      'case $x in a) cd /tmp;; b) echo x > notes.md;; esac',
      '(case $x in a) cd /tmp;; esac; echo x > notes.md)',
      'if true; then cd /tmp; echo x > notes.md; fi',
      '{ cd /tmp; }; echo x > notes.md',
    ]) assert.equal(decisionOf(bash(command, inTask)), 'ask', command);
    for (const command of ['cd /tmp && echo x > notes.md', 'cd /tmp || exit 1; echo x > notes.md']) {
      assert.deepEqual(bash(command, inTask), {}, command);
    }
  });
  it('a cd is taken both ways: the write is placed after the cd that succeeded or the one that failed', () => {
    assert.equal(decisionOf(bash('cd /missing; : .ambicode/task; echo x > notes.md', inTask)), 'ask');
    assert.equal(decisionOf(bash('cd /missing || echo x > notes.md; : .ambicode/task', inTask)), 'deny');
    assert.equal(decisionOf(bash('pushd /missing; echo x > notes.md', inTask)), 'ask');
    assert.equal(decisionOf(bash('pushd /missing || echo x > notes.md', inTask)), 'deny');
    assert.equal(decisionOf(bash('! cd /missing && echo x > notes.md', inTask)), 'deny');
    assert.deepEqual(bash('! cd /missing || echo x > notes.md', inTask), {});
    assert.equal(decisionOf(bash('cd /missing && true; echo x > notes.md', inTask)), 'ask');
    assert.equal(decisionOf(bash('cd .ambicode/task/T; echo x > notes.md', outside)), 'ask');
    assert.deepEqual(bash('cd src; echo x > notes.md', outside), {});
    assert.deepEqual(bash('cd /missing || exit 1; echo x > notes.md', inTask), {});
  });
  it('a compound command\'s redirections are opened where it starts, before its body changes directory', () => {
    assert.equal(decisionOf(bash('{ cd ../../../elsewhere; } > notes.md; : .ambicode/task', inTask)), 'deny');
    assert.deepEqual(bash('{ cd .ambicode/task/T; } > outside.md', outside), {});
    for (const command of [
      'if true; then cd ../../../elsewhere; fi > notes.md',
      'case x in x) cd ../../../elsewhere;; esac > notes.md',
      'for i in 1; do cd ../../../elsewhere; done > notes.md',
      'while true; do cd ../../../elsewhere; break; done > notes.md',
      '{ cd ../../../elsewhere; } > "$(echo x > inner.md; echo notes.md)"',
    ]) assert.equal(decisionOf(bash(command, inTask)), 'deny', command);
    assert.equal(decisionOf(bash('{ cd ../../../elsewhere; } > "$X"', inTask)), 'ask');
    assert.deepEqual(bash('if true; then cd .ambicode/task/T; fi > outside.md', outside), {});
  });
  it('env -C is last-option-wins within one invocation and composes across nested ones', () => {
    for (const [command, decision] of [
      ['env -C .ambicode -C task/T tee notes.md </dev/null', undefined],
      ['env -C.ambicode -Ctask/T tee notes.md </dev/null', undefined],
      ['env --chdir=.ambicode --chdir=task/T tee notes.md </dev/null', undefined],
      ['env -C .ambicode/task -C T tee notes.md </dev/null', undefined],
      ['env -C .ambicode env -C task/T tee notes.md </dev/null', 'deny'],
      ['env -C .ambicode -C "$D" tee notes.md </dev/null', 'ask'],
      ['env -C "$D" -C task/T tee notes.md </dev/null', undefined],
    ] as const) assert.equal(decisionOf(bash(command, outside)), decision, command);
  });
  it('a case pattern\'s ) does not end the subshell around it', () => {
    assert.equal(decisionOf(bash('(case $x in a) echo y;; esac; echo x > .ambicode/task/T/n)')), 'deny');
    assert.equal(decisionOf(bash('case a in a) ( echo ) ;; esac; echo x > .ambicode/task/T/n')), 'deny');
  });
  it('rm -r of the root is judged in the directory the command runs in', () => {
    assert.deepEqual(bash('(cd /work/repo && rm -rf dist)', { cwd: '/work/repo' }), {});
    assert.equal(decisionOf(bash('(cd /work/repo/dist && rm -rf ..)', { cwd: '/elsewhere' })), 'ask');
    assert.equal(decisionOf(bash('(cd /work/repo/dist && rm -rf ..)', { cwd: '/work/repo/dist/x' })), 'ask');
    assert.equal(decisionOf(bash('cd /work && rm -rf repo', { cwd: '/work/repo' })), 'ask');
    assert.deepEqual(bash('(cd /work); rm -rf repo', { cwd: '/work/repo' }), {});
    assert.equal(decisionOf(bash('env -C / rm -rf work', { cwd: '/work/repo' })), 'ask');
  });
});

describe('heredoc delimiters are only quote-removed', () => {
  for (const command of ['git status << "X$(git push)"\nbody\nX$(git push)', 'git status <<X`git push`\nbody\nX`git push`']) {
    it(`no decision: ${JSON.stringify(command)}`, () => assert.deepEqual(bash(command), {}));
  }
});

describe('sed -i is read the way the platform\'s sed reads it', () => {
  it('BSD (macOS): the word after -i is the backup suffix', () => {
    assert.deepEqual(bash("sed -i .bak 's#x#/repo/.ambicode/task/T/#' outside-sed", {}, 'darwin'), {});
    assert.equal(decisionOf(bash("sed -i '' 's/a/b/' .ambicode/task/T/notes.md", {}, 'darwin')), 'deny');
    assert.equal(decisionOf(bash("sed -i .bak -e 's/a/b/' .ambicode/task/T/notes.md", {}, 'freebsd')), 'deny');
    assert.equal(decisionOf(bash("gsed -i 's/a/b/' .ambicode/task/T/notes.md", {}, 'darwin')), 'deny');
  });
  it('GNU: the suffix is attached, so the next word is the script', () => {
    assert.equal(decisionOf(bash("sed -i 's/a/b/' .ambicode/task/T/notes.md", {}, 'linux')), 'deny');
    assert.equal(decisionOf(bash("sed -i .bak 's#x#/repo/.ambicode/task/T/#' outside-sed", {}, 'linux')), 'deny');
  });
});

describe('note save and promote pass in any segment, with any prefix and quoting (M12)', () => {
  // Synthetic B3 (real-run §6): the denied save had `cd <repo> &&` before node and `=>`/`.ambicode/task/` in its body.
  const b3 =
    'cd /work/repo && node "/plugins/ambicode/scripts/ambicode.mjs" note save --task T --kind plan-draft <<\'EOF\'\n' +
    '## Plan\nconst f = () => 1; // .ambicode/task/\nif (a > b) x >> y; echo x > .ambicode/task/T/plan.md\ngit push\n$(rm -rf .)\nEOF';
  for (const command of [
    'cd X && node "…/ambicode.mjs" note save --task T --kind plan-draft <<\'EOF\'\nconst f = () => 1; // .ambicode/task/\nEOF',
    b3,
    'node /p/scripts/ambicode.mjs note promote --task T',
    "env A=1 node '/p q/scripts/ambicode.mjs' note save --task T --kind notes <<-EOF\n\tx > .ambicode/task/T/a\n\tEOF",
    'npx node "/p/scripts/ambicode.mjs" note save --task T --kind plan-draft --from .ambicode/task/T/steps/plan-body.md',
  ]) {
    it(`no decision: ${JSON.stringify(command).slice(0, 70)}`, () => assert.deepEqual(bash(command), {}));
  }

  it('the rest of the command is still classified', () => {
    assert.equal(decisionOf(bash(`${b3}\ngit push`)), 'ask');
    assert.equal(decisionOf(bash('node /p/scripts/ambicode.mjs note save --task T --kind notes > .ambicode/task/T/x.md')), 'deny');
  });
});

describe('the task-directory message names a command that runs as written', () => {
  it('substitutes the plugin root the hook was given', () => {
    const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.ambicode/task/x/p.md' } }, '/opt/plugin') as Output;
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /node "\/opt\/plugin\/scripts\/ambicode\.mjs" note save/);
  });
  it('02-G1: names the kinds note save accepts and note promote', () => {
    const out = bash('echo x > .ambicode/task/T/n.md');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /note save --task <slug> --kind investigation\|plan-draft\|notes` or `note promote --task <slug>`/);
  });
});

const roots: string[] = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const at = '2026-10-05T10:00:00.000Z';
const planRoute = (id: string, session: string, extra: Record<string, unknown> = {}): LedgerEntry => ({ id, at, kind: 'route', skill: 'plan', session, ...extra });

/** A repository with task `T` (and `U`) and one scratchpad per session holding that session's active-route pointer. */
function fixture(ledger: LedgerEntry[] | string | null, pointers: Record<string, unknown>) {
  const root = mkdtempSync(path.join(tmpdir(), 'ambicode-guard-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  for (const task of ['T', 'U']) mkdirSync(path.join(repo, '.ambicode', 'task', task, 'steps'), { recursive: true });
  if (ledger !== null) {
    const text = typeof ledger === 'string' ? ledger : ledger.map((entry) => `${JSON.stringify(entry)}\n`).join('');
    writeFileSync(path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE), text);
  }
  const scratch: Record<string, string> = {};
  for (const [session, pointer] of Object.entries(pointers)) {
    scratch[session] = path.join(root, `scratch-${session}`);
    mkdirSync(path.join(scratch[session]!, HOOK_STATE_DIR_NAME), { recursive: true });
    if (pointer !== undefined) {
      writeFileSync(path.join(scratch[session]!, HOOK_STATE_DIR_NAME, ACTIVE_ROUTE_FILE), typeof pointer === 'string' ? pointer : JSON.stringify(pointer));
    }
  }
  const write = (session: string | undefined, file = path.join(repo, '.ambicode', 'task', 'T', 'steps', 'plan-body.md'), tool = 'Write') =>
    guardDecision(
      {
        hook_event_name: 'PreToolUse',
        tool_name: tool,
        tool_input: { file_path: file },
        ...(session === undefined ? {} : { session_id: session }),
        ...(session !== undefined && scratch[session] !== undefined ? { scratchpad_dir: scratch[session] } : {}),
      },
      '/p',
      fsGuardState,
    ) as Output;
  return { repo, scratch, write };
}

const onPlanT = { task: 'T', skill: 'plan' };

describe('plan-body writes: allowed only to the session that owns the live plan chain', () => {
  it('the owning session writes steps/plan-body.md with Write, Edit and MultiEdit', () => {
    const { write } = fixture([planRoute('a-1', 'A')], { A: onPlanT });
    for (const tool of ['Write', 'Edit', 'MultiEdit']) assert.deepEqual(write('A', undefined, tool), {});
  });

  it('after another session --adopt, the former owner is denied naming route-taken-over and the new owner writes', () => {
    const { write } = fixture([planRoute('a-1', 'A'), planRoute('b-1', 'B', { resumes: 'a-1', adopts: true })], { A: onPlanT, B: onPlanT });
    const out = write('A');
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /route-taken-over: session B took over the plan route on T \(route b-1\)/);
    assert.deepEqual(write('B'), {});
  });

  it('after another session --fresh, the former owner is denied naming route-taken-over', () => {
    const ledger = [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'exit', route: 'a-1', reason: 'superseded' }, planRoute('b-2', 'B')];
    const { write } = fixture(ledger, { A: onPlanT, B: onPlanT });
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /route-taken-over: session B/);
    assert.deepEqual(write('B'), {});
  });

  for (const [label, ledger, pointers, session, file, why] of [
    ['a session that never held the chain', [planRoute('a-1', 'A')], { C: onPlanT }, 'C', undefined, /session A owns it/],
    ['a missing session binding', [planRoute('a-1', 'A')], { A: onPlanT }, undefined, undefined, /hook named no session/],
    ['no scratchpad state for the session', [planRoute('a-1', 'A')], {}, 'A', undefined, /no active route is on record/],
    ['no active-route pointer', [planRoute('a-1', 'A')], { A: undefined }, 'A', undefined, /no active route is on record/],
    ['an unparsable pointer', [planRoute('a-1', 'A')], { A: '{not json' }, 'A', undefined, /no active route is on record/],
    ['an active route of another skill', [planRoute('a-1', 'A')], { A: { task: 'T', skill: 'investigate' } }, 'A', undefined, /investigate on T, not plan on T/],
    ['an active route on another task', [planRoute('a-1', 'A')], { A: { task: 'U', skill: 'plan' } }, 'A', undefined, /plan on U, not plan on T/],
    ['the plan body of another slug', [planRoute('a-1', 'A')], { A: onPlanT }, 'A', 'U', /not plan on U/],
    ['a missing ledger', null, { A: onPlanT }, 'A', undefined, /ledger of T is missing, unreadable or over 1 MiB/],
    ['a torn ledger line', `${JSON.stringify(planRoute('a-1', 'A'))}\n{"id":"b-1","kind":"rou`, { A: onPlanT }, 'A', undefined, /missing, unreadable or over 1 MiB/],
    ['a non-object ledger line', `${JSON.stringify(planRoute('a-1', 'A'))}\n42\n`, { A: onPlanT }, 'A', undefined, /missing, unreadable or over 1 MiB/],
    ['an exited chain', [planRoute('a-1', 'A'), { id: 'a-2', at, kind: 'exit', route: 'a-1', reason: 'done' }], { A: onPlanT }, 'A', undefined, /no plan route is open on T/],
    ['a dangling resume', [planRoute('a-1', 'A'), planRoute('b-1', 'B', { resumes: 'zz' })], { A: onPlanT }, 'A', undefined, /resumes zz/],
    ['legacy notes only', [{ id: 'L1', at, kind: 'note', note: 'plan', path: 'plan_x.md' }], { A: onPlanT }, 'A', undefined, /no plan route is open/],
    ['a later route with no skill', [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'route', session: 'B' }], { A: onPlanT }, 'A', undefined, /route b-1 names no skill/],
    ['a later route with a numeric skill', [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 7, session: 'B' }], { A: onPlanT }, 'A', undefined, /route b-1 names no skill/],
    ['a later route with a malformed adopts', [planRoute('a-1', 'A'), planRoute('b-1', 'B', { resumes: 'a-1', adopts: 'yes' })], { A: onPlanT }, 'A', undefined, /malformed adopts/],
    ['an exit naming no route', [planRoute('a-1', 'A'), { id: 'x-1', at, kind: 'exit', route: 'zz' }], { A: onPlanT }, 'A', undefined, /exit x-1 names no route/],
    ['an exit with no route', [planRoute('a-1', 'A'), { id: 'x-1', at, kind: 'exit', reason: 'done' }], { A: onPlanT }, 'A', undefined, /exit x-1 names no route/],
  ] as [string, LedgerEntry[] | string | null, Record<string, unknown>, string | undefined, string | undefined, RegExp][]) {
    it(`denies for ${label}`, () => {
      const { write, repo } = fixture(ledger, pointers);
      const out = write(session, file === undefined ? undefined : path.join(repo, '.ambicode', 'task', file, 'steps', 'plan-body.md'));
      assert.equal(decisionOf(out), 'deny');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, why);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /plan check --task \S+` on standard input/);
    });
  }

  it('a ledger over the read limit is unreadable, never partly read', () => {
    const { write, repo } = fixture([planRoute('a-1', 'A')], { A: onPlanT });
    const filler = `${JSON.stringify({ id: 'x', at, kind: 'note', pad: 'p'.repeat(1000) })}\n`;
    writeFileSync(path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE), `${JSON.stringify(planRoute('a-1', 'A'))}\n${filler.repeat(Math.ceil(LEDGER_LIMIT / filler.length))}`);
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /missing, unreadable or over 1 MiB/);
  });

  it('valid unrelated routes, other skills and unknown kinds leave the owner in place', () => {
    const ledger = [
      planRoute('a-1', 'A'),
      { id: 'r-1', at, kind: 'route', skill: 'review', session: 'C' },
      { id: 'r-2', at, kind: 'exit', route: 'r-1', reason: 'done' },
      { id: 'f-1', at, kind: 'future-kind', skill: 7 },
      { id: 'n-1', at, kind: 'note', note: 'plan', path: 'plan_x.md' },
    ] as LedgerEntry[];
    const { write } = fixture(ledger, { A: onPlanT, C: onPlanT });
    assert.deepEqual(write('A'), {});
    assert.match(write('C').hookSpecificOutput!.permissionDecisionReason, /session A owns it/);
  });

  it('5.1: the owner is found through harnessSession; the owner id itself is not a Claude session', () => {
    const owned = planRoute('a-1', 'owner-1', { harnessSession: 'A' });
    const { write } = fixture([owned], { A: onPlanT, 'owner-1': onPlanT, B: onPlanT });
    assert.deepEqual(write('A'), {});
    assert.equal(decisionOf(write('owner-1')), 'deny');
    assert.match(write('B').hookSpecificOutput!.permissionDecisionReason, /session owner-1 owns it/);
  });

  it('5.1: a rebinding record moves the write right to the new Claude session and detaches the old one', () => {
    const ledger = [planRoute('a-1', 'owner-1', { harnessSession: 'A' }), planRoute('a-2', 'owner-1', { harnessSession: 'B', resumes: 'a-1', adopts: true })];
    const { write } = fixture(ledger, { A: onPlanT, B: onPlanT });
    assert.deepEqual(write('B'), {});
    assert.equal(decisionOf(write('A')), 'deny');
  });

  it('5.1: another owner adopting the route names route-taken-over to the former owner Claude session', () => {
    const ledger = [planRoute('a-1', 'owner-1', { harnessSession: 'A' }), planRoute('b-1', 'owner-2', { harnessSession: 'B', resumes: 'a-1', adopts: true })];
    const { write } = fixture(ledger, { A: onPlanT, B: onPlanT });
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /route-taken-over: session owner-2 took over/);
    assert.deepEqual(write('B'), {});
  });

  it('a ledger of exactly the read limit is read; one byte more is not', () => {
    const { write, repo } = fixture(null, { A: onPlanT });
    const head = `${JSON.stringify(planRoute('a-1', 'A'))}\n`;
    const pad = (bytes: number) => `${JSON.stringify({ id: 'p', at, kind: 'note', pad: 'p'.repeat(bytes - JSON.stringify({ id: 'p', at, kind: 'note', pad: '' }).length - 1) })}\n`;
    const ledgerFile = path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE);
    writeFileSync(ledgerFile, head + pad(LEDGER_LIMIT - head.length));
    assert.equal(readFileSync(ledgerFile).length, LEDGER_LIMIT);
    assert.deepEqual(write('A'), {});
    writeFileSync(ledgerFile, head + pad(LEDGER_LIMIT - head.length + 1));
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /missing, unreadable or over 1 MiB/);
  });

  it('a directory where the ledger or pointer should be is unreadable', () => {
    const { write, repo, scratch } = fixture(null, { A: onPlanT });
    mkdirSync(path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE));
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /missing, unreadable/);
    rmSync(path.join(scratch.A!, HOOK_STATE_DIR_NAME, ACTIVE_ROUTE_FILE));
    mkdirSync(path.join(scratch.A!, HOOK_STATE_DIR_NAME, ACTIVE_ROUTE_FILE));
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /no active route is on record/);
  });

  it('only the exact plan-body path is excepted; a relative path without a cwd is not placed', () => {
    const { write, repo } = fixture([planRoute('a-1', 'A')], { A: onPlanT });
    for (const file of ['steps/plan-body.md.bak', 'steps/sub/plan-body.md', 'plan-body.md']) {
      assert.equal(decisionOf(write('A', path.join(repo, '.ambicode', 'task', 'T', file))), 'deny', file);
    }
    assert.match(write('A', '.ambicode/task/T/steps/plan-body.md').hookSpecificOutput!.permissionDecisionReason, /no absolute path/);
  });

  it('a Bash write to the plan body is still denied for its owner', () => {
    const { repo, scratch } = fixture([planRoute('a-1', 'A')], { A: onPlanT });
    const out = guardDecision(
      { hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch.A, tool_name: 'Bash', tool_input: { command: `echo x > ${repo}/.ambicode/task/T/steps/plan-body.md` } },
      '/p',
      fsGuardState,
    ) as Output;
    assert.equal(decisionOf(out), 'deny');
    const reason = out.hookSpecificOutput!.permissionDecisionReason;
    assert.match(reason, /plan check --task T` on standard input/);
    assert.doesNotMatch(reason, /note save/);
  });
});

describe('init owns .ambicode/config.yaml and .gitignore while its route is active', () => {
  const edit = (file: string, pointer: unknown, tool = 'Write') => {
    const { scratch } = fixture(null, { A: pointer });
    return guardDecision({ hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch.A, tool_name: tool, tool_input: { file_path: file } }, '/p', fsGuardState) as Output;
  };
  for (const file of ['/repo/.ambicode/config.yaml', '/repo/.gitignore']) {
    it(`denies ${file} during init, naming init --apply`, () => {
      for (const tool of ['Write', 'Edit']) {
        const out = edit(file, { task: 'init-2026-10-05', skill: 'init' }, tool);
        assert.equal(decisionOf(out), 'deny');
        assert.match(out.hookSpecificOutput!.permissionDecisionReason, /init --apply --set/);
      }
    });
    it(`leaves ${file} alone outside init`, () => {
      assert.deepEqual(edit(file, { task: 'T', skill: 'plan' }), {});
      assert.deepEqual(edit(file, undefined), {});
    });
  }
});

describe('the guard state reader', () => {
  it('uses the hook state directory and ledger file names the CLI uses', () => {
    assert.equal(GUARD_STATE_DIR_NAME, HOOK_STATE_DIR_NAME);
    assert.equal(GUARD_LEDGER_FILE, LEDGER_FILE);
  });
});

describe('the built guard entry', () => {
  const built = new URL('../../../scripts/guard.mjs', import.meta.url);
  const run = (stdin: string) => spawnSync('node', [built.pathname], { input: stdin, encoding: 'utf8' });

  it('answers on stdin/stdout and survives garbage', { skip: !existsSync(built) }, () => {
    const asked = JSON.parse(execFileSync('node', [built.pathname], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), encoding: 'utf8' }));
    assert.equal(asked.hookSpecificOutput.permissionDecision, 'ask');
    for (const stdin of ['not json', '', 'null', '42', '{}', '{"hook_event_name":"PreToolUse"}', '{"hook_event_name":"Stop"}', '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/r/.ambicode/task/x"}}', '{"hook_event_name":"PostToolUse","tool_name":"Bash"}', '{"hook_event_name":"PostToolUse","scratchpad_dir":"/nowhere","transcript_path":"/nowhere.jsonl","tool_use_id":"t"}']) {
      const result = run(stdin);
      assert.equal(result.status, 0, stdin);
      assert.deepEqual(JSON.parse(result.stdout), {}, stdin);
    }
    assert.match(run('not json').stderr, /^ambicode guard: no decision: /);
  });

  it('reads the fixture state directory for the plan-body exception', { skip: !existsSync(built) }, () => {
    const { repo, scratch } = fixture([planRoute('a-1', 'A'), planRoute('b-1', 'B', { resumes: 'a-1', adopts: true })], { A: onPlanT, B: onPlanT });
    const input = (session: string) =>
      JSON.stringify({ hook_event_name: 'PreToolUse', session_id: session, scratchpad_dir: scratch[session], tool_name: 'Write', tool_input: { file_path: path.join(repo, '.ambicode/task/T/steps/plan-body.md') } });
    assert.deepEqual(JSON.parse(run(input('B')).stdout), {});
    assert.match(JSON.parse(run(input('A')).stdout).hookSpecificOutput.permissionDecisionReason, /route-taken-over/);
  });

  it('denies a malformed later route without reading past it', { skip: !existsSync(built) }, () => {
    const { repo, scratch } = fixture([planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 7 } as unknown as LedgerEntry], { A: onPlanT });
    const out = JSON.parse(run(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch.A, tool_name: 'Write', tool_input: { file_path: path.join(repo, '.ambicode/task/T/steps/plan-body.md') } })).stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /route b-1 names no skill/);
  });

  // A FIFO with no writer blocks a plain open; the guard must answer at once instead. Spawned, so a regression times out.
  it('answers at once when the pointer or the ledger is a FIFO', { skip: !existsSync(built) || process.platform === 'win32' }, () => {
    for (const which of ['pointer', 'ledger'] as const) {
      const { repo, scratch } = fixture([planRoute('a-1', 'A')], { A: onPlanT });
      const file = which === 'ledger' ? path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE) : path.join(scratch.A!, HOOK_STATE_DIR_NAME, ACTIVE_ROUTE_FILE);
      rmSync(file);
      execFileSync('mkfifo', [file]);
      const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch.A, tool_name: 'Write', tool_input: { file_path: path.join(repo, '.ambicode/task/T/steps/plan-body.md') } });
      const result = spawnSync('node', [built.pathname], { input, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.error, undefined, `${which}: ${String(result.error)}`);
      assert.equal(result.status, 0, which);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, which === 'ledger' ? /missing, unreadable/ : /no active route is on record/, which);
    }
  });

  it('places Bash writes by shell scope on stdin/stdout', { skip: !existsSync(built) }, () => {
    const decision = (command: string, cwd: string) =>
      JSON.parse(run(JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } })).stdout).hookSpecificOutput?.permissionDecision;
    assert.equal(decision('cd /tmp > .ambicode/task/T/x', '/repo'), 'deny');
    assert.equal(decision('cd /tmp 2> "$F"', '/repo'), 'ask');
    assert.equal(decision('(cd .ambicode/task/T); echo x > notes.md', '/repo'), undefined);
    assert.equal(decision('(cd /tmp); : .ambicode/task; echo x > notes.md', '/repo/.ambicode/task/T'), 'deny');
    assert.equal(decision('env -C .ambicode/task/T tee notes.md </dev/null', '/repo'), 'deny');
    assert.equal(decision('git stash -m list', '/repo'), 'ask');
    assert.equal(decision('git stash show -p', '/repo'), undefined);
    assert.equal(decision('git status; echo ${X:-$(git push)}', '/repo'), 'ask');
    assert.equal(decision('git status << "X$(git push)"\nbody\nX$(git push)', '/repo'), undefined);
    assert.equal(decision('cp -- --target-directory=.ambicode/task/T outside-copy', '/repo'), undefined);
  });

  it('asks, without a stack error, for a git write beside 4000 nested expansions', { skip: !existsSync(built) }, () => {
    const command = 'git push; echo ' + '${X:-'.repeat(4000) + 'x' + '}'.repeat(4000);
    assert.equal(command.length, 24_016);
    const result = run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'ask');
  });

  it('places compound redirections, cd failures and env -C on stdin/stdout', { skip: !existsSync(built) }, () => {
    const decision = (command: string, cwd: string) =>
      JSON.parse(run(JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } })).stdout).hookSpecificOutput?.permissionDecision;
    const task = '/repo/.ambicode/task/T';
    assert.equal(decision('cd /missing; : .ambicode/task; echo x > notes.md', task), 'ask');
    assert.equal(decision('cd /missing || echo x > notes.md; : .ambicode/task', task), 'deny');
    assert.equal(decision('{ cd ../../../elsewhere; } > notes.md; : .ambicode/task', task), 'deny');
    assert.equal(decision('{ cd .ambicode/task/T; } > outside.md', '/repo'), undefined);
    assert.equal(decision('env -C .ambicode -C task/T tee notes.md </dev/null', '/repo'), undefined);
    assert.equal(decision('git status; echo "${X:-\'$(git push)\'}"', '/repo'), 'ask');
    // bash 3.2 ends the substitution at the body's `)` and runs the tee; zsh does not.
    assert.equal(decision('git status; echo "$(cat <<\'EOF\'\n)\n$(tee .ambicode/task/T/phantom)\nEOF\n)"', '/repo'), 'ask');
  });

  it('places repeated moves, pattern quotes and case arms on stdin/stdout', { skip: !existsSync(built) }, () => {
    const decision = (command: string, cwd: string) =>
      JSON.parse(run(JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } })).stdout).hookSpecificOutput?.permissionDecision;
    const task = '/repo/.ambicode/task/T';
    assert.equal(decision('for i in 1 2 3; do cd .. || exit; done; echo x > outside.md; : .ambicode/task', task), 'ask');
    assert.equal(decision('i=0; while [ "$i" -lt 3 ]; do cd .. || exit; i=$((i+1)); done; echo x > outside.md; : .ambicode/task', task), 'ask');
    assert.equal(decision('for i in 1 2 3; do (cd ..); done; echo x > notes.md', task), 'deny');
    assert.equal(decision('for i in 1 2 3; do cd ..; done > notes.md', task), 'deny');
    assert.equal(decision('for i in 1 2 3; do cd ..; done; echo x > /repo/.ambicode/task/T/notes.md', task), 'deny');
    assert.equal(decision('git status; X=a; echo "${X#\'$(tee .ambicode/task/T/phantom)\'}"', '/repo'), undefined);
    assert.equal(decision('git status; X=a; echo "${X#\'`tee .ambicode/task/T/phantom`\'}"', '/repo'), undefined);
    assert.equal(decision('git status; echo "${X:-\'$(git push)\'}"', '/repo'), 'ask');
    assert.equal(decision('git status; echo "$(case x in x) git push;; esac)"', '/repo'), 'ask');
    assert.equal(decision('git status; cat <(case x in x) git push;; esac)', '/repo'), 'ask');
    // A syntax error in bash 3.2, a write in zsh.
    assert.equal(decision('git status; echo "$(case x in x) echo x > .ambicode/task/T/phantom;; esac)"', '/repo'), 'ask');
    assert.equal(decision('git status; echo "$(case x in x) cat <<\'EOF\'\n)\n$(tee .ambicode/task/T/phantom)\nEOF\n;; esac; git push)"', '/repo'), 'ask');
  });

  it('asks, without a stack error, for a git write beside 4000 nested case substitutions', { skip: !existsSync(built) }, () => {
    const command = 'git push; echo ' + '$(case x in x) '.repeat(4000) + 'x' + ';; esac)'.repeat(4000);
    const result = run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'ask');
  });

  it('imports node:fs, crypto and os and nothing else the CLI loads (no Runtime, no zod)', { skip: !existsSync(built) }, () => {
    const seen = new Set<string>();
    const specifiers = new Set<string>();
    const visit = (file: URL) => {
      if (seen.has(file.href)) return;
      seen.add(file.href);
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/gm)) {
        if (specifier!.startsWith('.')) visit(new URL(specifier!, file));
        else specifiers.add(specifier!);
      }
    };
    visit(built);
    // node:module is tools/build.mjs's shared banner (a require shim for `yaml`), present before this step.
    // node:crypto and node:os: the pointer's temporary-directory fallback is keyed like hook-state.ts's, by a hash of the session id.
    assert.deepEqual([...specifiers].sort(), ['node:crypto', 'node:fs', 'node:module', 'node:os']);
    assert.ok(seen.size <= 2, `the guard loads ${seen.size} files`);
  });
});

/**
 * Harmless shell runs in a scratch repository: what bash actually wrote, and which git commands it actually ran, must
 * agree with the guard. A stub `git` only logs its arguments; real git runs only for the stash cases, in the scratch repo.
 */
describe('decisions agree with what the shell does', { skip: process.platform === 'win32' }, () => {
  const scene = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ambicode-shell-'));
    roots.push(root);
    const repo = path.join(root, 'repo');
    const task = path.join(repo, '.ambicode', 'task', 'T');
    mkdirSync(task, { recursive: true });
    mkdirSync(path.join(repo, 'elsewhere'));
    mkdirSync(path.join(repo, 'task', 'T'), { recursive: true });
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    const log = path.join(root, 'git.log');
    writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\n`, { mode: 0o755 });
    const files = (directory: string): string[] =>
      readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
    const shell = (command: string, cwd = repo, stub = true, program = 'bash', extraEnv: Record<string, string> = {}) => {
      const before = files(task).map((file) => `${file}:${readFileSync(file, 'utf8')}`).join('|');
      const run = spawnSync(program, ['-c', command], { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv, PATH: stub ? `${bin}:${process.env.PATH}` : process.env.PATH } });
      const wroteTask = files(task).map((file) => `${file}:${readFileSync(file, 'utf8')}`).join('|') !== before;
      const gitRan = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
      rmSync(log, { force: true });
      return { wroteTask, gitRan, status: run.status };
    };
    const guard = (command: string, cwd = repo) =>
      decisionOf(guardDecision({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } }, undefined, undefined, process.platform) as Output);
    return { repo, task, shell, guard };
  };

  for (const [command, inTask] of [
    ['cd elsewhere > .ambicode/task/T/x', false],
    ['cd elsewhere 2> .ambicode/task/T/x', false],
    ['cd elsewhere >> .ambicode/task/T/x', false],
    ['pushd elsewhere > .ambicode/task/T/x', false],
    ['cd .ambicode/task/T > x', false],
    ['(cd .ambicode/task/T); echo x > notes.md', false],
    ['cd .ambicode/task/T | cat; echo x > notes.md', false],
    ['echo "$(echo x > notes.md)"; cd .ambicode/task/T', false],
    ['cd .ambicode/task/T & wait; echo x > notes.md', false],
    ['cd .ambicode && (cd task/T && echo x > notes.md)', false],
    ['(cd ../../../elsewhere); : .ambicode/task; echo x > notes.md', true],
    ['echo "$(cd ../../../elsewhere)" "$(echo x > notes.md)"; : .ambicode/task', true],
  ] as const) {
    it(`${inTask ? 'from inside T: ' : ''}${command}`, () => {
      const { repo, task, shell, guard } = scene();
      const cwd = inTask ? task : repo;
      const ran = shell(command, cwd);
      assert.equal(guard(command, cwd), ran.wroteTask ? 'deny' : undefined, `wrote into the task directory: ${ran.wroteTask}`);
    });
  }

  it('a cd that may not run: the shell writes into the task directory, the guard asks', () => {
    for (const command of [
      'false && cd ../../../elsewhere; echo x > notes.md',
      'if false; then cd ../../../elsewhere; fi; echo x > notes.md',
      'case b in a) cd ../../../elsewhere;; esac; echo x > notes.md',
      'case b in a) cd ../../../elsewhere;; b) echo x > notes.md;; esac',
    ]) {
      const { task, shell, guard } = scene();
      assert.equal(shell(command, task).wroteTask, true, command);
      assert.equal(guard(command, task), 'ask', command);
    }
  });

  it('cp -- takes --target-directory=… as a source operand', () => {
    const { repo, shell, guard } = scene();
    mkdirSync(path.join(repo, '--target-directory=.ambicode', 'task'), { recursive: true });
    writeFileSync(path.join(repo, '--target-directory=.ambicode', 'task', 'T'), 'src');
    const command = 'cp -- --target-directory=.ambicode/task/T outside-copy';
    assert.equal(shell(command).wroteTask, false);
    assert.equal(readFileSync(path.join(repo, 'outside-copy'), 'utf8'), 'src');
    assert.equal(guard(command), undefined);
  });

  it('env -C runs the command in the named directory', (t) => {
    const { shell, guard } = scene();
    if (spawnSync('env', ['-C', '/', 'true']).status !== 0) return t.skip('this env has no -C');
    const command = 'env -C .ambicode/task/T tee notes.md </dev/null';
    assert.equal(shell(command).wroteTask, true);
    assert.equal(guard(command), 'deny');
  });

  it('sed -i writes only the file the platform sed reads as the operand', () => {
    const { repo, shell, guard } = scene();
    writeFileSync(path.join(repo, 'outside-sed'), 'x\n');
    const command = "sed -i .bak 's#x#/repo/.ambicode/task/T/#' outside-sed";
    const ran = shell(command);
    const bsd = process.platform === 'darwin' || process.platform.endsWith('bsd');
    // GNU sed reads `.bak` as the script and fails before writing; the guard still denies the task path it names.
    assert.equal(ran.wroteTask, false);
    if (bsd) assert.equal(readFileSync(path.join(repo, 'outside-sed'), 'utf8'), '/repo/.ambicode/task/T/\n');
    assert.equal(guard(command), bsd ? undefined : 'deny');
  });

  it('git commands inside expansions run; a heredoc delimiter is only quote-removed', () => {
    const { shell, guard } = scene();
    for (const [command, pushes] of [
      ['git status; echo ${X:-$(git push)}', true],
      ['git status; echo $(( $(git push) + 1 ))', true],
      ['git status << "X$(git push)"\nbody\nX$(git push)', false],
      ['git status <<X`git push`\nbody\nX`git push`', false],
    ] as const) {
      assert.equal(shell(command).gitRan.includes('push'), pushes, command);
      assert.equal(guard(command), pushes ? 'ask' : undefined, command);
    }
  });

  it('git stash -m saves a stash named by the message; only stash list and show are read-only', (t) => {
    const { repo, shell, guard } = scene();
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8' });
    try {
      git('init', '-q');
      writeFileSync(path.join(repo, 'f'), '1');
      git('add', 'f');
      git('commit', '-qm', 'one');
    } catch {
      return t.skip('git is not available');
    }
    for (const [command, saves] of [
      ['git stash -m list', true],
      ['git stash --message show', true],
      ['git stash --message=list', true],
      ['git stash -mlist', true],
      ['git stash list', false],
      ['git stash show -p', false],
    ] as const) {
      writeFileSync(path.join(repo, 'f'), String(Math.random()));
      const count = () => git('stash', 'list').split('\n').filter(Boolean).length;
      const before = count();
      shell(command.replace(/^git /, 'git -c user.name=t -c user.email=t@t '), repo, false);
      assert.equal(count() > before, saves, command);
      assert.equal(guard(command), saves ? 'ask' : undefined, command);
      git('checkout', '-q', '--', 'f');
    }
  });

  // bash here is macOS's 3.2 where it is the system bash; zsh is the reference for heredocs inside $( ).
  const programs = ['bash', 'zsh'].filter((program) => spawnSync(program, ['-c', 'true']).status === 0);

  for (const program of programs) {
    it(`[${program}] a cd that fails leaves the write in the directory the shell was in`, () => {
      for (const [command, decision] of [
        ['cd /ambicode-absent; : .ambicode/task; echo x > notes.md', 'ask'],
        ['cd /ambicode-absent || echo x > notes.md; : .ambicode/task', 'deny'],
        ['pushd /ambicode-absent 2>/dev/null; echo x > notes.md', 'ask'],
        ['pushd /ambicode-absent 2>/dev/null || echo x > notes.md', 'deny'],
        ['! cd /ambicode-absent && echo x > notes.md', 'deny'],
        ['cd /ambicode-absent && true; echo x > notes.md', 'ask'],
        ['cd /ambicode-absent && cd /tmp; echo x > notes.md', 'ask'],
      ] as const) {
        const { task, shell, guard } = scene();
        assert.equal(shell(command, task, true, program).wroteTask, true, command);
        assert.equal(guard(command, task), decision, command);
      }
    });

    it(`[${program}] cd X && command and cd X || exit keep the directory the cd reached`, () => {
      for (const command of [
        'cd ../../../elsewhere && echo x > notes.md',
        'cd ../../../elsewhere || exit 1; echo x > notes.md',
        'cd /ambicode-absent || exit 1; echo x > notes.md',
      ]) {
        const { task, shell, guard } = scene();
        assert.equal(shell(command, task, true, program).wroteTask, false, command);
        assert.equal(guard(command, task), undefined, command);
      }
    });

    it(`[${program}] a compound command's redirection is opened before its body changes directory`, () => {
      for (const [command, inTask] of [
        ['{ cd ../../../elsewhere; } > notes.md; : .ambicode/task', true],
        ['{ cd .ambicode/task/T; } > outside.md', false],
        ['if true; then cd ../../../elsewhere; fi > notes.md', true],
        ['case x in x) cd ../../../elsewhere;; esac > notes.md', true],
        ['for i in 1; do cd ../../../elsewhere; done > notes.md', true],
        ['while true; do cd ../../../elsewhere; break; done > notes.md', true],
        ['{ cd ../../../elsewhere; } > "$(echo x > inner.md; echo notes.md)"', true],
        ['if true; then cd .ambicode/task/T; fi > outside.md', false],
      ] as const) {
        const { repo, task, shell, guard } = scene();
        const cwd = inTask ? task : repo;
        const ran = shell(command, cwd, true, program);
        assert.equal(ran.wroteTask, inTask, command);
        assert.equal(guard(command, cwd), inTask ? 'deny' : undefined, command);
        if (!inTask) assert.ok(existsSync(path.join(repo, 'outside.md')), command);
      }
    });

    it(`[${program}] env -C: the last option wins; separate env invocations compose`, (t) => {
      if (spawnSync('env', ['-C', '/', 'true']).status !== 0) return t.skip('this env has no -C');
      for (const [command, protectedWrite] of [
        ['env -C .ambicode -C task/T tee notes.md </dev/null', false],
        ['env -C.ambicode -Ctask/T tee notes.md </dev/null', false],
        ['env --chdir=.ambicode --chdir=task/T tee notes.md </dev/null', false],
        ['env -C .ambicode env -C task/T tee notes.md </dev/null', true],
        ['D=task/T; env -C .ambicode -C "$D" tee notes.md </dev/null', false],
      ] as const) {
        // BSD env (macOS) has no --chdir; the parser and guard rows above cover that form.
        if (command.includes('--chdir') && spawnSync('env', ['--chdir=/', 'true']).status !== 0) continue;
        const { repo, shell, guard } = scene();
        const ran = shell(command, repo, true, program);
        assert.equal(ran.wroteTask, protectedWrite, command);
        const decision = guard(command, repo);
        if (command.includes('"$D"')) assert.equal(decision, 'ask', command);
        else assert.equal(decision, protectedWrite ? 'deny' : undefined, command);
        if (!protectedWrite) assert.ok(existsSync(path.join(repo, 'task', 'T', 'notes.md')), command);
      }
    });

    it(`[${program}] single quotes in a double-quoted parameter expansion do not hide the substitution`, () => {
      for (const [command, pushes] of [
        ['git status; echo "${X:-\'$(git push)\'}"', true],
        ['git status; echo "${X:-\'`git push`\'}"', true],
        ['git status; echo ${X:-\'$(git push)\'}', false],
      ] as const) {
        const { shell, guard } = scene();
        const ran = shell(command, undefined, true, program);
        assert.deepEqual(ran.gitRan.filter((entry) => entry !== ''), pushes ? ['status', 'push'] : ['status'], command);
        assert.equal(guard(command), pushes ? 'ask' : undefined, command);
      }
    });
  }

  for (const program of programs) {
    it(`[${program}] a loop that moves the shell: the guard does not place later writes in its first directory`, () => {
      const loop = (body: string, rest = 'echo x > outside.md; : .ambicode/task') => `${body}; ${rest}`;
      for (const command of [
        loop('for i in 1 2 3; do cd .. || exit; done'),
        loop('i=0; while [ "$i" -lt 3 ]; do cd .. || exit; i=$((i+1)); done'),
        loop('i=0; until [ "$i" -ge 3 ]; do cd .. || exit; i=$((i+1)); done'),
        loop('for i in 1 2 3; do pushd .. >/dev/null || exit; done'),
        loop('for i in 1 2 3; do cd ..; continue; done'),
        loop('for i in 1 2 3; do cd ..; [ "$i" = 3 ] && break; done'),
        loop('for i in 1 2 3; do if true; then cd ..; fi; done'),
        loop('for a in 1 2; do for b in 1 2; do cd .. || exit; done; done'),
      ]) {
        const { repo, task, shell, guard } = scene();
        const ran = shell(command, task, true, program);
        assert.equal(ran.status, 0, command);
        assert.equal(ran.wroteTask, false, command);
        assert.notEqual(guard(command, task), 'deny', command);
        assert.equal(guard(command, task), 'ask', command);
        assert.ok(existsSync(path.join(repo, 'outside.md')) || existsSync(path.join(path.dirname(repo), 'outside.md')), command);
      }
    });

    it(`[${program}] zero, failed and repeated passes: the write may be in the task directory, so the guard asks`, () => {
      for (const command of [
        'for i in; do cd ..; done; echo x > notes.md',
        'while false; do cd ..; done; echo x > notes.md',
        'for i in 1 2 3; do cd /ambicode-absent; done; echo x > notes.md',
        'for i in 1 2 3; do cd /ambicode-absent || continue; done; echo x > notes.md',
        'for d in a b; do cd "$d" 2>/dev/null; done; echo x > notes.md',
        'for i in 1 2; do echo x > notes.md; cd ..; done',
        'for i in 1 2; do cd ..; echo x > notes.md; done',
        'while [ -n "$M" ]; do cd ..; done; echo x > notes.md',
      ]) {
        const { task, shell, guard } = scene();
        const ran = shell(command, task, true, program);
        assert.equal(ran.wroteTask, !command.includes('cd ..; echo'), command);
        assert.equal(guard(command, task), 'ask', command);
      }
    });

    it(`[${program}] a loop whose moves stay in subshells or substitutions leaves the write certain`, () => {
      for (const command of [
        'for i in 1 2 3; do (cd ..); done; echo x > notes.md',
        'for i in 1 2 3; do echo "$(cd ..)"; done; echo x > notes.md',
        'for i in 1 2 3; do cd .. | cat; done; echo x > notes.md',
        'for i in 1 2 3; do cd .. & done; wait; echo x > notes.md',
        'for i in 1 2 3; do ( cd ../.. && echo x > task/T/inner.md ); done',
      ]) {
        const { task, shell, guard } = scene();
        const ran = shell(command, task, true, program);
        assert.equal(ran.wroteTask, true, command);
        assert.equal(guard(command, task), 'deny', command);
      }
    });

    it(`[${program}] a loop's redirection is opened where the loop starts, and absolute targets stay definite`, () => {
      for (const command of [
        'for i in 1 2 3; do cd ..; done > notes.md',
        'while [ "${n:-0}" -lt 3 ]; do n=$((${n:-0}+1)); cd ..; done > notes.md',
      ]) {
        const { task, shell, guard } = scene();
        assert.equal(shell(command, task, true, program).wroteTask, true, command);
        assert.equal(guard(command, task), 'deny', command);
      }
      const { task, shell, guard } = scene();
      const command = `for i in 1 2 3; do cd ..; done; echo x > '${path.join(task, 'notes.md')}'`;
      assert.equal(shell(command, task, true, program).wroteTask, true);
      assert.equal(guard(command, task), 'deny');
    });

    it(`[${program}] a loop that moves the shell does not hide an rm -r of the root it reached`, () => {
      const { repo, task, shell, guard } = scene();
      const command = 'for i in 1 2 3; do cd .. || exit; done; rm -r .';
      assert.equal(existsSync(repo), true);
      assert.equal(guard(command, task), 'ask');
      assert.equal(guard('for i in 1 2 3; do cd ..; done; rm -r ./repo', task), 'ask');
      void shell;
    });

    it(`[${program}] a pattern's single quotes in a double-quoted expansion run nothing`, () => {
      const phantom = '.ambicode/task/T/phantom';
      for (const [operator, inner] of [
        ...['#', '##', '%', '%%'].flatMap((operator) => [[operator, `$(tee ${phantom})`], [operator, `\`tee ${phantom}\``]] as const),
        ...['/', '//'].flatMap((operator) => [[operator, '$(git push)'], [operator, '`git push`']] as const),
      ] as const) {
        const command = `git status; X=a; echo "\${X${operator}'${inner}'}"`;
        const { task, shell, guard } = scene();
        const ran = shell(command, undefined, true, program);
        assert.equal(ran.status, 0, command);
        assert.equal(existsSync(path.join(task, 'phantom')), false, command);
        assert.deepEqual(ran.gitRan, ['status'], command);
        assert.equal(guard(command), undefined, command);
      }
    });

    it(`[${program}] a "/" inside a replacement pattern, where bash splits it, asks`, () => {
      for (const inner of ['$(tee .ambicode/task/T/phantom)', '`tee .ambicode/task/T/phantom`']) {
        for (const operator of ['/', '//']) {
          const command = `git status; X=a; echo "\${X${operator}'${inner}'}"`;
          const { task, shell, guard } = scene();
          shell(command, undefined, true, program);
          assert.equal(existsSync(path.join(task, 'phantom')), false, command);
          assert.equal(guard(command), 'ask', command);
        }
      }
    });

    it(`[${program}] a replacement, a default and an unquoted or escaped pattern operand do run`, () => {
      for (const command of [
        'git status; X=abc; echo "${X/b/\'$(git push)\'}"',
        'git status; X=abc; echo "${X//b/\'$(git push)\'}"',
        'git status; echo "${U:-\'$(git push)\'}"',
        'git status; X=abc; echo "${X:+\'$(git push)\'}"',
        'git status; X=a; echo "${X#$(git push)}"',
        'git status; X=a; echo "${X#"$(git push)"}"',
        "git status; X=a; echo \"${X#\\'$(git push)}\"",
        'git status; X=a; echo "${X%%$(git push)}"',
      ]) {
        const { shell, guard } = scene();
        const ran = shell(command, undefined, true, program);
        assert.deepEqual(ran.gitRan, ['status', 'push'], command);
        assert.equal(guard(command), 'ask', command);
      }
    });

    it(`[${program}] a nested expansion inside a quoted pattern is quoted with it`, () => {
      const command = 'git status; X=a; echo "${X#${U:-\'$(git push)\'}}"';
      const { shell, guard } = scene();
      assert.deepEqual(shell(command, undefined, true, program).gitRan, ['status']);
      assert.equal(guard(command), undefined);
    });
  }

  /** What the guard should decide, from what every shell did: deny only if all wrote, ask if any wrote or pushed. */
  const observed = (command: string): string | undefined => {
    const runs = programs.map((program) => {
      const { task, shell } = scene();
      const ran = shell(command, undefined, true, program);
      return { pushed: ran.gitRan.includes('push'), wrote: existsSync(path.join(task, 'phantom')) };
    });
    if (runs.every((run) => run.wrote) && !runs.some((run) => run.pushed)) return 'deny';
    return runs.some((run) => run.wrote || run.pushed) ? 'ask' : undefined;
  };

  it('a case pattern\'s ")" inside $( ) or <( ): bash 3.2 and zsh disagree, so the guard asks', () => {
    const phantom = '.ambicode/task/T/phantom';
    for (const command of [
      'git status; echo "$(case x in x) git push;; esac)"',
      'git status; echo "$(case x in x) echo x > ' + phantom + ';; esac)"',
      'git status; cat <(case x in x) git push;; esac)',
      'git status; echo "$(case x in (x) git push;; esac)"',
      'git status; echo "$(case x in a) :;; x) git push;; esac)"',
      'git status; echo "$(case x in x) :;; esac; git push)"',
      'git status; echo "$(case x in x) case y in y) git push;; esac;; esac)"',
      "git status; echo \"$(case ')' in ')') git push;; esac)\"",
      'git status; echo "$(case x in x\\)) :;; *) git push;; esac)"',
      `git status; echo "$(case x in x) cat <<'EOF'\n)\n$(tee ${phantom})\nEOF\n;; esac; git push)"`,
      `git status; echo "$(case x in x) cat <<-'EOF'\n\t)\n\t$(tee ${phantom})\n\tEOF\n;; esac; git push)"`,
      `git status; echo "$(case x in x) cat <<'A' <<'B'\n)\n$(tee ${phantom})\nA\n)\n$(tee ${phantom})\nB\n;; esac; git push)"`,
    ]) {
      const { guard } = scene();
      assert.equal(observed(command), 'ask', command);
      assert.equal(guard(command), 'ask', command);
    }
  });

  it('a quoted heredoc inside $( ): literal text, unless bash 3.2 ends the substitution inside it', () => {
    for (const [body, decision] of [
      [')\n$(tee .ambicode/task/T/phantom)', 'ask'],
      ['" ) \' ` $(tee .ambicode/task/T/phantom)', undefined],
      ['$(tee .ambicode/task/T/phantom)\n)', undefined],
    ] as const) {
      const command = `git status; echo "$(cat <<'EOF'\n${body}\nEOF\n)"`;
      const { guard } = scene();
      assert.equal(observed(command), decision, command);
      assert.equal(guard(command), decision, command);
    }
    const tabbed = `git status; echo "$(cat <<-'EOF'\n\t)\n\t$(tee .ambicode/task/T/phantom)\n\tEOF\n)"`;
    const { guard } = scene();
    assert.equal(observed(tabbed), 'ask');
    assert.equal(guard(tabbed), 'ask');
  });

  // Each row: what the guard decides. It never misses what a shell did, and denies only what every shell wrote.
  for (const [label, rows] of [
    [
      'prefixes named by path, shell code in arguments, and other file writers',
      [
        ['/usr/bin/env git push', 'ask'],
        ['/usr/bin/env -C .ambicode/task/T tee phantom </dev/null', 'deny'],
        ['/usr/bin/nice git push', 'ask'],
        ["trap 'echo x > .ambicode/task/T/phantom' EXIT; true", 'deny'],
        ["eval 'echo x > .ambicode/task/T/phantom'", 'deny'],
        ["echo 'git push' | sh", 'ask'],
        ["echo 'git push' | bash -s", 'ask'],
        ['find . -maxdepth 0 -exec touch .ambicode/task/T/phantom \\;', 'deny'],
        ['find .ambicode/task/T -maxdepth 0 -execdir touch phantom \\;', 'ask'],
        ['echo .ambicode/task/T/phantom | xargs touch', 'ask'],
        ['echo phantom | xargs -I{} touch .ambicode/task/T/{}', 'ask'],
        ['touch -r /etc/hosts .ambicode/task/T/phantom', 'deny'],
        ['mkdir -m 755 -p .ambicode/task/T/phantom', 'deny'],
        ['cd .ambicode/task/T && ln -s /etc/hosts phantom', 'deny'],
        ['install -m 644 /etc/hosts .ambicode/task/T/phantom', 'deny'],
        ['dd if=/dev/null of=.ambicode/task/T/phantom 2>/dev/null', 'deny'],
        ['touch elsewhere/phantom; mkdir -p elsewhere/x; ls .ambicode/task', undefined],
      ],
    ],
    [
      'what the command changes about how paths resolve',
      [
        ['CDPATH=.ambicode/task cd T && echo x > phantom', 'ask'],
        ['export CDPATH=.ambicode/task; cd T && echo x > phantom', 'ask'],
        ['cdpath=(.ambicode/task); cd T && echo x > phantom', 'ask'],
        ['cd ./elsewhere && echo x > phantom', undefined],
        ['HOME=$PWD/.ambicode/task/T; echo x > ~/phantom', 'ask'],
        ['export HOME=$PWD/.ambicode/task/T; cd && echo x > phantom', 'ask'],
        ['cd .ambicode/task/T; cd /; echo x > ~-/phantom', 'ask'],
        ['hash -d t=$PWD/.ambicode/task/T; echo x > ~t/phantom', 'ask'],
        ['cd .ambicode/t*/T && echo x > phantom', 'ask'],
        ['echo x | tee .ambicode/{task,x}/T/phantom', 'deny'],
        ['echo x > .ambicode/task/T/ph*', 'ask'],
        ['setopt cdablevars; t=.ambicode/task/T; cd t && echo x > phantom', 'ask'],
        ["zsh -o cdablevars -c 't=.ambicode/task/T; cd t && echo x > phantom'", 'ask'],
        ['set -euo pipefail; echo x > .ambicode/task/T/phantom', 'deny'],
        ['set -euo pipefail; echo x > elsewhere/phantom', undefined],
      ],
    ],
    [
      'zsh-only syntax and names only the shell expands',
      [
        ['echo x >! .ambicode/task/T/phantom', 'ask'],
        ['echo x >>| .ambicode/task/T/phantom', 'ask'],
        ['{ echo x > .ambicode/task/T/phantom } always { true }', 'ask'],
        ['G=git; $G push', 'ask'],
        ['$(echo git) push', 'ask'],
        ['git $(echo push)', 'ask'],
        ['git -c alias.p=push p', 'ask'],
        ['git status\r', undefined],
        ['toString x > .ambicode/task/T/phantom', 'deny'],
        ["echo git push '$(git push)'", undefined],
      ],
    ],
  ] as const) {
    it(`agrees with bash 3.2 and zsh on ${label}`, () => {
      for (const [command, decision] of rows) {
        const shells = observed(command);
        if (shells !== undefined) assert.notEqual(decision, undefined, `a shell ran or wrote: ${command}`);
        if (decision === 'deny') assert.equal(shells, 'deny', `not every shell wrote: ${command}`);
        assert.equal(scene().guard(command), decision, command);
      }
    });
  }

  it('a parameter name or subscript of any length is read whole: no bound turns it into a decision', () => {
    const phantom = '.ambicode/task/T/phantom';
    for (const length of [1, 63, 64, 65, 159, 160, 161, 10_000]) {
      const name = 'V'.repeat(length);
      const pad = ' '.repeat(length);
      for (const [command, decision] of [
        [`${name}=a; echo "\${${name}#'$(tee ${phantom})'}"`, undefined],
        [`${name}=a; echo "\${${name}#$(git push)}"`, 'ask'],
        [`A=(a); echo "\${A[0${pad}]#'$(tee ${phantom})'}"`, undefined],
        [`A=(a); echo "\${A[$(git push)${pad}]}"`, 'ask'],
        [`A=(a); echo "\${A[$(echo x > ${phantom})${pad}]}"`, 'deny'],
        [`A=(a); echo \${A[$(echo x > ${phantom})${pad}]}`, 'deny'],
      ] as const) {
        const { guard } = scene();
        assert.equal(observed(command), decision, command.slice(0, 80));
        assert.equal(guard(command), decision, command.slice(0, 80));
      }
    }
  });

  it('[zsh] 4000 nested ${X:-…} still runs the git write, and the guard asks', (t) => {
    if (!programs.includes('zsh')) return t.skip('no zsh');
    const command = 'git push; echo ' + '${X:-'.repeat(4000) + 'x' + '}'.repeat(4000);
    const { shell, guard } = scene();
    assert.deepEqual(shell(command, undefined, true, 'zsh', { X: 'set' }).gitRan, ['push']);
    assert.equal(guard(command), 'ask');
  });
});

describe('an active route shapes the decision', () => {
  const route = (headless: boolean) => ({ activeRoute: () => ({ task: 'T-1', skill: 'task', ...(headless ? { headless: true } : {}) }), ledger: () => null });
  const run = (command: string, headless: boolean) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', scratchpad_dir: '/s', tool_input: { command } }, '/p', route(headless), 'linux') as Output & {
      hookSpecificOutput?: { updatedInput?: { command: string } };
    };

  it('turns an ask into a deny that names the stop in a headless route only', () => {
    assert.equal(decisionOf(run('git push', false)), 'ask');
    const out = run('git push', true);
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /route stop --task T-1 --reason blocked --detail "permission-denied: /);
  });

  it('adds --task to an ambicode route command that lacks it', () => {
    const out = run('node "/p/scripts/ambicode.mjs" route next', false);
    assert.equal(decisionOf(out), 'allow');
    assert.equal(out.hookSpecificOutput?.updatedInput?.command, 'node "/p/scripts/ambicode.mjs" route next --task T-1');
  });

  it('adds --task to read, map, refs, find and relates; keeps an explicit one', () => {
    for (const name of ['read src/a.ts:1:5', 'map', 'refs Foo', 'find Foo', 'relates src/a.ts']) {
      const out = run(`node /p/scripts/ambicode.mjs ${name}`, false);
      assert.equal(decisionOf(out), 'allow', name);
      assert.equal(out.hookSpecificOutput?.updatedInput?.command, `node /p/scripts/ambicode.mjs ${name} --task T-1`, name);
    }
    for (const command of ['node /p/scripts/ambicode.mjs read --task X src/a.ts', 'node /p/scripts/ambicode.mjs map --task=X']) {
      assert.deepEqual(run(command, false), {}, command);
    }
  });

  it('leaves other ambicode commands alone', () => {
    for (const command of ['node /p/scripts/ambicode.mjs route next --task X', 'node /p/scripts/ambicode.mjs route next | cat', 'node /p/scripts/ambicode.mjs route start --task X', 'node /p/scripts/ambicode.mjs doctor']) {
      assert.deepEqual(run(command, false), {}, command);
    }
    assert.deepEqual(bash('node /p/scripts/ambicode.mjs route next'), {});
  });

  it('never rewrites or allows a command that hides shell syntax in the script path or splits a line', () => {
    for (const command of ['node "$(id)ambicode.mjs" route next', 'node a`id`/ambicode.mjs route next', 'node a&&id&&b/ambicode.mjs route next', 'node a;id;b/ambicode.mjs route next', 'node x/ambicode.mjs\nroute next', 'node /p/ambicode.mjs route next; rm -rf ~']) {
      assert.notEqual(decisionOf(run(command, false)), 'allow', command);
    }
  });
});

describe('an unquoted --include/--exclude glob is quoted, because zsh expands it and aborts the command', () => {
  type Rewrite = Output & { hookSpecificOutput?: { updatedInput?: { command: string } } };
  const rewritten = (command: string, extra: Partial<GuardInput> = {}, state?: Parameters<typeof guardDecision>[2]): string | null => {
    const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra }, '/p', state, 'linux') as Rewrite;
    return decisionOf(out) === 'allow' ? out.hookSpecificOutput!.updatedInput!.command : null;
  };

  it('quotes one value and says why', () => {
    const out = bash('grep -rnE "pattern" src --include=*.ts') as Rewrite;
    assert.equal(decisionOf(out), 'allow');
    assert.equal(out.hookSpecificOutput?.updatedInput?.command, `grep -rnE "pattern" src --include='*.ts'`);
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /zsh expands an unquoted glob/);
  });

  it('quotes every value in one segment, across a pipeline, and the space-separated and -dir forms', () => {
    assert.equal(rewritten('grep -r foo . --include=*.ts --exclude=*.test.ts --exclude-dir=node_modules* | head'), `grep -r foo . --include='*.ts' --exclude='*.test.ts' --exclude-dir='node_modules*' | head`);
    assert.equal(rewritten('grep -r foo . --include *.ts; ls --include=?.md'), `grep -r foo . --include '*.ts'; ls --include='?.md'`);
  });

  it('leaves quoted values, values without glob characters and braces alone', () => {
    for (const command of [
      `grep -r foo . --include='*.ts'`,
      'grep -r foo . --include="*.ts"',
      'grep -r foo . --include=\\*.ts',
      'grep -r foo . --include=ts',
      'grep -r foo . --include=*.{ts,js}',
      'grep -r foo . --include=$GLOB',
      `echo "--include=*.ts"`,
      `echo '--include=*.ts'`,
      'echo x--include=*.ts',
      'grep -r foo . # --include=*.ts',
    ]) {
      assert.equal(rewritten(command), null, command);
    }
  });

  it('never touches a heredoc body, and still quotes after it', () => {
    assert.equal(rewritten('cat <<EOF\ngrep --include=*.ts\nEOF'), null);
    assert.equal(rewritten("cat <<'EOF' > f\n--include=*.ts\nEOF\ngrep -r x . --include=*.ts"), "cat <<'EOF' > f\n--include=*.ts\nEOF\ngrep -r x . --include='*.ts'");
  });

  it('composes with the $R alias rewrite into one updatedInput', () => {
    const out = bash('R="node /p/scripts/ambicode.mjs"; $R read --task T && grep -r x . --include=*.ts') as Rewrite;
    assert.equal(decisionOf(out), 'allow');
    assert.equal(out.hookSpecificOutput?.updatedInput?.command, `R="node /p/scripts/ambicode.mjs"; node /p/scripts/ambicode.mjs read --task T && grep -r x . --include='*.ts'`);
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /\$R.*zsh expands/);
  });

  it('composes with the --task rewrite', () => {
    const route = { activeRoute: () => ({ task: 'T-1', skill: 'task' }), ledger: () => null };
    const command = rewritten('node /p/scripts/ambicode.mjs route next', { scratchpad_dir: '/s' }, route);
    assert.equal(command, 'node /p/scripts/ambicode.mjs route next --task T-1');
    assert.equal(rewritten('grep -r x . --include=*.ts', { scratchpad_dir: '/s' }, route), `grep -r x . --include='*.ts'`);
  });

  it('lets an ask or a deny win over the rewrite', () => {
    assert.equal(decisionOf(bash('git commit -m x; grep -r x . --include=*.ts')), 'ask');
    assert.equal(decisionOf(bash('rm -rf / ; grep -r x . --include=*.ts')), 'ask');
    const headless = { activeRoute: () => ({ task: 'T-1', skill: 'task', headless: true }), ledger: () => null };
    const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', scratchpad_dir: '/s', tool_input: { command: 'git push && grep -r x . --include=*.ts' } }, '/p', headless, 'linux') as Rewrite;
    assert.equal(decisionOf(out), 'deny');
    assert.equal(out.hookSpecificOutput?.updatedInput, undefined);
  });

  it('[zsh] the original aborts and the rewritten command runs', (t) => {
    if (spawnSync('zsh', ['-c', 'true']).status !== 0) return t.skip('no zsh');
    const original = 'echo start; echo --include=*.nomatch';
    assert.notEqual(spawnSync('zsh', ['-c', original], { encoding: 'utf8' }).stderr, '');
    const fixed = rewritten(original)!;
    const run = spawnSync('zsh', ['-c', fixed], { encoding: 'utf8' });
    assert.equal(run.stderr, '');
    assert.equal(run.stdout, 'start\n--include=*.nomatch\n');
  });
});

describe('D5: reading source through read while the route waits on a note', () => {
  const TASK_DIR = '/repo/.ambicode/task/T';
  const FILES = new Set(['/repo/src/a.ts', '/repo/src/b.ts', '/repo/.ambicode/task/T/steps/read.md', '/elsewhere/c.ts']);
  const delivered = (answer: boolean, status = 'delivered'): LedgerEntry[] => [
    { id: 'a-1', at, kind: 'route', skill: 'investigate', session: 'S' },
    { id: 'a-2', at, kind: 'step', step: 'read', status, ...(answer ? { answer: 'note' } : {}) },
  ];
  type Position = 'note' | 'other step' | 'step completed' | 'exited' | 'no route';
  const entriesAt = (position: Position): LedgerEntry[] =>
    position === 'note' ? delivered(true) : position === 'other step' ? delivered(false) : position === 'step completed' ? [...delivered(true), { id: 'a-3', at, kind: 'step', step: 'read', status: 'completed' }] : [...delivered(true), { id: 'a-3', at, kind: 'exit', reason: 'done' }];
  const decide = (tool: string, input: Record<string, unknown>, position: Position, headless: boolean, cwd = '/repo') => {
    const state: GuardState = {
      activeRoute: () => (position === 'no route' ? null : { task: 'T', skill: 'investigate', ...(headless ? { headless: true } : {}) }),
      ledger: (directory) => (directory === TASK_DIR ? entriesAt(position) : null),
      file: (file) => FILES.has(file),
    };
    return guardDecision({ hook_event_name: 'PreToolUse', tool_name: tool, cwd, scratchpad_dir: '/s', tool_input: input }, '/p', state, 'linux') as Output;
  };
  const use = (target: string) => `use: node "/p/scripts/ambicode.mjs" read --task T ${target}`;
  const bashAt = (command: string, position: Position, headless: boolean, cwd?: string) => decide('Bash', { command }, position, headless, cwd);

  const redirected: [string, Record<string, unknown> | string, string][] = [
    ['Read', { file_path: '/repo/src/a.ts' }, 'src/a.ts'],
    ['Read offset+limit', { file_path: '/repo/src/a.ts', offset: 10, limit: 20 }, 'src/a.ts:10-29'],
    ['Read limit only', { file_path: '/repo/src/a.ts', limit: 5 }, 'src/a.ts:1-5'],
    ['Read offset only', { file_path: '/repo/src/a.ts', offset: 7 }, 'src/a.ts:7'],
    ['cat', 'cat src/a.ts', 'src/a.ts'],
    ['cat of a quoted path', `cat 'src/a.ts'`, 'src/a.ts'],
    ['cat of two files', 'cat src/a.ts src/b.ts', 'src/a.ts src/b.ts'],
    ['cat absolute', 'cat /repo/src/a.ts', 'src/a.ts'],
    ['sed -n range', `sed -n '10,40p' src/a.ts`, 'src/a.ts:10-40'],
    ['sed -n one line', `sed -n 5p src/a.ts`, 'src/a.ts:5-5'],
    ['sed -n to the end', `sed -n '12,$p' src/a.ts`, 'src/a.ts:12'],
    ['sed -n without a range', `sed -n '/x/p' src/a.ts`, 'src/a.ts'],
    ['head -n', 'head -n 30 src/a.ts', 'src/a.ts:1-30'],
    ['head -N', 'head -20 src/a.ts', 'src/a.ts:1-20'],
    ['head -nN', 'head -n20 src/a.ts', 'src/a.ts:1-20'],
    ['head bare', 'head src/a.ts', 'src/a.ts'],
    ['tail', 'tail -n 30 src/a.ts', 'src/a.ts'],
    ['cat in a chain', 'cd /repo && cat src/a.ts', 'src/a.ts'],
  ];
  for (const [label, input, target] of redirected) {
    it(`${label}: headless denies and interactive asks, with the read command`, () => {
      const call = (headless: boolean) => (typeof input === 'string' ? bashAt(input, 'note', headless) : decide('Read', input, 'note', headless));
      const denied = call(true);
      assert.equal(decisionOf(denied), 'deny');
      assert.equal(denied.hookSpecificOutput!.permissionDecisionReason, use(target));
      const asked = call(false);
      assert.equal(decisionOf(asked), 'ask');
      assert.equal(asked.hookSpecificOutput!.permissionDecisionReason, use(target));
    });
  }

  const untouched: [string, string, Record<string, unknown> | string][] = [
    ['grep', 'Bash', 'grep -rn total src'],
    ['ls', 'Bash', 'ls src'],
    ['find', 'Bash', 'find src -name "*.ts"'],
    ['wc', 'Bash', 'wc -l src/a.ts'],
    ['git grep', 'Bash', 'git grep total'],
    ['git ls-files', 'Bash', 'git ls-files src'],
    ['a head filter', 'Bash', 'grep -rn total src | head -20'],
    ['a tail filter', 'Bash', 'git log --oneline | tail -5'],
    ['an ambicode read', 'Bash', 'node "/p/scripts/ambicode.mjs" read --task T src/a.ts'],
    ['an ambicode read of a span', 'Bash', 'node "/p/scripts/ambicode.mjs" read --task T src/a.ts:1-9'],
    ['a step file', 'Read', { file_path: '/repo/.ambicode/task/T/steps/read.md' }],
    ['a step file with cat', 'Bash', 'cat .ambicode/task/T/steps/read.md'],
    ['a path outside the repository', 'Read', { file_path: '/elsewhere/c.ts' }],
    ['cat outside the repository', 'Bash', 'cat /elsewhere/c.ts'],
    ['an untracked path', 'Read', { file_path: '/repo/src/missing.ts' }],
    ['cat of an untracked path', 'Bash', 'cat src/missing.ts'],
    ['cat of a glob', 'Bash', 'cat src/*.ts'],
    ['cat of a variable', 'Bash', 'cat $FILE'],
    ['sed -i', 'Bash', `sed -i 's/a/b/' src/a.ts`],
    ['cat of stdin', 'Bash', 'echo x | cat'],
  ];
  for (const [label, tool, input] of untouched) {
    it(`${label} is left alone in every mode`, () => {
      for (const headless of [true, false]) {
        const out = typeof input === 'string' ? bashAt(input, 'note', headless) : decide(tool, input, 'note', headless);
        assert.equal(decisionOf(out), undefined, `${label} ${headless ? 'headless' : 'interactive'}: ${JSON.stringify(out)}`);
      }
    });
  }

  for (const position of ['other step', 'step completed', 'exited', 'no route'] as const) {
    it(`reads are left alone with the route at: ${position}`, () => {
      for (const headless of [true, false]) {
        assert.deepEqual(decide('Read', { file_path: '/repo/src/a.ts' }, position, headless), {});
        assert.deepEqual(bashAt('cat src/a.ts', position, headless), {});
        assert.deepEqual(bashAt('head -n 5 src/a.ts', position, headless), {});
      }
    });
  }

  it('reads from a subdirectory find the repository above it', () => {
    assert.equal(bashAt('cat a.ts', 'note', true, '/repo/src').hookSpecificOutput!.permissionDecisionReason, use('src/a.ts'));
  });

  it('a state that cannot tell whether a file exists leaves reads alone', () => {
    const state: GuardState = { activeRoute: () => ({ task: 'T', skill: 'investigate' }), ledger: () => delivered(true) };
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Read', cwd: '/repo', scratchpad_dir: '/s', tool_input: { file_path: '/repo/src/a.ts' } }, '/p', state, 'linux'), {});
  });

  it('an existing ask or deny still wins, and the glob rewrite still composes on an allowed command', () => {
    assert.match(bashAt('git push && cat src/a.ts', 'note', true).hookSpecificOutput!.permissionDecisionReason, /route stop --task T/);
    assert.equal(decisionOf(bashAt('git push && cat src/a.ts', 'note', false)), 'ask');
    const out = bashAt('grep -rn x src --include=*.ts', 'note', true) as { hookSpecificOutput?: { permissionDecision?: string; updatedInput?: { command: string } } };
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'allow');
    assert.equal(out.hookSpecificOutput?.updatedInput?.command, `grep -rn x src --include='*.ts'`);
  });

  describe('a repository below the cwd (the eval sandbox: cwd /x/home/cwd, repository at repo/)', () => {
    const state = (headless: boolean): GuardState => ({
      activeRoute: () => ({ task: 'T', skill: 'investigate', ...(headless ? { headless: true } : {}) }),
      ledger: (directory) => (directory === '/x/home/cwd/repo/.ambicode/task/T' ? delivered(true) : null),
      file: (file) => file === '/x/home/cwd/repo/src/a.ts',
    });
    const at = (tool: string, input: Record<string, unknown>, headless = true) =>
      guardDecision({ hook_event_name: 'PreToolUse', tool_name: tool, cwd: '/x/home/cwd', scratchpad_dir: '/s', tool_input: input }, '/p', state(headless), 'linux') as Output;
    const cases: [string, string, Record<string, unknown>, string][] = [
      ['Read of an absolute path', 'Read', { file_path: '/x/home/cwd/repo/src/a.ts' }, 'src/a.ts'],
      ['cat of repo/src/a.ts', 'Bash', { command: 'cat repo/src/a.ts' }, 'src/a.ts'],
      ['cd repo && sed -n', 'Bash', { command: `cd repo && sed -n '1,40p' src/a.ts` }, 'src/a.ts:1-40'],
      ['cd <absolute repo> && head', 'Bash', { command: 'cd /x/home/cwd/repo && head -n 9 src/a.ts' }, 'src/a.ts:1-9'],
    ];
    for (const [label, tool, input, target] of cases) {
      it(`${label}: headless denies, interactive asks`, () => {
        assert.equal(decisionOf(at(tool, input)), 'deny');
        assert.equal(at(tool, input).hookSpecificOutput!.permissionDecisionReason, use(target));
        assert.equal(decisionOf(at(tool, input, false)), 'ask');
      });
    }
  });
});

describe('D5: a route recorded under the temporary-directory fallback (the hook got no scratchpad_dir)', () => {
  it('finds the pointer by session id: Read is denied and a headless ask becomes a deny', () => {
    const session = `guard-test-${process.pid}-${Date.now()}`;
    const key = `sha256${createHash('sha256').update(session).digest('hex').slice(0, 32)}`;
    const stateDir = path.join(tmpdir(), HOOK_STATE_DIR_NAME, key);
    const repo = mkdtempSync(path.join(tmpdir(), 'ambicode-guard-d5-'));
    roots.push(repo, stateDir);
    mkdirSync(path.join(repo, '.ambicode', 'task', 'T'), { recursive: true });
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {};\n');
    const ledger = [{ id: 'a-1', at: '2026-10-05T10:00:00.000Z', kind: 'route', skill: 'investigate', session: 'S' }, { id: 'a-2', at: '2026-10-05T10:00:00.000Z', kind: 'step', step: 'read', status: 'delivered', answer: 'note' }];
    writeFileSync(path.join(repo, '.ambicode', 'task', 'T', LEDGER_FILE), ledger.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, ACTIVE_ROUTE_FILE), JSON.stringify({ task: 'T', skill: 'investigate', headless: true }));
    const call = (tool: string, toolInput: Record<string, unknown>) =>
      guardDecision({ hook_event_name: 'PreToolUse', session_id: session, cwd: repo, tool_name: tool, tool_input: toolInput }, '/p', fsGuardState, 'linux') as Output;
    const read = call('Read', { file_path: path.join(repo, 'src', 'a.ts') });
    assert.equal(decisionOf(read), 'deny');
    assert.equal(read.hookSpecificOutput!.permissionDecisionReason, 'use: node "/p/scripts/ambicode.mjs" read --task T src/a.ts');
    assert.match(call('Bash', { command: 'git push' }).hookSpecificOutput!.permissionDecisionReason, /route stop --task T/);
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', cwd: repo, tool_name: 'Read', tool_input: { file_path: path.join(repo, 'src', 'a.ts') } }, '/p', fsGuardState, 'linux'), {});
  });
});
