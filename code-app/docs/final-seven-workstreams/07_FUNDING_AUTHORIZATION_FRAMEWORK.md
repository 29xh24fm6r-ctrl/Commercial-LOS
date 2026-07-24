# Workstream 7 — Funding Authorization and Disbursement Control Framework

**Status: MOUNTED, DURABLE (PR 112) — schema-integration honesty caveat only. See the PR 112
addendum below.**

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

What did NOT change: `fundingTimeline.ts` (no live timeline caller wired) and
`fundingFeatureFlags.ts` (a tracking constant, not consumed as a mount gate anywhere in this
codebase) remain allow-listed in `src/navigation/intentionallyUnrouted.ts`.

## Addendum (PR 112) — durable Dataverse-backed persistence

PR 112 replaced PR 111's `createInMemoryFundingAuthorizationStore()` with
`createDataverseFundingAuthorizationStore()` (`src/funding/fundingAuthorizationDataverseStore.ts`),
a real Dataverse-backed `FundingAuthorizationStorageDeps` implementation against the
`cr664_fundingauthorization` table specced in
`scripts/schema-migrations/pr107-funding-authorization/entity.mjs`:

- Every `FundingAuthorizationRecord` field maps 1:1 onto the table's 18 columns + primary
  `cr664_recordid`. Array/object fields (`exceptions`, `supportingDocumentIds`, `auditEventIds`) round
  -trip through JSON text columns, parsed fail-closed (a malformed JSON column fails the whole read
  rather than silently dropping or fabricating a value).
- Durable history is preserved by construction: `createRecord` always performs a genuine CREATE
  (never an upsert), and `updateRecord` always resolves the exact existing row by `cr664_recordid`
  before updating it. A record superseding a prior REVOKED/REJECTED/CANCELLED one is a brand-new row
  with its own `recordId` and a `supersedesRecordId` pointer — the superseded row is never touched.
- Stateless by design: the adapter caches nothing in memory, so a fresh instance (e.g. after a
  component remount) reads exactly the same durable history a prior instance would have.
- `DealFundingAuthorizationPanel.tsx` now shows a real loading state while the initial durable read
  is in flight, a visible error state if that read fails, and a visible action-error message for any
  failed write (approve/reject/revoke/confirm) — no path silently does nothing on failure, and there
  is no fallback to the in-memory store anywhere in the mounted path.

**Honest disclosure — the one caveat that remains**: `Cr664_fundingauthorizationsModel.ts` /
`Cr664_fundingauthorizationsService.ts` (and the `power.config.json` data-source entry) were
hand-authored to mechanically match `entity.mjs` and this repo's standard generated-SDK shape — they
were **not** produced by a real `pac code add-data-source` + regenerate against a live Dataverse
org, because no live Dataverse credentials exist in this sandbox to run that step. The field-level
contract should not differ (both are derived from the same `entity.mjs`), but a real operator-run
regeneration, once performed, should be diffed against these files rather than assumed identical.
Because of this, the adapter and panel are built to fail closed with a visible error — never a
silent fallback — if a live call does not behave as expected.

## Classification

**MOUNTED, DURABLE (PR 112)** — dual-control policy and persistence are both real; the only open
item is confirming this hand-authored SDK pairing against a genuine `pac code` regeneration once an
operator has live credentials, and the product decision on whether `BOARDED` should require a
confirmed `FUNDED` record.
