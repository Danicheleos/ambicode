import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseRun, formatItems, formatTable } from './plan-l0.mjs';

const ROOT = '/tmp/sandbox/cwd';
const PLAN_PATH = `${ROOT}/.ambicode/tasks/t/plan.md`;
const SCRIPT = fileURLToPath(new URL('./plan-l0.mjs', import.meta.url));

const call = (name, input, result = '') => ({ name, input, result });
const read = (file, window = {}) => call('Read', { file_path: `${ROOT}/${file}`, ...window }, '1\ttext');
const grep = (pattern, result, searchPath = ROOT) => call('Grep', { pattern, path: searchPath }, result);
const bash = (command, result = '') => call('Bash', { command }, result);
const planWrite = (plan, file = PLAN_PATH) => call('Write', { file_path: file, content: plan }, 'ok');
const hashOf = (text) => `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;

/**
 * An archived run `<dir>/stamp/case-1`: a transcript of `calls`, the plan write, then `after` (calls the model made once the plan was written);
 * the plan.md; one captured ticket (none when `ticket` is null); `delivered` texts as hook attachments; plan-claims rows as `planClaims`.
 */
function archive({ plan, ticket = 'ticket text', routeText = null, planFile = PLAN_PATH, calls = [], after = [], delivered = [], planClaims = [] }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-l0-'));
  const base = path.join(dir, 'stamp', 'case-1');
  mkdirSync(`${base}.transcript`, { recursive: true });
  const task = path.join(`${base}.ambicode`, '.ambicode', 'tasks', 't');
  mkdirSync(path.join(task, 'requirements'), { recursive: true });
  writeFileSync(path.join(task, 'plan.md'), plan);
  const ledger = planClaims.map((summary) => ({ kind: 'worker', worker: 'plan-claims', summary }));
  if (ticket !== null) {
    writeFileSync(path.join(task, 'requirements', 'request.json'), JSON.stringify({ key: 'request', content: ticket, rawHash: hashOf(ticket) }));
    ledger.unshift({ kind: 'requirement', key: 'request', rawHash: hashOf(ticket) });
  }
  if (routeText !== null) ledger.unshift({ kind: 'route', skill: 'plan', args: { text: routeText } });
  writeFileSync(path.join(task, 'ledger.jsonl'), ledger.map((row) => JSON.stringify(row)).join('\n'));
  const records = delivered.map((text) => ({ type: 'attachment', attachment: { type: 'hook_additional_context', content: [text] } }));
  [...calls, planWrite(plan, planFile), ...after].forEach((entry, index) => {
    records.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${index}`, name: entry.name, input: entry.input }] } });
    records.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${index}`, content: [{ type: 'text', text: entry.result }] }] } });
  });
  writeFileSync(path.join(`${base}.transcript`, 's.jsonl'), records.map((record) => JSON.stringify(record)).join('\n'));
  return { dir, base, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Builds the archive, runs the analysis, hands the result to `check`, removes the archive. */
function analyse(spec, check = (result) => result) {
  const run = archive(spec);
  try { return check(analyseRun(run.base), run); } finally { run.remove(); }
}
const stateOf = (result, cite) => result.cites.find((entry) => `${entry.file}:${entry.from}` === cite)?.state;
const tableRow = (result) => formatTable([result]).split('\n').at(-1);

describe('cites: what the model had looked at before it last wrote the plan', () => {
  it('a cite whose lines a Read covered is read', () => {
    analyse({ plan: 'The check is at `src/a.ts:12-18`.\n', calls: [read('src/a.ts', { offset: 10, limit: 20 })] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:12'), 'read');
    });
  });

  it('in an older run the plan write is the model\'s steps/plan-body.md; a Read after it does not count', () => {
    const planFile = `${ROOT}/.ambicode/tasks/t/steps/plan-body.md`;
    analyse({ plan: '`src/a.ts:5`, `src/b.ts:6`\n', planFile, calls: [read('src/a.ts')], after: [read('src/b.ts')] }, (result) => {
      assert.deepEqual(result.cites.map((cite) => cite.state), ['read', 'unseen']);
    });
  });

  it('a cite is read when Reads side by side cover all of its lines', () => {
    analyse({ plan: '`src/a.ts:25-45`\n', calls: [read('src/a.ts', { offset: 1, limit: 30 }), read('src/a.ts', { offset: 31, limit: 30 })] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:25'), 'read');
    });
  });

  it('a Read without a limit covers the first 2000 lines', () => {
    analyse({ plan: '`src/a.ts:1999` and `src/a.ts:2001`\n', calls: [read('src/a.ts')] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:1999'), 'read');
      assert.equal(stateOf(result, 'src/a.ts:2001'), 'seen');
    });
  });

  it('a Read made after the last plan write does not count', () => {
    analyse({ plan: '`src/a.ts:5`\n', after: [read('src/a.ts')] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:5'), 'unseen');
    });
  });

  it('a Read of other lines of the file leaves the cite seen, not read', () => {
    analyse({ plan: '`src/a.ts:100`\n', calls: [read('src/a.ts', { offset: 1, limit: 20 })] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:100'), 'seen');
    });
  });

  it('a cite of a file only grepped is seen, not read', () => {
    analyse({ plan: '`src/a.ts:5`\n', calls: [grep('needle', `${ROOT}/src/a.ts\n`)] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:5'), 'seen');
    });
  });

  it('a cite of a file that a Bash command or its output names is seen', () => {
    analyse({ plan: '`src/a.ts:5`, `src/b.ts:6`\n', calls: [bash('wc -l src/a.ts'), bash('git ls-files', 'src/b.ts\nsrc/c.ts')] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:5'), 'seen');
      assert.equal(stateOf(result, 'src/b.ts:6'), 'seen');
    });
  });

  it('a file named by a path from the directory a command ran in is seen', () => {
    analyse({ plan: '`main/models/a.ts:5`\n', calls: [bash(`cd ${ROOT}/main && grep -n needle models/a.ts`)] }, (result) => {
      assert.equal(stateOf(result, 'main/models/a.ts:5'), 'seen');
    });
  });

  it('a file that was never touched is unseen, and a longer file name that starts alike does not stand for it', () => {
    analyse({ plan: '`src/a.ts:5`\n', calls: [read('src/other.ts'), bash('git ls-files', 'lib/src/a.tsx\nsrc/a.ts.bak')] }, (result) => {
      assert.equal(stateOf(result, 'src/a.ts:5'), 'unseen');
    });
  });

  it('a cite under an Iteration heading is an edit anchor; one elsewhere is not', () => {
    const plan = '## Findings\nThe flag is read at `src/a.ts:5`.\n\n## Iteration 1\nAdd the guard at `src/b.ts:7`.\n';
    analyse({ plan }, (result) => {
      assert.deepEqual(result.cites.map((cite) => [cite.file, cite.edit]), [['src/a.ts', false], ['src/b.ts', true]]);
      assert.match(tableRow(result), /\| 0\/0\/2 \(1\) \|/);
    });
  });

  it('a bare backticked `:from-to` is a cite of the file named before it on the line', () => {
    analyse({ plan: 'See `src/a.ts:5` and `:40-45`.\n', calls: [read('src/a.ts', { offset: 40, limit: 6 })] }, (result) => {
      assert.deepEqual(result.cites.map((cite) => [cite.file, cite.from, cite.to, cite.state]), [['src/a.ts', 5, 5, 'seen'], ['src/a.ts', 40, 45, 'read']]);
    });
  });

  it('a cite inside a fenced example is not a cite', () => {
    analyse({ plan: '```\n`src/a.ts:5`\n```\n' }, (result) => assert.deepEqual(result.cites, []));
  });
});

describe('requirements: the plan and the ticket, both ways', () => {
  const ticket = 'First point of the ticket.\nSecond point of the ticket.\nThird point of the ticket.';

  it('reports a ticket point that no plan quote covers', () => {
    analyse({ ticket, plan: '## Requirements\n- "First point of the ticket"\n- "Second point of the ticket"\n' }, (result) => {
      assert.deepEqual(result.requirements.uncovered, ['Third point of the ticket.']);
    });
  });

  it('reports a plan quote that is not in the ticket', () => {
    analyse({ ticket, plan: '## Requirements\n- "First point of the ticket"\n- "A point nobody wrote"\n' }, (result) => {
      assert.deepEqual(result.requirements.planMissing, [{ line: 3, quotes: ['A point nobody wrote'] }]);
    });
  });

  it('a quote with an ellipsis matches the ticket around it', () => {
    analyse({ ticket, plan: '## Requirements\n- "... Second point of ... ticket"\n' }, (result) => {
      assert.deepEqual(result.requirements.planMissing, []);
      assert.equal(result.requirements.uncovered.includes('Second point of the ticket.'), false);
    });
  });

  it('a bullet quoting two ticket points is merged', () => {
    analyse({ ticket, plan: '## Requirements\n- "First point" and "Third point"\n- "Second point"\n' }, (result) => {
      assert.deepEqual(result.requirements.merged, [{ line: 2, points: ['First point of the ticket.', 'Third point of the ticket.'] }]);
    });
  });

  it('shows the claims figure of the last plan-claims row of the ledger, n/a when the run has none', () => {
    const plan = '## Requirements\n- "First point"\n';
    analyse({ ticket, plan, planClaims: [{ claims: 5, unbacked: 4, uncitedMap: 9 }, { claims: 3, unbacked: 1, uncitedMap: 18 }] }, (result) => {
      assert.deepEqual(result.claims, { claims: 3, unbacked: 1, uncitedMap: 18 });
      assert.equal(tableRow(result).split(' | ')[4], '1/3, uncited 18');
    });
    analyse({ ticket, plan, planClaims: [{ claims: 3, unbacked: 1, uncitedMap: null }] }, (result) => assert.equal(tableRow(result).split(' | ')[4], '1/3, uncited n/a'));
    analyse({ ticket, plan }, (result) => assert.equal(result.claims, null));
  });
});

describe('search hit files never read', () => {
  const hitsUnread = (spec) => analyse({ plan: 'x\n', ...spec }, (result) => result.unreadHits);

  it('counts the files a Grep (content or file list) and a Bash grep or rg printed that no Read opened and no cat or sed -n named', () => {
    const calls = [
      { name: 'Grep', input: { pattern: 'openWizard', output_mode: 'content', '-n': true }, result: `${ROOT}/src/a.ts:12:openWizard()\nsrc/b.ts:3:openWizard()\nsrc/b.ts-4-context` },
      { name: 'Grep', input: { pattern: 'openWizard' }, result: `Found 3 files\n${ROOT}/src/c.ts\nsrc/d.ts\nsrc/e.ts` },
      bash('rg -n submit src', 'src/f.ts:9:submit()\nsrc/g.ts:1:submit()'),
      bash('grep -rn submit src | head', './src/h.ts:2:submit'),
      bash('ls src', 'src/z.ts:1:not a search'),
      read('src/a.ts'),
      bash('cat src/c.ts'),
      bash("sed -n '1,40p' src/f.ts"),
    ];
    assert.deepEqual(hitsUnread({ calls }), ['src/b.ts', 'src/d.ts', 'src/e.ts', 'src/g.ts', 'src/h.ts']);
  });

  it('a hit after the last plan write does not count; the count is the last table cell and the files are listed under --items', () => {
    const late = [{ name: 'Grep', input: { pattern: 'x', output_mode: 'content' }, result: 'src/late.ts:1:x' }];
    assert.deepEqual(hitsUnread({ after: late }), []);
    analyse({ plan: 'x\n', calls: [{ name: 'Grep', input: { pattern: 'x' }, result: 'Found 1 file\nsrc/a.ts' }] }, (result) => {
      assert.equal(tableRow(result).split(' | ').at(-1), '1 |');
      assert.match(formatItems(result), /search hit files never read \(1\)\n {2}- src\/a\.ts/);
    });
  });
});

describe('delivered map rows and listed docs', () => {
  const draft = '{"candidates":[["src/opened.ts",3],["src/listed.ts",2],["src/never.ts",1]]}\nDocumentation files (path, bytes): docs/guide.md 120, docs/other.md 80\n';
  const model = { plan: 'x', delivered: [draft], calls: [read('src/opened.ts', { offset: 50, limit: 10 }), bash('ls src', 'listed.ts\nsrc/listed.ts'), read('docs/guide.md')] };

  it('a row the model never opened or named is unseen; one it read is not', () => {
    analyse(model, (result) => assert.deepEqual(result.rows, { total: 3, unseen: ['src/never.ts'] }));
  });

  it('a listed doc is unseen unless the model read it or a command named it', () => {
    analyse(model, (result) => assert.deepEqual(result.docs, { total: 2, unseen: ['docs/other.md'] }));
  });

  it('rows delivered as a route command\'s output are found, and that output does not count as the model seeing them', () => {
    analyse({ plan: 'x', calls: [bash('node scripts/ambicode.mjs route next', draft)] }, (result) => {
      assert.equal(result.rows.total, 3);
      assert.equal(result.rows.unseen.length, 3);
    });
  });
});

describe('absence claims', () => {
  it('lists the plan sentences that state an absence, and no others', () => {
    const plan = 'The parser reads the flag. Nothing else calls the helper. It does not exist in the old module.\n\nThe cache is warm.\n';
    analyse({ plan }, (result) => assert.deepEqual(result.absence.map((claim) => claim.text), ['Nothing else calls the helper.', 'It does not exist in the old module.']));
  });

  it('leaves out fenced examples and the Requirements section, which quotes the ticket', () => {
    const plan = '```\nthere is no caller\n```\n## Requirements\n- "no caller exists"\n';
    analyse({ plan }, (result) => assert.deepEqual(result.absence, []));
  });
});

describe('inputs without the usual structure', () => {
  it('a ticket of one sentence is one point, covered or uncovered like any other', () => {
    const ticket = 'Users cannot reset their password.';
    analyse({ ticket, plan: '## Requirements\n- "cannot reset their password"\n' }, (result) => assert.deepEqual(result.requirements.uncovered, []));
    analyse({ ticket, plan: '## Requirements\n- "something else"\n' }, (result) => assert.deepEqual(result.requirements.uncovered, [ticket]));
  });

  it('a short one-point ticket is not dismissed as metadata', () => {
    analyse({ ticket: 'Fix login', plan: '## Requirements\n- "other"\n' }, (result) => assert.deepEqual(result.requirements.uncovered, ['Fix login']));
  });

  it('a plan with no Requirements section says so, and the whole ticket is uncovered', () => {
    analyse({ ticket: 'One thing to do.\nAnother thing to do.', plan: 'Just a note.\n' }, (result) => {
      assert.equal(result.requirements.status, 'no Requirements section');
      assert.equal(result.requirements.uncovered.length, 2);
      assert.match(tableRow(result), /\| no Requirements section \| n\/a \| 2 \| n\/a \|/);
    });
  });

  it('a Requirements section with no bullets says so', () => {
    analyse({ ticket: 'One thing to do.', plan: '## Requirements\nNothing yet.\n' }, (result) => assert.equal(result.requirements.status, 'no entries under Requirements'));
  });

  it('a plan with no Iteration heading has no edit anchors', () => {
    analyse({ plan: 'Change `src/a.ts:5` and `src/b.ts:6`.\n' }, (result) => assert.deepEqual(result.cites.map((cite) => cite.edit), [false, false]));
  });

  it('a plan with no cites reports 0 cites and still fills the other columns', () => {
    analyse({ ticket: 'One thing to do.', plan: 'Free text. Nothing else uses it.\n' }, (result) => {
      assert.match(tableRow(result), /\| 0 \| 0\/0\/0 \(0\) \| no Requirements section \| n\/a \| 1 \| n\/a \| 0\/0 \| 0\/0 \| 1 \| 0 \|$/);
    });
  });

  it('a missing or empty ticket capture says "no ticket captured" in the columns it empties', () => {
    for (const ticket of [null, '', '  \n']) {
      analyse({ ticket, plan: '## Requirements\n- "First point"\n' }, (result) => {
        assert.equal(result.requirements.status, 'no ticket captured');
        assert.match(tableRow(result), /\| no ticket captured \| n\/a \| no ticket captured \| no ticket captured \|/);
      });
    }
  });
});

describe('the ticket of a run without captures', () => {
  const plan = '## Requirements\n- "zero or negative cents"\n';

  it('is the text the route was started with, when no capture exists', () => {
    analyse({ ticket: null, routeText: 'Refuse a payment of zero or negative cents.', plan }, (result) => {
      assert.equal(result.requirements.status, null);
      assert.deepEqual(result.requirements.uncovered, []);
    });
  });

  it('is the capture, not the route text, when both exist', () => {
    analyse({ ticket: 'Something captured.', routeText: 'Refuse a payment of zero or negative cents.', plan }, (result) => {
      assert.deepEqual(result.requirements.planMissing, [{ line: 2, quotes: ['zero or negative cents'] }]);
    });
  });
});

describe('end to end', () => {
  it('a ticket of three messages and a plan of two bullets: one message dropped, one bullet merges two', () => {
    const ticket = 'The export button stays disabled while a save is running.\nShow an error when the export request fails.\nKeep the file name the user typed.';
    const plan = [
      '## Requirements',
      '- "export button stays disabled" and "an error when the export request fails"',
      '- "disabled while a save is running"',
      '',
      '## Findings',
      'The button state is set at `src/export.ts:10-20` and saved by `src/save.ts:5`. Nothing else calls the old exporter.',
      '',
      '## Iteration 1',
      'Add the guard at `src/new.ts:1`.',
      '',
    ].join('\n');
    const calls = [read('src/export.ts', { offset: 1, limit: 40 }), grep('save', `${ROOT}/src/save.ts`)];
    analyse({ ticket, plan, calls }, (result) => {
      assert.deepEqual(result.requirements.uncovered, ['Keep the file name the user typed.']);
      assert.deepEqual(result.requirements.merged.map((item) => item.line), [2]);
      assert.deepEqual(result.cites.map((cite) => cite.state), ['read', 'seen', 'unseen']);
      assert.equal(tableRow(result), '| stamp/case-1 | 3 | 1/1/1 (0) | 0 | n/a | 1 | 1 | 0/0 | 0/0 | 1 | 1 |');
      assert.match(formatItems(result), /ticket points no plan quote covers \(1\)\n {2}- Keep the file name/);
    });
  });

  it('a one-sentence prose ticket and a free-form plan are reported, not crashed on', () => {
    const plan = 'Plan: add a reset link to the settings page. Nothing else calls the old flow.\n';
    analyse({ ticket: 'Users cannot reset their password from the settings page.', plan, calls: [bash('ls')] }, (result) => {
      assert.equal(tableRow(result), '| stamp/case-1 | 0 | 0/0/0 (0) | no Requirements section | n/a | 1 | n/a | 0/0 | 0/0 | 1 | 0 |');
      assert.match(formatItems(result), /requirements check \(1\)\n {2}- no Requirements section/);
    });
  });
});

describe('command line', () => {
  it('prints the table for a stamp directory, and the items with --items', () => {
    const run = archive({ plan: '## Requirements\n- "ticket"\n`src/a.ts:1`\n', calls: [read('src/a.ts')] });
    try {
      const table = spawnSync(process.execPath, [SCRIPT, path.join(run.dir, 'stamp')], { encoding: 'utf8' });
      assert.equal(table.status, 0);
      assert.match(table.stdout, /^\| run \| cites \|/);
      assert.match(table.stdout, /\| stamp\/case-1 \| 1 \| 1\/0\/0 \(0\) \| 0 \|/);
      const items = spawnSync(process.execPath, [SCRIPT, path.join(run.dir, 'stamp', 'case-1'), '--items'], { encoding: 'utf8' });
      assert.match(items.stdout, /### stamp\/case-1/);
      const json = spawnSync(process.execPath, [SCRIPT, path.join(run.dir, 'stamp'), '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(json.stdout)[0].cites[0].state, 'read');
    } finally { run.remove(); }
  });

  it('fails with exit 1 and a message on stderr for a path that holds no run', () => {
    const run = archive({ plan: 'x' });
    try {
      const bad = spawnSync(process.execPath, [SCRIPT, path.join(run.dir, 'missing')], { encoding: 'utf8' });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /plan-l0: no run at/);
    } finally { run.remove(); }
  });

  it('shows a run without a plan write as an error row and goes on with the others', () => {
    const run = archive({ plan: 'x' });
    try {
      writeFileSync(path.join(`${run.base}.transcript`, 's.jsonl'), '');
      const result = spawnSync(process.execPath, [SCRIPT, run.base], { encoding: 'utf8' });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /\| stamp\/case-1 \| no transcript with a plan write/);
    } finally { run.remove(); }
  });
});
