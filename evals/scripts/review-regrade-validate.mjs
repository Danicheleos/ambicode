// Checks the matcher against hand-labelled findings before it grades anything: node evals/scripts/review-regrade-validate.mjs [--votes 5] [--budget 3] [--out file]
// Findings of one case go in one call, as in a real review, so a probe sees neighbours of its own kind.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REVIEW_TRUTHS } from './review-cases.mjs';
import { VOTES, budgeted, claudeRunner, fixtureDiff, matchFindings, MODEL, truthFor } from './review-regrade.mjs';
import { labelledSet } from './review-regrade-labels.mjs';

/** `{agreement, total, misses}`: a finding agrees when its credited issue (or none) is one the label accepts. */
export function validate({ labels, run, votes = VOTES, diffOf = fixtureDiff, truthOf = truthFor }) {
  const byCase = Map.groupBy(labels, (label) => label.case);
  const results = [];
  for (const [name, items] of byCase) {
    const { matched } = matchFindings({ diff: diffOf(name), issues: truthOf(name), findings: items.map((i) => i.text), run, votes });
    items.forEach((item, i) => {
      const got = matched[i].issue.length === 0 ? null : matched[i].issue.join('+');
      results.push({ ...item, got, ok: item.accept.includes(got), reasons: matched[i].reasons, tie: matched[i].tie });
    });
  }
  return { total: results.length, agreement: results.filter((r) => r.ok).length / results.length, misses: results.filter((r) => !r.ok), results };
}

function main(argv) {
  const opts = { votes: VOTES, budget: 3, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--votes') opts.votes = Number(argv[++i]);
    else if (argv[i] === '--budget') opts.budget = Number(argv[++i]);
    else if (argv[i] === '--out') opts.out = argv[++i];
  }
  const run = budgeted(claudeRunner(), opts.budget);
  const truths = REVIEW_TRUTHS.filter((t) => !t.control).map((t) => [t.name, truthFor(t.name)]);
  const result = validate({ labels: labelledSet(truths), run, votes: opts.votes });
  console.log(`model ${MODEL}  labelled ${result.total}  agreement ${(result.agreement * 100).toFixed(1)}%  calls ${run.cost.calls}  cost $${run.cost.usd.toFixed(3)}`);
  for (const miss of result.misses) {
    console.log(`\nMISS ${miss.case}\n  text: ${miss.text}\n  accepted: ${JSON.stringify(miss.accept)}  got: ${miss.got}${miss.tie ? ' (tie)' : ''}`);
    for (const r of miss.reasons) console.log(`  - ${JSON.stringify(r.issue)} ${r.outside ?? ''}: ${r.reason}`);
  }
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify({ model: MODEL, cost: run.cost, ...result }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
