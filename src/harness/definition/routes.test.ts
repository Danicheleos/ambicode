import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { instantiateGate, registryGate } from '../gates/gates.ts';
import { routeRegistry, validateRouteFiles } from './routes.ts';
import { REPO_ROOT } from '#testing/paths';
import { HANDLER_NAMES } from '#types/harness';

const HANDLERS = ['code.one', 'code.two'];

const BASE = {
  head: 'skill: demo\nversion: 3\nrevisable: []\nsteps:\n',
  code: '  - id: ground\n    actor: code\n    run: code.one\n    produces: [envelope]\n    repeat: 2\n',
  model: '  - id: read\n    actor: model\n    instruction: Read the code.\n',
  gate: [
    '  - id: ask',
    '    actor: human',
    '    gate:',
    '      question: "Go on?"',
    '      options: [Yes, No, Maybe]',
    '      default: No',
    '      onAnswer: { Maybe: revise ground }',
    '',
  ].join('\n'),
};

async function root(t: { after(fn: () => unknown): void }, files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-routes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'routes', 'demo'), { recursive: true });
  await writeFile(path.join(directory, 'routes', 'gates.yaml'), await readFile(path.join(REPO_ROOT, 'routes', 'gates.yaml'), 'utf8'));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(directory, name), text);
  return directory;
}

async function refuses(t: { after(fn: () => unknown): void }, yaml: string, expected: RegExp, extra: Record<string, string> = {}): Promise<void> {
  const directory = await root(t, { 'routes/demo/demo.yaml': yaml, ...extra });
  await assert.rejects(
    validateRouteFiles(directory, { handlers: HANDLERS }),
    (error: Error & { code?: string }) => error.code === 'route-invalid' && expected.test(error.message),
    `expected route-invalid ${expected}`,
  );
}

test('03-R1: a valid route loads and normalizes its steps, gate and defaults', async (t) => {
  const directory = await root(t, { 'routes/demo/demo.yaml': `${BASE.head}${BASE.code}${BASE.model}${BASE.gate}` });
  const { routes } = await validateRouteFiles(directory, { handlers: HANDLERS });
  const route = routes[0]!;
  assert.deepEqual([route.skill, route.version], ['demo', 3]);
  assert.deepEqual(route.steps.map((step) => [step.id, step.index, step.actor, step.repeat]), [['ground', 0, 'code', 2], ['read', 1, 'model', 1], ['ask', 2, 'human', 3]]);
  assert.deepEqual(route.steps[0]!.run, [{ name: 'code.one', params: [] }]);
  const gate = route.steps[2]!.gate!;
  assert.deepEqual([gate.id, gate.class, gate.repeat, gate.acting], ['ask', 'declared', 3, []]);
  assert.deepEqual(gate.onAnswer['Maybe'], { target: 'ground', args: {} });
});

test('03-R1: one rejection per schema rule, each naming the file and the field', async (t) => {
  const cases: [string, string, RegExp][] = [
    ['duplicate step id', `${BASE.head}${BASE.code}${BASE.code}`, /step ground: duplicate step id/],
    ['missing step id', `${BASE.head}  - actor: code\n    run: code.one\n`, /steps\.0\.id/],
    ['unknown actor', `${BASE.head}  - id: x\n    actor: robot\n`, /steps\.0\.actor/],
    ['version 2', BASE.head.replace('version: 3', 'version: 2') + BASE.model, /version/],
    ['a yaml parse error names its line', `${BASE.head}  - id: x\n    actor: code\n    run: [a, b: c\n`, /demo\.yaml: (line \d+|yaml)/],
    ['an unquoted brace in a flow sequence', `${BASE.head}  - id: x\n    actor: code\n    run: code.one\n    produces: [policy{before-report}]\n`, /demo\.yaml/],
  ];
  for (const [name, yaml, expected] of cases) await refuses(t, yaml, expected).catch((error: Error) => { error.message = `${name}: ${error.message}`; throw error; });
});

test('03-R2: when accepts the fixed vocabulary and gate predicates of this route only', async (t) => {
  const withWhen = (when: string): string => `${BASE.head}${BASE.code}${BASE.gate}  - id: after\n    actor: code\n    run: code.two\n    when: "${when}"\n`;
  for (const when of ['args.hasRequirement', 'map.empty', 'plan.isDraft', 'revised', 'gate.ask.is(Yes)']) {
    const directory = await root(t, { 'routes/demo/demo.yaml': withWhen(when) });
    await validateRouteFiles(directory, { handlers: HANDLERS });
  }
  await refuses(t, withWhen('index.present'), /not in the when vocabulary/);
  await refuses(t, withWhen('args.other'), /after\.when: "args\.other" is not in the when vocabulary/);
  await refuses(t, withWhen('gate.nope.is(Yes)'), /"nope" is not a gate of this route/);
  await refuses(t, withWhen('gate.ask.is(Never)'), /"Never" is not an option of gate ask/);
});

