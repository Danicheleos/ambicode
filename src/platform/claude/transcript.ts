import { open } from 'node:fs/promises';

export const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;

/** The text of the last assistant turn, read from the end of the transcript; null when it cannot be read. */
export async function lastAssistantText(transcript: string): Promise<string | null> {
  try {
    const handle = await open(transcript, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const lines = buffer.toString('utf8').split('\n').slice(size > length ? 1 : 0);
      for (const line of lines.reverse()) {
        if (line.trim() === '') continue;
        let entry: { type?: string; message?: { role?: string; content?: unknown } };
        try {
          entry = JSON.parse(line) as typeof entry;
        } catch {
          continue;
        }
        if (entry.type !== 'assistant' && entry.message?.role !== 'assistant') continue;
        const content = entry.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.flatMap((block: { type?: string; text?: string }) => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])).join('\n') : '';
        if (text.trim() !== '') return text;
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
