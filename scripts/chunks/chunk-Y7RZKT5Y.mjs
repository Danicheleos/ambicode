#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  readSharedOperatingContract
} from "./chunk-2DWOTE7N.mjs";
import {
  contentHash,
  createRuntime,
  openRepository,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative
} from "./chunk-5CQSZXN2.mjs";
import {
  external_exports,
  loadConfig
} from "./chunk-G3MJKSZ6.mjs";

// src/hook/run-hook.ts
import path2 from "node:path";

// src/contracts/hook.ts
var HookInput = external_exports.looseObject({
  hook_event_name: external_exports.string().min(1),
  session_id: external_exports.string().min(1),
  /** Present for a subagent's tool call; absent on the main thread. */
  agent_id: external_exports.string().min(1).optional(),
  cwd: external_exports.string().min(1).optional(),
  scratchpad_dir: external_exports.string().min(1).optional(),
  tool_name: external_exports.string().min(1).optional(),
  tool_input: external_exports.looseObject({
    file_path: external_exports.string().min(1).optional()
  }).optional()
});
var EMPTY_HOOK_OUTPUT = {};

// src/hook/markers.ts
import path from "node:path";
var HOOK_STATE_DIR_NAME = "ambicode-hook-state";
var EPOCH_FILE = "epoch";
var DELIVERED_DIR = "delivered";
function hookStateBaseDir(fs, sessionId, scratchpadDir) {
  if (scratchpadDir !== void 0) return path.join(scratchpadDir, HOOK_STATE_DIR_NAME);
  const sessionKey = contentHash(sessionId).replace(/[^a-z0-9]/gi, "").slice(0, 40);
  return path.join(fs.temporaryRoot(), HOOK_STATE_DIR_NAME, sessionKey);
}
async function currentEpoch(fs, ids, baseDir) {
  const file = path.join(baseDir, EPOCH_FILE);
  try {
    const existing = (await fs.readText(file)).trim();
    if (existing !== "") return existing;
  } catch {
  }
  const fresh = ids.capability();
  await fs.mkdirp(baseDir);
  await fs.writeText(file, fresh);
  return fresh;
}
async function resetEpoch(fs, ids, baseDir) {
  await fs.mkdirp(baseDir);
  await fs.remove(path.join(baseDir, DELIVERED_DIR));
  await fs.writeText(path.join(baseDir, EPOCH_FILE), ids.capability());
}
async function cleanupSessionState(fs, baseDir) {
  await fs.remove(baseDir);
}
function markerPath(baseDir, key) {
  const identity = contentHash(
    `${key.epoch}::${key.agentKey}::${key.kind}::${key.subject}::${key.contentHash}`
  ).replace(/[^a-z0-9]/gi, "");
  return path.join(baseDir, DELIVERED_DIR, key.epoch.replace(/[^a-z0-9]/gi, "").slice(0, 40), identity);
}
async function alreadyDelivered(fs, baseDir, key) {
  return fs.exists(markerPath(baseDir, key));
}
async function markDelivered(fs, baseDir, key) {
  const target = markerPath(baseDir, key);
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, "");
}

