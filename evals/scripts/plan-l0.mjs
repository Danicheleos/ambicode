// For an archived plan-stage run: what the model had looked at before it last wrote plan.md, and what the plan does with the ticket.
//   node evals/scripts/plan-l0.mjs <stamp-dir | stamp/case>... [--json] [--items]
// `planBullets` restates the requirements parser plan-check.mjs had until the plan critic took the check over (plus the split at an ellipsis).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorPattern } from '../../skills/investigate/scripts/anchors.mjs';

const READ_DEFAULT_LINES = 2000; // the Read tool's window when no limit is given

// ---------- load ----------

const parseJson = (text) => { try { return JSON.parse(text); } catch { return null; } };
const jsonLines = (text) => text.split('\n').map(parseJson).filter((value) => value !== null);
const textOf = (content) => (Array.isArray(content) ? content.map((piece) => (typeof piece === 'string' ? piece : piece?.text ?? '')).join('\n') : String(content ?? ''));
const partsOf = (event) => (Array.isArray(event?.message?.content) ? event.message.content : []);
const contentHash = (text) => `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;

// /private/tmp and /tmp name one directory on macOS: paths and texts are compared in the /tmp form, relative to the run's root.
const inRepo = (text, root) => text.replaceAll('\\', '/').replace(/\/private(?=\/(?:tmp|var)\/)/g, '').replaceAll(`${root}/`, '');

/** The tool calls in transcript order, each once (a transcript repeats a record under its tool_use id), with the text of its result. */
export function toolCalls(events) {
  const calls = new Map();
  events.forEach((event, at) => {
    for (const part of partsOf(event)) {
      if (part?.type === 'tool_use' && !calls.has(part.id)) calls.set(part.id, { at, name: part.name, input: part.input ?? {}, result: '' });
      if (part?.type === 'tool_result' && calls.has(part.tool_use_id)) calls.get(part.tool_use_id).result ||= textOf(part.content);
    }
  });
  return [...calls.values()];
}

/** Every text delivered to the model: tool results and hook attachments (older runs delivered the draft step as an attachment). */
function deliveredTexts(events) {
  const results = events.flatMap((event) => partsOf(event).filter((part) => part?.type === 'tool_result').map((part) => textOf(part.content)));
  const attachments = events.filter((event) => event?.attachment?.type === 'hook_additional_context').map((event) => textOf(event.attachment.content));
  return [...results, ...attachments];
}

// Older runs had the model write steps/plan-body.md and the route assemble plan.md from it.
const isPlanWrite = (call) => ['Write', 'Edit', 'MultiEdit'].includes(call.name) && /(^|[\\/])plan(-body)?\.md$/.test(call.input.file_path ?? '');

/** The ticket as plan-check read it: for each requirement row of the ledger, the capture of that key still holding the recorded text; the latest per key; else the route's request text. */
function ticketOf(taskDir, ledger) {
  const dir = path.join(taskDir, 'requirements');
  const names = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')).sort() : [];
  const captures = names.map((name) => parseJson(readFileSync(path.join(dir, name), 'utf8'))).filter((capture) => typeof capture?.content === 'string');
  const latest = new Map();
  for (const row of ledger.filter((entry) => entry.kind === 'requirement')) {
    const capture = captures.find((file) => file.key === row.key && file.rawHash === row.rawHash && contentHash(file.content) === file.rawHash);
    if (capture !== undefined) latest.set(capture.key, capture.content);
  }
  const captured = [...latest.values()].join('\n');
  // Older runs have no requirements/ directory: the request is the text the route was started with.
  const started = ledger.find((entry) => entry.kind === 'route')?.args?.text;
  return captured.trim() !== '' ? captured : typeof started === 'string' ? started : '';
}

/** `{ calls, plan, ticket, planClaims, texts, root }` of the run at `base` (`<dir>/<case>`), or null without a transcript, a plan write or a plan.md. `calls` are those before the last plan write; `planClaims` is the `{ claims, unbacked, uncitedMap }` figure of the last plan-claims row of the ledger (null: the run has none, it predates the row). */
export function loadRun(base) {
  const transcriptDir = `${base}.transcript`;
  const tasksDir = path.join(`${base}.ambicode`, '.ambicode', 'tasks');
  const transcript = existsSync(transcriptDir) ? readdirSync(transcriptDir).find((name) => name.endsWith('.jsonl')) : undefined;
  const slug = existsSync(tasksDir) ? readdirSync(tasksDir).find((name) => existsSync(path.join(tasksDir, name, 'plan.md'))) : undefined;
  if (transcript === undefined || slug === undefined) return null;
  const events = jsonLines(readFileSync(path.join(transcriptDir, transcript), 'utf8'));
  const calls = toolCalls(events);
  const write = calls.filter(isPlanWrite).at(-1);
  if (write === undefined) return null;
  const taskDir = path.join(tasksDir, slug);
  const ledgerFile = path.join(taskDir, 'ledger.jsonl');
  const ledger = existsSync(ledgerFile) ? jsonLines(readFileSync(ledgerFile, 'utf8')) : [];
  const summary = ledger.filter((entry) => entry.kind === 'worker' && entry.worker === 'plan-claims').at(-1)?.summary;
  return {
    calls: calls.filter((call) => call.at < write.at),
    plan: readFileSync(path.join(taskDir, 'plan.md'), 'utf8'),
    ticket: ticketOf(taskDir, ledger),
    planClaims: typeof summary?.claims === 'number' ? { claims: summary.claims, unbacked: summary.unbacked, uncitedMap: summary.uncitedMap ?? null } : null,
    texts: deliveredTexts(events),
    root: write.input.file_path.replaceAll('\\', '/').replace(/\/private(?=\/(?:tmp|var)\/)/, '').replace(/\/\.ambicode\/.*$/, ''),
  };
}

/** The run bases a command-line argument names: a stamp directory expands to its cases; an argument naming none is an error. */
export function runBases(arg) {
  const base = arg.replace(/\.(transcript|ambicode)$/, '');
  const cases = existsSync(`${base}.transcript`) ? [base]
    : existsSync(arg) ? readdirSync(arg).filter((name) => name.endsWith('.transcript')).map((name) => path.join(arg, name.replace(/\.transcript$/, ''))) : [];
  if (cases.length === 0) throw new Error(`no run at ${arg}: expected <stamp>/<case> or a stamp directory holding <case>.transcript`);
  return cases;
}

// ---------- plan text ----------

/** The plan's lines with number, level-2 section and fence state: a fenced block is example text. */
export function planLines(plan) {
  let section = '';
  let fence = null;
  return plan.split('\n').map((text, index) => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    const closes = fence !== null && mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length;
    if (mark !== undefined && (fence === null || closes)) {
      fence = closes ? null : mark;
      return { n: index + 1, text, section, fenced: true };
    }
    const heading = fence === null ? /^##\s+(.+?)\s*$/.exec(text) : null;
    if (heading !== null) section = heading[1];
    return { n: index + 1, text, section, fenced: fence !== null };
  });
}

// ---------- what the model saw ----------

/** The Read windows, and the text the model's searches and commands showed (a Grep or Glob result, a Bash command and its output; a Grep over one file prints no file name, so its path counts). */
function lookedAt(calls, root) {
  const reads = calls.filter((call) => call.name === 'Read' && call.input.file_path).map((call) => {
    const from = Number(call.input.offset) || 1;
    return { file: inRepo(call.input.file_path, root), from, to: from + (Number(call.input.limit) || READ_DEFAULT_LINES) - 1 };
  });
  // A route command is the harness speaking: its output names files the model did not look at.
  const shown = calls.filter((call) => call.name === 'Grep' || call.name === 'Glob' || (call.name === 'Bash' && !/ambicode\.mjs/.test(call.input.command ?? '')));
  return { reads, text: inRepo(shown.map((call) => `${call.input.command ?? call.input.path ?? ''}\n${call.result}`).join('\n'), root) };
}

const covers = (windows, from, to) => {
  let next = from;
  for (const window of [...windows].sort((a, b) => a.from - b.from)) if (window.from <= next && window.to >= next) next = window.to + 1;
  return next > to;
};
// A command run after `cd main` names `main/models/a.ts` as `models/a.ts`: any tail of two or more segments names the file; a bare name, any path ending in it.
const mentions = (text, file) => {
  const parts = file.split('/');
  const names = parts.length === 1 ? [file] : parts.slice(0, -1).map((_, at) => parts.slice(at).join('/'));
  return names.some((name) => new RegExp(`(?<![\\w.-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-]|\\.\\w)`).test(text));
};

/** `read`: a Read covered the lines (any Read of the file when no lines are given); `seen`: the file was opened elsewhere or a search or command named it; else `unseen`. */
export function stateOf(seen, file, lines) {
  const opened = seen.reads.filter((read) => (file.includes('/') ? read.file === file : path.posix.basename(read.file) === file));
  if (lines === undefined ? opened.length > 0 : covers(opened, ...lines)) return 'read';
  return opened.length > 0 || mentions(seen.text, file) ? 'seen' : 'unseen';
}

/**
 * The files a search printed that the model never opened: a Grep result (`path:line:` lines in content mode, bare paths in files_with_matches, `path:n` in count mode)
 * and the `path:line:` lines of a Bash grep or rg, less the files a Read opened and those a Bash `cat` or `sed -n` command names.
 */
export function hitFilesNeverRead(calls, root) {
  const clean = (file) => path.posix.normalize(inRepo(file, root)).replace(/^\.\//, '');
  const hits = new Set();
  for (const call of calls) {
    const command = call.input.command ?? '';
    const search = call.name === 'Grep' || (call.name === 'Bash' && /\b(?:grep|rg)\b/.test(command) && !/ambicode\.mjs/.test(command));
    if (!search) continue;
    for (const line of inRepo(call.result, root).split('\n')) {
      const listing = call.name === 'Grep' && (call.input.output_mode ?? 'files_with_matches') === 'files_with_matches';
      const file = /^([^\s:][^:]*?):\d+(?::|$)/.exec(line)?.[1] ?? (listing && /^[^\s:]+$/.test(line) && /[./]/.test(line) ? line : undefined);
      if (file !== undefined) hits.add(clean(file));
    }
  }
  const opened = new Set(calls.filter((call) => call.name === 'Read' && call.input.file_path).map((call) => clean(call.input.file_path)));
  const named = calls.filter((call) => call.name === 'Bash' && /\b(?:cat|sed\s+-n)\b/.test(call.input.command ?? '')).map((call) => inRepo(call.input.command, root));
  return [...hits].filter((file) => !opened.has(file) && !named.some((command) => mentions(command, file))).sort();
}

// ---------- 1: cites ----------

// `file:from-to`, or a bare backticked `:from-to` that takes the file of the cite before it on the line.
const CITE = new RegExp(`${anchorPattern().source}|\`:(\\d+(?:\\s*[-–]\\s*\\d+)?)\``, 'g');

