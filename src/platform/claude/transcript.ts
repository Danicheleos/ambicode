import { open } from 'node:fs/promises';
import { MARKER } from '#types/harness';
import { redactCommand } from '../ledger/redact.ts';

const TAIL_BYTES = 1024 * 1024;
const REJECTED = "The user doesn't want to proceed with this tool use.";

interface Block { type?: string; id?: string; name?: string; input?: { questions?: { question?: unknown }[] }; tool_use_id?: string; is_error?: boolean; content?: unknown }

/** A tool_result Claude Code records when the user declines the tool use (dismissing a question): an error whose text starts with a fixed sentence. */
export function isRejection(block: Block): boolean {
  if (block.type !== 'tool_result' || block.is_error !== true) return false;
  const content = block.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : '')).join('') : '';
  return text.startsWith(REJECTED);
}

/** The marker line of the latest gate question the user dismissed and when, read from the transcript's tail; null when none or unreadable. */
export async function rejectedGateMarker(transcript: string): Promise<{ marker: string; at: string | null } | null> {
  try {
    const handle = await open(transcript, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const asked = new Map<string, string>();
      let found: { marker: string; at: string | null } | null = null;
      for (const line of buffer.toString('utf8').split('\n').slice(size > length ? 1 : 0)) {
        let entry: { timestamp?: unknown; message?: { content?: unknown } };
        try {
          entry = JSON.parse(line) as typeof entry;
        } catch {
          continue;
        }
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content as Block[]) {
          if (block.type === 'tool_use' && block.name === 'AskUserQuestion' && typeof block.id === 'string') {
            const marker = (block.input?.questions ?? []).map((question) => (typeof question.question === 'string' ? MARKER.exec(question.question)?.[0] : undefined)).find((value) => value !== undefined);
            if (marker !== undefined) asked.set(block.id, marker);
          } else if (isRejection(block) && block.tool_use_id !== undefined) {
            const marker = asked.get(block.tool_use_id);
            if (marker !== undefined) found = { marker, at: typeof entry.timestamp === 'string' ? entry.timestamp : null };
          }
        }
      }
      return found;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export type CommandShape = 'package-script' | 'node-script' | 'git' | 'ambicode' | 'other';

export interface TurnSummary {
  tools: Record<string, number>;
  commands: { text: string; kind: CommandShape }[];
  context: { input: number; cacheRead: number; cacheCreate: number; output: number; peak: number };
  /** The last assistant message counted: the next summary starts after it. */
  lastMessage: string | null;
}

const ENV_PREFIX = /^(?:cd\s+\S+\s*&&\s*|[A-Za-z_]\w*=\S*\s+)+/;

/** Classifies a shell command by its shape: no tool names are looked up. */
export function commandShape(command: string): CommandShape {
  const text = command.trim().replace(ENV_PREFIX, '');
  const [first = '', second = ''] = text.split(/\s+/);
  if (/ambicode(?:\.mjs)?$/.test(first) || /\bambicode\.mjs\b/.test(text.slice(0, 120))) return 'ambicode';
  if (first === 'git') return 'git';
  if (first === 'node') return second !== '' && !second.startsWith('-') ? 'node-script' : 'other';
  if (/^(?:run|run-script|test|t|start)$/.test(second) && first !== 'git') return 'package-script';
  return 'other';
}

interface Usage { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number }
interface Line { type?: string; message?: { id?: string; role?: string; content?: unknown; usage?: Usage } }

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const isPrompt = (line: Line): boolean => {
  if (line.type !== 'user' && line.message?.role !== 'user') return false;
  const content = line.message?.content;
  return typeof content === 'string' || (Array.isArray(content) && content.some((block: { type?: string }) => block.type === 'text'));
};

/** What the model did since the user's latest prompt and after the `after` message, read from the transcript's tail; null when unreadable or empty. */
export async function turnSummary(transcript: string, after: string | null = null): Promise<TurnSummary | null> {
  try {
    const handle = await open(transcript, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const lines: Line[] = [];
      for (const raw of buffer.toString('utf8').split('\n').slice(size > length ? 1 : 0)) {
        try {
          lines.push(JSON.parse(raw) as Line);
        } catch {
          continue;
        }
      }
      const counted = after === null ? -1 : lines.findLastIndex((line) => line.message?.id === after);
      const since = Math.max(lines.findLastIndex(isPrompt), counted) + 1;
      const turn = lines.slice(since);
      const tools: Record<string, number> = {};
      const commands: TurnSummary['commands'] = [];
      const usage = new Map<string, Usage>();
      let lastMessage: string | null = null;
      for (const [index, line] of turn.entries()) {
        if (line.type !== 'assistant' && line.message?.role !== 'assistant') continue;
        usage.set(line.message?.id ?? `line-${index}`, line.message?.usage ?? {});
        lastMessage = line.message?.id ?? lastMessage;
        const content = line.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content as { type?: string; name?: string; input?: { command?: unknown } }[]) {
          if (block.type !== 'tool_use' || typeof block.name !== 'string') continue;
          tools[block.name] = (tools[block.name] ?? 0) + 1;
          if (block.name === 'Bash' && typeof block.input?.command === 'string') commands.push({ text: redactCommand(block.input.command), kind: commandShape(block.input.command) });
        }
      }
      if (usage.size === 0) return null;
      const context = { input: 0, cacheRead: 0, cacheCreate: 0, output: 0, peak: 0 };
      for (const one of usage.values()) {
        const [input, cacheRead, cacheCreate] = [num(one.input_tokens), num(one.cache_read_input_tokens), num(one.cache_creation_input_tokens)];
        context.input += input;
        context.cacheRead += cacheRead;
        context.cacheCreate += cacheCreate;
        context.output += num(one.output_tokens);
        context.peak = Math.max(context.peak, input + cacheRead + cacheCreate);
      }
      return { tools, commands, context, lastMessage };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
