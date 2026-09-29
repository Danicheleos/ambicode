#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  contentHash,
  promptsDirectory
} from "./chunk-5CQSZXN2.mjs";

// src/policy/shared-contract.ts
import path from "node:path";
var SHARED_OPERATING_CONTRACT_FILE = "shared-operating-contract.md";
var SHARED_OPERATING_CONTRACT_REFERENCE = `builtin/prompts/${SHARED_OPERATING_CONTRACT_FILE}`;
async function readSharedOperatingContract(fs, pluginRoot) {
  const absolutePath = path.join(promptsDirectory(pluginRoot), SHARED_OPERATING_CONTRACT_FILE);
  const content = await fs.readText(absolutePath);
  return { reference: SHARED_OPERATING_CONTRACT_REFERENCE, content, contentHash: contentHash(content) };
}

export {
  readSharedOperatingContract
};
