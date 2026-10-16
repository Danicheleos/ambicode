import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture } from '#testing/fixtures/route-fixture';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'script-task';

const ROUTE = (name: string): string => `skill: inv
version: 3
steps:
  - id: collect
    actor: code
    run: ["script(${name})"]
    onError: "stop:blocked"
  - id: read
    actor: model
    instruction: "Read, then answer."
    payload: ["script:${name}"]
`;

const ECHO = `
let text = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { text += chunk; });
process.stdin.on('end', () => {
  const input = JSON.parse(text);
  process.stdout.write(JSON.stringify({
    payload: 'hello ' + input.task + ' from ' + input.skill,
    record: { collected: 2 },
    entries: [{ kind: 'search', command: 'refs', names: ['x'], hits: 1, bytes: 3 }],
  }));
});
`;

async function scripts(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-scripts-'));
  const dir = path.join(root, 'skills', 'inv', 'scripts');
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, `${name}.mjs`), body);
  return root;
}

describe('run: script(<name>) (C7)', () => {
  it('runs skills/<skill>/scripts/<name>.mjs, delivers its payload, merges its record and appends its entries', async () => {
    const pluginRoot = await scripts({ echo: ECHO });
    const fx = await routeFixture({ routes: { inv: ROUTE('echo') }, pluginRoot });
    try {
      const first = await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      assert.equal(first.position, 'read');
      assert.match(first.text, /hello script-task from inv/);
      const search = await fx.kinds(TASK, 'search');
      assert.equal(search.length, 1);
      assert.equal(search[0]?.['command'], 'refs');
      const completed = (await fx.kinds(TASK, 'step')).find((entry) => entry['step'] === 'collect' && entry['status'] === 'completed');
      assert.equal(completed?.['collected'], 2);
    } finally {
      await fx.dispose();
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it('a script that exits non-zero or prints no JSON fails the step with the script named, and onError stops the route', async () => {
    const pluginRoot = await scripts({ boom: "process.stderr.write('no input\\n'); process.exit(3);", prose: "process.stdout.write('not json');" });
    for (const [name, code] of [['boom', 'script-failed'], ['prose', 'script-output-invalid']] as const) {
      const fx = await routeFixture({ routes: { inv: ROUTE(name) }, pluginRoot });
      try {
        await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
        const failed = (await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed');
        assert.equal(failed?.['code'], code);
        assert.match(String(failed?.['message']), new RegExp(`skills/inv/scripts/${name}.mjs`));
        assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), ['blocked']);
      } finally {
        await fx.dispose();
      }
    }
    await rm(pluginRoot, { recursive: true, force: true });
  });

  it('a script name outside letters, digits, "_" and "-" is refused before anything runs', async () => {
    const fx = await routeFixture({ routes: { inv: ROUTE('../x') } });
    try {
      await fx.engine.start({ skill: 'inv', text: 'q', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const failed = (await fx.kinds(TASK, 'step')).find((entry) => entry['status'] === 'failed');
      assert.equal(failed?.['code'], 'script-name-invalid');
    } finally {
      await fx.dispose();
    }
  });
});
