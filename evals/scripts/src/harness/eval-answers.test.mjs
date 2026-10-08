import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ROOT } from '../shared/bench-paths.mjs';
import { answerFlags, EVAL_ANSWERS, evalCommand } from './eval-answers.mjs';
import { INVESTIGATE_COMMAND, PLAN_COMMAND, PRESET_TASK_COMMAND, REVIEW_COMMAND, TASK_COMMAND } from './prompt-transport.mjs';
import { ACCEPT_ANSWER } from './plan-run.mjs';

const routeGates = (skill) => {
  const route = parseYaml(readFileSync(path.join(ROOT, 'routes', skill, `${skill}.yaml`), 'utf8'));
  return new Map(route.steps.filter((step) => step.gate).map((step) => [step.id, step.gate]));
};

describe('eval-answers: the gate answers an eval types', () => {
  it('names only gates and options its route declares, for every shipped route', () => {
    const skills = readdirSync(path.join(ROOT, 'routes'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const skill of skills) {
      assert.ok(EVAL_ANSWERS[skill], `${skill} has no entry: an eval of it would answer by default without saying so`);
      const gates = routeGates(skill);
      for (const [gate, option] of EVAL_ANSWERS[skill]) {
        assert.ok(gates.has(gate), `${skill}: no gate ${gate}`);
        assert.ok(gates.get(gate).options.includes(option), `${skill}: ${gate} has no option ${option}`);
      }
    }
  });

  it('accepts what a route proposes, and declines the review offered after a task', () => {
    const gates = routeGates('task');
    assert.ok(!gates.get('review-offer').acting.includes('skip — verification incomplete'), 'skip is the non-acting option');
    for (const [skill, gate] of [['plan', 'plan-accept'], ['init', 'init-apply'], ['rules', 'rules-table'], ['review', 'estimate']]) {
      const option = EVAL_ANSWERS[skill].find(([g]) => g === gate)[1];
      assert.ok(routeGates(skill).get(gate).acting.includes(option), `${skill}: ${gate}=${option} acts`);
    }
  });

  it('builds the commands the cases type, quoting an option with spaces', () => {
    assert.equal(TASK_COMMAND, '/ambicode:task --headless --answer "draft-ok=implement anyway" --answer "review-offer=skip — verification incomplete"');
    assert.equal(PRESET_TASK_COMMAND, TASK_COMMAND);
    assert.equal(INVESTIGATE_COMMAND, '/ambicode:investigate --headless');
    assert.equal(REVIEW_COMMAND, '/ambicode:review --headless --answer estimate=run');
    assert.equal(PLAN_COMMAND, '/ambicode:plan --headless --answer plan-accept=Accept');
    assert.equal(ACCEPT_ANSWER, '--answer plan-accept=Accept');
    assert.equal(evalCommand('rules'), '/ambicode:rules --headless --answer "sources=use these sources" --answer "rules-table=Apply all"');
    assert.throws(() => answerFlags('nope'), /no eval answers for skill nope/);
  });
});
