import { isBinaryFile } from 'isbinaryfile';

/** The decision on bytes; the path-class extension list is only an early optimization. */
export async function isBinaryContent(bytes: Uint8Array): Promise<boolean> {
  return await isBinaryFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
