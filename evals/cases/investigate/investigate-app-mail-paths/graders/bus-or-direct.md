---
type: llm
focus: last_message
weight: 2
---

PASS only if all hold:
- The payment receipt goes over the bus: payments emits payment.received, notifications.register (called by createApp) subscribed onPaymentReceived to it, and that handler delivers the mail.
- The invoice-created mail does not go over the bus: invoices/service.js create calls notifications sendInvoiceCreated directly. The invoice.created event is emitted but nothing subscribes to it.
FAIL if it says a subscriber sends the invoice-created mail, or presents src/legacy code as part of either path.
