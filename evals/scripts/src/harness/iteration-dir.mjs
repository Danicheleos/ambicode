// Reserves an iteration folder for a suite run outside the harness and prints it: iteration-dir.mjs <type> <label>.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iterationDir } from './run-options.mjs';

export function reserveIteration(type, label, { now = new Date(), outputs } = {}) {
  if (!/^[a-z0-9-]+$/.test(type ?? '') || !/^[a-z0-9.+-]+$/.test(label ?? '')) throw new Error('usage: iteration-dir.mjs <type> <label>, both lowercase slugs');
  const dir = iterationDir({ type, now, label, ...(outputs ? { outputs } : {}) });
  mkdirSync(path.join(dir, 'results'), { recursive: true });
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(reserveIteration(process.argv[2], process.argv[3]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
