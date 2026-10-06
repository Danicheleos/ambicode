import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { contentHash } from '../util/hash.ts';
import { ledgerRouteContext } from '../route/context.ts';
import type { HookDeps } from '../hook/events/run-hook.ts';
import { runHook } from '../hook/events/run-hook.ts';
import { routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { applyInit } from './apply.ts';
import { INIT_HANDLERS } from './init-route.ts';
import { loadConfigWithNotices } from './load.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const STEP = 'routes/steps/init-apply-run.md';

async function fixture(config: string | null = null): Promise<RouteFixture & {
  start(extra?: object): ReturnType<RouteFixture['engine']['start']>;
  hook(task: string, option: string, gate?: string): ReturnType<RouteFixture['engine']['advance']>;
  print(task: string, gate?: string): Promise<Record<string, unknown>>;
  apply(task: string, sets?: readonly string[], session?: string | null): Promise<Awaited<ReturnType<typeof applyInit>> & { next: string }>;
  exists(relative: string): Promise<boolean>;
}> {
  const fx = await routeFixture({
    routes: { init: await readFile(path.join(ROOT, 'routes', 'init.yaml'), 'utf8') },
    handlers: { ...INIT_HANDLERS },
    step: { [STEP]: await readFile(path.join(ROOT, STEP), 'utf8') },
    config,
  });
  const print = async (task: string, gate = 'init-apply') => (await fx.kinds(task, 'gate')).filter((entry) => entry['gate'] === gate).at(-1)!;
  return {
    ...fx,
    start: (extra = {}) => fx.engine.start({ skill: 'init', text: '', requirements: [], cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...extra }),
    hook: async (task, option, gate = 'init-apply') => fx.engine.advance({ task, session: A, cause: 'gate-hook', answers: [{ gate, option, instance: (await print(task, gate)).id as string }], scratchpadDir: fx.scratchpad }),
    print,
    apply: async (task, sets = [], session = A) => {
      const result = await applyInit({ runtime: fx.runtime, session, context: ledgerRouteContext({ runtime: fx.runtime, routes: fx.routes }), doctor: { startIndex: async () => ({ state: 'building' }) as never } }, { task, sets });
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
      const started = await t.start();
      assert.equal(started.position, 'init-apply');
      assert.ok(await t.exists(`.ambicode/task/${started.task}/steps/proposal.json`));
      const print = await t.print(started.task);
      assert.deepEqual(print['options'], ['Apply as proposed', 'Adjust', 'Cancel']);
      assert.match(String(print['question']), /^Values: as proposed$/m);
      assert.match(String(print['question']), /init --apply --task init-\d{4}-\d{2}-\d{2}$/m);

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
      const first = await t.start();
      await t.hook(first.task, 'Cancel');
      const second = await t.start();
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

  it('09-G2/09-G4: Adjust free text re-prints with the values; stale typed values differ; the adjusted values apply', async () => {
    const t = await fixture();
    try {
      const { task } = await t.start();
      await t.hook(task, 'search.index=codeindex bogus');
      const print = await t.print(task);
      assert.deepEqual(print['options'], ['Apply as adjusted', 'Adjust', 'Cancel']);
      assert.match(String(print['question']), /^Values: search\.index="codeindex"$/m);
      assert.match(String(print['question']), /^You wrote: "search\.index=codeindex bogus"$/m);
      assert.match(String(print['question']), /^not understood: bogus$/m);
      assert.match(String(print['question']), /--set 'search\.index="codeindex"'$/m);
      await t.hook(task, 'Apply as adjusted');

      await assert.rejects(t.apply(task), code('init-unconfirmed', 'values-differ'));
      assert.equal(await t.exists('.ambicode/config.yaml'), false);
      await t.apply(task, ['search.index=codeindex']);
      const config = await loadConfigWithNotices(t.runtime.fs, t.repo.root);
      assert.equal(config.config.search.index, 'codeindex');
      assert.ok(config.config.search.layers?.prompt?.includes('index.find'));
    } finally {
      await t.dispose();
    }
  });

  it('09-G6: a headless start with no preanswer takes Cancel and prints the apply line', async () => {
    const t = await fixture();
    try {
      const done = await t.start({ headless: true });
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
      const started = await t.start({ answers: [{ gate: 'init-apply', option: 'Apply as proposed' }] });
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
      const { task } = await t.start();
      const again = await t.hook(task, 'Apply as adjusted');
      assert.equal(again.position, 'init-apply');
      assert.equal((await t.kinds(task, 'declined')).at(-1)?.['reason'], 'option-not-offered');
      await assert.rejects(t.apply(task), code('init-unconfirmed', 'no-answer'));

      const preanswered = await fixture();
      try {
        const started = await preanswered.start({ answers: [{ gate: 'init-apply', option: 'Apply as adjusted' }] });
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
      const { task } = await t.start();
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
      await assert.rejects(t.apply('init-2026-10-05', [], null), code('session-unbound'));
      await assert.rejects(t.apply('init-2026-10-05'), code('init-unconfirmed', 'no-init-route'));
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
      assert.equal(next.position, 'init-apply');
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
      const { task } = await t.start();
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
