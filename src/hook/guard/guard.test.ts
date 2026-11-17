import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { guardDecision } from './guard-core.ts';
import { fsGuardState } from './guard-state.ts';
import { GUARD_STATE_DIR_NAME, HEADLESS_FILE, type GuardInput } from '../types/guard.ts';
import { HEADLESS_FILE as ROUTE_HEADLESS_FILE } from '#harness/session/active-route';
import { HOOK_STATE_DIR_NAME } from '#types/platform/claude';

type Output = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string } };

const bash = (command: string, extra: Partial<GuardInput> = {}) =>
  guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra }) as Output;
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
  '/usr/bin/git push',
  'git stash -m list',
  'git stash -mlist',
  'git stash --message show',
  'git stash --message=list',
  'git stash -- list',
  'git stash -q list',
  'git stash "$ACTION"',
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

  it('ignores other tools, other events and malformed input', () => {
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 42 } }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), {});
    assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 7 } }), {});
    assert.deepEqual(guardDecision({}), {});
  });
});

describe('the task-directory guard sends notes through note save', () => {
  const decide = (tool_name: string, tool_input: Record<string, unknown>, extra: Partial<GuardInput> = {}) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra }) as Output;

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/.ambicode/tasks/ORD-17/investigation_2026-10-02T12-00.md' }],
    ['Write', { file_path: '.ambicode/tasks/x/plan_t.md' }],
    ['Edit', { file_path: '/repo/.ambicode/tasks/x/notes.md' }],
    ['MultiEdit', { file_path: 'C:\\repo\\.ambicode\\tasks\\x\\notes.md' }],
    ['NotebookEdit', { notebook_path: '/repo/.ambicode/tasks/x/n.ipynb' }],
    ['Write', { file_path: '/repo/.ambicode/./tasks/x/notes.md' }],
    ['Write', { file_path: '/repo/src/../.ambicode/tasks/x/notes.md' }],
    ['Write', { file_path: '/repo/.ambicode/tasks/x/steps/other.md' }],
    ['Bash', { command: 'echo x > .ambicode/tasks/T/result.md' }],
    ['Bash', { command: 'tee .ambicode/tasks/T/notes.md' }],
    ['Bash', { command: "sed -i 's/a/b/' .ambicode/tasks/T/notes.md" }],
    ['Bash', { command: 'cp a.md .ambicode/tasks/T/b.md' }],
    ['Bash', { command: 'mkdir -p .ambicode/tasks/X && cat > .ambicode/tasks/X/inv.md <<EOF\nnote\nEOF' }],
    ['Bash', { command: 'echo hi | tee .ambicode/tasks/X/n.md' }],
    ['Bash', { command: 'rm .ambicode/tasks/X/result.md' }],
    ['Bash', { command: 'mv .ambicode/tasks/X/result.md /tmp/' }],
    ['Write', { file_path: '/repo/.ambicode/tasks/X/ledger.jsonl' }],
    ['Bash', { command: 'echo \'{"id":"L9","kind":"acceptance"}\' >> .ambicode/tasks/X/ledger.jsonl' }],
    ['Bash', { command: 'git push && echo x > .ambicode/tasks/X/n.md' }],
  ] as const) {
    it(`denies ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      const out = decide(tool, input);
      assert.equal(decisionOf(out), 'deny');
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /note save/);
    });
  }

  it('resolves relative targets against the hook cwd', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'echo x > notes.md' }, { cwd: '/repo/.ambicode/tasks/X' })), 'deny');
    assert.equal(decisionOf(decide('Write', { file_path: 'notes.md' }, { cwd: '/repo/.ambicode/tasks/X' })), 'deny');
    assert.deepEqual(decide('Bash', { command: 'echo x > notes.md' }, { cwd: '/repo/docs' }), {});
  });

  // G14: an opaque target may or may not be the task directory; asking costs a click, denying costs a legitimate write.
  for (const command of [
    'OUT=.ambicode/tasks/X/n.md; echo x > $OUT',
    'd=.ambicode/tasks/X; f=$d/inv.md; cat > "$f" <<EOF\nnote\nEOF',
    'D=.ambicode/tasks; cp a.md $D',
    'tee "${TARGET}" .ambicode/x',
    'echo x > "$ROOT/.ambicode/tasks/X/n.md"',
    'cd "$D" && echo x > notes.md; ls .ambicode',
  ]) {
    it(`asks, never denies, for an opaque write target: ${JSON.stringify(command).slice(0, 60)}`, () => {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot tell where this writes/);
    });
  }

  // 14 of 14 audited unresolved targets were not under .ambicode/; each cost one or two calls.
  for (const command of ['cd sub && echo x > out.txt', 'echo x > $TMPDIR/a', 'cd "$D" && echo x > notes.md', 'cp a.md $DIR', 'cd - && echo x > n']) {
    it(`allows an unresolved write target when the command never mentions .ambicode: ${command}`, () => {
      assert.deepEqual(decide('Bash', { command }), {});
    });
  }
  it('still stops a variable assigned from .ambicode text', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'D=.ambicode/task; echo x > $D/ledger.jsonl' })), 'ask');
  });

  for (const [tool, input] of [
    ['Write', { file_path: '/repo/src/a.ts' }],
    ['Write', { file_path: '/repo/.ambicode/config.yaml' }],
    ['Write', { file_path: '/repo/.gitignore' }],
    ['Write', { file_path: '/repo/docs/.ambicode-task-notes.md' }],
    ['Read', { file_path: '/repo/.ambicode/tasks/x/plan.md' }],
    ['Bash', { command: 'cat .ambicode/tasks/x/plan.md' }],
    ['Bash', { command: 'ls .ambicode/tasks && grep -rn foo .ambicode/tasks/x 2>&1 | head' }],
    ['Bash', { command: 'grep -rn foo .ambicode/tasks/x > /dev/null' }],
    ['Bash', { command: 'node "/p/scripts/ambicode.mjs" note save --task X --kind investigation <<\'EOF\'\nsee .ambicode/tasks/X > older\nEOF' }],
    ['Bash', { command: 'echo done > /tmp/out.txt' }],
    ['Bash', { command: 'grep foo > out.txt' }],
    ['Bash', { command: 'echo ".ambicode/tasks"' }],
    ['Bash', { command: 'cp .ambicode/tasks/X/plan.md /tmp/plan.md' }],
    ['Bash', { command: "sed -i 's#.ambicode/tasks/#x#' src/a.ts" }],
  ] as const) {
    it(`leaves alone ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      assert.deepEqual(decide(tool, input), {});
    });
  }

  // A literal cd is followed; only a directory the shell alone knows, or one a failed cd may not have reached, asks.
  it('denies a relative target under the task directory after a literal cd', () => {
    for (const command of ['cd .ambicode/tasks/X && echo x > notes.md', 'cd .ambicode && echo x > tasks/X/n.md']) {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'deny', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /note save/);
    }
  });
  for (const command of ['cd /tmp && echo x > notes.md', 'pushd /tmp; rm notes.md', 'cd /tmp || exit 1; echo x > notes.md']) {
    it(`allows a relative target after a cd outside the task directory: ${command}`, () => assert.deepEqual(decide('Bash', { command }), {}));
  }
  it('allows the task-fix replay: cd into the repository, then append to a test', () => {
    assert.deepEqual(decide('Bash', { command: 'cd repo && cat >> tests/page.test.js <<EOF\nx\nEOF' }, { cwd: '/w' }), {});
  });
  it('a cd inside ( … ) ends with the subshell', () => {
    assert.deepEqual(decide('Bash', { command: '(cd .ambicode/tasks/X && ls); echo x > notes.md' }, { cwd: '/w' }), {});
    assert.equal(decisionOf(decide('Bash', { command: '(cd .ambicode/tasks/X && echo x > n.md)' }, { cwd: '/w' })), 'deny');
    assert.deepEqual(decide('Bash', { command: '(cd repo && cat >> tests/a.js <<EOF\nx\nEOF)' }, { cwd: '/w' }), {});
    assert.deepEqual(decide('Bash', { command: 'cd /tmp; (cd .ambicode/tasks/X); echo x > notes.md' }, { cwd: '/w' }), {});
  });
  for (const [command, reason] of [
    ['cd /repo/.ambicode/tasks/X; cd /tmp; echo x > n.md', /relative to a directory an earlier `cd` changed/],
    ['cd - && echo x > n; ls .ambicode', /cannot tell where this writes/],
    ['cd && echo x > n; ls .ambicode', /cannot tell where this writes/],
    ['popd; echo x > n; ls .ambicode', /cannot tell where this writes/],
  ] as const) {
    it(`asks for a relative target when the directory is not certain: ${command}`, () => {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, reason);
    });
  }
  it('allows mkdir of a task directory: it creates no content', () => {
    assert.deepEqual(decide('Bash', { command: 'mkdir -p .ambicode/tasks/t/steps' }), {});
  });
  it('leaves plan.md alone, written by a file tool or the shell: it is no note', () => {
    for (const tool of ['Write', 'Edit', 'MultiEdit']) assert.deepEqual(decide(tool, { file_path: '/repo/.ambicode/tasks/T/plan.md' }), {}, tool);
    for (const command of ['echo x > .ambicode/tasks/T/plan.md', 'mkdir -p .ambicode/tasks/S/steps && cat > .ambicode/tasks/S/plan.md <<EOF\nx\nEOF']) assert.deepEqual(decide('Bash', { command }), {}, command);
    assert.equal(decisionOf(decide('Write', { file_path: '/repo/.ambicode/tasks/T/plan.md.bak' })), 'deny');
    assert.equal(decisionOf(decide('Write', { file_path: '/repo/.ambicode/tasks/T/steps/plan.md' })), 'deny');
    for (const tool of ['Write', 'Edit']) assert.equal(decisionOf(decide(tool, { file_path: '/repo/.ambicode/reviews/R1/plan.md' })), 'deny', tool);
    assert.equal(decisionOf(decide('Bash', { command: 'echo x > .ambicode/reviews/R1/plan.md' })), 'deny');
  });
  for (const command of ['cd /tmp && echo x > /tmp/notes.md', 'cd /tmp && echo x > /dev/null']) {
    it(`leaves an absolute target after a cd alone: ${command}`, () => assert.deepEqual(decide('Bash', { command }), {}));
  }
  it('asks, never denies, for a git write or the task directory inside an expansion; a harmless one is silent', () => {
    for (const command of ['echo "$(git push)"', 'echo "$(echo x > .ambicode/tasks/X/n.md)"', 'cat <(glab mr create)']) {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot read a command inside/);
    }
    assert.deepEqual(decide('Bash', { command: 'echo "$(date)"' }), {});
  });
  it('an unterminated quote asks when the segment mentions git or the task directory, and is silent otherwise', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'echo "oops; git push' })), 'ask');
    assert.equal(decisionOf(decide('Bash', { command: 'echo "x > .ambicode/tasks/T/a' })), 'ask');
    assert.deepEqual(decide('Bash', { command: 'echo "oops' }), {});
  });
  it('rm -rf of a glob or brace under the task directory is a literal target and denies', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'rm -rf .ambicode/tasks/X/*' })), 'deny');
  });
});

