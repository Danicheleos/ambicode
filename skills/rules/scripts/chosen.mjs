// The sources gate's default is "none — stop": nothing may be drafted from sources nobody chose.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DRAFTS, sourcesText } from './sources.mjs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const ledger = path.join(input.taskDir, 'ledger.jsonl');
const answers = existsSync(ledger)
  ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter((entry) => entry.gate === 'sources' && ['acceptance', 'default-taken'].includes(entry.kind) && entry.unbound !== true)
  : [];
const answer = answers.at(-1)?.answer;
if (answer === 'none — stop') {
  process.stdout.write(JSON.stringify({ failed: { code: 'rules-no-sources', message: 'No rule source was chosen.' } }));
} else {
  const root = input.repositoryRoot;
  // "use these sources" is the found list; any other answer is the user's own words and reads only what they name.
  const listed = answer === 'use these sources';
  const texts = [input.args?.text ?? '', listed ? '' : (answer ?? '')];
  const drafted = (() => { try { return readdirSync(path.join(root, DRAFTS)).filter((name) => name.endsWith('.yaml')).sort(); } catch { return []; } })();
  const payload = [
    ...sourcesText(root, texts, listed),
    ...(drafted.length === 0 ? [] : [`Drafts already in ${DRAFTS}/ (written by init): ${drafted.join(', ')}. Keep them, check them, add to them; do not rewrite them from other sources.`]),
  ].join('\n');
  process.stdout.write(JSON.stringify({ payload }));
}
