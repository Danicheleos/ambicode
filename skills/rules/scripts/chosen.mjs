// The sources gate's default is "none — stop": nothing may be drafted from sources nobody chose.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const ledger = path.join(input.taskDir, 'ledger.jsonl');
const answers = existsSync(ledger)
  ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter((entry) => entry.gate === 'sources' && ['acceptance', 'default-taken'].includes(entry.kind) && entry.unbound !== true)
  : [];
process.stdout.write(JSON.stringify(answers.at(-1)?.answer === 'none — stop' ? { failed: { code: 'rules-no-sources', message: 'No rule source was chosen.' } } : {}));
