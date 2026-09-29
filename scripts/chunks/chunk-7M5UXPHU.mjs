#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  AmbicodeError
} from "./chunk-WZ6VODTW.mjs";

// src/git/git.ts
var SAFE_CONFIG = [
  "-c",
  "core.quotepath=false",
  "-c",
  "diff.external=",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false"
];
var GIT_TIMEOUT_MS = 6e4;
var GIT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
var Git = class _Git {
  options;
  constructor(options) {
    this.options = options;
  }
  async exec(args, allowFailure = false) {
    return (await this.execOutcome(args, allowFailure)).stdout;
  }
  /**
   * Keeps the exit code for callers where nonzero is an answer: `git grep` exits
   * 1 for "no match", while anything above 1 must not be read as an empty result.
   */
  async execOutcome(args, allowFailure = false) {
    const prefix = this.options.gitDir === void 0 ? [] : ["--git-dir", this.options.gitDir];
    const outcome = await this.options.runner.run({
      argv: ["git", ...prefix, ...SAFE_CONFIG, ...args],
      cwd: this.options.repositoryRoot,
      timeoutMs: GIT_TIMEOUT_MS,
      maxOutputBytes: GIT_MAX_OUTPUT_BYTES,
      // Git needs the operator's own configuration, credential helpers and ssh
      // agent, so it inherits the environment plus narrow overrides.
      env: {
        kind: "inherited",
        overrides: {
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          LANG: "C",
          ...this.options.extraEnv
        }
      }
    });
    if (outcome.kind === "spawn-failed") {
      throw new AmbicodeError("git-unavailable", "git could not be started.", {
        details: [outcome.failure ?? "unknown spawn failure"]
      });
    }
    if (outcome.kind === "timed-out") {
      throw new AmbicodeError("git-timeout", `git ${args[0] ?? ""} timed out.`);
    }
    if (outcome.exitCode !== 0 && !allowFailure) {
      throw new AmbicodeError("git-failed", `git ${args[0] ?? ""} failed with exit code ${outcome.exitCode}.`, {
        details: [outcome.stderr.trim()].filter((line) => line !== "")
      });
    }
    if (outcome.truncated) {
      throw new AmbicodeError("git-output-truncated", `git ${args[0] ?? ""} produced more output than AMBICODE reads.`);
    }
    return { stdout: outcome.stdout, exitCode: outcome.exitCode };
  }
  /**
   * Writes index changes to `indexFile` instead of `.git/index`, so inspecting
   * the working tree cannot alter the developer's staged state.
   */
  withIndexFile(indexFile) {
    return new _Git({ ...this.options, extraEnv: { ...this.options.extraEnv, GIT_INDEX_FILE: indexFile } });
  }
  async markIntentToAdd() {
    await this.exec(["add", "--intent-to-add", "--", "."], true);
  }
  async gitCommonDir() {
    return (await this.exec(["rev-parse", "--path-format=absolute", "--git-dir"])).trim();
  }
  async isDirty() {
    return (await this.status()).trim() !== "";
  }
  async status() {
    return await this.exec(["status", "--porcelain", "-z", "--untracked-files=all"], true);
  }
  async isRepository() {
    const output = await this.exec(["rev-parse", "--is-inside-work-tree"], true);
    return output.trim() === "true";
  }
  async topLevel() {
    return (await this.exec(["rev-parse", "--show-toplevel"])).trim();
  }
  async hasHead() {
    const output = await this.exec(["rev-parse", "--verify", "--quiet", "HEAD"], true);
    return output.trim() !== "";
  }
  async revParse(ref) {
    const output = await this.exec(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], true);
    const sha = output.trim();
    return sha === "" ? null : sha;
  }
  async mergeBase(a, b) {
    const output = await this.exec(["merge-base", a, b], true);
    const sha = output.trim();
    return sha === "" ? null : sha;
  }
  async remoteUrl(name) {
    const url = (await this.exec(["remote", "get-url", "--", name], true)).trim();
    return url === "" ? null : url;
  }
  async originHead() {
    const output = await this.exec(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], true);
    const ref = output.trim();
    if (ref === "") return null;
    return ref.replace(/^refs\/remotes\//, "");
  }
  async unmergedPaths() {
    const output = await this.exec(["ls-files", "--unmerged", "-z"], true);
    const paths = /* @__PURE__ */ new Set();
    for (const record of splitNul(output)) {
      const path = record.split("	").slice(1).join("	");
      if (path !== "") paths.add(path);
    }
    return [...paths];
  }
  async untrackedFiles() {
    const output = await this.exec(["ls-files", "--others", "--exclude-standard", "-z"]);
    return splitNul(output);
  }
  async rawDiff(args) {
    const output = await this.exec(["diff", "--no-ext-diff", "--no-textconv", "-M", "--raw", "-z", ...args]);
    return parseRawZ(output);
  }
  async patchDiff(args, contextLines) {
    return await this.exec([
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "-M",
      "--no-color",
      `--unified=${contextLines}`,
      ...args
    ]);
  }
  async showFile(revision, repositoryRelativePath) {
    const spec = `${revision}:${repositoryRelativePath}`;
    const kind = (await this.exec(["cat-file", "-t", spec], true)).trim();
    if (kind !== "blob") return null;
    return await this.exec(["show", spec]);
  }
  async listTree(revision, directoryName) {
    const spec = directoryName === "" ? `${revision}:` : `${revision}:${directoryName}`;
    const output = await this.exec(["ls-tree", "-z", spec], true);
    const names = [];
    for (const record of splitNul(output)) {
      const tab = record.indexOf("	");
      if (tab < 0) continue;
      const type = record.slice(0, tab).split(" ")[1];
      if (type !== "blob") continue;
      names.push(record.slice(tab + 1));
    }
    return names;
  }
  async listFiles(pathspec) {
    const output = await this.exec([
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...pathspec === null ? [] : [pathspec]
    ]);
    return [...new Set(splitNul(output))];
  }
  /**
   * Fixed-string (`-F`) because a term is not a regular expression the caller
   * wrote; `-I` because a binary hit is not evidence a person can read.
   */
  async grepFiles(term, pathspec) {
    const outcome = await this.execOutcome(
      [
        "grep",
        "--untracked",
        "-I",
        "-l",
        "-z",
        "-i",
        "-F",
        "-e",
        term,
        "--",
        ...pathspec === null ? [] : [pathspec]
      ],
      true
    );
    if (outcome.exitCode === 1) return [];
    if (outcome.exitCode !== 0) {
      throw new AmbicodeError("git-failed", `git grep failed with exit code ${String(outcome.exitCode)}.`);
    }
    return splitNul(outcome.stdout);
  }
  /**
   * Merges are excluded: under `--name-only` a merge lists no files, so commit
   * and per-file counts would disagree. A repository with no commits yet makes
   * git fail, which answers empty rather than raising.
   */
  async commitsTouching(paths, limit) {
    if (paths.length === 0 || limit <= 0) return [];
    const outcome = await this.execOutcome(
      ["log", "--no-merges", "--format=%H", "-n", String(limit), "--", ...paths],
      true
    );
    if (outcome.exitCode !== 0) return [];
    return outcome.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  }
  /**
   * Under `-z` the stream is `<sha> NUL LF <path> NUL ... <sha> NUL ...`; the
   * given `commits` tell a boundary record from a path, not a guess about names.
   */
  async commitFileLists(commits) {
    if (commits.length === 0) return [];
    const known = new Set(commits);
    const output = await this.exec(["log", "--no-walk", "-z", "--format=%H", "--name-only", ...commits, "--"]);
    const lists = [];
    let current = null;
    for (const record of output.split("\0")) {
      const entry = record.startsWith("\n") ? record.slice(1) : record;
      if (entry === "") continue;
      if (known.has(entry)) {
        current = { commit: entry, paths: [] };
        lists.push(current);
        continue;
      }
      current?.paths.push(entry);
    }
    return lists;
  }
  async version() {
    return (await this.exec(["--version"])).trim();
  }
};
function literalPathspec(repositoryRelativePath) {
  return `:(literal,top)${repositoryRelativePath}`;
}
function parseRemoteProject(url) {
  const trimmed = url.trim();
  let host;
  let pathname;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (parsed.protocol === "file:") return null;
    host = parsed.hostname;
    pathname = decodeURIComponent(parsed.pathname);
  } else {
    const match = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\\)(.+)$/.exec(trimmed);
    if (match === null || /^[a-z]$/i.test(match[1] ?? "")) return null;
    host = match[1] ?? "";
    pathname = match[2] ?? "";
  }
  const path = pathname.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  if (host === "" || path === "") return null;
  return { host: host.toLowerCase(), path };
}
function splitNul(output) {
  return output.split("\0").filter((entry) => entry !== "");
}
function parseRawZ(output) {
  const fields = output.split("\0");
  const changes = [];
  let index = 0;
  while (index < fields.length) {
    const header = fields[index];
    if (header === void 0 || header === "") {
      index += 1;
      continue;
    }
    if (!header.startsWith(":")) {
      throw new AmbicodeError("diff-unparsable", "git raw diff produced an unexpected record.");
    }
    const parts = header.slice(1).split(" ");
    const oldMode = parts[0] ?? "";
    const newMode = parts[1] ?? "";
    const status = parts[4] ?? "";
    const letter = status.charAt(0);
    const takesTwoPaths = letter === "R" || letter === "C";
    const first = fields[index + 1];
    if (first === void 0) {
      throw new AmbicodeError("diff-unparsable", "git raw diff ended before a path.");
    }
    const second = takesTwoPaths ? fields[index + 2] : void 0;
    if (takesTwoPaths && second === void 0) {
      throw new AmbicodeError("diff-unparsable", "git raw diff ended before a rename destination.");
    }
    index += takesTwoPaths ? 3 : 2;
    switch (letter) {
      case "A":
        changes.push({ oldPath: null, newPath: first, changeKind: "added", oldMode, newMode });
        break;
      case "D":
        changes.push({ oldPath: first, newPath: null, changeKind: "deleted", oldMode, newMode });
        break;
      case "R":
        changes.push({ oldPath: first, newPath: second ?? null, changeKind: "renamed", oldMode, newMode });
        break;
      case "C":
        changes.push({ oldPath: first, newPath: second ?? null, changeKind: "copied", oldMode, newMode });
        break;
      case "T":
        changes.push({ oldPath: first, newPath: first, changeKind: "type-changed", oldMode, newMode });
        break;
      default:
        changes.push({ oldPath: first, newPath: first, changeKind: "modified", oldMode, newMode });
    }
  }
  return changes;
}

export {
  Git,
  literalPathspec,
  parseRemoteProject,
  splitNul,
  parseRawZ
};
