// Import-free: bundled into the standalone guard entry. A structural reading, not a shell: it splits a command into
// segments, words and the files a segment writes. What only the shell can resolve is marked `opaque`, never guessed.

export interface WriteTarget {
  path: string;
  /** The path holds an expansion, so only the shell knows where it writes. */
  opaque: boolean;
}

export interface Segment {
  /** Words with quotes removed, after env/sudo/command/exec/npx prefixes; a `node …/ambicode.mjs` call starts at the script. */
  argv: string[];
  /** Parallel to `argv`: the word holds `$`, a backtick, `$(…)` or `<(…)`. */
  opaque: boolean[];
  writeTargets: WriteTarget[];
  raw: string;
  /** The lexer gave up (unterminated quote): `argv` is what was read before that. */
  unparsed?: true;
}

export function basename(text: string): string {
  return text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1);
}

interface Word {
  text: string;
  opaque: boolean;
}

interface Chunk {
  words: Word[];
  targets: Word[];
  raw: string;
  unparsed: boolean;
}

const BREAK = /[\s;&|<>()]/;

/** Index just past the `close` matching the `open` at `at`; -1 when unbalanced. Quotes inside are skipped whole. */
function balanced(text: string, at: number, open: string, close: string): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\') i++;
    else if (c === "'" || c === '"') {
      const end = text.indexOf(c, i + 1);
      if (end === -1) return -1;
      i = end;
    } else if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  return -1;
}

/** One shell word starting at `at`; `null` when a quote, backtick or bracket is never closed. */
function readWord(text: string, at: number): { word: Word; end: number } | null {
  let out = '';
  let opaque = false;
  let i = at;
  // An expansion is kept as typed: its text is what a reason quotes.
  const expansion = (from: number): number => {
    opaque = true;
    const open = text[from + 1];
    const end = open === '(' ? balanced(text, from + 1, '(', ')') : open === '{' ? balanced(text, from + 1, '{', '}') : from + 1;
    if (end !== -1) out += text.slice(from, end);
    return end;
  };
  while (i < text.length) {
    const c = text[i]!;
    if ((c === '<' || c === '>') && text[i + 1] === '(') {
      const end = balanced(text, i + 1, '(', ')');
      if (end === -1) return null;
      opaque = true;
      out += text.slice(i, end);
      i = end;
    } else if (BREAK.test(c)) break;
    else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return null;
      out += text.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      i++;
      for (;;) {
        const d = text[i];
        if (d === undefined) return null;
        if (d === '"') break;
        if (d === '\\' && i + 1 < text.length) {
          out += text[i + 1] === '$' || text[i + 1] === '"' || text[i + 1] === '\\' || text[i + 1] === '`' ? text[i + 1] : `\\${text[i + 1]}`;
          i += 2;
        } else if (d === '$') {
          const end = expansion(i);
          if (end === -1) return null;
          i = end;
        } else if (d === '`') {
          const end = text.indexOf('`', i + 1);
          if (end === -1) return null;
          opaque = true;
          out += text.slice(i, end + 1);
          i = end + 1;
        } else out += text[i++];
      }
      i++;
    } else if (c === '\\') {
      if (text[i + 1] !== '\n') out += text[i + 1] ?? '';
      i += 2;
    } else if (c === '$') {
      const end = expansion(i);
      if (end === -1) return null;
      i = end;
    } else if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end === -1) return null;
      opaque = true;
      out += text.slice(i, end + 1);
      i = end + 1;
    } else out += text[i++];
  }
  return { word: { text: out, opaque }, end: i };
}

