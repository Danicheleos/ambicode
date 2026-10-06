// Dependency-free helpers: errors, globs, hashing, path normalization, JSON output and plugin-root lookup.

// errors.ts: the error type every user-facing failure uses.
export { AmbicodeError } from './errors.ts';
/** isAmbicodeError(value) — type guard for AmbicodeError. */
export { isAmbicodeError } from './errors.ts';
/** messageOf(error) — an Error's message, or the thrown value as a string. */
export { messageOf } from './errors.ts';

// guards.ts: structural type guards.
/** isObject(value) — true for a plain non-null, non-array object, narrowed to a string-keyed record. */
export { isObject } from './guards.ts';

// files.ts: timestamped artifact names that never overwrite.
export { UNIQUE_FILE_LIMIT } from './files.ts';
/** localTimestamp(now) — local-time `YYYY-MM-DDTHH-MM` stamp usable in a path segment. */
export { localTimestamp } from './files.ts';
/** writeUniqueFile(fs, base, extension, text) — creates base+extension, then base-2…, exclusively; null once UNIQUE_FILE_LIMIT names are taken. */
export { writeUniqueFile } from './files.ts';
/** uniqueFileExhausted(what) — the error to throw when writeUniqueFile returns null. */
export { uniqueFileExhausted } from './files.ts';

// path-classes.ts: path classes shared by review, search and policy (excluded, test, credential-like, binary extension).
/** describeExclusion(reason) — the sentence explaining an exclusion reason. */
export { describeExclusion } from './path-classes.ts';
/** isExcludedFromReview(oldPath, newPath, operator?) — the exclusion reason for a changed file under either name, or null. */
export { isExcludedFromReview } from './path-classes.ts';
/** isUselessAsContext(relativePath) — whether a file name is a generated or lock file that adds nothing as review context. */
export { isUselessAsContext } from './path-classes.ts';
/** isTestPath(relativePath) — whether a path matches the test-file conventions. */
export { isTestPath } from './path-classes.ts';
/** pathExclusionReason(…) — why a path is excluded from the snapshot, or null. */
export { pathExclusionReason } from './path-classes.ts';

// glob.ts: POSIX-style glob matching on repository-relative paths.
/** matchesAnyGlob(relativePath, globs) — true when the path matches at least one glob. */
export { matchesAnyGlob } from './glob.ts';
/** matchesGlob(relativePath, glob) — path.matchesGlob on POSIX-normalized inputs; hidden directories need explicit globs. */
export { matchesGlob } from './glob.ts';
/** toPosix(value) — replaces the platform path separator with `/`. */
export { toPosix } from './glob.ts';

// hash.ts: content hashing.
/** contentHash(value) — `sha256:` plus the first 32 hex characters of the SHA-256 of a string or bytes. */
export { contentHash } from './hash.ts';
/** hash12(hash) — the first 12 hex digits of a `contentHash`, for messages. */
export { hash12 } from './hash.ts';

// json-output.ts: CLI JSON rendering.
/** formatJsonOutput(value, format?) — JSON text with a trailing newline, pretty (default) or compact. */
export { formatJsonOutput } from './json-output.ts';

// paths.ts: repository- and project-relative path handling.
/** mostSpecificRoot(projects, relativeFilePath) — the project whose root is the longest prefix of the path, or null. */
export { mostSpecificRoot } from './paths.ts';
/** normalizeRelative(value) — a repository-relative POSIX path with no `.`/`..` segments, no leading or trailing slash. */
export { normalizeRelative } from './paths.ts';
/** resolveInsideBoundary(fs, boundary, declaredPath) — resolves a declared path and checks it stays inside boundary after symlinks. */
export { resolveInsideBoundary } from './paths.ts';
/** toProjectRelative(projectRoot, repositoryRelativePath) — the path relative to the project root, or null when outside it. */
export { toProjectRelative } from './paths.ts';

// plugin-root.ts: where the shipped plugin files live, from `src/` or from `scripts/`.
/** builtinPoliciesDirectory(pluginRoot) — the directory of the shipped policy packs. */
export { builtinPoliciesDirectory } from './plugin-root.ts';
/** pageTemplatesDirectory(pluginRoot) — the directory of the review page's templates and stylesheet. */
export { pageTemplatesDirectory } from './plugin-root.ts';
/** promptsDirectory(pluginRoot) — the directory of the shipped prompts. */
export { promptsDirectory } from './plugin-root.ts';
/** resolvePluginRoot(fs, env) — finds the plugin root from the environment or the running file's location. */
export { resolvePluginRoot } from './plugin-root.ts';

// text.ts: word splitting.
/** tokenize(text) — splits text on whitespace into words; quotes group and a backslash escapes the next character. */
export { tokenize } from './text.ts';
