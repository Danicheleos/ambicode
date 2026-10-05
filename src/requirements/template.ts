import { canonicalUrl } from './normalize.ts';

const MAX_BYTES = 1536;
const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const FIELDS = 'summary,description,issuetype,parent,issuelinks';

function callsFor(source: string): string[] {
  const text = source.trim();
  if (/\/wiki\/|\/pages\/|confluence/i.test(text)) return [`Confluence page ${canonicalUrl(text)}: read the page in full; list its child pages.`];
  const key = KEY.exec(text)?.[0];
  if (key === undefined) return [`${text}: fetch it with the server's read tool.`];
  return [`${key}: getJiraIssue ${key} fields=${FIELDS}`, `${key} children: searchJiraIssuesUsingJql "parent = ${key}" fields=key,summary`];
}

/**
 * The calls that retrieve each asked source, in one message of at most 1,536 bytes (03-Q2). The cap on child reads
 * comes before any child read, so a wide epic stops at a gate instead of consuming the budget.
 */
export function requirementsTemplate(input: { sources: readonly string[]; task: string; mcpServer: string | null; runner?: string }): { text: string; bytes: number } {
  const runner = input.runner ?? 'ambicode';
  const next = `${runner} route next --task ${input.task}`;
  const binding = input.mcpServer === null
    ? 'No server configured: tell the user to pin `requirements.mcpServer` in .ambicode/config.yaml, then continue without the requirement.'
    : `Use the ${input.mcpServer} MCP server.`;
  const lines = [
    binding,
    ...input.sources.flatMap(callsFor),
    `If the JQL returned more than 10 hits, stop here and run \`${next}\`; otherwise read each child with getJiraIssue and the same fields.`,
    `When done, run \`${next}\`.`,
  ];
  let text = lines.join('\n');
  while (Buffer.byteLength(text) > MAX_BYTES && lines.length > 4) {
    lines.splice(lines.length - 3, 1);
    text = lines.join('\n');
  }
  return { text, bytes: Buffer.byteLength(text) };
}
