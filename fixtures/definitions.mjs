/**
 * Fixture repositories as replayable git scripts, because a nested repository
 * would confuse every tool that walks this one. `materialize.mjs` replays them
 * into a throwaway directory, giving real merge bases, staged state and renames.
 *
 * Step kinds:
 *   write   { path: contents }            files written to the work tree
 *   delete  [paths]                       files removed from the work tree
 *   move    [[from, to]]                  git mv, so the rename is recorded
 *   stage   [paths]                       git add, leaving the change staged
 *   commit  "message"                     git add -A && git commit
 *   branch  "name"                        git checkout -b
 *   switch  "name"                        git checkout
 */

/**
 * Fixtures carry their own ignore rules and materialize with the global ignore
 * file disabled, so a fixture contains the same paths on every machine.
 */
const STANDARD_IGNORE = ['node_modules/', '.venv/', '*.log', ''].join('\n');

/** eslint 9 refuses to run without a flat config, so every fixture carries one. */
const ESLINT_CONFIG = 'export default [];\n';

/** Python fixtures carry the tool declarations their evaluation cases expect. */
const PYPROJECT = [
  '[project]',
  'name = "fixture"',
  'version = "0.0.0"',
  '',
  '[dependency-groups]',
  'dev = ["pytest>=9", "ruff>=0.14"]',
  '',
].join('\n');

const JEST_MANIFEST = JSON.stringify(
  { name: 'fixture', private: true, devDependencies: { jest: '^30.0.0', eslint: '^9.0.0' } },
  null,
  2,
);

/**
 * The eight locale files of `ts-locale-decoys`, written together as a real
 * translation export writes them. They carry the ticket's own prose — the
 * words a requirement uses — and none of the code's identifiers.
 */
const LOCALES = ['de', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'zh'];

function localeFiles(maximum) {
  const files = {};
  for (const locale of LOCALES) {
    files[`src/assets/i18n/${locale}.json`] = `${JSON.stringify(
      {
        orders: {
          'ORD-17': { title: 'Order/Refund', 'ORD-17-1': `Refund Limit has to be below ${maximum}` },
        },
      },
      null,
      2,
    )}\n`;
  }
  return files;
}


/**
 * Unrelated feature code, so `ts-locale-decoys` is a project rather than a
 * handful of files. The breadth guard measures a term against the size of
 * what it searched, and in a sixteen-file repository ten matches genuinely
 * are most of the project — the guard would be right and the fixture wrong.
 */
function fillerFiles() {
  const files = {};
  for (const feature of ['billing', 'catalog', 'profile', 'search', 'shipping', 'support']) {
    files[`src/features/${feature}/${feature}.service.ts`] = `export const ${feature} = () => 0;\n`;
    files[`src/features/${feature}/${feature}.component.ts`] =
      `export class ${feature[0].toUpperCase()}${feature.slice(1)}Component {}\n`;
    files[`src/features/${feature}/${feature}.service.spec.ts`] =
      `import { ${feature} } from './${feature}.service.ts';\n\ntest('runs', () => { expect(${feature}()).toBe(0); });\n`;
  }
  // Path coordinates, which are where a numeric term goes wrong: joining the
  // words of "250.5" gives "2505", and the `41.2505` below contains it. Real
  // illustrations put five such files in the top twenty of a shortlist for a
  // ticket that raised a numeric limit.
  files['src/assets/illustrations/outline.svg'] =
    '<svg><path d="M25 74V74.0856L28.7378 41.2505L25.6763 73.9141Z"/></svg>\n';
  return files;
}

/**
 * Unrelated code for `polyglot-spellings`, in the same three ecosystems and
 * under the same three roots as the files the terms are meant to find, so a
 * hit there is a hit on the name rather than on the language or the layout.
 */
function polyglotFiller() {
  const files = {};
  for (const name of ['billing', 'catalog', 'profile', 'search', 'shipping', 'support']) {
    files[`services/${name}/${name}.py`] = `def ${name}():\n    return 0\n`;
    files[`internal/${name}/${name}.go`] = `package ${name}\n\nconst Zero = 0\n`;
    files[`lib/${name}/${name}.c`] = `int ${name}(void) { return 0; }\n`;
  }
  return files;
}

