// $0 checks of the plan cases: every file a sample names resolves in the fixture (line numbers too), each pattern accepts its
// sample and a clean plan, each `mustNot` pattern catches its bad sample, and the rendered graders carry the specs' patterns.
// No model runs here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { fixtureByName } from '../../fixtures/definitions.mjs';
import { materialize } from '../../fixtures/materialize.mjs';
import { CASES, caseDir, render } from './cases.mjs';
import { PLAN_SPECS, goodPlan, outsidePolicies, planBodyWrite } from './plan-cases.mjs';
import { finalFiles } from './review-cases.mjs';
import { APP_PLAN } from '../../fixtures/app-medium.mjs';

const FILES = render();
const planCases = CASES.filter((c) => c.name.startsWith('plan-') && !c.tags.includes('rules'));
const frontmatter = (text) => parse(text.split('---')[1]);
const graderOf = (name, grader) => frontmatter(FILES.get(`${caseDir('cases', name)}/graders/${grader}.md`));
const ANCHOR = /([\w.-]+(?:\/[\w.-]+)+\.[A-Za-z]{1,4})(?::(\d+))?/g;

const repos = new Map();
before(async () => {
  for (const fixture of new Set(PLAN_SPECS.map((spec) => spec.fixture))) {
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-cases-'));
    await materialize(fixtureByName(fixture), dir);
    const tracked = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean);
    repos.set(fixture, { dir, tracked });
  }
});

/** The tracked files `name` can mean: the path itself or a path ending in it (a sample may leave out the leading folders). */
const resolve = (repo, name) => repo.tracked.filter((file) => file === name || file.endsWith(`/${name}`));
const lineCount = (repo, file) => readFileSync(path.join(repo.dir, file), 'utf8').split('\n').length - 1;

