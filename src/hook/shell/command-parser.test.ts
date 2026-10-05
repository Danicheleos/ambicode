import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { type Directories, type ParseOptions, parseCommand } from './command-parser.ts';

// The segments that were analysed; `unanalysed` says whether one stands for a part that was not.
const analysed = (command: string, options: ParseOptions = {}) => parseCommand(command, options).filter((segment) => segment.unparsed !== true);
const unanalysed = (command: string) => parseCommand(command).some((segment) => segment.unparsed === true);
const argvs = (command: string) => analysed(command).map((segment) => segment.argv);
const targets = (command: string, options: ParseOptions = {}) =>
  analysed(command, options).flatMap((segment) => segment.writeTargets.map(({ path, opaque }) => ({ path, opaque })));
const placed = (command: string) =>
  analysed(command).flatMap((segment) => segment.writeTargets.map((target) => [target.path, target.directories]));

describe('parseCommand splits segments structurally', () => {
  it('splits on &&, ||, ;, |, & and newline outside quotes', () => {
    assert.deepEqual(argvs('a 1 && b 2 || c; d | e & f\ng'), [['a', '1'], ['b', '2'], ['c'], ['d'], ['e'], ['f'], ['g']]);
    assert.deepEqual(argvs(`echo "a && b; c | d" 'e || f'`), [['echo', 'a && b; c | d', 'e || f']]);
  });

  it('removes quotes and escapes, and keeps raw text per segment', () => {
    const [first, second] = parseCommand(`printf "x\\"y" a\\ b && echo 'it''s'`);
    assert.deepEqual(first!.argv, ['printf', 'x"y', 'a b']);
    assert.equal(first!.raw, 'printf "x\\"y" a\\ b');
    assert.deepEqual(second!.argv, ['echo', 'its']);
  });

  it('drops comments and joins continued lines', () => {
    assert.deepEqual(argvs('git status # git push\nls'), [['git', 'status'], ['ls']]);
    assert.deepEqual(argvs('git \\\n  push'), [['git', 'push']]);
  });

  it('never throws on unterminated quotes, substitutions or heredocs', () => {
    for (const command of [`echo "abc`, `echo 'abc`, 'echo $(ls', 'echo `ls', 'cat <<EOF\nno end', 'echo \\', '>', '<<', '"\\']) {
      assert.ok(Array.isArray(parseCommand(command)), command);
    }
  });
});

describe('parseCommand never tokenises a heredoc body', () => {
  const body = 'git push; echo x > .ambicode/task/T/plan.md\nconst f = () => 1; // .ambicode/task/';
  for (const [label, command] of [
    ['<<WORD', `cat <<EOF\n${body}\nEOF\nls`],
    ["<<'WORD'", `cat <<'EOF'\n${body}\nEOF\nls`],
    ['<<"WORD"', `cat <<"EOF"\n${body}\nEOF\nls`],
    ['<<-WORD ending at a tab-indented WORD', `cat <<-EOF\n\t${body}\n\tEOF\nls`],
    ['two heredocs on one line', `cat <<A <<'B'\n${body}\nA\n${body}\nB\nls`],
    ['a CRLF body', `cat <<EOF\r\n${body}\r\nEOF\r\nls`],
  ] as const) {
    it(label, () => {
      assert.deepEqual(argvs(command), [['cat'], ['ls']]);
      assert.deepEqual(targets(command), []);
    });
  }

  it('a <<WORD body does not end at an indented WORD', () => {
    assert.deepEqual(argvs('cat <<EOF\n\tEOF\ngit push\nEOF\nls'), [['cat'], ['ls']]);
  });

  it('an unterminated body runs to the end of the command', () => {
    assert.deepEqual(argvs('cat <<EOF\ngit push\n'), [['cat']]);
  });

  it('a here-string is a read, not a heredoc', () => {
    assert.deepEqual(argvs('cat <<< "x"\ngit push'), [['cat'], ['git', 'push']]);
  });
});

describe('parseCommand flags shell expansions as opaque', () => {
  it('$VAR, ${…}, $(…), backticks and $\'…\' are one opaque token each; single-quoted $ is literal', () => {
    const segment = parseCommand(`echo $HOME "\${A:-b}" $(ls -1) \`pwd\` $'x\\'y' '$LIT' a$1 $`).at(-1);
    assert.deepEqual(segment!.opaque, [false, true, true, true, true, true, false, true, false]);
    assert.deepEqual(segment!.argv.slice(1, 4), ['$HOME', '${A:-b}', '$(ls -1)']);
  });

  it('parses the commands that substitutions run as segments of their own, before the command that uses them', () => {
    assert.deepEqual(argvs('echo "$(git push)" `git commit` $(echo $(git stash))'), [
      ['git', 'push'],
      ['git', 'commit'],
      ['git', 'stash'],
      ['echo', '$(git stash)'],
      ['echo', '$(git push)', '`git commit`', '$(echo $(git stash))'],
    ]);
  });

  it('finds substitutions inside ${…} and $((…)), quoted or not', () => {
    assert.deepEqual(argvs('echo ${X:-$(git push)}'), [['git', 'push'], ['echo', '${X:-$(git push)}']]);
    assert.deepEqual(argvs('echo "${X:-`git commit`}"'), [['git', 'commit'], ['echo', '${X:-`git commit`}']]);
    assert.deepEqual(argvs('echo $(( $(git push) + 1 ))'), [['git', 'push'], ['echo', '$(( $(git push) + 1 ))']]);
    assert.deepEqual(argvs('echo ${X:-${Y:-$(git stash)}}'), [['git', 'stash'], ['echo', '${X:-${Y:-$(git stash)}}']]);
  });

  it('arithmetic, parameter defaults and quoted text run no command', () => {
    assert.deepEqual(argvs('echo $((1 + (2 * 3)))'), [['echo', '$((1 + (2 * 3)))']]);
    assert.deepEqual(argvs("echo ${X:-'$(git push)'} '$(git push)'"), [['echo', "${X:-'$(git push)'}", '$(git push)']]);
    assert.deepEqual(argvs('((n > 5)) && echo ok'), [['((n > 5))'], ['echo', 'ok']]);
    assert.deepEqual(targets('((n > 5))'), []);
  });
});