// src/hook/run-hook.ts
var MAX_HOOK_INPUT_BYTES = 1048576;
async function runHook(runtime, rawStdin) {
  let parsed;
  try {
    parsed = JSON.parse(rawStdin);
  } catch {
    return EMPTY_HOOK_OUTPUT;
  }
  const result = HookInput.safeParse(parsed);
  if (!result.success) return EMPTY_HOOK_OUTPUT;
  const input = result.data;
  try {
    switch (input.hook_event_name) {
      case "SessionStart": {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await resetEpoch(runtime.fs, runtime.ids, base);
        return await deliverSharedContract(runtime, input, base, "SessionStart");
      }
      case "PostCompact": {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await resetEpoch(runtime.fs, runtime.ids, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case "UserPromptSubmit": {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        return await deliverSharedContract(runtime, input, base, "UserPromptSubmit");
      }
      case "SessionEnd": {
        const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
        await cleanupSessionState(runtime.fs, base);
        return EMPTY_HOOK_OUTPUT;
      }
      case "PostToolUse":
        return await handlePostToolUse(runtime, input);
      default:
        return EMPTY_HOOK_OUTPUT;
    }
  } catch {
    return EMPTY_HOOK_OUTPUT;
  }
}
async function deliverSharedContract(runtime, input, baseDir, event) {
  const contract = await readSharedOperatingContract(runtime.fs, runtime.pluginRoot);
  const key = {
    epoch: await currentEpoch(runtime.fs, runtime.ids, baseDir),
    agentKey: input.agent_id ?? "main",
    kind: "shared-contract",
    subject: contract.reference,
    contentHash: contract.contentHash
  };
  if (await alreadyDelivered(runtime.fs, baseDir, key)) return EMPTY_HOOK_OUTPUT;
  await markDelivered(runtime.fs, baseDir, key);
  const output = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: [
        `AMBICODE operating contract (${contract.reference}, ${contract.contentHash}).`,
        "It governs every AMBICODE skill in this session. `ambicode prepare` cites it by",
        "reference instead of re-sending it; run it with --with-contract if this text is",
        "not in your context.",
        "",
        contract.content.trimEnd()
      ].join("\n")
    }
  };
  return output;
}
async function handlePostToolUse(runtime, input) {
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return EMPTY_HOOK_OUTPUT;
  const absoluteFilePath = input.tool_input?.file_path;
  if (absoluteFilePath === void 0) return EMPTY_HOOK_OUTPUT;
  const hookRuntime = await createRuntime({ ...runtime, cwd: input.cwd ?? runtime.cwd });
  const repository = await openRepository(hookRuntime).catch(() => null);
  if (repository === null) return EMPTY_HOOK_OUTPUT;
  const config = await loadConfig(hookRuntime.fs, repository.repositoryRoot).then((loaded) => loaded.config).catch(() => null);
  if (config === null || !config.authoring.editReminders) return EMPTY_HOOK_OUTPUT;
  const workspace = { runtime: hookRuntime, git: repository.git, repositoryRoot: repository.repositoryRoot, config, configPath: "" };
  const relative = await toRepositoryRelative(workspace, absoluteFilePath);
  if (relative === "" || relative.startsWith("..") || path2.isAbsolute(relative)) {
    return EMPTY_HOOK_OUTPUT;
  }
  const project = projectForPath(config, relative);
  if (project === null) return EMPTY_HOOK_OUTPUT;
  const policy = await resolvePolicyFor({ workspace, project, activity: "task", paths: [relative] }).catch(() => null);
  if (policy === null) return EMPTY_HOOK_OUTPUT;
  const candidates = policy.rules.filter((rule) => rule.remindOnEdit);
  if (candidates.length === 0) return EMPTY_HOOK_OUTPUT;
  const base = hookStateBaseDir(hookRuntime.fs, input.session_id, input.scratchpad_dir);
  const epoch = await currentEpoch(hookRuntime.fs, hookRuntime.ids, base);
  const agentKey = input.agent_id ?? "main";
  const undelivered = [];
  for (const rule of candidates) {
    const key = {
      epoch,
      agentKey,
      kind: "edit-reminder",
      subject: `${relative}::${rule.qualifiedId}`,
      contentHash: ruleContentHash(rule)
    };
    if (await alreadyDelivered(hookRuntime.fs, base, key)) continue;
    undelivered.push(rule);
    await markDelivered(hookRuntime.fs, base, key);
  }
  if (undelivered.length === 0) return EMPTY_HOOK_OUTPUT;
  return buildOutput(relative, undelivered);
}
function ruleContentHash(rule) {
  return contentHash(
    JSON.stringify({
      id: rule.qualifiedId,
      category: rule.category,
      instruction: rule.instruction,
      check: rule.check
    })
  );
}
function buildOutput(relativePath, rules) {
  const lines = [
    `AMBICODE edit reminder for ${relativePath}.`,
    "This is a reminder applied on your NEXT model request, not proof that the edit you just made complied \u2014 verify it yourself.",
    ""
  ];
  for (const rule of rules) {
    lines.push(
      `- [${rule.qualifiedId}] (${rule.authority}, ${rule.category}) \u2014 ${rule.instruction}`,
      `  check: ${rule.check.explanation}`,
      `  source: ${rule.packReference} (${rule.sourceLocation})`,
      `  content: ${ruleContentHash(rule)}`,
      ""
    );
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: lines.join("\n").trimEnd()
    }
  };
}

export {
  EMPTY_HOOK_OUTPUT,
  MAX_HOOK_INPUT_BYTES,
  runHook
};
