# Phase 173A — Borrower invite automation adapter (DISABLED by default)

- **Status: DISABLED.** `BORROWER_INVITE_AUTOMATION_ENABLED = false`; transports
  off (`BORROWER_EMAIL/SMS/TWILIO_TRANSPORT_ENABLED = false`).
- File: [src/deals/borrowerInviteAutomationAdapter.ts](../src/deals/borrowerInviteAutomationAdapter.ts).
- Prefers prepared-not-sent. No email/SMS/Graph/Twilio/external HTTP is imported
  (transport injected) and none runs by default. Twilio/SMS is a documented
  future capability, gated separately and OFF.
- Outcomes: `disabled`, `skipped_missing_borrower_contact`,
  `skipped_no_borrower_profile`, `unauthorized`, `dependency_not_ready`,
  `prepared_not_sent`, `sent`, `failed`, `audit_failed_partial`.
- Missing borrower email/phone returns a skip and never fails deal create. The
  UI never says "sent" unless transport confirms success. No portal link is
  fabricated. Prepared and sent are distinct states.
