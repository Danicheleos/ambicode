import { isObject } from '#util/guards';
import type { EnvelopeSource } from '#types/modules/requirements';

// Tracker API plumbing: links and icons, never ticket text.
const PLUMBING = new Set(['self', 'expand', 'avatarUrls', 'iconUrl', '_links']);
// Jira noise that never states the requirement: edit history, time logs, watcher and vote counts. On a synthetic issue (15 comments, 30 changelog histories) they were most of the render's growth over the raw JSON.
const NOISE = new Set(['changelog', 'worklog', 'watches', 'votes']);
// Account metadata of a user object (the one with a displayName, whose name stays).
const USER_META = new Set(['accountId', 'emailAddress', 'timeZone', 'accountType', 'active']);
const BLOCK_NODES = new Set(['doc', 'paragraph', 'heading', 'listItem', 'bulletList', 'orderedList', 'codeBlock', 'blockquote', 'tableRow']);
const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const adfNode = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (!isObject(node)) return '';
  const attrs = isObject(node['attrs']) ? node['attrs'] : {};
  const children = Array.isArray(node['content']) ? node['content'] : [];
  switch (node['type']) {
    case 'inlineCard': return text(attrs['url']);
    case 'blockCard':
    case 'embedCard': return `${text(attrs['url'])}\n`;
    case 'mention': return text(attrs['text']);
    case 'hardBreak': return '\n';
    case 'tableRow': return `${children.map((cell) => adfNode(cell).replace(/\s*\n\s*/g, ' ').trim()).join(' | ')}\n`;
  }
  if (typeof node['text'] === 'string') {
    const link = Array.isArray(node['marks']) ? node['marks'].find((mark) => isObject(mark) && mark['type'] === 'link') : undefined;
    const href = isObject(link) && isObject(link['attrs']) ? text(link['attrs']['href']) : '';
    return href === '' || href === node['text'] ? node['text'] : `${node['text']} (${href})`;
  }
  if (children.length === 0) return '';
  const joined = children.map(adfNode).join('');
  return BLOCK_NODES.has(String(node['type'])) ? `${joined}\n` : joined;
};
const adfText = (node: unknown): string => adfNode(node).replace(/\n{2,}/g, '\n');

/** Confluence storage format and rendered bodies are HTML: keep the words and the line and cell breaks. */
const htmlText = (html: string): string =>
  html
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|blockquote|ac:parameter)>|<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|lt|gt|quot|amp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const isAdf = (value: unknown): boolean => isObject(value) && typeof value['type'] === 'string' && Array.isArray(value['content']);

function lines(value: unknown, label: string, out: string[], depth = 0): void {
  if (value === null || value === undefined || depth > 12) return;
  if (typeof value === 'string') {
    const text = /<\/?[a-z][^>]*>/i.test(value) ? htmlText(value) : value.trim();
    if (text !== '') out.push(text.includes('\n') ? `${label}:\n${text}` : `${label}: ${text}`);
  } else if (typeof value === 'number' || typeof value === 'boolean') out.push(`${label}: ${value}`);
  else if (isAdf(value)) {
    const text = adfText(value).trim();
    if (text !== '') out.push(`${label}:\n${text}`);
  } else if (Array.isArray(value)) value.forEach((child, index) => lines(child, `${label}[${index}]`, out, depth + 1));
  else if (isObject(value)) {
    const user = typeof value['displayName'] === 'string';
    for (const [field, child] of Object.entries(value)) if (!PLUMBING.has(field) && !NOISE.has(field) && !(user && USER_META.has(field))) lines(child, label === '' ? field : `${label}.${field}`, out, depth + 1);
  }
}

/** The readable text of one captured result: every string, number and rich-text field of its JSON, labelled by path; anything that is not JSON stays as captured. */
export function renderRequirement(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!isObject(parsed) && !Array.isArray(parsed)) return content;
  const out: string[] = [];
  lines(parsed, '', out);
  return out.length === 0 ? content : out.join('\n');
}

/**
 * The task's requirements text: what was not captured first, then each captured source whole. `unfetched` are the
 * asked keys that were never fetched because no requirements server is configured; they are gaps too.
 */
export function renderRequirements(sources: readonly Pick<EnvelopeSource, 'key' | 'url' | 'content' | 'cutFrom'>[], missingAsked: readonly string[], unfetched: readonly string[] = []): string {
  const failed = missingAsked.filter((key) => !unfetched.includes(key));
  const missing = [
    ...(failed.length === 0 ? [] : [`Not captured: ${failed.join(', ')}; list it under Not verified.`]),
    ...unfetched.filter((key) => missingAsked.includes(key)).map((key) => `${key} looks like a ticket key; no requirements server is configured, so it was not fetched; list it under Not verified.`),
  ].join('\n');
  const body = sources.map((source) => {
    const cut = source.cutFrom == null ? '' : `\n[cut: the capture kept ${source.content.length} of ${source.cutFrom} characters; the rest of this source was not captured and goes under Not verified]`;
    return `## ${source.key}${source.url === '' ? '' : ` ${source.url}`}${cut}\n${renderRequirement(source.content)}`;
  });
  return [missing, ...body].filter((part) => part !== '').join('\n\n');
}

/** The gap lines a rendered text opens with (everything before its first source), so a step message can show them without the file being read. */
export const requirementGapsOf = (rendered: string): string => (rendered.startsWith('## ') ? '' : rendered.split('\n\n')[0]!);
