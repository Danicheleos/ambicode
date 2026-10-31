import { loadConfig } from '#modules/config/load';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { SECRET_HEADER, startPageServer } from '#modules/review/page/server';
import { readPageLinks, readPageState, removePageState, writePageLinks, writePageState, type PageState } from '#modules/review/page/state';
import { PAGE_IDLE_MS } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import { taskOf } from '../route/route.ts';
import { pageApp } from './page-app.ts';
import type { Runtime } from '#types/composition';
import type { CliCommand } from '../../types/cli.ts';

/** A review that starts at the same moment as the first one finds its port taken before the first has written its record: 3 tries, 150 ms apart, cover that gap. */
const REGISTER_TRIES = 3;
const REGISTER_PAUSE_MS = 150;

/** The login link of a running server of this repository, or null when nothing there knows the secret (a stale record, or another process). */
async function register(runtime: Runtime, state: PageState, slug: string): Promise<string | null> {
  const response = await runtime.http.call(state.port, { method: 'POST', url: '/register', headers: { [SECRET_HEADER]: state.secret }, body: new URLSearchParams({ task: slug }).toString() });
  if (response === null || response.status === 403) return null;
  if (response.status !== 200) throw new AmbicodeError('review-unreadable', `the running review page server does not know ${slug}.`, { field: 'task' });
  const url = (JSON.parse(response.body ?? '{}') as { url?: unknown }).url;
  return typeof url === 'string' ? url : null;
}

/** Runs until the page server stops, or returns at once when this repository's server already runs. Prints the link, preceded by any note, for the step that spawned it. */
export const reviewPageCommand: CliCommand = {
  name: 'review page',
  summary: "Open the task's recorded review on the repository's local review page server (--task); prints its login link (valid 24 h).",
  options: { values: ['task'], flags: ['json'] },
  run: async (runtime, args) => {
    const slug = taskOf('review page', args);
    const root = (await resolveTaskDir(runtime, slug, 'review')).repositoryRoot;
    const open = new Set<string>();
    const app = pageApp(runtime, root, open);
    if ((await app.admit(new URLSearchParams({ task: slug }))) === null) throw new AmbicodeError('review-unreadable', `${slug} has no readable recorded review to show.`, { field: 'task' });
    const said = (line: string): void => void process.stdout.write(`${line}\n`);

    const known = await readPageState(runtime.fs, root);
    if (known !== null) {
      const url = await register(runtime, known, slug);
      if (url !== null) { said(url); return { text: 'review page: registered with the running server', data: { command: 'review page', registered: true } }; }
      await removePageState(runtime.fs, root, known);
    }

    const configured = (await loadConfig(runtime.fs, root).catch(() => null))?.config.skills.review.pagePort ?? null;
    const secret = runtime.ids.capability();
    const start = (port: number) => startPageServer({ host: runtime.http, ids: runtime.ids, idleMs: PAGE_IDLE_MS, port, secret, handle: app.handle, admit: app.admit, now: () => runtime.clock.now().getTime(), linkStore: { load: () => readPageLinks(runtime.fs, root, runtime.clock.now().getTime()), save: (links) => writePageLinks(runtime.fs, root, links) } });
    let server: Awaited<ReturnType<typeof start>>;
    let note: string | null = null;
    try {
      server = await start(configured ?? 0);
    } catch (error) {
      if (configured === null || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      for (let attempt = 0; attempt < REGISTER_TRIES; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, REGISTER_PAUSE_MS));
        const state = await readPageState(runtime.fs, root);
        const url = state === null ? null : await register(runtime, state, slug);
        if (url !== null) { said(url); return { text: 'review page: registered with the running server', data: { command: 'review page', registered: true } }; }
      }
      note = `Port ${configured} is held by another process, which is left alone; the review page uses a free port instead.`;
      server = await start(0);
    }
    const own = { port: server.port, secret };
    await writePageState(runtime.fs, root, own);
    // One write: the spawning step stops reading at the first newline it sees.
    said(`${note === null ? '' : `${note}\n`}${server.mint(`/r/${encodeURIComponent(slug)}`)}`);
    process.stdout.on('error', () => undefined);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void server.stop(signal));
    const reason = await server.stopped;
    await removePageState(runtime.fs, root, own);
    return { text: `review page stopped: ${reason}`, data: { command: 'review page', stopped: reason } };
  },
};
