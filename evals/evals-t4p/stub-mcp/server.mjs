#!/usr/bin/env node
/**
 * Dependency-free stdio MCP server standing in for the requirements source (Atlassian) in
 * synthetic eval cases: newline-delimited JSON-RPC, one tool `getJiraIssue`.
 */
import { createInterface } from 'node:readline';

export const MARKER = 'STUB-REQUIREMENTS-MARKER-7f3a';

const TOOL = {
  name: 'getJiraIssue',
  description: 'Fetch a Jira issue by key. Returns the summary and description.',
  inputSchema: {
    type: 'object',
    properties: { issueIdOrKey: { type: 'string' } },
    required: ['issueIdOrKey'],
  },
};

export function handle(message) {
  const { id, method, params } = message;
  if (id === undefined) return null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize')
    return ok({
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'stub', version: '0.0.0' },
    });
  if (method === 'tools/list') return ok({ tools: [TOOL] });
  if (method === 'tools/call') {
    if (params?.name !== TOOL.name) return { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool ${params?.name}` } };
    const key = params.arguments?.issueIdOrKey ?? 'UNKNOWN';
    return ok({ content: [{ type: 'text', text: JSON.stringify({ key, summary: `${MARKER} synthetic issue ${key}`, description: 'Add a clamp helper.' }) }] });
  }
  if (method === 'ping') return ok({});
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return;
    const reply = handle(JSON.parse(line));
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}
