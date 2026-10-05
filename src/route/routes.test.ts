import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIERS } from './dsl.ts';
import { instantiateGate, registryGate } from './gates.ts';
import { HANDLER_NAMES, MAX_INSTRUCTION_CHARS, routeRegistry, validateRouteFiles } from './routes.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HANDLERS = ['code.one', 'code.two'];

const BASE = {
  head: 'skill: demo\nversion: 3\nbudget: { modelSteps: 6 }\nexits: [done, blocked, human]\nrevisable: []\nsteps:\n',
  code: '  - id: ground\n    actor: code\n    run: code.one\n    produces: [envelope]\n    repeat: 2\n',
  model: '  - id: read\n    actor: model\n    instruction: Read the code.\n',
  gate: [
    '  - id: ask',
    '    actor: human',
    '    gate:',
    '      question: "Go on?"',
    '      options: [Yes, No, Maybe]',
    '      default: No',
    '      release: No',
    '      onAnswer: { Maybe: revise ground }',
    '',
  ].join('\n'),
};

async function root(t: { after(fn: () => unknown): void }, files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-routes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'routes', 'steps'), { recursive: true });
  await writeFile(path.join(directory, 'routes', 'gates.yaml'), await readFile(path.join(ROOT, 'routes', 'gates.yaml'), 'utf8'));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(directory, name), text);
  return directory;
}

async function refuses(t: { after(fn: () => unknown): void }, yaml: string, expected: RegExp, extra: Record<string, string> = {}): Promise<void> {
  const directory = await root(t, { 'routes/demo.yaml': yaml, ...extra });
  await assert.rejects(
    validateRouteFiles(directory, { handlers: HANDLERS }),
    (error: Error & { code?: string }) => error.code === 'route-invalid' && expected.test(error.message),
    `expected route-invalid ${expected}`,
  );
}

test('03-R1: a valid route loads and normalizes its steps, gate and defaults', async (t) => {
  const directory = await root(t, { 'routes/demo.yaml': `${BASE.head}${BASE.code}${BASE.model}${BASE.gate}` });
  const { routes } = await validateRouteFiles(directory, { handlers: HANDLERS });
  const route = routes[0]!;
  assert.deepEqual([route.skill, route.version, route.budget.modelSteps], ['demo', 3, 6]);
  assert.deepEqual(route.steps.map((step) => [step.id, step.index, step.actor, step.repeat]), [['ground', 0, 'code', 2], ['read', 1, 'model', 1], ['ask', 2, 'human', 1]]);
  assert.deepEqual(route.steps[0]!.run, [{ name: 'code.one', params: [] }]);
  const gate = route.steps[2]!.gate!;
  assert.deepEqual([gate.id, gate.class, gate.maxRevises, gate.acting], ['ask', 'declared', 3, []]);
  assert.deepEqual(gate.onAnswer['Maybe'], { target: 'ground', args: {} });
});

test('03-R1: one rejection per schema rule, each naming the file and the field', async (t) => {
  const cases: [string, string, RegExp][] = [
    ['duplicate step id', `${BASE.head}${BASE.code}${BASE.code}`, /step ground: duplicate step id/],
    ['missing step id', `${BASE.head}  - actor: code\n    run: code.one\n`, /steps\.0\.id/],
    ['unknown actor', `${BASE.head}  - id: x\n    actor: robot\n`, /steps\.0\.actor/],
    ['version 2', BASE.head.replace('version: 3', 'version: 2') + BASE.model, /version/],
    ['no modelSteps', BASE.head.replace('{ modelSteps: 6 }', '{ wallMinutes: 5 }') + BASE.model, /budget\.modelSteps/],
    ['exit outside the set', BASE.head.replace('[done, blocked, human]', '[done, vanished]') + BASE.model, /exits/],
    ['a yaml parse error names its line', `${BASE.head}  - id: x\n    actor: code\n    run: [a, b: c\n`, /demo\.yaml: (line \d+|yaml)/],
    ['an unquoted brace in a flow sequence', `${BASE.head}  - id: x\n    actor: code\n    run: code.one\n    produces: [policy{before-report}]\n`, /demo\.yaml/],
  ];
  for (const [name, yaml, expected] of cases) await refuses(t, yaml, expected).catch((error: Error) => { error.message = `${name}: ${error.message}`; throw error; });
});