/** Every cite outside fenced blocks; one under an `## Iteration` heading says where to edit, not what the code does. */
export function citesOf(lines, root) {
  return lines.filter((line) => !line.fenced).flatMap(({ n, text, section }) => {
    let file = null;
    return [...text.matchAll(CITE)].flatMap(([, named, spec, follow]) => {
      file = named ?? file;
      if (file === null) return [];
      const [from, to = from] = (spec ?? follow).replace(/\s/g, '').split(/[-–]/).map(Number);
      return [{ line: n, file: path.posix.normalize(inRepo(file, root)), from, to, edit: /^iteration\b/i.test(section) }];
    });
  });
}

// ---------- 2: requirements ----------

const plain = (text) => text.replace(/[*`]|__/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The plan's `## Requirements` bullets as plan-check read them: their quoted pieces (an unquoted bullet is its whole text), each piece cut at an ellipsis. */
export function planBullets(lines) {
  const bullets = lines.filter((line) => !line.fenced && /^requirements$/i.test(line.section) && /^\s*[-*]\s+/.test(line.text));
  return bullets.map(({ n, text }) => {
    const bullet = text.replace(/^\s*[-*]\s+/, '').trim();
    const quoted = [...bullet.matchAll(/"([^"]*)"|“([^”]*)”/g)].map(([, straight, curly]) => (straight ?? curly).replace(/^\s*[A-Za-z][\w-]*:\s*/, ''));
    const texts = quoted.length > 0 ? quoted : [bullet.replace(/(?:\s*\((?:Iterations?|already met)\b[^()]*\))+$/i, '')];
    return { line: n, pieces: texts.flatMap((piece) => piece.split(/\.{3}|…/)).map((piece) => piece.replace(/\s+/g, ' ').trim()).filter(Boolean) };
  }).filter((bullet) => bullet.pieces.length > 0);
}

/** The ticket cut into points: lines, then the bullet and heading marks of a flattened ticket, then sentences when nothing cut it. */
export function ticketPoints(ticket) {
  const cut = (pattern) => ticket.split(pattern).map((point) => point.replace(/^[\s#*•-]+/, '').trim()).filter(Boolean);
  const byMarks = cut(/\n+|\s+[-*•]\s+|\s+#{1,6}\s+/);
  return byMarks.length > 1 ? byMarks : cut(/(?<=[.!?])\s+/);
}
// Ticket metadata the plan rightly leaves unquoted: a `Label: ...` line or fewer than 3 words. A ticket of one point has none.
const isMetadata = (point, count) => count > 1 && (/^[A-Za-z][\w ]{0,24}:\s/.test(point) || point.split(/\s+/).length < 3);

/**
 * Plan quotes not in the ticket, ticket points no quote lies in, bullets whose quotes lie in two or more points.
 * `status` says when the check could not run in full: no ticket (nothing to compare), no Requirements section or no entries in it (every ticket point is then uncovered).
 */
export function checkRequirements(lines, ticket) {
  const points = ticketPoints(ticket).map((text) => ({ text, plain: plain(text) }));
  const whole = plain(ticket);
  const bullets = planBullets(lines);
  const hasSection = lines.some((line) => !line.fenced && /^requirements$/i.test(line.section));
  const status = points.length === 0 ? 'no ticket captured' : !hasSection ? 'no Requirements section' : bullets.length === 0 ? 'no entries under Requirements' : null;
  const covered = new Set();
  const planMissing = [];
  const merged = [];
  for (const { line, pieces } of points.length === 0 ? [] : bullets) {
    const lost = pieces.filter((piece) => !whole.includes(plain(piece)));
    if (lost.length > 0) planMissing.push({ line, quotes: lost });
    const hit = new Set(pieces.map((piece) => points.findIndex((point) => point.plain.includes(plain(piece)))).filter((index) => index >= 0));
    for (const index of hit) covered.add(index);
    if (hit.size > 1) merged.push({ line, points: [...hit].map((index) => points[index].text) });
  }
  const uncovered = points.filter((point, index) => !covered.has(index) && !isMetadata(point.text, points.length)).map((point) => point.text);
  return { status, planMissing, uncovered, merged };
}

// ---------- 3: map rows and docs delivered in the draft step ----------

/** The map's candidate paths and the listed documentation paths of the draft step text (the first of each). */
export function deliveredFiles(texts) {
  const lines = texts.flatMap((text) => text.split('\n')).map((line) => line.replace(/^ *\d+\t/, ''));
  const rows = parseJson(lines.find((line) => line.startsWith('{"candidates"')) ?? '')?.candidates ?? [];
  const listing = lines.find((line) => line.startsWith('Documentation files (path, bytes): '));
  const docs = (listing?.slice(listing.indexOf(': ') + 2).split(/,\s+/) ?? []).map((entry) => /^(\S+)\s+\d+$/.exec(entry.trim())?.[1]).filter(Boolean);
  return { rows: rows.map((row) => row[0]), docs };
}

// ---------- 4: absence claims ----------

const ABSENCE = [
  /\b(?:does|do|did|is|are) not exist\b|\bdoesn'?t exist\b/i,
  /\bno\b[^.;]{0,80}?\b(?:exists?|existing|found|callers?|usages?|references?|consumers?|hits)\b/i,
  /\bnothing\b[^.;]{0,70}?\b(?:calls?|reads?|uses?|imports?|references?|consumes?|depends?)\b/i,
  /\bonly (?:the )?(?:listed|above)\b|\bonly\b[^.;]{0,40}\bexists?\b/i,
  /\b(?:not|never|nowhere)\s+(?:used|called|referenced|imported)\b/i,
  /\b(?:has|have|had) no\b|\bwithout any\b|\bnone of\b|\bno other\b/i,
  /^[\s*-]*lacks?:/i, // the plan format's own label for what the code does not have
];

/** Sentences of the plan's prose that state an absence or no callers. Whether a search backs them is for a reader: the tool cannot tell. */
export function absenceClaims(lines) {
  const prose = lines.filter((line) => !line.fenced && !/^requirements$/i.test(line.section) && !/^\s*-?\s*\*?(?:Checks|Goal)\*?:/i.test(line.text));
  return prose.flatMap(({ n, text }) => text.split(/(?<=[.;!?])\s+(?=[A-Z`(*-])/)
    .filter((sentence) => ABSENCE.some((pattern) => pattern.test(sentence)))
    .map((sentence) => ({ line: n, text: sentence.trim() })));
}

// ---------- run and output ----------

export function analyseRun(base) {
  const run = loadRun(base);
  const name = path.join(path.basename(path.dirname(base)), path.basename(base));
  if (run === null) return { run: name, error: 'no transcript with a plan write, or no plan.md' };
  const lines = planLines(run.plan);
  const seen = lookedAt(run.calls, run.root);
  const delivered = deliveredFiles(run.texts);
  const listed = (files) => ({ total: files.length, unseen: files.filter((file) => stateOf(seen, file) === 'unseen') });
  return {
    run: name,
    cites: citesOf(lines, run.root).map((cite) => ({ ...cite, state: stateOf(seen, cite.file, [cite.from, cite.to]) })),
    requirements: checkRequirements(lines, run.ticket),
    claims: run.planClaims,
    rows: listed(delivered.rows),
    docs: listed(delivered.docs),
    absence: absenceClaims(lines),
    unreadHits: hitFilesNeverRead(run.calls, run.root),
  };
}

const HEAD = ['run', 'cites', 'read/seen/unseen (unseen outside iterations)', 'plan quote miss', 'plan-claims unbacked/total, uncited map candidates', 'ticket uncovered', 'merged', 'rows unseen/total', 'docs unseen/total', 'absence claims', 'search hit files never read'];

export function formatTable(results) {
  const rows = results.map((result) => {
    if (result.error) return `| ${result.run} | ${result.error} |`;
    const count = (state) => result.cites.filter((cite) => cite.state === state).length;
    const unseenClaims = result.cites.filter((cite) => cite.state === 'unseen' && !cite.edit).length;
    const { status, planMissing, uncovered, merged } = result.requirements;
    // A check that could not run says so in its columns: a 0 there would read as "no misses".
    const noTicket = status === 'no ticket captured';
    const cells = [result.run, result.cites.length, `${count('read')}/${count('seen')}/${count('unseen')} (${unseenClaims})`, status ?? planMissing.length, result.claims === null ? 'n/a' : `${result.claims.unbacked}/${result.claims.claims}, uncited ${result.claims.uncitedMap ?? 'n/a'}`, noTicket ? status : uncovered.length, status === null ? merged.length : noTicket ? status : 'n/a', `${result.rows.unseen.length}/${result.rows.total}`, `${result.docs.unseen.length}/${result.docs.total}`, result.absence.length, result.unreadHits.length];
    return `| ${cells.join(' | ')} |`;
  });
  return [`| ${HEAD.join(' | ')} |`, `|${HEAD.map(() => '---').join('|')}|`, ...rows].join('\n');
}

export function formatItems(result) {
  if (result.error) return `${result.run}: ${result.error}`;
  const { status, planMissing, uncovered, merged } = result.requirements;
  const groups = {
    'requirements check': status === null ? [] : [status],
    'cites not read': result.cites.filter((cite) => cite.state !== 'read').map((cite) => `plan:${cite.line} ${cite.file}:${cite.from}${cite.to === cite.from ? '' : `-${cite.to}`} ${cite.state}${cite.edit ? ' (edit anchor)' : ''}`),
    'plan quotes not in the ticket': planMissing.map((item) => `plan:${item.line} "${item.quotes.join('" and "')}"`),
    'ticket points no plan quote covers': uncovered,
    'merged bullets': merged.map((item) => `plan:${item.line} ${item.points.map((point) => `"${point}"`).join(', ')}`),
    'map rows unseen': result.rows.unseen,
    'docs unseen': result.docs.unseen,
    'absence claims': result.absence.map((claim) => `plan:${claim.line} ${claim.text}`),
    'search hit files never read': result.unreadHits,
  };
  const sections = Object.entries(groups).filter(([, list]) => list.length > 0).flatMap(([title, list]) => [`- ${title} (${list.length})`, ...list.map((item) => `  - ${item}`)]);
  return [`### ${result.run}`, ...sections].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const paths = args.filter((arg) => !arg.startsWith('--'));
    if (paths.length === 0) throw new Error('usage: plan-l0.mjs <stamp-dir | stamp/case>... [--json] [--items]');
    const results = paths.flatMap(runBases).map(analyseRun);
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    else process.stdout.write(`${formatTable(results)}\n${args.includes('--items') ? `\n${results.map(formatItems).join('\n\n')}\n` : ''}`);
  } catch (error) {
    process.stderr.write(`plan-l0: ${error.message}\n`);
    process.exitCode = 1;
  }
}
