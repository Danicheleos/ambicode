import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { contentHash } from '#util/hash';
import { commandContext } from '#harness/engine/context';
import { runHook } from '#hook/events/run-hook';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { applyInit } from '#modules/config/init/apply';
import { FIXTURE_CONFIG } from '#testing/fixtures/init-config';
import { INIT_HANDLERS } from './handlers.ts';
import { loadConfigWithNotices } from '#modules/config/load';
import { REPO_ROOT } from '#testing/paths';
import type { HookDeps } from '#types/hook';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const STEP = 'routes/init/apply-run.md';
const EXISTING = FIXTURE_CONFIG.replace('id: app', 'id: other').replace('root: .', 'root: other');
const DETECT = 'routes/init/detect.md';
const PROPOSAL = FIXTURE_CONFIG;

async function fixture(config: string | null = null): Promise<RouteFixture & {
  start(extra?: object): ReturnType<RouteFixture['engine']['start']>;
  propose(task: string, yaml?: string): ReturnType<RouteFixture['engine']['advance']>;
  begin(extra?: object): Promise<Awaited<ReturnType<RouteFixture['engine']['start']>>>;
  hook(task: string, option: string, gate?: string): ReturnType<RouteFixture['engine']['advance']>;
  print(task: string, gate?: string): Promise<Record<string, unknown>>;
  apply(task: string, session?: string | null): Promise<Awaited<ReturnType<typeof applyInit>> & { next: string }>;
  exists(relative: string): Promise<boolean>;
}> {
  const fx = await routeFixture({
    routes: { init: await readFile(path.join(REPO_ROOT, 'routes', 'init', 'init.yaml'), 'utf8') },
    handlers: { ...INIT_HANDLERS },
    step: { [STEP]: await readFile(path.join(REPO_ROOT, STEP), 'utf8'), [DETECT]: await readFile(path.join(REPO_ROOT, DETECT), 'utf8') },
    config,
  });
  const print = async (task: string, gate = 'init-apply') => (await fx.kinds(task, 'gate')).filter((entry) => entry['gate'] === gate).at(-1)!;
  const start = (extra = {}) => fx.engine.start({ skill: 'init', text: '', requirements: [], cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...extra });
  /** What `init propose` does before its tail: the YAML lands in the task, then the route advances. */
  const propose = async (task: string, yaml = PROPOSAL) => {
    const steps = path.join(fx.repo.root, '.ambicode/task', task, 'steps');
    await fx.runtime.fs.mkdirp(steps);
    await fx.runtime.fs.writeText(path.join(steps, 'proposal.yaml'), yaml);
    return fx.engine.advance({ task, session: A, cause: 'init propose', scratchpadDir: fx.scratchpad });
  };
  return {
    ...fx,
    start,
    propose,
    begin: async (extra = {}) => {
      const started = await start(extra);
      const advanced = await propose(started.task);
      return { ...started, position: advanced.position, text: advanced.text };
    },
    hook: async (task, option, gate = 'init-apply') => fx.engine.advance({ task, session: A, cause: 'gate-hook', answers: [{ gate, option, instance: (await print(task, gate)).id as string }], scratchpadDir: fx.scratchpad }),
    print,
    apply: async (task, session = A) => {
      const result = await applyInit({ runtime: fx.runtime, session, context: commandContext({ runtime: fx.runtime, routes: fx.routes }) }, { task });
      const next = await fx.engine.advance({ task, session: A, cause: 'init --apply', scratchpadDir: fx.scratchpad });
      return { ...result, next: next.text };
    },
    exists: (relative) => fx.runtime.fs.exists(path.join(fx.repo.root, relative)),
  };
}

const code = (expected: string, reason?: string) => (error: { code?: string; details?: string[] }) =>
  error.code === expected && (reason === undefined || error.details?.includes(`reason: ${reason}`) === true);

