import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { blindSheet, isBenchReviewCase, replayFindings } from './evals-reviewer.mjs';
import { ROOT } from '../shared/bench-paths.mjs';

describe('evals-reviewer: which bench cases are review cases', () => {
  it('takes curated and preset review names, not other kinds', () => {
    const source = 'git -C "$(dirname "$0")/../../ambicode-evals-assets/benchmarks/BE-express/.git" archive';
    const named = (name) => isBenchReviewCase({ name, source });
    assert.deepEqual(['be-vs-1-review-03', 'be-vs-1-review', 'be-vs-1-task', 'be-vs-1-reviewer-x', 'be-vs-1-plan'].map(named), [true, true, false, false, false]);
    assert.equal(isBenchReviewCase({ name: 'x-review', source: 'materialize.mjs" fixture' }), false);
  });
});

describe('evals-reviewer: the blind sheet', () => {
  const runs = ['a-ts', 'b-ts'].flatMap((name) =>
    ['ambicode', 'plain'].map((arm) => ({
      case: name,
      arm,
      run: 1,
      findings: Array.from({ length: 5 }, (_, i) => ({ path: 'src/x.js', line: i + 1, claim: `${name} ${arm} ${i}` })),
    })),
  );
  const order = (seed) => blindSheet(runs, seed).key.slice(1).map(([, name, arm, , index]) => `${name}/${arm}/${index}`);
  const recorded = runs.flatMap((r) => r.findings.map((_, index) => `${r.case}/${r.arm}/${index}`));

  it('shuffles rows out of the order the arms and cases were recorded in', () => {
    assert.deepEqual([...order(7)].sort(), [...recorded].sort());
    assert.notDeepEqual(order(7), recorded);
    assert.notDeepEqual(order(7), order(8));
  });

  it('gives the same order for the same seed', () => {
    assert.deepEqual(order(7), order(7));
  });

  it('leaves a failed run out of the sheet rather than as an empty row', () => {
    const { sheet, key } = blindSheet([{ case: 'a-ts', arm: 'ambicode', run: 1, findings: null }], 7);
    assert.equal(sheet.length, 1);
    assert.equal(key.length, 1);
  });
});


describe('evals-reviewer: findings fixture through `review record`', () => {
  const finding = {
    risk: 'high', confidence: 'high', category: 'correctness',
    location: { oldPath: 'src/page.js', newPath: 'src/page.js', side: 'new', line: 1 },
    supportingLocations: [], explanation: 'The slice ends one item early, so every page loses its last item.',
    suggestedComment: 'End the slice at (index + 1) * size.', ruleRefs: [], requirementRefs: [],
  };

  async function caseDir(root, findings) {
    const directory = path.join(root, 'demo-ts');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'scaffold.sh'), `#!/bin/sh\nset -e\nnode "${path.join(ROOT, 'fixtures', 'materialize.mjs')}" ts-off-by-one "$PWD/repo" --ambicode-init\n`);
    if (findings !== null) await writeFile(path.join(directory, 'findings.json'), JSON.stringify(findings));
    return { name: 'demo-ts', directory };
  }

  it('records the fixture as the reviewer answer and keeps its coverage notes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'evals-reviewer-'));
    try {
      const result = await replayFindings(await caseDir(root, { findings: [finding], coverageNotes: ['Read src/page.js only.'] }));
      assert.equal(result.reviewer.status, 'ok');
      assert.equal(result.findings.length, 1);
      assert.ok(result.omissions.includes('Read src/page.js only.'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('names the live-session requirement when the case has no fixture', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'evals-reviewer-'));
    try {
      await assert.rejects(replayFindings(await caseDir(root, null)), /no findings\.json.*live Claude Code session/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