describe('note save and promote pass in any segment, with any prefix and quoting (M12)', () => {
  // Synthetic B3 (real-run §6): the denied save had `cd <repo> &&` before node and `=>`/`.ambicode/tasks/` in its body.
  const b3 =
    'cd /work/repo && node "/plugins/ambicode/scripts/ambicode.mjs" note save --task T --kind notes <<\'EOF\'\n' +
    '## Plan\nconst f = () => 1; // .ambicode/tasks/\nif (a > b) x >> y; echo x > .ambicode/tasks/T/plan.md\ngit push\n$(rm -rf .)\nEOF';
  for (const command of [
    'cd X && node "…/ambicode.mjs" note save --task T --kind notes <<\'EOF\'\nconst f = () => 1; // .ambicode/tasks/\nEOF',
    b3,
    "env A=1 node '/p q/scripts/ambicode.mjs' note save --task T --kind notes <<-EOF\n\tx > .ambicode/tasks/T/a\n\tEOF",
    'npx node "/p/scripts/ambicode.mjs" note save --task T --kind notes --from .ambicode/tasks/T/plan.md',
  ]) {
    it(`no decision: ${JSON.stringify(command).slice(0, 70)}`, () => assert.deepEqual(bash(command), {}));
  }

  it('the rest of the command is still classified', () => {
    assert.equal(decisionOf(bash(`${b3}\ngit push`)), 'ask');
    assert.equal(decisionOf(bash('node /p/scripts/ambicode.mjs note save --task T --kind notes > .ambicode/tasks/T/x.md')), 'deny');
  });
});

