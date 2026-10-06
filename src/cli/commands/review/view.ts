import path from 'node:path';
import { REVIEWS_DIR, REVIEWS_LEAF, TASKS_DIR } from '#types/defaults';
import { openRepository } from '#composition/root';
import type { PublicationPositions, PublicationRecord } from '#types/modules/publication';
import type { RemoteTarget, ReviewProvider } from '#types/platform/provider';
import type { ReviewResult } from '#types/modules/review';
import { sweepOwnedTemporaries } from '#modules/review/page/cleanup';
import { openInBrowser } from '#modules/review/page/open-browser';
import { reopenCommand } from '#modules/review/page/reopen';
import { createPageServer } from '#modules/review/page/server';
import { bindPort, removeControlFile, writeControlFile } from '#modules/review/page/takeover';
import { validateReviewAggregate } from '#modules/review/publication/aggregate';
import { reconcileUncertainOutcomes } from '#modules/review/publication/publish';
import { ReviewStore } from '#modules/review/publication/store';
import { AmbicodeError } from '#util/errors';
import { pageTemplatesDirectory } from '#util/plugin-root';
import type { Runtime } from '#types/composition';
import type { ParsedArgs } from '../../types/cli.ts';
import type { ViewOutput } from '../../types/commands.ts';

/**
 * Everything served comes from the saved result and the positions derived when
 * the review ran; nothing is recomputed from the current branch or merge request.
 */

export { VIEW_OPTIONS } from '../../types/options.ts';

/** Temporary directories older than this are swept at startup, if AMBICODE owns them. */
const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const REVIEW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface ViewDependencies {
  listen?: boolean;
  openBrowser?: boolean;
  platform?: string;
  log?: (line: string) => void;
  port?: number;
}

export async function runView(
  runtime: Runtime,
  args: ParsedArgs,
  dependencies: ViewDependencies = {},
): Promise<ViewOutput> {
  const requested = args.value('review');
  if (requested === null || requested.trim() === '') {
    throw new AmbicodeError('bad-argument', '--review needs a review id or the path of a saved result.', {
      field: '--review',
      details: [`For example: ${reopenCommand('<review-id>')}`],
    });
  }

  const { repositoryRoot } = await openRepository(runtime);
  const reviewDirectory = await resolveReviewDirectory(runtime, repositoryRoot, requested.trim());

  // Only expired temporaries carrying AMBICODE's ownership marker; saved
  // results, drafts and publication history are never touched.
  const cleanup = await sweepOwnedTemporaries({
    fs: runtime.fs,
    clock: runtime.clock,
    maxAgeMs: SWEEP_MAX_AGE_MS,
  });

  const store = new ReviewStore(runtime.fs, runtime.clock, reviewDirectory);
  const result = await store.readResult();
  const positions = await store.readPositions();
  let record = await store.readPublication(result.reviewId);

  // Each file is schema-valid on its own; this proves the three agree before a
  // provider or the page server is built on them.
  validateReviewAggregate({ result, positions, record });

  const provider = providerFor(runtime, result);
  const notes: string[] = [
    ...cleanup.failures,
    ...cleanup.skipped.map(
      (directory) => `${directory} matched an AMBICODE temporary name but carries no ownership marker, so it was left alone.`,
    ),
  ];

  // Uncertain deliveries are reconciled before the page offers another attempt,
  // so a human is never asked to retry a comment that already exists.
  if (provider !== null && positions !== null && result.target.remote !== null) {
    const reconciled = await reconcileUncertainOutcomes({
      provider,
      target: result.target.remote,
      reviewId: result.reviewId,
      positions: new Map(positions.positions.map((entry) => [entry.findingId, entry])),
      outcomes: record.outcomes,
      clock: runtime.clock,
    });
    notes.push(...reconciled.notes);
    if (reconciled.updated.length > 0) {
      record = await store.recordSubmission(record, {
        submissionId: `reconcile-${runtime.clock.now().toISOString()}`,
        submittedAt: runtime.clock.now().toISOString(),
        stopped: false,
        stoppedReason: null,
        revisionState: null,
        outcomes: reconciled.updated,
      });
    }
  }

  const config = await readPageConfig(runtime, repositoryRoot);
  const takeoverToken = runtime.ids.capability();
  let controlPort: number | null = null;
  const server = await createPageServer({
    fs: runtime.fs,
    clock: runtime.clock,
    ids: runtime.ids,
    store,
    result,
    positions,
    record,
    provider,
    templatesDirectory: pageTemplatesDirectory(runtime.pluginRoot),
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    reopenCommand: reopenCommand(result.reviewId),
    processId: process.pid,
    ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
    takeoverToken,
    beforeClose: async () => {
      if (controlPort !== null) await removeControlFile(runtime.fs, controlPort, takeoverToken);
    },
  });

  let port = 0;
  let url = '';
  if (dependencies.listen !== false) {
    // Loopback only: nothing on the network can reach this page. The fixed
    // port is taken from a previous page, never from anything else.
    const bound = await bindPort(server.app, runtime.fs, dependencies.port ?? config.port);
    port = bound.port;
    if (bound.note !== null) notes.push(bound.note);
    // Only the fixed port is findable by a successor; an OS-picked one is not.
    if (port === (dependencies.port ?? config.port)) {
      await writeControlFile(runtime.fs, { port, pid: process.pid, token: takeoverToken });
      controlPort = port;
    }
    const authority = `127.0.0.1:${port}`;
    server.setAuthority(authority);
    // The capability appears here and nowhere else: not in a log, not on disk.
    url = `http://${authority}/${server.capability}`;
  }

  let browserOpened = false;
  let browserDetail = 'The browser was not launched.';
  if (dependencies.openBrowser !== false && !args.flag('no-open') && url !== '') {
    const opened = await openInBrowser(
      runtime.runner,
      dependencies.platform ?? process.platform,
      url,
      runtime.cwd,
    );
    browserOpened = opened.opened;
    browserDetail = opened.detail;
  }

  return {
    command: 'view',
    reviewId: result.reviewId,
    reviewDirectory,
    url,
    port,
    browserOpened,
    browserDetail,
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    publicationAvailable: provider !== null && positions !== null && positions.positions.length > 0,
    notes,
    cleanup,
    stopped: server.stopped,
    stop: server.stop,
  };
}

