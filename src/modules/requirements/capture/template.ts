import { canonicalUrl } from '../envelope/normalize.ts';

/** A source string by what it names; only `rules` still asks whether a URL is a Confluence page. */
export function classifySource(source: string): { kind: 'confluence' | 'other' } {
  const url = canonicalUrl(source.trim());
  return { kind: /\/wiki\/|confluence/i.test(url) && /\/pages\/\d+|\/\d{5,}(?:\/|$)/.test(url) ? 'confluence' : 'other' };
}

/** The one sentence the model needs; it holds the MCP tool names, so no per-server call list is built. */
export function requirementsTemplate(input: { sources: readonly string[]; task: string; runner?: string; mcpServer?: unknown; acceptanceField?: unknown; observedTools?: unknown }): { text: string } {
  return { text: `Fetch each asked URL (${input.sources.join(', ')}) with your Jira or Confluence MCP tools, then run \`${input.runner ?? 'ambicode'} route next --task ${input.task}\`.` };
}
