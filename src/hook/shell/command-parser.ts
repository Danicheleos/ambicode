// No imports: bundled into the guard, whose startup time is the point (see guard/guard.ts).

/**
 * One change of the shell's directory: a literal path, `null` for one only the shell knows, or `{ maybe }` for a
 * change that only happens if an earlier command succeeded (`cd X; cmd`: `cmd` runs in X or where it was).
 */
export type Move = string | null | { maybe: string };

/** The directory changes, from the hook's cwd, that a path is resolved after. */
export type Directories = readonly Move[];

export interface WriteTarget {
  path: string;
  opaque: boolean;
  /** `path` is a glob or brace pattern: the shell writes whatever it expands to. */
  pattern?: true;
  directories: Directories;
}

export interface Segment {
  argv: string[];
  opaque: boolean[];
  writeTargets: WriteTarget[];
  raw: string;
  /** Stands for the whole command when part of it was not analysed: the other segments may be incomplete or wrong. */
  unparsed?: true;
}

export interface ParseOptions {
  /** `sed -i` takes its backup suffix as a separate argument (BSD, macOS) rather than attached and optional (GNU). */
  bsdSed?: boolean;
  /** `CDPATH` is set where the command runs, so `cd name` may land in any directory it lists. */
  cdpath?: boolean;
}

/** Commands that a construct runs: lexed in place (`$( )`, `<( )`), or a backtick body's text, lexed when parsed. */
interface Substitution {
  text: string;
  tokens: Token[] | null;
}

interface Word {
  type: 'word';
  text: string;
  opaque: boolean;
  /** Holds an unquoted glob or brace pattern, which the shell expands to paths only it knows. */
  glob: boolean;
  start: number;
  end: number;
  /** The commands its substitutions run, in order. */
  substitutions: Substitution[];
}

interface Operator {
  type: 'op';
  op: string;
  start: number;
  end: number;
}

/** A `case` subject with its `in`, or one arm's pattern with its `)`: only its substitutions run. */
interface Pattern {
  type: 'pattern';
  start: number;
  end: number;
  substitutions: Substitution[];
}

type Token = Word | Operator | Pattern;

interface Heredoc {
  delimiter: string;
  stripTabs: boolean;
}

/**
 * How a `${…}` operand is read. `pattern`: after `#`, `##`, `%`, `%%`; `slash`: a `/` operator's pattern, then
 * its replacement as a `word`; `word`: a default or alternative; `arith`: a `:` offset; `unknown`: anything else.
 */
type Operand = 'pattern' | 'slash' | 'word' | 'arith' | 'unknown';

const OPERATORS: readonly (readonly [string, Operand])[] = [
  ['##', 'pattern'], ['#', 'pattern'], ['%%', 'pattern'], ['%', 'pattern'],
  ['//', 'slash'], ['/#', 'slash'], ['/%', 'slash'], ['/', 'slash'],
  [':-', 'word'], [':=', 'word'], [':?', 'word'], [':+', 'word'], ['-', 'word'], ['=', 'word'], ['?', 'word'], ['+', 'word'],
  [':', 'arith'],
];
const TERMINATORS = new Set([';;', ';&', ';;&']);
const SEPARATORS = new Set(['&&', '||', ';', '|', '|&', '&', '\n', '(', ')', ...TERMINATORS]);
// A carriage return is part of a word in both shells (`cd X\r` fails), never a blank.
const WORD_END = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')']);
const REDIRECTS = ['&>>', '<<<', '<<-', '>>', '>|', '&>', '<<', '<>', '>&', '<&', '>', '<'];
const CONTROLS = [';;&', ';;', ';&', '&&', '||', '|&'];
// Reserved words a command can start with; they run nothing themselves and open no scope.
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'case', 'esac', 'select', '!', '{', '}']);
// Reserved words after which the next word starts a command again.
const LEADING = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', 'time']);
const NAME = /[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-]/y;
const PARAMETER = /[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-]/y;
const ARRAY = /^[A-Za-z_][A-Za-z0-9_]*\+?=$/;
// Deeper nesting than any real command, in the text or in the commands it holds, is not analysed.
const MAX_DEPTH = 64;
// How far a bracket expression in a `/` pattern is looked into.
const MAX_BRACKET = 256;

interface Lexed {
  tokens: Token[];
  /** False when the text holds what this does not read, or what the shells read differently. */
  complete: boolean;
  /** bash 3.2 ends some `$( )` or `<( )` elsewhere: see `legacyEnd`. */
  divergent: boolean;
}

/**
 * Shell words and operators, read as bash 4+ and zsh read them. One lexer reads the command and the body of every
 * `$( )` and `<( )`, so a body ends where its own commands do (heredocs, `case` patterns, comments); heredoc
 * bodies are skipped whole and never tokenised (M12). `bash32`: as macOS /bin/bash reads it, where a body ends
 * at `legacyEnd` and is lexed in its turn as the text of a script.
 */