export const FIXTURES = [
  {
    name: 'ts-staged-unstaged',
    summary: 'Staged edit, unstaged edit, an edit staged then reverted, and an untracked file.',
    covers: ['working target', 'index preservation', 'untracked inclusion'],
    steps: [
      {
        write: {
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          '.gitignore': STANDARD_IGNORE,
          'src/kept.ts': 'export const kept = 1;\n',
          'src/staged.ts': 'export const staged = 1;\n',
          'src/unstaged.ts': 'export const unstaged = 1;\n',
          'src/reverted.ts': 'export const reverted = 1;\n',
        },
      },
      { commit: 'init' },
      { write: { 'src/staged.ts': 'export const staged = 2;\n' } },
      { stage: ['src/staged.ts'] },
      { write: { 'src/unstaged.ts': 'export const unstaged = 2;\n' } },
      // Staged, then undone in the working file: must not appear in the diff.
      { write: { 'src/reverted.ts': 'export const reverted = 99;\n' } },
      { stage: ['src/reverted.ts'] },
      { write: { 'src/reverted.ts': 'export const reverted = 1;\n' } },
      { write: { 'src/untracked.ts': 'export const fresh = 1;\n', 'debug.log': 'ignored\n' } },
    ],
  },
  {
    name: 'ts-branch-divergence',
    summary: 'Baseline moved on after the feature branch started, so merge-base matters.',
    covers: ['branch target', 'merge base', 'excluded dirty changes'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/shared.ts': 'export const shared = 1;\n',
        },
      },
      { commit: 'init' },
      { branch: 'feature' },
      { write: { 'src/feature.ts': 'export const feature = 1;\n' } },
      { commit: 'feature work' },
      { switch: 'main' },
      { write: { 'src/shared.ts': 'export const shared = 2;\n' } },
      { commit: 'unrelated work on main' },
      { switch: 'feature' },
      // Dirty on top of the branch: excluded from a branch review, and said so.
      { write: { 'src/feature.ts': 'export const feature = 2; // uncommitted\n' } },
    ],
  },
  {
    name: 'ts-source-regression',
    summary: 'A source-only change that breaks an unchanged test.',
    covers: ['affected-test selection', 'unchanged regression test fails'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/math.js': 'module.exports.add = (a, b) => a + b;\n',
          'tests/math.test.js':
            "const { add } = require('../src/math.js');\ntest('adds', () => { expect(add(2, 2)).toBe(4); });\n",
        },
      },
      { commit: 'init' },
      // Only the source changes; the test that catches it is untouched.
      { write: { 'src/math.js': 'module.exports.add = (a, b) => a - b;\n' } },
    ],
  },
  {
    name: 'ts-rename-delete',
    summary: 'One file renamed and another deleted, with tests still importing the old names.',
    covers: ['rename', 'deletion', 'uncertain selection'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/keep.js': 'module.exports.keep = () => 1;\n',
          'src/gone.js': 'module.exports.gone = () => 2;\n',
          'src/old-name.js': 'module.exports.value = () => 3;\n',
          'tests/gone.test.js':
            "const { gone } = require('../src/gone.js');\ntest('gone', () => { expect(gone()).toBe(2); });\n",
          'tests/old-name.test.js':
            "const { value } = require('../src/old-name.js');\ntest('value', () => { expect(value()).toBe(3); });\n",
        },
      },
      { commit: 'init' },
      { move: [['src/old-name.js', 'src/new-name.js']] },
      { delete: ['src/gone.js'] },
    ],
  },
  {
    name: 'ts-no-tests',
    summary: 'A TypeScript project with no test runner and no linter installed.',
    covers: ['null commands', 'skipped checks with notices'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JSON.stringify({ name: 'bare', private: true }, null, 2),
          'src/index.ts': 'export const value = 1;\n',
        },
      },
      { commit: 'init' },
      { write: { 'src/index.ts': 'export const value = 2;\n' } },
    ],
  },
  {
    name: 'monorepo-mixed',
    summary: 'A TypeScript app and a Python service in one repository, changed together.',
    covers: ['most-specific project root', 'per-project policy scope', 'mixed ecosystems'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*'] }, null, 2),
          'apps/web/package.json': JEST_MANIFEST,
          'apps/web/src/app.ts': 'export const app = 1;\n',
          'services/api/pyproject.toml': '[project]\nname = "api"\ndependencies = ["pytest"]\n',
          'services/api/src/handler.py': 'def handle():\n    return 1\n',
          'services/api/tests/test_handler.py':
            'from src.handler import handle\n\n\ndef test_handle():\n    assert handle() == 1\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'apps/web/src/app.ts': 'export const app = 2;\n',
          'services/api/src/handler.py': 'def handle():\n    return 2\n',
        },
      },
    ],
  },
  {
    name: 'unusual-filenames',
    summary: 'Paths with spaces, non-ASCII characters, dashes, and repeated dots.',
    covers: ['NUL-delimited parsing', 'argv boundary', 'no shell interpretation'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/a file with spaces.ts': 'export const spaced = 1;\n',
          'src/ünïcødé.ts': 'export const unicode = 1;\n',
          'src/--looks-like-a-flag.ts': 'export const flagLike = 1;\n',
          'src/dotted.name.spec.ts': 'export const dotted = 1;\n',
          "src/quote'and\"quote.ts": 'export const quoted = 1;\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/a file with spaces.ts': 'export const spaced = 2;\n',
          'src/ünïcødé.ts': 'export const unicode = 2;\n',
          'src/--looks-like-a-flag.ts': 'export const flagLike = 2;\n',
          "src/quote'and\"quote.ts": 'export const quoted = 2;\n',
        },
      },
    ],
  },
  {
    name: 'py-clean-docstring',
    summary: 'A docstring and a type hint added to an unchanged function body.',
    covers: ['clean change', 'no defect to find'],
    steps: [
      {
        write: {
          'pyproject.toml': PYPROJECT,
          '.gitignore': STANDARD_IGNORE,
          'src/tax.py': 'RATES = {"eu": 0.2, "us": 0.0}\n\n\ndef rate(region):\n    return RATES[region]\n',
          'tests/test_tax.py': 'from src.tax import rate\n\n\ndef test_rate():\n    assert rate("eu") == 0.2\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/tax.py':
            'RATES = {"eu": 0.2, "us": 0.0}\n\n\ndef rate(region: str) -> float:\n    """Return the VAT rate for a region."""\n    return RATES[region]\n',
        },
      },
    ],
  },
  {
    name: 'ts-off-by-one',
    summary: 'A pagination slice that drops the last item of every page.',
    covers: ['correctness defect', 'boundary not covered by the existing test'],
    steps: [
      {
        write: {
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          '.gitignore': STANDARD_IGNORE,
          'src/page.js':
            'module.exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);\n',
          'tests/page.test.js':
            "const { page } = require('../src/page');\n\ntest('first page', () => {\n  expect(page([1, 2, 3, 4], 0, 2)).toEqual([1, 2]);\n});\n",
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
    name: 'py-none-guard',
    summary: 'An optional lookup result is dereferenced after its guard is removed.',
    covers: ['correctness defect', 'error path'],
    steps: [
      {
        write: {
          'pyproject.toml': PYPROJECT,
          '.gitignore': STANDARD_IGNORE,
          'src/users.py':
            'def display_name(store, user_id):\n    user = store.get(user_id)\n    if user is None:\n        return "unknown"\n    return user["name"].strip()\n',
          'tests/test_users.py':
            'from src.users import display_name\n\n\ndef test_known():\n    assert display_name({1: {"name": " a "}}, 1) == "a"\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/users.py':
            'def display_name(store, user_id):\n    user = store.get(user_id)\n    return user["name"].strip()\n',
        },
      },
    ],
  },
  {
    name: 'py-source-regression',
    summary: 'A source-only change to a Python module that breaks an unchanged test.',
    covers: ['affected-test selection', 'unchanged regression test fails'],
    steps: [
      {
        write: {
          'pyproject.toml': PYPROJECT,
          '.gitignore': STANDARD_IGNORE,
          'src/money.py': 'def cents(amount):\n    return round(amount * 100)\n',
          'tests/test_money.py':
            'from src.money import cents\n\n\ndef test_cents():\n    assert cents(1.5) == 150\n',
        },
      },
      { commit: 'init' },
      { write: { 'src/money.py': 'def cents(amount):\n    return int(amount) * 100\n' } },
    ],
  },
  {
    name: 'ts-requirement-mismatch',
    summary: 'Retry logic that does not match the retry policy its requirement states.',
    covers: ['requirement mismatch', 'requirement evidence needed to judge'],
    steps: [
      {
        write: {
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          '.gitignore': STANDARD_IGNORE,
          'src/send.js': 'module.exports.send = async (call) => call();\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/send.js':
            'module.exports.send = async (call) => {\n  try {\n    return await call();\n  } catch {\n    return call();\n  }\n};\n',
        },
      },
    ],
  },
  {
    name: 'py-requirement-mismatch',
    summary: 'A negative amount is clamped to zero where the requirement says reject it.',
    covers: ['requirement mismatch', 'invalid input silently accepted'],
    steps: [
      {
        write: {
          'pyproject.toml': PYPROJECT,
          '.gitignore': STANDARD_IGNORE,
          'src/orders.py': 'def total(amount):\n    return amount\n',
        },
      },
      { commit: 'init' },
      { write: { 'src/orders.py': 'def total(amount):\n    return max(amount, 0)\n' } },
    ],
  },
  {
    name: 'ts-duplication',
    summary: 'A third copy of currency formatting rather than reuse of the existing helper.',
    covers: ['duplication', 'existing helper visible in sibling context'],
    steps: [
      {
        write: {
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          '.gitignore': STANDARD_IGNORE,
          'src/format.js': 'module.exports.currency = (cents) => `$${(cents / 100).toFixed(2)}`;\n',
          'src/invoice.js':
            "const { currency } = require('./format');\n\nmodule.exports.line = (cents) => `Total ${currency(cents)}`;\n",
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/receipt.js': 'module.exports.receipt = (cents) => `Paid $${(cents / 100).toFixed(2)}`;\n',
        },
      },
    ],
  },
  {
    name: 'py-complexity',
    summary: 'Nested conditionals replacing what a table lookup already expressed.',
    covers: ['unjustified complexity', 'behaviour unchanged'],
    steps: [
      {
        write: {
          'pyproject.toml': PYPROJECT,
          '.gitignore': STANDARD_IGNORE,
          'src/shipping.py':
            'COSTS = {"eu": 5, "us": 9, "apac": 14}\n\n\ndef cost(region):\n    return COSTS.get(region, 20)\n',
        },
      },
      { commit: 'init' },
      {
        write: {
          'src/shipping.py':
            'COSTS = {"eu": 5, "us": 9, "apac": 14}\n\n\ndef cost(region):\n    if region == "eu":\n        return 5\n    else:\n        if region == "us":\n            return 9\n        else:\n            if region == "apac":\n                return 14\n            else:\n                return 20\n',
        },
      },
    ],
  },
  {
    name: 'ts-feature-boundary',
    summary:
      'An invoice feature spread across a model, a service, a route and a test, with decoy files that only share the keyword.',
    covers: ['boundary shortlist', 'co-change signal', 'keyword decoys'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          'src/app.ts': "export const app = 'fixture';\n",
          // The users feature gives the repository history that has nothing to
          // do with invoices, so co-change has something to be wrong about.
          'src/users/model.ts': 'export interface User { id: string; name: string }\n',
          'src/users/service.ts':
            "import type { User } from './model.ts';\n\nexport const rename = (user: User, name: string): User => ({ ...user, name });\n",
          'src/routes/users.ts': "export const usersRoute = '/users';\n",
          'tests/users.test.ts':
            "import { rename } from '../src/users/service.ts';\n\ntest('renames', () => { expect(rename({ id: 'a', name: 'a' }, 'b').name).toBe('b'); });\n",
          // Decoys. Each carries the keyword and none of them belongs to the
          // boundary: one has it in its filename, two only in their prose.
          'src/legacy/invoice-export.ts':
            '// Retired in 2019; kept so the old invoice export links still resolve.\nexport const legacyInvoiceExport = null;\n',
          'src/reports/monthly.ts':
            '// Totals every invoice of the month, reading the reporting replica.\nexport const monthly = () => 0;\n',
          'docs/glossary.md': '# Glossary\n\n**Invoice** - what a customer is asked to pay.\n',
        },
      },
      { commit: 'init' },
      // The boundary arrives whole: model, service, route and test together.
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
      // Twice more, all four at once: that habit is the co-change signal.
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
      // Unrelated work last, so the newest commit is not the feature's.
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
    name: 'ts-locale-decoys',
    summary:
      "A ticket whose words live in a bulk-maintained translation family, while the code it is about spells those words as a path.",
    covers: ['boundary shortlist', 'prose decoys', 'term separator forms'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          'package.json': JEST_MANIFEST,
          'eslint.config.mjs': ESLINT_CONFIG,
          // The translation family. Every locale carries the ticket's own
          // words, and the export tooling rewrites the whole set together, so
          // they co-change perfectly and that tells nobody which one to open.
          ...localeFiles('250.5'),
          // The code the ticket is actually about. It never writes "Order/Refund":
          // a directory spells it `order-refund` and an identifier `orderRefund`.
          'src/features/orders/order-refund/services/order-refund-form.service.ts':
            "import { RefundThresholds } from '../../constants/refund-limits.constants.ts';\n\nexport const orderRefundForm = () => ({ refundLimit: RefundThresholds.max });\n",
          'src/features/orders/order-refund/services/order-refund-form.service.spec.ts':
            "import { orderRefundForm } from './order-refund-form.service.ts';\n\ntest('caps the refund limit', () => { expect(orderRefundForm().refundLimit).toBe(500); });\n",
          'src/features/orders/constants/refund-limits.constants.ts':
            'export const RefundThresholds = { min: 0.1, max: 500 };\n',
          // The trap an agent's own guessed term walks into: directories named
          // for the concept, holding nothing this ticket touches.
          'src/features/orders/validators/order-frequency.validators.ts':
            'export const frequency = () => null;\n',
          'src/validators/number.validators.ts': 'export const number = () => null;\n',
          ...fillerFiles(),
        },
      },
      { commit: 'init' },
      { write: localeFiles('500.0') },
      { commit: 'i18n: sync every locale from the export' },
      { write: localeFiles('500.0 EUR') },
      { commit: 'i18n: sync every locale from the export again' },
      {
        write: {
          'src/features/orders/constants/refund-limits.constants.ts':
            'export const RefundThresholds = { min: 0.1, max: 500.0 };\n',
          'src/features/orders/order-refund/services/order-refund-form.service.spec.ts':
            "import { orderRefundForm } from './order-refund-form.service.ts';\n\ntest('caps the refund limit', () => { expect(orderRefundForm().refundLimit).toBe(500.0); });\n",
        },
      },
      { commit: 'orders: restate the refund limit' },
    ],
  },
  {
    name: 'polyglot-spellings',
    summary:
      'One name, written the way five ecosystems write it, under five unrelated roots.',
    covers: ['boundary shortlist', 'term separator forms', 'language independence'],
    steps: [
      {
        write: {
          '.gitignore': STANDARD_IGNORE,
          // Python: a snake_case package directory.
          'services/order_refund/refund_limits.py':
            'ORDER_REFUND_MAX = 500.0\n\n\ndef refund_limit():\n    return ORDER_REFUND_MAX\n',
          // Java: a package directory with the separator dropped entirely.
          'platform/src/main/java/com/acme/orderrefund/RefundLimits.java':
            'package com.acme.orderrefund;\n\npublic final class RefundLimits {\n  public static final double MAX = 500.0;\n}\n',
          // Go: one lowercase word for the package, CamelCase for the export.
          'internal/orderrefund/limits.go': 'package orderrefund\n\nconst OrderRefundMax = 500.0\n',
          // C: a snake_case directory and an upper-snake macro.
          'lib/order_refund/limits.c':
            '#define ORDER_REFUND_MAX 500.0\n\ndouble order_refund_max(void) { return ORDER_REFUND_MAX; }\n',
          // Ruby: a hyphenated directory, which no compiler asks for and many
          // projects use anyway.
          'app/order-refund/limits.rb': 'module OrderRefund\n  MAX = 500.0\nend\n',
          ...polyglotFiller(),
        },
      },
      { commit: 'init' },
    ],
  },
  {
    name: 'py-no-runner',
    summary: 'A Python project with no test runner and no linter installed.',
    covers: ['null commands', 'skipped checks with notices'],
    steps: [
      {
        write: {
          'pyproject.toml': '[project]\nname = "bare"\nversion = "0.0.0"\n',
          '.gitignore': STANDARD_IGNORE,
          'src/thing.py': 'def thing():\n    return 1\n',
        },
      },
      { commit: 'init' },
      { write: { 'src/thing.py': 'def thing():\n    return 2\n' } },
    ],
  },
];

export function fixtureByName(name) {
  return FIXTURES.find((fixture) => fixture.name === name) ?? null;
}
