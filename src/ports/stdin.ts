/**
 * Standard input as an injected dependency, like every other process-level
 * resource (doc 02): the hook entry point reads its JSON payload here, and
 * `--evidence -` reads the requirement envelope here, so neither reaches for
 * `process.stdin` on its own and a test can supply bytes without a pipe.
 *
 * Every read is bounded. Exceeding the bound returns `null` rather than a
 * truncated string, because the two callers want opposite things from an
 * oversized payload: the hook must stay a silent no-op (doc 04 P2.4
 * correction G7), while a requirement envelope that did not arrive whole must
 * fail loudly rather than be normalized as if it had.
 */

export interface StandardInput {
  /** The whole stream as UTF-8, or `null` if it exceeded `maxBytes`. */
  read(maxBytes: number): Promise<string | null>;
}

export async function readBoundedStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const processStandardInput: StandardInput = {
  read: (maxBytes: number) => readBoundedStream(process.stdin, maxBytes),
};