// An interpreter's writes are invisible to the parser; the ledger answer line is the human's consent, so it must not be appendable unseen.
describe('an interpreter that names the run directory is not allowed silently', () => {
  const route = (headless: boolean) => ({ headless: () => headless });
  const headlessRun = (command: string) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', scratchpad_dir: '/s', tool_input: { command } }, '/p', route(true)) as Output;
  const appenders = [
    `python3 -c "open('.ambicode/tasks/t/ledger.jsonl','a').write('{}')"`,
    `python -c "open('.ambicode/reviews/r/ledger.jsonl','a').write('{}')"`,
    `node -e "require('fs').appendFileSync('.ambicode/tasks/t/ledger.jsonl', '{}')"`,
    `perl -e 'open F, ">>.ambicode/tasks/t/ledger.jsonl"; print F "{}"'`,
    `ruby -e "File.write('.ambicode/tasks/t/ledger.jsonl', '{}', mode: 'a')"`,
    `bash -c 'echo {} >> .ambicode/tasks/t/ledger.jsonl'`,
    `cd /repo && env PYTHONPATH=x /usr/bin/python3.12 -c "open('.ambicode/tasks/t/ledger.jsonl','a')"`,
    `python3 - <<'EOF'\nopen('.ambicode/tasks/t/ledger.jsonl','a').write('{}')\nEOF`,
    // A wrapper runs the interpreter, so it is not the command name.
    `timeout 5 python3 -c "open('.ambicode/tasks/t/ledger.jsonl','a').write('{}')"`,
    `nohup python3 -c "open('.ambicode/tasks/t/ledger.jsonl','a').write('{}')"`,
    `echo {} | xargs sh -c 'echo "$0" >> .ambicode/tasks/t/ledger.jsonl'`,
    `awk 'BEGIN{print "{}" > ".ambicode/tasks/t/ledger.jsonl"}'`,
    `pypy3 -c "open('.ambicode/tasks/t/ledger.jsonl','a').write('{}')"`,
    // ripgrep's --pre runs a program on every file.
    'rg --pre python3 x .ambicode/tasks/t',
  ];
  for (const command of appenders) {
    it(`asks interactively and denies headless: ${JSON.stringify(command).slice(0, 60)}`, () => {
      const out = bash(command);
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot tell what this runs/);
      assert.equal(decisionOf(headlessRun(command)), 'deny');
    });
  }
  for (const command of [
    'node /p/scripts/ambicode.mjs route start task',
    'node "/p/scripts/ambicode.mjs" check --task t --name unit --from .ambicode/tasks/t/plan.md',
    'node --no-warnings "/p/scripts/ambicode.mjs" check --task t --name unit --from .ambicode/tasks/t/plan.md',
    'python3 -c "print(1)"',
    'node -e "console.log(2)" && cat .ambicode/config.yaml',
    'python3 scripts/build.py',
    'cat .ambicode/tasks/t/ledger.jsonl',
    // A reader that cannot run a program may search for an interpreter's name.
    'grep -n "node" .ambicode/tasks/x/plan.md',
    'rg perl .ambicode/reviews/r/1/notes.md',
    'grep -rn "python" .ambicode/tasks/x/',
    'egrep "bash|awk" .ambicode/tasks/x/plan.md | head -5',
    'rg -n python .ambicode/tasks/x',
  ]) {
    it(`leaves alone: ${command.slice(0, 60)}`, () => assert.deepEqual(bash(command), {}));
  }
  // An interpreter read of a task file is no reason to end a headless route: the retry names the Read tool.
  it('headless, an interpreter read of a task file is denied with a retry and no route-stop instruction', () => {
    for (const command of ['bash -c "cat .ambicode/tasks/x/plan.md"', `python3 -c "print(open('.ambicode/tasks/x/plan.md').read())"`]) {
      const out = headlessRun(command);
      assert.equal(decisionOf(out), 'deny', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /Read tool/);
      assert.doesNotMatch(out.hookSpecificOutput!.permissionDecisionReason, /route stop/);
    }
  });
  it('headless, an interpreter beside another ask still stops the route', () => {
    assert.match(headlessRun('bash -c "cat .ambicode/tasks/x/plan.md"; git push').hookSpecificOutput!.permissionDecisionReason, /route stop/);
  });
});