function tokenize(command: string, bash32: boolean): Lexed {
  const length = command.length;
  let complete = true;
  let divergent = false;
  const arithmetics = new Map<number, { end: number | null; found: Substitution[] }>();
  const bodies = new Map<number, { end: number; found: Substitution }>();

  const unsure = (): void => {
    complete = false;
  };

  const tooDeep = (level: number): boolean => {
    if (level < MAX_DEPTH) return false;
    unsure();
    return true;
  };

  const closing = (quote: string, at: number): number => {
    const close = command.indexOf(quote, at + 1);
    return close === -1 ? length : close + 1;
  };

  const skipSingle = (at: number): number => {
    const close = command.indexOf("'", at + 1);
    if (close === -1) unsure();
    return close === -1 ? length : close + 1;
  };

  /** Past the bodies of the heredocs started on the line that ended at `from`. */
  const skipBodies = (from: number, pending: Heredoc[]): number => {
    let at = from;
    for (const { delimiter, stripTabs } of pending.splice(0)) {
      while (at < length) {
        const newline = command.indexOf('\n', at);
        const lineEnd = newline === -1 ? length : newline;
        let line = command.slice(at, lineEnd);
        if (stripTabs) line = line.replace(/^\t+/, '');
        at = lineEnd + 1;
        if (line === delimiter) break;
      }
    }
    return Math.min(at, length);
  };

  // Each reader returns the index just past its construct and adds the commands it runs to `found` (`null`: a
  // heredoc delimiter, where nothing runs). `quoted`: inside double quotes. `level`: lexical nesting.

  const backtick = (at: number, found: Substitution[] | null): number => {
    let end = at + 1;
    let body = '';
    while (end < length && command[end] !== '`') {
      if (command[end] === '\\' && end + 1 < length) {
        const next = command[end + 1]!;
        body += '$`\\'.includes(next) ? next : `\\${next}`;
        end += 2;
      } else body += command[end++];
    }
    if (end >= length) unsure();
    found?.push({ text: body, tokens: null });
    return Math.min(end + 1, length);
  };

  const doubleQuoted = (at: number, found: Substitution[] | null, level: number): number => {
    let end = at + 1;
    while (end < length && command[end] !== '"') {
      const c = command[end]!;
      if (c === '\\') end += 2;
      else if (c === '$') end = dollar(end, found, true, level);
      else if (c === '`') end = backtick(end, found);
      else end++;
    }
    if (end >= length) unsure();
    return Math.min(end + 1, length);
  };

  const dollar = (at: number, found: Substitution[] | null, quoted: boolean, level: number): number => {
    if (tooDeep(level)) return length;
    const next = command[at + 1];
    if (next === '(') {
      const end = command[at + 2] === '(' ? arithmetic(at + 2, found, level + 1) : null;
      return end ?? substitution(at + 2, found, level + 1);
    }
    if (next === '{') return parameter(at + 2, found, quoted, level + 1);
    if (next === "'" && !quoted) {
      let end = at + 2;
      while (end < length && command[end] !== "'") end += command[end] === '\\' ? 2 : 1;
      if (end >= length) unsure();
      return Math.min(end + 1, length);
    }
    NAME.lastIndex = at + 1;
    return at + 1 + (NAME.exec(command)?.[0].length ?? 0);
  };

  /**
   * `$((…))` or `((…))` from its second `(` at `open`: arithmetic when the `)` that matches `open` is followed by
   * another, past which it returns. Otherwise it is a command substitution or subshell that starts with a
   * subshell (`$((cmd) | cat)`): `null`, and nothing is added to `found`. Single quotes are text in arithmetic.
   */
  const arithmetic = (open: number, found: Substitution[] | null, level: number): number | null => {
    let memo = arithmetics.get(open);
    if (memo === undefined) {
      const inner: Substitution[] = [];
      let depth = 1;
      let at = open + 1;
      while (at < length && depth > 0) {
        const c = command[at]!;
        if (c === '\\') at += 2;
        else if (c === '"') at = doubleQuoted(at, inner, level);
        else if (c === '$') at = dollar(at, inner, false, level);
        else if (c === '`') at = backtick(at, inner);
        else {
          if (c === '(') depth++;
          else if (c === ')') depth--;
          at++;
        }
      }
      memo = { end: depth === 0 && command[at] === ')' ? at + 1 : null, found: inner };
      arithmetics.set(open, memo);
    }
    if (memo.end !== null) found?.push(...memo.found);
    return memo.end;
  };

  /**
   * Where bash 3.2 ends the `$(` or `<(` whose body starts at `from`; -1 where it finds no end and runs nothing.
   * It counts parentheses through quotes and comments but knows neither heredocs nor `case`, so a heredoc body
   * with a `)` or a stray quote, or a `case` pattern's `)`, ends the body somewhere else there.
   */
  const legacyEnd = (from: number, level: number): number => {
    let depth = 1;
    let at = from;
    while (at < length) {
      const c = command[at]!;
      if (c === '\\') at += 2;
      else if (c === "'" || c === '`') at = closing(c, at);
      else if (c === '"') {
        for (at++; at < length && command[at] !== '"'; ) {
          if (command[at] === '\\') at += 2;
          else if (command[at] === '`') at = closing('`', at);
          else if (command[at] === '$' && command[at + 1] === '(') at = tooDeep(level + 1) ? -1 : legacyEnd(at + 2, level + 1);
          else at++;
          if (at === -1) return -1;
        }
        at++;
      } else if (c === '#' && (at === from || ' \t\n;&|()<>'.includes(command[at - 1]!))) {
        while (at < length && command[at] !== '\n') at++;
      } else {
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return at + 1;
        at++;
      }
    }
    return -1;
  };

  /** The body of a `$( )` or `<( )` from `from`, lexed as commands; past its `)`. */
  const substitution = (from: number, found: Substitution[] | null, level: number): number => {
    if (tooDeep(level)) return length;
    let memo = bodies.get(from);
    if (memo === undefined) {
      const legacy = legacyEnd(from, level);
      if (bash32) {
        if (legacy === -1) unsure();
        const end = legacy === -1 ? length : legacy;
        memo = { end, found: { text: command.slice(from, legacy === -1 ? end : end - 1), tokens: null } };
      } else {
        const tokens: Token[] = [];
        const end = lex(from, level, true, tokens);
        divergent ||= legacy !== -1 && legacy !== end;
        memo = { end, found: { text: command.slice(from, command[end - 1] === ')' ? end - 1 : end), tokens } };
      }
      bodies.set(from, memo);
    }
    found?.push(memo.found);
    return memo.end;
  };

  /**
   * `${…}` from just past its `{`: an optional `#` or `!`, a name, an optional subscript, then `}` or an operator
   * and its operand. Each part is read by the readers above, whatever its length.
   */
  const parameter = (from: number, found: Substitution[] | null, quoted: boolean, level: number): number => {
    let at = from;
    const prefix = command[at] === '#' || command[at] === '!' ? command[at] : undefined;
    if (prefix !== undefined && command[at + 1] !== '}') at++;
    PARAMETER.lastIndex = at;
    const name = PARAMETER.exec(command);
    if (name === null) return operand(at, 'unknown', found, quoted, level);
    at += name[0].length;
    if (command[at] === '[') at = subscript(at + 1, found, quoted, level);
    if (command[at] === '}') return at + 1;
    if (prefix === '!' && (command[at] === '*' || command[at] === '@') && command[at + 1] === '}') return at + 2;
    const operator = prefix === '#' ? undefined : OPERATORS.find(([text]) => command.startsWith(text, at));
    return operator === undefined ? operand(at, 'unknown', found, quoted, level) : operand(at + operator[0].length, operator[1], found, quoted, level);
  };

  /** An array subscript from just past its `[`, to past its `]`. Its substitutions run in both shells. */
  const subscript = (from: number, found: Substitution[] | null, quoted: boolean, level: number): number => {
    let depth = 1;
    let at = from;
    while (at < length) {
      const c = command[at]!;
      if (c === '\\') at += 2;
      else if (c === '"') at = doubleQuoted(at, found, level);
      else if (c === '$') at = dollar(at, found, quoted, level);
      else if (c === '`') at = backtick(at, found);
      else {
        // bash keeps a single-quoted subscript as text; zsh runs what it holds.
        if (c === "'") unsure();
        else if (c === '[') depth++;
        else if (c === ']' && --depth === 0) return at + 1;
        at++;
      }
    }
    unsure();
    return length;
  };

  /**
   * A `${…}` operand, to past its `}`. Outside double quotes single quotes quote in both shells. Inside them a
   * pattern's still keep what they hold from running, a word's do not, and bash skips a `}` between them where
   * zsh ends the expansion. Outside them zsh pairs braces and bash does not. bash ends a `/` pattern at the first
   * `/`, even one inside quotes or a substitution, which then fails. Those readings are `unsure`.
   */
  const operand = (from: number, mode: Operand, found: Substitution[] | null, quoted: boolean, level: number): number => {
    if (mode === 'unknown') unsure();
    let current = mode;
    let at = from;
    while (at < length) {
      const c = command[at]!;
      const start = at;
      if (c === '\\') at += 2;
      else if (c === '}') return at + 1;
      else if (c === "'") {
        if (current === 'arith') {
          unsure();
          at++;
        } else if (!quoted) at = skipSingle(at);
        else {
          const close = skipSingle(at);
          if (command.slice(at, close).includes('}')) unsure();
          at = current === 'word' ? at + 1 : close;
        }
      } else if (c === '"') at = doubleQuoted(at, found, level);
      else if (c === '$') at = dollar(at, found, quoted && current !== 'pattern' && current !== 'slash', level);
      else if (c === '`') at = backtick(at, found);
      else {
        if (c === '{' && !quoted) unsure();
        else if (current === 'slash' && c === '/') current = 'word';
        else if (current === 'slash' && c === '[' && complete) {
          // bash reads a `/` inside brackets as part of the pattern; zsh ends the pattern there.
          const bracket = command.slice(at, at + MAX_BRACKET);
          const close = bracket.search(/[\]}]/);
          if (close === -1 || bracket.slice(0, close).includes('/')) unsure();
        }
        at++;
        continue;
      }
      // zsh reads single quotes in an offset as text, so what they hold may run there.
      const span = command.slice(start, at);
      if ((current === 'slash' && span.includes('/')) || (current === 'arith' && span.includes("'"))) unsure();
    }
    unsure();
    return length;
  };

  /** One shell word from `from`. `literal`: a heredoc delimiter, only quote-removed: nothing in it is expanded or run. */
  const readWord = (from: number, literal: boolean, level: number): Word => {
    let j = from;
    const substitutions: Substitution[] = [];
    const found = literal ? null : substitutions;
    let text = '';
    let opaque = false;
    let glob = false;
    let brace = false;
    const expansion = (quoted: boolean): void => {
      const end = command[j] === '`' ? backtick(j, found) : dollar(j, found, quoted, level);
      opaque ||= end > j + 1;
      text += command.slice(j, end);
      j = end;
    };
    while (j < length && !WORD_END.has(command[j]!)) {
      const c = command[j]!;
      if (c === '\\') {
        if (command[j + 1] !== '\n') text += command[j + 1] ?? '';
        j += 2;
      } else if (c === "'") {
        const end = skipSingle(j);
        text += command.slice(j + 1, end - 1);
        j = end;
      } else if (c === '"') {
        for (j++; j < length && command[j] !== '"'; ) {
          const d = command[j]!;
          if (d === '\\' && command[j + 1] !== undefined && '$`"\\\n'.includes(command[j + 1]!)) {
            if (command[j + 1] !== '\n') text += command[j + 1];
            j += 2;
          } else if (d === '$' || d === '`') expansion(true);
          else {
            text += d;
            j++;
          }
        }
        if (j >= length) unsure();
        j++;
      } else if (c === '$' || c === '`') expansion(false);
      else {
        glob ||= '*?['.includes(c) || (c === '}' && brace);
        brace ||= c === '{';
        text += c;
        j++;
      }
    }
    return { type: 'word', text, opaque: opaque && !literal, glob: glob && !literal, start: from, end: Math.min(j, length), substitutions };
  };

  const unquoted = (word: Word, text: string): boolean => word.text === text && command.slice(word.start, word.end) === text;

  const startsWord = (at: number, text: string): boolean =>
    command.startsWith(text, at) && (at + text.length >= length || WORD_END.has(command[at + text.length]!));

  /**
   * Tokens from `from`, pushed to `tokens`. `nested`: the body of a `$( )` or `<( )`, which ends at the first `)`
   * that closes nothing opened in it (a `case` pattern's `)` is the pattern's); past it is returned.
   */
  const lex = (from: number, level: number, nested: boolean, tokens: Token[]): number => {
    const heredocs: Heredoc[] = [];
    const cases: { phase: 'pattern' | 'body' }[] = [];
    let parens = 0;
    // `position`: the next word starts a command, so a reserved word there is one. `redirected`: the next word is
    // a redirection's target, which leaves `position` as it was (zsh). `named`: it names a function.
    let position = true;
    let redirected = false;
    let named = false;
    let arithmeticFor = false;
    // The end of the last word that is not a reserved word: a `(` right after it is a glob qualifier (zsh).
    let wordEnd = -1;
    let i = from;

    const word = (start: number, end: number, substitutions: Substitution[], opaque: boolean): void => {
      tokens.push({ type: 'word', text: command.slice(start, end), opaque, glob: false, start, end, substitutions });
    };

    /** A `case` arm's pattern to past its `)`, or the `esac` that ends the case. */
    const casePattern = (at: number): number => {
      if (startsWord(at, 'esac')) {
        cases.pop();
        word(at, at + 4, [], false);
        position = false;
        return at + 4;
      }
      const start = at;
      const substitutions: Substitution[] = [];
      let depth = command[at] === '(' ? -1 : 0;
      while (at < length) {
        const c = command[at]!;
        if (c === ' ' || c === '\t' || c === '|') at++;
        else if (c === '\\' && command[at + 1] === '\n') at += 2;
        else if (c === '(') {
          depth++;
          at++;
        } else if (c === ')') {
          at++;
          if (depth-- === 0) break;
        } else if (WORD_END.has(c)) break;
        else {
          const part = readWord(at, false, level);
          substitutions.push(...part.substitutions);
          at = part.end;
        }
      }
      if (command[at - 1] !== ')' || depth >= 0) unsure();
      tokens.push({ type: 'pattern', start, end: at, substitutions });
      cases.at(-1)!.phase = 'body';
      position = true;
      return at;
    };

    /** The subject and `in` after `case`; without an `in` the case is not read. */
    const caseSubject = (at: number): number => {
      while (command[at] === ' ' || command[at] === '\t') at++;
      const subject = readWord(at, false, level);
      at = subject.end;
      while (at < length && ' \t\n'.includes(command[at]!)) at = command[at] === '\n' ? skipBodies(at + 1, heredocs) : at + 1;
      const keyword = readWord(at, false, level);
      const opens = subject.end > subject.start && unquoted(keyword, 'in');
      tokens.push({ type: 'pattern', start: subject.start, end: opens ? keyword.end : subject.end, substitutions: subject.substitutions });
      if (!opens) {
        unsure();
        return subject.end;
      }
      cases.push({ phase: 'pattern' });
      return keyword.end;
    };

    /** `name=( … )`: its elements are words, never commands. */
    const arrayLiteral = (name: Word, at: number): number => {
      const substitutions = [...name.substitutions];
      let opaque = name.opaque;
      for (at++; at < length && command[at] !== ')'; ) {
        const c = command[at]!;
        if (c === '\n') at = skipBodies(at + 1, heredocs);
        else if (c === ' ' || c === '\t') at++;
        else if (c === '\\' && command[at + 1] === '\n') at += 2;
        else if (c === '#' && ' \t\n('.includes(command[at - 1]!)) while (at < length && command[at] !== '\n') at++;
        else if (WORD_END.has(c)) {
          unsure();
          at++;
        } else {
          const element = readWord(at, false, level);
          substitutions.push(...element.substitutions);
          opaque ||= element.opaque;
          at = element.end;
        }
      }
      if (at >= length) unsure();
      const end = Math.min(at + 1, length);
      word(name.start, end, substitutions, opaque);
      return end;
    };

    /** `[[ … ]]`: one test, whose `<`, `>`, `(` and `|` are its own operators, never redirections or pipes. */
    const conditional = (open: Word): number => {
      const substitutions: Substitution[] = [];
      let at = open.end;
      while (at < length && !startsWord(at, ']]')) {
        const c = command[at]!;
        if (c === '\n') at = skipBodies(at + 1, heredocs);
        else if (WORD_END.has(c)) at++;
        else {
          const part = readWord(at, false, level);
          substitutions.push(...part.substitutions);
          at = part.end;
        }
      }
      if (at >= length) unsure();
      const end = Math.min(at + 2, length);
      word(open.start, end, substitutions, substitutions.length > 0);
      return end;
    };

    while (i < length) {
      const c = command[i]!;
      if (c === ' ' || c === '\t') {
        i++;
        continue;
      }
      if (c === '\\' && command[i + 1] === '\n') {
        i += 2;
        continue;
      }
      if (c === '\n') {
        tokens.push({ type: 'op', op: '\n', start: i, end: i + 1 });
        i = skipBodies(i + 1, heredocs);
        position = true;
        redirected = false;
        continue;
      }
      if (c === '#') {
        while (i < length && command[i] !== '\n') i++;
        continue;
      }
      if (cases.at(-1)?.phase === 'pattern') {
        i = casePattern(i);
        continue;
      }
      if (c === '(' && command[i + 1] === '(' && (position || arithmeticFor)) {
        const substitutions: Substitution[] = [];
        const end = arithmetic(i + 1, substitutions, level + 1);
        if (end !== null) {
          // `(( … ))`: an arithmetic command, not two subshells; only substitutions inside it run.
          word(i, end, substitutions, false);
          i = end;
          position = arithmeticFor = false;
          continue;
        }
      }
      arithmeticFor = false;
      if ((c === '<' || c === '>') && command[i + 1] === '(') {
        const substitutions: Substitution[] = [];
        const end = substitution(i + 2, substitutions, level + 1);
        word(i, end, substitutions, true);
        i = wordEnd = end;
        position = redirected = false;
        continue;
      }
      if ('&|;()<>'.includes(c)) {
        const op = REDIRECTS.find((r) => command.startsWith(r, i)) ?? CONTROLS.find((r) => command.startsWith(r, i)) ?? c;
        if (op === ')') {
          if (parens === 0 && nested) {
            if (cases.length > 0 || heredocs.length > 0) unsure();
            return i + 1;
          }
          if (parens === 0) unsure();
          parens = Math.max(parens - 1, 0);
        } else if (op === '(') {
          // `name()` defines a function; in zsh a word glued to any other `(` is a glob qualifier.
          if (wordEnd === i && !/^[ \t]*\)/.test(command.slice(i + 1, i + 16))) unsure();
          parens++;
        }
        tokens.push({ type: 'op', op, start: i, end: i + op.length });
        i += op.length;
        if (op === '<<' || op === '<<-') {
          while (command[i] === ' ' || command[i] === '\t') i++;
          const delimiter = readWord(i, true, level);
          i = delimiter.end;
          tokens.push(delimiter);
          heredocs.push({ delimiter: delimiter.text, stripTabs: op === '<<-' });
        } else if (REDIRECTS.includes(op)) {
          redirected = true;
          // zsh's `>!` and `>>|` force a write; bash writes to a file named `!` or fails.
          if (op.includes('>') && (command[i] === '!' || command[i] === '|')) {
            unsure();
            i++;
          }
        } else {
          position = true;
          redirected = false;
          const arm = cases.at(-1);
          if (TERMINATORS.has(op) && arm?.phase === 'body') arm.phase = 'pattern';
        }
        continue;
      }
      const next = readWord(i, false, level);
      i = wordEnd = next.end;
      if (/^[0-9]+$/.test(next.text) && !next.opaque && (command[i] === '<' || command[i] === '>')) continue;
      if (redirected) {
        redirected = false;
        tokens.push(next);
        continue;
      }
      if (ARRAY.test(next.text) && command[i] === '(' && command.slice(next.start, next.end) === next.text) {
        i = wordEnd = arrayLiteral(next, i);
        position = false;
        continue;
      }
      const reserved: boolean = position && !named;
      // zsh ends a brace group at any unquoted `}` word; bash only at one that starts a command.
      if (!reserved && unquoted(next, '}')) unsure();
      if (reserved && unquoted(next, '[[')) {
        i = wordEnd = conditional(next);
        position = false;
        continue;
      }
      tokens.push(next);
      if (reserved && unquoted(next, 'case')) {
        i = caseSubject(i);
        position = false;
        continue;
      }
      if (reserved && unquoted(next, 'esac') && cases.length > 0) cases.pop();
      arithmeticFor = reserved && unquoted(next, 'for');
      const wasNamed: boolean = named;
      named = reserved && unquoted(next, 'function');
      position = wasNamed || (reserved && LEADING.has(next.text) && unquoted(next, next.text));
      if (position || reserved && KEYWORDS.has(next.text)) wordEnd = -1;
    }
    if (nested || parens > 0 || cases.length > 0) unsure();
    return length;
  };

  const tokens: Token[] = [];
  lex(0, 0, false, tokens);
  return { tokens, complete, divergent };
}

