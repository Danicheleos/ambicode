/**
 * A subagent's final report from its transcript (JSON lines). In this host the report is the last `SubagentHandback`
 * tool call's `message`; plain Claude Code ends on an assistant text block. Both are read, the handback first.
 */
export function finalReportOf(jsonLines: string): string | null {
  let handback: string | null = null;
  let text: string | null = null;
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') continue;
    let entry: { type?: unknown; message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue;
    for (const block of entry.message.content as { type?: unknown; text?: unknown; name?: unknown; input?: { message?: unknown } }[]) {
      if (block.type === 'tool_use' && block.name === 'SubagentHandback' && typeof block.input?.message === 'string') handback = block.input.message;
      else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') text = block.text;
    }
  }
  return handback ?? text;
}
