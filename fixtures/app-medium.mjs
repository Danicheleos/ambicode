/**
 * Source of the ts-app-medium fixtures (definitions.mjs): a small billing service, plain CommonJS so that jest runs
 * it with no build step, like eval-page-bug. `npm test` passes on APP_FILES. The two fixtures built on it:
 *   ts-app-medium             APP_FILES as committed.
 *   ts-app-medium-refund-bug  APP_REFUND_BUG replaces six files in the commits (the tests that would have caught it are absent).
 *   ts-app-medium-deep        APP_DEEP, the investigate variant; ts-app-medium-plan  APP_PLAN, the plan variant (npm test passes on it).
 * Edit this file by hand; the content has no generator. Template literals use BT for a backtick.
 */
const BT = '`';
const raw = String.raw;

export const APP_FILES = {
  "CONTRIBUTING.md": raw`# Contributing

## Conventions

- **Errors.** Throw an ${BT}AppError${BT} subclass from ${BT}src/shared/errors${BT} (${BT}ValidationError${BT}, ${BT}NotFoundError${BT},
  ${BT}ConflictError${BT}, ${BT}PaymentError${BT}). Never ${BT}throw new Error(...)${BT}: the HTTP layer turns anything that is not an
  ${BT}AppError${BT} into an opaque 500. Lint warns on a bare ${BT}Error${BT}; treat the warning as a failure.
- **Validation.** Validate input with the validators in ${BT}src/shared/validation${BT} (${BT}validateDate${BT}, ${BT}validateRange${BT},
  ${BT}validateCents${BT}, ...). Do not write a new date, range or amount check in a service.
- **Money.** Money is integer cents everywhere. Use ${BT}src/shared/money${BT} for rounding, percentages, splitting and
  formatting. No floating-point amounts, no ${BT}toFixed${BT} outside formatting.
- **Layers.** routes call services, services call repositories. Routes hold no rules and repositories hold no
  business decisions. Features talk to each other through services, or through events on ${BT}src/shared/events${BT}
  when the other side must not be a dependency.
- **Legacy.** ${BT}src/legacy/${BT} is frozen. Do not edit it and do not copy from it.
- **Flags.** New behaviour that is not ready for everyone goes behind a flag in ${BT}src/flags.js${BT}.

## Tests

- Every behaviour change ships with a jest test next to the existing ones for that module.
- Build customers, invoices and payments with ${BT}tests/factory.js${BT}, not with inline object literals.
- ${BT}tests/setup.js${BT} resets the store, the flags, the clock and the bus before each test; do not reset them by hand.

## Commits

One change per commit, message in the imperative: ${BT}invoices: reject a negative amount${BT}.
`,
  "README.md": raw`# Billing service

In-memory billing API: customers, invoices, payments, notifications and reports. Handlers are plain
functions that take ${BT}{ params, query, body }${BT} and return ${BT}{ status, body }${BT}; ${BT}src/app.js${BT} mounts them.

${BT}${BT}${BT}
src/
  <feature>/            invoices, customers, payments, notifications, reports
    routes.js           HTTP handlers (thin, no logic)
    service.js          rules and orchestration
    repository.js       storage access (db/ tables)
    model.js            record constructors
  shared/               money, validation, errors, event bus, clock, ids, logger, pagination, http
  db/                   in-memory tables
  flags.js              feature flags
  legacy/               frozen code from before the rewrite; do not extend
tests/                  jest; build data with tests/factory.js
${BT}${BT}${BT}

Run ${BT}npm test${BT} for the suite and ${BT}npm run lint${BT} for the lint. Read ${BT}CONTRIBUTING.md${BT} before changing code.
`,
  "docs/architecture.md": raw`# Architecture notes

## Request flow

A request is routed by ${BT}src/app.js${BT} to a feature's ${BT}routes.js${BT}. The handler is wrapped by ${BT}shared/http.handle${BT}, which
turns a thrown ${BT}AppError${BT} into its status and anything else into a logged 500.

## Events

Features that must not depend on each other talk over ${BT}src/shared/events/bus.js${BT}. Topics are listed in
${BT}src/shared/events/topics.js${BT}. A subscriber that throws is logged and skipped; the publisher never sees the failure.
Subscribers are registered once, at start-up, by each feature's ${BT}index.js${BT} (see ${BT}notifications/index.js${BT}).

## Money

Cents as integers. ${BT}shared/money.round${BT} rounds half up.

## Flags

${BT}src/flags.js${BT} holds the defaults. ${BT}legacyTotals${BT} only matters to the frozen CSV export in ${BT}src/legacy${BT}.
`,
  "eslint.config.mjs": raw`export default [
  { ignores: ['src/legacy/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      // CONTRIBUTING.md: a warning today because the older services still carry a few; reviewers treat it as an error.
      'no-restricted-syntax': [
        'warn',
        { selector: "ThrowStatement > NewExpression[callee.name='Error']", message: 'Throw an AppError subclass from src/shared/errors, not a bare Error.' },
      ],
    },
  },
];
`,
  "src/app.js": raw`const { bus } = require('./shared/events/bus');
const notifications = require('./notifications');

const features = [require('./customers'), require('./invoices'), require('./payments'), notifications, require('./reports')];

// ':name' segments become params.
function compile(path) {
  const names = [];
  const pattern = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_, name) => { names.push(name); return '([^/]+)'; }) + '$');
  return { pattern, names };
}

function createApp({ eventBus = bus } = {}) {
  notifications.register(eventBus);
  const table = features.flatMap((feature) => feature.routes).map((route) => ({ ...route, ...compile(route.path) }));
  return {
    request(method, path, { query = {}, body = {} } = {}) {
      for (const route of table) {
        const match = route.method === method ? route.pattern.exec(path) : null;
        if (match === null) continue;
        const params = Object.fromEntries(route.names.map((name, index) => [name, match[index + 1]]));
        return route.handler({ params, query, body });
      }
      return { status: 404, body: { error: { code: 'not_found', message: method + ' ' + path } } };
    },
  };
}

module.exports = { createApp };
`,
  "src/config.js": raw`module.exports = Object.freeze({
  pageSize: 20,
  maxLinesPerInvoice: 50,
  agingBucketsDays: [30, 60],
  receiptFrom: 'billing@example.invalid',
});
`,
  "src/customers/index.js": raw`module.exports = { ...require('./service'), routes: require('./routes').routes };
`,
  "src/customers/model.js": raw`function createCustomer({ id, name, email, phone = null, receipts = true, createdAt }) {
  return { id, name, email, phone, receipts, createdAt };
}

module.exports = { createCustomer };
`,
  "src/customers/repository.js": raw`const db = require('../db');

const rows = () => db.table('customers');

const insert = (customer) => { rows().set(customer.id, customer); return customer; };
const get = (id) => rows().get(id) || null;
const list = () => Array.from(rows().values());
const findByEmail = (email) => list().find((customer) => customer.email === email) || null;
const update = (id, patch) => {
  const next = { ...rows().get(id), ...patch };
  rows().set(id, next);
  return next;
};

module.exports = { insert, get, list, findByEmail, update };
`,
  "src/customers/routes.js": raw`const service = require('./service');
const { handle, ok, created } = require('../shared/http');

const create = handle((req) => created(service.create(req.body)));
const get = handle((req) => ok(service.get(req.params.customerId)));
const list = handle((req) => ok(req.query.q ? service.search(req.query.q) : service.list()));
const update = handle((req) => ok(service.update(req.params.customerId, req.body)));

module.exports = {
  create,
  get,
  list,
  update,
  routes: [
    { method: 'POST', path: '/customers', handler: create },
    { method: 'GET', path: '/customers/:customerId', handler: get },
    { method: 'GET', path: '/customers', handler: list },
    { method: 'PATCH', path: '/customers/:customerId', handler: update },
  ],
};
`,
  "src/customers/segments.js": raw`const invoices = require('../invoices/service');
const { plural } = require('../shared/strings');
const money = require('../shared/money');

const THRESHOLDS = Object.freeze({ gold: 500000, silver: 100000 });

// Lifetime billed amount of a customer, in cents.
function lifetimeCents(customerId) {
  return money.sum(invoices.list({ customerId }).map(invoices.total));
}

function segmentOf(customerId) {
  const cents = lifetimeCents(customerId);
  if (cents >= THRESHOLDS.gold) return 'gold';
  if (cents >= THRESHOLDS.silver) return 'silver';
  return 'standard';
}

function describe(customerId) {
  const count = invoices.list({ customerId }).length;
  return segmentOf(customerId) + ' customer with ' + plural(count, 'invoice');
}

module.exports = { THRESHOLDS, lifetimeCents, segmentOf, describe };
`,
  "src/customers/service.js": raw`const repository = require('./repository');
const { createCustomer } = require('./model');
const { validateString, validateEmail } = require('../shared/validation');
const { NotFoundError, ConflictError } = require('../shared/errors');
const { nextId } = require('../shared/ids');
const clock = require('../shared/clock');

function create(input) {
  const email = validateEmail(input.email);
  if (repository.findByEmail(email) !== null) throw new ConflictError('a customer with this email exists', { email });
  return repository.insert(
    createCustomer({
      id: nextId('cus'),
      name: validateString(input.name, 'name'),
      email,
      phone: input.phone || null,
      receipts: input.receipts !== false,
      createdAt: clock.now().toISOString(),
    }),
  );
}

function get(id) {
  const customer = repository.get(id);
  if (customer === null) throw new NotFoundError('customer', id);
  return customer;
}

function list() {
  return repository.list();
}

// What a message needs to reach the customer, and whether they want receipts at all.
function contactFor(id) {
  const { name, email, phone, receipts } = get(id);
  return { name, email, phone, receipts };
}

function setReceipts(id, receipts) {
  get(id);
  return repository.update(id, { receipts: receipts === true });
}

// Case-insensitive match on name or email.
function search(text) {
  const needle = validateString(text, 'text').toLowerCase();
  return repository.list().filter((customer) => customer.name.toLowerCase().includes(needle) || customer.email.includes(needle));
}

function update(id, patch) {
  get(id);
  const next = {};
  if (patch.name !== undefined) next.name = validateString(patch.name, 'name');
  if (patch.email !== undefined) {
    next.email = validateEmail(patch.email);
    const other = repository.findByEmail(next.email);
    if (other !== null && other.id !== id) throw new ConflictError('a customer with this email exists', { email: next.email });
  }
  if (patch.phone !== undefined) next.phone = patch.phone;
  return repository.update(id, next);
}

module.exports = { create, get, list, search, update, contactFor, setReceipts };
`,
  "src/db/index.js": raw`const store = require('./store');
const ids = require('../shared/ids');

// Tests call this between cases.
function reset() {
  store.reset();
  ids.reset();
}

module.exports = { table: store.table, reset };
`,
  "src/db/store.js": raw`// An in-memory table per name; repositories own the queries, this owns the storage.
const tables = new Map();

function table(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}

function reset() {
  for (const rows of tables.values()) rows.clear();
}

module.exports = { table, reset };
`,
  "src/flags.js": raw`// Feature flags, read once from the defaults below; tests flip them with set().
const DEFAULTS = {
  receiptEmails: true,
  smsReceipts: false,
  overdueReminders: false,
  legacyTotals: false,
};

let current = { ...DEFAULTS };

const isEnabled = (name) => current[name] === true;
const set = (name, value) => { current[name] = value; };
const reset = () => { current = { ...DEFAULTS }; };

module.exports = { DEFAULTS, isEnabled, set, reset };
`,
  "src/invoices/index.js": raw`module.exports = { ...require('./service'), routes: require('./routes').routes };
`,
  "src/invoices/lines.js": raw`const money = require('../shared/money');

const lineTotal = (line) => line.quantity * line.unitCents;
const subtotal = (lines) => money.sum(lines.map(lineTotal));

module.exports = { lineTotal, subtotal };
`,
  "src/invoices/model.js": raw`const { STATUS } = require('./status');

function createInvoice({ id, customerId, lines, taxBps = 0, issuedAt, status = STATUS.OPEN, paidCents = 0, notes = '' }) {
  return { id, customerId, lines, taxBps, issuedAt, status, paidCents, notes };
}

module.exports = { createInvoice };
`,
  "src/invoices/repository.js": raw`const db = require('../db');

const rows = () => db.table('invoices');

const insert = (invoice) => { rows().set(invoice.id, invoice); return invoice; };
const get = (id) => rows().get(id) || null;
const list = ({ customerId, status } = {}) =>
  Array.from(rows().values()).filter(
    (invoice) => (customerId === undefined || invoice.customerId === customerId) && (status === undefined || invoice.status === status),
  );
const update = (id, patch) => {
  const next = { ...rows().get(id), ...patch };
  rows().set(id, next);
  return next;
};

module.exports = { insert, get, list, update };
`,
  "src/invoices/routes.js": raw`const service = require('./service');
const { handle, ok, created } = require('../shared/http');
const { paginate } = require('../shared/pagination');

const create = handle((req) => created({ ...service.create(req.body) }));
const get = handle((req) => {
  const invoice = service.get(req.params.invoiceId);
  return ok({ ...invoice, totalCents: service.total(invoice) });
});
const list = handle((req) => ok(paginate(service.list(req.query), req.query)));
const voidInvoice = handle((req) => ok(service.voidInvoice(req.params.invoiceId)));

module.exports = {
  create,
  get,
  list,
  voidInvoice,
  routes: [
    { method: 'POST', path: '/invoices', handler: create },
    { method: 'GET', path: '/invoices/:invoiceId', handler: get },
    { method: 'GET', path: '/invoices', handler: list },
    { method: 'POST', path: '/invoices/:invoiceId/void', handler: voidInvoice },
  ],
};
`,
  "src/invoices/search.js": raw`const repository = require('./repository');
const service = require('./service');
const { validateRange } = require('../shared/validation');

// Free-text and amount-range filter over the stored invoices; the text matches notes and line descriptions.
function search({ text = '', minCents, maxCents } = {}) {
  if (minCents !== undefined && maxCents !== undefined) validateRange(maxCents, { min: minCents }, 'maxCents');
  const needle = text.trim().toLowerCase();
  return repository.list().filter((invoice) => {
    const haystack = [invoice.notes, ...invoice.lines.map((line) => line.description)].join(' ').toLowerCase();
    if (needle !== '' && !haystack.includes(needle)) return false;
    const total = service.total(invoice);
    return (minCents === undefined || total >= minCents) && (maxCents === undefined || total <= maxCents);
  });
}

module.exports = { search };
`,
  "src/invoices/service.js": raw`const repository = require('./repository');
const customers = require('../customers/service');
const notifications = require('../notifications/service');
const { createInvoice } = require('./model');
const { STATUS, statusFor } = require('./status');
const { subtotal } = require('./lines');
const money = require('../shared/money');
const clock = require('../shared/clock');
const config = require('../config');
const { nextId } = require('../shared/ids');
const { bus } = require('../shared/events/bus');
const TOPICS = require('../shared/events/topics');
const { NotFoundError, ConflictError, ValidationError } = require('../shared/errors');
const { validateString, validateDate, validateRange, validateCents } = require('../shared/validation');

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('lines', 'needs at least one line');
  validateRange(lines.length, { max: config.maxLinesPerInvoice }, 'lines');
  return lines.map((line, index) => ({
    description: validateString(line.description, 'lines[' + index + '].description'),
    quantity: validateRange(line.quantity, { min: 1, max: 1000 }, 'lines[' + index + '].quantity'),
    unitCents: validateCents(line.unitCents, 'lines[' + index + '].unitCents'),
  }));
}

function create(input) {
  customers.get(input.customerId);
  const invoice = repository.insert(
    createInvoice({
      id: nextId('inv'),
      customerId: input.customerId,
      lines: validateLines(input.lines),
      taxBps: validateRange(input.taxBps === undefined ? 0 : input.taxBps, { min: 0, max: 10000 }, 'taxBps'),
      issuedAt: validateDate(input.issuedAt === undefined ? clock.today() : input.issuedAt, 'issuedAt'),
      notes: input.notes || '',
    }),
  );
  bus.emit(TOPICS.INVOICE_CREATED, { invoiceId: invoice.id, customerId: invoice.customerId });
  // The invoice-created mail.
  notifications.sendInvoiceCreated(invoice, total(invoice));
  return invoice;
}

function get(id) {
  const invoice = repository.get(id);
  if (invoice === null) throw new NotFoundError('invoice', id);
  return invoice;
}

function list(filter) {
  return repository.list(filter);
}

function taxFor(invoice) {
  return money.round((subtotal(invoice.lines) * invoice.taxBps) / 10000);
}

// The amount the customer owes: subtotal plus tax, in cents.
function total(invoice) {
  return subtotal(invoice.lines) + taxFor(invoice);
}

function outstanding(invoice) {
  return total(invoice) - invoice.paidCents;
}

// Brings the status in line with the net amount paid so far.
function syncStatus(id, netPaidCents) {
  const invoice = get(id);
  if (invoice.status === STATUS.VOID) throw new ConflictError('invoice ' + id + ' is void', { id });
  return repository.update(id, { paidCents: netPaidCents, status: statusFor(total(invoice), netPaidCents) });
}

function voidInvoice(id) {
  const invoice = get(id);
  if (invoice.paidCents > 0) throw new ConflictError('invoice ' + id + ' has payments', { id });
  return repository.update(id, { status: STATUS.VOID });
}

module.exports = { create, get, list, taxFor, total, outstanding, syncStatus, voidInvoice };
`,
  "src/invoices/status.js": raw`const STATUS = Object.freeze({
  OPEN: 'open',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  REFUNDED: 'refunded',
  VOID: 'void',
});

// netPaidCents is payments minus refunds.
function statusFor(totalCents, netPaidCents) {
  if (netPaidCents <= 0) return STATUS.OPEN;
  if (netPaidCents < totalCents) return STATUS.PARTIALLY_PAID;
  return STATUS.PAID;
}

module.exports = { STATUS, statusFor };
`,
  "src/invoices/summary.js": raw`const service = require('./service');
const { subtotal } = require('./lines');
const { STATUS } = require('./status');

// The read model the routes and the exports print: every number an invoice page shows, in cents.
function summarize(invoice) {
  const totalCents = service.total(invoice);
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    status: invoice.status,
    lineCount: invoice.lines.length,
    subtotalCents: subtotal(invoice.lines),
    taxCents: service.taxFor(invoice),
    totalCents,
    paidCents: invoice.paidCents,
    outstandingCents: invoice.status === STATUS.VOID ? 0 : totalCents - invoice.paidCents,
  };
}

module.exports = { summarize };
`,
  "src/legacy/invoice-export.js": raw`// Frozen: CSV export for the accounting import that was retired in 2024. Not mounted in app.js.
const flags = require('../flags');
const { total } = require('./invoice-total');

function exportCsv(invoices) {
  if (!flags.isEnabled('legacyTotals')) throw new Error('legacy export is switched off');
  return invoices.map((invoice) => [invoice.id, invoice.customerId, total(invoice).toFixed(2)].join(',')).join('\n');
}

module.exports = { exportCsv };
`,
  "src/legacy/invoice-total.js": raw`// Frozen: the 2023 total, in floating-point major units. Only the CSV export below still calls it,
// behind the legacyTotals flag. New code uses invoices/service.total (integer cents).
function total(invoice) {
  let sum = 0;
  for (const line of invoice.lines) sum += line.quantity * (line.unitCents / 100);
  sum += sum * (invoice.taxBps / 10000);
  return Math.round(sum * 100) / 100;
}

module.exports = { total };
`,
  "src/legacy/payment-hooks.js": raw`// Frozen: the receipt mail as it was before the event bus.
const channels = require('../notifications/channels');

function notifyPaymentLegacy(payment, customer) {
  channels.email.send({
    to: customer.email,
    subject: 'Payment received',
    body: 'We received ' + payment.amountCents / 100 + ' for invoice ' + payment.invoiceId,
  });
}

module.exports = { notifyPaymentLegacy };
`,
  "src/notifications/channels.js": raw`const config = require('../config');

// Stand-in for the mail and SMS gateways: delivery is appending to an outbox the tests can read.
const sent = [];

const email = {
  send({ to, subject, body }) {
    sent.push({ channel: 'email', from: config.receiptFrom, to, subject, body });
    return { delivered: true };
  },
};

const sms = {
  send({ to, body }) {
    sent.push({ channel: 'sms', to, body });
    return { delivered: true };
  },
};

const outbox = () => sent.slice();
const clearOutbox = () => { sent.length = 0; };

module.exports = { email, sms, outbox, clearOutbox };
`,
  "src/notifications/handlers.js": raw`const service = require('./service');
const templates = require('./templates');
const customers = require('../customers/service');
const flags = require('../flags');
const logger = require('../shared/logger');

// Subscriber of payment.received: mails the customer a receipt.
function onPaymentReceived(event) {
  if (!flags.isEnabled('receiptEmails')) return null;
  const contact = customers.contactFor(event.customerId);
  if (!contact.receipts) return null;
  const message = templates.paymentReceipt({
    customerName: contact.name,
    invoiceId: event.invoiceId,
    amountCents: event.amountCents,
    balanceCents: event.balanceCents,
  });
  if (flags.isEnabled('smsReceipts') && contact.phone) {
    service.deliver({ customerId: event.customerId, channel: 'sms', template: 'payment-receipt', message });
  }
  return service.deliver({ customerId: event.customerId, channel: 'email', template: 'payment-receipt', message });
}

// Refunds are only logged for now; no customer mail.
function onPaymentRefunded(event) {
  logger.info('payment refunded', { invoiceId: event.invoiceId, amountCents: event.amountCents });
  return null;
}

module.exports = { onPaymentReceived, onPaymentRefunded };
`,
  "src/notifications/index.js": raw`const handlers = require('./handlers');
const TOPICS = require('../shared/events/topics');

// Subscribes the notification handlers to the bus.
function register(eventBus) {
  const off = [
    eventBus.on(TOPICS.PAYMENT_RECEIVED, handlers.onPaymentReceived),
    eventBus.on(TOPICS.PAYMENT_REFUNDED, handlers.onPaymentRefunded),
  ];
  return () => off.forEach((unsubscribe) => unsubscribe());
}

module.exports = { register, routes: require('./routes').routes };
`,
  "src/notifications/model.js": raw`function createNotification({ id, customerId, channel, template, subject, body, status, sentAt }) {
  return { id, customerId, channel, template, subject, body, status, sentAt };
}

module.exports = { createNotification };
`,
  "src/notifications/queue.js": raw`// Messages that failed to leave are parked here and retried by flush(), e.g. from a scheduled job.
const channels = require('./channels');
const { retry } = require('../shared/retry');
const logger = require('../shared/logger');
const { AppError } = require('../shared/errors');

const pending = [];

const enqueue = (channel, message) => { pending.push({ channel, message, attempts: 0 }); return pending.length; };
const size = () => pending.length;
const clear = () => { pending.length = 0; };

// Returns how many messages went out; the rest stay queued with their attempt count raised.
function flush() {
  let delivered = 0;
  for (const entry of pending.splice(0)) {
    try {
      retry(() => {
        const result = channels[entry.channel].send(entry.message);
        if (!result.delivered) throw new AppError('gateway_refused', 'gateway refused', { status: 502 });
      }, { attempts: 2, onFailure: () => { entry.attempts += 1; } });
      delivered += 1;
    } catch (error) {
      logger.warn('delivery failed, kept in the queue', { channel: entry.channel, reason: error.message });
      pending.push(entry);
    }
  }
  return delivered;
}

module.exports = { enqueue, size, clear, flush };
`,
  "src/notifications/repository.js": raw`const db = require('../db');

const rows = () => db.table('notifications');

const insert = (notification) => { rows().set(notification.id, notification); return notification; };
const list = () => Array.from(rows().values());
const forCustomer = (customerId) => list().filter((notification) => notification.customerId === customerId);

module.exports = { insert, list, forCustomer };
`,
  "src/notifications/routes.js": raw`const service = require('./service');
const { handle, ok } = require('../shared/http');

const forCustomer = handle((req) => ok(service.forCustomer(req.params.customerId)));

module.exports = {
  forCustomer,
  routes: [{ method: 'GET', path: '/customers/:customerId/notifications', handler: forCustomer }],
};
`,
  "src/notifications/service.js": raw`const repository = require('./repository');
const channels = require('./channels');
const templates = require('./templates');
const customers = require('../customers/service');
const { createNotification } = require('./model');
const { nextId } = require('../shared/ids');
const clock = require('../shared/clock');

// Sends one rendered message to a customer and keeps a record of it.
function deliver({ customerId, channel, template, message }) {
  const contact = customers.contactFor(customerId);
  const result = channels[channel].send({ to: channel === 'sms' ? contact.phone : contact.email, ...message });
  return repository.insert(
    createNotification({
      id: nextId('ntf'),
      customerId,
      channel,
      template,
      subject: message.subject || '',
      body: message.body,
      status: result.delivered ? 'sent' : 'failed',
      sentAt: clock.now().toISOString(),
    }),
  );
}

function sendInvoiceCreated(invoice, totalCents) {
  const contact = customers.contactFor(invoice.customerId);
  const message = templates.invoiceCreated({ customerName: contact.name, invoiceId: invoice.id, totalCents });
  return deliver({ customerId: invoice.customerId, channel: 'email', template: 'invoice-created', message });
}

function forCustomer(customerId) {
  customers.get(customerId);
  return repository.forCustomer(customerId);
}

module.exports = { deliver, sendInvoiceCreated, forCustomer };
`,
  "src/notifications/templates.js": raw`const money = require('../shared/money');

function paymentReceipt({ customerName, invoiceId, amountCents, balanceCents }) {
  const closing = balanceCents === 0 ? 'The invoice is now paid in full.' : 'Remaining balance: ' + money.format(balanceCents) + '.';
  return {
    subject: 'Receipt for invoice ' + invoiceId,
    body: 'Hello ' + customerName + ', we received your payment of ' + money.format(amountCents) + '. ' + closing,
  };
}

function invoiceCreated({ customerName, invoiceId, totalCents }) {
  return {
    subject: 'Invoice ' + invoiceId,
    body: 'Hello ' + customerName + ', invoice ' + invoiceId + ' for ' + money.format(totalCents) + ' is ready.',
  };
}

module.exports = { paymentReceipt, invoiceCreated };
`,
  "src/payments/index.js": raw`module.exports = { ...require('./service'), routes: require('./routes').routes };
`,
  "src/payments/installments.js": raw`// A payment plan: the balance cut into equal monthly parts. Each installment carries its own dueDate.
const money = require('../shared/money');
const { validateDate, validateRange, validateCents } = require('../shared/validation');

function addMonths(day, months) {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

function schedule({ balanceCents, count, firstDueDate }) {
  validateCents(balanceCents, 'balanceCents');
  validateRange(count, { min: 2, max: 24 }, 'count');
  const first = validateDate(firstDueDate, 'firstDueDate');
  return money.split(balanceCents, count).map((amountCents, index) => ({
    number: index + 1,
    dueDate: addMonths(first, index),
    amountCents,
    paid: false,
  }));
}

// The first unpaid installment due on or before the given day, or null.
function nextDue(plan, day) {
  return plan.find((part) => !part.paid && part.dueDate <= day) || null;
}

module.exports = { addMonths, schedule, nextDue };
`,
  "src/payments/methods.js": raw`const { ValidationError } = require('../shared/errors');

const METHODS = Object.freeze(['card', 'bank_transfer', 'cash']);

function validateMethod(value) {
  if (!METHODS.includes(value)) throw new ValidationError('method', 'must be one of ' + METHODS.join(', '));
  return value;
}

module.exports = { METHODS, validateMethod };
`,
  "src/payments/model.js": raw`const KIND = Object.freeze({ PAYMENT: 'payment', REFUND: 'refund' });

// amountCents is always positive; kind says whether it came in or went back out.
function createPayment({ id, invoiceId, kind = KIND.PAYMENT, amountCents, method = null, reference = '', recordedAt }) {
  return { id, invoiceId, kind, amountCents, method, reference, recordedAt };
}

module.exports = { KIND, createPayment };
`,
  "src/payments/repository.js": raw`const db = require('../db');
const { KIND } = require('./model');

const rows = () => db.table('payments');

const insert = (payment) => { rows().set(payment.id, payment); return payment; };
const get = (id) => rows().get(id) || null;
const list = () => Array.from(rows().values());
const forInvoice = (invoiceId) => list().filter((payment) => payment.invoiceId === invoiceId);

// Payments minus refunds, in cents.
function netPaidCents(invoiceId) {
  return forInvoice(invoiceId).reduce(
    (net, payment) => net + (payment.kind === KIND.REFUND ? -payment.amountCents : payment.amountCents),
    0,
  );
}

module.exports = { insert, get, list, forInvoice, netPaidCents };
`,
  "src/payments/routes.js": raw`const service = require('./service');
const { handle, ok, created } = require('../shared/http');

const record = handle((req) => created(service.recordPayment({ ...req.body, invoiceId: req.params.invoiceId })));
const refund = handle((req) => created(service.refund({ ...req.body, invoiceId: req.params.invoiceId })));
const list = handle((req) => ok(service.forInvoice(req.params.invoiceId)));

module.exports = {
  record,
  refund,
  list,
  routes: [
    { method: 'POST', path: '/invoices/:invoiceId/payments', handler: record },
    { method: 'POST', path: '/invoices/:invoiceId/refunds', handler: refund },
    { method: 'GET', path: '/invoices/:invoiceId/payments', handler: list },
  ],
};
`,
  "src/payments/service.js": raw`const repository = require('./repository');
const invoices = require('../invoices/service');
const { createPayment, KIND } = require('./model');
const { validateMethod } = require('./methods');
const { STATUS } = require('../invoices/status');
const { PaymentError, ConflictError } = require('../shared/errors');
const { validateCents, validateString } = require('../shared/validation');
const { bus } = require('../shared/events/bus');
const TOPICS = require('../shared/events/topics');
const { nextId } = require('../shared/ids');
const clock = require('../shared/clock');

// Stores the payment, brings the invoice status up to date and announces it.
function recordPayment({ invoiceId, amountCents, method, reference = '' }) {
  validateCents(amountCents, 'amountCents');
  validateMethod(method);
  const invoice = invoices.get(invoiceId);
  if (invoice.status === STATUS.VOID) throw new ConflictError('invoice ' + invoiceId + ' is void', { invoiceId });
  const balanceBefore = invoices.outstanding(invoice);
  if (amountCents > balanceBefore) {
    throw new PaymentError('payment exceeds the balance of ' + balanceBefore + ' cents', { invoiceId, balanceBefore });
  }
  const payment = repository.insert(
    createPayment({ id: nextId('pay'), invoiceId, amountCents, method, reference: validateString(reference, 'reference', { min: 0 }), recordedAt: clock.now().toISOString() }),
  );
  const updated = invoices.syncStatus(invoiceId, repository.netPaidCents(invoiceId));
  bus.emit(TOPICS.PAYMENT_RECEIVED, {
    paymentId: payment.id,
    invoiceId,
    customerId: invoice.customerId,
    amountCents,
    balanceCents: invoices.outstanding(updated),
  });
  return payment;
}

function refund({ invoiceId, amountCents, reference = '' }) {
  validateCents(amountCents, 'amountCents');
  const invoice = invoices.get(invoiceId);
  const net = repository.netPaidCents(invoiceId);
  if (amountCents > net) {
    throw new PaymentError('refund exceeds the ' + net + ' cents paid', { invoiceId, net });
  }
  const payment = repository.insert(
    createPayment({ id: nextId('pay'), invoiceId, kind: KIND.REFUND, amountCents, reference: validateString(reference, 'reference', { min: 0 }), recordedAt: clock.now().toISOString() }),
  );
  invoices.syncStatus(invoiceId, repository.netPaidCents(invoiceId));
  bus.emit(TOPICS.PAYMENT_REFUNDED, { paymentId: payment.id, invoiceId, customerId: invoice.customerId, amountCents });
  return payment;
}

function forInvoice(invoiceId) {
  invoices.get(invoiceId);
  return repository.forInvoice(invoiceId);
}

module.exports = { recordPayment, refund, forInvoice };
`,
  "src/reports/aging.js": raw`const config = require('../config');

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromDay, toDay) {
  return Math.round((Date.parse(toDay) - Date.parse(fromDay)) / DAY_MS);
}

// Labels follow config.agingBucketsDays: with [30, 60] they are 0-30, 31-60 and 60+.
function bucketFor(days) {
  const [first, second] = config.agingBucketsDays;
  if (days <= first) return '0-' + first;
  if (days <= second) return first + 1 + '-' + second;
  return second + '+';
}

module.exports = { daysBetween, bucketFor };
`,
  "src/reports/csv.js": raw`const money = require('../shared/money');

const cell = (value) => (/[",\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value));

// Rows are { key, totalCents, count }; amounts are written as decimals for spreadsheets.
function toCsv(rows) {
  const lines = ['key,count,total'];
  for (const row of rows) {
    lines.push([cell(row.key), row.count, (row.totalCents / 100).toFixed(2)].join(','));
  }
  lines.push(['total', rows.reduce((n, row) => n + row.count, 0), (money.sum(rows.map((row) => row.totalCents)) / 100).toFixed(2)].join(','));
  return lines.join('\n') + '\n';
}

module.exports = { toCsv };
`,
  "src/reports/index.js": raw`module.exports = { ...require('./service'), routes: require('./routes').routes };
`,
  "src/reports/model.js": raw`function createRow({ key, totalCents, count = 0 }) {
  return { key, totalCents, count };
}

module.exports = { createRow };
`,
  "src/reports/repository.js": raw`const invoices = require('../invoices/repository');
const { STATUS } = require('../invoices/status');

const allInvoices = () => invoices.list();
const unpaidInvoices = () => invoices.list().filter((invoice) => invoice.status === STATUS.OPEN || invoice.status === STATUS.PARTIALLY_PAID);

module.exports = { allInvoices, unpaidInvoices };
`,
  "src/reports/routes.js": raw`const service = require('./service');
const { handle, ok } = require('../shared/http');

const revenue = handle(() => ok(service.revenueByMonth()));
const outstanding = handle(() => ok(service.outstandingByCustomer()));
const aging = handle((req) => ok(service.aging(req.query.asOf)));
const average = handle(() => ok({ averageCents: service.averageInvoiceCents() }));

module.exports = {
  revenue,
  outstanding,
  aging,
  average,
  routes: [
    { method: 'GET', path: '/reports/revenue', handler: revenue },
    { method: 'GET', path: '/reports/outstanding', handler: outstanding },
    { method: 'GET', path: '/reports/aging', handler: aging },
    { method: 'GET', path: '/reports/average', handler: average },
  ],
};
`,
  "src/reports/service.js": raw`const repository = require('./repository');
const invoices = require('../invoices/service');
const { createRow } = require('./model');
const { bucketFor, daysBetween } = require('./aging');
const { STATUS } = require('../invoices/status');
const money = require('../shared/money');
const clock = require('../shared/clock');
const { validateDate } = require('../shared/validation');

// Grand total of a report's rows. Not the invoice total: see invoices/service.total.
function total(rows) {
  return money.sum(rows.map((row) => row.totalCents));
}

function groupBy(items, keyOf, amountOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) || createRow({ key, totalCents: 0 });
    group.totalCents += amountOf(item);
    group.count += 1;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Revenue per issue month, counting only invoices that are fully paid.
function revenueByMonth() {
  const paid = repository.allInvoices().filter((invoice) => invoice.status === STATUS.PAID);
  const rows = groupBy(paid, (invoice) => invoice.issuedAt.slice(0, 7), invoices.total);
  return { rows, totalCents: total(rows) };
}

function outstandingByCustomer() {
  const rows = groupBy(repository.unpaidInvoices(), (invoice) => invoice.customerId, invoices.outstanding);
  return { rows, totalCents: total(rows) };
}

// Unpaid balance by age since the issue date.
function aging(asOf = clock.today()) {
  const day = validateDate(asOf, 'asOf');
  const rows = groupBy(
    repository.unpaidInvoices(),
    (invoice) => bucketFor(daysBetween(invoice.issuedAt, day)),
    invoices.outstanding,
  );
  return { asOf: day, rows, totalCents: total(rows) };
}

function averageInvoiceCents() {
  const all = repository.allInvoices();
  if (all.length === 0) return 0;
  return money.round(money.sum(all.map(invoices.total)) / all.length);
}

module.exports = { total, revenueByMonth, outstandingByCustomer, aging, averageInvoiceCents };
`,
  "src/reports/top-customers.js": raw`const customers = require('../customers/service');
const invoices = require('../invoices/service');
const { createRow } = require('./model');
const { sortBy } = require('../shared/collections');
const { validateRange } = require('../shared/validation');
const money = require('../shared/money');

// Customers ranked by billed amount (void invoices excluded), largest first.
function topCustomers(limit = 5) {
  validateRange(limit, { min: 1, max: 50 }, 'limit');
  const rows = customers.list().map((customer) => {
    const billed = invoices.list({ customerId: customer.id }).filter((invoice) => invoice.status !== 'void');
    return createRow({ key: customer.id, totalCents: money.sum(billed.map(invoices.total)), count: billed.length });
  });
  return sortBy(rows, (row) => -row.totalCents).slice(0, limit);
}

module.exports = { topCustomers };
`,
  "src/shared/clock.js": raw`let fixed = null;

const now = () => (fixed === null ? new Date() : new Date(fixed.getTime()));
const today = () => now().toISOString().slice(0, 10);
const setNow = (date) => { fixed = date; };
const reset = () => { fixed = null; };

module.exports = { now, today, setNow, reset };
`,
  "src/shared/collections.js": raw`function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

const sortBy = (items, valueOf) => items.slice().sort((a, b) => (valueOf(a) < valueOf(b) ? -1 : valueOf(a) > valueOf(b) ? 1 : 0));

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

const unique = (items) => Array.from(new Set(items));

module.exports = { groupBy, sortBy, chunk, unique };
`,
  "src/shared/errors/app-error.js": raw`// Base class of every error this service throws on purpose. http.toResponse maps it to a status;
// anything else becomes an opaque 500.
class AppError extends Error {
  constructor(code, message, { status = 500, details = {} } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

module.exports = { AppError };
`,
  "src/shared/errors/conflict-error.js": raw`const { AppError } = require('./app-error');

class ConflictError extends AppError {
  constructor(message, details = {}) {
    super('conflict', message, { status: 409, details });
  }
}

module.exports = { ConflictError };
`,
  "src/shared/errors/index.js": raw`const { AppError } = require('./app-error');
const { ValidationError } = require('./validation-error');
const { NotFoundError } = require('./not-found-error');
const { ConflictError } = require('./conflict-error');
const { PaymentError } = require('./payment-error');

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, PaymentError };
`,
  "src/shared/errors/not-found-error.js": raw`const { AppError } = require('./app-error');

class NotFoundError extends AppError {
  constructor(entity, id) {
    super('not_found', entity + ' ' + id + ' not found', { status: 404, details: { entity, id } });
  }
}

module.exports = { NotFoundError };
`,
  "src/shared/errors/payment-error.js": raw`const { AppError } = require('./app-error');

// A payment or refund that is well formed but not allowed (overpayment, refund above what was paid).
class PaymentError extends AppError {
  constructor(message, details = {}) {
    super('payment_rejected', message, { status: 422, details });
  }
}

module.exports = { PaymentError };
`,
  "src/shared/errors/validation-error.js": raw`const { AppError } = require('./app-error');

class ValidationError extends AppError {
  constructor(field, message, details = {}) {
    super('validation_failed', field + ': ' + message, { status: 400, details: { field, ...details } });
    this.field = field;
  }
}

module.exports = { ValidationError };
`,
  "src/shared/events/bus.js": raw`const logger = require('../logger');

// In-process publish/subscribe. A failing subscriber must not fail the publisher: the payment is already stored.
function createBus() {
  const handlers = new Map();
  return {
    on(topic, handler) {
      const list = handlers.get(topic) || [];
      list.push(handler);
      handlers.set(topic, list);
      return () => handlers.set(topic, (handlers.get(topic) || []).filter((entry) => entry !== handler));
    },
    emit(topic, payload) {
      const results = [];
      for (const handler of handlers.get(topic) || []) {
        try {
          results.push(handler(payload));
        } catch (error) {
          logger.error('event handler failed', { topic, reason: error.message });
        }
      }
      return results;
    },
    count(topic) {
      return (handlers.get(topic) || []).length;
    },
    clear() {
      handlers.clear();
    },
  };
}

const bus = createBus();

module.exports = { createBus, bus };
`,
  "src/shared/events/topics.js": raw`module.exports = Object.freeze({
  INVOICE_CREATED: 'invoice.created',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_REFUNDED: 'payment.refunded',
});
`,
  "src/shared/http.js": raw`const { AppError } = require('./errors');
const logger = require('./logger');

const ok = (body) => ({ status: 200, body });
const created = (body) => ({ status: 201, body });

// An AppError carries its own status; anything else is a bug and must not leak its message.
function toResponse(error) {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, details: error.details } } };
  }
  logger.error('unhandled error', { reason: error.message });
  return { status: 500, body: { error: { code: 'internal', message: 'internal error' } } };
}

// Wraps a route handler so a thrown error becomes a response.
function handle(fn) {
  return (request = {}) => {
    try {
      return fn({ params: {}, query: {}, body: {}, ...request });
    } catch (error) {
      return toResponse(error);
    }
  };
}

module.exports = { ok, created, toResponse, handle };
`,
  "src/shared/ids.js": raw`const counters = {};

function nextId(prefix) {
  counters[prefix] = (counters[prefix] || 0) + 1;
  return prefix + '_' + String(counters[prefix]).padStart(4, '0');
}

function reset() {
  for (const prefix of Object.keys(counters)) delete counters[prefix];
}

module.exports = { nextId, reset };
`,
  "src/shared/logger.js": raw`const entries = [];

const log = (level) => (message, fields = {}) => { entries.push({ level, message, ...fields }); };

module.exports = {
  info: log('info'),
  warn: log('warn'),
  error: log('error'),
  entries: () => entries.slice(),
  clear: () => { entries.length = 0; },
};
`,
  "src/shared/money.js": raw`const { ValidationError } = require('./errors');

const CURRENCY = 'EUR';

// Half up: 100.5 cents is 101.
function round(value) {
  return Math.round(value);
}

// Decimal major units (12.34) to integer cents. Only for input from outside; inside the service money is cents.
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new ValidationError('amount', 'must be a number');
  }
  return round(amount * 100);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

// basisPoints: 1000 is 10%.
function percentOf(cents, basisPoints) {
  return Math.round((cents * basisPoints) / 10000);
}

// Splits cents into parts that add up exactly; the first parts take the remainder.
function split(cents, parts) {
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function format(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return sign + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0') + ' ' + CURRENCY;
}

module.exports = { CURRENCY, round, toCents, sum, percentOf, split, format };
`,
  "src/shared/pagination.js": raw`const { validateRange } = require('./validation');

function paginate(items, { page = 1, pageSize = 20 } = {}) {
  validateRange(page, { min: 1 }, 'page');
  validateRange(pageSize, { min: 1, max: 100 }, 'pageSize');
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

module.exports = { paginate };
`,
  "src/shared/retry.js": raw`// Runs fn up to ${BT}attempts${BT} times; the last error is rethrown. Synchronous: the gateways here are in-process.
function retry(fn, { attempts = 3, onFailure = () => {} } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return fn(attempt);
    } catch (error) {
      lastError = error;
      onFailure(error, attempt);
    }
  }
  throw lastError;
}

module.exports = { retry };
`,
  "src/shared/strings.js": raw`const slug = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function titleCase(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// 3 -> '3 invoices', 1 -> '1 invoice'.
function plural(count, noun) {
  return count + ' ' + noun + (count === 1 ? '' : 's');
}

module.exports = { slug, truncate, titleCase, plural };
`,
  "src/shared/validation/date.js": raw`const { ValidationError } = require('../errors');

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Accepts a Date or a YYYY-MM-DD string and returns the day as YYYY-MM-DD, so that days compare as strings.
function validateDate(value, field) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = typeof value === 'string' ? ISO_DAY.exec(value) : null;
  if (match === null) throw new ValidationError(field, 'must be a date like 2026-01-31');
  const [, year, month, day] = match.map(Number);
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) {
    throw new ValidationError(field, value + ' is not a calendar day');
  }
  return value;
}

module.exports = { validateDate };
`,
  "src/shared/validation/email.js": raw`const { ValidationError } = require('../errors');
const { validateString } = require('./string');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value, field = 'email') {
  const email = validateString(value, field, { max: 254 });
  if (!EMAIL.test(email)) throw new ValidationError(field, 'is not an email address');
  return email.toLowerCase();
}

module.exports = { validateEmail };
`,
  "src/shared/validation/id.js": raw`const { ValidationError } = require('../errors');

// Ids look like inv_0001: a short prefix owned by one feature and a counter from shared/ids.
function validateId(value, field, prefix) {
  const pattern = new RegExp('^' + prefix + '_\\d{4,}$');
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ValidationError(field, 'must be an id like ' + prefix + '_0001');
  }
  return value;
}

module.exports = { validateId };
`,
  "src/shared/validation/index.js": raw`const { validateRequired } = require('./required');
const { validateString } = require('./string');
const { validateEmail } = require('./email');
const { validateId } = require('./id');
const { validateDate } = require('./date');
const { validateRange } = require('./range');
const { validateCents } = require('./money');

module.exports = { validateRequired, validateString, validateEmail, validateId, validateDate, validateRange, validateCents };
`,
  "src/shared/validation/money.js": raw`const { ValidationError } = require('../errors');
const { validateRange } = require('./range');

// Money is integer cents everywhere (CONTRIBUTING.md); this is the one place that says so.
function validateCents(value, field, { allowZero = false } = {}) {
  if (!Number.isInteger(value)) throw new ValidationError(field, 'must be a whole number of cents');
  return validateRange(value, { min: allowZero ? 0 : 1, max: 100000000 }, field);
}

module.exports = { validateCents };
`,
  "src/shared/validation/range.js": raw`const { ValidationError } = require('../errors');

// Works for numbers and for YYYY-MM-DD days (strings compare in calendar order). Either bound may be omitted.
function validateRange(value, { min, max } = {}, field) {
  if (min !== undefined && value < min) throw new ValidationError(field, 'must not be before ' + min, { min });
  if (max !== undefined && value > max) throw new ValidationError(field, 'must not be after ' + max, { max });
  return value;
}

module.exports = { validateRange };
`,
  "src/shared/validation/required.js": raw`const { ValidationError } = require('../errors');

function validateRequired(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(field, 'is required');
  }
  return value;
}

module.exports = { validateRequired };
`,
  "src/shared/validation/string.js": raw`const { ValidationError } = require('../errors');

function validateString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') throw new ValidationError(field, 'must be a string');
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError(field, 'must have at least ' + min + ' characters');
  if (trimmed.length > max) throw new ValidationError(field, 'must have at most ' + max + ' characters');
  return trimmed;
}

module.exports = { validateString };
`,
  "tests/app.test.js": raw`const { createApp } = require('../src/app');
const channels = require('../src/notifications/channels');
const { bus } = require('../src/shared/events/bus');
const { customerInput, invoiceInput, makeInvoice } = require('./factory');

describe('app', () => {
  test('creating an invoice and paying it mails a receipt', () => {
    const app = createApp({ eventBus: bus });
    const customer = app.request('POST', '/customers', { body: customerInput() }).body;
    const invoice = app.request('POST', '/invoices', { body: { ...invoiceInput(), customerId: customer.id } }).body;
    const paid = app.request('POST', '/invoices/' + invoice.id + '/payments', { body: { amountCents: 1106, method: 'card' } });
    expect(paid.status).toBe(201);
    expect(app.request('GET', '/invoices/' + invoice.id).body.status).toBe('paid');
    expect(channels.outbox().some((entry) => entry.subject.startsWith('Receipt'))).toBe(true);
    expect(app.request('GET', '/customers/' + customer.id + '/notifications').body).toHaveLength(2);
  });

  test('an unknown path is a 404', () => {
    expect(createApp({ eventBus: bus }).request('GET', '/nope').status).toBe(404);
  });
});

describe('app routing', () => {
  const app = () => createApp({ eventBus: bus });

  test('path params reach the handler', () => {
    const invoice = makeInvoice();
    expect(app().request('GET', '/invoices/' + invoice.id).status).toBe(200);
  });

  test('the method must match', () => {
    expect(app().request('DELETE', '/customers').status).toBe(404);
  });

  test('validation errors come back as 400 with a code', () => {
    const response = app().request('POST', '/customers', { body: customerInput({ email: 'bad' }) });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  test('refunds are routed', () => {
    const invoice = makeInvoice();
    const response = app().request('POST', '/invoices/' + invoice.id + '/refunds', { body: { amountCents: 100 } });
    expect(response.status).toBe(422);
  });

  test('reports are routed', () => {
    makeInvoice();
    expect(app().request('GET', '/reports/aging', { query: { asOf: '2026-03-01' } }).body.rows[0].key).toBe('31-60');
  });
});
`,
  "tests/customers/repository.test.js": raw`const repository = require('../../src/customers/repository');
const { makeCustomer } = require('../factory');

describe('customers repository', () => {
  test('findByEmail finds the stored customer', () => {
    const customer = makeCustomer();
    expect(repository.findByEmail(customer.email).id).toBe(customer.id);
    expect(repository.findByEmail('nobody@example.test')).toBeNull();
  });

  test('list returns every customer in insertion order', () => {
    const first = makeCustomer();
    const second = makeCustomer();
    expect(repository.list().map((customer) => customer.id)).toEqual([first.id, second.id]);
  });

  test('get returns null for an unknown id', () => {
    expect(repository.get('cus_0404')).toBeNull();
  });

  test('update merges the patch', () => {
    const customer = makeCustomer();
    expect(repository.update(customer.id, { phone: null }).name).toBe(customer.name);
  });
});
`,
  "tests/customers/routes.test.js": raw`const routes = require('../../src/customers/routes');
const { customerInput, makeCustomer } = require('../factory');

describe('customers routes', () => {
  test('POST creates and returns 201', () => {
    expect(routes.create({ body: customerInput() }).status).toBe(201);
  });

  test('POST with a bad body returns 400', () => {
    expect(routes.create({ body: customerInput({ name: '' }) }).status).toBe(400);
  });

  test('GET one returns 404 for an unknown id', () => {
    expect(routes.get({ params: { customerId: 'cus_0042' } }).status).toBe(404);
  });

  test('PATCH updates and returns the customer', () => {
    const customer = makeCustomer();
    expect(routes.update({ params: { customerId: customer.id }, body: { name: 'New Name' } }).body.name).toBe('New Name');
  });

  test('GET list with q searches', () => {
    makeCustomer({ name: 'Zed Zebra' });
    makeCustomer();
    expect(routes.list({ query: { q: 'zebra' } }).body).toHaveLength(1);
  });

  test('GET list returns every customer', () => {
    makeCustomer();
    makeCustomer();
    expect(routes.list().body).toHaveLength(2);
  });
});
`,
  "tests/customers/segments.test.js": raw`const segments = require('../../src/customers/segments');
const { makeInvoice, makeCustomer } = require('../factory');

describe('customer segments', () => {
  test('a customer with no invoices is standard', () => {
    expect(segments.segmentOf(makeCustomer().id)).toBe('standard');
  });

  test('lifetime spend decides the segment', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id, lines: [{ description: 'Big', quantity: 1, unitCents: 150000 }] });
    expect(segments.lifetimeCents(customer.id)).toBe(165000);
    expect(segments.segmentOf(customer.id)).toBe('silver');
  });

  test('describe counts invoices', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id });
    expect(segments.describe(customer.id)).toBe('standard customer with 1 invoice');
  });
});
`,
  "tests/customers/service.test.js": raw`const customers = require('../../src/customers/service');
const { makeCustomer, customerInput } = require('../factory');
const { ConflictError, NotFoundError, ValidationError } = require('../../src/shared/errors');

describe('customers service', () => {
  test('creates a customer with a cus_ id and receipts on', () => {
    const customer = makeCustomer();
    expect(customer.id).toMatch(/^cus_\d{4}$/);
    expect(customer.receipts).toBe(true);
  });

  test('rejects a duplicate email', () => {
    const first = makeCustomer();
    expect(() => customers.create(customerInput({ email: first.email }))).toThrow(ConflictError);
  });

  test('rejects a bad email', () => {
    expect(() => customers.create(customerInput({ email: 'nope' }))).toThrow(ValidationError);
  });

  test('get throws NotFoundError for an unknown id', () => {
    expect(() => customers.get('cus_9999')).toThrow(NotFoundError);
  });

  test('contactFor returns what a message needs', () => {
    const customer = makeCustomer({ name: 'Grace' });
    expect(customers.contactFor(customer.id)).toEqual({ name: 'Grace', email: customer.email, phone: '+4915100000', receipts: true });
  });

  test('search matches name or email, ignoring case', () => {
    makeCustomer({ name: 'Grace Hopper' });
    makeCustomer({ name: 'Alan Turing' });
    expect(customers.search('hopper')).toHaveLength(1);
    expect(customers.search('EXAMPLE.TEST')).toHaveLength(2);
  });

  test('update changes the given fields only', () => {
    const customer = makeCustomer({ name: 'Grace' });
    const updated = customers.update(customer.id, { phone: '+1' });
    expect(updated.phone).toBe('+1');
    expect(updated.name).toBe('Grace');
  });

  test('update refuses an email that another customer has', () => {
    const first = makeCustomer();
    const second = makeCustomer();
    expect(() => customers.update(second.id, { email: first.email })).toThrow(ConflictError);
    expect(customers.update(first.id, { email: first.email }).email).toBe(first.email);
  });

  test('setReceipts turns receipts off', () => {
    const customer = makeCustomer();
    expect(customers.setReceipts(customer.id, false).receipts).toBe(false);
  });
});
`,
  "tests/factory.js": raw`// Shared test data. Tests build customers, invoices and payments here, never from inline literals,
// so a change to a model is fixed in one place.
const customers = require('../src/customers/service');
const invoices = require('../src/invoices/service');
const payments = require('../src/payments/service');

let counter = 0;

function customerInput(overrides = {}) {
  counter += 1;
  return { name: 'Ada Lovelace', email: 'ada' + counter + '@example.test', phone: '+4915100000', ...overrides };
}

// 3 x 3.35 = 10.05 of goods plus 10% tax rounded half up (1.005 -> 1.01): the default invoice totals 1106 cents.
function invoiceInput(overrides = {}) {
  return { lines: [{ description: 'Hosting', quantity: 3, unitCents: 335 }], taxBps: 1000, issuedAt: '2026-01-15', ...overrides };
}

const makeCustomer = (overrides) => customers.create(customerInput(overrides));

function makeInvoice(overrides = {}) {
  const customerId = overrides.customerId || makeCustomer().id;
  return invoices.create({ ...invoiceInput(), ...overrides, customerId });
}

// Pays the whole open balance by card unless told otherwise.
function makePayment(invoice, overrides = {}) {
  const amountCents = invoices.outstanding(invoices.get(invoice.id));
  return payments.recordPayment({ invoiceId: invoice.id, amountCents, method: 'card', ...overrides });
}

module.exports = { DEFAULT_TOTAL_CENTS: 1106, customerInput, invoiceInput, makeCustomer, makeInvoice, makePayment };
`,
  "tests/flags.test.js": raw`const flags = require('../src/flags');

describe('flags', () => {
  test('defaults', () => {
    expect(flags.isEnabled('receiptEmails')).toBe(true);
    expect(flags.isEnabled('smsReceipts')).toBe(false);
  });

  test('set and reset', () => {
    flags.set('smsReceipts', true);
    expect(flags.isEnabled('smsReceipts')).toBe(true);
    flags.reset();
    expect(flags.isEnabled('smsReceipts')).toBe(false);
  });

  test('an unknown flag is off', () => {
    expect(flags.isEnabled('nope')).toBe(false);
  });
});
`,
  "tests/invoices/lines.test.js": raw`const { lineTotal, subtotal } = require('../../src/invoices/lines');

const { summarize } = require('../../src/invoices/summary');
const { makeInvoice } = require('../factory');

describe('invoice summary', () => {
  test('lists every number of the invoice page', () => {
    expect(summarize(makeInvoice())).toMatchObject({
      lineCount: 1, subtotalCents: 1005, taxCents: 101, totalCents: 1106, paidCents: 0, outstandingCents: 1106, status: 'open',
    });
  });

  test('a void invoice owes nothing', () => {
    const invoice = makeInvoice();
    require('../../src/invoices/service').voidInvoice(invoice.id);
    expect(summarize(require('../../src/invoices/service').get(invoice.id)).outstandingCents).toBe(0);
  });
});

describe('invoice lines', () => {
  test('a line is quantity times unit price', () => {
    expect(lineTotal({ quantity: 4, unitCents: 250 })).toBe(1000);
  });

  test('the subtotal adds every line', () => {
    expect(subtotal([{ quantity: 1, unitCents: 100 }, { quantity: 2, unitCents: 50 }])).toBe(200);
    expect(subtotal([])).toBe(0);
  });
});
`,
  "tests/invoices/repository.test.js": raw`const repository = require('../../src/invoices/repository');
const { makeInvoice, makeCustomer } = require('../factory');

describe('invoices repository', () => {
  test('list filters by customer and status', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id });
    makeInvoice();
    expect(repository.list({ customerId: customer.id })).toHaveLength(1);
    expect(repository.list({ status: 'paid' })).toHaveLength(0);
    expect(repository.list()).toHaveLength(2);
  });

  test('get returns null for an unknown id', () => {
    expect(repository.get('inv_0404')).toBeNull();
  });
});
`,
  "tests/invoices/routes.test.js": raw`const routes = require('../../src/invoices/routes');
const { makeInvoice, makeCustomer, invoiceInput } = require('../factory');

describe('invoices routes', () => {
  test('GET one adds the total', () => {
    const invoice = makeInvoice();
    expect(routes.get({ params: { invoiceId: invoice.id } }).body.totalCents).toBe(1106);
  });

  test('POST creates an invoice', () => {
    const customer = makeCustomer();
    const response = routes.create({ body: { ...invoiceInput(), customerId: customer.id } });
    expect(response.status).toBe(201);
    expect(response.body.id).toMatch(/^inv_/);
  });

  test('GET list is paginated', () => {
    for (let index = 0; index < 3; index += 1) makeInvoice();
    const response = routes.list({ query: { pageSize: 2 } });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(3);
  });

  test('GET one for an unknown invoice is a 404 with the id in the details', () => {
    const response = routes.get({ params: { invoiceId: 'inv_0404' } });
    expect(response.status).toBe(404);
    expect(response.body.error.details).toEqual({ entity: 'invoice', id: 'inv_0404' });
  });

  test('POST with no lines is a 400 naming the field', () => {
    const customer = makeCustomer();
    const response = routes.create({ body: { ...invoiceInput({ lines: [] }), customerId: customer.id } });
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe('lines');
  });

  test('GET list can filter by customer', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id });
    makeInvoice();
    expect(routes.list({ query: { customerId: customer.id } }).body.items).toHaveLength(1);
  });

  test('void sets the status', () => {
    const invoice = makeInvoice();
    expect(routes.voidInvoice({ params: { invoiceId: invoice.id } }).body.status).toBe('void');
  });

  test('void returns 409 once the invoice has payments', () => {
    const invoice = makeInvoice();
    require('../../src/invoices/service').syncStatus(invoice.id, 100);
    expect(routes.voidInvoice({ params: { invoiceId: invoice.id } }).status).toBe(409);
  });
});
`,
  "tests/invoices/search.test.js": raw`const { search } = require('../../src/invoices/search');
const { makeInvoice } = require('../factory');
const { ValidationError } = require('../../src/shared/errors');

describe('invoice search', () => {
  test('matches line descriptions and notes, ignoring case', () => {
    makeInvoice({ notes: 'Renewal for Q1' });
    makeInvoice({ lines: [{ description: 'Consulting', quantity: 1, unitCents: 5000 }] });
    expect(search({ text: 'hosting' })).toHaveLength(1);
    expect(search({ text: 'RENEWAL' })).toHaveLength(1);
    expect(search({ text: 'consult' })).toHaveLength(1);
  });

  test('filters by total range', () => {
    makeInvoice();
    makeInvoice({ lines: [{ description: 'Consulting', quantity: 1, unitCents: 5000 }] });
    expect(search({ minCents: 2000 })).toHaveLength(1);
    expect(search({ maxCents: 2000 })).toHaveLength(1);
  });

  test('rejects an inverted range', () => {
    expect(() => search({ minCents: 500, maxCents: 100 })).toThrow(ValidationError);
  });
});
`,
  "tests/invoices/service.test.js": raw`const invoices = require('../../src/invoices/service');
const { makeInvoice, makeCustomer, invoiceInput, DEFAULT_TOTAL_CENTS } = require('../factory');
const { NotFoundError, ValidationError, ConflictError } = require('../../src/shared/errors');

describe('invoices service', () => {
  test('total is subtotal plus rounded tax', () => {
    const invoice = makeInvoice();
    expect(invoices.taxFor(invoice)).toBe(101);
    expect(invoices.total(invoice)).toBe(DEFAULT_TOTAL_CENTS);
  });

  test('total without tax is the subtotal', () => {
    expect(invoices.total(makeInvoice({ taxBps: 0 }))).toBe(1005);
  });

  test('rejects an invoice with no lines', () => {
    const customer = makeCustomer();
    expect(() => invoices.create({ ...invoiceInput({ lines: [] }), customerId: customer.id })).toThrow(ValidationError);
  });

  test('rejects an unknown customer', () => {
    expect(() => invoices.create({ ...invoiceInput(), customerId: 'cus_0099' })).toThrow(NotFoundError);
  });

  test('rejects a line price in decimals', () => {
    const customer = makeCustomer();
    const lines = [{ description: 'x', quantity: 1, unitCents: 9.99 }];
    expect(() => invoices.create({ ...invoiceInput({ lines }), customerId: customer.id })).toThrow(/whole number of cents/);
  });

  test('syncStatus follows the net paid amount', () => {
    const invoice = makeInvoice();
    expect(invoices.syncStatus(invoice.id, 500).status).toBe('partially_paid');
    expect(invoices.syncStatus(invoice.id, DEFAULT_TOTAL_CENTS).status).toBe('paid');
    expect(invoices.outstanding(invoices.get(invoice.id))).toBe(0);
  });

  test('a void invoice cannot be synced', () => {
    const invoice = makeInvoice();
    invoices.voidInvoice(invoice.id);
    expect(() => invoices.syncStatus(invoice.id, 1)).toThrow(ConflictError);
  });

  test('rejects a tax rate above 100%', () => {
    const customer = makeCustomer();
    expect(() => invoices.create({ ...invoiceInput({ taxBps: 10001 }), customerId: customer.id })).toThrow(ValidationError);
  });

  test('rejects an issue date that is not a calendar day', () => {
    const customer = makeCustomer();
    expect(() => invoices.create({ ...invoiceInput({ issuedAt: '2026-13-01' }), customerId: customer.id })).toThrow(/calendar day|must be a date/);
  });

  test('list filters by customer', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id });
    makeInvoice();
    expect(invoices.list({ customerId: customer.id })).toHaveLength(1);
  });

  test('voiding an unpaid invoice sets the status', () => {
    expect(invoices.voidInvoice(makeInvoice().id).status).toBe('void');
  });

  test('creating an invoice announces it on the bus', () => {
    const { bus } = require('../../src/shared/events/bus');
    const seen = [];
    bus.on('invoice.created', (event) => seen.push(event.invoiceId));
    const invoice = makeInvoice();
    expect(seen).toEqual([invoice.id]);
  });

  test('creating an invoice mails the customer directly', () => {
    const invoice = makeInvoice();
    const notifications = require('../../src/notifications/repository').forCustomer(invoice.customerId);
    expect(notifications.map((entry) => entry.template)).toEqual(['invoice-created']);
  });
});
`,
  "tests/invoices/status.test.js": raw`const { statusFor, STATUS } = require('../../src/invoices/status');

describe('statusFor', () => {
  test('nothing paid is open', () => {
    expect(statusFor(1000, 0)).toBe(STATUS.OPEN);
  });

  test('part paid is partially_paid', () => {
    expect(statusFor(1000, 400)).toBe(STATUS.PARTIALLY_PAID);
  });

  test('everything paid is paid', () => {
    expect(statusFor(1000, 1000)).toBe(STATUS.PAID);
  });
});
`,
  "tests/legacy/invoice-total.test.js": raw`const legacy = require('../../src/legacy/invoice-total');
const { invoiceInput } = require('../factory');

// Pins the frozen behaviour only: the legacy total is in major units and is not the invoice total.
describe('legacy invoice total', () => {
  test('returns major units', () => {
    expect(legacy.total({ ...invoiceInput(), lines: invoiceInput().lines })).toBe(11.06);
  });
});
`,
  "tests/notifications/channels.test.js": raw`const channels = require('../../src/notifications/channels');

describe('channels', () => {
  test('email.send lands in the outbox', () => {
    expect(channels.email.send({ to: 'a@example.test', subject: 's', body: 'b' })).toEqual({ delivered: true });
    expect(channels.outbox()).toHaveLength(1);
    expect(channels.outbox()[0].from).toBe('billing@example.invalid');
  });

  test('clearOutbox empties it', () => {
    channels.sms.send({ to: '+49', body: 'b' });
    channels.clearOutbox();
    expect(channels.outbox()).toEqual([]);
  });
});
`,
  "tests/notifications/flow.test.js": raw`// The payment-received flow end to end: payments only announce, notifications listen.
const notifications = require('../../src/notifications');
const channels = require('../../src/notifications/channels');
const { bus } = require('../../src/shared/events/bus');
const { makeInvoice, makePayment } = require('../factory');

describe('payment received flow', () => {
  test('a payment mails the receipt once notifications are registered', () => {
    notifications.register(bus);
    const invoice = makeInvoice();
    makePayment(invoice);
    const receipts = channels.outbox().filter((entry) => entry.subject === 'Receipt for invoice ' + invoice.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].body).toContain('paid in full');
  });

  test('without registration no receipt is sent', () => {
    makePayment(makeInvoice());
    expect(channels.outbox().filter((entry) => entry.subject.startsWith('Receipt'))).toEqual([]);
  });

  test('unregistering stops the receipts', () => {
    const off = notifications.register(bus);
    off();
    makePayment(makeInvoice());
    expect(channels.outbox().filter((entry) => entry.subject.startsWith('Receipt'))).toEqual([]);
  });
});
`,
  "tests/notifications/handlers.test.js": raw`const handlers = require('../../src/notifications/handlers');
const channels = require('../../src/notifications/channels');
const flags = require('../../src/flags');
const customers = require('../../src/customers/service');
const { makeCustomer } = require('../factory');

function event(customer, overrides = {}) {
  return { paymentId: 'pay_0001', invoiceId: 'inv_0001', customerId: customer.id, amountCents: 500, balanceCents: 606, ...overrides };
}

describe('notification handlers', () => {
  test('a payment mails a receipt to the customer', () => {
    const customer = makeCustomer();
    handlers.onPaymentReceived(event(customer));
    const [mail] = channels.outbox().filter((entry) => entry.subject.startsWith('Receipt'));
    expect(mail.to).toBe(customer.email);
    expect(mail.body).toContain('5.00 EUR');
  });

  test('nothing is sent when the receiptEmails flag is off', () => {
    flags.set('receiptEmails', false);
    expect(handlers.onPaymentReceived(event(makeCustomer()))).toBeNull();
    expect(channels.outbox()).toEqual([]);
  });

  test('nothing is sent to a customer who turned receipts off', () => {
    const customer = makeCustomer();
    customers.setReceipts(customer.id, false);
    expect(handlers.onPaymentReceived(event(customer))).toBeNull();
  });

  test('an sms goes out too when smsReceipts is on', () => {
    flags.set('smsReceipts', true);
    handlers.onPaymentReceived(event(makeCustomer()));
    expect(channels.outbox().map((entry) => entry.channel)).toEqual(['sms', 'email']);
  });

  test('the receipt names the remaining balance', () => {
    handlers.onPaymentReceived(event(makeCustomer(), { balanceCents: 606 }));
    expect(channels.outbox().find((entry) => entry.channel === 'email').body).toContain('Remaining balance: 6.06 EUR');
  });

  test('a zero balance closes the receipt', () => {
    handlers.onPaymentReceived(event(makeCustomer(), { balanceCents: 0 }));
    expect(channels.outbox()[0].body).toContain('paid in full');
  });

  test('an unknown customer throws, for the bus to log', () => {
    expect(() => handlers.onPaymentReceived({ customerId: 'cus_0404', invoiceId: 'inv_0001', amountCents: 1, balanceCents: 0 })).toThrow(/not found/);
  });

  test('a refund is only logged', () => {
    expect(handlers.onPaymentRefunded({ invoiceId: 'inv_0001', amountCents: 1 })).toBeNull();
    expect(channels.outbox()).toEqual([]);
  });
});
`,
  "tests/notifications/queue.test.js": raw`const queue = require('../../src/notifications/queue');
const channels = require('../../src/notifications/channels');

describe('notification queue', () => {
  afterEach(() => queue.clear());

  test('flush sends what is queued', () => {
    queue.enqueue('email', { to: 'a@example.test', subject: 's', body: 'b' });
    expect(queue.flush()).toBe(1);
    expect(queue.size()).toBe(0);
    expect(channels.outbox()).toHaveLength(1);
  });

  test('a message that cannot be sent stays queued', () => {
    queue.enqueue('pigeon', { body: 'b' });
    expect(queue.flush()).toBe(0);
    expect(queue.size()).toBe(1);
  });
});
`,
  "tests/notifications/service.test.js": raw`const service = require('../../src/notifications/service');
const { makeCustomer } = require('../factory');
const { NotFoundError } = require('../../src/shared/errors');

describe('notifications service', () => {
  test('deliver records what it sent', () => {
    const customer = makeCustomer();
    const record = service.deliver({ customerId: customer.id, channel: 'email', template: 't', message: { subject: 's', body: 'b' } });
    expect(record.status).toBe('sent');
    expect(service.forCustomer(customer.id)).toHaveLength(1);
  });

  test('forCustomer rejects an unknown customer', () => {
    expect(() => service.forCustomer('cus_0404')).toThrow(NotFoundError);
  });
});
`,
  "tests/notifications/templates.test.js": raw`const templates = require('../../src/notifications/templates');

describe('notification templates', () => {
  test('a receipt with a balance states it', () => {
    const { subject, body } = templates.paymentReceipt({ customerName: 'Ada', invoiceId: 'inv_0001', amountCents: 400, balanceCents: 706 });
    expect(subject).toBe('Receipt for invoice inv_0001');
    expect(body).toContain('Remaining balance: 7.06 EUR');
  });

  test('a receipt that closes the invoice says so', () => {
    const { body } = templates.paymentReceipt({ customerName: 'Ada', invoiceId: 'inv_0001', amountCents: 1106, balanceCents: 0 });
    expect(body).toContain('paid in full');
  });

  test('the invoice mail names the total', () => {
    expect(templates.invoiceCreated({ customerName: 'Ada', invoiceId: 'inv_0002', totalCents: 1106 }).body).toContain('11.06 EUR');
  });
});
`,
  "tests/payments/installments.test.js": raw`const { schedule, nextDue, addMonths } = require('../../src/payments/installments');
const { ValidationError } = require('../../src/shared/errors');

describe('installments', () => {
  test('splits the balance exactly with the remainder first', () => {
    const plan = schedule({ balanceCents: 1106, count: 3, firstDueDate: '2026-02-01' });
    expect(plan.map((part) => part.amountCents)).toEqual([369, 369, 368]);
    expect(plan.map((part) => part.dueDate)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
  });

  test('addMonths clamps to the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  test('nextDue finds the first unpaid part that is due', () => {
    const plan = schedule({ balanceCents: 1000, count: 2, firstDueDate: '2026-02-01' });
    plan[0].paid = true;
    expect(nextDue(plan, '2026-02-15')).toBeNull();
    expect(nextDue(plan, '2026-03-01').number).toBe(2);
  });

  test('rejects one installment and a bad first day', () => {
    expect(() => schedule({ balanceCents: 1000, count: 1, firstDueDate: '2026-02-01' })).toThrow(ValidationError);
    expect(() => schedule({ balanceCents: 1000, count: 2, firstDueDate: 'soon' })).toThrow(/must be a date/);
  });
});
`,
  "tests/payments/payments.test.js": raw`const payments = require('../../src/payments/service');
const invoices = require('../../src/invoices/service');
const { makeInvoice, makePayment, DEFAULT_TOTAL_CENTS } = require('../factory');
const { PaymentError, ConflictError, ValidationError } = require('../../src/shared/errors');

describe('payments service', () => {
  test('a payment of the whole balance marks the invoice paid', () => {
    const invoice = makeInvoice();
    makePayment(invoice);
    expect(invoices.get(invoice.id).status).toBe('paid');
  });

  test('a partial payment leaves it partially_paid with the balance', () => {
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 400 });
    expect(invoices.get(invoice.id).status).toBe('partially_paid');
    expect(invoices.outstanding(invoices.get(invoice.id))).toBe(DEFAULT_TOTAL_CENTS - 400);
  });

  test('rejects a payment above the balance', () => {
    const invoice = makeInvoice();
    expect(() => makePayment(invoice, { amountCents: DEFAULT_TOTAL_CENTS + 1 })).toThrow(PaymentError);
  });

  test('rejects a payment on a void invoice', () => {
    const invoice = makeInvoice();
    invoices.voidInvoice(invoice.id);
    expect(() => makePayment(invoice, { amountCents: 100 })).toThrow(ConflictError);
  });

  test('a payment announces itself on the bus with the remaining balance', () => {
    const { bus } = require('../../src/shared/events/bus');
    const events = [];
    bus.on('payment.received', (event) => events.push(event));
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 400 });
    expect(events).toEqual([
      { paymentId: expect.stringMatching(/^pay_/), invoiceId: invoice.id, customerId: invoice.customerId, amountCents: 400, balanceCents: DEFAULT_TOTAL_CENTS - 400 },
    ]);
  });

  test('forInvoice rejects an unknown invoice', () => {
    expect(() => payments.forInvoice('inv_0404')).toThrow(/not found/);
  });

  test('two payments add up to paid', () => {
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 500 });
    makePayment(invoice);
    expect(invoices.get(invoice.id)).toMatchObject({ status: 'paid', paidCents: DEFAULT_TOTAL_CENTS });
  });

  test('rejects an unknown method', () => {
    const invoice = makeInvoice();
    expect(() => makePayment(invoice, { method: 'barter' })).toThrow(ValidationError);
  });

  test('rejects a refund above what was paid', () => {
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 500 });
    expect(() => payments.refund({ invoiceId: invoice.id, amountCents: 600 })).toThrow(/refund exceeds/);
  });

  test('a refund is stored beside the payment', () => {
    const invoice = makeInvoice();
    makePayment(invoice);
    payments.refund({ invoiceId: invoice.id, amountCents: 100 });
    expect(payments.forInvoice(invoice.id).map((row) => row.kind)).toEqual(['payment', 'refund']);
  });

  test('a refund of everything paid reopens the invoice', () => {
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 500 });
    payments.refund({ invoiceId: invoice.id, amountCents: 500 });
    expect(invoices.get(invoice.id).status).toBe('open');
  });
});
`,
  "tests/payments/repository.test.js": raw`const repository = require('../../src/payments/repository');
const payments = require('../../src/payments/service');
const { makeInvoice, makePayment } = require('../factory');

describe('payments repository', () => {
  test('netPaidCents is payments minus refunds', () => {
    const invoice = makeInvoice();
    makePayment(invoice, { amountCents: 800 });
    payments.refund({ invoiceId: invoice.id, amountCents: 300 });
    expect(repository.netPaidCents(invoice.id)).toBe(500);
  });

  test('netPaidCents is zero for an invoice with no rows', () => {
    expect(repository.netPaidCents('inv_0001')).toBe(0);
  });

  test('forInvoice only returns that invoice', () => {
    const first = makeInvoice();
    const second = makeInvoice();
    makePayment(first);
    expect(repository.forInvoice(second.id)).toEqual([]);
  });
});
`,
  "tests/payments/routes.test.js": raw`const routes = require('../../src/payments/routes');
const { makeInvoice } = require('../factory');

describe('payments routes', () => {
  test('POST records a payment and returns 201', () => {
    const invoice = makeInvoice();
    const response = routes.record({ params: { invoiceId: invoice.id }, body: { amountCents: 100, method: 'cash' } });
    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('payment');
  });

  test('an overpayment is a 422', () => {
    const invoice = makeInvoice();
    expect(routes.record({ params: { invoiceId: invoice.id }, body: { amountCents: 999999, method: 'cash' } }).status).toBe(422);
  });

  test('a refund above the payments is a client error', () => {
    const invoice = makeInvoice();
    const response = routes.refund({ params: { invoiceId: invoice.id }, body: { amountCents: 100 } });
    expect(response.status).toBe(422);
  });

  test('a payment with an unknown method is a 400', () => {
    const invoice = makeInvoice();
    const response = routes.record({ params: { invoiceId: invoice.id }, body: { amountCents: 100, method: 'barter' } });
    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe('method');
  });

  test('a payment on an unknown invoice is a 404', () => {
    expect(routes.record({ params: { invoiceId: 'inv_0404' }, body: { amountCents: 100, method: 'cash' } }).status).toBe(404);
  });

  test('a fractional amount is a 400', () => {
    const invoice = makeInvoice();
    expect(routes.record({ params: { invoiceId: invoice.id }, body: { amountCents: 10.5, method: 'cash' } }).status).toBe(400);
  });

  test('GET lists the invoice payments', () => {
    const invoice = makeInvoice();
    routes.record({ params: { invoiceId: invoice.id }, body: { amountCents: 100, method: 'cash' } });
    expect(routes.list({ params: { invoiceId: invoice.id } }).body).toHaveLength(1);
  });
});
`,
  "tests/reports/aging.test.js": raw`const { bucketFor, daysBetween } = require('../../src/reports/aging');

describe('aging', () => {
  test('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });

  test.each([[0, '0-30'], [30, '0-30'], [31, '31-60'], [60, '31-60'], [61, '60+']])('%i days is bucket %s', (days, label) => {
    expect(bucketFor(days)).toBe(label);
  });
});
`,
  "tests/reports/csv.test.js": raw`const { toCsv } = require('../../src/reports/csv');

describe('reports csv', () => {
  test('writes a header, one line per row and a total', () => {
    const csv = toCsv([{ key: '2026-01', totalCents: 1106, count: 1 }, { key: '2026-02', totalCents: 2000, count: 2 }]);
    expect(csv).toBe('key,count,total\n2026-01,1,11.06\n2026-02,2,20.00\ntotal,3,31.06\n');
  });

  test('quotes keys that contain commas', () => {
    expect(toCsv([{ key: 'Doe, Jane', totalCents: 100, count: 1 }])).toContain('"Doe, Jane",1,1.00');
  });
});
`,
  "tests/reports/routes.test.js": raw`const routes = require('../../src/reports/routes');
const { makeInvoice } = require('../factory');

describe('reports routes', () => {
  test('aging rejects a malformed asOf', () => {
    expect(routes.aging({ query: { asOf: '31/01/2026' } }).status).toBe(400);
  });

  test('outstanding lists unpaid invoices', () => {
    makeInvoice();
    expect(routes.outstanding().body.rows).toHaveLength(1);
  });

  test('average is in cents', () => {
    makeInvoice();
    expect(routes.average().body.averageCents).toBe(1106);
  });
});
`,
  "tests/reports/service.test.js": raw`const reports = require('../../src/reports/service');
const clock = require('../../src/shared/clock');
const { makeInvoice, makePayment, makeCustomer, DEFAULT_TOTAL_CENTS } = require('../factory');

const { topCustomers } = require('../../src/reports/top-customers');
const invoicesService = require('../../src/invoices/service');

describe('top customers', () => {
  test('ranks by billed amount and ignores void invoices', () => {
    const small = makeCustomer();
    const large = makeCustomer();
    makeInvoice({ customerId: small.id });
    makeInvoice({ customerId: large.id, lines: [{ description: 'Big', quantity: 2, unitCents: 5000 }] });
    invoicesService.voidInvoice(makeInvoice({ customerId: small.id }).id);
    const rows = topCustomers();
    expect(rows.map((row) => row.key)).toEqual([large.id, small.id]);
    expect(rows[1]).toMatchObject({ totalCents: 1106, count: 1 });
  });

  test('limit cuts the list and must be in range', () => {
    makeInvoice();
    makeInvoice();
    expect(topCustomers(1)).toHaveLength(1);
    expect(() => topCustomers(0)).toThrow(/limit/);
  });
});

describe('reports service', () => {
  test('total adds the totalCents of rows', () => {
    expect(reports.total([{ totalCents: 5 }, { totalCents: 7 }])).toBe(12);
  });

  test('revenue counts only paid invoices, per issue month', () => {
    makePayment(makeInvoice({ issuedAt: '2026-01-10' }));
    makePayment(makeInvoice({ issuedAt: '2026-02-10' }));
    makeInvoice({ issuedAt: '2026-02-11' });
    const { rows, totalCents } = reports.revenueByMonth();
    expect(rows.map((row) => row.key)).toEqual(['2026-01', '2026-02']);
    expect(totalCents).toBe(2 * DEFAULT_TOTAL_CENTS);
  });

  test('outstanding is grouped by customer', () => {
    const customer = makeCustomer();
    makeInvoice({ customerId: customer.id });
    makePayment(makeInvoice({ customerId: customer.id }), { amountCents: 100 });
    const { rows, totalCents } = reports.outstandingByCustomer();
    expect(rows).toHaveLength(1);
    expect(totalCents).toBe(2 * DEFAULT_TOTAL_CENTS - 100);
  });

  test('aging buckets the balance by days since issue', () => {
    makeInvoice({ issuedAt: '2026-01-15' });
    makeInvoice({ issuedAt: '2025-11-01' });
    clock.setNow(new Date('2026-01-31T00:00:00Z'));
    const { rows } = reports.aging();
    expect(rows.map((row) => row.key)).toEqual(['0-30', '60+']);
  });

  test('aging rejects a malformed day', () => {
    expect(() => reports.aging('yesterday')).toThrow(/must be a date/);
  });

  test('paid invoices are not outstanding', () => {
    makePayment(makeInvoice());
    expect(reports.outstandingByCustomer().rows).toEqual([]);
    expect(reports.aging('2026-03-01').totalCents).toBe(0);
  });

  test('averageInvoiceCents rounds half up and is 0 with no invoices', () => {
    expect(reports.averageInvoiceCents()).toBe(0);
    makeInvoice({ taxBps: 0, lines: [{ description: 'x', quantity: 1, unitCents: 1004 }] });
    makeInvoice({ taxBps: 0, lines: [{ description: 'x', quantity: 1, unitCents: 1005 }] });
    expect(reports.averageInvoiceCents()).toBe(1005);
  });
});
`,
  "tests/setup.js": raw`const db = require('../src/db');
const flags = require('../src/flags');
const clock = require('../src/shared/clock');
const logger = require('../src/shared/logger');
const channels = require('../src/notifications/channels');
const { bus } = require('../src/shared/events/bus');

// Every test starts from an empty store, default flags and no subscribers.
beforeEach(() => {
  db.reset();
  flags.reset();
  clock.reset();
  logger.clear();
  channels.clearOutbox();
  bus.clear();
});
`,
  "tests/shared/bus.test.js": raw`const { createBus } = require('../../src/shared/events/bus');
const logger = require('../../src/shared/logger');

describe('event bus', () => {
  test('delivers a payload to every subscriber of a topic', () => {
    const bus = createBus();
    const seen = [];
    bus.on('a', (payload) => seen.push(['one', payload]));
    bus.on('a', (payload) => seen.push(['two', payload]));
    bus.emit('a', 7);
    expect(seen).toEqual([['one', 7], ['two', 7]]);
  });

  test('unsubscribe stops delivery', () => {
    const bus = createBus();
    const off = bus.on('a', () => 1);
    off();
    expect(bus.count('a')).toBe(0);
  });

  test('a failing subscriber is logged and does not stop the others', () => {
    const bus = createBus();
    bus.on('a', () => { throw new Error('boom'); });
    bus.on('a', () => 'fine');
    expect(bus.emit('a', null)).toEqual(['fine']);
    expect(logger.entries()[0].message).toBe('event handler failed');
  });
});
`,
  "tests/shared/clock-ids.test.js": raw`const clock = require('../../src/shared/clock');
const ids = require('../../src/shared/ids');
const logger = require('../../src/shared/logger');
const db = require('../../src/db');

describe('clock, ids, logger and db reset', () => {
  test('setNow fixes the clock and reset releases it', () => {
    clock.setNow(new Date('2026-05-05T12:00:00Z'));
    expect(clock.today()).toBe('2026-05-05');
    clock.reset();
    expect(clock.now().getTime()).toBeGreaterThan(Date.parse('2026-05-06T00:00:00Z'));
  });

  test('ids count per prefix and start again after a reset', () => {
    expect(ids.nextId('abc')).toBe('abc_0001');
    expect(ids.nextId('abc')).toBe('abc_0002');
    expect(ids.nextId('xyz')).toBe('xyz_0001');
    db.reset();
    expect(ids.nextId('abc')).toBe('abc_0001');
  });

  test('logger keeps entries until cleared', () => {
    logger.warn('careful', { id: 1 });
    expect(logger.entries()).toEqual([{ level: 'warn', message: 'careful', id: 1 }]);
    logger.clear();
    expect(logger.entries()).toEqual([]);
  });

  test('db.reset empties every table', () => {
    db.table('things').set('a', 1);
    db.reset();
    expect(db.table('things').size).toBe(0);
  });
});
`,
  "tests/shared/collections.test.js": raw`const { groupBy, sortBy, chunk, unique } = require('../../src/shared/collections');

describe('collections', () => {
  test('groupBy keeps first-seen order of keys', () => {
    const groups = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(Array.from(groups.keys())).toEqual(['odd', 'even']);
    expect(groups.get('odd')).toEqual([1, 3, 5]);
  });

  test('sortBy does not mutate its input', () => {
    const input = [3, 1, 2];
    expect(sortBy(input, (n) => n)).toEqual([1, 2, 3]);
    expect(input).toEqual([3, 1, 2]);
  });

  test('chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  test('unique', () => {
    expect(unique([1, 1, 2, 3, 3])).toEqual([1, 2, 3]);
  });
});
`,
  "tests/shared/errors.test.js": raw`const { AppError, ValidationError, NotFoundError, ConflictError, PaymentError } = require('../../src/shared/errors');

describe('error hierarchy', () => {
  test.each([
    [new ValidationError('name', 'is required'), 400, 'validation_failed'],
    [new NotFoundError('invoice', 'inv_0001'), 404, 'not_found'],
    [new ConflictError('already there'), 409, 'conflict'],
    [new PaymentError('too much'), 422, 'payment_rejected'],
  ])('%s carries its status and code', (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  test('the name is the subclass name', () => {
    expect(new PaymentError('x').name).toBe('PaymentError');
  });
});
`,
  "tests/shared/http.test.js": raw`const { handle, toResponse, ok } = require('../../src/shared/http');
const { NotFoundError } = require('../../src/shared/errors');
const logger = require('../../src/shared/logger');

describe('http helpers', () => {
  test('an AppError keeps its status', () => {
    const response = toResponse(new NotFoundError('invoice', 'inv_0009'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  test('a plain Error is an opaque 500', () => {
    const response = toResponse(new Error('secret detail'));
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('internal error');
    expect(logger.entries()[0].level).toBe('error');
  });

  test('handle turns a thrown error into a response', () => {
    const route = handle(() => { throw new NotFoundError('x', '1'); });
    expect(route().status).toBe(404);
    expect(handle(() => ok({ fine: true }))().body).toEqual({ fine: true });
  });
});
`,
  "tests/shared/money.test.js": raw`const money = require('../../src/shared/money');
const { ValidationError } = require('../../src/shared/errors');

describe('money', () => {
  test('round is half up', () => {
    expect(money.round(100.5)).toBe(101);
    expect(money.round(100.4)).toBe(100);
  });

  test('toCents converts major units and rejects non-numbers', () => {
    expect(money.toCents(12.34)).toBe(1234);
    expect(() => money.toCents('12')).toThrow(ValidationError);
  });

  test('percentOf takes basis points', () => {
    expect(money.percentOf(1005, 1000)).toBe(101);
    expect(money.percentOf(1000, 0)).toBe(0);
  });

  test('split keeps the total and gives the remainder to the first parts', () => {
    expect(money.split(100, 3)).toEqual([34, 33, 33]);
    expect(money.sum(money.split(1001, 7))).toBe(1001);
  });

  test('percentOf rounds the half cent up', () => {
    expect(money.percentOf(5, 1000)).toBe(1);
    expect(money.percentOf(4, 1000)).toBe(0);
    expect(money.percentOf(1015, 1000)).toBe(102);
  });

  test('toCents rounds float noise away', () => {
    expect(money.toCents(0.1 + 0.2)).toBe(30);
    expect(money.toCents(19.99)).toBe(1999);
  });

  test('split rejects nothing but handles one part', () => {
    expect(money.split(7, 1)).toEqual([7]);
    expect(money.split(0, 4)).toEqual([0, 0, 0, 0]);
  });

  test('sum of nothing is zero', () => {
    expect(money.sum([])).toBe(0);
  });

  test('format prints two decimals and the currency', () => {
    expect(money.format(1234)).toBe('12.34 EUR');
    expect(money.format(5)).toBe('0.05 EUR');
    expect(money.format(-250)).toBe('-2.50 EUR');
  });
});
`,
  "tests/shared/pagination.test.js": raw`const { paginate } = require('../../src/shared/pagination');
const { ValidationError } = require('../../src/shared/errors');

describe('paginate', () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  test('returns the requested page and the total', () => {
    const page = paginate(items, { page: 3, pageSize: 20 });
    expect(page.items).toEqual([40, 41, 42, 43, 44]);
    expect(page.total).toBe(45);
  });

  test('defaults to the first page of 20', () => {
    expect(paginate(items).items).toHaveLength(20);
  });

  test('rejects a page below 1', () => {
    expect(() => paginate(items, { page: 0 })).toThrow(ValidationError);
  });
});
`,
  "tests/shared/retry.test.js": raw`const { retry } = require('../../src/shared/retry');

describe('retry', () => {
  test('returns the first success', () => {
    expect(retry(() => 'ok')).toBe('ok');
  });

  test('retries until it works', () => {
    let calls = 0;
    const result = retry(() => {
      calls += 1;
      if (calls < 3) throw new Error('flaky');
      return calls;
    });
    expect(result).toBe(3);
  });

  test('rethrows the last error and reports each failure', () => {
    const seen = [];
    expect(() => retry(() => { throw new Error('down'); }, { attempts: 2, onFailure: (e, n) => seen.push(n) })).toThrow('down');
    expect(seen).toEqual([1, 2]);
  });
});
`,
  "tests/shared/strings.test.js": raw`const { slug, truncate, titleCase, plural } = require('../../src/shared/strings');

describe('strings', () => {
  test('slug lowercases and joins with dashes', () => {
    expect(slug('  Annual Hosting, 2026! ')).toBe('annual-hosting-2026');
  });

  test('truncate keeps short text and cuts long text with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a long sentence here', 10)).toBe('a long se…');
  });

  test('titleCase', () => {
    expect(titleCase('ada  LOVELACE')).toBe('Ada Lovelace');
  });

  test('plural', () => {
    expect(plural(1, 'invoice')).toBe('1 invoice');
    expect(plural(0, 'invoice')).toBe('0 invoices');
  });
});
`,
  "tests/shared/validation-date.test.js": raw`const { validateDate } = require('../../src/shared/validation');
const { ValidationError } = require('../../src/shared/errors');

describe('validateDate', () => {
  test('accepts a calendar day and a Date', () => {
    expect(validateDate('2026-02-28', 'day')).toBe('2026-02-28');
    expect(validateDate(new Date('2026-03-01T10:00:00Z'), 'day')).toBe('2026-03-01');
  });

  test('rejects a day that does not exist', () => {
    expect(() => validateDate('2026-02-30', 'day')).toThrow(ValidationError);
  });

  test('rejects other formats', () => {
    expect(() => validateDate('31/01/2026', 'day')).toThrow(/must be a date/);
    expect(() => validateDate(20260131, 'day')).toThrow(ValidationError);
  });
});
`,
  "tests/shared/validation-range.test.js": raw`const { validateRange } = require('../../src/shared/validation');
const { ValidationError } = require('../../src/shared/errors');

describe('validateRange', () => {
  test('returns the value inside the bounds', () => {
    expect(validateRange(5, { min: 1, max: 10 }, 'n')).toBe(5);
    expect(validateRange(1, { min: 1 }, 'n')).toBe(1);
  });

  test('throws below the minimum and above the maximum', () => {
    expect(() => validateRange(0, { min: 1 }, 'n')).toThrow(ValidationError);
    expect(() => validateRange(11, { max: 10 }, 'n')).toThrow(/must not be after 10/);
  });

  test('compares calendar days', () => {
    expect(validateRange('2026-03-01', { min: '2026-02-01' }, 'day')).toBe('2026-03-01');
    expect(() => validateRange('2026-01-31', { min: '2026-02-01' }, 'day')).toThrow(/must not be before 2026-02-01/);
  });

  test('names the field on the error', () => {
    try {
      validateRange(0, { min: 1 }, 'quantity');
    } catch (error) {
      expect(error.field).toBe('quantity');
      expect(error.status).toBe(400);
    }
  });
});
`,
  "tests/shared/validation-string.test.js": raw`const { validateString, validateEmail, validateId, validateCents, validateRequired } = require('../../src/shared/validation');
const { ValidationError } = require('../../src/shared/errors');

describe('string, email, id, cents and required validators', () => {
  test('validateString trims and enforces length', () => {
    expect(validateString('  Ada ', 'name')).toBe('Ada');
    expect(() => validateString('   ', 'name')).toThrow(ValidationError);
    expect(() => validateString('x'.repeat(201), 'name')).toThrow(/at most 200/);
  });

  test('validateEmail lowercases and rejects garbage', () => {
    expect(validateEmail('Ada@Example.Test')).toBe('ada@example.test');
    expect(() => validateEmail('ada')).toThrow(ValidationError);
  });

  test('validateId checks the prefix', () => {
    expect(validateId('inv_0001', 'id', 'inv')).toBe('inv_0001');
    expect(() => validateId('cus_0001', 'id', 'inv')).toThrow(ValidationError);
  });

  test('validateCents wants whole positive cents', () => {
    expect(validateCents(100, 'amount')).toBe(100);
    expect(() => validateCents(1.5, 'amount')).toThrow(/whole number/);
    expect(() => validateCents(0, 'amount')).toThrow(ValidationError);
    expect(validateCents(0, 'amount', { allowZero: true })).toBe(0);
  });

  test('validateEmail rejects an address with spaces and a missing domain', () => {
    expect(() => validateEmail('ada lovelace@example.test')).toThrow(ValidationError);
    expect(() => validateEmail('ada@example')).toThrow(ValidationError);
  });

  test('validateId rejects a short counter', () => {
    expect(() => validateId('inv_1', 'id', 'inv')).toThrow(/like inv_0001/);
  });

  test('validateString rejects a non-string', () => {
    expect(() => validateString(5, 'name')).toThrow(/must be a string/);
  });

  test('validateCents has an upper bound', () => {
    expect(() => validateCents(100000001, 'amount')).toThrow(/must not be after/);
  });

  test('validateRequired rejects missing values', () => {
    expect(validateRequired(0, 'n')).toBe(0);
    expect(() => validateRequired(undefined, 'n')).toThrow(/is required/);
  });
});
`,
};

