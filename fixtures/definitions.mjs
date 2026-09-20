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
