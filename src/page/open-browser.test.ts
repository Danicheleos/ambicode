import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import { openInBrowser, openerArgv } from './open-browser.ts';

const URL = 'http://127.0.0.1:53991/?c=capability';

describe('opening the review page in the browser', () => {
  it('uses the desktop opener of each platform', () => {
    assert.deepEqual(openerArgv('darwin', URL), ['open', URL]);
    assert.deepEqual(openerArgv('win32', URL), ['cmd', '/c', 'start', '', URL]);
    assert.deepEqual(openerArgv('linux', URL), ['xdg-open', URL]);
  });

  it('gives the opener no pipes, so the browser it leaves behind cannot hold the run open', async () => {
    const runner = new FakeProcessRunner().stubArgv(['cmd'], { exitCode: 0 });
    const result = await openInBrowser(runner, 'win32', URL, '/work');

    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0]?.output, 'ignore');
    assert.deepEqual(result, { opened: true, detail: 'cmd was asked to open the page' });
  });

  it('reports the opener failing without stopping anything', async () => {
    const failed = new FakeProcessRunner().stubArgv(['xdg-open'], { exitCode: 3 });
    assert.deepEqual(await openInBrowser(failed, 'linux', URL, '/work'), {
      opened: false,
      detail: 'xdg-open exited with 3',
    });

    const missing = new FakeProcessRunner().stubArgv(['open'], {
      kind: 'spawn-failed',
      failure: 'spawn open ENOENT',
    });
    assert.deepEqual(await openInBrowser(missing, 'darwin', URL, '/work'), {
      opened: false,
      detail: 'open could not be started (spawn open ENOENT)',
    });

    const slow = new FakeProcessRunner().stubArgv(['cmd'], { kind: 'timed-out' });
    assert.deepEqual(await openInBrowser(slow, 'win32', URL, '/work'), {
      opened: false,
      detail: 'cmd timed out',
    });
  });
});
