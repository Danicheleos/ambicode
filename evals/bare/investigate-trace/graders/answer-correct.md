---
type: llm
focus: last_message
weight: 2
---

PASS only if all hold:
- The answer starts at the payments route (src/payments/routes.js) and src/payments/service.js recordPayment, which validates the payment, stores it, updates the invoice status and then emits payment.received on the event bus (src/shared/events/bus.js).
- It says payments never call notifications directly: the hop is the event bus, and the receipt handler is subscribed in src/notifications/index.js (registered at start-up from src/app.js).
- It names the subscriber onPaymentReceived in src/notifications/handlers.js and what it does: checks the receiptEmails flag and the customer's receipts preference, renders the receipt template and sends the email through src/notifications/service.js and channels.js.
- It does not present src/legacy/payment-hooks.js as part of the flow (nothing imports it), and does not name invoices/service sendInvoiceCreated (a direct call on another path) as the notification for a payment.
FAIL otherwise, including when the answer says the payment service sends the notification itself, stops at the emit, or invents a queue, a database or an HTTP framework that is not in the repository.
