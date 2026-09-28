#!/usr/bin/env node
/**
 * `eol=lf` in .gitattributes does not renormalize files already committed as CRLF.
 * Asserts on the index form (`i/`), which every platform checks out from; the
 * working tree may differ where .gitattributes says so (bin/ambicode.cmd is CRLF).
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