test('03-R2: when accepts the fixed vocabulary and gate predicates of this route only', async (t) => {
  const withWhen = (when: string): string => `${BASE.head}${BASE.code}${BASE.gate}  - id: after\n    actor: code\n    run: code.two\n    when: "${when}"\n`;
  for (const when of ['args.hasRequirement', '!args.hasRequirement', 'map.empty', 'plan.isDraft', 'headless', 'interactive', 'index.present', 'gate.ask.answered', 'gate.ask.is(Yes)']) {
    const directory = await root(t, { 'routes/demo.yaml': withWhen(when) });
    await validateRouteFiles(directory, { handlers: HANDLERS });
  }
  await refuses(t, withWhen('args.other'), /after\.when: "args\.other" is not in the when vocabulary/);
  await refuses(t, withWhen('gate.nope.answered'), /"nope" is not a gate of this route/);
  await refuses(t, withWhen('gate.ask.is(Never)'), /"Never" is not an option of gate ask/);
});

test('03-R3: needs and produces are known kinds; a qualifier is checked against its kind field', async (t) => {
  const withProduces = (produces: string): string => `${BASE.head}  - id: x\n    actor: model\n    instruction: Do.\n    produces: [${produces}]\n`;
  for (const [kind, values] of Object.entries(QUALIFIERS)) {
    for (const value of values) await validateRouteFiles(await root(t, { 'routes/demo.yaml': withProduces(`"${kind}{${value}}"`) }), { handlers: HANDLERS });
  }
  await refuses(t, withProduces('"note{plan-v2}"'), /not a note qualifier/);
  await refuses(t, withProduces('"map{x}"'), /"map" takes no qualifier/);
  await refuses(t, withProduces('bogus'), /"bogus" is not a ledger kind/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n    instruction: Do.\n    needs: ["check{red}"]\n`, /not a check qualifier/);
});

test('03-R4: a model step has an instruction of at most 1,500 characters, inline or included; run names registered handlers', async (t) => {
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n`, /a model step has an instruction/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n    instruction: "${'a'.repeat(MAX_INSTRUCTION_CHARS + 1)}"\n`, /1501 characters/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n    instruction: "file:routes/steps/long.md"\n`, /1501 characters/, { 'routes/steps/long.md': 'b'.repeat(MAX_INSTRUCTION_CHARS + 1) });
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n    instruction: "file:routes/steps/missing.md"\n`, /cannot be read/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: code\n    run: nobody.knows\n`, /"nobody\.knows" is not a registered handler/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: code\n`, /a code step runs at least one handler/);
  const included = await root(t, { 'routes/demo.yaml': `${BASE.head}  - id: x\n    actor: model\n    instruction: "file:routes/steps/ok.md"\n`, 'routes/steps/ok.md': 'c'.repeat(MAX_INSTRUCTION_CHARS) });
  assert.equal((await validateRouteFiles(included, { handlers: HANDLERS })).routes[0]!.steps[0]!.instruction?.length, MAX_INSTRUCTION_CHARS);
});

test('03-R5: a gate sits on a human step with a non-acting default and a release; its object has an earlier producer', async (t) => {
  const gate = (extra: string, opening = BASE.code): string =>
    `${BASE.head}${opening}  - id: ask\n    actor: human\n    gate:\n      question: Q\n      options: [Accept, Reject]\n      default: Reject\n      release: Reject\n${extra}`;
  await refuses(t, `${BASE.head}  - id: x\n    actor: model\n    instruction: Do.\n    gate: { question: Q, options: [A], default: A, release: A }\n`, /a gate goes on a human step/);
  await refuses(t, `${BASE.head}  - id: x\n    actor: human\n`, /a human step declares its gate/);
  await refuses(t, gate('      acting: [Reject]\n'), /default: "Reject" is acting/);
  await refuses(t, gate('      acting: [Reject]\n').replace('default: Reject', 'default: Accept'), /release: "Reject" is acting/);
  await refuses(t, gate('').replace('      release: Reject\n', ''), /gate\.release/);
  await refuses(t, gate('      acting: [Nope]\n'), /"Nope" is not one of the options/);
  await refuses(t, gate('      maxRevises: 0\n'), /maxRevises/);
  await refuses(t, gate('      object: "envelope"\n', ''), /no earlier step produces envelope/);
  await refuses(t, gate('      object: "note{plan-draft}"\n'), /no earlier step produces note\{plan-draft\}/);
  const fine = await root(t, { 'routes/demo.yaml': gate('      acting: [Accept]\n      object: envelope\n') });
  const { routes } = await validateRouteFiles(fine, { handlers: HANDLERS });
  assert.deepEqual(routes[0]!.steps[1]!.gate!.object, { kind: 'envelope', value: null });
  assert.deepEqual(routes[0]!.steps[1]!.gate!.acting, ['Accept']);
});

test('03-R6: revision targets are earlier steps, the firing step, $raisedBy or the next step; automatic targets have repeat of at least 2', async (t) => {
  const steps = (first: string, second: string, third = ''): string =>
    `${BASE.head}  - id: a\n    actor: code\n    run: code.one\n${first}  - id: b\n    actor: code\n    run: code.two\n${second}  - id: c\n    actor: code\n    run: code.one\n${third}`;
  await refuses(t, steps('', '    onFail: revise nowhere\n'), /"nowhere" is not a step/);
  await refuses(t, steps('    onFail: revise c\n', ''), /"c" is later than the next step/);
  await refuses(t, steps('', '    onFail: revise a\n'), /"a" has repeat 1/);
  for (const fine of [steps('    repeat: 2\n', '    onFail: revise a\n'), steps('', '    onFail: revise b\n    repeat: 2\n'), steps('    onFail: revise b\n', '    repeat: 2\n'), steps('', '    onFail: "revise $raisedBy"\n')]) {
    await validateRouteFiles(await root(t, { 'routes/demo.yaml': fine }), { handlers: HANDLERS });
  }
  const withGate = (target: string, repeat = ''): string =>
    `${BASE.head}  - id: a\n    actor: code\n    run: code.one\n${repeat}  - id: ask\n    actor: human\n    gate:\n      question: Q\n      options: [Go, Back]\n      default: Go\n      release: Go\n      onAnswer: { Back: "revise ${target}" }\n`;
  await validateRouteFiles(await root(t, { 'routes/demo.yaml': withGate('a') }), { handlers: HANDLERS });
  await refuses(t, withGate('ghost'), /onAnswer\.Back: "ghost" is not a step/);
  const human = `${BASE.head}  - id: ask\n    actor: human\n    gate: { question: Q, options: [Go], default: Go, release: Go }\n  - id: after\n    actor: code\n    run: code.one\n    onFail: revise ask\n`;
  await validateRouteFiles(await root(t, { 'routes/demo.yaml': human }), { handlers: HANDLERS });
  await refuses(t, `${BASE.head.replace('revisable: []', 'revisable: [ghost]')}${BASE.model}`, /revisable: "ghost" is not a step/);
  await refuses(t, `${BASE.head.replace('revisable: []', 'revisable: [read]')}${BASE.model}`, /"read" has repeat 1/);
  await validateRouteFiles(await root(t, { 'routes/demo.yaml': `${BASE.head.replace('revisable: []', 'revisable: [ground]')}${BASE.code}` }), { handlers: HANDLERS });
});

test('03-R6: default repeat counts follow the step id', async (t) => {
  const ids = ['ground', 'design', 'plan-write', 'draft', 'fix', 'review-run', 'other'];
  const yaml = BASE.head + ids.map((id) => `  - id: ${id}\n    actor: code\n    run: code.one\n`).join('');
  const { routes } = await validateRouteFiles(await root(t, { 'routes/demo.yaml': yaml }), { handlers: HANDLERS });
  assert.deepEqual(routes[0]!.steps.map((step) => step.repeat), [2, 2, 3, 3, 2, 2, 1]);
});

test('03-R7: the registry holds every v6/32 §4 gate with a question, default and release; defaults and releases are never acting', async () => {
  const { registry } = await validateRouteFiles(ROOT, { handlers: HANDLER_NAMES });
  const ids = registry.map((gate) => gate.id).sort();
  assert.deepEqual(ids, [
    'budget-exhausted', 'check-only-unauthorized', 'config-unparsable', 'decision:*', 'project-ambiguous', 'requirements-conflicting',
    'requirements-expansion-capped', 'requirements-not-captured-twice', 'requirements-server-ambiguous', 'requirements-server-disconnected', 'scope-expanding',
  ]);
  for (const gate of registry) {
    assert.ok(gate.question !== '' && gate.default !== '' && gate.release !== '', gate.id);
    assert.equal(gate.acting.includes(gate.default) || gate.acting.includes(gate.release), false, gate.id);
    assert.deepEqual(gate.class, gate.id === 'decision:*' ? 'decision' : 'raised');
  }
  const acting = Object.fromEntries(registry.map((gate) => [gate.id, gate.acting]));
  assert.deepEqual(acting['check-only-unauthorized'], ['approve']);
  assert.deepEqual(acting['config-unparsable'], ['back up and regenerate']);
  assert.deepEqual(Object.entries(acting).filter(([id]) => !['check-only-unauthorized', 'config-unparsable'].includes(id)).flatMap(([, value]) => value), []);
  const reviewStop = registry.filter((gate) => gate.policy['review'] === 'stop').map((gate) => gate.id).sort();
  assert.deepEqual(reviewStop, ['requirements-not-captured-twice', 'requirements-server-ambiguous', 'requirements-server-disconnected']);
  const decision = registry.find((gate) => gate.id === 'decision:*')!;
  assert.deepEqual([decision.default, decision.release, decision.acting, decision.object], ['keep open', 'keep open', [], null]);
  assert.deepEqual(registry.find((gate) => gate.id === 'check-only-unauthorized')!.onAnswer['approve'], { target: '$raisedBy', args: {} });
});

test('03-R7: a decision gate id resolves to the decision entry; others by exact id', async () => {
  const { registry } = await validateRouteFiles(ROOT, { handlers: HANDLER_NAMES });
  assert.equal(registryGate(registry, 'decision:use-redis')?.id, 'decision:*');
  assert.equal(registryGate(registry, 'scope-expanding')?.id, 'scope-expanding');
  assert.equal(registryGate(registry, 'nope'), null);
  assert.equal(routeRegistry({ routes: [], registry }).gate('decision:x')?.class, 'decision');
});

test('03-R8: dynamic options are instantiated before validation; the review policy replaces default and release with stop', async () => {
  const { registry } = await validateRouteFiles(ROOT, { handlers: HANDLER_NAMES });
  const ambiguous = registry.find((gate) => gate.id === 'requirements-server-ambiguous')!;
  const interactive = instantiateGate(ambiguous, { skill: 'plan', values: { servers: ['Alpha', 'Beta'] } });
  assert.deepEqual(interactive.options, ['Alpha', 'Beta', 'continue without']);
  assert.deepEqual([interactive.default, interactive.release], ['continue without', 'continue without']);
  const review = instantiateGate(ambiguous, { skill: 'review', values: { servers: ['Alpha', 'Beta'] } });
  assert.deepEqual(review.options, ['Alpha', 'Beta', 'continue without', 'stop']);
  assert.deepEqual([review.default, review.release], ['stop', 'stop']);
  const capped = instantiateGate(registry.find((gate) => gate.id === 'requirements-expansion-capped')!, { skill: 'plan', values: { keys: ['A-1', 'A-2'] } });
  assert.deepEqual(capped.options, ['read all', 'read these: A-1, A-2', 'none']);
  const check = instantiateGate(registry.find((gate) => gate.id === 'check-only-unauthorized')!, { skill: 'task', values: { key: ['unit'], files: ['a.ts', 'b.ts'] } });
  assert.equal(check.question, 'Run unit on a.ts, b.ts? (policy: propose)');
  const acting = { ...ambiguous, acting: ['continue without'] };
  assert.throws(() => instantiateGate(acting, { skill: 'plan', values: { servers: [] } }), (error: Error & { code?: string }) => error.code === 'route-invalid');
});

test('03-R9: the DSL gate id is the logical id; a declared gate takes its step id', async (t) => {
  const { routes } = await validateRouteFiles(await root(t, { 'routes/demo.yaml': `${BASE.head}${BASE.code}${BASE.gate}` }), { handlers: HANDLERS });
  assert.equal(routes[0]!.steps[1]!.gate!.id, routes[0]!.steps[1]!.id);
});

test('03-R10: the shipped route files validate; build and packaging call the validator; nothing imports from gym', async () => {
  const shipped = await validateRouteFiles(ROOT, { handlers: HANDLER_NAMES });
  assert.ok(shipped.registry.length > 0);
  assert.match(await readFile(path.join(ROOT, 'build.mjs'), 'utf8'), /validateRouteFiles\(/);
  const packaging = await readFile(path.join(ROOT, 'package-candidate.mjs'), 'utf8');
  assert.match(packaging, /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
  assert.match(packaging, /await checkRoutes\(candidateDir\)/);
  const offenders: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.ts$/.test(entry.name) && /from ['"][^'"]*\/gym\//.test(await readFile(full, 'utf8'))) offenders.push(full);
    }
  };
  await walk(path.join(ROOT, 'src'));
  assert.deepEqual(offenders, []);
});
