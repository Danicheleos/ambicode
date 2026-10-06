import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, requirementsTemplate } from './template.ts';

const JIRA_URL = 'https://x.atlassian.net/browse/ORD-17?focusedId=3';
const WIKI_URL = 'https://x.atlassian.net/wiki/spaces/A/pages/123456/Design';
const base = { task: 'ORD-17', mcpServer: 'atlassian', acceptanceField: null, observedTools: [] as string[] };

describe('04-T template', () => {
  it('04-T1: a source is classified by its text', () => {
    assert.deepEqual(classifySource('ORD-17'), { kind: 'jira', key: 'ORD-17', url: null });
    assert.deepEqual(classifySource(JIRA_URL), { kind: 'jira', key: 'ORD-17', url: classifySource(JIRA_URL).kind === 'jira' ? (classifySource(JIRA_URL) as { url: string }).url : '' });
    assert.deepEqual(classifySource(WIKI_URL).kind === 'confluence' ? (classifySource(WIKI_URL) as { id: string }).id : null, '123456');
    assert.equal(classifySource('https://docs.example.com/spec').kind, 'other');
    const { text } = requirementsTemplate({ ...base, sources: ['https://docs.example.com/spec'] });
    assert.match(text, /https:\/\/docs\.example\.com\/spec: fetch this URL with the bound server's read tool\./);
  });

  it('04-T2: a jira source prints the read, the epic branch, the > 10 sentence, the child reads and the linked list, in that order', () => {
    const { text } = requirementsTemplate({ ...base, sources: [JIRA_URL] });
    const at = (part: string): number => {
      const index = text.indexOf(part);
      assert.ok(index >= 0, `missing: ${part}`);
      return index;
    };
    const order = [
      'getJiraIssue ORD-17 fields=summary,description,issuetype,parent,issuelinks',
      'If issuetype is Epic or the issue has children: searchJiraIssuesUsingJql "parent = ORD-17" fields=key,summary',
      'If the JQL returned more than 10 hits, stop here and run `ambicode route next --task ORD-17`.',
      'Else getJiraIssue <child> fields=summary,description,issuetype,parent,issuelinks for each child (at most 10).',
      'Linked issues and the parent: list them by key and summary; do not read them.',
    ].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it('04-T3: a confluence source reads the page and lists its children without reading them', () => {
    assert.match(requirementsTemplate({ ...base, sources: [WIKI_URL] }).text, /Confluence page 123456: read the page; list its child pages by title; do not read them\./);
  });

  it('04-T4: every template ends with the mention rule and the completion command', () => {
    for (const sources of [[JIRA_URL], [WIKI_URL], [JIRA_URL, WIKI_URL]]) {
      const lines = requirementsTemplate({ ...base, sources }).text.split('\n');
      assert.equal(lines.at(-2), 'Keys mentioned inside a text you read: do not fetch them; name each once as a mention.');
      assert.equal(lines.at(-1), 'When done, run `ambicode route next --task ORD-17`.');
    }
  });

  it('04-T5: the acceptance field joins both field lists when set; when null the template says it is not configured', () => {
    const set = requirementsTemplate({ ...base, sources: [JIRA_URL], acceptanceField: 'customfield_10042' }).text;
    assert.equal(set.split('issuelinks,customfield_10042').length - 1, 2);
    assert.doesNotMatch(set, /not configured/);
    const none = requirementsTemplate({ ...base, sources: [JIRA_URL] }).text;
    assert.doesNotMatch(none, /customfield/);
    assert.match(none, /acceptance field not configured \(`requirements\.acceptanceField`\); acceptance criteria are read from the description/);
  });

  it('04-T6: an observed tool name is printed in full; otherwise the call class and the server prefix, with the field list in both forms', () => {
    const observed = requirementsTemplate({ ...base, sources: [JIRA_URL], observedTools: ['mcp__atlassian__getJiraIssue', 'mcp__atlassian__searchJiraIssuesUsingJql'] }).text;
    assert.match(observed, /mcp__atlassian__getJiraIssue ORD-17 fields=summary/);
    assert.match(observed, /mcp__atlassian__searchJiraIssuesUsingJql "parent = ORD-17" fields=key,summary/);
    assert.doesNotMatch(observed, /not observed/);
    const classForm = requirementsTemplate({ ...base, sources: [JIRA_URL] }).text;
    assert.match(classForm, /Jira get-issue and JQL-search tools of mcp__atlassian__ \(exact tool name not observed\)/);
    assert.match(classForm, /getJiraIssue ORD-17 fields=summary/);
    const unbound = requirementsTemplate({ ...base, mcpServer: null, sources: [JIRA_URL] }).text;
    assert.match(unbound, /mcp__<server matching atlassian\|jira\|confluence\|rovo>__ \(exact tool name not observed\)/);
  });

  it('04-T7: the binding header by configured server and observed captures', () => {
    assert.match(requirementsTemplate({ ...base, sources: [JIRA_URL] }).text.split('\n')[0]!, /^Use MCP server `atlassian`\.$/);
    const one = requirementsTemplate({ ...base, mcpServer: null, sources: [JIRA_URL], observedTools: ['mcp__claude_ai_Atlassian_Rovo__getJiraIssue'] }).text.split('\n')[0]!;
    assert.equal(one, 'Bound `claude_ai_Atlassian_Rovo`; tell the user to pin `requirements.mcpServer: claude_ai_Atlassian_Rovo`.');
    const two = requirementsTemplate({ ...base, mcpServer: null, sources: [JIRA_URL], observedTools: ['mcp__a_jira__getJiraIssue', 'mcp__b_jira__getJiraIssue'] }).text.split('\n')[0]!;
    assert.match(two, /^Use the connected server whose name contains atlassian, jira, confluence or rovo; if several are connected AMBICODE will ask\.$/);
    assert.match(requirementsTemplate({ ...base, mcpServer: null, sources: [JIRA_URL] }).text.split('\n')[0]!, /^Use the connected server whose name contains/);
  });

  it('04-T8: one jira and one confluence source with the acceptance field are at most 1,536 bytes', () => {
    const { text, bytes } = requirementsTemplate({ ...base, sources: [JIRA_URL, WIKI_URL], acceptanceField: 'customfield_10042' });
    assert.equal(bytes, Buffer.byteLength(text));
    assert.ok(bytes <= 1536, `${bytes} bytes`);
    const many = requirementsTemplate({ ...base, sources: Array.from({ length: 40 }, (_, index) => `ORD-${index + 1}`), acceptanceField: 'customfield_10042' });
    assert.ok(many.bytes <= 1536);
  });

  it('04-T1: a ticket key inside another URL does not make it a Jira source', () => {
    const url = 'https://docs.example.com/ORD-17/specification';
    assert.deepEqual(classifySource(url), { kind: 'other', url });
  });
});
