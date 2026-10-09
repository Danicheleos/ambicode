import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { basename, parseCommand } from './command-parser.ts';

const argvs = (command: string) => parseCommand(command).map((segment) => segment.argv);
const targets = (command: string) => parseCommand(command).flatMap((segment) => segment.writeTargets.map(({ path, opaque }) => [path, opaque]));

describe('parseCommand splits segments', () => {
  it('on &&, ||, ;, |, & and newline outside quotes', () => {
    assert.deepEqual(argvs('a 1 && b 2 || c; d | e & f\ng'), [['a', '1'], ['b', '2'], ['c'], ['d'], ['e'], ['f'], ['g']]);
    assert.deepEqual(argvs(`echo "a && b; c | d" 'e || f'`), [['echo', 'a && b; c | d', 'e || f']]);
  });

  it('removes quotes and escapes, keeps raw text, drops comments and continued lines', () => {
    const [first, second] = parseCommand(`printf "x\\"y" a\\ b && echo 'it''s'`);
    assert.deepEqual(first!.argv, ['printf', 'x"y', 'a b']);
    assert.equal(first!.raw, 'printf "x\\"y" a\\ b');
    assert.deepEqual(second!.argv, ['echo', 'its']);
    assert.deepEqual(argvs('git status # git push\nls'), [['git', 'status'], ['ls']]);
    assert.deepEqual(argvs('git \\\n  push'), [['git', 'push']]);
  });

  it('never reads a heredoc body as commands, and resumes after its delimiter line', () => {
    const body = 'const f = () => 1; // .ambicode/task/\ngit push && rm -rf /';
    assert.deepEqual(argvs(`cat <<'EOF'\n${body}\nEOF\nls`), [['cat'], ['ls']]);
    assert.deepEqual(argvs(`cat <<-EOF\n\t${body}\n\tEOF\nls`), [['cat'], ['ls']]);
    assert.deepEqual(argvs(`cat <<"EOF" && git status\n${body}\nEOF`), [['cat'], ['git', 'status']]);
    assert.deepEqual(argvs(`cat <<EOF\n${body}\nEOF2\nEOF\nls`), [['cat'], ['ls']]);
  });

  it('keeps a here-string and an input redirect out of argv', () => {
    assert.deepEqual(argvs('grep x <<< "a b" < file'), [['grep', 'x']]);
  });
});

describe('parseCommand marks words only the shell resolves', () => {
  it('flags $VAR, ${…}, $(…), backticks and <(…), in or out of double quotes, keeping the text', () => {
    const [segment] = parseCommand('echo $A "${B:-x}" "$(id -u)" `id` <(ls) \'$C\' plain');
    assert.deepEqual(segment!.argv, ['echo', '$A', '${B:-x}', '$(id -u)', '`id`', '<(ls)', '$C', 'plain']);
    assert.deepEqual(segment!.opaque, [false, true, true, true, true, true, false, false]);
  });

  it('reads a space inside $(…) as part of the word', () => {
    assert.deepEqual(argvs('echo $(a b && c) d'), [['echo', '$(a b && c)', 'd']]);
  });
});

describe('parseCommand finds the command behind prefixes', () => {
  it('skips env, sudo, command, exec, npx, assignments and shell keywords', () => {
    assert.deepEqual(argvs('env A=1 -i git push'), [['git', 'push']]);
    assert.deepEqual(argvs('sudo -n rm x'), [['rm', 'x']]);
    assert.deepEqual(argvs('A=1 B=2 git push'), [['git', 'push']]);
    assert.deepEqual(argvs('if git commit -m x; then echo ok; fi'), [['git', 'commit', '-m', 'x'], ['echo', 'ok'], ['fi']]);
    assert.deepEqual(argvs('time exec git push'), [['git', 'push']]);
  });

  it('starts a node call at the plugin script and keeps any other node call as node', () => {
    assert.deepEqual(argvs('node "/p q/scripts/ambicode.mjs" note save --task T'), [['/p q/scripts/ambicode.mjs', 'note', 'save', '--task', 'T']]);
    assert.deepEqual(argvs('npx node /p/ambicode.mjs note save'), [['/p/ambicode.mjs', 'note', 'save']]);
    assert.deepEqual(argvs('node foo.js x'), [['node', 'foo.js', 'x']]);
    assert.equal(basename('/p/scripts/ambicode.mjs'), 'ambicode.mjs');
    assert.equal(basename('C:\\p\\git'), 'git');
  });
});

describe('parseCommand reports write targets', () => {
  it('redirections: after >, >>, &>, attached or spaced; fd copies and inputs are not targets', () => {
    assert.deepEqual(targets('echo x > a'), [['a', false]]);
    assert.deepEqual(targets('echo x >>a'), [['a', false]]);
    assert.deepEqual(targets('echo x &> a'), [['a', false]]);
    assert.deepEqual(targets('echo x 2>err'), [['err', false]]);
    assert.deepEqual(targets('echo x 2>&1 < in'), []);
    assert.deepEqual(targets('echo "a > b"'), []);
  });

  it('tee, sed -i, cp last operand, and every operand of mv, of rm, rmdir, mkdir, touch, truncate', () => {
    assert.deepEqual(targets('echo hi | tee -a a b'), [['a', false], ['b', false]]);
    assert.deepEqual(targets("sed -i 's/a/b/' f g"), [['f', false], ['g', false]]);
    assert.deepEqual(targets("sed --in-place=.bak -e 's/a/b/' f"), [['f', false]]);
    assert.deepEqual(targets("sed -n 's/a/b/p' f"), []);
    assert.deepEqual(targets('cp -r a b c'), [['c', false]]);
    assert.deepEqual(targets('cp -r a b c'), [['c', false]]);
    assert.deepEqual(targets('mv -- a -b'), [['a', false], ['-b', false]]);
    for (const name of ['rm', 'rmdir', 'mkdir', 'touch', 'truncate']) assert.deepEqual(targets(`${name} -f a b`), [['a', false], ['b', false]], name);
    assert.deepEqual(targets('cat a b'), []);
  });

  it('reports an opaque target as opaque', () => {
    assert.deepEqual(targets('echo x > "$OUT"'), [['$OUT', true]]);
    assert.deepEqual(targets('cp a $DIR'), [['$DIR', true]]);
  });
});

describe('parseCommand gives up on an unterminated quote', () => {
  it('marks the segment unparsed and keeps the rest of the command as its raw text', () => {
    const segments = parseCommand('git status && echo "oops; git push');
    assert.equal(segments.length, 2);
    assert.equal(segments[0]!.unparsed, undefined);
    assert.equal(segments[1]!.unparsed, true);
    assert.equal(segments[1]!.raw, 'echo "oops; git push');
  });
});
