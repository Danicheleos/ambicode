// A `claude` stub on PATH answers both arms, told apart by working directory:
// AMBICODE's reviewer runs in the snapshot, the plain one beside `repo/`.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { blindSheet } from './evals-reviewer.mjs';
import { ROOT } from '../shared/bench-paths.mjs';
import { REQUIRED_FLAGS } from '../../../../src/modules/review/reviewer/claude-reviewer.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STUB = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const argv = process.argv.slice(2);
if (argv.includes('--help')) { process.stdout.write(fs.readFileSync(path.join(dir, 'help.txt'), 'utf8')); process.exit(0); }
if (argv.includes('--version')) { process.stdout.write('0.0.0 (stub)\\n'); process.exit(0); }
fs.readFileSync(0, 'utf8');
const arm = fs.existsSync('repo') ? 'plain' : 'ambicode';
fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify({ arm, cwd: process.cwd() }) + '\\n');
const mode = JSON.parse(fs.readFileSync(path.join(dir, 'mode.json'), 'utf8'))[arm];
if (mode === 'not-logged-in') {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }));
  process.exit(1);
}
const findings = mode === 'finding'
  ? [{ risk: 'high', confidence: 'high', category: 'correctness',
       location: { oldPath: 'src/page.js', newPath: 'src/page.js', side: 'new', line: 1 },
       supportingLocations: [], explanation: 'The slice ends one item early, so every page loses its last item.',
       suggestedComment: 'End the slice at (index + 1) * size.', ruleRefs: [], requirementRefs: [] }]
  : [];
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done',
  total_cost_usd: 0.01, duration_ms: 5, duration_api_ms: 4, num_turns: 1,
  structured_output: { findings, coverageNotes: mode === 'finding' ? ['Read src/page.js only.'] : [] } }));
`;

async function caseDirectory(evals, name, skill, scaffoldLog) {
  const directory = path.join(evals, name);
  await mkdir(path.join(directory, 'graders'), { recursive: true });
  await writeFile(
    path.join(directory, 'prompt.md'),
    `---\nname: ${name}\n---\n\nReview the uncommitted change in the repository at \`repo/\`.\n`,
  );
  await writeFile(
    path.join(directory, 'graders', 'plugin-fired.md'),
    `---\ntype: tool_used\ntool: Skill\ninput_match: '"${skill}"'\narm: with-only\n---\n`,
  );
  await writeFile(
    path.join(directory, 'scaffold.sh'),
    `#!/bin/sh\nset -e\necho "$PWD" >> "${scaffoldLog}"\n` +
      `node "${path.join(ROOT, 'fixtures', 'materialize.mjs')}" ts-off-by-one "$PWD/repo" --ambicode-init\n`,
  );
}

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

