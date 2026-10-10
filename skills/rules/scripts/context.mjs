// What rules already exist, so drafts do not repeat them: the config's projects and every pack id with its rule ids, read as text.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = input.repositoryRoot;
const plugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The sources gate's default is "none — stop": nothing may be drafted from sources nobody chose.
const answers = existsSync(path.join(input.taskDir, 'ledger.jsonl'))
  ? readFileSync(path.join(input.taskDir, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter((entry) => entry.gate === 'sources' && ['acceptance', 'default-taken'].includes(entry.kind) && entry.unbound !== true)
  : [];
if (answers.at(-1)?.answer === 'none — stop') {
  process.stdout.write(JSON.stringify({ failed: { code: 'rules-no-sources', message: 'No rule source was chosen.' } }));
  process.exit(0);
}

const read = (file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };
const packLine = (file) => {
  const text = read(file);
  const id = /^id:\s*(\S+)/m.exec(text)?.[1] ?? path.basename(file, '.yaml');
  return `  ${id}: ${[...text.matchAll(/^ {2}- id:\s*(\S+)/gm)].map((match) => match[1]).join(', ')}`;
};
const yamlIn = (dir) => { try { return readdirSync(dir).filter((name) => name.endsWith('.yaml')).sort().map((name) => path.join(dir, name)); } catch { return []; } };

const config = read(path.join(root, '.ambicode', 'config.yaml'));
const block = /^projects:[\s\S]*/m.exec(config)?.[0] ?? '';
const projects = [...block.matchAll(/\bid:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?[^\n]*?(?:\n\s+)?[^\n]*?\broot:\s*["']?([^\s,"'}]+)/g)].map((match) => `- ${match[1]} root=${match[2]}`);
const payload = [
  'Projects (pass --project <id> when there is more than one) and the rules already in force:',
  ...(projects.length === 0 ? ['- (read .ambicode/config.yaml)'] : projects),
  'built-in packs (pack: rule ids):',
  ...yamlIn(path.join(plugin, 'policies')).map(packLine),
  ...(yamlIn(path.join(root, '.ambicode', 'policies')).length === 0 ? [] : ['project packs:', ...yamlIn(path.join(root, '.ambicode', 'policies')).map(packLine)]),
].join('\n');
process.stdout.write(JSON.stringify({ payload }));
