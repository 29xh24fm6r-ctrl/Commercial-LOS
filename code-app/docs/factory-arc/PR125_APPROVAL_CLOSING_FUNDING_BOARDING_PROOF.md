# PR125 — Factory Arc Phase 13: Approval/Closing/Funding/Boarding Proof

## Scoping this phase

The phase's one-line title, "approval/closing/funding/boarding proof," has no dedicated planning doc
defining what "proof" means as a deliverable. Interpreted it as: does every real, live write in these
four workflow areas emit the audit-trail evidence this codebase's "governed write" discipline requires
everywhere else (a `cr664_AuditEvent` at minimum, ideally a `DealTimelineEvent` too)? A write with no
audit trail is exactly the kind of gap an eventual audit/certification exercise would flag as "no
proof this action happened, who did it, or why."

Audited all four areas against the current codebase:

- **Funding** — `src/deals/DealFundingAuthorizationPanel.tsx` used a hard-coded
  `NO_LIVE_AUDIT_SINK: EmitFundingAudit` for every action (request / first approval / full approval /
  reject / revoke / confirm disbursement), self-documented: *"No live audit sink is wired yet for
  funding authorization."* Every one of these is a REAL, durable, deal-scoped Dataverse write (PR 112,
  confirmed live and unconditionally mounted in Phase 10) — landing with **zero audit trail**. This is
  the single most concretely-disclosed, most fixable "no proof" gap found. **Fixed this phase.**
- **Approval** — `creditApprovalAuthority.ts`'s write-time gate (investigated in Phase 12) has no
  separate audit concept of its own; the actual CREDIT_APPROVAL → COMMITMENT stage advance already
  emits audit + timeline via the standard `stageAdvanceWriteDependency.ts` path (`GOVERNED_WRITES`
  entry `deal-stage-advance`). No separate gap found here beyond the funding dual-control actions
  (request/approve/reject/revoke), which this phase's fix now covers.
- **Closing** — `closingDocumentAudit.ts` / `DealClosingDocumentsPanel.tsx` has the IDENTICAL
  `NO_LIVE_AUDIT_SINK`-style stub, but closing-document generation itself has no live persistence at
  all yet (Phase 11 — schema proposal only, not applied). Wiring a live audit sink for a write that
  doesn't durably exist yet would be premature; deferred until Phase 11's schema is applied and a real
  adapter is written.
- **Boarding** — `src/portfolioBoarding/existingLoanEntryAdapter.ts` (the one boarding write path with
  machine-proven smoke evidence, `docs/operator-evidence/final-launch/portfolioBoarding.json`) writes a
  domain-specific `cr664_portfolioboardedloanauditentries` row but never touches the universal
  `cr664_AuditEvent` / `DealTimelineEvent` sinks every other governed write in
  `platformInventory.ts`'s `GOVERNED_WRITES` uses, and has no entry there at all. However, the LIVE
  persistence path this write depends on is gated off by default
  (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false`) — no real write happens in production today,
  so this is a real but lower-urgency gap than funding's (which is live now). **Deferred**, documented
  here rather than silently dropped, as a concrete follow-up: once that flag is armed, the same
  `emitLiveFundingAudit`-style live-audit-sink pattern this phase used for funding should be applied to
  `existingLoanEntryAdapter.ts` too.

## What changed

- **`src/funding/fundingAuditLiveDeps.ts`** (new) — `emitLiveFundingAudit`, a real `EmitFundingAudit`
  implementation. Reuses the SAME canonical `buildNewDealAuditPayload` / `Cr664_auditeventsService`
  path every other deal-scoped lifecycle event in this app already funnels through (the identical
  pattern `documentUploadLiveDeps.ts`'s `emitAudit` uses) — not a new audit mechanism, just the missing
  wire-up. Every action (`requested` / `first_approval` / `fully_approved` / `rejected` / `revoked` /
  `funded`) maps to a distinct, honest event name; all are recorded as `AUDIT_OUTCOME_SUCCEEDED`
  lifecycle events (a rejection or revocation is a legitimate governed OUTCOME of the funding process,
  not an audit "failure" — the distinction lives in the event name/notes, not the outcome code).
- **`src/deals/DealFundingAuthorizationPanel.tsx`** — replaced `NO_LIVE_AUDIT_SINK` with
  `emitLiveFundingAudit` at all 5 call sites (request/approve/reject/revoke/confirm). Updated the
  header comment (previously disclosed "a no-op audit emitter is still used here").
- **Activated existing, previously-dead code**: `fundingRequestAdapter.ts` and
  `fundingApprovalAdapter.ts` already had correct logic to append a returned `audit.auditId` into the
  record's `auditEventIds` array and persist it back — that logic was silently inert because
  `NO_LIVE_AUDIT_SINK` never returned an `id`. No code change needed there; this fix activates it.
- Added `src/funding/fundingAuditLiveDeps.test.ts` (5 tests): payload shape / binds, honest non-success
  surfacing, thrown-error catching, systemuser-bind rejection (never fakes identity), and one distinct
  event name per `FundingAuditAction`.

## What did NOT change

- `recordFundingAudit`'s (`fundingAudit.ts`) own fail-closed, non-reverting discipline is untouched — a
  failed/unresolved audit still never reverts the funding action that already happened.
- Dual-control policy (self-approval prevention, approval thresholds) is unchanged.
- No schema, no generated SDK file, no closing-document or boarding code touched.

## Test plan

- `npx tsc -b` — 0 errors.
- `npx vitest run src/funding/fundingAuditLiveDeps.test.ts src/deals/DealFundingAuthorizationPanel.test.tsx`
  — 14 passed (5 new + 9 existing, unchanged), 0 failed. The existing 9 tests already exercise the real
  request/approve action handlers (not mocked at the `fundingAuditLiveDeps` level), confirming the live
  audit call's honest failure mode (no mocked SDK in that test env) is absorbed without breaking the
  underlying write outcome — matching the intended non-reverting design.
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive.
