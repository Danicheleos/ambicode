// Regression assertions moved intact from the approved harness suite.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_DIRECTORY, traceMetrics, harvestExports, harvestTraces, harvestedOfResult, removeSandboxes } from './trace-analysis.mjs';
import { LEDGER_DIRECTORY } from './ledger-metrics.mjs';
import { chmodSync, existsSync, realpathSync } from 'node:fs';
import { TRACE, ticket, M, event } from '../testing/bench-test-fixtures.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { score, runSpec, ledgerMetrics } from '../harness/evals-bench.mjs';
import { ROOT } from '../shared/bench-paths.mjs';

describe('evals-bench: measures taken from the trace', () => {
  it('counts the agent\'s own calls, never the skill text that names the helper', () => {
    assert.deepEqual(traceMetrics(TRACE), {
      model: 'claude-sonnet-5-5',
      builtinPlugins: null,
      toolCalls: 9,
      skills: ['ambicode:investigate'],
      prepareRuns: 2,
      prepareTruncated: 1,
      reviewRuns: 1,
      replayedReviews: 1,
      replayMisses: 0,
      bashReads: 2,
      readCalls: 1,
      grepCalls: 1,
      peakContext: null,
      mcpHookResponses: null,
      mcpHookSpawns: null,
    });
  });

  it('attaches them to the scored runs, and leaves an untraced run out of the counts', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-trace-score-'));
    try {
      mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const tracesDir = path.join(benchmarks, 'traces');
      mkdirSync(tracesDir);
      writeFileSync(path.join(tracesDir, 'e-abc.jsonl'), TRACE);
      const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
      const results = { cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/private/tmp/e-abc/out/trace.jsonl' }, { graders, tracePath: '/private/tmp/e-gone/out/trace.jsonl' }] } }] };
      const w = score(results, { cases: benchmarks, tracesDir }).arms['localize/with'];
      assert.deepEqual([w.runs, w.traced, w['skill-fired'], w['prepare-ran'], w['prepare-truncated'], w['review-runs'], w['bash-reads']], [2, 1, 1, 1, 1, 1, 2]);
      assert.deepEqual(w.models, ['claude-sonnet-5-5']);
      assert.equal(score(results, { cases: benchmarks }).arms['localize/with'].traced, 0, 'no traces directory: nothing is traced, nothing is invented');
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: the Stop hook\'s exported ledgers', () => {
  it('lays an export over a shorter polled copy of the same sandbox ledger, never over a longer one', () => {
    const sandboxRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'harvest-export-')));
    const outDir = path.join(sandboxRoot, 'kept');
    try {
      const relative = path.join('home', 'cwd', 'repo', '.ambicode', 'task', 'cart', 'ledger.jsonl');
      const live = path.join(sandboxRoot, 'e-one', relative);
      mkdirSync(path.dirname(live), { recursive: true });
      writeFileSync(live, '{"n":1}\n');
      harvestTraces(outDir, { sandboxRoots: [sandboxRoot] });
      const polled = path.join(outDir, LEDGER_DIRECTORY, 'e-one', relative);
      assert.equal(readFileSync(polled, 'utf8'), '{"n":1}\n');
      const exported = path.join(outDir, EXPORT_DIRECTORY, 'session-a', 'cart');
      mkdirSync(exported, { recursive: true });
      writeFileSync(path.join(exported, 'ledger.jsonl'), '{"n":1}\n{"n":2}\n{"n":3}\n');
      writeFileSync(path.join(exported, 'source.json'), JSON.stringify({ ledger: live, entries: 3 }));
      rmSync(path.join(sandboxRoot, 'e-one'), { recursive: true }); // the harness deleted the sandbox before the last poll
      harvestTraces(outDir, { sandboxRoots: [sandboxRoot] });
      assert.equal(readFileSync(polled, 'utf8'), '{"n":1}\n{"n":2}\n{"n":3}\n', 'the export carries the entries the poll missed');
      writeFileSync(polled, '{"n":1}\n{"n":2}\n{"n":3}\n{"n":4}\n');
      assert.equal(harvestExports(outDir, { sandboxRoots: [sandboxRoot] }), 0, 'a later turn the poll saw is not rolled back');
      writeFileSync(path.join(exported, 'source.json'), JSON.stringify({ ledger: '/elsewhere/e-one/ledger.jsonl', entries: 3 }));
      assert.equal(harvestExports(outDir, { sandboxRoots: [sandboxRoot] }), 0, 'a source outside every sandbox root is skipped');
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: harvesting traces', () => {
  it('puts traces beside the run result, so they share its excluded-directory guarantee', () => {
    const outputs = path.join(tmpdir(), 'o');
    const spec = runSpec(M, { now: new Date('2026-01-02T03:04:05.678Z'), outputs });
    assert.equal(spec.tracesDir, path.join(outputs, 'core', '2026-01-02', '01_0304_curated-ambicode-sonnet-5-5', 'traces'));
    const benchmarks = path.join(tmpdir(), 'b');
    assert.equal(runSpec([...M, '--json', path.join(benchmarks, 'r.json')], { benchmarks }).tracesDir, path.join(benchmarks, 'traces'));
    assert.throws(() => runSpec([...M, '--json']), /needs a path/);
  });

  it('copies each live sandbox trace whole, overwrites with growth, and skips what has no trace yet', () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'harvest-'));
    const outDir = path.join(sandboxRoot, 'kept');
    try {
      const sandboxRoots = [sandboxRoot, path.join(sandboxRoot, 'missing-root')];
      mkdirSync(path.join(sandboxRoot, 'e-one', 'out'), { recursive: true });
      writeFileSync(path.join(sandboxRoot, 'e-one', 'out', 'trace.jsonl'), '{"turn":1}\n');
      mkdirSync(path.join(sandboxRoot, 'e-two', 'out'), { recursive: true });
      mkdirSync(path.join(sandboxRoot, 'not-a-run'), { recursive: true });
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 1, 'a root that does not exist on this platform is skipped, not fatal');
      assert.deepEqual(readdirSync(outDir), ['e-one.jsonl']);
      writeFileSync(path.join(sandboxRoot, 'e-one', 'out', 'trace.jsonl'), '{"turn":1}\n{"turn":2}\n');
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 1, 'a later pass overwrites: the trace grows, the last copy is the whole one');
      assert.equal(readFileSync(path.join(outDir, 'e-one.jsonl'), 'utf8'), '{"turn":1}\n{"turn":2}\n');
      rmSync(path.join(sandboxRoot, 'e-one'), { recursive: true });
      assert.equal(harvestTraces(outDir, { sandboxRoots }), 0);
      assert.deepEqual(readdirSync(outDir), ['e-one.jsonl'], 'a deleted sandbox does not take its harvested trace with it');
      writeFileSync(path.join(sandboxRoot, 'e-two', 'out', 'trace.jsonl'), '{"turn":1}\n');
      mkdirSync(path.join(outDir, 'e-two.jsonl.tmp')); // copy destination occupied by a directory: EISDIR, not the benign ENOENT
      assert.throws(() => harvestTraces(outDir, { sandboxRoots }), (e) => e.code !== 'ENOENT', 'a persistent failure surfaces instead of degrading every pass silently');
      rmSync(path.join(outDir, 'e-two.jsonl.tmp'), { recursive: true });
      const rootIsAFile = path.join(sandboxRoot, 'root-file');
      writeFileSync(rootIsAFile, '');
      assert.throws(() => harvestTraces(outDir, { sandboxRoots: [rootIsAFile] }), (e) => e.code !== 'ENOENT', 'an unlistable root surfaces too; only a missing one is benign');
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('03b-H3: reads the built-in plugins from the init event', () => {
    const init = JSON.stringify({ type: 'system', subtype: 'init', model: 'm', plugins: [{ name: 'ambicode', path: '/x' }, { name: 'zeta', path: 'builtin' }, { name: 'alpha', path: 'builtin' }] });
    assert.deepEqual(traceMetrics(init).builtinPlugins, ['alpha', 'zeta']);
  });

  it('03b-H1: copies the session transcript of each sandbox beside its trace', () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'harvest-session-'));
    const outDir = path.join(sandboxRoot, 'kept');
    try {
      const project = path.join(sandboxRoot, 'e-one', 'config', 'projects', '-private-tmp-e-one-home-cwd');
      mkdirSync(project, { recursive: true });
      mkdirSync(path.join(sandboxRoot, 'e-one', 'out'), { recursive: true });
      writeFileSync(path.join(sandboxRoot, 'e-one', 'out', 'trace.jsonl'), '{}\n');
      writeFileSync(path.join(project, 'abc.jsonl'), '{"type":"user"}\n');
      writeFileSync(path.join(project, 'notes.txt'), 'x');
      harvestTraces(outDir, { sandboxRoots: [sandboxRoot] });
      assert.deepEqual(readdirSync(path.join(outDir, 'sessions', 'e-one')), ['abc.jsonl']);
      assert.equal(readFileSync(path.join(outDir, 'sessions', 'e-one', 'abc.jsonl'), 'utf8'), '{"type":"user"}\n');
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('03b-H4: removes only the kept sandboxes the result names, sealed parts included', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kept-'));
    try {
      mkdirSync(path.join(root, 'e-mine', 'sealed', 'home'), { recursive: true });
      writeFileSync(path.join(root, 'e-mine', 'sealed', 'home', 'f'), 'x');
      chmodSync(path.join(root, 'e-mine', 'sealed'), 0o000);
      chmodSync(path.join(root, 'e-mine'), 0o500);
      mkdirSync(path.join(root, 'e-other'));
      assert.equal(removeSandboxes(new Set(['e-mine', 'e-gone', '../x']), { sandboxRoots: [root] }), 1);
      assert.equal(existsSync(path.join(root, 'e-mine')), false);
      assert.equal(existsSync(path.join(root, 'e-other')), true, 'an unnamed sandbox is not ours to remove');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('tells a complete harvest from one that missed traces the result names', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'harvest-check-'));
    try {
      const result = {
        cases: [
          {
            arms: {
              with: [{ tracePath: '/private/tmp/e-kept/out/trace.jsonl' }, { tracePath: '/private/tmp/e-gone/out/trace.jsonl' }],
              without: [{ tracePath: '/private/tmp/e-kept/out/trace.jsonl' }], // the same sandbox twice counts once
            },
          },
        ],
      };
      writeFileSync(path.join(dir, 'r.json'), JSON.stringify(result));
      writeFileSync(path.join(dir, 'e-kept.jsonl'), '{}\n');
      writeFileSync(path.join(dir, 'e-stray.jsonl'), '{}\n'); // another sweep's trace changes nothing
      assert.deepEqual(harvestedOfResult(path.join(dir, 'r.json'), dir), { named: 2, harvested: 1, missing: ['e-gone'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: MCP hook spawns are not measured', () => {
  const hook = (name, hookEvent) => event('system', { subtype: 'hook_response', hook_name: name, hook_event: hookEvent });

  it('leaves a SessionStart-only trace unknown', () => {
    const m = traceMetrics(hook('SessionStart:startup', 'SessionStart'));
    assert.deepEqual([m.mcpHookResponses, m.mcpHookSpawns], [null, null]);
  });

  it('counts observed PostToolUse responses for mcp__ tools, and never calls them spawns', () => {
    const m = traceMetrics([hook('PostToolUse:Bash', 'PostToolUse'), hook('PostToolUse:mcp__jira__get', 'PostToolUse'), hook('PostToolUse:mcp__jira__search', 'PostToolUse')].join('\n'));
    assert.deepEqual([m.mcpHookResponses, m.mcpHookSpawns], [2, null]);
    const zero = traceMetrics(hook('PostToolUse:Bash', 'PostToolUse'));
    assert.deepEqual([zero.mcpHookResponses, zero.mcpHookSpawns], [0, null], 'none observed, still no spawn count');
    assert.equal(ledgerMetrics([{ entries: [{ kind: 'note' }], unreadable: 0 }], m).noRouteMcpSpawns, null, 'no route does not turn observations into spawns');
  });
});
