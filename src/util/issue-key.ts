/** A tracker key such as ORD-17. Uppercase only: `utf-8` and `es-2022` are not tickets. */
const KEY = '[A-Z][A-Z0-9]+-\\d+';

/** The first key inside a text, such as a ticket link. */
export const findIssueKey = (text: string): string | null => new RegExp(`\\b${KEY}\\b`).exec(text)?.[0] ?? null;

export const isIssueKey = (word: string): boolean => new RegExp(`^${KEY}$`).test(word);