describe('evals-reviewer: the reviewer-quality harness', () => {
  let scratch;
  let stub;
  let evals;
  let scaffoldLog;

  async function harness(name, modes, runs) {
    await writeFile(path.join(stub, 'mode.json'), JSON.stringify(modes));
    await writeFile(path.join(stub, 'calls.jsonl'), '');
    await writeFile(scaffoldLog, '');
    const out = path.join(scratch, name);
    execFileSync(process.execPath, [path.join(HERE, 'evals-reviewer.mjs'), '--evals', evals, '--out', out, '--runs', String(runs), '--seed', '7'], {
      env: { ...process.env, PATH: `${stub}${path.delimiter}${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const read = (file) => readFile(path.join(out, file), 'utf8');
    const lines = (text) => text.split('\n').filter(Boolean);
    return {
      results: JSON.parse(await read('results.json')),
      runsCsv: lines(await read('runs.csv')),
      sheet: lines(await read('adjudication-sheet.csv')),
      key: await read('adjudication-key.csv'),
      report: await read('report.md'),
      calls: lines(await readFile(path.join(stub, 'calls.jsonl'), 'utf8')).map((line) => JSON.parse(line)),
      scaffolds: lines(await readFile(scaffoldLog, 'utf8')),
    };
  }

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-reviewer-'));
    stub = path.join(scratch, 'bin');
    evals = path.join(scratch, 'evals');
    scaffoldLog = path.join(scratch, 'scaffolds.log');
    await mkdir(stub, { recursive: true });
    await writeFile(path.join(stub, 'claude'), STUB);
    await chmod(path.join(stub, 'claude'), 0o755);
    await writeFile(path.join(stub, 'help.txt'), [...REQUIRED_FLAGS, '--append-system-prompt-file'].join('\n'));
    await caseDirectory(evals, 'demo-ts', 'ambicode:review', scaffoldLog);
    // Routed to another skill: the harness must not review it.
    await caseDirectory(evals, 'demo-task', 'ambicode:task', scaffoldLog);
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('two arms, two runs, one finding each', () => {
    let run;
    before(async () => {
      run = await harness('findings', { ambicode: 'finding', plain: 'finding' }, 2);
    });

    it('scaffolds once per case, arm and run, and reviews each in its own copy', () => {
      assert.equal(run.scaffolds.length, 4);
      assert.equal(new Set(run.scaffolds).size, 4);
      assert.deepEqual(run.calls.map((call) => call.arm).sort(), ['ambicode', 'ambicode', 'plain', 'plain']);
      assert.equal(new Set(run.calls.map((call) => call.cwd)).size, 4);
      assert.deepEqual(
        run.results.results.map((r) => [r.arm, r.run, r.status, r.findings.length]),
        [
          ['ambicode', 1, 'ok', 1],
          ['plain', 1, 'ok', 1],
          ['plain', 2, 'ok', 1],
          ['ambicode', 2, 'ok', 1],
        ],
      );
    });

    it('writes a sheet that names no arm or run, with a key that maps every row back', () => {
      assert.equal(run.sheet[0], 'id,case,path,line,claim,label,notes');
      assert.equal(run.sheet.length, 5);
      for (const row of run.sheet.slice(1)) {
        assert.doesNotMatch(row, /\b(ambicode|plain)\b/, row);
        assert.match(row, /^F00\d,demo-ts,src\/page\.js,1,/);
      }
      const keyRows = run.key.split('\n').filter(Boolean).map((line) => line.split(','));
      assert.deepEqual(keyRows[0], ['id', 'case', 'arm', 'run', 'finding']);
      assert.deepEqual(
        keyRows.slice(1).map(([id]) => id),
        run.sheet.slice(1).map((row) => row.split(',')[0]),
      );
      assert.equal(new Set(keyRows.slice(1).map(([, , arm, n]) => `${arm}/${n}`)).size, 4);
    });

    it('rebuilds the same key from the results and the recorded seed', () => {
      assert.equal(run.results.seed, 7);
      const { key } = blindSheet(run.results.results, run.results.seed);
      assert.equal(key.map((row) => row.join(',')).join('\n') + '\n', run.key);
    });
  });

  describe('recordings for the replay reviewer', () => {
    const stubbed = () => ({ ...process.env, PATH: `${stub}${path.delimiter}${process.env.PATH}` });
    let out;
    let recorded;

    before(async () => {
      await harness('to-record', { ambicode: 'finding', plain: 'empty' }, 2);
      out = path.join(scratch, 'to-record');
      execFileSync(process.execPath, [path.join(HERE, 'evals-reviewer.mjs'), 'record', out, '--evals', evals], {
        env: stubbed(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      recorded = JSON.parse(await readFile(path.join(out, 'recordings.json'), 'utf8'));
    });

    it('records the first answer per case as a reviewer would give it, coverage notes included', () => {
      assert.equal(recorded.schemaVersion, 1);
      assert.equal(recorded.recordings.length, 1);
      const [recording] = recorded.recordings;
      assert.equal(recording.case, 'demo-ts');
      assert.match(recording.snapshotId, /^working-[0-9a-f]{16}$/);
      assert.match(recording.recordedFrom, /to-record\/raw\/demo-ts-ambicode-1\.json$/);
      // The validator's own additions are not part of an answer.
      assert.deepEqual(Object.keys(recording.output.findings[0]).sort(), [
        'category', 'confidence', 'explanation', 'location', 'requirementRefs', 'risk', 'ruleRefs',
        'suggestedComment', 'supportingLocations',
      ]);
      assert.deepEqual(recording.output.coverageNotes, ['Read src/page.js only.']);
    });

    it('replays it on a fresh scaffold without starting a reviewer', async () => {
      const directory = await mkdtemp(path.join(scratch, 'replay-'));
      execFileSync('sh', [path.join(evals, 'demo-ts', 'scaffold.sh')], { cwd: directory, stdio: 'ignore' });
      await writeFile(path.join(stub, 'calls.jsonl'), '');
      const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ambicode.mjs'), 'review', '--json'], {
        cwd: path.join(directory, 'repo'),
        env: { ...stubbed(), EVAL_AMBICODE_REVIEWER_REPLAY: path.join(out, 'recordings.json') },
        encoding: 'utf8',
      });
      const { result } = JSON.parse(stdout);
      assert.equal(await readFile(path.join(stub, 'calls.jsonl'), 'utf8'), '', 'the stub reviewer was started');
      assert.equal(result.reviewer.status, 'ok');
      assert.equal(result.reviewer.source, 'replay');
      assert.equal(result.target.snapshotId, recorded.recordings[0].snapshotId);
      assert.deepEqual(result.findings.map(({ id, evidence, ...finding }) => finding), recorded.recordings[0].output.findings);
      assert.ok(result.omissions.includes('Read src/page.js only.'));
    });

    it('refuses a case whose change today is not the one the answer was recorded for', async () => {
      const drifted = path.join(scratch, 'drifted');
      await mkdir(path.join(drifted, 'raw'), { recursive: true });
      await writeFile(path.join(drifted, 'results.json'), await readFile(path.join(out, 'results.json')));
      const raw = JSON.parse(await readFile(path.join(out, 'raw', 'demo-ts-ambicode-1.json'), 'utf8'));
      raw.stdout.result.inputs.changedLines += 1;
      await writeFile(path.join(drifted, 'raw', 'demo-ts-ambicode-1.json'), JSON.stringify(raw));
      const child = spawnSync(process.execPath, [path.join(HERE, 'evals-reviewer.mjs'), 'record', drifted, '--evals', evals], {
        env: stubbed(),
        encoding: 'utf8',
      });
      assert.equal(child.status, 1);
      assert.match(child.stderr, /^refused demo-ts: the change differs from the recorded one \(changedLines\)$/m);
      assert.deepEqual(JSON.parse(await readFile(path.join(drifted, 'recordings.json'), 'utf8')).recordings, []);
    });
  });

  describe('a reviewer that cannot sign in', () => {
    let run;
    before(async () => {
      run = await harness('failed', { ambicode: 'not-logged-in', plain: 'empty' }, 1);
    });

    it('records the failed arm as failed with its reason, never as zero findings', () => {
      const [ambicode, plain] = ['ambicode', 'plain'].map((arm) => run.results.results.find((r) => r.arm === arm));
      assert.equal(ambicode.status, 'failed');
      assert.equal(ambicode.findings, null);
      assert.equal(ambicode.reason, 'reviewer-failed');
      assert.match(ambicode.detail, /Not logged in/);
      assert.equal(plain.status, 'ok');
      assert.deepEqual(plain.findings, []);
      assert.match(run.runsCsv.find((line) => line.startsWith('demo-ts,ambicode,')), /^demo-ts,ambicode,1,failed,,reviewer-failed,/);
      assert.match(run.runsCsv.find((line) => line.startsWith('demo-ts,plain,')), /^demo-ts,plain,1,ok,0,/);
    });

    it('reports the failed arm\'s findings as missing, and the empty arm\'s as zero', () => {
      assert.match(run.report, /^\| demo-ts \| ambicode \| 0 \| 1 \| missing \| missing \|/m);
      assert.match(run.report, /^\| demo-ts \| plain \| 1 \| 0 \| 0 \| 0\.0 \|/m);
      assert.match(run.report, /demo-ts ambicode run 1: reviewer-failed — .*Not logged in/);
      assert.match(run.report, /below the three plan\/07:209 asks for/);
      assert.equal(run.sheet.length, 1);
    });

    it('reviews only the cases that route to the review skill', () => {
      assert.equal(run.scaffolds.length, 2);
      assert.deepEqual(run.results.cases, ['demo-ts']);
    });
  });
});
