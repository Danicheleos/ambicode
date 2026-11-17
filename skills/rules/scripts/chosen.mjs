// The sources gate's default is "none — stop": nothing may be drafted from sources nobody chose.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DRAFTS, sourcesText } from './sources.mjs';

const input = JSON.parse(readFileSync(0, 'utf8'));
// `bound` is the route's latest bound answer per gate, computed by the engine (latestBound), not re-read from the ledger here.
const answer = input.bound?.sources;
if (answer === 'none — stop') {
  process.stdout.write(JSON.stringify({ failed: { code: 'rules-no-sources', message: 'No rule source was chosen.' } }));
} else {
  const root = input.repositoryRoot;
  // "use these sources" is the found list; any other answer is the user's own words and reads only what they name.
  const listed = answer === 'use these sources';
  const texts = [input.args?.text ?? '', listed ? '' : (answer ?? '')];
  const drafted = (() => { try { return readdirSync(path.join(root, DRAFTS)).filter((name) => name.endsWith('.yaml')).sort(); } catch { return []; } })();
  const payload = [
    ...sourcesText(root, texts, input.autoLoadedPatterns, listed),
    ...(drafted.length === 0 ? [] : [`Drafts already in ${DRAFTS}/ (written by init): ${drafted.join(', ')}. Keep them, check them, add to them; do not rewrite them from other sources.`]),
  ].join('\n');
  process.stdout.write(JSON.stringify({ payload }));
}