/**
 * A refund never updates the invoice status and payments/repository.netPaidCents counts refunds as payments, so a partial
 * refund leaves a paid invoice 'paid'; the over-refund guard throws a bare Error, which http turns into a 500.
 * Both source files must change to fix it. The four tests that cover refunds are left out of the tree.
 */
export const APP_REFUND_BUG = {
  "src/payments/repository.js": raw`const db = require('../db');

const rows = () => db.table('payments');

const insert = (payment) => { rows().set(payment.id, payment); return payment; };
const get = (id) => rows().get(id) || null;
const list = () => Array.from(rows().values());
const forInvoice = (invoiceId) => list().filter((payment) => payment.invoiceId === invoiceId);

// Everything recorded against the invoice, in cents.
function netPaidCents(invoiceId) {
  return forInvoice(invoiceId).reduce((net, payment) => net + payment.amountCents, 0);
}

module.exports = { insert, get, list, forInvoice, netPaidCents };
`,
  "src/payments/service.js": raw`const repository = require('./repository');
const invoices = require('../invoices/service');
const { createPayment, KIND } = require('./model');
const { validateMethod } = require('./methods');
const { STATUS } = require('../invoices/status');
const { PaymentError, ConflictError } = require('../shared/errors');
const { validateCents, validateString } = require('../shared/validation');
const { bus } = require('../shared/events/bus');
const TOPICS = require('../shared/events/topics');
const { nextId } = require('../shared/ids');
const clock = require('../shared/clock');

// Stores the payment, brings the invoice status up to date and announces it.
function recordPayment({ invoiceId, amountCents, method, reference = '' }) {
  validateCents(amountCents, 'amountCents');
  validateMethod(method);
  const invoice = invoices.get(invoiceId);
  if (invoice.status === STATUS.VOID) throw new ConflictError('invoice ' + invoiceId + ' is void', { invoiceId });
  const balanceBefore = invoices.outstanding(invoice);
  if (amountCents > balanceBefore) {
    throw new PaymentError('payment exceeds the balance of ' + balanceBefore + ' cents', { invoiceId, balanceBefore });
  }
  const payment = repository.insert(
    createPayment({ id: nextId('pay'), invoiceId, amountCents, method, reference: validateString(reference, 'reference', { min: 0 }), recordedAt: clock.now().toISOString() }),
  );
  const updated = invoices.syncStatus(invoiceId, repository.netPaidCents(invoiceId));
  bus.emit(TOPICS.PAYMENT_RECEIVED, {
    paymentId: payment.id,
    invoiceId,
    customerId: invoice.customerId,
    amountCents,
    balanceCents: invoices.outstanding(updated),
  });
  return payment;
}

function refund({ invoiceId, amountCents, reference = '' }) {
  validateCents(amountCents, 'amountCents');
  const invoice = invoices.get(invoiceId);
  const net = repository.netPaidCents(invoiceId);
  if (amountCents > net) {
    throw new Error('refund exceeds the ' + net + ' cents paid');
  }
  const payment = repository.insert(
    createPayment({ id: nextId('pay'), invoiceId, kind: KIND.REFUND, amountCents, reference: validateString(reference, 'reference', { min: 0 }), recordedAt: clock.now().toISOString() }),
  );
  bus.emit(TOPICS.PAYMENT_REFUNDED, { paymentId: payment.id, invoiceId, customerId: invoice.customerId, amountCents });
  return payment;
}

function forInvoice(invoiceId) {
  invoices.get(invoiceId);
  return repository.forInvoice(invoiceId);
}

module.exports = { recordPayment, refund, forInvoice };
`,
};