describe('parseCommand reads a heredoc delimiter literally', () => {
  it('a delimiter that looks like a substitution runs nothing and still ends the body', () => {
    for (const command of ['git status << "X$(git push)"\nbody\nX$(git push)\nls', 'git status << X$(git push)\nbody\nX$(git push)\nls', "git status <<'X`git push`'\nbody\nX`git push`\nls"]) {
      assert.deepEqual(argvs(command), [['git', 'status'], ['ls']], command);
    }
  });
});

describe('parseCommand finds argv[0] after prefixes', () => {
  for (const [command, argv] of [
    ['env A=1 B=2 git push', ['git', 'push']],
    ['env -u X git push', ['git', 'push']],
    ['A=1 git push', ['git', 'push']],
    ['sudo -u root git push', ['git', 'push']],
    ['node "/p/scripts/ambicode.mjs" note save --task T', ['/p/scripts/ambicode.mjs', 'note', 'save', '--task', 'T']],
    ['npx -y tsx run.ts', ['tsx', 'run.ts']],
    ['timeout 5 git push', ['git', 'push']],
    ['time git push', ['git', 'push']],
    ['if git commit; then echo; fi', ['git', 'commit']],
    ['(git push)', ['git', 'push']],
    ['! git push', ['git', 'push']],
  ] as const) {
    it(command, () => assert.deepEqual(argvs(command)[0], argv));
  }
});

describe('parseCommand reports write targets', () => {
  for (const [command, expected] of [
    ['echo x > out.txt', [{ path: 'out.txt', opaque: false }]],
    ['echo x >>out.txt', [{ path: 'out.txt', opaque: false }]],
    ['cmd 2> err.log', [{ path: 'err.log', opaque: false }]],
    ['cmd &> all.log', [{ path: 'all.log', opaque: false }]],
    ['cmd >| forced.txt', [{ path: 'forced.txt', opaque: false }]],
    ['cmd 2>&1', []],
    ['cmd >&2', []],
    ['cmd > /dev/null 2>/dev/null', []],
    ['cmd < in.txt', []],
    ['echo x > "$OUT"', [{ path: '$OUT', opaque: true }]],
    ['tee -a a.md b.md', [{ path: 'a.md', opaque: false }, { path: 'b.md', opaque: false }]],
    ["sed -i 's/a/b/' f.md", [{ path: 'f.md', opaque: false }]],
    ["sed -i.bak -e 's/a/b/' f.md g.md", [{ path: 'f.md', opaque: false }, { path: 'g.md', opaque: false }]],
    ["sed --in-place --expression='s/a/b/' f.md", [{ path: 'f.md', opaque: false }]],
    ["sed -n 's/a/b/p' f.md", []],
    ["sed -i 's#.ambicode/task/#x#' src/a.ts", [{ path: 'src/a.ts', opaque: false }]],
    ['cp a.md b.md dir/', [{ path: 'dir/', opaque: false }]],
    ['cp -t dir/ a.md b.md', [{ path: 'dir/', opaque: false }]],
    ['mv a.md dir/', [{ path: 'a.md', opaque: false }, { path: 'dir/', opaque: false }]],
    ['rm -f a.md b.md', [{ path: 'a.md', opaque: false }, { path: 'b.md', opaque: false }]],
    ['cp a.md $DIR', [{ path: '$DIR', opaque: true }]],
    ['grep -rn "a > b" src', []],
  ] as const) {
    it(command, () => assert.deepEqual(targets(command), expected));
  }
});

