// Node implementations of the platform ports. The port interfaces themselves (Clock, FileSystem, IdSource,
// ProcessRunner, Reviewer, StandardInput, …) live in #types/ports so every area depends on contracts, not on Node.

// clock.ts: wall-clock Clock.
export { systemClock } from './clock.ts';

// filesystem.ts: FileSystem backed by node:fs.
export { nodeFileSystem } from './filesystem.ts';

// ids.ts: IdSource producing random identifiers.
export { systemIds } from './ids.ts';

// stdin.ts: StandardInput over process.stdin with a byte bound.
/** readBoundedStream(stream, maxBytes) — reads a stream as UTF-8, returning null when it exceeds maxBytes. */
export { readBoundedStream } from './stdin.ts';
export { processStandardInput } from './stdin.ts';

// process.ts / node-process-runner.ts: ProcessRunner over execa with an allow-listed environment.
/** resolveEnvironment(...) — builds the child environment for a ProcessRequest from its EnvironmentPolicy and the base env. */
export { resolveEnvironment } from './process.ts';
/** NodeProcessRunner — ProcessRunner implementation; `new NodeProcessRunner(env?)` then `.run(request)` for a bounded, timed process. */
export { NodeProcessRunner } from './node-process-runner.ts';

// binary.ts: binary-content detection.
/** isBinaryContent(bytes) — whether bytes are binary (the decision on content, not extension). */
export { isBinaryContent } from './binary.ts';
