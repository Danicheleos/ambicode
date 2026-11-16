import path from 'node:path';
import { onGatePrint } from '#harness/gates/gates';
import { iterationHeadings } from '#modules/evidence/task/iterations';
import { criticGaps } from '#modules/evidence/report/report';
import { chainKey, loadPayload } from '#harness/engine/execute';
import { PLAN_CRITIC_SENDS_BACK, PlanCriticClaim, PlanCriticOutput, type PlanCriticDefect } from '#types/modules/plan';
import { messageOf } from '#util/errors';
import { chainEntries } from '../common.ts';
import { candidates } from '../review/record-answer.ts';
import type { Handler } from '#types/harness';

/** Where the plan-critic subagent's Write puts its answer, in the task's steps folder; also spelled in routes/plan/critic-work.md and the guard's table in src/hook/guard/rules/reviewer.ts. */
const CRITIC_ANSWER = 'critic-answer.json';

function parseCritic(raw: string): { ok: true; defects: PlanCriticDefect[]; rows: unknown[] } | { ok: false; reason: string } {
  let reason = '';
  for (const text of candidates(raw)) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      reason ||= `the answer is not JSON: ${messageOf(error)}`;
      continue;
    }
    const parsed = PlanCriticOutput.safeParse(json);
    if (parsed.success) return { ok: true, defects: parsed.data.defects, rows: parsed.data.claims };
    reason ||= `the answer does not match the defects shape: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`;
  }
  return { ok: false, reason };
}

/**
 * The step after the plan critic: records what it wrote to its answer file. Defects, a missing or an invalid answer are Not verified lines and never
 * stop the route. A `wrong` claim row becomes a `claim-wrong` defect at the claim's `plan.md:L` (the line the plan-check list gave it); a `not-checked` row is a Not verified line.
 * Only an interactive first draft with a defect of a send-back kind goes back to draft, once; the file is removed so a second round never reads the first's answer.
 */
const critic: Handler = async (input) => {
  const file = path.join(input.dir.steps, CRITIC_ANSWER);
  const raw = await input.runtime.fs.readText(file).catch(() => null);
  await input.runtime.fs.remove(file);
  const read = raw?.trim() ? parseCritic(raw) : { ok: false as const, reason: `the critic wrote no ${CRITIC_ANSWER}` };
  const listed = (await loadPayload(input.runtime.fs, input.dir, chainKey(input.view.chainIds), 'script:plan-check')) ?? '';
  // One row per listed claim: the critic's first row for it, a malformed row as not checked, no row as not checked. A row naming no listed claim is only counted.
  const listedAt = new Map([...listed.matchAll(/^(\d+)\. (plan\.md:\d+) "/gm)].map((hit) => [Number(hit[1]), hit[2]!] as const));
  const answered = new Map<number, PlanCriticClaim>();
  const unknownNs: string[] = [];
  for (const row of read.ok ? read.rows : []) {
    const parsed = PlanCriticClaim.safeParse(row);
    const named = (row as { n?: unknown } | null)?.n;
    const n = parsed.success ? parsed.data.n : Number(named);
    if (!listedAt.has(n)) unknownNs.push(String(parsed.success ? n : named));
    else if (!answered.has(n)) answered.set(n, parsed.success ? parsed.data : { n, verdict: 'not-checked', evidence: `malformed row: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`).join('; ')}` });
  }
  const claims = read.ok ? [...listedAt].map(([n, where]): PlanCriticClaim & { where: string } =>({ ...(answered.get(n) ?? { n, verdict: 'not-checked', evidence: 'no row from the critic' }), where })) : [];
  const defects = read.ok ? [...read.defects, ...claims.filter((claim) => claim.verdict === 'wrong').map((claim): PlanCriticDefect => ({ kind: 'claim-wrong', where: claim.where, evidence: claim.evidence, fix: 'Correct the statement or back it with the search and its hits' }))] : [];
  await input.ledger.append({
    kind: 'worker', worker: 'plan-critic', outcome: read.ok ? 'ran' : 'skipped', ms: 0, artifact: null,
    ...(read.ok ? { summary: { defects, claims, unknownRows: unknownNs.length, unknownNs } } : { summary: { reason: read.reason } }),
  });
  if (!read.ok || input.args.headless === true) return { state: 'ok', payload: null };
  const sending = defects.filter((defect) => (PLAN_CRITIC_SENDS_BACK as readonly string[]).includes(defect.kind));
  const sentBefore = (await chainEntries(input)).some((entry) => entry.kind === 'revise' && entry['from'] === 'draft');
  if (sending.length === 0 || sentBefore) return { state: 'ok', payload: null };
  return {
    state: 'failed', code: 'plan-critic-defects', recoverable: true,
    message: `${defects.length} plan critic defects, ${sending.length} of a send-back kind`,
    revise: { args: { 'Critic defects': defects.map((defect) => `${defect.kind} ${defect.where}: ${defect.evidence} (fix: ${defect.fix})`) } },
  };
};

export const PLAN_HANDLERS: Readonly<Record<string, Handler>> = { 'plan.critic': critic };

/** The `## Iteration N:` headings, exact; the plan body never reaches the chat from here. */
const titlesOf = (plan: string): string[] => iterationHeadings(plan).map((heading) => `${heading.number}. ${heading.title}`);

/**
 * A failed check is recorded, never sent back: it prints here, before the question, and stays offered to Accept as
 * not verified. In a user-set headless run Revise is not offered, since nobody is there to ask for one; the gate records its default (Reject) without printing.
 * The details go to the chat before the question: the path alone on the first line, so the terminal makes it clickable.
 */
onGatePrint('plan-accept', async ({ runtime, dir, chain }) => {
  const checkStep = (status: string) => chain.findLast((entry) => entry.kind === 'step' && entry['step'] === 'plan-check' && entry['status'] === status);
  const missing = checkStep('completed')?.['failed'] === true ? checkStep('failed') : undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = missing === undefined ? null : `Plan check FAILED: ${String(missing['message'])}`;
  const titles = titlesOf(await runtime.fs.readText(dir.plan).catch(() => ''));
  const criticWorker = chain.findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-critic');
  const critics = criticGaps(criticWorker);
  const summary = criticWorker?.['summary'] as { defects?: unknown[]; claims?: { verdict: string }[] } | undefined;
  const defectCount = summary?.defects?.length ?? 0;
  const unchecked = (summary?.claims ?? []).filter((claim) => claim.verdict === 'not-checked').length;
  const counts = [...(defectCount > 0 ? [`${defectCount} critic defect${defectCount === 1 ? '' : 's'}`] : []), ...(unchecked > 0 ? [`${unchecked} claim${unchecked === 1 ? '' : 's'} not checked`] : [])];
  const details = [path.resolve(dir.plan), ...titles, ...(counts.length > 0 ? [`${counts.join(', ')}:`] : []), ...critics, ...(failed === null ? [] : [failed, 'Accepting lists them as not verified.'])].join('\n');
  if (headless) return { details, offered: ['Accept', 'Reject'] };
  return { details };
});
