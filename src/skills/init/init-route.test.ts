import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { contentHash } from '#util/hash';
import { commandContext } from '#harness/engine/context';
import { runHook } from '#hook/events/run-hook';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { applyInit } from '#modules/config/init/apply';
import { INIT_HANDLERS } from './handlers.ts';
import { loadConfigWithNotices } from '#modules/config/load';
import { REPO_ROOT } from '#testing/paths';
import type { HookDeps } from '#types/hook';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const STEP = 'routes/init/apply-run.md';
const EXISTING = [
  'schemaVersion: 3',
  'baseline: ""',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'requirements: { mcpServer: null }',
  'projects:',
  '  - { id: other, root: other, ecosystem: generic }',
  '',
].join('\n');
const DETECT = 'routes/init/detect.md';
const PROPOSAL = [
  'projects:',
  '  - id: app',
  '    root: .',
  '    ecosystem: typescript',
  "    shortlist: ['**/*.ts']",
  '    packs: [builtin/common-quality, builtin/common-checks]',
  '',
].join('\n');

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

describe('09-R1/09-G1: the init route', () => {
  it('09-G6/09-R4: Cancel writes nothing; the close names the proposal, the apply line and the untracked task directory', async () => {
    const t = await fixture();
    try {
      const started = await t.begin();
      assert.equal(started.position, 'init-apply');
      assert.ok(await t.exists(`.ambicode/task/${started.task}/steps/proposal.json`));
      const print = await t.print(started.task);
      assert.deepEqual(print['options'], ['Apply as proposed', 'Adjust', 'Cancel']);
      assert.match(String(print['question']), /^Draft: \.ambicode\/config\.draft\.yaml sha256:[0-9a-f]{32} /m);
      assert.match(String(print['question']), /init --apply --task init-\d{4}-\d{2}-\d{2}$/m);
      assert.ok(await t.exists('.ambicode/config.draft.yaml'), 'the draft is saved before the question');

      const closed = await t.hook(started.task, 'Cancel');
      assert.equal(closed.position, 'complete');
      assert.match(closed.text, /steps\/proposal\.json/);
      assert.match(closed.text, new RegExp(`init --apply --task ${started.task}`));
      assert.match(closed.text, new RegExp(`untracked.*rm -r \\.ambicode/task/${started.task}`, 's'));
      for (const file of ['.ambicode/config.yaml', '.gitignore', '.ambicode/index']) assert.equal(await t.exists(file), false, file);
      assert.equal((await t.kinds(started.task, 'gate')).length, 1, '09-R2: one gate on the Cancel path');
    } finally {
      await t.dispose();
    }
  });

  it('S6/09-G5: a second init, Apply as proposed, init --apply writes config, ignore lines and the doctor table', async () => {
    const t = await fixture();
    try {
      await assert.rejects(loadConfigWithNotices(t.runtime.fs, t.repo.root), code('config-missing'));
      const first = await t.begin();
      await t.hook(first.task, 'Cancel');
      const second = await t.begin();
      const delivered = await t.hook(second.task, 'Apply as proposed');
      assert.equal(delivered.position, 'apply');
      const result = await t.apply(second.task);
      assert.equal(result.created, true);
      assert.match(result.next, /Applied: \.ambicode\/config\.yaml is written\. Doctor/);
      assert.match(result.next, /project +slot +command +result +detail/);
      assert.ok(await t.exists('.ambicode/config.yaml'));
      assert.match(await t.runtime.fs.readText(path.join(t.repo.root, '.gitignore')), /^\.ambicode\/task\/$/m);
      const doctor = await t.runtime.fs.readText(path.join(t.repo.root, `.ambicode/task/${second.task}/steps/doctor.md`));
      assert.match(doctor, /<!-- ambicode doctor sha256:[0-9a-f]+ -->|<!-- ambicode doctor \S+ -->/);
      const route = (await t.kinds(second.task, 'route')).at(-1)!;
      const exits = (await t.kinds(second.task, 'exit')).filter((entry) => entry['route'] === route.id);
      assert.equal(exits.at(-1)?.['reason'], 'done');
      const steps = (await t.kinds(second.task, 'step')).filter((entry) => entry['route'] === route.id && entry['step'] === 'apply');
      assert.equal(steps.at(-1)?.['cause'], 'init --apply', '09-R2: the work command completes the step; no route next');
      assert.equal((await t.kinds(second.task, 'gate')).filter((entry) => entry['route'] === route.id).length, 1, '09-R2: one gate on the Apply path');
      assert.equal((await loadConfigWithNotices(t.runtime.fs, t.repo.root)).config.schemaVersion, 3);
    } finally {
      await t.dispose();
    }
  });

  it('separate choices bind: MCP server and runner each set their own slot and the draft shows them', async () => {
    const t = await fixture();
    try {
      await t.repo.write('node_modules/.bin/eslint', '#!/bin/sh\n');
      const lint = `${PROPOSAL}    commands: { lint: ["./node_modules/.bin/eslint", "--", "{files}"] }\n`;
      const started = await t.start();
      assert.equal((await t.propose(started.task, lint)).position, 'init-apply');
      const task = started.task;
      const first = String((await t.print(task))['question']);
      assert.match(first, /^ {2}MCP server:$/m);
      assert.match(first, /^ {2}Runner:$/m);
      assert.match(first, /Runner: app lint skip/);
      assert.doesNotMatch(first, /Values:|key=value|Search index/);
      await t.hook(task, 'MCP server: jira');
      await t.hook(task, 'Runner: app lint skip');
      const print = await t.print(task);
      assert.deepEqual(print['options'], ['Apply as adjusted', 'Adjust', 'Cancel']);
      assert.deepEqual((print['values'] as { set: string[] }).set, ['projects.app.commands.lint=null', 'requirements.mcpServer="jira"']);
      assert.match(String(print['question']), /^Chosen so far: projects\.app\.commands\.lint=null requirements\.mcpServer="jira"$/m);
      const typed = await t.hook(task, 'search.index=none');
      assert.equal(typed.position, 'init-apply');
      assert.match(String((await t.print(task))['question']), /^not understood: search\.index=none$/m);
      await t.hook(task, 'Apply as adjusted');
      await t.apply(task);
      const config = await loadConfigWithNotices(t.runtime.fs, t.repo.root);
      assert.equal(config.config.requirements.mcpServer, 'jira');
      assert.equal(config.config.projects[0]!.commands['lint'], null);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
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
      await t.hook(task, 'Apply as proposed');
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

  it('a config that changed after the answer writes nothing, shows the diff and asks again', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      const before = await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.draft.yaml'));
      await t.hook(task, 'Apply as proposed');
      await t.runtime.fs.writeText(path.join(t.repo.root, '.ambicode/config.yaml'), EXISTING);
      await assert.rejects(t.apply(task), (error: { code?: string; details?: string[] }) => error.code === 'init-unconfirmed' && error.details?.some((line) => /^[-+] /m.test(line)) === true);
      assert.equal(await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.yaml')), EXISTING, 'nothing was written over it');
      assert.notEqual(await t.runtime.fs.readText(path.join(t.repo.root, '.ambicode/config.draft.yaml')), before);
      const again = await t.engine.advance({ task, session: A, cause: 'route-next', answers: [{ gate: 'init-apply', option: 'Adjust' }], scratchpadDir: t.scratchpad });
      assert.equal(again.position, 'init-apply');
      const question = String((await t.print(task))['question']);
      assert.match(question, /the draft now differs/);
      assert.match(question, /^[-+] /m);
      await t.hook(task, 'Apply as proposed');
      await t.apply(task);
      assert.ok(await t.exists('.ambicode/config.yaml'));
    } finally {
      await t.dispose();
    }
  });

  it('09-G6: a headless start with no preanswer takes Cancel and prints the apply line', async () => {
    const t = await fixture();
    try {
      const done = await t.begin({ headless: true });
      assert.equal(done.position, 'complete');
      assert.match(done.text, /init --apply --task/);
      assert.equal((await t.kinds(done.task, 'default-taken'))[0]?.['answer'], 'Cancel');
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('09-G4.3: a trusted preanswer Apply as proposed is honoured at the print', async () => {
    const t = await fixture();
    try {
      const started = await t.begin({ answers: [{ gate: 'init-apply', option: 'Apply as proposed' }] });
      assert.equal(started.position, 'apply');
      await t.apply(started.task);
      assert.ok(await t.exists('.ambicode/config.yaml'));
    } finally {
      await t.dispose();
    }
  });

  it('09-G1/03-G14: an option the print does not offer is declined, the gate reprinted, and init --apply refuses', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      const again = await t.hook(task, 'Apply as adjusted');
      assert.equal(again.position, 'init-apply');
      assert.equal((await t.kinds(task, 'declined')).at(-1)?.['reason'], 'option-not-offered');
      await assert.rejects(t.apply(task), code('init-unconfirmed', 'no-answer'));

      const preanswered = await fixture();
      try {
        const started = await preanswered.begin({ answers: [{ gate: 'init-apply', option: 'Apply as adjusted' }] });
        assert.equal(started.position, 'init-apply');
        assert.equal((await preanswered.kinds(started.task, 'declined')).at(-1)?.['reason'], 'option-not-offered');
      } finally {
        await preanswered.dispose();
      }
    } finally {
      await t.dispose();
    }
  });

  it('09-G7: a model-typed acting answer is declined and init --apply refuses', async () => {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      await t.engine.advance({ task, session: A, cause: 'route-next', answers: [{ gate: 'init-apply', option: 'Apply as proposed' }] });
      assert.equal((await t.kinds(task, 'declined')).at(-1)?.['reason'], 'acting-needs-human');
      await assert.rejects(t.apply(task), code('init-unconfirmed', 'acting-needs-human'));
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('09-G4.1/09-G4.2: no session is session-unbound; no init route is no-init-route', async () => {
    const t = await fixture();
    try {
      await assert.rejects(t.apply('init-2026-10-05', null), code('session-unbound'));
      await assert.rejects(t.apply('init-2026-10-05'), code('init-unconfirmed', 'no-init-route'));
    } finally {
      await t.dispose();
    }
  });

  it('scan lists what the model judges from, in at most 2 KiB, and writes nothing', async () => {
    const t = await fixture();
    try {
      await t.repo.write('package.json', '{"name":"app","scripts":{"test":"vitest run","lint":"eslint ."}}\n');
      await t.repo.write('package-lock.json', '{}\n');
      await t.repo.write('services/api/pyproject.toml', '[project]\nname="api"\n');
      await t.repo.write('CLAUDE.md', '# rules\n');
      const started = await t.start();
      assert.equal(started.position, 'detect');
      const text = started.text;
      for (const expected of ['package.json (/', 'pyproject.toml (services/api)', 'package-lock.json', '"test":"vitest run"', 'builtin/common-quality', 'CLAUDE.md', 'config: absent']) assert.ok(text.includes(expected), `${expected} in:\n${text}`);
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('a proposal naming an unknown pack is refused with the field, and the route returns to detect', async () => {
    const t = await fixture();
    try {
      const started = await t.start();
      const refused = await t.propose(started.task, PROPOSAL.replace('builtin/common-checks', 'builtin/no-such-pack'));
      assert.equal(refused.position, 'detect');
      assert.match(refused.text, /projects\.0\.packs/);
      assert.match(refused.text, /no-such-pack/);
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
      assert.equal((await t.propose(started.task)).position, 'init-apply');
    } finally {
      await t.dispose();
    }
  });

  it('a proposal with a missing root or a command that is not installed is refused with the field', async () => {
    const t = await fixture();
    try {
      const started = await t.start();
      const root = await t.propose(started.task, PROPOSAL.replace('root: .', 'root: nowhere'));
      assert.match(root.text, /projects\.0\.root/);
      const command = await t.propose(started.task, `${PROPOSAL}    commands: { lint: [no-such-linter, "{files}"] }\n`);
      assert.match(command.text, /projects\.0\.commands\.lint/);
    } finally {
      await t.dispose();
    }
  });

  it('a proposal that is not YAML is refused naming yaml; the third refusal ends the repeats', async () => {
    const t = await fixture();
    try {
      const started = await t.start();
      const yaml = await t.propose(started.task, 'projects: [');
      assert.equal(yaml.position, 'detect');
      assert.match(yaml.text, /yaml/);
      await t.propose(started.task, 'projects: [');
      const third = await t.propose(started.task, 'projects: [');
      assert.equal(third.position, 'init-apply');
      assert.deepEqual((await t.print(started.task))['options'], ['Cancel'], 'no proposal, so nothing can be applied');
      assert.equal(await t.exists('.ambicode/config.draft.yaml'), false);
    } finally {
      await t.dispose();
    }
  });

  it('09-P6/09-G4.5: an unparsable config asks first; stop copies nothing; back up copies it before the proposal', async () => {
    const broken = 'schemaVersion: [3\n';
    const stopped = await fixture(broken);
    try {
      const { task } = await stopped.start();
      assert.equal((await stopped.print(task, 'config-unparsable'))['gate'], 'config-unparsable');
      assert.equal(await stopped.exists(`.ambicode/task/${task}/steps/proposal.json`), false);
      await stopped.hook(task, 'stop', 'config-unparsable');
      const files = await stopped.runtime.fs.readdir(path.join(stopped.repo.root, '.ambicode'));
      assert.deepEqual(files.filter((entry) => entry.name.includes('.bak-')), []);
    } finally {
      await stopped.dispose();
    }

    const t = await fixture(broken);
    try {
      const { task } = await t.start();
      const next = await t.hook(task, 'back up and regenerate', 'config-unparsable');
      assert.equal(next.position, 'detect');
      assert.equal((await t.propose(task)).position, 'init-apply');
      const directory = path.join(t.repo.root, '.ambicode');
      const backup = (await t.runtime.fs.readdir(directory)).find((entry) => entry.name.startsWith('config.yaml.bak-'));
      assert.ok(backup !== undefined);
      assert.equal(await t.runtime.fs.readText(path.join(directory, backup.name)), broken);
      const proposal = JSON.parse(await t.runtime.fs.readText(path.join(directory, 'task', task, 'steps', 'proposal.json'))) as { configState: string };
      assert.equal(proposal.configState, 'unparsable-backed-up');

      await t.hook(task, 'Apply as proposed');
      await t.runtime.fs.remove(path.join(directory, backup.name));
      await assert.rejects(t.apply(task), code('config-unparsable'));
      assert.equal(await t.runtime.fs.readText(path.join(directory, 'config.yaml')), broken);
    } finally {
      await t.dispose();
    }
  });

  it('09-R4 (amend-09 P5): Cancel after an approved backup keeps it and names it', async () => {
    const t = await fixture('schemaVersion: [3\n');
    try {
      const { task } = await t.start();
      await t.hook(task, 'back up and regenerate', 'config-unparsable');
      await t.propose(task);
      const directory = path.join(t.repo.root, '.ambicode');
      const backup = (await t.runtime.fs.readdir(directory)).find((entry) => entry.name.startsWith('config.yaml.bak-'))!;
      const closed = await t.hook(task, 'Cancel');
      assert.equal(closed.position, 'complete');
      assert.ok(closed.text.includes(`The backup you approved stays: .ambicode/${backup.name}`), closed.text);
      assert.equal(await t.runtime.fs.exists(path.join(directory, backup.name)), true);
    } finally {
      await t.dispose();
    }
  });

  it('09-R4 (amend-09 P5): with several backups, Cancel names the one holding the current config', async () => {
    const t = await fixture('schemaVersion: [3\n');
    try {
      const directory = path.join(t.repo.root, '.ambicode');
      await t.runtime.fs.writeText(path.join(directory, 'config.yaml.bak-2026-09-01T10-00'), 'schemaVersion: [3\n');
      await t.runtime.fs.writeText(path.join(directory, 'config.yaml.bak-2026-09-02T10-00'), 'schemaVersion: [2\n');
      const { task } = await t.start();
      await t.hook(task, 'back up and regenerate', 'config-unparsable');
      await t.propose(task);
      const closed = await t.hook(task, 'Cancel');
      assert.ok(closed.text.includes('The backup you approved stays: .ambicode/config.yaml.bak-2026-09-01T10-00;'), closed.text);
      assert.equal((await t.runtime.fs.readdir(directory)).filter((entry) => entry.name.startsWith('config.yaml.bak-')).length, 2);
    } finally {
      await t.dispose();
    }
  });

  async function doctorStop(makeText: (doctor: string) => string): Promise<{ decision?: string }> {
    const t = await fixture();
    try {
      const { task } = await t.begin();
      await t.hook(task, 'Apply as proposed');
      await t.apply(task);
      const doctorPath = path.join(t.repo.root, '.ambicode/task', task, 'steps/doctor.md');
      const doctor = await t.runtime.fs.readText(doctorPath);
      const deps: HookDeps = { pointer: t.pointer, load: async () => ({ engine: t.engine, routes: t.routes, pointer: t.pointer }) };
      const transcript = path.join(t.scratchpad, 'transcript.jsonl');
      await writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: makeText(doctor) }] } })}\n`);
      return (await runHook(t.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: t.repo.root, scratchpad_dir: t.scratchpad, transcript_path: transcript }), deps)) as { decision?: string };
    } finally {
      await t.dispose();
    }
  }

  it('09-D5: Stop blocks a doctor read-back that drops the trailer but keeps the changed table', async () => {
    const out = await doctorStop((doctor) => doctor.replaceAll('null', 'ok').replace(/<!-- ambicode doctor .*? -->\n?/, ''));
    assert.equal(out.decision, 'block');
  });

  it('09-D5: Stop blocks a doctor read-back whose hash is self-consistent but over the wrong table', async () => {
    const out = await doctorStop((doctor) => {
      const table = doctor.replace(/<!-- ambicode doctor .*? -->\n?/, '').trimEnd().replaceAll('null', 'ok');
      return `${table}\n<!-- ambicode doctor ${contentHash(table)} -->\n`;
    });
    assert.equal(out.decision, 'block');
  });

  it('09-D5: Stop accepts an unchanged doctor read-back', async () => {
    assert.deepEqual(await doctorStop((doctor) => doctor), {});
  });

  const singleSpaced = (table: string): string => `Doctor:\n${table.replace(/<!-- ambicode doctor .*? -->\n?/, '').split('\n').map((line) => line.replace(/ {2,}/g, ' ')).join('\n')}`;

  it('09-D5: Stop blocks a changed doctor read-back whose columns are re-spaced', async () => {
    assert.equal((await doctorStop((doctor) => singleSpaced(doctor.replaceAll('null', 'ok')))).decision, 'block');
  });

  it('09-D5: Stop accepts an unchanged doctor read-back whose columns are re-spaced', async () => {
    assert.deepEqual(await doctorStop(singleSpaced), {});
  });
});
