const URL_PATTERN = /https?:\/\/\S+/i;
const BARE_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

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
  return config.mcpServer !== null && BARE_KEY.test(first);
}
