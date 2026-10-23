// Candidate rule files for /ambicode:rules: paths only, the model reads them.
import { readFileSync } from 'node:fs';
import { sourcesText } from './sources.mjs';

const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({ payload: sourcesText(input.repositoryRoot, [input.args?.text ?? '']).join('\n') }));