describe('parseCommand keeps each directory change in its own shell scope', () => {
  for (const [command, expected] of [
    ['cd /tmp > .ambicode/task/T/x', [['.ambicode/task/T/x', []]]],
    ['pushd /tmp 2>> log', [['log', []]]],
    ['cd a && tee x', [['x', ['a']]]],
    ['(cd a); tee x', [['x', []]]],
    ['(cd a; tee x) > y; tee z', [['x', [{ maybe: 'a' }]], ['y', []], ['z', []]]],
    ['cd a | cat; tee x', [['x', []]]],
    ['cat | cd a; tee x', [['x', [null]]]],
    ['cd a & tee x', [['x', []]]],
    ['echo "$(tee x)"; cd a', [['x', []]]],
    ['echo "$(cd /tmp)" "$(tee x)"; tee y', [['x', []], ['y', []]]],
    ['x=$(cd /; tee r) tee s', [['r', [{ maybe: '/' }]], ['s', []]]],
    ['{ cd a; tee x; }; tee y', [['x', [{ maybe: 'a' }]], ['y', [{ maybe: 'a' }]]]],
    ['f() { cd a; }; tee x', [['x', [null]]]],
    ['function f { tee x; }; tee y', [['x', []], ['y', []]]],
    ['cd "$D"; tee x', [['x', [null]]]],
    ['cd -; tee x', [['x', [null]]]],
    ['cd; tee x', [['x', [{ maybe: '~' }]]]],
    ['cd -P -- a; tee x', [['x', [{ maybe: 'a' }]]]],
    ['pushd a && popd && tee x', [['x', ['a', null]]]],
    ['pushd -n a; tee x', [['x', []]]],
    ['command cd a; tee x', [['x', [{ maybe: 'a' }]]]],
    ['env cd a; tee x', [['x', []]]],
    ['/usr/bin/cd a; tee x', [['x', []]]],
  ] as const) {
    it(command, () => assert.deepEqual(placed(command), expected));
  }

  it('env and sudo run their command in the directory they are given, in every option form', () => {
    for (const [command, directories] of [
      ['env -C .ambicode/task/T tee notes.md', ['.ambicode/task/T']],
      ['env -C.ambicode/task/T tee notes.md', ['.ambicode/task/T']],
      ['env --chdir=.ambicode/task/T tee notes.md', ['.ambicode/task/T']],
      ['env --chdir .ambicode/task/T A=1 tee notes.md', ['.ambicode/task/T']],
      ['env --ch=.ambicode/task/T tee notes.md', ['.ambicode/task/T']],
      ['env -i -C a -C b tee notes.md', ['b']],
      ['env -C "$D" tee notes.md', [null]],
      ['sudo -D /x tee notes.md', ['/x']],
      ['sudo -D/x tee notes.md', ['/x']],
      ['sudo --chdir=/x -u root tee notes.md', ['/x']],
    ] as const) {
      assert.deepEqual(placed(command), [['notes.md', directories]], command);
    }
  });

  it('a redirect after a prefix is opened by the shell, not in the child directory', () => {
    assert.deepEqual(placed('env -C a tee b > c'), [['c', []], ['b', ['a']]]);
  });

  it('nesting deeper than the parser follows is not analysed', () => {
    assert.ok(unanalysed(`${'( '.repeat(100)}tee x${' )'.repeat(100)}`));
    assert.ok(unanalysed(`echo ${'$('.repeat(100)}tee x${')'.repeat(100)}`));
    assert.ok(!unanalysed(`${'( '.repeat(20)}tee x${' )'.repeat(20)}`));
  });
});

describe('parseCommand separates options, values and operands', () => {
  for (const [command, expected] of [
    ['cp a.md -t.ambicode/task/T', ['.ambicode/task/T']],
    ['cp -rt.ambicode/task/T a.md', ['.ambicode/task/T']],
    ['cp a.md --target-directory .ambicode/task/T', ['.ambicode/task/T']],
    ['cp a.md --target=.ambicode/task/T', ['.ambicode/task/T']],
    ['mv a.md -t.ambicode/task/T', ['.ambicode/task/T', 'a.md']],
    ['cp -- --target-directory=.ambicode/task/T outside-copy', ['outside-copy']],
    ['cp -- -t x y', ['y']],
    ['cp -S .bak a b', ['b']],
    ['cp a', []],
    ['rm -- -r x', ['-r', 'x']],
    ['tee --output-error=warn -a x', ['x']],
    ['tee -- -a', ['-a']],
  ] as const) {
    it(command, () => assert.deepEqual(targets(command).map((target) => target.path), expected));
  }

  it('an opaque target directory is a target only the shell can place', () => {
    assert.deepEqual(targets('cp a -t"$D"'), [{ path: '$D', opaque: true }]);
    assert.deepEqual(targets('cp a --target-directory=$D'), [{ path: '$D', opaque: true }]);
  });

  for (const [command, gnu, bsd] of [
    ["sed -i 's/a/b/' f", ['f'], []],
    ["sed -i '' 's/a/b/' f", ['s/a/b/', 'f'], ['f']],
    ["sed -i .bak 's#x#/r/.ambicode/task/T/#' out", ["s#x#/r/.ambicode/task/T/#", 'out'], ['out']],
    ["sed -i.bak 's/a/b/' f", ['f'], ['f']],
    ["sed -i -e 's/a/b/' f", ['f'], ['f']],
    ["sed -n -i 's/a/b/' f g", ['f', 'g'], ['g']],
    ["sed 's/a/b/' -i f", ['f'], []],
    ["sed -I .bak 's/a/b/' f", [], ['f']],
    ["sed --in-place=.bak --expression='s/a/b/' f", ['f'], []],
    ["sed -n 's/a/b/p' f", [], []],
    ["gsed -i .bak 's/a/b/' f", ['s/a/b/', 'f'], ['s/a/b/', 'f']],
  ] as const) {
    it(`sed in place, GNU and BSD: ${command}`, () => {
      assert.deepEqual(targets(command).map((target) => target.path), gnu, 'GNU');
      assert.deepEqual(targets(command, { bsdSed: true }).map((target) => target.path), bsd, 'BSD');
    });
  }
});

