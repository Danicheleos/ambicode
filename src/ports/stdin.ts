export interface StandardInput {
  /**
   * `null`, never a truncated string, when the stream exceeds `maxBytes`: the hook must stay a
   * silent no-op on an oversized payload, while a requirement envelope must fail loudly.
   */
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
