import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attachBaseline, bareRates, lockedBaseline, readBaselineLock, resolveBaseline, writeBaselineLock } from './baseline-lock.mjs';

const analysis = {
  tracesDir: null,
  meta: () => ({ kind: 'localize', side: 'BE', truth: ['src/a.ts', 'src/b.ts'], root: 'src' }),
  trace: () => ({ model: 'm', calls: [{ block: { name: 'Read' } }, { block: { name: 'Bash' }, bashRead: true }], replayedReviews: 0, peakContext: 1000 }),
  exports: () => ({}),
};
const run = (answer, costUsd) => ({ costUsd, turns: 4, graders: [{ name: 'names-a-true-file', passed: true, evidence: answer }] });
const naked = {
  startedAt: '2026-01-01T00:00:00Z',
  claudeVersion: '2.1',
  suite: { modelOverride: 'm', plugins: [{ name: 'naked' }] },
  cases: [{ name: 'c1', promptMarkdown: 'find it', arms: { with: [run('src/a.ts', 1), run('src/a.ts src/b.ts', 3)] } }],
};
const pluginRun = { startedAt: '2026-01-02T00:00:00Z', claudeVersion: '2.1', suite: { modelOverride: 'm', plugins: [{ name: 'ambicode' }] }, cases: [{ name: 'c1', promptMarkdown: 'find it', arms: { with: [run('src/a.ts', 2)] } }] };