describe('plan cases', () => {
  it('are fifteen: at most two per stack fixture, five on ts-app-medium-plan, small and huge ones among the stacks', () => {
    assert.equal(planCases.length, 15);
    const stacks = PLAN_SPECS.filter((spec) => spec.size !== 'narrow');
    assert.equal(stacks.length, 10);
    for (const fixture of new Set(stacks.map((spec) => spec.fixture))) assert.equal(stacks.filter((spec) => spec.fixture === fixture).length, 2, fixture);
    assert.equal(stacks.filter((spec) => spec.size === 'small').length, 5);
    assert.equal(stacks.filter((spec) => spec.size === 'huge').length, 5);
    assert.deepEqual([...new Set(PLAN_SPECS.filter((spec) => spec.size === 'narrow').map((spec) => spec.fixture))], ['ts-app-medium-plan']);
    assert.equal(PLAN_SPECS.filter((spec) => spec.size === 'narrow').length, 5);
    for (const spec of PLAN_SPECS.filter((s) => s.size === 'huge')) assert.ok(spec.limits.max_turns > 30, `${spec.name} gets more turns than the suite default`);
  });

  it('only the draft case leaves the gate unanswered, and only it has no bare arm', () => {
    for (const c of planCases) {
      const draft = c.name === 'plan-app-draft';
      assert.equal(c.prompt.includes('--answer plan-accept=Accept'), !draft, c.name);
      assert.equal(c.bare === null, draft, c.name);
    }
  });

  for (const spec of PLAN_SPECS) {
    describe(spec.name, () => {
      it('names only files that exist in the fixture, at lines that exist', () => {
        const repo = repos.get(spec.fixture);
        const samples = [...spec.must.map(([, , sample]) => sample), ...spec.mustNot.flatMap(([, , bad, ok]) => [bad, ok ?? ''])];
        let checked = 0;
        for (const sample of samples) {
          const placeholder = /new:|absent|regenerate/.test(sample);
          for (const [, name, line] of sample.matchAll(ANCHOR)) {
            if (name.startsWith('.')) continue; // a relative import in a sample is code, not a repository path
            const found = resolve(repo, name);
            if (found.length === 0) {
              assert.ok(placeholder, `${spec.name}: ${name} is not in ${spec.fixture} (${sample})`);
              continue;
            }
            checked += 1;
            if (line !== undefined) assert.ok(Number(line) <= lineCount(repo, found[0]), `${name}:${line} is past the end of ${found[0]}`);
          }
        }
        assert.ok(checked >= spec.must.length - 3, `${spec.name}: samples cite real files`);
      });

      it('each pattern accepts its sample and a clean plan; each mustNot pattern catches its bad sample and spares its ok one', () => {
        const plan = goodPlan(spec);
        const names = [...spec.must, ...spec.mustNot].map(([name]) => name);
        assert.equal(new Set(names).size, names.length, 'check names are unique');
        for (const name of Object.keys(spec.weights ?? {})) assert.ok(names.includes(name), `weight for an unknown check ${name}`);
        for (const [name, pattern, sample] of spec.must) {
          assert.match(sample, new RegExp(pattern), name);
          assert.doesNotMatch('', new RegExp(pattern), `${name} passes an empty plan`);
          assert.match(plan, new RegExp(pattern), name);
        }
        for (const [name, pattern, bad, ok] of spec.mustNot) {
          assert.match(bad, new RegExp(pattern), `${name} misses its bad sample`);
          if (ok !== undefined) assert.doesNotMatch(ok, new RegExp(pattern), `${name} flags its ok sample`);
          assert.doesNotMatch(plan, new RegExp(pattern), `${name} flags a clean plan`);
        }
      });

      it('renders each check as a regex grader on the plan file, and in both arms as a shared one on the final message', () => {
        const c = planCases.find((entry) => entry.name === spec.name);
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        assert.equal(slug, spec.slug);
        if (spec.draft) {
          // Each check reads the Write of the task's plan.md.
          for (const [name, pattern] of spec.must) assert.equal(frontmatter(c.graders.find((g) => g.name === name).text).input_match, planBodyWrite(pattern), name);
          for (const [name, pattern] of spec.mustNot) {
            const own = frontmatter(c.graders.find((g) => g.name === name).text);
            assert.deepEqual([own.input_match, own.max], [planBodyWrite(pattern), 0], name);
          }
          return;
        }
        for (const [name, pattern] of [...spec.must, ...spec.mustNot]) {
          const own = graderOf(spec.name, name);
          assert.equal(own.type, 'regex');
          assert.equal(own.pattern, outsidePolicies(pattern));
          assert.ok(own.target.path.endsWith(`/tasks/${slug}/plan.md`), name);
          if (c.bare === null) continue;
          const bare = frontmatter(FILES.get(`${caseDir('bare', spec.name)}/graders/${name}.md`));
          assert.equal(bare.pattern, pattern);
          assert.equal(bare.target, 'last_message');
        }
      });
    });
  }

  it('an accepted plan is graded on the route finishing, anchors that resolve and the plan file; the draft on the gate and no promotion', () => {
    for (const c of planCases) {
      const names = c.graders.map((g) => g.name);
      assert.ok(names.includes('anchors-valid') && !names.includes('coverage-coded'), c.name);
      if (c.name === 'plan-app-draft') {
        assert.ok(names.includes('accept-gate-printed') && names.includes('not-promoted') && !names.includes('route-done'));
        assert.ok(names.includes('plan-file-written') && names.includes('status-draft'));
        const lastMessage = c.graders.filter((g) => g.name === 'draft-stated' || g.name === 'not-called-accepted');
        assert.equal(lastMessage.length, 2);
        assert.ok(lastMessage.every((g) => g.text.includes('target: last_message')));
      } else assert.ok(names.includes('route-done') && names.includes('plan-written') && names.includes('three-fields') && !names.includes('five-fields'), c.name);
    }
  });

  it('the anchor and boundary graders accept a clean run and refuse a bad one', () => {
    const c = planCases[0];
    const anchors = new RegExp(frontmatter(c.graders.find((g) => g.name === 'anchors-valid').text).pattern);
    const entry = (summary) => `{"id":"w1","kind":"worker","worker":"plan-check","outcome":"ran","summary":${summary}}`;
    assert.match(entry('{"failed":false,"anchorsBad":0}'), anchors);
    assert.doesNotMatch(entry('{"failed":true,"anchorsBad":2,"anchors":["x.ts:9 missing-file"]}'), anchors);
    // A failed first check followed by a clean one after the fix round is one clean run.
    assert.match(`${entry('{"failed":true,"anchorsBad":1}')}\n${entry('{"failed":false,"anchorsBad":0}')}`, anchors);
    const edit = new RegExp(frontmatter(c.graders.find((g) => g.name === 'no-edit').text).input_match);
    assert.doesNotMatch(JSON.stringify({ file_path: '/w/repo/.ambicode/tasks/plan-app-csv/plan.md', old_string: 'a', new_string: 'b' }), edit);
    assert.match(JSON.stringify({ file_path: '/w/repo/src/invoices/service.js', old_string: 'a', new_string: 'b' }), edit);
    const checks = new RegExp(frontmatter(c.graders.find((g) => g.name === 'no-checks-run').text).input_match);
    for (const command of ['npm test', 'cd repo && npx jest', 'uv run pytest', 'go test ./...', './gradlew test', 'cargo clippy --all-targets']) assert.match(JSON.stringify({ command }), checks, command);
    for (const command of ['git ls-files', 'node "/x/scripts/ambicode.mjs" route next', 'grep -rn test src']) assert.doesNotMatch(JSON.stringify({ command }), checks, command);
    const write = new RegExp(frontmatter(c.graders.find((g) => g.name === 'no-write-source').text).input_match);
    assert.match(JSON.stringify({ file_path: '/w/repo/src/contexts/lending/domain/fees/late.ts' }), write);
    assert.match(JSON.stringify({ file_path: '/w/repo/internal/httpapi/parcels.go' }), write);
    assert.doesNotMatch(JSON.stringify({ file_path: '/w/repo/.ambicode/tasks/plan-ts-grace/plan.md' }), write);
  });

  it('the iteration grader counts Goal headings', () => {
    const c = planCases.find((entry) => entry.name === 'plan-ts-reserve');
    const iterations = new RegExp(frontmatter(c.graders.find((g) => g.name === '3-iterations').text).pattern);
    assert.match('Goal a\nGoal b\nGoal c', iterations);
    assert.doesNotMatch('Goal a\nGoal b', iterations);
  });

  it('a draft check reads the Write of plan.md, line by line in its JSON, and no other Write', () => {
    const spec = PLAN_SPECS.find((entry) => entry.draft);
    const write = (content, file = '/w/repo/.ambicode/tasks/plan-app-draft/plan.md') => JSON.stringify({ file_path: file, content });
    const good = write(goodPlan(spec));
    for (const [name, pattern] of spec.must) assert.match(good, new RegExp(planBodyWrite(pattern)), name);
    for (const [name, pattern, bad, ok] of spec.mustNot) {
      assert.doesNotMatch(good, new RegExp(planBodyWrite(pattern)), name);
      assert.match(write(`${goodPlan(spec)}\n${bad}\nGoal: more`), new RegExp(planBodyWrite(pattern)), `${name} misses its bad line`);
      assert.doesNotMatch(write(`${goodPlan(spec)}\n${ok}\nGoal: more`), new RegExp(planBodyWrite(pattern)), `${name} flags its ok line`);
    }
    assert.doesNotMatch(write(goodPlan(spec), '/w/repo/notes.md'), new RegExp(planBodyWrite(spec.must[0][1])));
  });

  it('a path check takes a bare answer that drops the leading src/', () => {
    const reuse = PLAN_SPECS.find((spec) => spec.name === 'plan-app-reuse');
    const page = reuse.must.find(([name]) => name === 'page-shows-due-date')[1];
    assert.match('- `invoices/routes.js`: the page lists dueDate', new RegExp(page));
  });

  // 2026-10-26, twelve plans (plugin 20-34-49, 20-35-40, 21-02-10, 21-03-00; bare 16-41-43, 16-43-03): all derived the due date, none stored
  // it, and the old due-date-stored grader failed them for it. Each line below is the line of that plan that states where the day comes from.
  it('due-date-decided takes a stored day and a derived one, and refuses a plan that never says where the day comes from', () => {
    const must = (case_, name) => new RegExp(PLAN_SPECS.find((spec) => spec.name === case_).must.find(([n]) => n === name)[1]);
    const decided = [must('plan-app-remind', 'due-date-decided'), must('plan-app-vague', 'due-date-decided')];
    const plans = [
      '- Nothing stores a due date. `invoices/terms.dueDateFor(issuedAt, customer.paymentTermsDays)` computes it.',
      '1. **"Overdue"** means the business day is later than `dueDateFor(issuedAt, customer.paymentTermsDays) + config.overdueGraceDays`. Due dates are not stored',
      '- **Due dates are not stored.** They are derived by `invoices/terms.dueDateFor(issuedAt, customer.paymentTermsDays)` and only used for the invoice-created mail.',
      "- **No stored due date.** `invoices/terms.js` computes issue day + the customer's `paymentTermsDays` (default 30), but only for the invoice mail. Invoices don't store it.",
      '- `src/invoices/terms.js` reuse `dueDateFor`; no new date helper (`shared/dates.addDays` exists).',
      '- `src/invoices/reminders.js` (new): `sendOverdueReminders()`. For each invoice with status `OPEN`, the day is `dueDateFor(issuedAt, customer.paymentTermsDays)`',
      '`addDays(dueDateFor(issuedAt, customer.paymentTermsDays), config.overdueGraceDays)`. Add',
      '(`src/config.js:9`), `dueDateFor` (`src/invoices/terms.js:6`) and `clock.businessDay()` (`src/shared/clock.js:9`).',
      '- due day = `dueDateFor(issuedAt, customer.paymentTermsDays)` (`src/invoices/terms.js:6`, customer from `customers.get`)',
      '- Due day is `dueDateFor(issuedAt, customer.paymentTermsDays)` (`terms.js:6`).',
      "- `src/invoices/service.js:64-66`: add `isOverdue(invoice)`, built on `dueDateFor` (`src/invoices/terms.js:6`) with the customer's `paymentTermsDays`",
      '- "Late payer" = a customer with an invoice past its due date plus the grace. The code has `dueDateFor` (`src/invoices/terms.js:6`)',
      // the old design still passes
      'Store the due date on the invoice when it is created',
      '- `src/invoices/model.js`: add `dueDate`, set at create from the terms',
      'the dueDate is persisted at create',
    ];
    for (const line of plans) for (const re of decided) assert.match(line, re, line);
    for (const line of [
      '# Plan\n\n## Iteration 1\n- `src/reports/service.js:45`: add a late bucket\n- tests build cases with `tests/factory.js`\n',
      '## Iteration 1\n- `src/reminders/job.js`: select invoices where `invoice.dueDate` is before today and send the mail\n- tests use `makeInvoice`\n',
      '- `src/invoices/model.js:3-5`: add `remindedOn = null` to the invoice record.',
    ]) for (const re of decided) assert.doesNotMatch(line, re, line);
  });

  it('no-due-date-noticed takes an absence, a "derived, not stored" and a computation from issuedAt, and refuses a plan that uses invoice.dueDate unremarked', () => {
    const noticed = new RegExp(PLAN_SPECS.find((spec) => spec.name === 'plan-app-vague').must.find(([n]) => n === 'no-due-date-noticed')[1]);
    for (const line of [
      '- **Due dates are not stored.** They are derived by `invoices/terms.dueDateFor(issuedAt, customer.paymentTermsDays)` and only used for the invoice-created mail.',
      "- **No stored due date.** `invoices/terms.js` computes issue day + the customer's `paymentTermsDays` (default 30), but only for the invoice mail. Invoices don't store it.",
      '`addDays(dueDateFor(issuedAt, customer.paymentTermsDays), config.overdueGraceDays)`. Add',
      'Overdue means `businessDay > dueDateFor(issuedAt, customer.paymentTermsDays) + overdueGraceDays`.',
      '- Invoices carry no due date today.',
    ]) assert.match(line, noticed, line);
    for (const line of [
      // 2026-10-26 21-03-00 vague-1: builds on dueDateFor and never says the invoice has no due date: a miss, kept
      "- `src/invoices/service.js:64-66`: add `isOverdue(invoice)`, built on `dueDateFor` (`src/invoices/terms.js:6`) with the customer's `paymentTermsDays`",
      '## Iteration 1\n- `src/reminders/job.js`: select invoices where `invoice.dueDate` is before today and send the mail\n',
      '- `src/reports/service.js:45`: add a late bucket; tests use `tests/factory.js`',
    ]) assert.doesNotMatch(line, noticed, line);
  });

  // The v2 run (2026-10-23): every plan found each named mechanism; these checks need two facts joined, and the v2 lines
  // that missed them must stay misses.
  it('the joined-fact checks take the designs that join the facts and refuse the v2 lines that did not', () => {
    const must = (case_, name) => new RegExp(PLAN_SPECS.find((spec) => spec.name === case_).must.find(([n]) => n === name)[1]);
    const live = must('plan-app-csv', 'served-live');
    for (const line of ['GET /invoices.csv', '`GET /invoices/export.csv`', 'GET /invoices?format=csv']) assert.match(line, live, line);
    assert.doesNotMatch('- `GET /reports/invoices.csv`: thin handler', live);
    const total = must('plan-app-csv', 'page-total-used');
    assert.match('- each total comes from `view` in invoices/routes.js', total);
    assert.match('- a void invoice prints a total of 0, as on its page', total);
    assert.doesNotMatch('- Assumption: void invoices are included, with their total, because the invoice page still shows a total for them.', total);
    // v3 run (2026-10-23): one false pass and three false fails, each pinned to its plan line.
    const mustNot = (case_, name) => new RegExp(PLAN_SPECS.find((spec) => spec.name === case_).mustNot.find(([n]) => n === name)[1]);
    assert.match('- `src/shared/validation/date.js` and `index.js`: add `validateDateNotBefore(value, notBefore, field)`. It calls `validateDate`.', mustNot('plan-app-reuse', 'no-parallel-validator'));
    assert.doesNotMatch('  - Compute `dueDate` as `validateRange(validateDate(input.dueDate), { min: issuedAt })`, reusing `validateRange` (src/shared/validation/range.js:4).', mustNot('plan-app-reuse', 'no-parallel-validator'));
    assert.match('- `src/invoices/service.js:59-62`: add `displayTotal(invoice)`, otherwise `total(invoice)`.', must('plan-app-csv', 'summary-model-reused'));
    assert.doesNotMatch('- For every invoice, the CSV total equals `routes.get(...).body.totalCents / 100` as a decimal. A void invoice shows `0.00`.', mustNot('plan-app-csv', 'policy-no-float-money'));
    assert.match('- **Overdue isn\'t modelled.** The due date is computed in `invoices/terms.js` and printed on the invoice mail, but it isn\'t stored.', must('plan-app-vague', 'no-due-date-noticed'));
    // p18 run (2026-10-23, 70c4eebb): files cited as the pattern to mirror or as a fact are not planned changes; the generated client stays caught.
    assert.doesNotMatch('Mirror the existing cross-context pattern (`CatalogApi`, `src/contexts/catalog/index.ts:8-10`, consumed in `src/contexts/lending/application/deps.ts:3,16`): members exposes a small `MembersApi` port from its `index.ts`', mustNot('plan-ts-grace', 'no-unrelated-contexts'));
    assert.doesNotMatch('- `src/contexts/lending/application/return.ts:13` - get `const grace` and call `lateFee`. The event payload is unchanged (`feeCents`), so billing (`src/contexts/billing/application/on-loan-returned.ts:7-8`) needs no change.', mustNot('plan-ts-grace', 'no-unrelated-contexts'));
    assert.doesNotMatch('- `src/contexts/reservations/application/on-loan-returned.ts`: handler that promotes the first reservation with `holdUntil = addDays(now, HOLD_DAYS)` (`src/shared-kernel/events/event.ts:4`). Style follows `src/contexts/billing/application/on-loan-returned.ts:6-9`.', mustNot('plan-ts-reserve', 'billing-untouched'));
    assert.doesNotMatch('- `dashboard/src/views/firing.ts:7`: replace `String(s.targetDc)` and so `Firing.targetDc` (`dashboard/src/lib/engine/types.ts:3`) and the generated client stay in tenths.', mustNot('plan-mono-degrees', 'no-other-projects'));
    assert.doesNotMatch('- `settings_from_env` is the single place that reads the environment (`src/tidewatch/cli/main.py:10` is its only caller).', mustNot('plan-py-maxage', 'no-unrelated-layers'));
    assert.match('- `dashboard/src/__generated__/engine-api.ts:1` says it is generated from `engine/openapi.yaml`, which is not in the repository. It is not edited by hand (CONTRIBUTING.md).', mustNot('plan-mono-calibrate', 'generated-and-vendored-untouched'));
    // p18 mono-calibrate: the same bullet under a findings heading is a fact; under an Iteration heading it is planned work.
    const calib = mustNot('plan-mono-calibrate', 'generated-and-vendored-untouched');
    const generated = '- `dashboard/src/__generated__/engine-api.ts:1` says it is generated from `engine/openapi.yaml`, which is not in the repository. It is not edited by hand (CONTRIBUTING.md).';
    assert.doesNotMatch(`## Iteration 1: x\n\n- \`dashboard/src/a.ts:1\` add a line.\n\n## What the code lacks or already settles\n\n${generated}\n\n## Assumptions\n`, calib);
    assert.match(`## What the code lacks or already settles\n\n- fact.\n\n## Iteration 2: y\n\n${generated}\n`, calib);
    assert.match(`## Iteration 1: x\n\n${generated}\n`, calib);
    // 2026-10-26 baseline: a verb earlier on the line, or "does not change", is not a planned change of the cited file.
    assert.doesNotMatch('- `src/contexts/members/index.ts:6` — add and export `interface MembersApi { lateGraceDays(memberId: string): Promise<number> }` (same shape/placement as `CatalogApi` at `src/contexts/catalog/index.ts:8`).', mustNot('plan-ts-grace', 'no-unrelated-contexts'));
    assert.doesNotMatch('- `src/contexts/lending/application/return.ts:14`: add `itemId: loan.itemId` to the `lending.loan-returned` payload. The additions are additive; `src/contexts/billing/application/on-loan-returned.ts:7-8` ignores them.', mustNot('plan-ts-reserve', 'billing-untouched'));
    assert.doesNotMatch('- `bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt:37` builds `StockReportService(lots)`; the constructor does not change.', mustNot('plan-jvm-bands', 'no-wiring-change'));
    assert.match('- `src/contexts/billing/application/issue-invoice.ts:1` add a field to the invoice.', mustNot('plan-ts-reserve', 'billing-untouched'));
    assert.match('- `src/contexts/catalog/index.ts:8`: add `lateGraceDays` to `CatalogApi`.', mustNot('plan-ts-grace', 'no-unrelated-contexts'));
    assert.match('- `bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt:37` passes the new bands to `StockReportService`.', mustNot('plan-jvm-bands', 'no-wiring-change'));
    const day = must('plan-app-remind', 'business-day');
    assert.doesNotMatch('3. **At most once a day** means one per invoice per UTC calendar day (`clock.today()`).', day);
  });

  it('the app cases have no llm judge; the boundary check catches the bare remind shape and spares the allowed designs', () => {
    for (const c of planCases.filter((entry) => entry.name.startsWith('plan-app-'))) assert.ok(c.graders.every((g) => !g.text.includes('type: llm')), c.name);
    const remind = PLAN_SPECS.find((spec) => spec.name === 'plan-app-remind');
    const boundary = new RegExp(remind.mustNot.find(([name]) => name === 'policy-feature-boundary')[1]);
    assert.match('  - It needs both invoices and notifications, so I would put it in the notifications feature and call `invoices/service`, as `handlers.js` already calls `customers/service`.', boundary);
    assert.match('- `src/notifications/reminders.js`: require invoices/repository and filter the overdue ones', boundary);
    for (const ok of [
      '- `src/invoices/reminders.js`: select overdue invoices with invoices.list() and emit invoice.overdue on src/shared/events/bus.js',
      '- `src/notifications/handlers.js`: onInvoiceOverdue renders the template from the event payload',
      '- `src/notifications/service.js`: sendOverdueReminder is called from src/invoices/service.js with the amounts',
      '- `src/notifications/reminders.js` must not require invoices/service (tests/architecture.test.js)',
    ]) assert.doesNotMatch(ok, boundary, ok);
  });

  it('the once-a-day check takes a stored last-reminder day as well as the notification record', () => {
    const remind = PLAN_SPECS.find((spec) => spec.name === 'plan-app-remind');
    const once = new RegExp(remind.must.find(([name]) => name === 'once-a-day-record')[1]);
    for (const design of ['I store `lastReminderOn` (a day string) on the invoice', 'add `lastRemindedOn`', 'forCustomer (src/notifications/repository.js:7) shows one went out today']) assert.match(design, once, design);
  });
});

