// Accepted rate per repository from the review page's selection rows (`.ambicode/metrics.jsonl`).
// Offline and free; prints counts only, no finding text, rule or path.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const METRICS = path.join('.ambicode', 'metrics.jsonl');

/** Counts of one metrics file's rows; a line that is not a selection row is counted as unparsable, never used. */
export function selectionTotals(text) {
  const totals = { rows: 0, offered: 0, selected: 0, posted: 0, unparsable: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      totals.unparsable++;
      continue;
    }
    if (row === null || typeof row !== 'object' || !['offered', 'selected', 'posted'].every((field) => typeof row[field] === 'boolean')) {
      totals.unparsable++;
      continue;
    }
    totals.rows++;
    if (row.offered) totals.offered++;
    if (row.selected) totals.selected++;
    if (row.posted) totals.posted++;
  }
  return totals;
}

export const acceptedRate = ({ offered, posted }) => (offered === 0 ? 'n/a' : (posted / offered).toFixed(3));

/** One line per repository; a repository without a metrics file says so. */
export function selectionReport(repos, { read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null) } = {}) {
  return repos.map((repo) => {
    const text = read(path.join(repo, METRICS));
    if (text === null) return `${repo}: no ${METRICS}`;
    const totals = selectionTotals(text);
    const skipped = totals.unparsable === 0 ? '' : `, ${totals.unparsable} unparsable line(s) skipped`;
    return `${repo}: offered ${totals.offered}, selected ${totals.selected}, posted ${totals.posted}, accepted rate ${acceptedRate(totals)}${skipped}`;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repos = process.argv.slice(2);
  if (repos.length === 0) {
    console.error('usage: node selection-metrics.mjs <repo>…');
    process.exit(2);
  }
  for (const line of selectionReport(repos)) console.log(line);
}
