---
type: llm
focus: last_message
weight: 2
---

PASS if the answer conveys both points, in any wording:
- The payment receipt goes over the event bus: payments emits payment.received, notifications register (called from createApp) subscribes onPaymentReceived to it, and that handler delivers the mail.
- The invoice-created mail does not go over the bus: the invoices service calls the notifications service's sendInvoiceCreated directly. The invoice.created event is emitted, but no subscriber sends mail for it.
Naming the files or functions differently, or describing the flow in prose, is fine as long as each of the two mails is placed on the right path.
FAIL if it says a subscriber sends the invoice-created mail, says the receipt is sent by a direct call, or presents src/legacy code as part of either path.
