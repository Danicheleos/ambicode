import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { baseOf, baseScaffoldScript, sideRelFrom, writeBaseScaffold } from './base-scaffold.mjs';

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const put = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

describe('base-scaffold', () => {
  let top;
  let side;
  let base;
  let head;
  const snapshot = () => `${git(path.join(side, '.git'), 'for-each-ref')}\n${git(path.join(side, '.git'), 'rev-parse', 'HEAD')}`;
  const run = (script, cwd) => {
    mkdirSync(cwd, { recursive: true });
    return spawnSync('sh', [script], { cwd, encoding: 'utf8' });
  };
  const caseWith = (name, options, rel = '../../side') => {
    const directory = path.join(top, 'cases', name);
    mkdirSync(directory, { recursive: true });
    writeBaseScaffold(directory, { sideRel: rel, base, root: 'src', ...options });
    return path.join(directory, 'scaffold.sh');
  };

  before(() => {
    top = mkdtempSync(path.join(tmpdir(), 'base-scaffold-'));
    side = path.join(top, 'side');
    const cache = path.join(top, 'work');
    mkdirSync(cache, { recursive: true });
    git(cache, 'init', '-q');
    put(path.join(cache, 'src/a.txt'), 'base\n');
    put(path.join(cache, 'src/tests/x.test.ts'), 'test\n');
    put(path.join(cache, 'src/with space/y.txt'), 'y\n');
    put(path.join(cache, 'other/o.txt'), 'outside root\n');
    git(cache, 'add', '-A');
    git(cache, 'commit', '-q', '-m', 'base');
    base = git(cache, 'rev-parse', 'HEAD');
    put(path.join(cache, 'src/a.txt'), 'head\n');
    put(path.join(cache, 'src/head-only.txt'), 'later\n');
    git(cache, 'add', '-A');
    git(cache, 'commit', '-q', '-m', 'head');
    head = git(cache, 'rev-parse', 'HEAD');
    mkdirSync(side, { recursive: true });
    git(top, 'clone', '-q', '--bare', cache, path.join(side, '.git'));
    put(path.join(side, 'project/.ambicode/config.yaml'), 'version: 3\n');
  });
  after(() => rmSync(top, { recursive: true, force: true }));

  it('05-S1: baseOf returns base and root, and names the field it rejects', () => {
    const version = (body) => {
      const directory = mkdtempSync(path.join(top, 'v-'));
      if (body !== null) writeFileSync(path.join(directory, 'version.json'), JSON.stringify(body));
      return directory;
    };
    assert.deepEqual(baseOf(version({ base, head, root: 'src', touched: [] })), { base, root: 'src' });
    assert.throws(() => baseOf(version(null)), /version\.json/);
    assert.throws(() => baseOf(version({ base: 'abc123', root: 'src' })), /"base"/);
    assert.throws(() => baseOf(version({ base: 'A'.repeat(40), root: 'src' })), /"base"/);
    assert.throws(() => baseOf(version({ base, root: '' })), /"root"/);
    assert.throws(() => baseOf(version({ base })), /"root"/);
  });

  it('05-S2: checks out the base tree and not the head, with the team config, as one commit', () => {
    const before = snapshot();
    const work = path.join(top, 'work-1');
    const result = run(caseWith('c1', {}), work);
    assert.equal(result.status, 0, result.stderr);
    const repo = path.join(work, 'repo');
    assert.equal(readFileSync(path.join(repo, 'src/a.txt'), 'utf8'), 'base\n');
    assert.ok(!existsSync(path.join(repo, 'src/head-only.txt')));
    assert.ok(!existsSync(path.join(repo, 'other')), 'only the root is extracted');
    assert.equal(readFileSync(path.join(repo, '.ambicode/config.yaml'), 'utf8'), 'version: 3\n');
    assert.equal(git(repo, 'rev-list', '--all', '--count'), '1');
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.notEqual(git(repo, 'rev-parse', 'HEAD'), head);
    assert.equal(snapshot(), before, 'the cache refs and HEAD are unchanged');
    assert.deepEqual(readdirSync(work), ['repo']);
  });

  it('05-S2: a missing cache and a missing commit exit 2 with their messages', () => {
    mkdirSync(path.join(top, 'lonely'), { recursive: true });
    const noCache = run(caseWith('c-nocache', {}, '../../lonely'), path.join(top, 'work-2'));
    assert.equal(noCache.status, 2);
    assert.match(noCache.stderr, /scaffold: no .*lonely\/\.git: the benchmark project clone is missing/);
    const noCommit = run(caseWith('c-nocommit', { base: 'f'.repeat(40) }), path.join(top, 'work-3'));
    assert.equal(noCommit.status, 2);
    assert.match(noCommit.stderr, /scaffold: base commit not in cache/);
    assert.ok(!existsSync(path.join(top, 'work-3', 'repo')));
  });

  it('05-S2: withheld paths are absent, including one with a space in its name', () => {
    const work = path.join(top, 'work-4');
    const result = run(caseWith('c4', { withhold: ['src/tests', 'src/with space'] }), work);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(path.join(work, 'repo/src/tests')));
    assert.ok(!existsSync(path.join(work, 'repo/src/with space')));
    assert.ok(existsSync(path.join(work, 'repo/src/a.txt')));
    assert.throws(() => baseScaffoldScript({ sideRel: '.', base, root: 'src', withhold: ['../x'] }), /inside the repo/);
  });

  it('05-S2: setup runs inside repo/ and its output is committed; a failing setup exits 3', () => {
    const ok = path.join(top, 'work-5');
    assert.equal(run(caseWith('c5', { setup: { argv: ['sh', '-c', 'echo installed > deps.txt'] } }), ok).status, 0);
    assert.equal(readFileSync(path.join(ok, 'repo/deps.txt'), 'utf8'), 'installed\n');
    const failing = run(caseWith('c5f', { setup: { argv: ['sh', '-c', 'exit 7'] } }), path.join(top, 'work-6'));
    assert.equal(failing.status, 3);
    assert.match(failing.stderr, /scaffold: dependency setup failed \(exit 7\)/);
  });

  it('07-T2: wholeTree extracts the whole base tree and config replaces the side config from beside the script', () => {
    const script = caseWith('c10', { wholeTree: true, config: 'config.yaml', withhold: ['src/tests'] });
    writeFileSync(path.join(path.dirname(script), 'config.yaml'), 'case: own\n');
    const work = path.join(top, 'work-10');
    const result = run(script, work);
    assert.equal(result.status, 0, result.stderr);
    const repo = path.join(work, 'repo');
    assert.equal(readFileSync(path.join(repo, 'other/o.txt'), 'utf8'), 'outside root\n');
    assert.equal(readFileSync(path.join(repo, 'src/a.txt'), 'utf8'), 'base\n');
    assert.ok(!existsSync(path.join(repo, 'src/tests')));
    assert.equal(readFileSync(path.join(repo, '.ambicode/config.yaml'), 'utf8'), 'case: own\n');
  });

  it('applyPatch applies the patch beside the script after the commit, leaving it uncommitted; a patch that does not apply fails', () => {
    const script = caseWith('c11', { wholeTree: true, applyPatch: 'review/change.patch' });
    put(path.join(path.dirname(script), 'review/change.patch'), 'diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-base\n+reviewed\n');
    const work = path.join(top, 'work-11');
    const result = run(script, work);
    assert.equal(result.status, 0, result.stderr);
    const repo = path.join(work, 'repo');
    assert.equal(readFileSync(path.join(repo, 'src/a.txt'), 'utf8'), 'reviewed\n');
    assert.equal(git(repo, 'status', '--porcelain'), 'M src/a.txt');
    assert.equal(git(repo, 'rev-list', '--all', '--count'), '1');
    put(path.join(path.dirname(script), 'review/change.patch'), 'diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-absent\n+reviewed\n');
    assert.notEqual(run(script, path.join(top, 'work-12')).status, 0);
  });

  it('the plugin\'s own state stays out of git status without a commit, so a review case keeps one snapshot id', () => {
    const script = caseWith('c13', { wholeTree: true, applyPatch: 'review/change.patch' });
    put(path.join(path.dirname(script), 'review/change.patch'), 'diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-base\n+reviewed\n');
    const work = path.join(top, 'work-13');
    assert.equal(run(script, work).status, 0);
    const repo = path.join(work, 'repo');
    put(path.join(repo, '.ambicode/task/t/ledger.jsonl'), '{}\n');
    put(path.join(repo, '.ambicode/reviews/r.json'), '{}\n');
    assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), 'M src/a.txt');
    assert.equal(git(repo, 'ls-files', '.gitignore'), '', 'the base commit is unchanged');
    put(path.join(repo, '.ambicode/index/i.db'), 'x');
    assert.match(git(repo, 'status', '--porcelain', '--untracked-files=all'), /\?\? \.ambicode\/index\/i\.db/, 'an unignored index directory withholds index build consent');
  });

  it('the user\'s git config does not change the base commit: global and default excludes are not applied', () => {
    const script = caseWith('c14', {});
    const home = path.join(top, 'home-14');
    put(path.join(home, 'excludes'), 'a.txt\n');
    put(path.join(home, '.gitconfig'), `[core]\n\texcludesFile = ${path.join(home, 'excludes').split(path.sep).join('/')}\n`);
    put(path.join(home, '.config/git/ignore'), 'x.test.ts\n');
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.XDG_CONFIG_HOME;
    delete env.GIT_CONFIG_GLOBAL;
    const work = path.join(top, 'work-14');
    mkdirSync(work, { recursive: true });
    const result = spawnSync('sh', [script], { cwd: work, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    const files = git(path.join(work, 'repo'), 'ls-files').split('\n');
    assert.ok(files.includes('src/a.txt') && files.includes('src/tests/x.test.ts'), files.join(', '));
    const plain = path.join(top, 'work-14b');
    assert.equal(run(script, plain).status, 0);
    assert.equal(git(path.join(work, 'repo'), 'rev-parse', 'HEAD'), git(path.join(plain, 'repo'), 'rev-parse', 'HEAD'));
  });

  it('05-S2: SIDE resolves from the script location; sideRelFrom fits any case directory under any root; a moved copy is regenerated', () => {
    const script = caseWith('c7', {});
    const deeper = path.join(top, 'cases', 'nested', 'c7');
    mkdirSync(deeper, { recursive: true });
    assert.equal(sideRelFrom(deeper, top, 'side'), '../../../side');
    writeBaseScaffold(deeper, { sideRel: sideRelFrom(deeper, top, 'side'), base, root: 'src' });
    const moved = run(path.join(deeper, 'scaffold.sh'), path.join(top, 'work-7'));
    assert.equal(moved.status, 0, moved.stderr);
    const elsewhere = run(script, path.join(top, 'work-8', 'any', 'cwd'));
    assert.equal(elsewhere.status, 0, elsewhere.stderr);
    const copied = path.join(top, 'cases', 'nested', 'copied');
    cpSync(path.dirname(script), copied, { recursive: true });
    assert.notEqual(run(path.join(copied, 'scaffold.sh'), path.join(top, 'work-9')).status, 0, 'a copy one level deeper with the old sideRel does not find SIDE');
  });
});

describe('05-S4 one builder', () => {
  it('05-S4: no other eval script extracts a base commit with git archive', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
    const builders = walk(root).filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs') && /\barchive\b/.test(readFileSync(file, 'utf8')));
    assert.deepEqual(builders.map((file) => path.relative(root, file)), [path.join('cases', 'base-scaffold.mjs')]);
  });
});