describe('parseCommand follows both outcomes of a directory change', () => {
  const maybe = (directory: string) => ({ maybe: directory });
  for (const [command, expected] of [
    ['cd /a && echo > f; echo > g', [['f', ['/a']], ['g', [maybe('/a')]]]],
    ['true && cd /a && echo > f; echo > g', [['f', ['/a']], ['g', [maybe('/a')]]]],
    ['cd /a || echo > f; echo > g', [['f', []], ['g', [maybe('/a')]]]],
    ['! cd /a && echo > f', [['f', []]]],
    ['! cd /a || echo > f', [['f', ['/a']]]],
    ['pushd /a; echo > f', [['f', [maybe('/a')]]]],
    ['pushd /a || echo > f', [['f', []]]],
    ['cd /a && true; echo > f', [['f', [maybe('/a')]]]],
    ['cd /a || exit 1; echo > f', [['f', ['/a']]]],
    ['cd /a || return; echo > f', [['f', ['/a']]]],
    ['cd /a || { echo no; exit 1; }; echo > f', [['f', ['/a']]]],
    ['cd /a || true; echo > f', [['f', [maybe('/a')]]]],
    ['cd /a; cd b; echo > f', [['f', [maybe('/a'), maybe('b')]]]],
    ['if c; then cd /a; echo > f; else echo > g; fi; echo > h', [['f', [maybe('/a')]], ['g', [maybe('/a')]], ['h', [maybe('/a')]]]],
    ['while c; do cd /a; done > f; echo > g', [['f', []], ['g', [null, maybe('/a')]]]],
    ['case x in a) cd /a;; b) echo > f;; esac', [['f', [maybe('/a')]]]],
    ['if c; then echo; fi; cd /a; echo > f', [['f', [maybe('/a')]]]],
    ['(case x in a) cd /a;; esac; echo > f); echo > g', [['f', [maybe('/a')]], ['g', []]]],
  ] as const) {
    it(command, () => assert.deepEqual(placed(command), expected));
  }
});

describe('parseCommand opens a compound command\'s redirections where it starts', () => {
  const maybe = (directory: string) => ({ maybe: directory });
  for (const [command, expected] of [
    ['{ cd a; } > f; tee g', [['f', []], ['g', [maybe('a')]]]],
    ['{ cd a && tee x; } > f', [['x', ['a']], ['f', []]]],
    ['cd a && { tee x; } > f', [['x', ['a']], ['f', ['a']]]],
    ['{ cd a; } 2> f 3>> g', [['f', []], ['g', []]]],
    ['{ cd a; } > "$X"; tee g', [['$X', []], ['g', [maybe('a')]]]],
    ['(cd a) > f', [['f', []]]],
    ['if c; then cd a; fi > f', [['f', []]]],
    ['case x in a) cd a;; esac > f', [['f', []]]],
    ['for i in 1; do cd a; done > f', [['f', []]]],
    ['until c; do cd a; done >> f; tee g', [['f', []], ['g', [null, maybe('a')]]]],
    ['{ cd a; } > "$(tee s)"', [['s', []], ['$(tee s)', []]]],
  ] as const) {
    it(command, () => assert.deepEqual(placed(command), expected));
  }
  it('an opaque operand stays opaque', () => {
    assert.deepEqual(targets('{ cd a; } > "$X"'), [{ path: '$X', opaque: true }]);
  });
});

describe('parseCommand does not run a loop that moves the shell at most once', () => {
  const maybe = (directory: string) => ({ maybe: directory });
  for (const [command, expected] of [
    ['for i in 1 2 3; do cd .. || exit; done; echo > f', [['f', [null, maybe('..')]]]],
    ['while c; do cd ..; done; echo > f', [['f', [null, maybe('..')]]]],
    ['until c; do cd ..; done; echo > f', [['f', [null, maybe('..')]]]],
    ['select i in a; do cd ..; done; echo > f', [['f', [null, maybe('..')]]]],
    ['for i in 1; do echo > f; cd ..; done', [['f', [null]]]],
    ['for i in 1; do cd ..; echo > f; done', [['f', [null, maybe('..')]]]],
    ['for i in 1; do cd .. && echo > f; done', [['f', [null, '..']]]],
    ['while cd ..; do echo > f; done', [['f', [null, maybe('..')]]]],
    ['for i in 1; do cd /abs; done; echo > f', [['f', [null, maybe('/abs')]]]],
    ['for d in a b; do cd "$d"; done; echo > f', [['f', [null, null]]]],
    ['for i in 1; do cd ..; continue; done; echo > f', [['f', [null, maybe('..')]]]],
    ['for i in 1; do cd ..; break; done; echo > f', [['f', [null, maybe('..')]]]],
    ['for i in 1; do pushd ..; done; echo > f', [['f', [null, maybe('..')]]]],
    ['for i in 1; do if c; then cd ..; fi; done; echo > f', [['f', [null, maybe('..')]]]],
    ['for i in 1; do cd /a && echo > f; done', [['f', [null, '/a']]]],
    ['for a in 1; do for b in 1; do cd ..; done; done; echo > f', [['f', [null, null, maybe('..')]]]],
    ['for i in 1; do cd ..; done > f; echo > g', [['f', []], ['g', [null, maybe('..')]]]],
  ] as const) {
    it(command, () => assert.deepEqual(placed(command), expected));
  }
  for (const command of [
    'for i in 1 2 3; do (cd ..); done; echo > f',
    'for i in 1 2 3; do echo "$(cd ..)"; done; echo > f',
    'for i in 1 2 3; do cd .. | cat; done; echo > f',
    'while c; do cd .. & done; echo > f',
    'for i in 1; do echo > f; done; echo > g',
    'for i in 1; do if c; then echo > f; fi; done',
  ]) {
    it(`keeps the directory certain when the shell never moves: ${command}`, () => {
      assert.ok(placed(command).every(([, directories]) => (directories as Directories).every((move) => move !== null)), command);
    });
  }
  it('the loop does not leave the shell where one pass left it', () => {
    const after = placed('for i in 1 2; do cd a; done; echo > f').at(-1)![1] as Directories;
    assert.equal(after.includes(null), true);
  });
  it('a write in the body is placed after the unknown directory, an absolute move still resets it', () => {
    assert.deepEqual(placed('for i in 1 2; do echo > a; cd /abs && echo > b; done'), [['a', [null]], ['b', [null, '/abs']]]);
  });
});