/** Titles of the tests the bug tree drops, per file. */
export const APP_REFUND_BUG_DROPPED_TESTS = {
  "tests/payments/payments.test.js": "a refund of everything paid reopens the invoice",
  "tests/payments/routes.test.js": "a refund above the payments is a client error",
  "tests/payments/repository.test.js": "netPaidCents is payments minus refunds",
  "tests/app.test.js": "refunds are routed"
};

/** Removes one `  test('title', ...)` block (and the blank line after it) from a jest file. */
export function withoutTest(source, title) {
  const start = source.indexOf("  test('" + title + "'");
  if (start === -1 || source.indexOf("  test('" + title + "'", start + 1) !== -1) {
    throw new Error('expected exactly one test titled ' + title);
  }
  const close = '\n  });\n';
  const end = source.indexOf(close, start) + close.length;
  let before = source.slice(0, start);
  let after = source.slice(end);
  if (after.startsWith('\n')) after = after.slice(1);
  else before = before.replace(/\n$/, '');
  return before + after;
}

/** Applies [from, to] pairs to one base file; throws unless each `from` occurs exactly once, so a base edit cannot slip past this variant. */
function swap(file, ...pairs) {
  return pairs.reduce((text, [from, to]) => {
    if (text.split(from).length !== 2) throw new Error(`${file}: anchor not found exactly once: ${from}`);
    return text.replace(from, () => to);
  }, APP_FILES[file]);
}

