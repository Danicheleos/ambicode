/** Git's rule (`buffer_is_binary`): a NUL byte in the first 8,000 bytes. */
const SNIFF_BYTES = 8000;

/** The decision on bytes; the path-class extension list is only an early optimization. */
export async function isBinaryContent(bytes: Uint8Array): Promise<boolean> {
  return bytes.subarray(0, SNIFF_BYTES).includes(0);
}