describe('parseCommand reads env -C last-option-wins within one invocation', () => {
  for (const [command, directories] of [
    ['env -C .ambicode -C task/T tee n', ['task/T']],
    ['env -C a -Cb tee n', ['b']],
    ['env --chdir=a --chdir b tee n', ['b']],
    ['env -C a --chdir=b tee n', ['b']],
    ['env -C a -C "$X" tee n', [null]],
    ['env -C "$X" -C b tee n', ['b']],
    ['env -C a env -C b tee n', ['a', 'b']],
    ['env -C a -- tee n', ['a']],
    ['sudo -D /x -D /y tee n', ['/y']],
    ['sudo -D /x env -C y tee n', ['/x', 'y']],
  ] as const) {
    it(command, () => assert.deepEqual(placed(command), [['n', directories]]));
  }
});

const commands = (command: string) => analysed(command).map((segment) => segment.argv.join(' '));
const names = (command: string) => analysed(command).map((segment) => segment.argv[0]);

describe('parseCommand reads quote context inside parameter expansions', () => {
  it('a single quote in a double-quoted ${…} is ordinary text, so the substitution runs', () => {
    assert.ok(commands('git status; echo "${X:-\'$(git push)\'}"').includes('git push'));
    assert.ok(commands('git status; echo "${X:-\'`git push`\'}"').includes('git push'));
    assert.ok(commands('echo "${X:-"\'$(git push)\'"}"').includes('git push'));
  });
  it('outside double quotes the single quotes keep the substitution from running', () => {
    assert.deepEqual(names('git status; echo ${X:-\'$(git push)\'}'), ['git', 'echo']);
    assert.deepEqual(names("echo '$(git push)'"), ['echo']);
  });
  it('a substitution in the default of a double-quoted expansion still runs when unquoted inside', () => {
    assert.ok(commands('echo "${X:-$(git push)}"').includes('git push'));
    assert.ok(commands('echo ${X:-$(git push)}').includes('git push'));
  });
});

describe('parseCommand reads the expansion operator, not only the double quotes, for single quotes', () => {
  const pushes = (command: string) => commands(command).includes('git push');
  for (const operator of ['#', '##', '%', '%%', '/', '//', '/#', '/%']) {
    it(`a quoted pattern after ${operator} runs nothing, in double quotes or not`, () => {
      for (const inner of ["'$(git push)'", "'`git push`'", "a'$(git push)'b", "*'$(git push)'"]) {
        assert.equal(pushes(`echo "\${X${operator}${inner}}"`), false, inner);
        assert.equal(pushes(`echo \${X${operator}${inner}}`), false, inner);
      }
    });
  }
  for (const operator of ['/', '//', '/#']) {
    it(`the replacement after ${operator} is not a pattern: its single quotes are text`, () => {
      assert.equal(pushes(`echo "\${X${operator}a/'$(git push)'}"`), true);
      assert.equal(pushes(`echo "\${X${operator}'a'/'$(git push)'}"`), true);
      assert.equal(pushes(`echo \${X${operator}a/'$(git push)'}`), false);
    });
  }
  it('defaults and alternatives in double quotes still run a quoted-looking substitution', () => {
    for (const operator of [':-', '-', ':+', '+', ':=', '=', ':?', '?']) assert.equal(pushes(`echo "\${X${operator}'$(git push)'}"`), true, operator);
    assert.equal(pushes('echo "${X:1:2}$(git push)"'), true);
  });
  it('an unquoted substitution, a double-quoted one and an escaped quote in a pattern run', () => {
    assert.equal(pushes('echo "${X#$(git push)}"'), true);
    assert.equal(pushes('echo "${X#"$(git push)"}"'), true);
    assert.equal(pushes("echo \"${X#\\'$(git push)}\""), true);
    assert.equal(pushes('echo "${X#\'a\'$(git push)}"'), true);
    assert.equal(pushes('echo ${X#$(git push)}'), true);
  });
  it('a nested expansion inside a pattern is quoted by the pattern\'s single quotes', () => {
    assert.equal(pushes("echo \"${X#${U:-'$(git push)'}}\""), false);
    assert.equal(pushes("echo \"${X#'a'${U:-$(git push)}}\""), true);
    assert.equal(pushes("echo \"${X:-${Y#'$(git push)'}}\""), false);
    assert.equal(pushes("echo \"${X:-${Y:-'$(git push)'}}\""), true);
  });
  it('the end of the expansion and what follows it are still read', () => {
    assert.equal(pushes("echo \"${X#'}'}$(git push)\""), true);
    assert.equal(pushes("echo \"${X#'$(git push)'}\"; git push"), true);
    assert.equal(pushes('echo "${A[1]#\'$(git push)\'}"'), false);
    assert.equal(pushes('echo "${#X}$(git push)"'), true);
  });
  it('writes in a quoted pattern are not targets', () => {
    assert.deepEqual(targets('echo "${X#\'$(tee .ambicode/task/T/phantom)\'}"'), []);
    assert.deepEqual(targets('echo "${X#\'`tee .ambicode/task/T/phantom`\'}"'), []);
  });
  it('never throws on unterminated or deeply nested patterns', () => {
    for (const command of ["echo \"${X#'", 'echo "${X#', 'echo "${X/', "echo \"${X/a/'", 'echo "${X#' + '${Y#'.repeat(4000) + 'x' + '}'.repeat(4001) + '"']) {
      assert.ok(Array.isArray(parseCommand(command)), command.slice(0, 30));
    }
    const deep = 'git push; echo "${X#' + "'${Y#".repeat(2000) + 'x' + '}'.repeat(2000);
    assert.ok(unanalysed(deep) || commands(deep).includes('git push'));
  });
});

