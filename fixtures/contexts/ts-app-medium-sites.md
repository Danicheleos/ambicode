=== overview.md
# Overview of the billing service
## Purpose
- In-memory billing API: customers, invoices, payments, notifications and reports.
- Handlers are plain functions taking { params, query, body } and returning { status, body }; src/app.js mounts them.
## Projects
- app - . - CommonJS service under src/, jest tests under tests/
## Stack
- eslint: lint (npm run lint)
- jest: tests (npm test), setup in tests/setup.js
- node: CommonJS runtime, no build step
=== navigation.md
# Navigation of the billing service
## How to read
- List the module file, open one file, Grep the name, Read with offset/limit; never Read whole large files.
## Entry points
- src/app.js - createApp mounts every feature's routes
- src/config.js - frozen constants
- src/flags.js - feature flags and defaults
## Where things live
- feature code: src/<feature>/{routes,service,repository,model}.js
- feature wiring: src/<feature>/index.js
- in-memory tables: src/db/
- shared helpers: src/shared/
- test data builders: tests/factory.js
- tests: tests/<feature>/*.test.js
## Naming
- files are lower-case, kebab-case for multi-word names (top-customers.js, app-error.js)
- one error class per file under src/shared/errors/
## Grep patterns
- exports of a file: ^module\.exports
- feature routes: routes:
- function declarations: ^function 
=== conventions.md
# Conventions of the billing service
## Code
- Money is integer cents; use src/shared/money for rounding, percentages, splitting and formatting.
- New behaviour that is not ready for everyone goes behind a flag in src/flags.js.
- src/legacy/ is frozen: do not edit it and do not copy from it.
- Validate input with src/shared/validation, not with new checks in a service.
## Errors
- Throw an AppError subclass from src/shared/errors; never throw new Error(...).
## Tests
- Every behaviour change ships with a jest test next to the existing ones for that module.
- Build customers, invoices and payments with tests/factory.js.
- tests/setup.js resets the store, flags, clock and bus before each test.
## Imports
- Routes call services, services call repositories.
- Features reach each other through services or through events on src/shared/events.
=== modules/customers.md
# customers module
## Purpose
- Customer records and contact preferences.
## Key files
- src/customers/index.js - feature wiring - items: routes
- src/customers/model.js - record constructor - items: createCustomer
- src/customers/repository.js - storage access - items: findByEmail, get, insert, list, update
- src/customers/routes.js - HTTP handlers - items: create, get, list, update
- src/customers/segments.js - customer segmentation - items: THRESHOLDS, describe, lifetimeCents, segmentOf
- src/customers/statement.js - account statement - items: statement
- src/customers/service.js - rules and orchestration - items: contactFor, create, get, list, search, setReceipts, update
## Depends on
## Gotchas
- Follow the layer rule in conventions.md.
=== modules/db.md
# db module
## Purpose
- In-memory tables used by the repositories.
## Key files
- src/db/index.js - public table access - items: reset, table
- src/db/store.js - table store - items: reset, table
## Depends on
## Gotchas
- tests/setup.js resets the store before each test.
=== modules/invoices.md
# invoices module
## Purpose
- Invoice records, totals, status and search.
## Key files
- src/invoices/index.js - feature wiring - items: routes
- src/invoices/lines.js - line arithmetic - items: lineTotal, subtotal
- src/invoices/model.js - record constructor - items: createInvoice
- src/invoices/repository.js - storage access - items: get, insert, list, update
- src/invoices/routes.js - HTTP handlers - items: create, get, list, voidInvoice
- src/invoices/search.js - invoice search - items: search
- src/invoices/service.js - rules and orchestration - items: create, get, list, outstanding, syncStatus, taxFor, total, voidInvoice
- src/invoices/status.js - status derivation - items: STATUS, statusFor, isBillable
- src/invoices/summary.js - invoice summary - items: summarize
## Depends on
## Gotchas
=== modules/legacy.md
# legacy module
## Purpose
- Frozen code from before the rewrite.
## Key files
- src/legacy/invoice-export.js - CSV export - items: exportCsv
- src/legacy/invoice-total.js - old total - items: total
- src/legacy/payment-hooks.js - old payment hook - items: notifyPaymentLegacy
## Depends on
## Gotchas
- Do not edit, extend or copy from it.
=== modules/notifications.md
# notifications module
## Purpose
- Notification delivery and per-customer history.
## Key files
- src/notifications/channels.js - delivery channels - items: clearOutbox, email, outbox, sms
- src/notifications/handlers.js - event handlers - items: onPaymentReceived, onPaymentRefunded
- src/notifications/index.js - feature wiring and subscriber registration - items: register, routes
- src/notifications/model.js - record constructor - items: createNotification
- src/notifications/queue.js - delivery queue - items: clear, enqueue, flush, size
- src/notifications/repository.js - storage access - items: forCustomer, insert, list
- src/notifications/routes.js - HTTP handlers - items: forCustomer
- src/notifications/service.js - rules and orchestration - items: deliver, forCustomer, sendInvoiceCreated
- src/notifications/templates.js - message templates - items: invoiceCreated, paymentReceipt
## Depends on
- ../shared/events
## Gotchas
- Subscribers are registered at start-up by index.js register.
=== modules/payments.md
# payments module
## Purpose
- Payments, refunds and installment schedules per invoice.
## Key files
- src/payments/index.js - feature wiring - items: routes
- src/payments/installments.js - installment plans - items: addMonths, nextDue, schedule
- src/payments/methods.js - payment methods - items: METHODS, validateMethod
- src/payments/model.js - record constructor - items: KIND, createPayment
- src/payments/repository.js - storage access - items: forInvoice, get, insert, list, netPaidCents
- src/payments/routes.js - HTTP handlers - items: list, record, refund
- src/payments/service.js - rules and orchestration - items: forInvoice, recordPayment, refund
## Depends on
## Gotchas
- Throw PaymentError, not Error (see conventions.md).
=== modules/reports.md
# reports module
## Purpose
- Revenue, outstanding and aging reports with CSV output.
## Key files
- src/reports/aging.js - aging buckets - items: bucketFor, daysBetween
- src/reports/csv.js - CSV rendering - items: toCsv
- src/reports/index.js - feature wiring - items: routes
- src/reports/model.js - row constructor - items: createRow
- src/reports/repository.js - invoice reads - items: allInvoices, unpaidInvoices
- src/reports/routes.js - HTTP handlers - items: aging, average, outstanding, revenue
- src/reports/service.js - report calculations - items: aging, averageInvoiceCents, outstandingByCustomer, revenueByMonth, total
- src/reports/top-customers.js - ranking - items: topCustomers
## Depends on
## Gotchas
=== modules/shared.md
# shared module
## Purpose
- Cross-feature helpers: money, validation, errors, event bus, clock, ids, logger, pagination, http.
## Key files
- src/shared/clock.js - clock with a test override - items: now, reset, setNow, today
- src/shared/collections.js - collection helpers - items: chunk, groupBy, sortBy, unique
- src/shared/errors/index.js - error classes - items: AppError, ConflictError, NotFoundError, PaymentError, ValidationError
- src/shared/events/bus.js - event bus - items: bus, createBus
- src/shared/events/topics.js - event topic names - items: INVOICE_CREATED, PAYMENT_RECEIVED, PAYMENT_REFUNDED
- src/shared/http.js - response helpers - items: created, handle, ok, toResponse
- src/shared/money.js - integer-cents money helpers - items: CURRENCY, format, percentOf, round, split, sum, toCents
- src/shared/validation/index.js - input validators - items: validateCents, validateDate, validateEmail, validateId, validateRange, validateRequired, validateString
## Depends on
## Gotchas
- shared/http.handle turns an AppError into its status and anything else into a 500.