describe('the task-directory message names a command that runs as written', () => {
  it('substitutes the plugin root the hook was given', () => {
    const out = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.ambicode/tasks/x/p.md' } }, '/opt/plugin') as Output;
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /node "\/opt\/plugin\/scripts\/ambicode\.mjs" note save/);
  });
  it('02-G1: names the kinds note save accepts', () => {
    const out = bash('echo x > .ambicode/tasks/T/n.md');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /note save --task <slug> --kind investigation\|notes\|result\|report`/);
  });
});
const roots: string[] = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** One scratchpad; a session in `headless` has the marker a live headless route leaves. */
function fixture(headless: string[] = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'ambicode-guard-'));
  roots.push(root);
  const scratch = path.join(root, 'scratch');
  mkdirSync(path.join(scratch, HOOK_STATE_DIR_NAME), { recursive: true });
  for (const session of headless) writeFileSync(path.join(scratch, HOOK_STATE_DIR_NAME, HEADLESS_FILE), '');
  return { scratch };
}

describe('config.yaml and .gitignore are not guarded, in or out of an init route', () => {
  for (const file of ['/repo/.ambicode/config.yaml', '/repo/.gitignore']) {
    it(`leaves ${file} alone`, () => {
      const { scratch } = fixture();
      assert.deepEqual(guardDecision({ hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch, tool_name: 'Write', tool_input: { file_path: file } }, '/p', fsGuardState), {});
    });
  }
});

describe('the headless marker', () => {
  it('is read from the scratchpad state and from the temporary-directory fallback of the session', () => {
    const { scratch } = fixture(['A']);
    assert.equal(fsGuardState.headless(scratch, null), true);
    assert.equal(fsGuardState.headless(path.join(scratch, 'elsewhere'), null), false);
    assert.equal(fsGuardState.headless(null, null), false);
  });
});

describe('the guard state reader', () => {
  it('uses the hook state directory and headless file names the CLI uses', () => {
    assert.equal(GUARD_STATE_DIR_NAME, HOOK_STATE_DIR_NAME);
    assert.equal(HEADLESS_FILE, ROUTE_HEADLESS_FILE);
  });
});
describe('the built guard entry', () => {
  const built = new URL('../../../scripts/guard.mjs', import.meta.url);
  const run = (stdin: string) => spawnSync('node', [built.pathname], { input: stdin, encoding: 'utf8' });

  it('answers on stdin/stdout and survives garbage', { skip: !existsSync(built) }, () => {
    const asked = JSON.parse(execFileSync('node', [built.pathname], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), encoding: 'utf8' }));
    assert.equal(asked.hookSpecificOutput.permissionDecision, 'ask');
    for (const stdin of ['not json', '', 'null', '42', '{}', '{"hook_event_name":"PreToolUse"}', '{"hook_event_name":"Stop"}', '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/r/.ambicode/tasks/x"}}', '{"hook_event_name":"PostToolUse","tool_name":"Bash"}', '{"hook_event_name":"PostToolUse","scratchpad_dir":"/nowhere","transcript_path":"/nowhere.jsonl","tool_use_id":"t"}']) {
      const result = run(stdin);
      assert.equal(result.status, 0, stdin);
      assert.deepEqual(JSON.parse(result.stdout), {}, stdin);
    }
    assert.match(run('not json').stderr, /^ambicode guard: no decision: /);
  });

  // A FIFO with no writer blocks a plain open; the guard must answer at once instead. Spawned, so a regression times out.
  it('answers at once when the headless marker is a FIFO', { skip: !existsSync(built) || process.platform === 'win32' }, () => {
    const { scratch } = fixture();
    const marker = path.join(scratch, HOOK_STATE_DIR_NAME, HEADLESS_FILE);
    execFileSync('mkfifo', [marker]);
    const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'A', scratchpad_dir: scratch, tool_name: 'Write', tool_input: { file_path: '/repo/.ambicode/tasks/T/notes.md' } });
    const result = spawnSync('node', [built.pathname], { input, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
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

describe('an active route shapes the decision', () => {
  const P = 'O=.ambicode/x; ';
  const route = (headless: boolean) => ({ headless: () => headless });
  const run = (command: string, headless: boolean) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', scratchpad_dir: '/s', tool_input: { command } }, '/p', route(headless)) as Output;

  it('turns an ask into a deny that tells a headless route to finish with permission-denied only', () => {
    assert.equal(decisionOf(run('git push', false)), 'ask');
    const out = run('git push', true);
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /final message that says "permission-denied: /);
  });
  it('a placement ask in a headless route denies with a retry that names the path literally, and stops nothing', () => {
    for (const command of [`${P}echo x > "$OUT"`, `cd /tmp && cd - && echo x > n; ls .ambicode`]) {
      const out = run(command, true);
      assert.equal(decisionOf(out), 'deny', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot tell where this writes.*literally.*Write tool.*run it again/s);
      assert.doesNotMatch(out.hookSpecificOutput!.permissionDecisionReason, /route stop/);
    }
    assert.equal(decisionOf(run(`${P}echo x > "$OUT"`, false)), 'ask');
    assert.equal(decisionOf(run('cd - && echo x > n; ls .ambicode', false)), 'ask');
  });
  it('a placement ask beside any other ask in a headless route still stops the route', () => {
    for (const command of [`${P}echo x > "$OUT" && git push`, `${P}echo x > "$OUT" && echo "oops; git push`, `${P}echo x > "$OUT"; $TOOL a`]) {
      assert.match(run(command, true).hookSpecificOutput!.permissionDecisionReason, /route stop/, command);
    }
  });
  it('an unresolvable command name in a headless route is retried written out, and stops nothing', () => {
    const command = 'A="node /p/scripts/ambicode.mjs"; $A check --task rev-math --name unit';
    assert.equal(decisionOf(run(command, false)), 'ask');
    const out = run(command, true);
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /again with the command written out \(no variable, no eval\)/);
    assert.doesNotMatch(out.hookSpecificOutput!.permissionDecisionReason, /route stop/);
    assert.match(run(`${command}; git push`, true).hookSpecificOutput!.permissionDecisionReason, /route stop/);
  });
  it('leaves a deny and an allow as they are in a headless route', () => {
    assert.match(run('echo x > .ambicode/tasks/T/a.md', true).hookSpecificOutput!.permissionDecisionReason, /note save/);
    assert.deepEqual(run('git status', true), {});
  });
});