describe('parseCommand does not end a substitution at a case pattern\'s parenthesis', () => {
  const pushes = (command: string) => commands(command).includes('git push');
  for (const [label, command] of [
    ['$( )', 'git status; echo "$(case x in x) git push;; esac)"'],
    ['<( )', 'git status; cat <(case x in x) git push;; esac)'],
    ['an optional leading parenthesis', 'echo "$(case x in (x) git push;; esac)"'],
    ['several arms', 'echo "$(case x in a) :;; b|c) :;; x) git push;; esac)"'],
    ['a command after esac', 'echo "$(case x in x) :;; esac; git push)"'],
    ['a command before the case', 'echo "$(git push; case x in x) :;; esac)"'],
    ['the last arm without ;;', 'echo "$(case x in x) git push\nesac)"'],
    ['a newline after in', 'echo "$(case x in\nx) git push;;\nesac)"'],
    ['nested cases', 'echo "$(case x in x) case y in y) git push;; esac;; esac)"'],
    ['nested cases, command after the inner', 'echo "$(case x in x) case y in y) :;; esac; git push;; esac)"'],
    ['a case in a substitution in an arm', 'echo "$(case x in x) echo $(case y in y) git push;; esac);; esac)"'],
    ['an extglob group in the pattern', 'echo "$(case x in @(a|b)) :;; x) git push;; esac)"'],
    ['a quoted parenthesis in the pattern', "echo \"$(case ')' in ')') git push;; esac)\""],
    ['an escaped parenthesis in the pattern', 'echo "$(case x in x\\)) git push;; esac)"'],
    ['a double-quoted pattern', 'echo "$(case x in "x)") git push;; esac)"'],
    ['a subshell in an arm', 'echo "$(case x in x) (git push);; esac)"'],
    ['a fall-through arm', 'echo "$(case x in x) :;& y) git push;; esac)"'],
    ['the subject a substitution', 'echo "$(case $(echo x) in x) git push;; esac)"'],
    ['a case after then', 'echo "$(if c; then case x in x) git push;; esac; fi)"'],
    ['esac as the pattern of an empty case', 'echo "$(case x in esac; git push)"'],
    ['an unterminated case', 'echo "$(case x in x) git push"'],
    ['a case in backticks inside', 'echo "$(echo `case x in x) git push;; esac`)"'],
  ] as const) {
    it(`runs the commands of a case in ${label}`, () => assert.equal(pushes(command), true, command));
  }
  it('a write in an arm is a target', () => {
    assert.deepEqual(targets('echo "$(case x in x) echo x > .ambicode/task/T/phantom;; esac)"'), [{ path: '.ambicode/task/T/phantom', opaque: false }]);
  });
  it('the closing parenthesis after esac ends the substitution', () => {
    assert.deepEqual(names('echo "$(case x in x) :;; esac)"; git push').slice(-2), ['echo', 'git']);
    assert.equal(commands('echo "$(case x in x) :;; esac) git push"').includes('git push'), false);
  });
  it('a word case outside command position opens nothing', () => {
    assert.equal(commands('echo "$(echo case) git push"').includes('git push'), false);
    assert.equal(commands('echo "$(echo case x in x) git push"').includes('git push'), false);
  });
  it('a heredoc in an arm keeps its body unread and the real command after it', () => {
    const command = 'git status; echo "$(case x in x) cat <<\'EOF\'\n)\n$(tee .ambicode/task/T/phantom)\nEOF\n;; esac; git push)"';
    assert.equal(pushes(command), true);
    assert.deepEqual(targets(command), []);
    assert.deepEqual(targets('echo "$(case x in x) cat <<-\'EOF\'\n\t)\n\t$(tee x)\n\tEOF\n;; esac)"'), []);
    assert.deepEqual(targets('echo "$(case x in x) cat <<A <<\'B\'\n)\n$(tee a)\nA\n)\n$(tee b)\nB\n;; esac)"'), []);
  });
  it('the paired-pattern form and an ordinary case still parse', () => {
    assert.ok(commands('case x in (x) git push;; esac').includes('git push'));
    assert.ok(commands('case x in x) git push;; esac').includes('git push'));
  });
  it('malformed and deeply nested input is bounded and never throws', () => {
    for (const command of ['echo "$(case', 'echo "$(case x in', 'echo "$(case x in x', 'echo "$(case x in (', 'echo "$(case x in x)', 'echo "$(case x in x) ;; ;; esac esac)"']) {
      assert.ok(Array.isArray(parseCommand(command)), command);
    }
    const deep = 'git push; echo ' + '$(case x in x) '.repeat(4000) + 'x' + ';; esac)'.repeat(4000);
    assert.ok(commands(deep).includes('git push'));
    assert.ok(unanalysed(deep));
    const arms = 'git push; echo "$(case x in ' + 'a) :;; '.repeat(20000) + 'x) :;; esac)"';
    assert.ok(commands(arms).includes('git push'));
  });
});

