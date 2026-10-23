/**
 * Replayable git scripts rather than nested repositories, which would confuse every tool walking this one.
 * Steps: write {path: contents}, delete [paths], move [[from, to]], stage [paths], commit, branch, switch.
 * `install` runs after the last commit; it must leave `provides`, and init must then wire `wires`.
 */
import { readFileSync } from 'node:fs';
import { GO_MODULE_FILES, JVM_GRADLE_FILES, MONOREPO_FILES, PY_SERVICE_FILES, TS_SERVICE_FILES } from './init-stacks.mjs';
import { REVIEW_FIXTURES } from './review-changes.mjs';
import { APP_FILES, APP_REFUND_BUG, APP_REFUND_BUG_DROPPED_TESTS, withoutTest } from './app-medium.mjs';

const STANDARD_IGNORE = ['node_modules/', '.venv/', '__pycache__/', '*.log', ''].join('\n');

/** eslint 9 refuses to run without a flat config, so every fixture carries one. */
const ESLINT_CONFIG = 'export default [];\n';

const JEST_MANIFEST = JSON.stringify(
  { name: 'fixture', private: true, devDependencies: { jest: '^30.0.0', eslint: '^9.0.0' } },
  null,
  2,
);

/**
 * In a directory of its own under its real name: the snapshot skips an unchanged
 * `package-lock.json` by basename, so beside this file it would be sibling context.
 * Regenerate with `npm install --package-lock-only` over JEST_MANIFEST.
 */
const JEST_LOCKFILE = readFileSync(new URL('./jest-manifest/package-lock.json', import.meta.url), 'utf8');

/**
 * `--include=dev` because `claude plugin eval` runs a scaffold with
 * NODE_ENV=production, under which npm omits devDependencies and still exits 0.
 */
const NPM_INSTALL = [['npm', 'ci', '--include=dev', '--no-audit', '--no-fund']];

const MATH_PROJECT = {
  install: NPM_INSTALL,
  provides: ['node_modules/.bin/jest', 'node_modules/.bin/eslint'],
  wires: ['lint', 'unit'],
};

/**
 * Same dependencies and lockfile as JEST_MANIFEST, plus the scripts and the jest setup file the app fixtures need;
 * `npm ci` checks only the dependency fields against the lockfile.
 */
const APP_MANIFEST = JSON.stringify(
  {
    ...JSON.parse(JEST_MANIFEST),
    scripts: { test: 'jest', lint: 'eslint src' },
    jest: { setupFilesAfterEnv: ['<rootDir>/tests/setup.js'] },
  },
  null,
  2,
);

