import { openWorkspace } from '#modules/config/workspace';
import { harvest } from '#modules/search/harvest';
import { refs } from '#modules/search/refs';
import type { ProjectConfig } from '#types/modules/config';
import type { Runtime } from '#types/composition';
import type { Declaration } from '#types/modules/search';

// One common name's references fit whole in 1.5 KB; more names share it, cut.
export const CALLERS_MAX_BYTES = 1500;
export const CALLERS_MAX_NAMES = 4;

// Room for ' (+NNN more)' so the suffix never pushes a row past the cap.
const MORE_RESERVE = 12;

export interface ChangedFile { path: string; lines: number[] }
export interface ChangedName { name: string; path: string; line: number }

/** New-side lines each file's hunks add; a pure deletion counts as the line that now follows it. */
export function changedLines(patch: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const section of patch.split(/^(?=diff --git )/m)) {
    const target = section.split('\n').find((line) => line.startsWith('+++ '))?.slice(4).split('\t')[0] ?? '/dev/null';
    if (target === '/dev/null') continue;
    const lines: number[] = [];
    let n = 0;
    let started = false;
    let pendingDeletion = false;
    for (const row of section.split('\n')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
      if (hunk !== null) { n = Number(hunk[1]); started = true; pendingDeletion = false; continue; }
      if (!started) continue;
      if (row.startsWith('+')) { lines.push(n++); pendingDeletion = false; } else if (row.startsWith('-')) {
        if (!pendingDeletion) lines.push(n);
        pendingDeletion = true;
      } else if (row.startsWith(' ')) { n++; pendingDeletion = false; }
    }
    files.push({ path: target.replace(/^b\//, ''), lines });
  }
  return files;
}

/** For each changed line, the nearest declaration at or above it in the same file; first-seen order, one entry per name, capped. */
export function nearestNames(changed: readonly ChangedFile[], declared: ReadonlyMap<string, readonly Declaration[]>): ChangedName[] {
  const names: ChangedName[] = [];
  for (const file of changed) {
    const above = [...(declared.get(file.path) ?? [])].sort((a, b) => a.line - b.line);
    for (const line of file.lines) {
      const found = above.findLast((declaration) => declaration.line <= line);
      if (found === undefined || names.some((entry) => entry.name === found.name)) continue;
      names.push({ name: found.name, path: file.path, line: found.line });
      if (names.length === CALLERS_MAX_NAMES) return names;
    }
  }
  return names;
}

/** One `- name: path:line, ...` row per name with hits outside the changed lines, cut at the byte cap; empty when there are none. */
export function renderCallers(names: readonly ChangedName[], hits: ReadonlyMap<string, readonly string[]>): string {
  const rows: string[] = [];
  let size = 0;
  for (const { name } of names) {
    const list = hits.get(name) ?? [];
    if (list.length === 0) continue;
    const shown: string[] = [];
    for (const hit of list) {
      const next = `- ${name}: ${[...shown, hit].join(', ')}`;
      if (size + Buffer.byteLength(next) + 1 + MORE_RESERVE > CALLERS_MAX_BYTES) break;
      shown.push(hit);
    }
    if (shown.length === 0) break;
    const more = list.length - shown.length;
    const row = `- ${name}: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`;
    rows.push(row);
    size += Buffer.byteLength(row) + 1;
  }
  return rows.join('\n');
}

const HIT = /^ {2}(.+?):(\d+): /;

/** Where the declarations a patch changes are used outside the changed lines; the reviewer's own search would have to find them. */
export async function callersBlock(runtime: Runtime, input: { patch: string; project: ProjectConfig }): Promise<string> {
  const changed = changedLines(input.patch);
  const { git } = await openWorkspace(runtime);
  const declared = new Map<string, Declaration[]>();
  for (const file of changed) declared.set(file.path, await harvest(runtime.fs, git.options.repositoryRoot, [file.path]));
  const names = nearestNames(changed, declared);
  const skip = new Set<string>(changed.flatMap((file) => file.lines.map((line) => `${file.path}:${line}`)));
  for (const entry of names) skip.add(`${entry.path}:${entry.line}`);
  const hits = new Map<string, string[]>();
  for (const { name } of names) {
    const found = await refs(runtime, [name], { project: input.project });
    hits.set(name, found.text.split('\n').flatMap((row) => { const match = HIT.exec(row); return match === null || skip.has(`${match[1]}:${match[2]}`) ? [] : [`${match[1]}:${match[2]}`]; }));
  }
  return renderCallers(names, hits);
}