describe('the init route', () => {
  it('scan runs skills/init/scripts/scan.mjs: manifests, scripts, tools, packs and rule sources reach the detect step; nothing is written', async () => {
    const t = await fixture();
    try {
      await t.repo.write('package.json', '{"name":"app","scripts":{"test":"vitest run","lint":"eslint ."}}\n');
      await t.repo.write('package-lock.json', '{}\n');
      await t.repo.write('services/api/pyproject.toml', '[project]\nname="api"\n');
      await t.repo.write('CLAUDE.md', '# rules\n');
      const started = await t.start();
      assert.equal(started.position, 'detect');
      for (const expected of ['package.json', 'services/api/pyproject.toml', 'package-lock.json', '"test":"vitest run"', 'builtin/common-quality', 'CLAUDE.md', 'config: absent']) assert.ok(started.text.includes(expected), `${expected} in:\n${started.text}`);
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('Cancel writes nothing; the close names the draft and the untracked task directory', async () => {
    const t = await fixture();
    try {
      const started = await t.begin();
      assert.equal(started.position, 'init-apply');
      const print = await t.print(started.task);
      assert.deepEqual(print['options'], ['Apply', 'Adjust', 'Cancel']);
      assert.match(String(print['question']), /^Draft: \.ambicode\/config\.draft\.yaml sha256:[0-9a-f]{32} /m);
      assert.match(String(print['question']), /init --apply --task init-\d{4}-\d{2}-\d{2}$/m);
      const closed = await t.hook(started.task, 'Cancel');
      assert.equal(closed.position, 'complete');
      assert.match(closed.text, /Nothing was written/);
      assert.match(closed.text, new RegExp(`untracked.*rm -r \\.ambicode/task/${started.task}`, 's'));
      for (const file of ['.ambicode/config.yaml', '.gitignore']) assert.equal(await t.exists(file), false, file);
      assert.equal((await t.kinds(started.task, 'gate')).length, 1, 'one gate on the Cancel path');
    } finally {
      await t.dispose();
    }
  });

  it('Apply, init --apply writes the config, the ignore lines and the doctor table in one gate', async () => {
    const t = await fixture();
    try {
      await assert.rejects(loadConfigWithNotices(t.runtime.fs, t.repo.root), code('config-missing'));
      const { task } = await t.begin();
      assert.equal((await t.hook(task, 'Apply')).position, 'apply');
      const result = await t.apply(task);
      assert.equal(result.created, true);
      assert.equal(result.backup, null);
      assert.match(result.next, /Applied: \.ambicode\/config\.yaml is written\. Doctor/);
      assert.match(result.next, /project +slot +command +result +detail/);
      assert.equal(await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.yaml')), PROPOSAL);
      assert.match(await t.runtime.fs.readText(path.join(t.repo.root, '.gitignore')), /^\.ambicode\/task\/$/m);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
      const route = (await t.kinds(task, 'route')).at(-1)!;
      assert.equal((await t.kinds(task, 'exit')).filter((entry) => entry['route'] === route.id).at(-1)?.['reason'], 'done');
      assert.equal((await t.kinds(task, 'step')).filter((entry) => entry['route'] === route.id && entry['step'] === 'apply').at(-1)?.['cause'], 'init --apply');
      assert.equal((await t.kinds(task, 'gate')).filter((entry) => entry['route'] === route.id).length, 1);
    } finally {
      await t.dispose();
    }
  });

  it('an existing config is copied to a .bak file before the draft replaces it', async () => {
    const t = await fixture(EXISTING);
    try {
      const { task } = await t.begin();
      assert.match(String((await t.print(task))['question']), /replaces \.ambicode\/config\.yaml \(a \.bak copy is kept\)/);
      await t.hook(task, 'Apply');
      const result = await t.apply(task);
      assert.equal(result.created, false);
      assert.match(String(result.backup), /^\.ambicode\/config\.yaml\.bak-/);
      assert.equal(await t.runtime.fs.readText(path.join(t.repo.root, result.backup!)), EXISTING);
      assert.equal(await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.yaml')), PROPOSAL);
    } finally {
      await t.dispose();
    }
  });

  it('Adjust with free text revises detect with the change, and the next proposal is a new draft', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      const before = await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.draft.yaml'));
      const revised = await t.hook(task, 'skip the lint check');
      assert.equal(revised.position, 'detect');
      assert.match(revised.text, /## change\nskip the lint check/);
      const changed = PROPOSAL.replace('mcpServer: null', 'mcpServer: jira');
      assert.equal((await t.propose(task, changed)).position, 'init-apply');
      const after = await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.draft.yaml'));
      assert.notEqual(after, before);
      await t.hook(task, 'Apply');
      await t.apply(task);
      assert.equal((await loadConfigWithNotices(t.runtime.fs, t.repo.root)).config.requirements.mcpServer, 'jira');
    } finally {
      await t.dispose();
    }
  });

  it('apply writes exactly the approved draft hash and refuses a draft edited after the answer', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      const draftPath = path.join(t.repo.root, '.ambicode/config.draft.yaml');
      const draft = await t.runtime.fs.readText(draftPath);
      const shown = (await t.print(task))['values'] as { draft: string };
      assert.equal(contentHash(draft), shown.draft);
      await t.hook(task, 'Apply');
      await t.runtime.fs.writeText(draftPath, `${draft}# sneaked in\n`);
      await assert.rejects(t.apply(task), code('init-unconfirmed', 'draft-differs'));
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
      await t.runtime.fs.writeText(draftPath, draft);
      await t.apply(task);
      assert.equal(await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.yaml')), draft);
    } finally {
      await t.dispose();
    }
  });

  it('a headless start with no preanswer takes Cancel; a trusted preanswer Apply is honoured at the print', async () => {
    const t = await fixture();
    try {
      const done = await t.begin({ headless: true });
      assert.equal(done.position, 'complete');
      assert.equal((await t.kinds(done.task, 'default-taken'))[0]?.['answer'], 'Cancel');
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
    } finally {
      await t.dispose();
    }
    const u = await fixture();
    try {
      const started = await u.begin({ answers: [{ gate: 'init-apply', option: 'Apply' }] });
      assert.equal(started.position, 'apply');
      await u.apply(started.task);
      assert.ok(await u.exists('.ambicode/config.yaml'));
    } finally {
      await u.dispose();
    }
  });

  it('a model-typed acting answer is declined and init --apply refuses', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      await t.engine.advance({ task, session: A, cause: 'route-next', answers: [{ gate: 'init-apply', option: 'Apply' }] });
      assert.equal((await t.kinds(task, 'declined')).at(-1)?.['reason'], 'acting-needs-human');
      await assert.rejects(t.apply(task), code('init-unconfirmed', 'acting-needs-human'));
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('no session is session-unbound; no init route is no-init-route', async () => {
    const t = await fixture();
    try {
      await assert.rejects(t.apply('init-2026-10-05', null), code('session-unbound'));
      await assert.rejects(t.apply('init-2026-10-05'), code('init-unconfirmed', 'no-init-route'));
    } finally {
      await t.dispose();
    }
  });

  it('a proposal that breaks the config schema is refused naming the field; the route returns to detect', async () => {
    const t = await fixture();
    try {
      const started = await t.start();
      const refused = await t.propose(started.task, PROPOSAL.replace('id: app', 'id: Not_Kebab'));
      assert.equal(refused.position, 'detect');
      assert.match(refused.text, /projects\.0\.id/);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
      const old = await t.propose(started.task, PROPOSAL.replace('schemaVersion: 3', 'schemaVersion: 2'));
      assert.match(old.text, /schemaVersion must be 3/);
      assert.equal((await t.propose(started.task)).position, 'init-apply');
    } finally {
      await t.dispose();
    }
  });

  it('a proposal that is not YAML is refused; the third refusal ends the repeats and only Cancel is offered', async () => {
    const t = await fixture();
    try {
      const started = await t.start();
      const yaml = await t.propose(started.task, 'projects: [');
      assert.equal(yaml.position, 'detect');
      assert.match(yaml.text, /not valid YAML/);
      await t.propose(started.task, 'projects: [');
      const third = await t.propose(started.task, 'projects: [');
      assert.equal(third.position, 'init-apply');
      assert.deepEqual((await t.print(started.task))['options'], ['Cancel']);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
    } finally {
      await t.dispose();
    }
  });
});