describe('parseCommand finds the end of a substitution without reading heredoc bodies', () => {
  // zsh and bash 4+ read a heredoc inside $( ) to its delimiter; macOS /bin/bash 3.2 does not (its output differs).
  const heredoc = (body: string, delimiter = "<<'EOF'", end = 'EOF') => `git status; echo "$(cat ${delimiter}\n${body}\n${end}\n)"`;
  it('a parenthesis, an expansion and quotes in the body do not end it or run', () => {
    assert.deepEqual(names(heredoc(')\n$(tee .ambicode/task/T/phantom)')), ['git', 'cat', 'echo']);
    assert.deepEqual(targets(heredoc(')\n$(tee .ambicode/task/T/phantom)')), []);
    assert.deepEqual(names(heredoc('" ) \' ` $(git push)')), ['git', 'cat', 'echo']);
  });
  it('several heredocs in one substitution are each skipped', () => {
    const command = 'echo "$(cat <<A <<\'B\'\n)\n$(git push)\nA\n)\n$(git reset)\nB\n)"';
    assert.deepEqual(names(command), ['cat', 'echo']);
  });
  it('a tab-stripped delimiter ends a <<- body that is indented', () => {
    const command = 'echo "$(cat <<-EOF\n\t)\n\t$(git push)\n\tEOF\n)"; git status';
    assert.deepEqual(names(command), ['cat', 'echo', 'git']);
  });
  it('a heredoc inside <( ) is skipped the same way', () => {
    assert.deepEqual(names('diff <(cat <<EOF\n)\n$(git push)\nEOF\n) b'), ['cat', 'diff']);
  });
  it('the command after the closing parenthesis is still read', () => {
    assert.ok(commands('echo "$(cat <<EOF\n)\nEOF\n)"; git push').includes('git push'));
  });
});

describe('parseCommand bounds lexical nesting without losing what it already read', () => {
  const deep = 'git push; echo ' + '${X:-'.repeat(4000) + 'x' + '}'.repeat(4000);
  it('does not throw, keeps the git write and reports the rest as not analysed', () => {
    const segments = parseCommand(deep);
    assert.ok(segments.some((segment) => segment.argv.join(' ') === 'git push'));
    assert.ok(unanalysed(deep));
  });
  for (const [label, command] of [
    ['substitutions', 'git push; echo ' + '$('.repeat(4000) + 'x' + ')'.repeat(4000)],
    ['arithmetic', 'git push; echo ' + '$(('.repeat(3000) + 'x' + '))'.repeat(3000)],
    ['double quotes in expansions', 'git push; echo ' + '"${X:-'.repeat(3000) + 'x' + '}"'.repeat(3000)],
    ['backticks in expansions', 'git push; echo ' + '${X:-`'.repeat(3000) + 'x' + '`}'.repeat(3000)],
    ['process substitutions', 'git push; cat ' + '<(cat '.repeat(3000) + 'x' + ')'.repeat(3000)],
  ] as const) {
    it(`never throws on deeply nested ${label}`, () => {
      const segments = parseCommand(command);
      assert.ok(segments.some((segment) => segment.argv.join(' ') === 'git push'));
      assert.ok(unanalysed(command));
    });
  }
  it('moderate nesting is still analysed whole', () => {
    assert.ok(commands('echo ${A:-${B:-${C:-$(git push)}}}').includes('git push'));
    assert.ok(!unanalysed('echo ${A:-${B:-${C:-$(git push)}}}'));
  });
});

describe('parseCommand reports what it did not analyse instead of guessing', () => {
  for (const command of [
    'echo "${X/a\\/b}"',
    'echo "${X/$(echo a/b)/c}"',
    "echo ${X:${U:-'$(git push)'}}",
    "echo ${A['x']}",
    'echo x >! p',
    'echo x >>| p',
    'echo }; git push',
    'echo "$(case x in x) ls;; esac)"',
    "x=$(cat <<'EOF'\n1) item\nEOF\n)",
    'source /dev/stdin',
    'echo ls | sh',
    'sh -s',
    'bash -ic ls',
    'eval "$X"',
  ]) {
    it(command, () => assert.ok(unanalysed(command)));
  }

  for (const command of ['echo "${X:$((1))}"', 'sh --version', 'source x.sh', 'echo "${X#\'$(git push)\'}"', '{ echo; } always { git push; }']) {
    it(`${command} is analysed`, () => assert.ok(!unanalysed(command)));
  }

  it('a parameter name or subscript of any length is read whole', () => {
    for (const length of [63, 64, 65, 159, 160, 161, 10_000]) {
      const name = 'V'.repeat(length);
      assert.deepEqual(commands(`echo "\${${name}#$(git push)}"`), ['git push', `echo \${${name}#$(git push)}`]);
      assert.ok(!unanalysed(`echo "\${${name}#'$(git push)'}"`));
      assert.ok(commands(`echo "\${A[$(git push)${' '.repeat(length)}]}"`).includes('git push'));
    }
  });
});

