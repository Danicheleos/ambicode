// Sets every configured check of every project in an AMBICODE config to null, so no check is runnable and the task route waits for none
// (src/skills/task/handlers.ts: "a repository may have none, and then no step waits for a check"). Used by eval scaffolds that must not
// build, test or lint. Usage: config-checks-off.mjs <.ambicode/config.yaml>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, stringify } from 'yaml';

/** The config text with each project's checks nulled and nothing else changed in meaning. */
export function checksOff(text) {
  const config = parse(text);
  for (const project of config.projects ?? []) for (const key of Object.keys(project.checks ?? {})) project.checks[key] = null;
  return stringify(config, { lineWidth: 0 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: config-checks-off.mjs <config.yaml>'); process.exit(2); }
  writeFileSync(file, checksOff(readFileSync(file, 'utf8')));
}