/** Heredoc bodies are skipped here, so what they hold is never read as commands. */
function lex(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const heredocs: { tag: string; strip: boolean }[] = [];
  let words: Word[] = [];
  let targets: Word[] = [];
  let pending: 'target' | 'skip' | null = null;
  let start = 0;
  let lastEnd = -1;
  let i = 0;
  const flush = (end: number, unparsed = false): void => {
    if (words.length > 0 || targets.length > 0 || unparsed) chunks.push({ words, targets, raw: text.slice(start, end).trim(), unparsed });
    words = [];
    targets = [];
    pending = null;
  };
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === '\n') {
      flush(i);
      i++;
      for (const { tag, strip } of heredocs.splice(0)) {
        while (i < text.length) {
          let end = text.indexOf('\n', i);
          if (end === -1) end = text.length;
          const line = text.slice(i, end);
          i = end + 1;
          if ((strip ? line.replace(/^\t+/, '') : line) === tag) break;
        }
      }
      start = i;
    } else if (c === ' ' || c === '\t' || c === '\r') i++;
    else if (c === '\\' && next === '\n') i += 2;
    else if (c === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
    } else if (c === '&' && next === '>') {
      i += text[i + 2] === '>' ? 3 : 2;
      pending = 'target';
    } else if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      flush(i);
      i += (c === '&' || c === '|') && next === c ? 2 : 1;
      start = i;
    } else if ((c === '<' || c === '>') && next !== '(') {
      if (lastEnd === i && /^\d+$/.test(words.at(-1)?.text ?? '')) words.pop();
      if (c === '<' && next === '<' && text[i + 2] !== '<') {
        const strip = text[i + 2] === '-';
        i += strip ? 3 : 2;
        while (text[i] === ' ' || text[i] === '\t') i++;
        const tag = readWord(text, i);
        if (tag === null) return (flush(text.length, true), chunks);
        heredocs.push({ tag: tag.word.text, strip });
        i = tag.end;
      } else if (c === '<') {
        i += next === '<' ? 3 : next === '&' ? 2 : 1;
        pending = 'skip';
      } else {
        i += next === '>' || next === '|' ? 2 : 1;
        if (text[i] === '&') {
          pending = /[\d-]/.test(text[i + 1] ?? '') ? 'skip' : 'target';
          i++;
        } else pending = 'target';
      }
    } else {
      const read = readWord(text, i);
      if (read === null) {
        flush(text.length, true);
        chunks[chunks.length - 1]!.raw = text.slice(start).trim();
        return chunks;
      }
      i = lastEnd = read.end;
      if (pending === 'target') targets.push(read.word);
      else if (pending === null) words.push(read.word);
      pending = null;
    }
  }
  flush(text.length);
  return chunks;
}

const KEYWORDS = new Set(['{', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', 'time']);
const WRAPPERS = new Set(['sudo', 'command', 'exec', 'npx']);
const ASSIGNMENT = /^[A-Za-z_]\w*=/;

const operands = (args: Word[]): Word[] => {
  const found: Word[] = [];
  let flags = true;
  for (const arg of args) {
    if (flags && arg.text === '--') flags = false;
    else if (!flags || !arg.text.startsWith('-') || arg.opaque) found.push(arg);
  }
  return found;
};

/** The files a command writes by its arguments; redirections are read by the lexer. */
function argumentTargets(argv: Word[]): Word[] {
  const args = argv.slice(1);
  switch (basename(argv[0]?.text ?? '')) {
    case 'tee':
      return operands(args);
    case 'cp':
      return operands(args).slice(-1);
    // A moved file leaves its source, so every operand is written.
    case 'mv':
    case 'rm':
    case 'rmdir':
    case 'mkdir':
    case 'touch':
    case 'truncate':
      return operands(args);
    case 'sed': {
      if (!args.some((arg) => /^-[A-Za-z]*i/.test(arg.text) || arg.text.startsWith('--in-place'))) return [];
      const files: Word[] = [];
      let script = false;
      for (let k = 0; k < args.length; k++) {
        const arg = args[k]!;
        if (!arg.opaque && /^-[A-Za-z]*[ef]$/.test(arg.text)) (script = true), k++;
        else if (arg.opaque || !arg.text.startsWith('-')) files.push(arg);
      }
      return script ? files : files.slice(1);
    }
    default:
      return [];
  }
}

function toSegment(chunk: Chunk): Segment {
  const words = chunk.words;
  let at = 0;
  while (at < words.length) {
    const text = words[at]!.text;
    if (KEYWORDS.has(text) || ASSIGNMENT.test(text)) at++;
    else if (text === 'env' || WRAPPERS.has(text)) {
      at++;
      while (at < words.length && (words[at]!.text.startsWith('-') || ASSIGNMENT.test(words[at]!.text))) at += /^-[Cu]$/.test(words[at]!.text) ? 2 : 1;
    } else break;
  }
  if (basename(words[at]?.text ?? '') === 'node' && basename(words[at + 1]?.text ?? '') === 'ambicode.mjs') at++;
  const argv = words.slice(at);
  const writeTargets = [...chunk.targets, ...argumentTargets(argv)].map(({ text, opaque }) => ({ path: text, opaque }));
  return {
    argv: argv.map((word) => word.text),
    opaque: argv.map((word) => word.opaque),
    writeTargets,
    raw: chunk.raw,
    ...(chunk.unparsed ? { unparsed: true as const } : {}),
  };
}

export function parseCommand(command: string): Segment[] {
  return lex(command).map(toSegment);
}
