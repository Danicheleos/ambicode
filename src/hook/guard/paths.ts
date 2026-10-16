// Shared by guard-core.ts and the rules; import-free so neither imports the other.

export function isAbsolute(file: string): boolean {
  return file.startsWith('/') || file.startsWith('~') || /^[A-Za-z]:\//.test(file);
}

/** Lexical: `.` and `..` resolved, `\` read as `/`, a relative path joined to `base` when one is known. */
export function normalize(file: string, base?: string): string {
  let text = file.replace(/\\/g, '/');
  if (base !== undefined && !isAbsolute(text)) text = `${base.replace(/\\/g, '/')}/${text}`;
  const parts: string[] = [];
  for (const [index, part] of text.split('/').entries()) {
    if (part === '.' || (part === '' && index > 0)) continue;
    const last = parts.at(-1);
    if (part === '..' && last === '') continue;
    if (part === '..' && last !== undefined && last !== '..') parts.pop();
    else parts.push(part);
  }
  if (parts.length === 1 && parts[0] === '') return '/';
  return parts.join('/') || '.';
}