/**
 * Overrides for `ts-app-medium-deep`, the investigate variant: a customer segment counts only the invoices of a rolling window
 * (customers/window.js, config.segmentWindowDays, a `since` filter in the invoices repository), and PATCH /customers/:id passes
 * through a field whitelist (customers/patch.js). The base files stay as they are for the plan, task, init and review cases.
 */
export const APP_DEEP = {
  'src/config.js': swap('src/config.js', ['  agingBucketsDays: [30, 60],\n', '  agingBucketsDays: [30, 60],\n  segmentWindowDays: 365,\n']),
  'src/invoices/repository.js': swap('src/invoices/repository.js', [
    `const list = ({ customerId, status } = {}) =>
  Array.from(rows().values()).filter(
    (invoice) => (customerId === undefined || invoice.customerId === customerId) && (status === undefined || invoice.status === status),
  );`,
    `const list = ({ customerId, status, since } = {}) =>
  Array.from(rows().values()).filter(
    (invoice) =>
      (customerId === undefined || invoice.customerId === customerId) &&
      (status === undefined || invoice.status === status) &&
      (since === undefined || invoice.issuedAt >= since),
  );`,
  ]),
  'src/customers/window.js': raw`const config = require('../config');
const clock = require('../shared/clock');

// First issue day that still counts towards a segment.
function startOfWindow() {
  const start = clock.now();
  start.setUTCDate(start.getUTCDate() - config.segmentWindowDays);
  return start.toISOString().slice(0, 10);
}

module.exports = { startOfWindow };
`,
  'src/customers/segments.js': swap(
    'src/customers/segments.js',
    ["const money = require('../shared/money');\n", "const money = require('../shared/money');\nconst window = require('./window');\n"],
    [
      `// Lifetime billed amount of a customer, in cents.
function lifetimeCents(customerId) {
  return money.sum(invoices.list({ customerId }).map(invoices.total));
}`,
      `// Billed amount of a customer over the segment window, in cents.
function lifetimeCents(customerId) {
  return money.sum(invoices.list({ customerId, since: window.startOfWindow() }).map(invoices.total));
}`,
    ],
  ),
  'src/customers/patch.js': raw`const { validateString, validateEmail } = require('../shared/validation');

// The fields a PATCH may change, each with its check; anything else in the body is dropped.
const FIELDS = {
  name: (value) => validateString(value, 'name'),
  email: (value) => validateEmail(value),
  phone: (value) => value,
};

function pick(patch) {
  const next = {};
  for (const [field, check] of Object.entries(FIELDS)) {
    if (patch[field] !== undefined) next[field] = check(patch[field]);
  }
  return next;
}

module.exports = { FIELDS, pick };
`,
  'src/customers/service.js': swap(
    'src/customers/service.js',
    ["const { createCustomer } = require('./model');\n", "const { createCustomer } = require('./model');\nconst patchable = require('./patch');\n"],
    [
      `  const next = {};
  if (patch.name !== undefined) next.name = validateString(patch.name, 'name');
  if (patch.email !== undefined) {
    next.email = validateEmail(patch.email);
    const other = repository.findByEmail(next.email);
    if (other !== null && other.id !== id) throw new ConflictError('a customer with this email exists', { email: next.email });
  }
  if (patch.phone !== undefined) next.phone = patch.phone;
  return repository.update(id, next);`,
      `  const next = patchable.pick(patch);
  if (next.email !== undefined) {
    const other = repository.findByEmail(next.email);
    if (other !== null && other.id !== id) throw new ConflictError('a customer with this email exists', { email: next.email });
  }
  return repository.update(id, next);`,
    ],
  ),
};

