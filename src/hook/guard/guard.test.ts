import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { guardDecision } from './guard-core.ts';
import { fsGuardState } from './guard-state.ts';
import { LEDGER_FILE, type LedgerEntry } from '#types/modules/evidence';
import { ACTIVE_ROUTE_FILE, GUARD_LEDGER_FILE, GUARD_STATE_DIR_NAME, LEDGER_LIMIT, type GuardInput } from '../types/guard.ts';
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
    guardDecision({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra }) as Output;

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
    ['Write', { file_path: '/repo/.ambicode/task/X/ledger.jsonl' }],
    ['Bash', { command: 'echo \'{"id":"L9","kind":"acceptance"}\' >> .ambicode/task/X/ledger.jsonl' }],
    ['Bash', { command: 'git push && echo x > .ambicode/task/X/n.md' }],
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
  ] as const) {
    it(`leaves alone ${tool}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      assert.deepEqual(decide(tool, input), {});
    });
  }

  // No directory tracking: a relative target after a cd is not provably outside the task directory, so the guard asks.
  for (const command of ['cd .ambicode/task/X && echo x > notes.md', 'cd /tmp && echo x > notes.md', 'pushd /tmp; rm notes.md', 'cd /tmp || exit 1; echo x > notes.md']) {
    it(`asks for a relative target after a cd: ${command}`, () => {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot tell where this writes/);
    });
  }
  for (const command of ['cd /tmp && echo x > /tmp/notes.md', 'cd /tmp && echo x > /dev/null']) {
    it(`leaves an absolute target after a cd alone: ${command}`, () => assert.deepEqual(decide('Bash', { command }), {}));
  }
  it('asks, never denies, for a git write, the task directory or rm -r inside an expansion; a harmless one is silent', () => {
    for (const command of ['echo "$(git push)"', 'echo "$(echo x > .ambicode/task/X/n.md)"', 'echo `rm -rf x`', 'cat <(glab mr create)']) {
      const out = decide('Bash', { command });
      assert.equal(decisionOf(out), 'ask', command);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /cannot read a command inside/);
    }
    assert.deepEqual(decide('Bash', { command: 'echo "$(date)"' }), {});
  });
  it('an unterminated quote asks when the segment mentions git or the task directory, and is silent otherwise', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'echo "oops; git push' })), 'ask');
    assert.equal(decisionOf(decide('Bash', { command: 'echo "x > .ambicode/task/T/a' })), 'ask');
    assert.deepEqual(decide('Bash', { command: 'echo "oops' }), {});
  });
  it('rm -rf of a glob or brace under the task directory is a literal target and denies', () => {
    assert.equal(decisionOf(decide('Bash', { command: 'rm -rf .ambicode/task/X/*' })), 'deny');
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

  it('after another session --fresh, the former owner is denied naming the new owner', () => {
    const ledger = [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'exit', route: 'a-1', reason: 'superseded' }, planRoute('b-2', 'B')];
    const { write } = fixture(ledger, { A: onPlanT, B: onPlanT });
    assert.match(write('A').hookSpecificOutput!.permissionDecisionReason, /session B owns it/);
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
    ['legacy notes only', [{ id: 'L1', at, kind: 'note', note: 'plan', path: 'plan_x.md' }], { A: onPlanT }, 'A', undefined, /no plan route is open/],
    ['a later route with no skill', [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'route', session: 'B' }], { A: onPlanT }, 'A', undefined, /route b-1 names no skill/],
    ['a later route with a numeric skill', [planRoute('a-1', 'A'), { id: 'b-1', at, kind: 'route', skill: 7, session: 'B' }], { A: onPlanT }, 'A', undefined, /route b-1 names no skill/],
    ['an exit naming no route', [planRoute('a-1', 'A'), { id: 'x-1', at, kind: 'exit', route: 'zz' }], { A: onPlanT }, 'A', undefined, /exit x-1 names no route/],
    ['an exit with no route', [planRoute('a-1', 'A'), { id: 'x-1', at, kind: 'exit', reason: 'done' }], { A: onPlanT }, 'A', undefined, /exit x-1 names no route/],
  ] as [string, LedgerEntry[] | string | null, Record<string, unknown>, string | undefined, string | undefined, RegExp][]) {
    it(`denies for ${label}`, () => {
      const { write, repo } = fixture(ledger, pointers);
      const out = write(session, file === undefined ? undefined : path.join(repo, '.ambicode', 'task', file, 'steps', 'plan-body.md'));
      assert.equal(decisionOf(out), 'deny');
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, why);
      assert.match(out.hookSpecificOutput!.permissionDecisionReason, /route next/);
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
    assert.match(reason, /route next/);
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
        assert.match(out.hookSpecificOutput!.permissionDecisionReason, /init --apply/);
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
    const { repo, scratch } = fixture([planRoute('a-1', 'A'), { id: 'x-1', at, kind: 'exit', route: 'a-1', reason: 'superseded' }, planRoute('b-2', 'B')], { A: onPlanT, B: onPlanT });
    const input = (session: string) =>
      JSON.stringify({ hook_event_name: 'PreToolUse', session_id: session, scratchpad_dir: scratch[session], tool_name: 'Write', tool_input: { file_path: path.join(repo, '.ambicode/task/T/steps/plan-body.md') } });
    assert.deepEqual(JSON.parse(run(input('B')).stdout), {});
    assert.match(JSON.parse(run(input('A')).stdout).hookSpecificOutput.permissionDecisionReason, /owns it/);
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
  const route = (headless: boolean) => ({ activeRoute: () => ({ task: 'T-1', skill: 'task', ...(headless ? { headless: true } : {}) }), ledger: () => null });
  const run = (command: string, headless: boolean) =>
    guardDecision({ hook_event_name: 'PreToolUse', tool_name: 'Bash', scratchpad_dir: '/s', tool_input: { command } }, '/p', route(headless)) as Output;

  it('turns an ask into a deny that tells a headless route to finish with permission-denied only', () => {
    assert.equal(decisionOf(run('git push', false)), 'ask');
    const out = run('git push', true);
    assert.equal(decisionOf(out), 'deny');
    assert.match(out.hookSpecificOutput!.permissionDecisionReason, /final message that says "permission-denied: /);
  });
  it('leaves a deny and an allow as they are in a headless route', () => {
    assert.match(run('echo x > .ambicode/task/T/a.md', true).hookSpecificOutput!.permissionDecisionReason, /note save/);
    assert.deepEqual(run('git status', true), {});
  });
  it('never rewrites a command: no updatedInput is answered', () => {
    assert.deepEqual(run('node /p/scripts/ambicode.mjs route next', false), {});
    assert.deepEqual(run('grep -rn x --include=*.ts .', false), {});
  });
});
