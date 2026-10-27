/** A small service repository for the plan and rules policy cases (evals/scripts/rules-cases.mjs). */
const BASE = {
  '.gitignore': 'node_modules/\n',
  'package.json': `${JSON.stringify({ name: 'ledgerly', private: true, devDependencies: { jest: '^30.0.0' } }, null, 2)}\n`,
  'src/models/invoice.ts': 'export interface Invoice {\n  readonly id: string;\n  readonly cents: number;\n  readonly paid: boolean;\n}\n',
  'src/models/payment.ts': 'export interface Payment {\n  readonly invoiceId: string;\n  readonly cents: number;\n}\n',
  'src/stores/invoice-store.ts': "import type { Invoice } from '../models/invoice.ts';\n\nconst rows = new Map<string, Invoice>();\n\nexport const saveInvoice = (invoice: Invoice): void => {\n  rows.set(invoice.id, invoice);\n};\n\nexport const findInvoice = (id: string): Invoice | undefined => rows.get(id);\n",
  'src/services/payments.ts': "import type { Payment } from '../models/payment.ts';\nimport { findInvoice, saveInvoice } from '../stores/invoice-store.ts';\n\nexport const applyPayment = (payment: Payment): boolean => {\n  const invoice = findInvoice(payment.invoiceId);\n  if (invoice === undefined) return false;\n  saveInvoice({ ...invoice, paid: payment.cents >= invoice.cents });\n  return true;\n};\n",
  'src/services/invoices.ts': "import type { Invoice } from '../models/invoice.ts';\nimport { saveInvoice } from '../stores/invoice-store.ts';\n\nexport const createInvoice = (id: string, cents: number): Invoice => {\n  const invoice = { id, cents, paid: false };\n  saveInvoice(invoice);\n  return invoice;\n};\n",
  'tests/payments.test.ts': "import { createInvoice } from '../src/services/invoices.ts';\nimport { applyPayment } from '../src/services/payments.ts';\n\ntest('a full payment settles the invoice', () => {\n  createInvoice('a', 100);\n  expect(applyPayment({ invoiceId: 'a', cents: 100 })).toBe(true);\n});\n",
  'tests/invoices.test.ts': "import { createInvoice } from '../src/services/invoices.ts';\n\ntest('a new invoice is unpaid', () => {\n  expect(createInvoice('b', 50).paid).toBe(false);\n});\n",
};

const CONTRIBUTING = [
  '# Contributing',
  '',
  '## Services',
  '',
  '- Every call a service makes to the payments gateway goes through the shared `withTimeout` helper.',
  '',
  '## Models',
  '',
  '- Model fields are `readonly`; a change builds a new object instead of mutating one.',
  '',
  '## Tests',
  '',
  '- A bug fix lands together with a regression test whose name starts with the ticket id, such as `PAY-123`.',
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
].join('\n');

// Claude Code loads this file itself, so no rule may be drafted from it (case rules-draft-sources).
const CLAUDE = '# Notes\n\n- Log lines never include an invoice total, only its id.\n';

export const POLICY_FIXTURES = [
  { name: 'policy-ledgerly', steps: [{ write: BASE }, { commit: 'init' }] },
  { name: 'policy-contributing', steps: [{ write: { ...BASE, 'CONTRIBUTING.md': CONTRIBUTING, 'CLAUDE.md': CLAUDE } }, { commit: 'init' }] },
];
