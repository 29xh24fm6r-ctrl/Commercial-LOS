# Workstream 7 — Funding Authorization and Disbursement Control Framework

**Status: MOUNTED LOCAL-ONLY (PR 111) — AWAITING LIVE PERSISTENCE (schema + integration). See the
PR 111 addendum below.**

## Confirmed genuinely missing

Reaching the `CLOSING_FUNDING` stage is a workflow-stage LABEL only — no module anywhere in this
app modeled a separate, governed decision of "this specific disbursement is authorized." This is a
new build under `src/funding/`. **It performs no actual money movement and issues no instruction to
any payment rail** — it is a data/control layer that decides, records, and audits whether a
disbursement is authorized; a `FUNDED` status means the bank's own governed process confirmed a
disbursement already carried out through a real payment channel, recorded after the fact.

## Domain model

`fundingAuthorizationTypes.ts` matches the spec exactly: `dealId`, `authorizationStatus`
(`NOT_REQUESTED`/`PENDING`/`BLOCKED`/`APPROVED`/`REJECTED`/`REVOKED`/`FUNDED`/`CANCELLED`),
`requestedAmount`/`approvedAmount`, `fundingDate`/`fundingMethod`, `destinationVerificationStatus`,
`conditionsSatisfied`, `exceptions`, `authorizedBy`/`secondApprovedBy`/`requestedBy`, timestamps,
`correlationId`, `supportingDocumentIds`, `auditEventIds`.

## Policy engine (`fundingAuthorizationPolicy.ts`)

- **Dual control**: an approved amount at/above a threshold (default $250,000, business-adjustable)
  requires two DISTINCT approvers. The first approval only records progress
  (`authorizedBy` set, status stays `PENDING`); a genuinely different second approver is required to
  reach `APPROVED`.
- **Self-approval prohibition**: a requester can never approve their own request; the same person
  cannot be both dual-control approvers.
- **Facility-amount cap**: approved amount can never exceed the authorized facility amount.
- **Terminal-state protection**: `REJECTED`/`REVOKED`/`FUNDED`/`CANCELLED` accept no further
  transition. `REVOKED` is terminal by design — re-authorizing requires a fresh request (a new
  record with `supersedesRecordId`), matching the same immutable-history discipline as the closing-
  document framework (Workstream 6).

## Three separated governed actions (per the spec's required control separation)

1. `fundingRequestAdapter.ts` — creates the `PENDING` record.
2. `fundingApprovalAdapter.ts` — `approveFunding`/`rejectFunding`/`revokeFunding`.
3. `fundingDisbursementConfirmation.ts` — the **only** path to `FUNDED`. Re-verifies readiness at
   the moment of confirmation rather than trusting a possibly-stale approval — e.g. catches a deal
   that was declined after approval but before disbursement.

`fundingReadiness.ts` independently derives every funding blocker (missing documents, unresolved
conditions precedent, unresolved exceptions, unverified destination, expired approval, terminal deal
state) and reports **all** of them at once, not one-at-a-time. `fundingAudit.ts` reuses this app's
established governed-write discipline (`cr664_user`-bind-only, fail-closed on an unresolved actor,
never reverts an already-written transition — mirrors the "governance-partial" pattern used
elsewhere). `fundingTimeline.ts` is a pure payload-shape builder for a future live timeline cross-
write (not wired). `FundingAuthorizationPanel.tsx` is the read-plus-governed-action UI: status,
amounts, approval chain, approve/reject/revoke controls, disbursement readiness + blockers,
confirmation, and an audit-event count.

## Storage — the one deliberate gap

`fundingAuthorizationStorage.ts` has **no live Dataverse factory**. Per the spec's own instruction
("determine whether an existing table can truthfully support funding authorization; if not, prepare
— but do not automatically execute — a schema proposal"): no existing table supports dual-control
approval chains, exceptions, or disbursement confirmation with real fields.

**Proposed additive schema** (not applied): a new `cr664_fundingauthorization` table with columns
mirroring `FundingAuthorizationRecord` 1:1 (status as a picklist matching the 8-value enum,
requested/approved amount as Money, funding date as DateTime, destination-verification-status as a
picklist, conditions-satisfied as Boolean, requested-by/authorized-by/second-approved-by as
`cr664_user` lookups — never `systemuser`, matching this app's established actor-bind discipline),
plus a related `cr664_fundingexception` child table for `exceptions` (id/description/resolved).
Applying this requires the same schema-change authorization discipline as Workstream 5 — not
performed by this pass.

Only `createInMemoryFundingAuthorizationStore()` exists — real, tested, explicitly NOT persistence.

## Tests

61 tests across 8 files (`fundingAuthorizationPolicy.test.ts` 18, `fundingApprovalAdapter.test.ts` 8,
`fundingDisbursementConfirmation.test.ts` 6, `fundingRequestAdapter.test.ts` 4,
`fundingReadiness.test.ts` 5, `fundingAuthorizationStorage.test.ts` 4, `fundingTimeline.test.ts` 3,
`FundingAuthorizationPanel.test.tsx` 13).

## Addendum (PR 111) — mounted local-only

PR 111 mounted this framework in `DealFundingAuthorizationPanel.tsx` (`src/deals/`), using
`createInMemoryFundingAuthorizationStore()` to drive a real request → first approval → second
approval (dual control) → disbursement-confirmation flow against the deal cockpit. This is honest,
not fabricated: `FundingAuthorizationPanel.tsx`'s own `isSelfApprovalRisk` check and the policy
engine's `self_approval_not_permitted` denial correctly and automatically block one actor from
completing both sides of dual-control approval — a single banker session cannot fake a two-person
approval, so the mount accurately reflects what one session can and cannot do. Session is
disclosed as non-durable (`role="note"`, session-scoped, reset on reload) — same convention as the
closing-document mount (Workstream 6). `FundingReadinessFacts` fields with no live source
(`requiredDocumentsComplete`, `conditionsPrecedentResolved`, `exceptionsAllResolved`,
`destinationVerified`, `approvalExpired`) are hard-coded to their fail-closed blocking value;
`dealTerminalStatus` is the one real fact, derived via `recognizeCanonicalStatus(deal.status)`. The
session therefore genuinely reaches `APPROVED` but always correctly shows blocked at disbursement
confirmation — this is correct behavior, not a bug.

What did NOT change: the storage gap. No `cr664_fundingauthorization` table exists; the proposed
schema above remains unapplied. `fundingTimeline.ts` (no live timeline caller wired) and
`fundingFeatureFlags.ts` (a tracking constant, not consumed as a mount gate anywhere in this
codebase) remain allow-listed in `src/navigation/intentionallyUnrouted.ts`; the other 9 entries
became genuinely reachable and were dropped from that list.

## Classification

**MOUNTED LOCAL-ONLY (PR 111) — AWAITING LIVE PERSISTENCE** (schema authorization + integration
decision with the stage gate remain open).
