import { serverOf } from './binding.ts';
import { canonicalUrl } from '../envelope/normalize.ts';

const MAX_BYTES = 1536;
const FIELDS = ['summary', 'description', 'issuetype', 'parent', 'issuelinks'];

type AskedSource = { kind: 'jira'; key: string; url: string | null } | { kind: 'confluence'; id: string; url: string };
type OtherSource = { kind: 'other'; url: string };

/** The key a source is recorded and asked under: a Jira key, `page-<id>`, or the normalized URL. */
export function keyOfSource(source: string): string {
  const classified = classifySource(source);
  return classified.kind === 'jira' ? classified.key : classified.kind === 'confluence' ? `page-${classified.id}` : withoutFragment(classified.url);
}

function withoutFragment(url: string): string {
  const at = url.indexOf('#');
  return at === -1 ? url : url.slice(0, at);
}

/** A source string by what it names: a Jira key or `/browse/<KEY>` URL, a Confluence page URL, or any other address. */
export function classifySource(source: string): AskedSource | OtherSource {
  const text = source.trim();
  if (/^https?:\/\//i.test(text)) {
    const url = canonicalUrl(text);
    if (/\/wiki\/|confluence/i.test(url)) {
      const id = /\/pages\/(\d+)/.exec(url)?.[1] ?? /\/(\d{5,})(?:\/|$)/.exec(url)?.[1];
      if (id !== undefined) return { kind: 'confluence', id, url };
    }
    const key = /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(url)?.[1];
    return key === undefined ? { kind: 'other', url } : { kind: 'jira', key, url };
  }
  return /^[A-Z][A-Z0-9]+-\d+$/.test(text) ? { kind: 'jira', key: text, url: null } : { kind: 'other', url: text };
}

/** The field list of a Jira read, with the configured acceptance field when there is one (04-T5). */
export const jiraFields = (acceptanceField: string | null): string => (acceptanceField === null ? FIELDS : [...FIELDS, acceptanceField]).join(',');

/** The bound server's tool name when a capture showed it, else the bare name the note below explains. */
export function toolName(observedTools: readonly string[], server: string | null, name: 'getJiraIssue' | 'searchJiraIssuesUsingJql'): string {
  return server !== null && observedTools.includes(`mcp__${server}__${name}`) ? `mcp__${server}__${name}` : name;
}

/** The server the template names: the configured one, or the only one a capture of this task came from. */
const boundServer = (mcpServer: string | null, observedTools: readonly string[]): string | null => {
  if (mcpServer !== null) return mcpServer;
  const servers = [...new Set(observedTools.flatMap((tool) => serverOf(tool) ?? []))];
  return servers.length === 1 ? servers[0]! : null;
};

/**
 * The calls that retrieve each asked source, in one message of at most 1,536 bytes. The cap on child reads comes
 * before any child read, so a wide epic stops at a gate instead of consuming the budget.
 */
export function requirementsTemplate(input: {
  sources: readonly string[];
  task: string;
  mcpServer: string | null;
  acceptanceField: string | null;
  observedTools: readonly string[];
  runner?: string;
}): { text: string; bytes: number } {
  const next = `${input.runner ?? 'ambicode'} route next --task ${input.task}`;
  const server = boundServer(input.mcpServer, input.observedTools);
  const classified = [...new Set(input.sources)].map(classifySource);
  const jira = classified.filter((source): source is Extract<AskedSource, { kind: 'jira' }> => source.kind === 'jira');
  const confluence = classified.filter((source): source is Extract<AskedSource, { kind: 'confluence' }> => source.kind === 'confluence');
  const other = classified.filter((source): source is OtherSource => source.kind === 'other');
  const fields = jiraFields(input.acceptanceField);
  const get = toolName(input.observedTools, server, 'getJiraIssue');
  const search = toolName(input.observedTools, server, 'searchJiraIssuesUsingJql');
  const prefix = server === null ? 'mcp__<server matching atlassian|jira|confluence|rovo>__' : `mcp__${server}__`;

  const header = input.mcpServer !== null
    ? `Use MCP server \`${input.mcpServer}\`.`
    : server !== null
      ? `Bound \`${server}\`; tell the user to pin \`requirements.mcpServer: ${server}\`.`
      : 'Use the connected server whose name contains atlassian, jira, confluence or rovo; if several are connected AMBICODE will ask.';
  const unobserved = jira.length > 0 && (get === 'getJiraIssue' || search === 'searchJiraIssuesUsingJql')
    ? [`Use the Jira get-issue and JQL-search tools of ${prefix} (exact tool name not observed).`]
    : [];
  const acceptance = input.acceptanceField === null ? ['acceptance field not configured (`requirements.acceptanceField`); acceptance criteria are read from the description.'] : [];
  const jiraShared = jira.length === 0 ? [] : [
    `If the JQL returned more than 10 hits, stop here and run \`${next}\`.`,
    `Else ${get} <child> fields=${fields} for each child (at most 10).`,
    'Linked issues and the parent: list them by key and summary; do not read them.',
  ];
  const tail = ['Keys mentioned inside a text you read: do not fetch them; name each once as a mention.', `When done, run \`${next}\`.`];
  const callsOf = (): string[][] => [
    ...jira.map((source) => [
      `${get} ${source.key} fields=${fields}`,
      `If issuetype is Epic or the issue has children: ${search} "parent = ${source.key}" fields=key,summary`,
    ]),
    ...confluence.map((source) => [`Confluence page ${source.id}: read the page; list its child pages by title; do not read them.`]),
    ...other.map((source) => [`${source.url}: fetch this URL with the bound server's read tool.`]),
  ];

  const render = (shown: number): string => {
    const calls = callsOf();
    const kept = calls.slice(0, shown).flat();
    const rest = calls.length - shown;
    const names = [...jira.map((source) => source.key), ...confluence.map((source) => source.id), ...other.map((source) => source.url)].slice(shown);
    return [header, ...unobserved, ...acceptance, ...kept, ...(rest > 0 ? [`Same calls for: ${names.join(', ')}.`] : []), ...jiraShared, ...tail].join('\n');
  };
  const total = jira.length + confluence.length + other.length;
  let shown = total;
  let text = render(shown);
  while (Buffer.byteLength(text) > MAX_BYTES && shown > 1) {
    shown -= 1;
    text = render(shown);
  }
  return { text, bytes: Buffer.byteLength(text) };
}
