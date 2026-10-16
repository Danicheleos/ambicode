import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run by npm's `version` lifecycle: package.json is the canonical version, plugin.json follows it.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const file = path.join(ROOT, '.claude-plugin', 'plugin.json');
const text = await readFile(file, 'utf8');
await writeFile(file, text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`));
console.log(`plugin.json → ${version}`);
