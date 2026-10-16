// Shared reading of a trace (stream-json lines) and small statistics for the eval scripts.

/** The parsed events of a JSON-lines text; a line that is not JSON (a truncated trace) is skipped. */
export const events = (text) => text.split('\n').flatMap((line) => {
  if (!line.trim()) return [];
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
});

/** What one model call was sent: input + cache-created + cache-read tokens. */
export const contextTokens = (usage) => (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);

export const mean = (values) => (values.length === 0 ? null : values.reduce((total, v) => total + v, 0) / values.length);