describe('baseline-lock: the pinned bare reference', () => {
  let dir;
  let source;
  let lockFile;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'baseline-lock-'));
    source = path.join(dir, 'naked.json');
    lockFile = path.join(dir, 'baseline.lock.json');
    writeFileSync(source, JSON.stringify(naked));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('records the source hash, model, version and per-case bare means', () => {
    const lock = writeBaselineLock(source, { lockFile, analysis });
    assert.deepEqual([lock.sources[0].source, lock.model, lock.claudeVersion, lock.arm], [source, 'm', '2.1', 'with']);
    assert.deepEqual(lock.sources[0].cases, ['c1']);
    assert.deepEqual([lock.cases.c1.skill, lock.sources[0].skills], [null, []], 'a name without a skill suffix records none');
    assert.match(lock.sources[0].sha256, /^sha256:[0-9a-f]{64}$/);
    const c1 = lock.cases.c1;
    assert.deepEqual([c1.runs, c1.recall, c1.precision, c1.costUsd, c1.turns], [2, 0.75, 1, 2, 4]);
    assert.deepEqual([c1.toolCalls, c1.peakContext, c1.readCalls, c1.bashReads], [2, 1000, 1, 1], 'trace measures are locked beside recall and cost');
    assert.match(c1.prompt, /^sha256:/);
    assert.deepEqual(readBaselineLock({ lockFile }), lock);
    const rates = bareRates(lock);
    assert.deepEqual([rates.bare.get('c1'), rates.barePrecision.get('c1')], [0.75, 1]);
  });

  it('resolves nothing when nothing is locked, and selects without discrimination', () => {
    assert.equal(lockedBaseline({ lockFile }), null);
    assert.equal(resolveBaseline(pluginRun, { lockFile }), null);
    assert.deepEqual(bareRates(null), {});
    assert.equal(attachBaseline(pluginRun, undefined, { lockFile }), pluginRun);
  });

  it('attaches the locked bare arm to a plugin-only run, and leaves a run with its own bare arm alone', () => {
    writeBaselineLock(source, { lockFile, analysis });
    const attached = attachBaseline(pluginRun, undefined, { lockFile });
    assert.equal(attached.cases[0].arms.without.length, 2);
    assert.equal(attached.baseline.file, source);
    assert.equal(resolveBaseline(naked, { lockFile }), null, 'the naked run is the baseline, not compared to it');
    const own = { ...pluginRun, cases: [{ ...pluginRun.cases[0], arms: { with: [], without: [run('x', 1)] } }] };
    assert.equal(resolveBaseline(own, { lockFile }), null);
  });

  it('leaves a run of another preset alone: the lock pins only the core suite, the average preset', () => {
    writeBaselineLock(source, { lockFile, analysis });
    const presetOf = (name) => ({ ...analysis, meta: () => ({ ...analysis.meta(), preset: name }) });
    assert.equal(resolveBaseline(pluginRun, { lockFile, analysis: presetOf('light') }), null);
    assert.equal(resolveBaseline(pluginRun, { lockFile, analysis: presetOf('average') }).file, source, 'the core suite takes the lock');
    assert.equal(resolveBaseline(pluginRun, { lockFile, analysis }).file, source);
  });

  it('refuses a changed or missing source, and an incompatible run, instead of falling back', () => {
    writeBaselineLock(source, { lockFile, analysis });
    assert.throws(() => attachBaseline({ ...pluginRun, claudeVersion: '2.2' }, undefined, { lockFile }), /Claude Code version 2\.1, this run on 2\.2/);
    assert.throws(() => attachBaseline({ ...pluginRun, cases: [{ ...pluginRun.cases[0], name: 'c9' }] }, undefined, { lockFile }), /no case c9/);
    writeFileSync(source, JSON.stringify({ ...naked, claudeVersion: '2.2' }));
    assert.throws(() => lockedBaseline({ lockFile }), /changed \(sha256:/);
    rmSync(source);
    assert.throws(() => lockedBaseline({ lockFile }), /is missing/);
  });

  it('refuses the lock for a case whose truth changed since it was locked', () => {
    writeBaselineLock(source, { lockFile, analysis });
    assert.equal(resolveBaseline(pluginRun, { lockFile, analysis }).file, source);
    const moved = { ...analysis, meta: () => ({ ...analysis.meta(), truth: ['src/a.ts', 'src/c.ts'] }) };
    assert.throws(() => resolveBaseline(pluginRun, { lockFile, analysis: moved }), /c1's truth changed since it was locked/);
  });

  it('lets an explicit --baseline file override the lock', () => {
    const other = path.join(dir, 'other.json');
    writeFileSync(other, readFileSync(source));
    assert.equal(resolveBaseline(pluginRun, { baselinePath: other, lockFile }).file, other);
  });

  it('locks each skill on its own: a later lock replaces only the cases it ran and keeps the others', () => {
    const only = (name, answer) => ({ name, promptMarkdown: `p ${name}`, arms: { with: [run(answer, 1)] } });
    const file = (name, cases) => { const f = path.join(dir, `${name}.json`); writeFileSync(f, JSON.stringify({ ...naked, cases })); return f; };
    const first = file('first', [only('c1', 'src/a.ts'), only('c2', 'src/a.ts')]);
    writeBaselineLock(first, { lockFile, analysis });
    const second = file('second', [only('c2', 'src/a.ts src/b.ts')]);
    const lock = writeBaselineLock(second, { lockFile, analysis });
    assert.deepEqual(lock.sources.map((s) => [s.source, s.cases]), [[first, ['c1']], [second, ['c2']]]);
    assert.deepEqual([lock.cases.c1.recall, lock.cases.c2.recall], [0.5, 1], 'c2 is the new run; c1 is untouched');
    const { results, file: joined } = lockedBaseline({ lockFile });
    assert.deepEqual(results.cases.map((c) => c.name), ['c1', 'c2']);
    assert.equal(joined, `${first} + ${second}`);
    writeBaselineLock(file('third', [only('c1', 'src/b.ts')]), { lockFile, analysis });
    assert.deepEqual(readBaselineLock({ lockFile }).sources.map((s) => s.cases), [['c2'], ['c1']]);
    writeBaselineLock(file('fourth', [only('c1', 'x'), only('c2', 'x')]), { lockFile, analysis });
    assert.equal(readBaselineLock({ lockFile }).sources.length, 1, 'a source with no case left is dropped');
  });

  it('records the skill of each preset case and of each source', () => {
    const f = path.join(dir, 'skills.json');
    writeFileSync(f, JSON.stringify({ ...naked, cases: ['be-vs-1-investigate', 'be-vs-2-investigate'].map((name) => ({ ...naked.cases[0], name })) }));
    const lock = writeBaselineLock(f, { lockFile, analysis });
    assert.deepEqual([lock.cases['be-vs-1-investigate'].skill, lock.sources[0].skills], ['investigate', ['investigate']]);
  });

  it('refuses to join a lock made on another Claude Code version, and changes nothing', () => {
    writeBaselineLock(source, { lockFile, analysis });
    const other = path.join(dir, 'other-version.json');
    writeFileSync(other, JSON.stringify({ ...naked, claudeVersion: '2.2' }));
    assert.throws(() => writeBaselineLock(other, { lockFile, analysis }), /Claude Code version is 2\.2, the lock's is 2\.1/);
    assert.equal(readBaselineLock({ lockFile }).claudeVersion, '2.1');
  });

  it('reads a version 1 lock as one source, and extends it', () => {
    const { sources, ...rest } = writeBaselineLock(source, { lockFile, analysis });
    const [{ source: at, sha256: hash, plugin, startedAt }] = sources;
    writeFileSync(lockFile, JSON.stringify({ ...rest, version: 1, source: at, sha256: hash, plugin, startedAt }));
    assert.deepEqual(readBaselineLock({ lockFile }).sources, sources);
    assert.equal(lockedBaseline({ lockFile }).file, source);
    const next = path.join(dir, 'next.json');
    writeFileSync(next, JSON.stringify({ ...naked, cases: [{ ...naked.cases[0], name: 'c2' }] }));
    assert.deepEqual(Object.keys(writeBaselineLock(next, { lockFile, analysis }).cases), ['c1', 'c2']);
  });

  it('refuses a partial run as the reference', () => {
    writeFileSync(source, JSON.stringify({ ...naked, partial: true }));
    assert.throws(() => writeBaselineLock(source, { lockFile, analysis }), /partial run/);
  });
});