describe('parseCommand reads the code a command hands to the shell', () => {
  for (const [command, runs] of [
    ['trap "git push" EXIT', 'git push'],
    ["alias g='git push'", 'git push'],
    ["eval 'git push'", 'git push'],
    ["sh -c 'git push'", 'git push'],
    ["bash -e -o pipefail -c 'git push'", 'git push'],
    ['find . -exec git push \\;', 'git push'],
    ['/usr/bin/env git push', 'git push'],
    ['/usr/bin/nice -n 5 git push', 'git push'],
    ['coproc git push', 'git push'],
    ['repeat 2 git push', 'git push'],
    ['noglob git push', 'git push'],
  ] as const) {
    it(command, () => assert.ok(commands(command).includes(runs)));
  }

  it('a path to a prefix never runs the command in this shell', () => {
    assert.deepEqual(placed('/usr/bin/command cd x; echo > p'), [['p', []]]);
    assert.deepEqual(placed('command cd x; echo > p'), [['p', [{ maybe: 'x' }]]]);
  });

  it('xargs adds words only it reads, or puts them where its replace string stands', () => {
    assert.deepEqual(targets('echo x | xargs touch'), [{ path: '', opaque: true }]);
    assert.deepEqual(targets('echo x | xargs -I{} touch {}'), [{ path: '{}', opaque: true }]);
    assert.deepEqual(targets('echo x | xargs -I % mv % .ambicode/task/T/'), [{ path: '%', opaque: true }, { path: '.ambicode/task/T/', opaque: false }]);
    assert.deepEqual(targets('echo x | xargs -IX touch a'), [{ path: 'a', opaque: false }]);
  });

  it('find runs -exec where it is and -execdir where each match is', () => {
    assert.deepEqual(placed('find . -execdir touch p \\;'), [['p', [null]]]);
    assert.deepEqual(targets('find . -exec touch {} +'), [{ path: '{}', opaque: true }]);
  });
});

describe('parseCommand reads the file writers beyond rule 4', () => {
  for (const [command, written] of [
    ['touch -r ref -t 2001 a b', ['a', 'b']],
    ['mkdir -m 755 -p a', ['a']],
    ['rmdir a', ['a']],
    ['unlink a', ['a']],
    ['truncate -s 0 a', ['a']],
    ['shred -n 1 a', ['a']],
    ['dd if=x of=a', ['a']],
    ['ln -s x y', ['y']],
    ['ln -s /etc/hosts', ['hosts']],
    ['ln -t d x y', ['d']],
    ['install -m 644 x y', ['y']],
    ['install -d a b', ['a', 'b']],
  ] as const) {
    it(command, () => assert.deepEqual(targets(command).map((target) => target.path), written));
  }
});

describe('parseCommand leaves to the shell what the command changes about paths', () => {
  it('CDPATH, set or named, makes a bare cd name unknown', () => {
    assert.deepEqual(placed('CDPATH=a cd T; echo > p'), [['p', [null]]]);
    assert.deepEqual(placed('cd T; echo > p', ), [['p', [{ maybe: 'T' }]]]);
    assert.deepEqual(analysed('cd T; echo > p', { cdpath: true }).flatMap((segment) => segment.writeTargets.map((target) => target.directories)), [[null]]);
    assert.deepEqual(analysed('cd ./T; echo > p', { cdpath: true }).flatMap((segment) => segment.writeTargets.map((target) => target.directories)), [[{ maybe: './T' }]]);
  });

  it('~ is known only while HOME is not named; ~name, ~+ and ~- never are', () => {
    assert.deepEqual(targets('echo > ~/p'), [{ path: '~/p', opaque: false }]);
    assert.deepEqual(targets('HOME=x; echo > ~/p'), [{ path: '~/p', opaque: true }]);
    assert.deepEqual(targets('echo > ~t/p'), [{ path: '~t/p', opaque: true }]);
    assert.deepEqual(placed('cd ~+; echo > p'), [['p', [null]]]);
    assert.deepEqual(placed('HOME=x cd; echo > p'), [['p', [null]]]);
    assert.deepEqual(placed('cd; echo > p'), [['p', [{ maybe: '~' }]]]);
  });

  it('a glob or brace target is a pattern, and a glob cd is unknown', () => {
    assert.deepEqual(analysed('tee a.{x,y}').flatMap((segment) => segment.writeTargets.map((target) => target.pattern)), [true]);
    assert.deepEqual(analysed('echo > a*').flatMap((segment) => segment.writeTargets.map((target) => target.pattern)), [true]);
    assert.deepEqual(placed('cd a*; echo > p'), [['p', [null]]]);
  });

  it('a command that changes the shell options leaves the rest not analysed', () => {
    for (const command of ['setopt autocd; ls', 'set -o vi; ls', 'set -k; ls', 'shopt -s extglob; ls', 'emulate sh; ls', 'disable -r if; ls', 'bash -O extglob -c ls']) {
      assert.ok(unanalysed(command), command);
    }
    for (const command of ['set -euo pipefail; ls', 'set -e\nls', 'set -x; ls', 'set +e; ls', 'set -- a b; ls', 'shopt extglob', 'bash -o pipefail -c ls']) {
      assert.ok(!unanalysed(command), command);
    }
  });

  it('a command named like an Object property is an ordinary command', () => {
    for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      assert.deepEqual(targets(`${name} x > p`), [{ path: 'p', opaque: false }]);
      assert.ok(!unanalysed(`${name} x > p`), name);
    }
  });
});

describe('the parser module', () => {
  it('has no imports, so the guard bundle stays standalone', () => {
    const source = readFileSync(new URL('./command-parser.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^\s*import\s/m);
  });
});
