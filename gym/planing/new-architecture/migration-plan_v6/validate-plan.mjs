import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../..');
const markdown = (await readdir(directory)).filter(name => name.endsWith('.md')).sort();
assert.equal(markdown.length, 16);
let links = 0;
let bytes = 0;
for (const name of markdown) {
  const body = await readFile(path.join(directory, name), 'utf8');
  bytes += Buffer.byteLength(body);
  assert(body.startsWith('# '), `${name}: missing title`);
  assert.equal((body.match(/^```/gm) ?? []).length % 2, 0, `${name}: unclosed fence`);
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|app:)/.test(target)) continue;
    await stat(path.resolve(directory, target));
    links += 1;
  }
  assert(!body.includes('../v5/'), `${name}: obsolete normative design reference`);
}
const scenarios = await readFile(path.join(directory, '02-scenarios.md'), 'utf8');
for (let number = 1; number <= 14; number += 1) {
  assert(scenarios.includes(`| S${number} |`), `missing scenario S${number}`);
}
const review = await readFile(path.join(directory, '03-review-resolution.md'), 'utf8');
for (let number = 116; number <= 131; number += 1) {
  assert(review.includes(`#${number} `), `missing old finding #${number}`);
}
const enginePlan = await readFile(path.join(directory, 'step-03-route-engine-investigate.md'), 'utf8');
const gateCommand = enginePlan.split('\n').find(line => line.startsWith('npm run evals:gate --'));
assert(gateCommand?.includes('eval-2026-10-04T19-44-56-791Z.json'), 'wrong working baseline');
assert(!gateCommand.includes('--accept-baseline-version'), 'obsolete version bypass');
const harnessPlan = await readFile(path.join(directory, 'step-00-harness.md'), 'utf8');
assert(harnessPlan.includes('The user declined the paid naked-vs-true-without equivalence test.'));
assert(harnessPlan.includes('Do not blanket-mark'));
assert(enginePlan.includes('Compute the\nnoise band from both compared arms'));
const manifest = await readFile(path.join(directory, 'input-sha256.txt'), 'utf8');
let inputs = 0;
for (const line of manifest.trim().split('\n')) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  assert(match, 'bad manifest row');
  const contents = await readFile(path.join(repository, match[2]));
  assert.equal(createHash('sha256').update(contents).digest('hex'), match[1], match[2]);
  inputs += 1;
}
console.log(`markdown_files=${markdown.length}; bytes=${bytes}; local_links=${links}`);
console.log(`scenarios=14; historical_findings=16; source_digests_verified=${inputs}`);
console.log('validation=document_structure_and_input_provenance; implementation_tests=0; model_calls=0');
