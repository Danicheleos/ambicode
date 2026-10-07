import type { InitProposal, SetPair } from '#types/modules/config';
import { parseSet } from './init-sets.ts';

/** The options the init gate declares; any other answer is one of the printed choices. */
export const INIT_ANSWERS: readonly string[] = ['Apply as proposed', 'Apply as adjusted', 'Adjust', 'Cancel'];

const SLOTS = ['lint', 'unit', 'e2e', 'format'] as const;
const MCP = /^MCP server: (.+)$/;
const RUNNER = /^Runner: (\S+) (lint|unit|e2e|format) (keep|skip)$/;
const INDEX = /^Index: (none|codeindex)$/;

/** One printed choice as the config slot it sets; `keep` puts the detected value back. */
export function choiceOf(answer: string): { key: string; value: SetPair['value'] | 'keep' } | null {
  const text = answer.trim();
  const server = MCP.exec(text)?.[1];
  if (server !== undefined) return { key: 'requirements.mcpServer', value: server.trim() === 'none' ? null : server.trim() };
  const runner = RUNNER.exec(text);
  if (runner !== null) return { key: `projects.${runner[1]}.commands.${runner[2]}`, value: runner[3] === 'keep' ? 'keep' : null };
  const index = INDEX.exec(text)?.[1];
  return index === undefined ? null : { key: 'search.index', value: index };
}

/** The overrides the answers of one gate put in force, later choices winning; an answer that is no printed choice is returned as not understood. */
export function choicesInForce(answers: readonly string[], projects: readonly string[] | null): { pairs: SetPair[]; notUnderstood: string[] } {
  const merged = new Map<string, SetPair>();
  const notUnderstood: string[] = [];
  for (const answer of answers) {
    const choice = choiceOf(answer);
    const project = choice === null ? null : /^projects\.([^.]+)\./.exec(choice.key)?.[1];
    if (choice === null || (project !== undefined && project !== null && projects !== null && !projects.includes(project))) {
      notUnderstood.push(answer);
      continue;
    }
    if (choice.value === 'keep') merged.delete(choice.key);
    else merged.set(choice.key, parseSet(`${choice.key}=${JSON.stringify(choice.value)}`));
  }
  return { pairs: [...merged.values()], notUnderstood };
}

/** The separate groups of choices a proposal offers, as the exact answers the user picks from. */
export function choiceGroups(proposal: InitProposal | null, pairs: readonly SetPair[]): { title: string; choices: string[] }[] {
  const inForce = new Set(pairs.map((pair) => pair.key));
  const groups = [
    { title: 'MCP server', choices: ['MCP server: none', 'MCP server: <name of the Jira or Confluence server you can see>'] },
    { title: 'Runner', choices: [] as string[] },
    { title: 'Search index', choices: ['Index: codeindex', 'Index: none'] },
  ];
  for (const project of proposal?.projects ?? []) {
    for (const slot of SLOTS) {
      const detected = slot === 'format' ? project.format : project.commands[slot];
      const key = `projects.${project.id}.commands.${slot}`;
      if (inForce.has(key)) groups[1]!.choices.push(`Runner: ${project.id} ${slot} keep`);
      else if (detected !== null && detected !== undefined) groups[1]!.choices.push(`Runner: ${project.id} ${slot} skip`);
    }
  }
  return groups.filter((group) => group.choices.length > 0);
}

/** A line diff of two texts: `-`/`+` lines, unchanged runs elided. */
export function lineDiff(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; } else if (table[i + 1]![j]! >= table[i]![j + 1]!) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return out;
}
