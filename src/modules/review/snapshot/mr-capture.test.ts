import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { session, mcp } from '#testing/fixtures/requirements-session';
import { captureMrDiff, MR_DIFF_JSON, MR_DIFF_PATCH } from './mr-capture.ts';
import { SESSION_A } from '#testing/fixtures/ids';

const URL_MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const SHA = 'a'.repeat(40);
const HUNK = '@@ -1,2 +1,2 @@\n keep\n-old\n+new\n';
const UNIFIED = `--- a/src/a.ts\n+++ b/src/a.ts\n${HUNK}`;
const CHANGES = { changes: [{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: HUNK }, { old_path: 'src/b.ts', new_path: 'src/b.ts', new_file: true, diff: '@@ -0,0 +1 @@\n+x\n' }], diff_refs: { head_sha: SHA } };

async function capture(tool: string, response: unknown, mrUrl: string | null = URL_MR) {
  const s = await session();
  try {
    const entry = await s.under((deps) => captureMrDiff({ hook_event_name: 'PostToolUse', session_id: SESSION_A, tool_name: tool, tool_response: response } as never, { runtime: deps.runtime, dir: deps.dir, ledger: deps.ledger, routeId: deps.view.routeId, mrUrl }));
    const read = (name: string): Promise<string | null> => readFile(path.join(s.dir.root, name), 'utf8').catch(() => null);
    return { entry, patch: await read(MR_DIFF_PATCH), meta: await read(MR_DIFF_JSON), ledger: await s.fx.kinds(s.task, 'capture') };
  } finally {
    await s.fx.dispose();
  }
}

describe('mr diff capture', () => {
  it('a unified-diff string is written as a git-shaped patch with its meta and one capture entry', async () => {
    const got = await capture('mcp__gitlab__get_merge_request_diffs', mcp(UNIFIED));
    assert.match(got.patch ?? '', /^diff --git a\/src\/a\.ts b\/src\/a\.ts\n--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts\n@@/);
    const meta = JSON.parse(got.meta ?? '{}') as Record<string, unknown>;
    assert.deepEqual([meta['url'], meta['server'], meta['tool'], meta['bytes']], [URL_MR, 'gitlab', 'mcp__gitlab__get_merge_request_diffs', Buffer.byteLength(got.patch ?? '')]);
    assert.deepEqual([got.ledger.length, got.ledger[0]?.['what'], got.ledger[0]?.['rawHash'], got.ledger[0]?.['bytes']], [1, 'mr-diff', meta['rawHash'], meta['bytes']]);
  });

  it('a changes[] response is rebuilt into headers + hunks, new files from /dev/null, and the head sha is kept', async () => {
    const got = await capture('mcp__gitlab__get_merge_request_changes', mcp(JSON.stringify(CHANGES)));
    assert.match(got.patch ?? '', /diff --git a\/src\/a\.ts b\/src\/a\.ts\n--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts\n@@ -1,2 \+1,2 @@/);
    assert.match(got.patch ?? '', /diff --git a\/src\/b\.ts b\/src\/b\.ts\n--- \/dev\/null\n\+\+\+ b\/src\/b\.ts\n/);
    assert.equal((JSON.parse(got.meta ?? '{}') as { sha?: string }).sha, SHA);
  });

  it('no --mr route, a non-matching tool, or a response without a diff writes nothing', async () => {
    for (const [tool, response, url] of [['mcp__gitlab__get_merge_request_diffs', mcp(UNIFIED), null], ['mcp__gitlab__get_merge_request', mcp(UNIFIED)], ['mcp__gitlab__list_issues', mcp(UNIFIED)], ['Bash', mcp(UNIFIED)], ['mcp__gitlab__get_merge_request_changes', mcp('{"title":"x"}')]] as const) {
      const got = await capture(tool, response, url as string | null | undefined);
      assert.deepEqual([got.entry, got.patch, got.meta, got.ledger.length], [null, null, null, 0], tool);
    }
  });
});