/**
 * An id or a path, but either must resolve inside a review directory: a saved
 * review is repository state, not an arbitrary file to serve.
 */
async function resolveReviewDirectory(
  runtime: Runtime,
  repositoryRoot: string,
  requested: string,
): Promise<string> {
  const roots = await reviewRoots(runtime, repositoryRoot);

  let candidate: string;
  if (REVIEW_ID.test(requested) && !requested.includes(path.sep) && !requested.endsWith('.json')) {
    // The task directory above it names the ticket, so the id alone does not
    // say which root holds it.
    const found: string[] = [];
    for (const root of roots) {
      const attempt = path.join(root, requested);
      if (await runtime.fs.exists(attempt)) found.push(attempt);
    }
    if (found.length > 1) {
      throw new AmbicodeError('review-ambiguous', `More than one saved review is called ${requested}.`, {
        field: '--review',
        details: [...found, 'Pass the path instead of the id.'],
      });
    }
    // Nothing found: point the not-found message at a real place, not the first root enumerated.
    candidate = found[0] ?? path.join(repositoryRoot, REVIEWS_DIR, requested);
  } else {
    const absolute = path.isAbsolute(requested) ? requested : path.resolve(runtime.cwd, requested);
    candidate = absolute.endsWith('.json') ? path.dirname(absolute) : absolute;
  }

  // Both sides resolve links before comparing: a symlinked temporary path is
  // the same directory, and a link out of the review directory must not pass.
  const normalized = await resolveLinks(runtime, path.resolve(candidate));
  let inside = false;
  for (const root of roots) {
    const boundary = await resolveLinks(runtime, path.resolve(root));
    if (normalized === boundary || normalized.startsWith(`${boundary}${path.sep}`)) {
      inside = true;
      break;
    }
  }
  if (!inside) {
    throw new AmbicodeError('review-outside-repository', 'That review is not inside this repository.', {
      field: '--review',
      details: [
        `Saved reviews live under ${TASKS_DIR}/<task>/${REVIEWS_LEAF}/, and a merge-request review under ${REVIEWS_DIR}/, in the repository this command runs in.`,
        'Pass a review id, or a path inside one of those directories.',
      ],
    });
  }
  if (!(await runtime.fs.exists(normalized))) {
    throw new AmbicodeError('review-not-found', `No saved review at ${normalized}.`, {
      field: '--review',
      details: ['Run `ambicode review` first, or check the id in the review report.'],
    });
  }
  return normalized;
}

/** A task with no review yet contributes a nonexistent path: one `exists` call, no special case. */
async function reviewRoots(runtime: Runtime, repositoryRoot: string): Promise<string[]> {
  const roots = [path.join(repositoryRoot, REVIEWS_DIR)];
  const tasks = path.join(repositoryRoot, TASKS_DIR);
  if (!(await runtime.fs.exists(tasks))) return roots;
  for (const entry of await runtime.fs.readdir(tasks)) {
    if (entry.isDirectory()) roots.push(path.join(tasks, entry.name, REVIEWS_LEAF));
  }
  return roots;
}

/** The real path when it exists, the literal one when it does not. */
async function resolveLinks(runtime: Runtime, candidate: string): Promise<string> {
  try {
    return await runtime.fs.realpath(candidate);
  } catch {
    try {
      return path.join(await runtime.fs.realpath(path.dirname(candidate)), path.basename(candidate));
    } catch {
      return candidate;
    }
  }
}

function providerFor(runtime: Runtime, result: ReviewResult): ReviewProvider | null {
  const remote: RemoteTarget | null = result.target.remote;
  if (result.target.kind !== 'merge-request' || remote === null) return null;
  try {
    const provider = runtime.providers.byId(remote.provider);
    return provider.id === 'gitlab' ? provider : null;
  } catch {
    return null;
  }
}

async function readPageConfig(
  runtime: Runtime,
  repositoryRoot: string,
): Promise<{ idleTimeoutSeconds: number; port: number }> {
  const { loadConfig } = await import('#modules/config/load');
  const loaded = await loadConfig(runtime.fs, repositoryRoot);
  return loaded.config.page;
}

export function renderView(output: ViewOutput): string {
  const lines = [
    `Review ${output.reviewId} is open at:`,
    '',
    `  ${output.url}`,
    '',
    output.browserOpened
      ? `The browser was opened (${output.browserDetail}).`
      : `The browser was not opened (${output.browserDetail}). Paste the URL above into a browser on this machine.`,
    `The link works in any browser on this machine until the page stops. Stop the page with its "Close the page" button, with Ctrl-C, or leave it to idle out after ${output.idleTimeoutSeconds}s.`,
    output.publicationAvailable
      ? 'Selected comments can be published to the merge request from the page. Nothing is sent until you submit the form.'
      : 'This review has no remote publication action.',
    `Saved drafts and publication history: ${output.reviewDirectory}`,
  ];
  for (const note of output.notes) lines.push(`  - ${note}`);
  if (output.cleanup.removed.length > 0) {
    lines.push(`Removed ${output.cleanup.removed.length} expired AMBICODE temporary director(ies).`);
  }
  return lines.join('\n');
}

export type { PublicationPositions, PublicationRecord };
