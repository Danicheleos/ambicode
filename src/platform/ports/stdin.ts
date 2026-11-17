import type { StandardInput } from '#types/platform/ports';

async function readStream(stream: NodeJS.ReadableStream): Promise<string | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export const processStandardInput: StandardInput = {
  read: () => readStream(process.stdin),
};
