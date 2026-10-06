// Policy packs: loading, validation, resolution, provenance, rule authoring and the per-stage projection.

// resolve-for.ts: a project's packs loaded and resolved for one activity.
/** resolvePolicyFor(options) — loads the policy packs for a project and returns its ResolvedPolicy. */
export { resolvePolicyFor } from './resolve-for.ts';

// authoring/: rule drafts and `rules` apply/revert.
/** blockingProblem(check, root, file) — the pack-level problem that keeps a draft from being applied, if any. */
export { blockingProblem } from './authoring/drafts.ts';
/** checkDrafts(runtime, workspace, {project, taskDir}) — validates the rule drafts and returns the check result. */
export { checkDrafts } from './authoring/drafts.ts';
/** applyRules(deps, {task, project}) — wires the checked drafts into the project as packs. */
export { applyRules } from './authoring/rules.ts';
/** discoverRules(runtime, args, options?) — finds candidate rules from the given sources. */
export { discoverRules } from './authoring/rules.ts';
/** revertRule(runtime, packId, project) — unwires a pack that `rules apply` wired and moves it back to the drafts. */
export { revertRule } from './authoring/rules.ts';

// packs/: loading, validating and resolving packs, and where their content came from.
/** loadPacksForProject(options) — loads exactly the packs the project enabled, never one just because its file exists. */
export { loadPacksForProject } from './packs/load.ts';
/** configProvenance(fs, workspace) — provenance entries for the config files, sorted by reference. */
export { configProvenance } from './packs/provenance.ts';
/** packProvenance(policies) — provenance entries for the resolved packs only. */
export { packProvenance } from './packs/provenance.ts';
/** policyProvenance(policies) — provenance entries for the resolved policies. */
export { policyProvenance } from './packs/provenance.ts';
/** applicablePrepareStages(activity) — the prompt stages `prepare` delivers for an activity. */
export { applicablePrepareStages } from './packs/resolve.ts';
/** decisionFor(policy, commandId) — the policy decision for a command; absence is never permission. */
export { decisionFor } from './packs/resolve.ts';
/** explainRefusal(policy, commandId) — the human-readable reason a command was refused. */
export { explainRefusal } from './packs/resolve.ts';
/** resolvePolicy(options) — merges the loaded packs into one resolved policy. */
export { resolvePolicy } from './packs/resolve.ts';
/** readSessionContract(fs, pluginRoot) — reads the built-in session contract prompt with its hash. */
export { readSessionContract } from './packs/shared-contract.ts';
/** readSharedOperatingContract(fs, …) — reads the shared operating contract prompt with its hash. */
export { readSharedOperatingContract } from './packs/shared-contract.ts';
/** readPackText(fs, filePath) — reads a pack file's text, or null when it cannot be read. */
export { readPackText } from './packs/validate.ts';
/** validatePack(…) — validates one pack's content and returns diagnostics. */
export { validatePack } from './packs/validate.ts';
/** validatePackSet(packs) — validates packs together (cross-pack conflicts) and returns diagnostics. */
export { validatePackSet } from './packs/validate.ts';

// root: the per-stage projection of the resolved policy.
/** policyStage({…}) — the prompts of one stage plus the rules the activity carries, projected from resolvePolicy. */
export { policyStage } from './stage.ts';
/** ruleCarriedFor(activity, category) — whether an activity carries rules of this category. */
export { ruleCarriedFor } from './stage.ts';
