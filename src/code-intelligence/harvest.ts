import path from 'node:path';
import { ecosystemFacts } from '../config/ecosystems.ts';
import { MAX_SNAPSHOT_FILE_BYTES } from '../config/defaults.ts';
import type { Ecosystem } from '../contracts/primitives.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { COMMON_NAMES } from './dependents.ts';

export interface Declaration {
  name: string;
  kind: string;
  path: string;
  line: number;
  /** Files, among those harvested, that declare this name. */
  declarations: number;
}

const MIN_NAME = 3;
const KINDS = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'const', 'let', 'var', 'def', 'fn', 'func'];

function kindOf(line: string): string {
  const keyword = KINDS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(line));
  return keyword === 'def' || keyword === 'fn' || keyword === 'func' ? 'function' : (keyword ?? 'member');
}

/**
 * Every declaration the ecosystem's patterns find, all matches on all lines. A TypeScript line must be an export to
 * count as reachable from another file. A name declared in more than one of the given files collides.
 */
export async function harvest(fs: FileSystem, root: string, files: readonly string[], ecosystem: Ecosystem | null): Promise<Declaration[]> {
  const facts = ecosystemFacts(ecosystem);
  const patterns = facts.declarationPatterns.map((pattern) => new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
  const found: Omit<Declaration, 'declarations'>[] = [];
  for (const file of files) {
    let text: string;
    try {
      const absolute = path.join(root, file);
      if ((await fs.stat(absolute)).size > MAX_SNAPSHOT_FILE_BYTES) continue;
      text = await fs.readText(absolute);
    } catch {
      continue;
    }
    const seen = new Set<string>();
    text.split(/\r?\n/).forEach((line, index) => {
      if (facts.exportFilter !== null && !facts.exportFilter.test(line)) return;
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const name = match[1];
          if (name === undefined || name.length < MIN_NAME || COMMON_NAMES.has(name)) continue;
          const key = `${name}:${index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ name, kind: kindOf(line), path: file, line: index + 1 });
        }
      }
    });
  }
  const filesPerName = new Map<string, Set<string>>();
  for (const declaration of found) filesPerName.set(declaration.name, (filesPerName.get(declaration.name) ?? new Set()).add(declaration.path));
  return found.map((declaration) => ({ ...declaration, declarations: filesPerName.get(declaration.name)!.size }));
}
