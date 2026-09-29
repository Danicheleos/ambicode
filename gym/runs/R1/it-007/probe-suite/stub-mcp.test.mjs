import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handle, MARKER } from '../../evals-t4p/stub-mcp/server.mjs';

const SERVER = fileURLToPath(new URL('../../evals-t4p/stub-mcp/server.mjs', import.meta.url));

test('initialize echoes the client protocol version and advertises tools', () => {
  const reply = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(reply.result.protocolVersion, '2025-03-26');
  assert.deepEqual(reply.result.capabilities, { tools: {} });
});

test('notifications get no reply', () => {
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list names getJiraIssue and tools/call returns the marker for the key asked', () => {
  const list = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['getJiraIssue']);
  const call = handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'getJiraIssue', arguments: { issueIdOrKey: 'DEMO-1' } } });
  const issue = JSON.parse(call.result.content[0].text);
  assert.equal(issue.key, 'DEMO-1');
  assert.ok(issue.summary.includes(MARKER));
});

test('an unknown tool or method is a JSON-RPC error, not a silent success', () => {
  assert.equal(handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } }).error.code, -32602);
  assert.equal(handle({ jsonrpc: '2.0', id: 5, method: 'resources/list' }).error.code, -32601);
});

test('over stdio: one JSON line in, one JSON line out', async () => {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  const reply = new Promise((resolve) => child.stdout.once('data', (chunk) => resolve(JSON.parse(String(chunk)))));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' })}\n`);
  const message = await reply;
  child.kill();
  assert.equal(message.id, 9);
  assert.equal(message.result.tools[0].name, 'getJiraIssue');
});
