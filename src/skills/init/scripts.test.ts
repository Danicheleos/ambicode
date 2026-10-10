import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { assembleEngine } from '#testing/fixtures/route-fixture';
import { materialized } from '#testing/fixtures/materialized';
import { INIT_HANDLERS } from './handlers.ts';
import { REPO_ROOT } from '#testing/paths';

const SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';

describe('skills/init/scripts/scan.mjs', () => {
  it('lists the manifests, package scripts, builtin packs and config state of a materialised fixture', async () => {
    const root = await materialized('ts-feature-boundary');
    try {
      const step = { 'routes/init/detect.md': await readFile(path.join(REPO_ROOT, 'routes/init/detect.md'), 'utf8'), 'routes/init/apply-run.md': '' };
      const assembled = await assembleEngine({ root, routes: { init: await readFile(path.join(REPO_ROOT, 'routes/init/init.yaml'), 'utf8') }, handlers: Object.keys(INIT_HANDLERS), step });
      const engine = assembled.build({ ...INIT_HANDLERS });
      const first = await engine.start({ skill: 'init', text: '', requirements: [], cwd: root, session: SESSION, channel: 'hook' });
      assert.equal(first.position, 'detect');
      assert.match(first.text, /## script:scan/);
      assert.match(first.text, /package\.json/);
      assert.match(first.text, /policies|pack/i);
      assert.ok(first.bytes <= 8192, `${first.bytes} bytes`);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
