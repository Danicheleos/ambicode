// The turn-by-turn chain of one run, from its trace: every model call, tool call, tool result and hook injection,
// with the time since the start, the time a tool took, and the context of the call. For finding where a run stalls.
// Usage: chain.mjs <trace.jsonl>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A gap this long between two events is flagged: a run at effort low spends 2–10 s per call (2026-10-12 runs).
export const SLOW_SECONDS = 30;
const WIDTH = 160;

const clip = (text, width = WIDTH) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat;
};

/** One line per tool input: the part that says what the call did. */
export function describeInput(name, input = {}) {
  switch (name) {
    case 'Bash': return clip(input.command);
    case 'Read': return `${input.file_path}${input.offset ? ` @${input.offset}` : ''}${input.limit ? ` +${input.limit}` : ''}`;
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return String(input.file_path ?? input.notebook_path);
    case 'Grep': return clip(`${input.pattern}${input.path ? ` in ${input.path}` : ''}${input.glob ? ` (${input.glob})` : ''}`);
    case 'Glob': return clip(`${input.pattern}${input.path ? ` in ${input.path}` : ''}`);
    case 'Agent': case 'Task': return clip(`${input.subagent_type ?? 'agent'}: ${input.description ?? input.prompt ?? ''}`);
    case 'Skill': return clip(`${input.skill ?? input.command ?? ''} ${input.args ?? ''}`);
    default: return clip(JSON.stringify(input));
  }
}

const resultText = (content) => (Array.isArray(content) ? content.map((part) => part.text ?? '').join(' ') : content);

/** The chain as lines; `turns` counts model calls of the main session. */
export function chainOf(traceText) {
  const events = traceText.split('\n').filter((line) => line.trim()).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const stamped = events.map((event) => Date.parse(event.timestamp ?? '')).filter(Number.isFinite);
  const start = stamped.length === 0 ? null : Math.min(...stamped);
  const lines = [];
  const calls = new Map(); // tool_use id → {at, line index}
  const seenMessages = new Set();
  let previous = start;
  let turn = 0;
  // A call streams as several events (thinking, text, tool_use) under one message id; its header goes on the first printed line.
  let pending = '';
  const clock = (event) => {
    const at = Date.parse(event.timestamp ?? '');
    if (!Number.isFinite(at) || start === null) return { at: null, label: '     ' };
    const gap = previous === null ? 0 : (at - previous) / 1000;
    previous = at;
    return { at, label: `${`+${Math.round((at - start) / 1000)}s`.padStart(5)}${gap >= SLOW_SECONDS ? ` ⏱ ${Math.round(gap)}s gap` : ''}` };
  };
  for (const event of events) {
    if (event.type === 'system' && event.subtype === 'hook_response') {
      const output = clip(event.output ?? event.stdout ?? '', 120);
      if (output) lines.push(`        hook ${event.hook_event ?? event.hook_name}: ${output}`);
      continue;
    }
    if (event.type === 'assistant') {
      const sub = event.parent_tool_use_id ? '    sub ' : '';
      const id = event.message?.id;
      if (id && !seenMessages.has(`${id}|${event.parent_tool_use_id}`)) {
        seenMessages.add(`${id}|${event.parent_tool_use_id}`);
        const usage = event.message.usage ?? {};
        const context = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        if (!event.parent_tool_use_id) turn += 1;
        pending = `${event.parent_tool_use_id ? '  ·' : `#${turn}`.padStart(3)} ${clock(event).label} ctx ${(context / 1000).toFixed(1)}k`;
      }
      for (const part of event.message?.content ?? []) {
        const printed = part.type === 'tool_use' || (part.type === 'text' && part.text?.trim());
        if (!printed) continue;
        const lead = pending || '   ';
        pending = '';
        if (part.type === 'tool_use') {
          calls.set(part.id, { at: Date.parse(event.timestamp ?? ''), index: lines.length });
          lines.push(`${lead} ${sub}${part.name}: ${describeInput(part.name, part.input)}`);
        } else if (part.type === 'text' && part.text?.trim()) {
          lines.push(`${lead} ${sub}says: ${clip(part.text, 120)}`);
        }
      }
      continue;
    }
    if (event.type === 'user') {
      for (const part of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (part.type !== 'tool_result') continue;
        const call = calls.get(part.tool_use_id);
        const at = Date.parse(event.timestamp ?? '');
        const took = call && Number.isFinite(call.at) && Number.isFinite(at) ? (at - call.at) / 1000 : null;
        if (Number.isFinite(at)) previous = at;
        const flag = part.is_error ? ' ERROR' : '';
        const slow = took !== null && took >= SLOW_SECONDS ? ` ⏱ ${Math.round(took)}s` : took !== null ? ` ${took.toFixed(1)}s` : '';
        lines.push(`${' '.repeat(event.parent_tool_use_id ? 10 : 6)}→${flag}${slow} ${clip(resultText(part.content), 140)}`);
      }
      continue;
    }
    if (event.type === 'result') {
      const denials = event.permission_denials?.length ?? 0;
      lines.push(`end: ${event.subtype}, stop ${event.stop_reason ?? '—'}, ${event.num_turns ?? turn} turns, ${Math.round((event.duration_ms ?? 0) / 1000)}s${denials ? `, ${denials} permission denial(s)` : ''}${event.terminal_reason ? `, ${event.terminal_reason}` : ''}`);
    }
  }
  return { turns: turn, lines };
}

/** The run with the most main-session turns (then the longest), among runs whose trace was kept. */
export function longestRun(result) {
  let best = null;
  for (const evalCase of result.cases ?? []) {
    for (const runs of Object.values(evalCase.arms ?? {})) {
      (runs ?? []).forEach((run, index) => {
        if (!run.trace) return;
        const key = [run.turns ?? 0, run.durationSeconds ?? 0];
        if (best === null || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { key, name: evalCase.name, index, run };
      });
    }
  }
  return best;
}

/** The longest run's chain as a Markdown page. */
export function longestReport(result, arm) {
  const best = longestRun(result);
  if (best === null) return null;
  const { name, index, run } = best;
  const failing = (run.graders ?? []).filter((grader) => !grader.passed).map((grader) => grader.name);
  const { lines } = chainOf(readFileSync(run.trace, 'utf8'));
  return [
    `# Longest ${arm} run: ${name} (run ${index + 1})`,
    '',
    `score ${Number((run.score ?? 0).toFixed(2))} · ${run.turns} turns · ${run.durationSeconds}s · $${(run.costUsd ?? 0).toFixed(4)} · peak context ${run.context ? `${(run.context.peak / 1000).toFixed(1)}k` : '—'} · failing: ${failing.join(', ') || 'none'}`,
    `trace: ${run.trace}`,
    '',
    `\`#n\` is a main-session model call, \`·\` a subagent call, \`→\` the tool result with the time it took; ⏱ marks ${SLOW_SECONDS}s or more.`,
    '',
    '```',
    ...lines,
    '```',
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error('usage: chain.mjs <trace.jsonl>');
    process.exitCode = 2;
  } else {
    console.log(chainOf(readFileSync(file, 'utf8')).lines.join('\n'));
  }
}