/** 0: takes no value; 1: takes one, attached or as the next word; 2: takes one only attached (`-iSUF`, `--opt=v`). */
type Arity = 0 | 1 | 2;

interface OptionSpec {
  short?: Readonly<Record<string, Arity>>;
  long?: Readonly<Record<string, Arity>>;
  /** GNU getopt finds options after operands too; a POSIX one stops at the first operand. */
  permute?: boolean;
}

interface ParsedOptions {
  options: { name: string; value: Word | null }[];
  operands: Word[];
}

function longName(table: Readonly<Record<string, Arity>>, given: string): string {
  if (Object.hasOwn(table, given)) return given;
  const matches = Object.keys(table).filter((name) => given !== '' && name.startsWith(given));
  return matches.length === 1 ? matches[0]! : given;
}

/** getopt_long's reading of `args`: `--` ends options; a word that only the shell expands is never an option. */
function getopt(args: readonly Word[], spec: OptionSpec): ParsedOptions {
  const options: ParsedOptions['options'] = [];
  const operands: Word[] = [];
  const long = spec.long ?? {};
  for (let at = 0; at < args.length; at++) {
    const word = args[at]!;
    const text = word.text;
    if (text === '--') {
      operands.push(...args.slice(at + 1));
      break;
    }
    if (text.length < 2 || !text.startsWith('-') || /^--?[$`]/.test(text)) {
      if (spec.permute === false) {
        operands.push(...args.slice(at));
        break;
      }
      operands.push(word);
      continue;
    }
    if (text.startsWith('--')) {
      const equals = text.indexOf('=');
      const name = longName(long, text.slice(2, equals === -1 ? undefined : equals));
      if (equals !== -1) options.push({ name, value: { ...word, text: text.slice(equals + 1) } });
      else options.push({ name, value: long[name] === 1 ? (args[++at] ?? null) : null });
      continue;
    }
    for (let letter = 1; letter < text.length; letter++) {
      const name = text[letter]!;
      const arity = spec.short?.[name] ?? 0;
      if (arity === 0) {
        options.push({ name, value: null });
        continue;
      }
      const attached = text.slice(letter + 1);
      if (attached !== '') options.push({ name, value: { ...word, text: attached } });
      else options.push({ name, value: arity === 1 ? (args[++at] ?? null) : null });
      break;
    }
  }
  return { options, operands };
}

interface Prefix {
  options: OptionSpec;
  /** Options whose value is the directory the command runs in. */
  chdir?: readonly string[];
  /** Runs the command in this shell, so a `cd` after it still moves the shell. */
  inShell?: boolean;
  /** Operands of the prefix itself before the command (`timeout 5 cmd`). */
  operands?: number;
}

/** Prefixes that run the command after them. Each stops at its first operand, as their own parsers do. */
const PREFIXES: Readonly<Record<string, Prefix>> = {
  env: {
    options: {
      short: { u: 1, C: 1, S: 1 },
      long: { unset: 1, chdir: 1, 'split-string': 1, 'ignore-environment': 0, null: 0, debug: 0, 'block-signal': 2, 'default-signal': 2, 'ignore-signal': 2 },
      permute: false,
    },
    chdir: ['C', 'chdir'],
  },
  sudo: {
    options: {
      short: { u: 1, g: 1, h: 1, p: 1, C: 1, D: 1, r: 1, t: 1, U: 1, T: 1 },
      long: { user: 1, group: 1, host: 1, prompt: 1, 'close-from': 1, chdir: 1, role: 1, type: 1, 'other-user': 1, 'command-timeout': 1 },
      permute: false,
    },
    chdir: ['D', 'chdir'],
  },
  node: { options: { short: { r: 1 }, long: { require: 1, import: 1, loader: 1 }, permute: false } },
  npx: { options: { short: { p: 1, c: 1 }, long: { package: 1, call: 1 }, permute: false } },
  xargs: { options: { short: { I: 1, J: 1, i: 2, n: 1, L: 1, P: 1, d: 1, E: 1, s: 1, a: 1 }, long: { replace: 2 }, permute: false } },
  nice: { options: { short: { n: 1 }, permute: false } },
  timeout: { options: { short: { s: 1, k: 1 }, long: { signal: 1, 'kill-after': 1 }, permute: false }, operands: 1 },
  command: { options: { permute: false }, inShell: true },
  builtin: { options: { permute: false }, inShell: true },
  time: { options: { short: { f: 1, o: 1 }, permute: false }, inShell: true },
  noglob: { options: { permute: false }, inShell: true },
  nocorrect: { options: { permute: false }, inShell: true },
  repeat: { options: { permute: false }, inShell: true, operands: 1 },
  exec: { options: { short: { a: 1 }, permute: false } },
  nohup: { options: { permute: false } },
  coproc: { options: { permute: false } },
};
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Where the command proper starts, the directories its prefixes run it in, whether it still runs in this shell,
 * and whether `xargs` adds words to it or replaces the `replaced` strings in them.
 */
function commandStart(words: readonly Word[], shell: Shell): { at: number; chdir: (string | null)[]; inShell: boolean; fed: boolean; replaced: string[] } {
  let at = 0;
  let inShell = true;
  let fed = false;
  const replaced: string[] = [];
  const chdir: (string | null)[] = [];
  while (at < words.length) {
    const word = words[at]!;
    if (KEYWORDS.has(word.text) || ASSIGNMENT.test(word.text)) {
      at++;
      continue;
    }
    // `/usr/bin/env` is `env`; a path never names a builtin, so it never runs the command in this shell.
    const path = word.text.includes('/');
    const name = path ? basename(word.text) : word.text;
    const prefix = word.opaque || !Object.hasOwn(PREFIXES, name) ? undefined : PREFIXES[name];
    if (prefix === undefined) break;
    const parsed = getopt(words.slice(at + 1), prefix.options);
    at = words.length - parsed.operands.length;
    // One invocation changes directory once: its last `-C` wins. A nested prefix composes with this one.
    let last: string | null | undefined;
    for (const { name, value } of parsed.options) {
      if (prefix.chdir?.includes(name)) last = value === null ? null : pathOf(value, shell);
    }
    if (last !== undefined) chdir.push(last);
    inShell &&= prefix.inShell === true && !path;
    if (name === 'xargs') {
      const replacing = parsed.options.filter((option) => ['I', 'J', 'i', 'replace'].includes(option.name));
      fed = replacing.length === 0;
      for (const { value } of replacing) replaced.push(value === null || value.text === '' ? '{}' : value.text);
    }
    if (name === 'env') while (at < words.length && (words[at]!.text === '-' || ASSIGNMENT.test(words[at]!.text))) at++;
    at += prefix.operands ?? 0;
  }
  return { at, chdir, inShell, fed, replaced };
}

/** What the command text itself may change about how the shell resolves a path. */
interface Shell {
  /** `HOME` is named, so `~` may be anywhere. */
  home: boolean;
  /** `CDPATH` is set or named, so `cd name` may land in any directory it lists. */
  cdpath: boolean;
}

/** `~name`, `~+` and `~-` name directories only the shell knows, and so does `~` once `HOME` may have changed. */
const unknownTilde = (text: string, shell: Shell): boolean => text.startsWith('~') && (shell.home || !/^~(?:\/|$)/.test(text));

/** The path a word names, `null` when only the shell resolves it. */
const pathOf = (word: Word, shell: Shell): string | null => (word.opaque || word.glob || unknownTilde(word.text, shell) ? null : word.text);

/** The last path component, `/` and `\\` both separating. */
export function basename(text: string): string {
  return text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1);
}

const TEE: OptionSpec = { long: { 'output-error': 2 } };
const RM: OptionSpec = { long: { interactive: 2, 'preserve-root': 2 } };
const COPY: OptionSpec = {
  short: { t: 1, S: 1 },
  long: { 'target-directory': 1, suffix: 1, backup: 2, sparse: 1, reflink: 2, preserve: 2, 'no-preserve': 1, context: 2, update: 2 },
};
const TOUCH: OptionSpec = { short: { A: 1, d: 1, r: 1, t: 1 }, long: { date: 1, reference: 1, time: 1 } };
const MKDIR: OptionSpec = { short: { m: 1 }, long: { mode: 1, context: 2 } };
const TRUNCATE: OptionSpec = { short: { s: 1, r: 1 }, long: { size: 1, reference: 1 } };
const SHRED: OptionSpec = { short: { n: 1, s: 1 }, long: { iterations: 1, size: 1, 'random-source': 1 } };
const LINK: OptionSpec = { short: { t: 1, S: 1 }, long: { 'target-directory': 1, suffix: 1, backup: 2 } };
const INSTALL: OptionSpec = {
  short: { m: 1, o: 1, g: 1, t: 1, S: 1, B: 1, f: 1, M: 1, N: 1, T: 1 },
  long: { mode: 1, owner: 1, group: 1, 'target-directory': 1, suffix: 1, backup: 2, 'strip-program': 1, context: 2 },
};
const GNU_SED: OptionSpec = { short: { e: 1, f: 1, l: 1, i: 2 }, long: { expression: 1, file: 1, 'line-length': 1, 'in-place': 2 } };
const BSD_SED: OptionSpec = { short: { e: 1, f: 1, i: 1, I: 1 }, permute: false };
const SED_SCRIPT = new Set(['e', 'f', 'expression', 'file']);

/** The files a command's own arguments name for writing (15 §2 rule 4). */
function argvTargets(name: string, args: readonly Word[], options: ParseOptions): Word[] {
  switch (name) {
    case 'tee':
      return getopt(args, TEE).operands;
    case 'rm':
      return getopt(args, RM).operands;
    case 'rmdir':
    case 'unlink':
      return getopt(args, {}).operands;
    case 'touch':
      return getopt(args, TOUCH).operands;
    case 'mkdir':
      return getopt(args, MKDIR).operands;
    case 'truncate':
      return getopt(args, TRUNCATE).operands;
    case 'shred':
      return getopt(args, SHRED).operands;
    case 'dd':
      return args.filter((word) => word.text.startsWith('of=')).map((word) => ({ ...word, text: word.text.slice(3) }));
    case 'ln':
    case 'install': {
      const { options: given, operands } = getopt(args, name === 'ln' ? LINK : INSTALL);
      if (given.some((option) => option.name === 'd')) return operands;
      const directory = given.filter((option) => option.name === 't' || option.name === 'target-directory').flatMap((option) => option.value ?? []);
      if (directory.length > 0) return directory;
      if (operands.length >= 2) return [operands.at(-1)!];
      // `ln target` links it into the current directory under its own name.
      const only = operands[0];
      return name === 'ln' && only !== undefined ? [{ ...only, text: basename(only.text) || only.text }] : [];
    }
    case 'cp':
    case 'mv': {
      const { options: given, operands } = getopt(args, COPY);
      const directory = given.filter((option) => option.name === 't' || option.name === 'target-directory').flatMap((option) => option.value ?? []);
      // `mv` also removes its sources from where they were.
      if (name === 'mv') return [...directory, ...operands];
      if (directory.length > 0) return directory;
      return operands.length >= 2 ? [operands.at(-1)!] : [];
    }
    case 'sed':
    case 'gsed': {
      const bsd = name === 'sed' && options.bsdSed === true;
      const { options: given, operands } = getopt(args, bsd ? BSD_SED : GNU_SED);
      if (!given.some((option) => option.name === 'i' || (bsd ? option.name === 'I' : option.name === 'in-place'))) return [];
      // The script is the first operand unless `-e`/`-f` gave it. BSD sed has no long options.
      return given.some((option) => SED_SCRIPT.has(option.name) && (!bsd || option.name.length === 1)) ? operands : operands.slice(1);
    }
    default:
      return [];
  }
}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** Options that change neither how the shell reads a command nor where it runs and writes. */
const NEUTRAL_OPTIONS = new Set(['errexit', 'nounset', 'pipefail', 'xtrace', 'verbose', 'noclobber', 'clobber', 'noglob', 'glob', 'errtrace', 'functrace', 'noexec', 'exec', 'allexport']);
const NEUTRAL_FLAGS = /^[-+][euxvfCna]*$/;
// zsh ignores case and `_` in option names.
const optionName = (text: string): string => text.toLowerCase().replace(/_/g, '');

/** Whether a command changes the shell options or the reserved words and builtins the rest is read with. */
function reconfigures(name: string, args: readonly Word[]): boolean {
  if (['setopt', 'unsetopt', 'emulate', 'enable', 'disable'].includes(name)) return true;
  if (name === 'shopt') return args.some((word) => word.opaque || /^-[^-]*[su]/.test(word.text));
  if (name !== 'set') return false;
  for (let at = 0; at < args.length; at++) {
    const { text, opaque } = args[at]!;
    if (opaque) return true;
    if (text === '--' || text === '-' || !/^[-+]/.test(text)) return false;
    if (/^[-+][A-Za-z]*o$/.test(text)) {
      const option = args[++at];
      if (option !== undefined && (option.opaque || !NEUTRAL_OPTIONS.has(optionName(option.text)))) return true;
      if (!NEUTRAL_FLAGS.test(text.slice(0, -1))) return true;
    } else if (!NEUTRAL_FLAGS.test(text)) return true;
  }
  return false;
}

/**
 * The shell code a command's own arguments hold, parsed in turn: `eval`'s words, a shell's `-c` script, a `trap`
 * action, an `alias` value. `null`: code only the shell sees, as a shell or `source` reads it from its input or a
 * substitution. A script file named by a literal path is not read.
 */
function scriptsOf(name: string, args: readonly Word[]): string[] | null {
  if (name === 'eval') return args.some((word) => word.opaque) ? null : args.length === 0 ? [] : [args.map((word) => word.text).join(' ')];
  if (name === 'trap') {
    const { operands } = getopt(args, { permute: false });
    const action = operands[0];
    if (operands.length < 2 || action!.text === '-') return [];
    return action!.opaque ? null : [action!.text];
  }
  if (name === 'alias') {
    const values = args.filter((word) => word.opaque || word.text.includes('='));
    return values.some((word) => word.opaque) ? null : values.map((word) => word.text.slice(word.text.indexOf('=') + 1));
  }
  if (name === 'source' || name === '.') {
    const file = getopt(args, { permute: false }).operands[0];
    return file !== undefined && (file.opaque || file.text === '/dev/stdin' || file.text === '-') ? null : [];
  }
  if (!SHELLS.has(name)) return [];
  let command = false;
  for (let at = 0; at < args.length; at++) {
    const { text, opaque } = args[at]!;
    if (opaque) return null;
    if (text === '--' || text === '-') {
      const script = args[at + 1];
      return script === undefined ? (command ? [] : null) : script.opaque ? null : command ? [script.text] : [];
    }
    if (text.startsWith('--')) {
      if (text === '--version' || text === '--help') return [];
      if (text === '--rcfile' || text === '--init-file') at++;
      continue;
    }
    if (/^[-+]./.test(text)) {
      command ||= text.startsWith('-') && text.includes('c');
      // `-s` reads the commands from input; `-i` loads the startup files, which may redefine anything.
      if (text.startsWith('-') && /[si]/.test(text)) return null;
      if (/[oO]/.test(text)) {
        const option = args[++at];
        if (option === undefined || option.opaque || !NEUTRAL_OPTIONS.has(optionName(option.text))) return null;
      }
      continue;
    }
    return command ? [text] : [];
  }
  // With no script, a shell runs the commands on its input.
  return command ? [] : null;
}

/**
 * What a command leaves the shell's directories as, by outcome: `ok` after it succeeds, `fail` after it fails;
 * `null` for an outcome that never continues (`exit`, `return`). `cd X` is X on success and unchanged on failure.
 */
interface Flow {
  ok: Directories | null;
  fail: Directories | null;
}

const stay = (directories: Directories): Flow => ({ ok: directories, fail: directories });

const sameMove = (a: Move | undefined, b: Move | undefined): boolean =>
  a === b || (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && a.maybe === b.maybe);
const same = (a: Directories, b: Directories): boolean => a.length === b.length && a.every((move, at) => sameMove(move, b[at]));
const target = (move: Move): string | null => (move === null || typeof move === 'string' ? move : move.maybe);

/** One chain standing for either: moves the two share stay certain, the rest may or may not have happened. */
function merge(a: Directories, b: Directories): Directories {
  let shared = 0;
  while (shared < a.length && shared < b.length && sameMove(a[shared], b[shared])) shared++;
  const left = a.slice(shared);
  const right = b.slice(shared);
  if (left.length === right.length && left.every((move, at) => target(move) === target(right[at]!))) {
    return [...a.slice(0, shared), ...left.map((move, at) => (typeof move === 'object' || typeof right[at] === 'object' ? { maybe: target(move)! } : move))];
  }
  const optional = (move: Move): Move => (typeof move === 'string' ? { maybe: move } : move);
  return [...a.slice(0, shared), ...left.map(optional), ...right.map(optional)];
}

/**
 * A loop that moved the shell starts each pass wherever the last one left it, so from its entry on (`length` moves)
 * the directory is unknown, in its body and condition as after it. Later moves still apply to that unknown.
 */
const repeated = (directories: Directories, length: number): Directories => [...directories.slice(0, length), null, ...directories.slice(length)];

const join = (a: Directories | null, b: Directories | null): Directories | null => (a === null ? b : b === null ? a : merge(a, b));
/** The directories the next command in a list runs in: either outcome may have happened. */
const settle = (flow: Flow, fallback: Directories): Directories => join(flow.ok, flow.fail) ?? fallback;
const moved = (flow: Flow, from: Directories): boolean => (flow.ok !== null && !same(flow.ok, from)) || (flow.fail !== null && !same(flow.fail, from));

/** What `cd`, `pushd`, `popd`, `exit` or `return` with `args` do to the shell's directories; any other command leaves them. */
function builtinFlow(name: string, args: readonly Word[], directories: Directories, shell: Shell): Flow {
  if (name === 'exit' || name === 'return') return { ok: null, fail: null };
  if (name !== 'cd' && name !== 'pushd' && name !== 'popd') return stay(directories);
  const succeeds = (move: Move): Flow => ({ ok: [...directories, move], fail: directories });
  if (name === 'popd') return succeeds(null);
  const { options, operands } = getopt(args, { permute: false });
  const destination = operands[0];
  if (name === 'pushd') {
    if (options.some((option) => option.name === 'n')) return stay(directories);
    if (destination === undefined || /^[+-][0-9]*$/.test(destination.text)) return succeeds(null);
  }
  if (destination === undefined) return succeeds(shell.home ? null : '~');
  const path = destination.text === '-' ? null : pathOf(destination, shell);
  // With `CDPATH`, a name not starting with `/`, `.` or `..` is looked up in each directory it lists first.
  return succeeds(path !== null && shell.cdpath && !/^(?:[/~]|\.\.?(?:\/|$))/.test(path) ? null : path);
}

const isOp = (token: Token | undefined, ...ops: string[]): boolean => token?.type === 'op' && ops.includes(token.op);
const isReserved = (command: string, token: Token | undefined, text: string): boolean =>
  token?.type === 'word' && token.text === text && command.slice(token.start, token.end) === text;
const READS = new Set(['<', '<&', '<<', '<<-', '<<<']);
const DISCARDED = new Set(['/dev/null']);
const BLOCK_OPENERS = new Set(['if', 'while', 'until', 'for', 'case', 'select']);
const LOOPS = new Set(['while', 'until', 'for', 'select']);
const BLOCK_BRANCHES = new Set(['elif', 'else', ';;']);
const BLOCK_CLOSERS = new Set(['fi', 'done', 'esac']);

const targetOf = (word: Word, directories: Directories, shell: Shell): WriteTarget => {
  const opaque = word.opaque || unknownTilde(word.text, shell);
  return word.glob ? { path: word.text, opaque, pattern: true, directories } : { path: word.text, opaque, directories };
};

const EXECS = new Set(['-exec', '-ok', '-execdir', '-okdir']);

/**
 * The commands `find` runs for what it finds, each `-exec … ;` or `… +`. `here`: in find's own directory, not in
 * each match's (`-execdir`). `{}` stands for the paths found.
 */
function execsOf(args: readonly Word[]): { words: Word[]; here: boolean }[] {
  const commands: { words: Word[]; here: boolean }[] = [];
  for (let at = 0; at < args.length; at++) {
    const flag = args[at]!;
    if (flag.opaque || !EXECS.has(flag.text)) continue;
    const words: Word[] = [];
    for (at++; at < args.length && !(args[at]!.text === ';' || (args[at]!.text === '+' && args[at - 1]!.text === '{}')); at++) {
      const word = args[at]!;
      words.push(word.text.includes('{}') ? { ...word, opaque: true } : word);
    }
    commands.push({ words, here: !flag.text.endsWith('dir') });
  }
  return commands;
}

/** What the parsers of one reading of a command share: its segments in execution order, and how it was read. */
interface Context {
  options: ParseOptions;
  shell: Shell;
  bash32: boolean;
  segments: Segment[];
  complete: boolean;
  divergent: boolean;
}

/**
 * Recursive descent over the token stream, emitting segments in execution order. The shell's directory is
 * threaded through: subshells, pipeline elements, background lists and substitutions get a copy, so a `cd`
 * in them never moves the commands after them. A redirection on a compound command is opened where the
 * command starts, before its body can change directory.
 */
class Parser {
  private at = 0;
  private nesting = 0;
  private readonly blocks: { keyword: string; directories: Directories; segments: number }[] = [];
  private readonly command: string;
  private readonly context: Context;
  private readonly depth: number;
  private readonly tokens: readonly Token[];

  /** `tokens`: already lexed from `command`; without them `command` is lexed here. */
  constructor(command: string, context: Context, depth: number, tokens?: readonly Token[]) {
    this.command = command;
    this.context = context;
    this.depth = depth;
    if (tokens === undefined) {
      const lexed = tokenize(command, context.bash32);
      tokens = lexed.tokens;
      context.complete &&= lexed.complete;
      context.divergent ||= lexed.divergent;
    }
    this.tokens = tokens;
  }

  run(directories: Directories): Flow {
    const flow = this.list(directories, null);
    if (this.blocks.length > 0) this.context.complete = false;
    return flow;
  }

  /** The commands a substitution or script runs, in a shell of their own. */
  private substitute(inner: Substitution, directories: Directories): Flow {
    if (this.depth + 1 >= MAX_DEPTH) {
      this.context.complete = false;
      return stay(directories);
    }
    const parser = inner.tokens === null ? new Parser(inner.text, this.context, this.depth + 1) : new Parser(this.command, this.context, this.depth + 1, inner.tokens);
    return parser.run([...directories]);
  }

  /**
   * A branch or loop body may not run, so the directories after one are either its entry's or its body's.
   * `entry` is returned at a closing keyword: a redirection after it applies where the construct started.
   * A loop that moves the shell runs again from wherever it left it: see `repeated`.
   */
  private block(keyword: string, directories: Directories): { directories: Directories; entry?: Directories } {
    if (BLOCK_OPENERS.has(keyword)) {
      this.blocks.push({ keyword, directories, segments: this.context.segments.length });
      return { directories };
    }
    const open = this.blocks.at(-1);
    if (open === undefined || !(BLOCK_BRANCHES.has(keyword) || BLOCK_CLOSERS.has(keyword))) return { directories };
    const closing = BLOCK_CLOSERS.has(keyword);
    if (closing) this.blocks.pop();
    let end = directories;
    if (closing && LOOPS.has(open.keyword) && !same(directories, open.directories)) {
      for (const segment of this.context.segments.slice(open.segments)) {
        for (const write of segment.writeTargets) write.directories = repeated(write.directories, open.directories.length);
      }
      end = repeated(directories, open.directories.length);
    }
    return { directories: merge(open.directories, end), ...(closing ? { entry: open.directories } : {}) };
  }

  /** Commands in sequence: each runs where the one before it may have left the shell. */
  list(start: Directories, closer: ')' | '}' | null): Flow {
    let state = start;
    let flow = stay(start);
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;
      if (token.type === 'pattern') {
        for (const inner of token.substitutions) this.substitute(inner, state);
        this.at++;
        continue;
      }
      if (token.type === 'op' && TERMINATORS.has(token.op)) {
        state = this.block(';;', state).directories;
        this.at++;
        continue;
      }
      if (isOp(token, ';', '\n', '&')) {
        this.at++;
        continue;
      }
      if (isOp(token, ')')) {
        if (closer === ')') return flow;
        this.at++;
        continue;
      }
      if (closer === '}' && isReserved(this.command, token, '}')) return flow;
      const after = this.andOr(state);
      // A list ending in `&` runs in a background subshell.
      if (isOp(this.tokens[this.at], '&')) {
        this.at++;
        flow = stay(state);
      } else {
        flow = after;
        state = settle(after, state);
      }
    }
    if (closer !== null) this.context.complete = false;
    return flow;
  }

  private skipNewlines(): void {
    while (isOp(this.tokens[this.at], '\n')) this.at++;
  }

  /** `a && b` runs `b` where `a` succeeded, `a || b` where it failed. */
  private andOr(directories: Directories): Flow {
    let flow = this.pipeline(directories);
    while (isOp(this.tokens[this.at], '&&', '||')) {
      const and = isOp(this.tokens[this.at], '&&');
      this.at++;
      this.skipNewlines();
      const next = this.pipeline((and ? flow.ok : flow.fail) ?? flow.ok ?? flow.fail ?? directories);
      flow = and ? { ok: next.ok, fail: join(flow.fail, next.fail) } : { ok: join(flow.ok, next.ok), fail: next.fail };
    }
    return flow;
  }

  private pipeline(directories: Directories): Flow {
    let negated = false;
    while (isReserved(this.command, this.tokens[this.at], '!')) {
      negated = !negated;
      this.at++;
    }
    let flow = this.compound(directories);
    let elements = 1;
    while (isOp(this.tokens[this.at], '|', '|&')) {
      this.at++;
      this.skipNewlines();
      flow = this.compound(directories);
      elements++;
    }
    // Every element runs in a subshell, except the last one in zsh or with bash's lastpipe.
    if (elements > 1) flow = stay(moved(flow, directories) ? [...directories, null] : directories);
    return negated ? { ok: flow.fail, fail: flow.ok } : flow;
  }

  private compound(directories: Directories): Flow {
    let token = this.tokens[this.at];
    let closed: Directories | undefined;
    while (token?.type === 'word' && token.text !== '{' && KEYWORDS.has(token.text) && isReserved(this.command, token, token.text)) {
      const step = this.block(token.text, directories);
      directories = step.directories;
      closed = step.entry;
      token = this.tokens[++this.at];
    }
    const opensScope = isOp(token, '(') || isReserved(this.command, token, '{') || isReserved(this.command, token, 'function') ||
      (token?.type === 'word' && isOp(this.tokens[this.at + 1], '(') && isOp(this.tokens[this.at + 2], ')'));
    if (!opensScope) return this.simple(directories, false, closed ?? directories);
    if (this.depth + this.nesting + 1 >= MAX_DEPTH) {
      this.context.complete = false;
      this.at = this.tokens.length;
      return stay(directories);
    }
    this.nesting++;
    try {
      if (isOp(token, '(')) {
        this.at++;
        this.list([...directories], ')');
        if (isOp(this.tokens[this.at], ')')) this.at++;
        this.simple(directories, true);
        return stay(directories);
      }
      if (isReserved(this.command, token, '{')) {
        this.at++;
        const body = this.list(directories, '}');
        if (isReserved(this.command, this.tokens[this.at], '}')) this.at++;
        this.simple(directories, true);
        // zsh's `{ … } always { … }` runs the second block after the first, however that ended.
        if (!isReserved(this.command, this.tokens[this.at], 'always')) return body;
        this.at++;
        this.skipNewlines();
        return this.compound(settle(body, directories));
      }
      // A function definition, `function name [()] body` or `name () body`, runs nothing now; whatever directory
      // its body moves to is unknown wherever it is called.
      this.at += isReserved(this.command, token, 'function') ? 2 : 1;
      if (isOp(this.tokens[this.at], '(') && isOp(this.tokens[this.at + 1], ')')) this.at += 2;
      this.skipNewlines();
      return stay(moved(this.compound([...directories]), directories) ? [...directories, null] : directories);
    } finally {
      this.nesting--;
    }
  }

  /**
   * A simple command, or (`redirectsOnly`) the redirections after a subshell or group. Redirections are opened
   * by this shell, in `redirectFrom`, before any `cd` in the command takes effect.
   */
  private simple(directories: Directories, redirectsOnly: boolean, redirectFrom: Directories = directories): Flow {
    const first = this.at;
    const words: Word[] = [];
    const redirects: { op: string; target: Word }[] = [];
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;
      if (token.type === 'pattern') break;
      if (token.type === 'op') {
        if (SEPARATORS.has(token.op)) break;
        const operand = this.tokens[this.at + 1];
        if (operand?.type === 'word') redirects.push({ op: token.op, target: operand });
        this.at += operand?.type === 'word' ? 2 : 1;
        continue;
      }
      if (redirectsOnly) break;
      words.push(token);
      this.at++;
    }
    if (this.at === first) return stay(directories);

    // Substitutions run before the command, each in a subshell of its own.
    for (const word of words) for (const inner of word.substitutions) this.substitute(inner, directories);
    for (const { target: operand } of redirects) for (const inner of operand.substitutions) this.substitute(inner, redirectFrom);

    const writeTargets: WriteTarget[] = [];
    for (const { op, target: operand } of redirects) {
      if (READS.has(op)) continue;
      if (op === '>&' && /^(?:[0-9]+|-)$/.test(operand.text)) continue;
      if (DISCARDED.has(operand.text) && !operand.opaque && !operand.glob) continue;
      writeTargets.push(targetOf(operand, redirectFrom, this.context.shell));
    }
    return this.invoke(words, writeTargets, directories, this.command.slice(this.tokens[first]!.start, this.tokens[this.at - 1]!.end));
  }

  /** Runs `words` as one command: its segment, the code its arguments hold, and what it leaves the shell's directory as. */
  private invoke(words: readonly Word[], writeTargets: WriteTarget[], directories: Directories, raw: string): Flow {
    const start = commandStart(words, this.context.shell);
    // `xargs -I` puts the words it reads where its replace string stands.
    const argv = words.slice(start.at).map((word) => (start.replaced.some((text) => word.text.includes(text)) ? { ...word, opaque: true } : word));
    // `xargs` appends words only it reads, unless told where to put them.
    if (start.fed && argv.length > 0) argv.push({ ...argv[0]!, text: '', opaque: true, glob: false, substitutions: [] });
    const name = argv[0] === undefined ? '' : basename(argv[0].text);
    const child = start.chdir.length === 0 ? directories : [...directories, ...start.chdir];
    for (const word of argvTargets(name, argv.slice(1), this.context.options)) writeTargets.push(targetOf(word, child, this.context.shell));
    this.context.segments.push({ argv: argv.map((word) => word.text), opaque: argv.map((word) => word.opaque), writeTargets, raw });
    if (name === 'find') {
      for (const command of execsOf(argv.slice(1))) this.invoke(command.words, [], command.here ? child : [...child, null], raw);
    }
    const scripts = argv[0]?.opaque === false ? scriptsOf(name, argv.slice(1)) : [];
    if (scripts === null) this.context.complete = false;
    // The rest may be read or run otherwise than the default options this parser assumes.
    if (argv[0]?.opaque === false && reconfigures(name, argv.slice(1))) this.context.complete = false;
    let movedShell = false;
    for (const script of scripts ?? []) {
      const ran = this.substitute({ text: script, tokens: null }, child);
      movedShell ||= !SHELLS.has(name) && moved(ran, directories);
    }
    if (!start.inShell || argv[0] === undefined || argv[0].opaque) return stay(directories);
    // `eval`, `trap` and `alias` code runs in this shell, so a directory change in it moves the commands after it.
    if (movedShell) return stay([...directories, null]);
    return builtinFlow(argv[0].text, argv.slice(1), directories, this.context.shell);
  }
}

function read(command: string, options: ParseOptions, bash32: boolean): Context {
  const shell = { home: /\bHOME\b/.test(command), cdpath: options.cdpath === true || /\b(?:CDPATH|cdpath)\b/.test(command) };
  const context: Context = { options, shell, bash32, segments: [], complete: true, divergent: false };
  try {
    new Parser(command, context, 0).run([]);
  } catch {
    context.complete = false;
  }
  return context;
}

/** What a segment runs and writes, without the words only the shell expands. */
const signature = (segment: Segment): string =>
  JSON.stringify([segment.argv.filter((_, at) => !segment.opaque[at]), segment.writeTargets]);

/**
 * POSIX shell structure, enough to say what a command runs and where it writes (15 §2). Never throws on input.
 * Where bash 3.2 reads it otherwise, that reading must run and write nothing the other does not. When any of it
 * was not analysed, the last segment is `unparsed` and the others may be incomplete or wrong.
 */
export function parseCommand(command: string, options: ParseOptions = {}): Segment[] {
  const modern = read(command, options, false);
  let complete = modern.complete;
  if (complete && modern.divergent) {
    const legacy = read(command, options, true);
    const known = new Set(modern.segments.map(signature));
    complete = legacy.complete && legacy.segments.every((segment) => known.has(signature(segment)));
  }
  if (!complete) modern.segments.push({ argv: [], opaque: [], writeTargets: [], raw: command, unparsed: true });
  return modern.segments;
}