/**
 * Overrides for `ts-app-medium-plan`, the plan variant: existing mechanisms a plan has to find and build on rather than
 * reinvent. Payment terms (config.paymentTermsDays, invoices/terms.dueDateFor over shared/dates.addDays) already print a
 * pay-by day on the invoice mail without storing it; config.overdueGraceDays is Finance's definition of overdue; PATCH
 * /customers/:id goes through a field whitelist (customers/patch.js) with a shared validateBoolean; money.toDecimal is
 * the decimal formatter of the reports CSV, and shared/http.attachment serves the revenue CSV download; the refund event
 * carries no customerId; tests/architecture.test.js forbids src/notifications from requiring invoices, payments or reports.
 * Facts a plan has to connect, not just find: the back office can change a customer's terms (customers/patch.js), so a
 * due date derived later drifts from the one mailed; days count in Finance's zone (clock.businessDay, docs Days); the
 * invoice page is a view that hides fields and shows a void invoice at 0; the gateway caches /reports for an hour.
 * The base files stay as they are for the task, init, review and investigate cases.
 */
const swapIn = (file, ...pairs) => ({ [file]: swap(file, ...pairs) });

export const APP_PLAN = {
  ...swapIn('src/config.js', [
    '  agingBucketsDays: [30, 60],\n',
    `  agingBucketsDays: [30, 60],
  // Days from the issue day to the pay-by day printed on the invoice mail (invoices/terms.js), unless the back office
  // gave the customer terms of their own.
  paymentTermsDays: 30,
  // Finance counts an invoice as overdue only once this many days past its due date have gone by.
  overdueGraceDays: 5,
  // Finance's calendar (shared/clock.businessDay).
  timeZone: 'Europe/Berlin',
`,
  ]),
  ...swapIn('src/shared/clock.js', [
    'const today = () => now().toISOString().slice(0, 10);\n',
    `// The UTC day, for stamps on records.
const today = () => now().toISOString().slice(0, 10);
// The calendar day in Finance's time zone: at 23:30 UTC it is already the next day in Berlin. See docs/architecture.md, Days.
const businessDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(now());
`,
  ], ['let fixed = null;\n', "const config = require('../config');\n\nlet fixed = null;\n"], ['module.exports = { now, today, setNow, reset };', 'module.exports = { now, today, businessDay, setNow, reset };']),
  ...swapIn('tests/shared/clock-ids.test.js', [
    `  test('ids count per prefix and start again after a reset', () => {`,
    `  test('the business day is the day in Berlin, not the UTC day', () => {
    clock.setNow(new Date('2026-05-05T22:30:00Z'));
    expect(clock.today()).toBe('2026-05-05');
    expect(clock.businessDay()).toBe('2026-05-06');
  });

  test('ids count per prefix and start again after a reset', () => {`,
  ]),
  ...swapIn('src/customers/model.js', [
    'function createCustomer({ id, name, email, phone = null, receipts = true, createdAt }) {\n  return { id, name, email, phone, receipts, createdAt };',
    '// paymentTermsDays: the customer\'s own terms, set by the back office; null means config.paymentTermsDays.\nfunction createCustomer({ id, name, email, phone = null, receipts = true, paymentTermsDays = null, createdAt }) {\n  return { id, name, email, phone, receipts, paymentTermsDays, createdAt };',
  ]),
  'src/shared/dates.js': raw`const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar arithmetic on YYYY-MM-DD days, in UTC so that a day never shifts with the host time zone.
function addDays(day, days) {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

module.exports = { addDays };
`,
  'src/invoices/terms.js': raw`const config = require('../config');
const { addDays } = require('../shared/dates');

// The day an invoice is payable by: its issue day plus the customer's terms (customers.paymentTermsDays, else the
// default). Printed on the invoice mail; not stored.
function dueDateFor(issuedAt, termsDays) {
  return addDays(issuedAt, termsDays ?? config.paymentTermsDays);
}

module.exports = { dueDateFor };
`,
  ...swapIn(
    'src/invoices/service.js',
    ["const { subtotal } = require('./lines');\n", "const { subtotal } = require('./lines');\nconst { dueDateFor } = require('./terms');\n"],
    ['  customers.get(input.customerId);\n  const invoice', '  const customer = customers.get(input.customerId);\n  const invoice'],
    ['  notifications.sendInvoiceCreated(invoice, total(invoice));\n', '  notifications.sendInvoiceCreated(invoice, total(invoice), dueDateFor(invoice.issuedAt, customer.paymentTermsDays));\n'],
  ),
  ...swapIn(
    'src/invoices/routes.js',
    ["const { paginate } = require('../shared/pagination');\n", `const { paginate } = require('../shared/pagination');
const { STATUS } = require('./status');

// The invoice page: what the customer sees. A void invoice shows a total of 0, since nothing is owed on it; internal
// fields such as notes stay out.
const view = (invoice) => ({
  id: invoice.id,
  customerId: invoice.customerId,
  status: invoice.status,
  issuedAt: invoice.issuedAt,
  lines: invoice.lines,
  taxBps: invoice.taxBps,
  paidCents: invoice.paidCents,
  totalCents: invoice.status === STATUS.VOID ? 0 : service.total(invoice),
});
`],
    [
      `const create = handle((req) => created({ ...service.create(req.body) }));
const get = handle((req) => {
  const invoice = service.get(req.params.invoiceId);
  return ok({ ...invoice, totalCents: service.total(invoice) });
});
const list = handle((req) => ok(paginate(service.list(req.query), req.query)));
const voidInvoice = handle((req) => ok(service.voidInvoice(req.params.invoiceId)));`,
      `const create = handle((req) => created(view(service.create(req.body))));
const get = handle((req) => ok(view(service.get(req.params.invoiceId))));
const list = handle((req) => ok(paginate(service.list(req.query).map(view), req.query)));
const voidInvoice = handle((req) => ok(view(service.voidInvoice(req.params.invoiceId))));`,
    ],
  ),
  ...swapIn('tests/invoices/routes.test.js', [
    `  test('void returns 409 once the invoice has payments', () => {`,
    `  test('the page leaves internal notes out', () => {
    const invoice = makeInvoice({ notes: 'call before chasing' });
    expect(routes.get({ params: { invoiceId: invoice.id } }).body.notes).toBeUndefined();
  });

  test('a void invoice shows a total of 0', () => {
    const invoice = makeInvoice();
    routes.voidInvoice({ params: { invoiceId: invoice.id } });
    expect(routes.get({ params: { invoiceId: invoice.id } }).body.totalCents).toBe(0);
  });

  test('void returns 409 once the invoice has payments', () => {`,
  ]),
  ...swapIn(
    'src/notifications/service.js',
    [
      `function sendInvoiceCreated(invoice, totalCents) {
  const contact = customers.contactFor(invoice.customerId);
  const message = templates.invoiceCreated({ customerName: contact.name, invoiceId: invoice.id, totalCents });`,
      `function sendInvoiceCreated(invoice, totalCents, payableBy) {
  const contact = customers.contactFor(invoice.customerId);
  const message = templates.invoiceCreated({ customerName: contact.name, invoiceId: invoice.id, totalCents, payableBy });`,
    ],
  ),
  ...swapIn('src/notifications/templates.js', [
    `function invoiceCreated({ customerName, invoiceId, totalCents }) {
  return {
    subject: 'Invoice ' + invoiceId,
    body: 'Hello ' + customerName + ', invoice ' + invoiceId + ' for ' + money.format(totalCents) + ' is ready.',
  };
}`,
    `function invoiceCreated({ customerName, invoiceId, totalCents, payableBy }) {
  return {
    subject: 'Invoice ' + invoiceId,
    body: 'Hello ' + customerName + ', invoice ' + invoiceId + ' for ' + money.format(totalCents) + ' is ready. Please pay by ' + payableBy + '.',
  };
}`,
  ]),
  ...swapIn('tests/notifications/templates.test.js', [
    `  test('the invoice mail names the total', () => {
    expect(templates.invoiceCreated({ customerName: 'Ada', invoiceId: 'inv_0002', totalCents: 1106 }).body).toContain('11.06 EUR');
  });`,
    `  test('the invoice mail names the total and the pay-by day', () => {
    const { body } = templates.invoiceCreated({ customerName: 'Ada', invoiceId: 'inv_0002', totalCents: 1106, payableBy: '2026-02-14' });
    expect(body).toContain('11.06 EUR');
    expect(body).toContain('Please pay by 2026-02-14.');
  });`,
  ]),
  'tests/invoices/terms.test.js': raw`const { dueDateFor } = require('../../src/invoices/terms');
const { addDays } = require('../../src/shared/dates');
const notifications = require('../../src/notifications/repository');
const customers = require('../../src/customers/service');
const { makeInvoice, makeCustomer } = require('../factory');

describe('payment terms', () => {
  test('an invoice is payable thirty days after its issue day', () => {
    expect(dueDateFor('2026-01-15')).toBe('2026-02-14');
    expect(dueDateFor('2026-12-15')).toBe('2027-01-14');
  });

  test('addDays crosses month ends and goes backwards', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('the invoice mail prints the pay-by day', () => {
    const invoice = makeInvoice({ issuedAt: '2026-01-15' });
    const [mail] = notifications.forCustomer(invoice.customerId);
    expect(mail.body).toContain('Please pay by 2026-02-14.');
  });

  test('a customer with terms of their own gets them on the mail', () => {
    const customer = customers.update(makeCustomer().id, { paymentTermsDays: 14 });
    expect(dueDateFor('2026-01-15', 14)).toBe('2026-01-29');
    makeInvoice({ customerId: customer.id, issuedAt: '2026-01-15' });
    expect(notifications.forCustomer(customer.id)[0].body).toContain('Please pay by 2026-01-29.');
  });
});
`,
  'src/shared/validation/boolean.js': raw`const { ValidationError } = require('../errors');

function validateBoolean(value, field) {
  if (value !== true && value !== false) throw new ValidationError(field, 'must be true or false');
  return value;
}

module.exports = { validateBoolean };
`,
  ...swapIn(
    'src/shared/validation/index.js',
    ["const { validateCents } = require('./money');\n", "const { validateCents } = require('./money');\nconst { validateBoolean } = require('./boolean');\n"],
    [
      'module.exports = { validateRequired, validateString, validateEmail, validateId, validateDate, validateRange, validateCents };',
      'module.exports = { validateRequired, validateString, validateEmail, validateId, validateDate, validateRange, validateCents, validateBoolean };',
    ],
  ),
  'src/customers/patch.js': raw`const { validateString, validateEmail, validateBoolean, validateRange } = require('../shared/validation');

// The fields a PATCH may change, each with its check; anything else in the body is dropped.
const FIELDS = {
  name: (value) => validateString(value, 'name'),
  email: (value) => validateEmail(value),
  phone: (value) => value,
  receipts: (value) => validateBoolean(value, 'receipts'),
  // The back office moves a customer to other terms (net 14, net 60) whenever a contract changes.
  paymentTermsDays: (value) => validateRange(value, { min: 0, max: 120 }, 'paymentTermsDays'),
};

function pick(patch) {
  const next = {};
  for (const [field, check] of Object.entries(FIELDS)) {
    if (patch[field] !== undefined) next[field] = check(patch[field]);
  }
  return next;
}

module.exports = { FIELDS, pick };
`,
  ...swapIn(
    'src/customers/service.js',
    ["const { createCustomer } = require('./model');\n", "const { createCustomer } = require('./model');\nconst patchable = require('./patch');\n"],
    [
      `  const next = {};
  if (patch.name !== undefined) next.name = validateString(patch.name, 'name');
  if (patch.email !== undefined) {
    next.email = validateEmail(patch.email);
    const other = repository.findByEmail(next.email);
    if (other !== null && other.id !== id) throw new ConflictError('a customer with this email exists', { email: next.email });
  }
  if (patch.phone !== undefined) next.phone = patch.phone;
  return repository.update(id, next);`,
      `  const next = patchable.pick(patch);
  if (next.email !== undefined) {
    const other = repository.findByEmail(next.email);
    if (other !== null && other.id !== id) throw new ConflictError('a customer with this email exists', { email: next.email });
  }
  return repository.update(id, next);`,
    ],
  ),
  'tests/customers/patch.test.js': raw`const customers = require('../../src/customers/service');
const { makeCustomer } = require('../factory');
const { ValidationError } = require('../../src/shared/errors');

describe('customer patch', () => {
  test('receipts can be switched off and on', () => {
    const customer = makeCustomer();
    expect(customers.update(customer.id, { receipts: false }).receipts).toBe(false);
    expect(customers.update(customer.id, { receipts: true }).receipts).toBe(true);
  });

  test('receipts must be a boolean', () => {
    expect(() => customers.update(makeCustomer().id, { receipts: 'no' })).toThrow(ValidationError);
  });

  test('the back office sets a customer\'s own payment terms', () => {
    const customer = makeCustomer();
    expect(customer.paymentTermsDays).toBeNull();
    expect(customers.update(customer.id, { paymentTermsDays: 60 }).paymentTermsDays).toBe(60);
    expect(() => customers.update(customer.id, { paymentTermsDays: -1 })).toThrow(ValidationError);
  });

  test('fields outside the whitelist are dropped', () => {
    const customer = makeCustomer();
    expect(customers.update(customer.id, { createdAt: 'never', id: 'x' })).toEqual(customer);
  });
});
`,
  ...swapIn(
    'src/shared/money.js',
    [
      `function format(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return sign + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0') + ' ' + CURRENCY;
}`,
      `// Cents as a plain decimal (1234 -> '12.34') for files other programs read; integer arithmetic only.
function toDecimal(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return sign + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

function format(cents) {
  return toDecimal(cents) + ' ' + CURRENCY;
}`,
    ],
    ['module.exports = { CURRENCY, round, toCents, sum, percentOf, split, format };', 'module.exports = { CURRENCY, round, toCents, sum, percentOf, split, toDecimal, format };'],
  ),
  ...swapIn('tests/shared/money.test.js', [
    `  test('format prints two decimals and the currency', () => {`,
    `  test('toDecimal prints cents as a plain decimal', () => {
    expect(money.toDecimal(1106)).toBe('11.06');
    expect(money.toDecimal(5)).toBe('0.05');
    expect(money.toDecimal(-250)).toBe('-2.50');
  });

  test('format prints two decimals and the currency', () => {`,
  ]),
  ...swapIn(
    'src/reports/csv.js',
    ['    lines.push([cell(row.key), row.count, (row.totalCents / 100).toFixed(2)].join(\',\'));', '    lines.push([cell(row.key), row.count, money.toDecimal(row.totalCents)].join(\',\'));'],
    [
      "  lines.push(['total', rows.reduce((n, row) => n + row.count, 0), (money.sum(rows.map((row) => row.totalCents)) / 100).toFixed(2)].join(','));",
      "  lines.push(['total', rows.reduce((n, row) => n + row.count, 0), money.toDecimal(money.sum(rows.map((row) => row.totalCents)))].join(','));",
    ],
  ),
  ...swapIn(
    'src/shared/http.js',
    [
      'const created = (body) => ({ status: 201, body });\n',
      `const created = (body) => ({ status: 201, body });

// A file to download: the body goes out as is, with the headers that make a browser save it under filename.
const attachment = (body, { filename, type = 'text/csv' }) => ({
  status: 200,
  headers: { 'content-type': type, 'content-disposition': 'attachment; filename="' + filename + '"' },
  body,
});
`,
    ],
    ['module.exports = { ok, created, toResponse, handle };', 'module.exports = { ok, created, attachment, toResponse, handle };'],
  ),
  ...swapIn('tests/shared/http.test.js', [
    `  test('handle turns a thrown error into a response', () => {`,
    `  test('attachment names the file and its type', () => {
    expect(attachment('a,b\\n', { filename: 'x.csv' })).toEqual({
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="x.csv"' },
      body: 'a,b\\n',
    });
  });

  test('handle turns a thrown error into a response', () => {`,
  ], ["const { handle, toResponse, ok } = require('../../src/shared/http');", "const { handle, toResponse, ok, attachment } = require('../../src/shared/http');"]),
  ...swapIn(
    'src/reports/service.js',
    ["const { createRow } = require('./model');\n", "const { createRow } = require('./model');\nconst { toCsv } = require('./csv');\n"],
    [
      `function outstandingByCustomer() {`,
      `// The revenue report as a spreadsheet file.
function revenueCsv() {
  return toCsv(revenueByMonth().rows);
}

function outstandingByCustomer() {`,
    ],
    [
      'module.exports = { total, revenueByMonth, outstandingByCustomer, aging, averageInvoiceCents };',
      'module.exports = { total, revenueByMonth, revenueCsv, outstandingByCustomer, aging, averageInvoiceCents };',
    ],
  ),
  ...swapIn(
    'src/reports/routes.js',
    ["const { handle, ok } = require('../shared/http');", "const { handle, ok, attachment } = require('../shared/http');"],
    [
      'const revenue = handle(() => ok(service.revenueByMonth()));\n',
      "const revenue = handle(() => ok(service.revenueByMonth()));\nconst revenueCsv = handle(() => attachment(service.revenueCsv(), { filename: 'revenue.csv' }));\n",
    ],
    ['  revenue,\n  outstanding,', '  revenue,\n  revenueCsv,\n  outstanding,'],
    [
      "    { method: 'GET', path: '/reports/revenue', handler: revenue },\n",
      "    { method: 'GET', path: '/reports/revenue', handler: revenue },\n    { method: 'GET', path: '/reports/revenue.csv', handler: revenueCsv },\n",
    ],
  ),
  ...swapIn('tests/reports/routes.test.js', [
    `  test('average is in cents', () => {`,
    `  test('revenue.csv is a download of the revenue rows', () => {
    makePayment(makeInvoice({ issuedAt: '2026-01-10' }));
    const response = routes.revenueCsv();
    expect(response.headers['content-disposition']).toBe('attachment; filename="revenue.csv"');
    expect(response.body).toBe('key,count,total\\n2026-01,1,11.06\\ntotal,1,11.06\\n');
  });

  test('average is in cents', () => {`,
  ], ["const { makeInvoice } = require('../factory');", "const { makeInvoice, makePayment } = require('../factory');"]),
  ...swapIn('src/payments/service.js', [
    `  const invoice = invoices.get(invoiceId);
  const net = repository.netPaidCents(invoiceId);`,
    `  invoices.get(invoiceId);
  const net = repository.netPaidCents(invoiceId);`,
  ], [
    '  bus.emit(TOPICS.PAYMENT_REFUNDED, { paymentId: payment.id, invoiceId, customerId: invoice.customerId, amountCents });',
    '  bus.emit(TOPICS.PAYMENT_REFUNDED, { paymentId: payment.id, invoiceId, amountCents });',
  ]),
  ...swapIn('docs/architecture.md', [
    'turns a thrown `AppError` into its status and anything else into a logged 500.\n',
    `turns a thrown ${BT}AppError${BT} into its status and anything else into a logged 500.

In production the API gateway caches GET responses under ${BT}/reports${BT} for up to an hour: reports are heavy and may lag.
Every other path is served live.
`,
  ], [
    '## Money\n',
    `## Days

Finance works in Europe/Berlin (${BT}config.timeZone${BT}). Due dates, the overdue grace and anything allowed once per day are
counted in ${BT}clock.businessDay()${BT}; ${BT}clock.today()${BT} is the UTC day and only stamps records.

## Money
`,
  ], [
    'Subscribers are registered once, at start-up, by each feature\'s ',
    `Notifications sits below the billing features: invoices and payments call ${BT}notifications/service${BT} or announce on the
bus, and nothing under ${BT}src/notifications${BT} requires invoices, payments or reports (${BT}tests/architecture.test.js${BT}).
Subscribers are registered once, at start-up, by each feature's `,
  ]),
  'tests/architecture.test.js': raw`// docs/architecture.md: notifications sits below the billing features. Invoices and payments call it or announce on the
// bus; it never requires them back.
const fs = require('fs');
const path = require('path');

const MUST_NOT_REQUIRE = { notifications: ['invoices', 'payments', 'reports'] };

describe('feature dependencies', () => {
  for (const [feature, forbidden] of Object.entries(MUST_NOT_REQUIRE)) {
    const dir = path.join(__dirname, '..', 'src', feature);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
    test.each(files)(feature + '/%s requires none of ' + forbidden.join(', '), (file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const other of forbidden) expect(source).not.toMatch(new RegExp("require\\('\\.\\./" + other + "[/']"));
    });
  }
});
`,
};
