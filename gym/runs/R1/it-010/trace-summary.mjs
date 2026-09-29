#!/usr/bin/env node
// Usage: node trace-summary.mjs <result.json> <traces-dir>
// Reads the traces THIS sweep names (not the whole traces dir, which also holds Opus runs) and
// prints, per suite kind and arm: the agent models seen in system/init rows, and how many runs
// called the Skill tool, with which skill names, and how many ran an ambicode helper command.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [resultFile, tracesDir] = process.argv.slice(2);
const result = JSON.parse(readFileSync(resultFile, 'utf8'));
const groups = new Map();
let missing = 0;
for (const c of result.cases) {
  const kind = c.name.includes('-review-') ? 'review' : 'localize';
  for (const [arm, runs] of Object.entries(c.arms)) {
    for (const run of Object.values(runs)) {
      const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1];
      const file = id && path.join(tracesDir, `${id}.jsonl`);
      if (!file || !existsSync(file)) {
        missing += 1;
        continue;
      }
      const key = `${kind}/${arm}`;
      const g = groups.get(key) ?? { traces: 0, models: {}, skillRuns: 0, skills: {}, helperCmdRuns: 0, toolCalls: 0 };
      groups.set(key, g);
      g.traces += 1;
      let skill = false;
      let helper = false;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (row.type === 'system' && row.subtype === 'init' && row.model) g.models[row.model] = (g.models[row.model] ?? 0) + 1;
        for (const part of row.message?.content ?? []) {
          if (part?.type !== 'tool_use') continue;
          g.toolCalls += 1;
          if (part.name === 'Skill') {
            skill = true;
            const s = String(part.input?.skill ?? part.input?.name ?? '?');
            g.skills[s] = (g.skills[s] ?? 0) + 1;
          }
          if (part.name === 'Bash' && /ambicode(\.mjs)?\s+(prepare|finish|review|localize)|scripts\/ambicode/.test(String(part.input?.command ?? ''))) helper = true;
        }
      }
      if (skill) g.skillRuns += 1;
      if (helper) g.helperCmdRuns += 1;
    }
  }
}
console.log(JSON.stringify({ missingTraces: missing, groups: Object.fromEntries(groups) }, null, 2));
