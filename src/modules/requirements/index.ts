// Requirement capture from MCP reads and normalization of the captured sources into an envelope.

// capture/: recording what MCP read tools returned, and the templates asking for them.
/** observedTools(entries) — the distinct tool names that produced a task's captures. */
export { observedTools } from './capture/binding.ts';
/** entryPaths(dir, entry) — the files a `requirement` ledger entry points at. */
export { entryPaths } from './capture/capture-files.ts';
/** captureRequirement(input, deps) — records an MCP read result for the active route; unrecognized payloads write nothing. */
export { captureRequirement } from './capture/capture.ts';
/** hasRequirement(…) — whether the prompt carries a requirement (URL, `--requirement`, or bound bare key). */
export { hasRequirement } from './capture/has-requirement.ts';
/** classifySource(source) — classifies a source string as Jira key/URL, Confluence page or other address. */
export { classifySource } from './capture/template.ts';
/** requirementsTemplate({…}) — the message listing the calls that retrieve each asked source, capped at 1,536 bytes. */
export { requirementsTemplate } from './capture/template.ts';

// envelope/: normalizing captured sources into the route's requirement envelope.
/** splitAcs(sources) — splits source content into acceptance criteria with stable `AC-<key>-<nn>` ids. */
export { splitAcs } from './envelope/acs.ts';
/** raiseConflict({view, ledger, summary, sources}) — records a source conflict (two or more source ids) and raises the gate. */
export { raiseConflict } from './envelope/conflict.ts';
/** askedKeys(args) — the keys a route asked for: `--requirement` values, URLs in the text, a bare first-word key. */
export { askedKeys } from './envelope/envelope.ts';
/** envelopeSources(input, entry) — the full sources of an envelope entry, read from capture files or the route text. */
export { envelopeSources } from './envelope/envelope.ts';
/** normalizeEnvelope(input) — builds the envelope: captured sources, else request text, else a refusal or gate. */
export { normalizeEnvelope } from './envelope/envelope.ts';
/** routeEvidence(input, entry, mcpServer) — the envelope as review evidence, or null when it came from request text only. */
export { routeEvidence } from './envelope/envelope.ts';
/** canonicalUrl(value) — the canonical form of a source URL for comparison. */
export { canonicalUrl } from './envelope/normalize.ts';
/** loadRequirementEvidence(…) — loads requirement evidence for a review from the given inputs. */
export { loadRequirementEvidence } from './envelope/normalize.ts';
/** normalizeRequirements(options) — normalizes requirement evidence; every failure blocks the requirement-based review. */
export { normalizeRequirements } from './envelope/normalize.ts';
