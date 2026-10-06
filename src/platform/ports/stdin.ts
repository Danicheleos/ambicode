import type { StandardInput } from '#types/ports';

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
