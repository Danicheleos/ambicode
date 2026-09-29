#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  EMPTY_HOOK_OUTPUT,
  runHook
} from "./chunk-Y7RZKT5Y.mjs";
import "./chunk-2DWOTE7N.mjs";
import "./chunk-5CQSZXN2.mjs";
import "./chunk-G3MJKSZ6.mjs";
import "./chunk-7M5UXPHU.mjs";
import "./chunk-WZ6VODTW.mjs";
import "./chunk-PSIR5CTP.mjs";

// src/hook/run-codex-hook.ts
import path from "node:path";
async function runCodexHook(runtime, rawStdin) {
  let input;
  try {
    input = JSON.parse(rawStdin);
  } catch {
    return EMPTY_HOOK_OUTPUT;
  }
  if (input["hook_event_name"] !== "PostToolUse") return await runHook(runtime, rawStdin);
  if (input["tool_name"] !== "apply_patch") return EMPTY_HOOK_OUTPUT;
  const toolInput = input["tool_input"];
  if (toolInput === null || typeof toolInput !== "object") return EMPTY_HOOK_OUTPUT;
  const command = toolInput["command"];
  if (typeof command !== "string") return EMPTY_HOOK_OUTPUT;
  const cwd = typeof input["cwd"] === "string" ? input["cwd"] : runtime.cwd;
  const files = editedFilesFromCodexPatch(command, cwd);
  const contexts = [];
  for (const file of new Set(files)) {
    const output = await runHook(runtime, JSON.stringify({
      ...input,
      tool_name: "Edit",
      tool_input: { file_path: file }
    }));
    if (output.hookSpecificOutput?.additionalContext) contexts.push(output.hookSpecificOutput.additionalContext);
  }
  if (contexts.length === 0) return EMPTY_HOOK_OUTPUT;
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: contexts.join("\n\n") } };
}
function editedFilesFromCodexPatch(command, cwd) {
  return [...new Set([...command.matchAll(/^\*\*\* (?:Update|Add) File: (.+)$/gm)].map((match) => path.resolve(cwd, match[1])))];
}
export {
  editedFilesFromCodexPatch,
  runCodexHook
};
