import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Activity } from '#types/primitives';
import { PREPARE_OPTIONS } from '#types/cli';
import { createRuntime } from '#composition/root';
import { parseArgs } from '#util/args';
import { PREPARE_DEPRECATED, prepareAsRouteStart, prepareCommand } from './prepare.ts';

describe('prepare is a deprecated alias of route start', () => {
  for (const activity of Activity.options) {
    it(`maps --activity ${activity} to route start ${activity} with the notice`, () => {
      const args = parseArgs('prepare', ['--activity', activity, '--term', 'cart', '--requirement', 'https://x.atlassian.net/browse/ORD-1', '--project', 'app'], PREPARE_OPTIONS);
      const { argv, notices } = prepareAsRouteStart(args, activity);
      assert.deepEqual(argv, [activity, 'cart', '--requirement', 'https://x.atlassian.net/browse/ORD-1', '--project', 'app']);
      assert.deepEqual(notices, [PREPARE_DEPRECATED]);
    });
  }

  it('says --evidence is ignored', () => {
    const args = parseArgs('prepare', ['--activity', 'task', '--evidence', '-'], PREPARE_OPTIONS);
    assert.equal(prepareAsRouteStart(args, 'task').notices.length, 2);
  });

  it('refuses a missing or unknown activity before starting anything', async () => {
    const runtime = await createRuntime({ cwd: process.cwd() });
    for (const argv of [[], ['--activity', 'nope']]) {
      await assert.rejects(prepareCommand.run(runtime, parseArgs('prepare', argv, PREPARE_OPTIONS)), (error: unknown) => (error as { code?: string }).code === 'bad-argument');
    }
  });
});
