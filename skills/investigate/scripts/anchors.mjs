// Shared by check-citations (investigate) and plan-check (plan): what a `path:line` reference looks like.
// An extension holds a letter: `v1.2:3` and `10.0.0.1:80` are versions and addresses, not files, and failed as missing-file.
const PATH = '[\\w@./\\\\-]+\\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+';
export const anchorPattern = () => new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g');

// Sentences stating that something is the only one or does not exist; shared with plan-check, which lists them with their backing search.
// Provenance: the 2026-11-14 plan traces held three false ones, "the only wizard auto-open", "single submit path" and "the only standalone ... wizard route"; the critic never searched them.
// The 2026-11-15 runs missed "No org field ... exists", "no spec exists", "I found no test" and "mirrors RULA with no difference".
// The 2026-11-16 runs missed "`X.y` ... are not filtered" (the critic never checked it) and "delete `A.b` / `C.b`" (the plan's own grep showed another user of the name).
// The ticket 6545 investigation passed "No client-side validation gap" unbacked.
export const CLAIM = /\b(?:only|the sole|single|no other|no caller|not called|never called|does not exist|do not exist|no test|none of|unused|found no|nothing|not (?:filtered|excluded|hidden)|(?:does|do) not (?:filter|exclude|hide))\b|\bno\b[^.;]{0,40}\bexists?\b|\bno (?:\w+ )?differences?\b|\bno (?:[\w-]+ ){0,3}gaps?\b/i;
export const BACKING = /\((?:Grep|Glob|rg)\s+[^)]+\)/i;
// `only when/if/after/once/for/while` is a condition, not a uniqueness claim; a marker inside a backtick span or a `path:line` (`untracked-only.ts:1`) is code, not prose.
export const CONDITION = /\bonly\s+(?:when|if|after|once|for|while)\b/gi;
export const isAbsence = (sentence) => CLAIM.test(sentence.replace(/`[^`]*`/g, ' ').replace(anchorPattern(), ' ').replace(CONDITION, ' '));
// The investigation check flags only these: a negation or uniqueness claim over code entities. CLAIM above also matches "only" as a condition and "found no", "nothing" as process prose:
// on 243 archived notes it flagged 238 notes and 1128 sentences, about 8 of 60 hand-read "only" flags being uniqueness claims.
const CODE_ABSENCE = /\bno (?:[\w-]+ ){0,3}gaps?\b|\bnothing else (?:reads?|calls?|uses?|writes?|references?|sets?|handles?|imports?)\b|\bno other (?:callers?|users?|consumers?|readers?|writers?|places?|paths?|implementations?|usages?|references?)\b|\b(?:is|are) the (?:only|sole) \w+|\bnever called\b|\b(?:is|are) (?:not|never) (?:called|used|referenced|read|written)\b|\bunused\b|\b(?:does|do) not exist\b/i;
export const isCodeAbsence = (sentence) => CODE_ABSENCE.test(sentence.replace(/`[^`]*`/g, ' ').replace(anchorPattern(), ' ').replace(CONDITION, ' '));
// A sentence ends at `. `, `;` or the line end (not after `i.e.` or `e.g.`), outside parentheses and backticks (a backing names paths and scopes).
export const sentencesOf = (line) => {
  const out = [];
  let from = 0;
  let depth = 0;
  let ticks = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at];
    if (char === '`') ticks = !ticks;
    else if (!ticks && char === '(') depth += 1;
    else if (!ticks && char === ')') depth = Math.max(0, depth - 1);
    else if (!ticks && depth === 0 && (char === ';' || (char === '.' && /\s/.test(line[at + 1] ?? '') && !/\b(?:i\.e|e\.g)$/i.test(line.slice(0, at))))) {
      out.push(line.slice(from, at + 1));
      from = at + 1;
    }
  }
  return [...out, line.slice(from)];
};
