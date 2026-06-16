# Phase 178A — Borrower messaging adapter (DISABLED by default)

- **Status: DISABLED.** `BORROWER_MESSAGING_ENABLED = false`; all transports off.
- File: [src/deals/borrowerMessagingAdapter.ts](../src/deals/borrowerMessagingAdapter.ts).
- Prepares (and only with an explicit, separate transport gate, sends) a borrower
  message after a deal is created. Email / SMS / Graph / Twilio / external HTTP
  are NOT imported (transport injected) and never run by default. Separate gates
  for messaging vs each transport (email / SMS / Twilio). Twilio SMS is a
  documented future capability, gated separately and OFF.
- Outcomes: `disabled`, `skipped_missing_contact`, `skipped_transport_disabled`,
  `skipped_template_missing`, `unauthorized`, `dependency_not_ready`,
  `prepared_not_sent`, `sent`, `failed`, `audit_failed_partial`.
- Missing contact never fails deal create. Prepared and sent are distinct; no
  fake send confirmation. No message before deal create success.
