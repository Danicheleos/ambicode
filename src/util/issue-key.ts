/** A tracker key such as ORD-17. Uppercase only: `utf-8` and `es-2022` are not tickets. */
const KEY = '[A-Z][A-Z0-9]+-\\d+';

/** The first key inside a text, such as a ticket link. */
export const findIssueKey = (text: string): string | null => new RegExp(`\\b${KEY}\\b`).exec(text)?.[0] ?? null;

export const isIssueKey = (word: string): boolean => new RegExp(`^${KEY}$`).test(word);

/** Whether `text` holds `key` as a whole token: `ORD-1` is not inside `ORD-12` or `XORD-1`, but is inside `/browse/ORD-1?x=1`. */
export const namesKey = (text: string, key: string): boolean => new RegExp(`(?<![\\w-])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text);

/** The identity of a requirement source: the issue key a URL or bare key carries, else the string itself, so `.../browse/ORD-1` and `ORD-1` are one source. */
export const sourceId = (source: string): string => findIssueKey(source) ?? source.trim();
