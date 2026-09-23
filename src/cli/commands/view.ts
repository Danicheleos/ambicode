import path from 'node:path';
import { REVIEWS_DIR, REVIEWS_LEAF, TASKS_DIR } from '../../config/defaults.ts';
import { openRepository, type Runtime } from '../../composition/root.ts';
import type { PublicationPositions, PublicationRecord } from '../../contracts/publication.ts';
import type { RemoteTarget, ReviewProvider } from '../../contracts/provider.ts';
import type { ReviewResult } from '../../contracts/review.ts';
import { sweepOwnedTemporaries, type SweepReport } from '../../page/cleanup.ts';
import { openInBrowser } from '../../page/open-browser.ts';
import { reopenCommand } from '../../page/reopen.ts';
import { createPageServer } from '../../page/server.ts';
import { validateReviewAggregate } from '../../publication/aggregate.ts';
import { reconcileUncertainOutcomes } from '../../publication/publish.ts';
import { ReviewStore } from '../../publication/store.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';

/**
 * `ambicode view --review <review-id-or-result-path>`: opens a saved review in
 * a local page so a human can read it and, for a merge request review, select
 * comments to publish.
 *
 * It is an ordinary helper command, not a second slash skill. Everything it
 * serves comes from the saved result and the positions derived when the review
 * ran; nothing is recomputed from the current branch or the current merge
 * request (doc 03 P1.6).
 */

export const VIEW_OPTIONS = {
  values: ['review'],
  flags: ['json', 'no-open'],
} as const;

/** Temporary directories older than this are swept at startup, if AMBICODE owns them. */
export const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const REVIEW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ViewOutput {
  command: 'view';
  reviewId: string;
  reviewDirectory: string;
  url: string;
  port: number;
  browserOpened: boolean;
  browserDetail: string;
  idleTimeoutSeconds: number;
  publicationAvailable: boolean;
  notes: string[];
  cleanup: SweepReport;
  /** Resolves with why the server stopped; awaited by the CLI, not by tests. */
  stopped: Promise<string>;
  stop(reason: string): Promise<void>;
}

export interface ViewDependencies {
  /** Injected by tests so nothing binds a socket or launches a browser. */
  listen?: boolean;
  openBrowser?: boolean;
  platform?: string;
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

  // Only AMBICODE's own expired temporary directories, and only ones carrying
  // its ownership marker. Saved results, drafts and publication history are in
  // the repository and are never touched.
  const cleanup = await sweepOwnedTemporaries({
    fs: runtime.fs,
    clock: runtime.clock,
    maxAgeMs: SWEEP_MAX_AGE_MS,
  });

  const store = new ReviewStore(runtime.fs, runtime.clock, reviewDirectory);
  const result = await store.readResult();
  const positions = await store.readPositions();
  let record = await store.readPublication(result.reviewId);

  // Each file already validated against its own schema; this additionally
  // proves the three agree with each other before a provider or the page
  // server is built on them (doc 03 P1.7 correction D).
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
  const server = await createPageServer({
    fs: runtime.fs,
    clock: runtime.clock,
    ids: runtime.ids,
    store,
    result,
    positions,
    record,
    provider,
    templatesDirectory: path.join(runtime.pluginRoot, 'templates'),
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    reopenCommand: reopenCommand(result.reviewId),
    processId: process.pid,
  });

  let port = 0;
  let url = '';
  if (dependencies.listen !== false) {
    // Loopback only, on a port the operating system picks: nothing on the
    // network can reach this page, and no fixed port can be squatted.
    const address = await server.app.listen({ host: '127.0.0.1', port: 0 });
    port = portOf(server.app.server.address()) ?? 0;
    const authority = `127.0.0.1:${port}`;
    server.setAuthority(authority);
    // The capability appears here and nowhere else: not in a log, not on disk.
    url = `http://${authority}/?c=${server.capability}`;
    void address;
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
 * A review id names a directory under one of the repository's review
 * directories; a path is accepted too, and then checked to be inside one of
 * them. Neither form may escape: a saved review is repository state, not an
 * arbitrary file to serve.
 */
async function resolveReviewDirectory(
  runtime: Runtime,
  repositoryRoot: string,
  requested: string,
): Promise<string> {
  const roots = await reviewRoots(runtime, repositoryRoot);

  let candidate: string;
  if (REVIEW_ID.test(requested) && !requested.includes(path.sep) && !requested.endsWith('.json')) {
    // The id stays short because the task directory above it already names the
    // ticket, so the id alone does not say which root holds it. Ask each.
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
    // Nothing found: point the not-found message at a real place rather than
    // at whichever root happened to be enumerated first.
    candidate = found[0] ?? path.join(repositoryRoot, REVIEWS_DIR, requested);
  } else {
    const absolute = path.isAbsolute(requested) ? requested : path.resolve(runtime.cwd, requested);
    candidate = absolute.endsWith('.json') ? path.dirname(absolute) : absolute;
  }

  // Both sides are resolved through their links before they are compared: a
  // temporary directory reached by a symlinked path is the same directory, and
  // a link out of the review directory must not become a way past this check.
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

/**
 * The provider that owns this review's remote, or null for a local review and
 * for a provider that does not implement publication.
 */
/**
 * Every directory a saved review can live in: the merge-request home under
 * `REVIEWS_DIR`, and one `reviews/` leaf per task directory. A task that has
 * no review yet contributes a path that does not exist, which costs one
 * `exists` call and keeps this free of special cases.
 */
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
): Promise<{ idleTimeoutSeconds: number }> {
  const { loadConfig } = await import('../../config/load.ts');
  const loaded = await loadConfig(runtime.fs, repositoryRoot);
  return loaded.config.page;
}

function portOf(address: unknown): number | null {
  if (address !== null && typeof address === 'object' && 'port' in address) {
    const port = (address as { port: unknown }).port;
    return typeof port === 'number' ? port : null;
  }
  return null;
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
    `The link works once. Stop the page with its "Close the page" button, with Ctrl-C, or leave it to idle out after ${output.idleTimeoutSeconds}s.`,
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