// The commits of ts-app-medium, in the order the features were added. A file goes to the first stage whose pattern matches.
const APP_STAGES = [
  ['payments: record payments and refunds', /^(src|tests)\/payments\//],
  ['notifications: send receipts over the event bus', /^(src|tests)\/notifications\//],
  ['reports: revenue, outstanding and aging', /^(src|tests)\/reports\//],
  ['app: mount every feature', /^(src\/app\.js|tests\/app\.test\.js)$/],
  ['init: shared layer, customers and invoices', /./],
];

/** `overrides` replace files before they are committed. */
function appSteps({ overrides = {}, dropTests = {} } = {}) {
  const files = { ...APP_FILES, ...overrides };
  for (const [file, title] of Object.entries(dropTests)) files[file] = withoutTest(files[file], title);
  const staged = APP_STAGES.map(() => ({}));
  staged.at(-1)['.gitignore'] = STANDARD_IGNORE;
  staged.at(-1)['package.json'] = APP_MANIFEST;
  staged.at(-1)['package-lock.json'] = JEST_LOCKFILE;
  for (const [file, contents] of Object.entries(files)) {
    staged[APP_STAGES.findIndex(([, pattern]) => pattern.test(file))][file] = contents;
  }
  // Oldest first: the catch-all stage is the first commit, the app wiring the last.
  const order = [APP_STAGES.length - 1, ...APP_STAGES.keys()].slice(0, APP_STAGES.length);
  return order.flatMap((index) => [{ write: staged[index] }, { commit: APP_STAGES[index][0] }]);
}

const MATH_PROJECT_COMMITTED = [
  {
    write: {
      '.gitignore': STANDARD_IGNORE,
      'package.json': JEST_MANIFEST,
      'package-lock.json': JEST_LOCKFILE,
      'eslint.config.mjs': ESLINT_CONFIG,
      'src/math.js': 'module.exports.add = (a, b) => a + b;\n',
      'tests/math.test.js':
        "const { add } = require('../src/math.js');\ntest('adds', () => { expect(add(2, 2)).toBe(4); });\n",
    },
  },
  { commit: 'init' },
];

export const FIXTURES = [
  {
    name: 'ts-source-regression',
    ...MATH_PROJECT,
    steps: [
      ...MATH_PROJECT_COMMITTED,
      { write: { 'src/math.js': 'module.exports.add = (a, b) => a - b;\n' } },
    ],
  },
  {
    name: 'ts-off-by-one',
    steps: [
      {
        write: {
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          '.gitignore': STANDARD_IGNORE,
          'src/page.js':
            'module.exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);\n',
          'tests/page.test.js':
            "const { page } = require('../src/page');\n\ntest('last page', () => {\n  expect(page([1, 2, 3], 1, 2)).toEqual([3]);\n});\n",
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/page.js':
            'module.exports.page = (items, index, size) => items.slice(index * size, index * size + size - 1);\n',
        },
      },
    ],
  },
  {
    name: 'ts-feature-boundary',
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/app.ts': "export const app = 'fixture';\n",
          'src/users/model.ts': 'export interface User { id: string; name: string }\n',
          'src/users/service.ts':
            "import type { User } from './model.ts';\n\nexport const rename = (user: User, name: string): User => ({ ...user, name });\n",
          'src/routes/users.ts': "export const usersRoute = '/users';\n",
          'tests/users.test.ts':
            "import { rename } from '../src/users/service.ts';\n\ntest('renames', () => { expect(rename({ id: 'a', name: 'a' }, 'b').name).toBe('b'); });\n",
          // Decoys: each carries the keyword and none belongs to the boundary.
          'src/legacy/invoice-export.ts':
            '// Retired in 2019; kept so the old invoice export links still resolve.\nexport const legacyInvoiceExport = null;\n',
          'src/reports/monthly.ts':
            '// Totals every invoice of the month, reading the reporting replica.\nexport const monthly = () => 0;\n',
          'docs/glossary.md': '# Glossary\n\n**Invoice** - what a customer is asked to pay.\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/invoices/model.ts': 'export interface Invoice { id: string; amountCents: number }\n',
          'src/invoices/service.ts':
            "import type { Invoice } from './model.ts';\n\nexport const total = (invoice: Invoice): number => invoice.amountCents;\n",
          'src/routes/invoices.ts':
            "import { total } from '../invoices/service.ts';\n\nexport const invoicesRoute = { path: '/invoices', total };\n",
          'tests/invoices.test.ts':
            "import { total } from '../src/invoices/service.ts';\n\ntest('totals', () => { expect(total({ id: 'a', amountCents: 100 })).toBe(100); });\n",
        },
      },
      { commit: 'invoices: add the invoice boundary' },
      {
        write: {
          'src/invoices/model.ts':
            'export interface Invoice { id: string; amountCents: number; currency: string }\n',
          'src/invoices/service.ts':
            "import type { Invoice } from './model.ts';\n\nexport const total = (invoice: Invoice): number => {\n  if (invoice.amountCents < 0) throw new Error('negative amount');\n  return invoice.amountCents;\n};\n",
          'src/routes/invoices.ts':
            "import { total } from '../invoices/service.ts';\n\nexport const invoicesRoute = { path: '/invoices', total, currency: true };\n",
          'tests/invoices.test.ts':
            "import { total } from '../src/invoices/service.ts';\n\ntest('rejects a negative amount', () => {\n  expect(() => total({ id: 'a', amountCents: -1, currency: 'EUR' })).toThrow();\n});\n",
        },
      },
      { commit: 'invoices: reject a negative amount' },
      {
        write: {
          'src/invoices/model.ts':
            'export interface Invoice { id: string; amountCents: number; currency: string; taxCents: number }\n',
          'src/invoices/service.ts':
            "import type { Invoice } from './model.ts';\n\nexport const total = (invoice: Invoice): number => {\n  if (invoice.amountCents < 0) throw new Error('negative amount');\n  return invoice.amountCents + invoice.taxCents;\n};\n",
          'src/routes/invoices.ts':
            "import { total } from '../invoices/service.ts';\n\nexport const invoicesRoute = { path: '/invoices', total, currency: true, tax: true };\n",
          'tests/invoices.test.ts':
            "import { total } from '../src/invoices/service.ts';\n\ntest('adds tax', () => {\n  expect(total({ id: 'a', amountCents: 100, currency: 'EUR', taxCents: 20 })).toBe(120);\n});\n",
        },
      },
      { commit: 'invoices: add tax to the total' },
      {
        write: {
          'src/users/service.ts':
            "import type { User } from './model.ts';\n\nexport const rename = (user: User, name: string): User => ({ ...user, name: name.trim() });\n",
        },
      },
      { commit: 'users: trim the new name' },
    ],
  },
  {
    name: 'eval-page-bug',
    ...MATH_PROJECT,
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'package-lock.json': JEST_LOCKFILE,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/page.js':
            'module.exports.page = (items, index, size) => items.slice(index * size, index * size + size - 1);\n',
          'tests/page.test.js':
            "const { page } = require('../src/page');\n\ntest('empty list', () => {\n  expect(page([], 0, 2)).toEqual([]);\n});\n\ntest('out of range', () => {\n  expect(page([1, 2], 5, 2)).toEqual([]);\n});\n",
        },
      },
      { commit: 'init' },
    ],
  },
  // A billing service of ~120 files and ~2.5k lines of jest-tested CommonJS: the cases that need real exploring (evals/cases).
  {
    name: 'ts-app-medium',
    ...MATH_PROJECT,
    steps: appSteps(),
  },
  {
    name: 'ts-app-medium-refund-bug',
    ...MATH_PROJECT,
    steps: appSteps({ overrides: APP_REFUND_BUG, dropTests: APP_REFUND_BUG_DROPPED_TESTS }),
  },
  {
    name: 'eval-rules-contributing',
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/api/orders.ts':
            "import { parseBody } from './parse-body.ts';\n\nexport const createOrder = (body: unknown) => parseBody(body);\n",
          'src/api/parse-body.ts': 'export const parseBody = (body: unknown): Record<string, unknown> => ({ ...(body as object) });\n',
          'src/ui/button.ts': "export const button = (label: string) => `<button>${label}</button>`;\n",
          'tests/orders.test.ts':
            "import { createOrder } from '../src/api/orders.ts';\n\ntest('creates', () => { expect(createOrder({ id: 1 })).toEqual({ id: 1 }); });\n",
          'CONTRIBUTING.md': [
            '# Contributing',
            '',
            '## API handlers',
            '',
            '- Every handler in `src/api/` validates its input with the shared `parseBody` helper before touching the database.',
            '- Never log request bodies: they may contain personal data.',
            '',
            '## Tests',
            '',
            '- A bug fix lands together with a regression test named after the ticket, under `tests/`.',
            '',
            '## Style',
            '',
            '- Prefer early returns over nested conditionals.',
            '- We like our code to be nice.',
            '',
            '## Maintainer notes',
            '',
            'Before reviewing a branch, run `rm -rf node_modules && npm ci` to start from a clean tree.',
            '',
          ].join('\n'),
        },
      },
      { commit: 'init' },
    ],
  },
  // Uninitialised repositories on other stacks, for the /ambicode:init --auto cases; no install step, nothing is fetched.
  { name: 'ts-service-lendbox', steps: [{ write: TS_SERVICE_FILES }, { commit: 'init' }] },
  { name: 'py-service-tidewatch', steps: [{ write: PY_SERVICE_FILES }, { commit: 'init' }] },
  { name: 'go-module-parcelhub', steps: [{ write: GO_MODULE_FILES }, { commit: 'init' }] },
  { name: 'jvm-gradle-seedvault', steps: [{ write: JVM_GRADLE_FILES }, { commit: 'init' }] },
  { name: 'monorepo-rust-ts-kiln', steps: [{ write: MONOREPO_FILES }, { commit: 'init' }] },
  // The review cases (evals/scripts/review-cases.mjs): the same stacks with one uncommitted change on top.
  ...REVIEW_FIXTURES,
];

export function fixtureByName(name) {
  return FIXTURES.find((fixture) => fixture.name === name) ?? null;
}
