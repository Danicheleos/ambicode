import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withCasesLock } from './cases-lock.mjs';

// Per-arm prompt transport. `claude plugin eval` 2.1.289 serves one prompt per case to both arms: its case
// schema (read from the binary, not from a run) has `execution.prompt` and prompt.md's body, no per-arm key.
// So a plugin-only run swaps prompt.with.md into prompt.md and restores the byte copy prompt.naked.md after.
export const PROMPT = 'prompt.md';
export const WITH_PROMPT = 'prompt.with.md';
export const NAKED_COPY = 'prompt.naked.md';
/** In a cases directory: the cases whose prompt.md currently holds the plugin prompt. */
export const SWAP_MARKER = '.prompt-swap.json';
/** In a cases directory: written before generation removes anything, removed when it has written everything. */
export const GENERATION_MARKER = '.generation-incomplete';
export const INVESTIGATE_COMMAND = '/ambicode:investigate --headless';
export const TASK_COMMAND = '/ambicode:task --headless --answer review-offer=run';

export const FRONT_MATTER = /^---\n[\s\S]*?\n---\n?/;
/** What the harness records as a case's `promptMarkdown`: the body after the front matter, trimmed. */
export const promptBody = (source) => source.replace(FRONT_MATTER, '').trim();

/** The plugin arm's prompt: `command` typed before the first body line; front matter and every other byte kept. */
export function pluginPrompt(source, command) {
  if (!/^\/ambicode:[a-z-]+( |$)/.test(command)) throw new Error(`a plugin prompt types an /ambicode: command, not ${JSON.stringify(command)}`);
  const head = FRONT_MATTER.exec(source)?.[0] ?? '';
  const lines = source.slice(head.length).split('\n');
  const first = lines.findIndex((line) => line.trim());
  if (first < 0) throw new Error('the prompt has no body line to type the command into');
  lines[first] = `${command} ${lines[first]}`;
  return head + lines.join('\n');
}

/** Replaces `file` whole: a reader sees the old bytes or the new ones. */
export const atomicWrite = (file, data, options) => {
  writeFileSync(`${file}.tmp`, data, options);
  renameSync(`${file}.tmp`, file);
};

/** Writes a case's plugin-arm prompt and the naked copy it is restored from. Steps 07/08 call it for task and review cases. */
export function writePluginPrompt(caseDir, command) {
  if (existsSync(path.join(path.dirname(caseDir), SWAP_MARKER))) throw new Error(`a plugin-prompt swap is outstanding in ${path.dirname(caseDir)}: prompt.md may not be the naked prompt; run restore-prompts first`);
  const naked = readFileSync(path.join(caseDir, PROMPT));
  writeFileSync(path.join(caseDir, NAKED_COPY), naked);
  writeFileSync(path.join(caseDir, WITH_PROMPT), pluginPrompt(naked.toString('utf8'), command));
}

const readMarker = (casesDir) => {
  const file = path.join(casesDir, SWAP_MARKER);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};
export const outstandingSwap = readMarker;

/** Puts each named case's plugin prompt in prompt.md. The marker is on disk before the first byte changes. */
export function swapInPluginPrompts(casesDir, names, { lock = null } = {}) {
  return withCasesLock(casesDir, 'prompt swap', () => swapLocked(casesDir, names), lock);
}

function swapLocked(casesDir, names) {
  if (readMarker(casesDir)) throw new Error(`a plugin-prompt swap is already outstanding in ${casesDir}: restore it first`);
  for (const name of names) {
    const dir = path.join(casesDir, name);
    for (const file of [WITH_PROMPT, NAKED_COPY]) if (!existsSync(path.join(dir, file))) throw new Error(`case ${name} has no ${file}: regenerate the cases`);
    if (!readFileSync(path.join(dir, PROMPT)).equals(readFileSync(path.join(dir, NAKED_COPY))))
      throw new Error(`case ${name}: prompt.md differs from its naked copy, so restoring it would lose an edit; regenerate the cases`);
  }
  atomicWrite(path.join(casesDir, SWAP_MARKER), `${JSON.stringify({ cases: names, pid: process.pid, at: new Date().toISOString() })}\n`);
  for (const name of names) atomicWrite(path.join(casesDir, name, PROMPT), readFileSync(path.join(casesDir, name, WITH_PROMPT)));
}

/** Puts back every naked prompt an outstanding swap names, then removes the marker. Safe to repeat. Returns how many. */
export function restorePrompts(casesDir, { lock = null } = {}) {
  return withCasesLock(
    casesDir,
    'restore-prompts',
    () => {
      const marker = readMarker(casesDir);
      if (!marker) return 0;
      // A case the swap never reached already holds its naked bytes and is left untouched.
      for (const name of marker.cases) {
        const naked = readFileSync(path.join(casesDir, name, NAKED_COPY));
        if (!readFileSync(path.join(casesDir, name, PROMPT)).equals(naked)) atomicWrite(path.join(casesDir, name, PROMPT), naked);
      }
      rmSync(path.join(casesDir, SWAP_MARKER));
      return marker.cases.length;
    },
    lock,
  );
}