describe('the reviewer subagent may write only its answer file', () => {
  const ANSWER = '/repo/.ambicode/reviews/r-1/1/answer.json';
  const TASK_ANSWER = '/repo/.ambicode/tasks/fix-refund/reviews/2/answer.json';
  const file = (tool_name: string, file_path: string, agent_type: string | null = 'ambicode:reviewer', cwd?: string) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input: { file_path }, ...(agent_type === null ? {} : { agent_type }), ...(cwd === undefined ? {} : { cwd }) }) as Output;

  it('lets the reviewer Write answer.json in a review folder, plugin-named or not, as an absolute or a cwd-relative path', () => {
    assert.deepEqual(file('Write', ANSWER), {});
    assert.deepEqual(file('Write', TASK_ANSWER, 'reviewer'), {});
    assert.deepEqual(file('Write', '1/answer.json', 'ambicode:reviewer', '/repo/.ambicode/reviews/r-1'), {});
    assert.deepEqual(file('Write', '\\repo\\.ambicode\\reviews\\r-1\\1\\answer.json'), {});
  });

  it('refuses every other write of the reviewer: another file, another tool, a path that only looks like the answer', () => {
    for (const [tool, target] of [
      ['Write', '/repo/src/a.ts'], ['Write', '/repo/.ambicode/reviews/r-1/1/result.json'], ['Write', '/repo/.ambicode/tasks/fix-refund/ledger.jsonl'],
      ['Write', '/repo/answer.json'], ['Write', '/repo/.ambicode/context/answer.json'], ['Write', '/repo/.ambicode/reviews/r-1/1/answer.json.bak'],
      ['Write', '/repo/.ambicode/reviews/r-1/1/../../../../src/answer.json'], ['Edit', ANSWER], ['MultiEdit', ANSWER], ['NotebookEdit', ANSWER],
    ] as const) {
      const out = file(tool, target);
      assert.equal(decisionOf(out), 'deny', `${tool} ${target}`);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /reviewer writes only .*answer\.json/, `${tool} ${target}`);
    }
  });

  it('leaves everyone else under the old rule: answer.json under .ambicode is still the note-save refusal', () => {
    for (const agent of [null, 'ambicode:implementer', 'reviewer-extra']) {
      const out = file('Write', ANSWER, agent);
      assert.equal(decisionOf(out), 'deny', String(agent));
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /note save/);
    }
    assert.deepEqual(file('Write', '/repo/src/a.ts', 'ambicode:implementer'), {});
  });

  it('no longer reads the reviewer Bash calls: it has no Bash tool, so they are the main session rule', () => {
    assert.deepEqual(bash('ls', { agent_type: 'ambicode:reviewer' }), {});
    assert.equal(decisionOf(bash('git commit -m x', { agent_type: 'ambicode:implementer' })), 'ask');
  });
});

