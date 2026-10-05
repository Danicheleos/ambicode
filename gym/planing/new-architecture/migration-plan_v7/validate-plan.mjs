import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../..');
const markdown = (await readdir(directory)).filter(name => name.endsWith('.md')).sort();
assert.equal(markdown.length, 20);
const REWRITTEN = ['step-01-guard.md', 'step-02-evidence.md', 'step-03-route-engine-investigate.md', 'step-03b-decision-a-tuning.md', 'step-03c-search-profile.md', 'step-04-requirements.md', 'step-05-search.md', 'step-06-plan.md', 'step-07-task.md', 'step-08-review.md', 'step-09-init-rules.md', 'step-10-experiments.md'];
const SECTIONS = ['## Goal', '## Starting point', '## Files', '## Contract', '## Rules', '## Decided readings',
  '## Non-goals', '## Tests', '## Done when', '## Hand-off', '## Coverage of the v6 brief'];
for (const name of REWRITTEN) {
  const body = await readFile(path.join(directory, name), 'utf8');
  let at = -1;
  for (const heading of SECTIONS) {
    const next = body.indexOf(heading, at + 1);
    assert(next > at, `${name}: missing or out-of-order section ${heading}`);
    at = next;
  }
  const step = name.match(/^step-([0-9a-z]+)-/)[1];
  const rules = new Set([...body.matchAll(new RegExp(`\\b${step}-[A-Z]\\d+\\b`, 'g'))].map(m => m[0]));
  assert(rules.size > 0, `${name}: no numbered rules`);
}
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
    await stat(path.resolve(path.dirname(path.join(directory, name)), target));
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
for (let number = 149; number <= 161; number += 1) {
  assert(review.includes(`| #${number} `), `missing independent finding #${number}`);
}
const enginePlan = await readFile(path.join(directory, 'step-03-route-engine-investigate.md'), 'utf8');
const gateCommand = enginePlan.split('\n').find(line => line.startsWith('npm run evals:gate --'));
assert(gateCommand?.includes('eval-2026-10-04T19-44-56-791Z.json'), 'wrong working baseline');
assert(!gateCommand.includes('--accept-baseline-version'), 'obsolete version bypass');
assert(!gateCommand.includes('--kind'), 'unsupported gate kind flag');
assert(gateCommand.includes('$PRIMARY/'), 'baseline must resolve in primary checkout');
const harnessPlan = await readFile(path.join(directory, 'step-00-harness.md'), 'utf8');
for (const id of ['P-S', '0-S', 'P37', 'P58']) {
  assert(harnessPlan.includes(id), `missing harness prerequisite ${id}`);
}
const reviewPlan = await readFile(path.join(directory, 'step-08-review.md'), 'utf8');
const reviewPrompt = reviewPlan.match(/`\/ambicode:review[^`]+`/);
assert(reviewPrompt, 'missing review prompt');
assert(!reviewPrompt[0].includes('--branch'), 'review scaffold must target uncommitted changes');
const manifest = await readFile(path.join(directory, 'input-sha256.txt'), 'utf8');
let inputs = 0;
const drifted = [];
for (const line of manifest.trim().split('\n')) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  assert(match, 'bad manifest row');
  const contents = await readFile(path.join(repository, match[2])).catch(() => null);
  if (contents === null || createHash('sha256').update(contents).digest('hex') !== match[1]) drifted.push(match[2]);
  inputs += 1;
}
console.log(`markdown_files=${markdown.length}; rewritten_briefs=${REWRITTEN.length}; bytes=${bytes}; local_links=${links}`);
console.log(`scenarios=14; historical_findings=16; independent_findings=13; source_digests=${inputs}; drifted_since_handoff=${drifted.length}`);
for (const name of drifted) console.log(`drifted: ${name}`);
console.log('validation=document_structure_and_input_provenance; implementation_tests=0; model_calls=0');
