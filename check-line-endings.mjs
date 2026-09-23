#!/usr/bin/env node
/**
 * Acceptance criterion 5 of R1, as a command: every text file git tracks must
 * be stored with LF.
 *
 * `.gitattributes` declares `* text=auto eol=lf`, but a declaration only takes
 * effect for files that were renormalized. A file committed as CRLF before the
 * rule existed keeps its CRLF in the index, and then a Windows checkout and a
 * Linux checkout disagree byte for byte — which is how four tests came to pass
 * on macOS and fail on Windows against the same commit.
 *
 * `git ls-files --eol` reports, per file, the index form (`i/`) and the
 * working-tree form (`w/`). This asserts on the index: that is what every
 * platform checks out from, and the working-tree form is allowed to differ
 * where `.gitattributes` says so (`bin/ambicode.cmd` is deliberately CRLF on
 * disk, because cmd.exe is unreliable with LF-only batch files).
 */
import { execFileSync } from 'node:child_process';

const OUTPUT = execFileSync('git', ['ls-files', '--eol', '-z'], { encoding: 'utf8' });

const offenders = [];
let checked = 0;

for (const row of OUTPUT.split('\0')) {
  if (row === '') continue;
  const tab = row.indexOf('\t');
  if (tab === -1) continue;
  const flags = row.slice(0, tab);
  const file = row.slice(tab + 1);
  const index = /i\/(\S+)/.exec(flags)?.[1];

  // `none` is a file with no line ending at all (a single line, unterminated);
  // `-text` is a file git treats as binary. Neither can be CRLF.
  if (index === undefined || index === 'none' || index === '-text') continue;
  checked += 1;
  if (index !== 'lf') offenders.push(`${file}: index is ${index}`);
}

if (offenders.length > 0) {
  console.error(`${offenders.length} tracked text file(s) are not stored with LF:\n`);
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error('\nFix with:  git add --renormalize . && git commit');
  process.exit(1);
}

console.log(`line endings OK: ${checked} tracked text file(s), all stored as LF`);