describe('the plan-critic subagent may write only its answer file', () => {
  const ANSWER = '/repo/.ambicode/tasks/ORD-17/steps/critic-answer.json';
  const file = (tool_name: string, file_path: string, agent_type = 'ambicode:plan-critic') =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input: { file_path }, agent_type }) as Output;

  it('lets it Write critic-answer.json in its task steps folder, plugin-named or not', () => {
    assert.deepEqual(file('Write', ANSWER), {});
    assert.deepEqual(file('Write', ANSWER, 'plan-critic'), {});
  });

  it('refuses the plan, a source file, a look-alike path and every other tool with the reason', () => {
    for (const [tool, target] of [
      ['Write', '/repo/.ambicode/tasks/ORD-17/plan.md'], ['Write', '/repo/src/a.ts'], ['Write', '/repo/.ambicode/tasks/ORD-17/ledger.jsonl'],
      ['Write', '/repo/.ambicode/tasks/ORD-17/steps/critic-answer.json.bak'], ['Write', '/repo/critic-answer.json'], ['Write', '/repo/.ambicode/tasks/ORD-17/steps/x/critic-answer.json'],
      ['Write', '/repo/.ambicode/reviews/r-1/1/answer.json'], ['Edit', ANSWER], ['MultiEdit', ANSWER],
    ] as const) {
      const out = file(tool, target);
      assert.equal(decisionOf(out), 'deny', `${tool} ${target}`);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /plan critic writes only .*critic-answer\.json/, `${tool} ${target}`);
    }
  });

  it('leaves the reviewer rule as it was: it still may not write the critic answer, and the main session is still told to use note save', () => {
    assert.equal(decisionOf(file('Write', ANSWER, 'ambicode:reviewer')), 'deny');
    assert.match(file('Write', ANSWER, 'ambicode:reviewer').hookSpecificOutput!.permissionDecisionReason, /reviewer writes only/);
    const main = guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: ANSWER } }) as Output;
    assert.match(main.hookSpecificOutput!.permissionDecisionReason, /note save/);
  });
});
