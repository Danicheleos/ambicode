#!/usr/bin/env node
// Stand-in for `claude -p` in supervisor tests: plays one scripted step per invocation.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const plan = JSON.parse(readFileSync(process.env.GYM_STUB_PLAN, 'utf8'));
const counter = process.env.GYM_STUB_PLAN + '.n';
const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
writeFileSync(counter, String(n + 1));
appendFileSync(process.env.GYM_STUB_PLAN + '.argv', JSON.stringify(process.argv.slice(2)) + '\n');
const step = plan[n] ?? { status: 'done' };
const campaign = process.env.GYM_CAMPAIGN_DIR;
const state = path.join(campaign, 'supervisor');
mkdirSync(state, { recursive: true });
const argv = process.argv.slice(2);
const sessionId = argv[argv.indexOf('--resume') + 1] && argv.includes('--resume') ? argv[argv.indexOf('--resume') + 1] : argv[argv.indexOf('--session-id') + 1];
if (step.phase) writeFileSync(path.join(campaign, 'PHASE'), `it-001 ${step.phase}\n`);
if (step.tokens !== undefined) writeFileSync(path.join(state, 'context.json'), JSON.stringify({ tokens: step.tokens }));
if (step.progress) appendFileSync(path.join(campaign, 'STATE.md'), `| it-${n} | row |\n`);
if (step.dirty) writeFileSync(path.join(process.env.GYM_REPO_ROOT, 'src-change.txt'), 'uncommitted plugin edit\n');
if (step.status) writeFileSync(path.join(campaign, 'CAMPAIGN.md'), `status: ${step.status}\n`);
if (step.kill) writeFileSync(path.join(state, 'KILL'), JSON.stringify({ at: 'now', event: 'PreToolUse', rule: step.kill, reason: 'test', sessionId, agentId: null, tool: 'Bash', input: 'x' }));
if (step.sleepMs) await new Promise((r) => setTimeout(r, step.sleepMs));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId }) + '\n');
if (!step.noResult) process.stdout.write(JSON.stringify({ type: 'result', subtype: step.isError ? 'error' : 'success', is_error: step.isError === true, total_cost_usd: step.cost ?? 0.01, result: step.resultText ?? '' }) + '\n');
process.exit(step.exitCode ?? 0);
