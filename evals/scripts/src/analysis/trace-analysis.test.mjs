// Regression assertions moved intact from the approved harness suite.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceMetrics, harvestTraces, harvestedOfResult } from './trace-analysis.mjs';
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
      mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const tracesDir = path.join(benchmarks, 'traces');
      mkdirSync(tracesDir);
      writeFileSync(path.join(tracesDir, 'e-abc.jsonl'), TRACE);
      const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
      const results = { cases: [{ name: 'side-t-1', arms: { with: [{ graders, tracePath: '/private/tmp/e-abc/out/trace.jsonl' }, { graders, tracePath: '/private/tmp/e-gone/out/trace.jsonl' }] } }] };
      const w = score(results, { benchmarks, tracesDir }).arms['localize/with'];
      assert.deepEqual([w.runs, w.traced, w['skill-fired'], w['prepare-ran'], w['prepare-truncated'], w['review-runs'], w['bash-reads']], [2, 1, 1, 1, 1, 1, 2]);
      assert.deepEqual(w.models, ['claude-sonnet-5-5']);
      assert.equal(score(results, { benchmarks }).arms['localize/with'].traced, 0, 'no traces directory: nothing is traced, nothing is invented');
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: harvesting traces', () => {
  it('puts traces beside the run result, so they share its excluded-directory guarantee', () => {
    const spec = runSpec(M, { now: new Date('2026-01-02T03:04:05.678Z') });
    assert.equal(spec.tracesDir, path.join(ROOT, 'evals', 'evals-core', 'results', 'traces'));
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
      assert.deepEqual(harvestedOfResult(path.join(dir, 'r.json'), dir), { named: 2, harvested: 1 });
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
