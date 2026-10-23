import { findIssueKey, isIssueKey } from '#util/issue-key';
import type { LedgerEntry } from '#types/modules/evidence';

const URL_PATTERN = /https?:\/\/\S+/i;

const REQUIREMENT_SERVER = /jira|confluence|atlassian/i;

/** The first declared MCP server that serves tickets or pages; none means a bare key is not a requirement. */
export const requirementsServer = (mcps: readonly string[]): string | null => mcps.find((name) => REQUIREMENT_SERVER.test(name)) ?? null;

/**
 * Interactive: a URL in the text, any `--requirement`, or a bare key as the first word while a server is bound.
 * Headless: only an explicit `--requirement`. A key inside prose is never one (03-Q1).
 */
export function hasRequirement(
  args: { text: string; requirements: readonly string[]; headless: boolean },
  config: { mcpServer: string | null },
): boolean {
  if (args.requirements.length > 0) return true;
  if (args.headless) return false;
  if (URL_PATTERN.test(args.text)) return true;
  const first = args.text.trim().split(/\s+/)[0] ?? '';
  return config.mcpServer !== null && isIssueKey(first);
}

const LINK = /https?:\/\/[^\s)>\]"']+/g;
// A link names a requirement when it carries an issue key (/browse/VS-1) or is a wiki page; an image or a docs link in the description does not.
const REQUIREMENT_LINK = /\/wiki\/|\/confluence\//i;
// The user's cost bound: each candidate is one fetch call by the model, so two at most (the title's key and the description's first link or key).
const MR_REQUIREMENTS_MAX = 2;

/**
 * The requirement candidates a merge request names: the tracker links GitLab resolved, else the first issue key of its title and of its description, and the
 * description's issue or wiki links, at most MR_REQUIREMENTS_MAX of them. Key formats differ per project, so this is a fallback on the generic key shape, not a Jira rule. The free-text first-word rule does not apply here: a title is a name, not a request.
 */
export function requirementsIn(title: string, description: string, links: readonly string[] = []): string[] {
  // GitLab's own resolved tracker links come first; the key shape is the fallback for an instance that resolves none.
  if (links.length > 0) return links.slice(0, MR_REQUIREMENTS_MAX);
  const found = (description.match(LINK) ?? []).filter((link) => findIssueKey(link) !== null || REQUIREMENT_LINK.test(link));
  const keys = [findIssueKey(title), findIssueKey(description)].filter((key): key is string => key !== null && !found.some((link) => link.includes(key)));
  return [...new Set([...keys, ...found])].slice(0, MR_REQUIREMENTS_MAX);
}

/** What `review.mrFetch` recorded on its step: the candidates its merge request named, empty when it has not run or named none. */
export function mrRequirements(entries: readonly LedgerEntry[]): string[] {
  const done = entries.findLast((entry) => entry.kind === 'step' && entry['step'] === 'mr-fetch' && entry['status'] === 'completed');
  const named = done?.['requirements'];
  return Array.isArray(named) ? named.filter((item): item is string => typeof item === 'string') : [];
}
