import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { noneAdapter } from './none.ts';

const NONE = { tool: 'none', state: 'none', fresh: false, builtMs: null, reason: null, drift: null };

describe('05-A2 none adapter', () => {
  it('05-A2: build and status say none; every query is not ok with that status', async () => {
    const adapter = noneAdapter();
    const project = { id: 'app', root: '.' } as never;
    assert.deepEqual(await adapter.build(project, { detached: true }), NONE);
    assert.deepEqual(await adapter.status(project), NONE);
    const answers = await Promise.all([adapter.find('x'), adapter.refs(['x']), adapter.relates('a.ts'), adapter.delta('diff')]);
    for (const answer of answers) assert.deepEqual(answer, { ok: false, status: NONE });
    assert.equal(adapter.name, 'none');
  });
});