test('03-R6: revision targets are earlier steps, the firing step, $raisedBy or the next step; automatic targets have repeat of at least 2', async (t) => {
  const steps = (first: string, second: string, third = ''): string =>
    `${BASE.head}  - id: a\n    actor: code\n    run: code.one\n${first}  - id: b\n    actor: code\n    run: code.two\n${second}  - id: c\n    actor: code\n    run: code.one\n${third}`;
  await refuses(t, steps('', '    onFail: revise nowhere\n'), /"nowhere" is not a step/);
  for (const fine of [steps('    repeat: 2\n', '    onFail: revise a\n'), steps('', '    onFail: revise b\n    repeat: 2\n'), steps('', '    onFail: "revise $raisedBy"\n')]) {
    await validateRouteFiles(await root(t, { 'routes/demo/demo.yaml': fine }), { handlers: HANDLERS });
  }
  const withGate = (target: string, repeat = ''): string =>
    `${BASE.head}  - id: a\n    actor: code\n    run: code.one\n${repeat}  - id: ask\n    actor: human\n    gate:\n      question: Q\n      options: [Go, Back]\n      default: Go\n      onAnswer: { Back: "revise ${target}" }\n`;
  await validateRouteFiles(await root(t, { 'routes/demo/demo.yaml': withGate('a') }), { handlers: HANDLERS });
  await refuses(t, withGate('ghost'), /onAnswer\.Back: "ghost" is not a step/);
  const human = `${BASE.head}  - id: ask\n    actor: human\n    gate: { question: Q, options: [Go], default: Go }\n  - id: after\n    actor: code\n    run: code.one\n    onFail: revise ask\n`;
  await validateRouteFiles(await root(t, { 'routes/demo/demo.yaml': human }), { handlers: HANDLERS });
  await refuses(t, `${BASE.head.replace('revisable: []', 'revisable: [ghost]')}${BASE.model}`, /revisable: "ghost" is not a step/);
  await validateRouteFiles(await root(t, { 'routes/demo/demo.yaml': `${BASE.head.replace('revisable: []', 'revisable: [ground]')}${BASE.code}` }), { handlers: HANDLERS });
});

test('03-R7: every registry gate has a question and a default that is never acting', async () => {
  const { registry } = await validateRouteFiles(REPO_ROOT, { handlers: HANDLER_NAMES });
  for (const gate of registry) {
    assert.ok(gate.question !== '' && gate.default !== '', gate.id);
    assert.equal(gate.acting.includes(gate.default), false, gate.id);
    assert.deepEqual(gate.class, gate.id === 'decision:*' ? 'decision' : 'raised');
  }
  const decision = registry.find((gate) => gate.id === 'decision:*')!;
  assert.deepEqual([decision.default, decision.acting, decision.object], ['keep open', [], null]);
  assert.deepEqual(registry.find((gate) => gate.id === 'check-only-unauthorized')!.onAnswer['approve'], { target: '$raisedBy', args: {} });
});

test('03-R7: a decision gate id resolves to the decision entry; others by exact id', async () => {
  const { registry } = await validateRouteFiles(REPO_ROOT, { handlers: HANDLER_NAMES });
  assert.equal(registryGate(registry, 'decision:use-redis')?.id, 'decision:*');
  assert.equal(registryGate(registry, 'check-only-unauthorized')?.id, 'check-only-unauthorized');
  assert.equal(registryGate(registry, 'nope'), null);
  assert.equal(routeRegistry({ routes: [], registry }).gate('decision:x')?.class, 'decision');
});

test('03-R9: the DSL gate id is the logical id; a declared gate takes its step id', async (t) => {
  const { routes } = await validateRouteFiles(await root(t, { 'routes/demo/demo.yaml': `${BASE.head}${BASE.code}${BASE.gate}` }), { handlers: HANDLERS });
  assert.equal(routes[0]!.steps[1]!.gate!.id, routes[0]!.steps[1]!.id);
});

test('03-R10: the shipped route files validate; build and packaging call the validator; nothing imports from gym', async () => {
  const shipped = await validateRouteFiles(REPO_ROOT, { handlers: HANDLER_NAMES });
  assert.ok(shipped.registry.length > 0);
  assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'build.mjs'), 'utf8'), /validateRouteFiles\(/);
  const packaging = await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8');
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
  await walk(path.join(REPO_ROOT, 'src'));
  assert.deepEqual(offenders, []);
});