describe('the plan app variant', () => {
  const base = finalFiles('ts-app-medium');
  const variant = finalFiles('ts-app-medium-plan');

  it('adds to the base fixture and changes only the files APP_PLAN overrides, so the other app cases on the base hold', () => {
    const changed = [...variant.keys()].filter((file) => base.get(file) !== variant.get(file)).sort();
    assert.deepEqual(changed, Object.keys(APP_PLAN).sort());
    for (const file of base.keys()) assert.ok(variant.has(file), file);
  });

  it('holds each trap the hard checks name: a pay-by day nobody stores, the grace, the whitelist, the helpers, the bare refund event', () => {
    assert.match(variant.get('src/config.js'), /overdueGraceDays: 5/);
    assert.doesNotMatch(variant.get('src/invoices/model.js'), /dueDate/);
    assert.match(variant.get('src/invoices/service.js'), /dueDateFor\(invoice\.issuedAt, customer\.paymentTermsDays\)/);
    assert.match(variant.get('src/customers/patch.js'), /receipts: \(value\) => validateBoolean/);
    assert.match(variant.get('src/reports/routes.js'), /attachment\(service\.revenueCsv\(\)/);
    assert.match(variant.get('src/reports/csv.js'), /money\.toDecimal/);
    assert.doesNotMatch(variant.get('src/payments/service.js'), /PAYMENT_REFUNDED[^\n]*customerId/);
    assert.match(variant.get('src/customers/patch.js'), /paymentTermsDays: \(value\) => validateRange/);
    assert.match(variant.get('src/shared/clock.js'), /const businessDay = /);
    assert.match(variant.get('docs/architecture.md'), /caches GET responses under `\/reports`/);    assert.match(variant.get('src/invoices/routes.js'), /totalCents: invoice\.status === STATUS\.VOID \? 0 :/);
    assert.match(variant.get('src/invoices/routes.js'), /ok\(view\(service\.get\(/);
    for (const file of variant.keys()) if (file.startsWith('src/notifications/')) assert.doesNotMatch(variant.get(file), /require\('\.\.\/(invoices|payments|reports)/, file);
  });
});

describe('plan cases on a fixture that ships stack packs', () => {
  const stacked = planCases.filter((c) => (fixtureByName(c.fixture).stackPacks ?? []).length > 0);
  const GRADERS = ['plan-cites-its-rules', 'plan-cites-each-rule-once', 'plan-check-passed', 'plan-gets-stack-rules'];

  it('are the five app cases; the plugin arm installs the stack packs, the bare arm does not', () => {
    assert.deepEqual(stacked.map((c) => c.name).sort(), ['plan-app-csv', 'plan-app-draft', 'plan-app-remind', 'plan-app-reuse', 'plan-app-vague']);
    for (const c of stacked) {
      assert.match(FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`), /--ambicode-init --context --stack-packs/, c.name);
      if (c.bare !== null) assert.doesNotMatch(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), /--ambicode-init|--stack-packs/, c.name);
    }
    for (const c of planCases.filter((other) => !stacked.includes(other))) {
      assert.doesNotMatch(FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`), /--stack-packs/, c.name);
      for (const grader of GRADERS) assert.equal(FILES.has(`${caseDir('cases', c.name)}/graders/${grader}.md`), false, `${c.name} ${grader}`);
    }
  });

  it('carry the citation graders at weight 1, one set of patterns shared by every case, and no bare-arm copy', () => {
    for (const c of stacked) {
      for (const grader of GRADERS) {
        assert.equal(graderOf(c.name, grader).weight, 1, `${c.name} ${grader}`);
        assert.equal(FILES.has(`${caseDir('bare', c.name)}/graders/${grader}.md`), false, `${c.name} ${grader} must not grade the bare arm`);
      }
      assert.equal(graderOf(c.name, 'plan-cites-each-rule-once').pattern, graderOf('plan-app-csv', 'plan-cites-each-rule-once').pattern);
    }
  });

  it('grade a plan on its own text: one line per id passes, a second line fails, any pack id counts', () => {
    const cites = new RegExp(graderOf('plan-app-csv', 'plan-cites-its-rules').pattern);
    const once = new RegExp(graderOf('plan-app-csv', 'plan-cites-each-rule-once').pattern);
    assert.ok(cites.test('## Policies\n- express-http/single-response: applied at src/reports/routes.js:5\n'));
    assert.ok(cites.test('common-design/need: not applicable: no new surface'));
    assert.ok(!cites.test('## Policies\nexpress-http/single-response is relevant\n'));
    assert.ok(!once.test('common-design/need: applied at a.js:1, b.js:2\nexpress-http/single-response: not applicable: x\n'));
    assert.ok(once.test('common-design/need: applied at a.js:1\nexpress-http/single-response: not applicable: x\ncommon-design/need: applied at b.js:2\n'));
    assert.ok(once.test('- `common-design/need`: applied at a.js:1\n- common-design/need: not applicable: x\n'));
  });

  it('read the ledger: the check passed once, and a plan-stage policy row carries a stack pack rule', () => {
    const passed = new RegExp(graderOf('plan-app-csv', 'plan-check-passed').pattern);
    assert.ok(passed.test('{"kind":"worker","worker":"plan-check","outcome":"ran","ms":3,"artifact":null,"summary":{"failed":false,"anchorsBad":0}}'));
    assert.ok(!passed.test('{"kind":"worker","worker":"plan-check","outcome":"ran","ms":3,"artifact":null,"summary":{"failed":true,"anchorsBad":0,"policyRepeated":["a/b"]}}'));
    const stack = new RegExp(graderOf('plan-app-csv', 'plan-gets-stack-rules').pattern);
    assert.ok(stack.test('{"kind":"policy","route":"plan","activity":"plan","ids":["common-design/need","express-http/single-response"]}'));
    assert.ok(!stack.test('{"kind":"policy","route":"plan","activity":"review","ids":["express-http/single-response"]}'));
    assert.ok(!stack.test('{"kind":"policy","route":"plan","activity":"plan","ids":["common-design/need"]}'));
  });
});

describe('plan-quality graders read the plan, not its citations', () => {
  const CITE = '- common-design/explicit-surface: applied at src/notifications/service.js:27-38, src/invoices/service.js:81';
  const CLEAN = '## Iteration 1\n- *Goal*: remind.\n- *Changes*: `src/notifications/reminders.js:1` reads overdue invoices through `src/invoices/index.js:3`.\n';

  it('a citation line under ## Policies does not trip the feature-boundary check, the same words in an iteration still do', () => {
    const boundary = new RegExp(graderOf('plan-app-remind', 'policy-feature-boundary').pattern);
    assert.ok(!boundary.test(`${CLEAN}\n## Policies\n${CITE}\n`));
    assert.ok(boundary.test(`## Iteration 1\n- *Changes*: \`src/notifications/service.js:27\` calls \`src/invoices/service.js:81\`\n\n## Policies\n`));
  });

  it('a must check is not satisfied by a citation line either', () => {
    const grace = new RegExp(graderOf('plan-app-reuse', 'grace-days-honoured').pattern);
    assert.ok(!grace.test('## Policies\ncommon-design/need: applied at src/config.js:3 overdueGraceDays\n'));
    assert.ok(grace.test('## Iteration 1\noverdueGraceDays is read from src/config.js:3\n'));
  });

  it('the test-factory check accepts the helper named in backticks, with or without a call', () => {
    const factory = new RegExp(graderOf('plan-app-remind', 'policy-test-factory').pattern);
    for (const line of ['- *Tests*: use `makeInvoice` with a dueDate', 'makeCustomer({ id })', 'build it with makePayment in the test', 'tests/factory.js:21']) assert.ok(factory.test(line), line);
    assert.ok(!factory.test('- *Tests*: builds invoices by hand with createInvoice'));
  });
});
