# PR 132 — Document Review Lifecycle: Segregation of Duties + Business-Safe Error Mapping

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 1
**Findings addressed:** N-01, N-10, N-16, N-21 (confirmed defects/gaps). N-11 explicitly deferred (see "Remaining limitations").
**Branch:** `phase1-document-review-lifecycle-schema`

## Problem statement

Two independent code paths write the document-requirement lifecycle on `cr664_documentchecklist`:

1. `DocumentRequirementWorkspace.tsx` / `documentRequirementActions.ts` — the rich 7-state lifecycle
   (Not Assessed → Outstanding → Requested → Under Review → Reviewed, plus Waived / Not Applicable).
2. The legacy `RequestDocumentModal` / `ReceiveDocumentModal` / `ReviewDocumentModal` /
   `documentActions.ts` path, mounted simultaneously in `DealDocuments.tsx`.

Both write `cr664_requirementstatus`, a column that does not exist on the live
`cr664_documentchecklist` table (N-01) — every write from either path currently fails against
production. Additionally:

- Nothing durably recorded *who* received a document, so a banker could receive their own submitted
  document and then also mark it reviewed with no system check (N-16 — segregation of duties).
- Every write failure surfaced the raw transport error (OData/.NET stack fragments) directly to the
  banker (N-21 — business-safe error mapping).
- N-10 ("metadata-only receipt falsely satisfies a requirement that needs full review") was suspected
  but, on inspection, was already correctly guarded — see "N-10 verification" below.

## Root cause

`cr664_requirementstatus` (and seven sibling lifecycle columns) were designed and coded against
(`documentRequirementFields.ts`, `documentRequirementLifecycle.ts`,
`scripts/dataverse/create-document-requirement-lifecycle-fields.ps1`) but the operator migration
script that provisions them on the live `cr664_documentchecklist` table has never been run in the
target org. The generated SDK model
(`src/generated/models/Cr664_documentchecklistsModel.ts`) confirms none of these fields exist yet.
Both write paths independently target this same missing column, so the defect is a genuine schema
gap, not a single code bug — fixing one path alone would leave the other broken.

## Files changed

**New:**
- `src/deals/documentReviewSegregationOfDuties.ts` — resolved-identity extraction/comparison
  (`extractCoreUserId`, `isSameCoreUser`) and the banker-facing block reason. Compares resolved
  `cr664_user` row ids only — never display name or email — so two bankers who happen to share a
  display name are never conflated, and a spoofed display name cannot bypass the check.
- `src/deals/documentReviewErrorMapping.ts` — `mapDocumentWriteError(rawMessage, correlationId?)`.
  Always returns a fixed generic safe message for any transport-layer error (never selectively
  "cleans" the raw string — a raw Dataverse/OData/.NET error can contain sensitive fragments
  anywhere in it) while preserving the raw text separately as `technicalDetail` for internal
  diagnostics. Does not touch this codebase's own pre-authored validation messages
  (`invalid-input` / `unauthorized`), which are already business-safe.
- `src/deals/documentReviewSegregationOfDuties.test.ts`, `documentReviewErrorMapping.test.ts` —
  unit coverage, including a literal N-01-shaped raw error string to pin that it never leaks.

**Modified — rich lifecycle path:**
- `src/deals/documentRequirementLifecycle.ts` — `DocumentRequirementRow` gained optional
  `receivedBy?: string` (resolved `cr664_user` row id of whoever ran `receive`).
- `src/deals/documentRequirementReconciliation.ts` — threads `receivedBy` from the live row into
  `DocumentRequirementRow` (`toRequirementRow`), `undefined` for a virtual row.
- `src/deals/documentRequirementFields.ts` — added `_cr664_receivedby_value` to the bridge type;
  header comment now documents 9 columns instead of 8.
- `src/deals/documentRequirementLiveReader.ts` — maps `_cr664_receivedby_value` into `receivedBy`.
- `src/deals/documentRequirementActions.ts`:
  - `IDENTITY_BOUND_ACTIONS` gained `'receive'` — receive now fails closed on an unresolved actor
    (previously only `acknowledge`/`waive` did), because segregation-of-duties needs a durable
    receiver identity to compare against.
  - `receive` now stamps `cr664_ReceivedBy@odata.bind` from the resolved actor.
  - `review` is rejected with `{ kind: 'segregation-of-duties' }` — no write — when the caller's
    already-reconciled `receivedByCoreUserId` matches the reviewer's own just-resolved identity.
  - `write-failed` / `governance-partial` outcomes now carry a `correlationId` so the UI can cite a
    real, non-fabricated reference without touching transport internals.
- `src/deals/DocumentRequirementWorkspace.tsx` — passes `row.receivedBy` into the action call as
  `receivedByCoreUserId`; outcome renderer maps `write-failed` through `mapDocumentWriteError` and
  renders the new `segregation-of-duties` outcome.

**Modified — legacy path:**
- `src/deals/documentActions.ts`:
  - `markDocumentReceived` now best-effort stamps `cr664_ReceivedBy@odata.bind` when the actor
    resolves (NOT identity-bound/blocking — this deliberately preserves the legacy path's existing
    tested best-effort actor-resolution posture rather than silently tightening it).
  - `markDocumentReviewed` gained the same segregation-of-duties check as the rich path, and its
    `review-failed` / `governance-partial` outcomes gained `correlationId`.
- `src/deals/dealDocumentQueries.ts` — `DealDocument` gained optional `receivedByCoreUserId`;
  `loadDealDocuments` populates it from `_cr664_receivedby_value` (also fixed a latent scoping bug
  where the raw-field cast was only bound inside the `.filter()` callback, not the `.map()` callback
  that needed it).
- `src/deals/DealDocuments.tsx` — passes `pendingReviewDoc.receivedByCoreUserId` into
  `markDocumentReviewed`.
- `src/deals/ReviewDocumentModal.tsx` — `OutcomeBlock` maps `review-failed` / `governance-partial`
  raw errors through `mapDocumentWriteError`, and renders the new `segregation-of-duties` outcome.

**Operator migration (not applied by Claude Code — see "Operator steps"):**
- `scripts/dataverse/create-document-requirement-lifecycle-fields.ps1` — extended (not replaced)
  with a 9th column/relationship: `cr664_receivedby` (Lookup → `cr664_user`), matching the script's
  existing dry-run-by-default, create-missing-only, verify-after-create safety model exactly.

## Schema impact

One new lookup relationship on the existing `cr664_documentchecklist` table:
`cr664_receivedby -> cr664_user` (schema name
`cr664_documentchecklist_receivedby_cr664_user`). No new table. No column deleted, renamed, or
overwritten. This is additive to the 8 columns/1 relationship the pre-existing script already
provisions (still un-applied in the target org — this PR does not change that fact, it only adds
the 9th field to the same not-yet-applied package).

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| Any document requirement write (either path) | Fails in production — targets a column that does not exist | Still fails until the operator migration runs; failure is now business-safe and the schema gap is fully mapped and packaged |
| Reviewer = same person who received the document | No check — silently allowed | Blocked before any write, with a plain-English reason; audited nowhere because nothing is written |
| A write fails | Raw OData/.NET error text shown to the banker | Fixed generic safe message + a real correlation id; raw text preserved server-side only |

## N-10 verification (not a defect — confirmed, not assumed)

Checked every real consumer of `isRequirementSatisfied`:
- `DocumentRequirementWorkspace.tsx` calls it with no `reviewLevel` argument (cosmetic status badge
  only — not a governance gate).
- `documentRequirementBlockerMerge.ts` — the actual deal-advancement gate — derives `reviewLevel`
  **per document** from the derivation engine's `RequiredDocumentDefinition.reviewLevel`, defaulting
  to the strict `'reviewed'` only when a document has no known definition (fail-closed default, never
  fail-open).

This is already pinned by existing regression tests in `documentRequirementBlockerMerge.test.ts`
(`'under_review (received) is still a blocker when reviewLevel is "reviewed"'` and
`'under_review satisfies a reviewLevel:"received" document — receive alone clears the blocker'`).
No code change and no new test were needed for N-10; it was verified, not assumed, per the mission's
explicit instruction not to treat an unread code path as proof.

## Tests added

- `documentReviewSegregationOfDuties.test.ts` (10 tests)
- `documentReviewErrorMapping.test.ts` (6 tests)
- `documentRequirementActions.test.ts` — identity-bound `receive` (fails closed unresolved actor),
  `cr664_ReceivedBy@odata.bind` stamping, segregation-of-duties block/pass/no-fact-known,
  `write-failed`/`governance-partial` now assert `correlationId: expect.any(String)`
- `documentActions.test.ts` — `receivedBy` persistence (resolved vs. unresolved best-effort), 3
  segregation-of-duties tests (block / different-identity pass / no-fact-known pass)
- `ReviewDocumentModal.test.tsx` — updated review-failed/governance-partial tests to assert the raw
  provider error text is **absent** and the safe message + correlation id are present (previously
  these tests asserted the raw leak — inverted per N-21); added a segregation-of-duties render test
- `DocumentRequirementWorkspace.test.tsx` — updated the existing governance-partial fixture with a
  `correlationId`

## Validation results

- `npx tsc -b` — 0 errors
- Focused suite (8 files, 115 tests) — 0 failed
- Full suite / build / reachability audit — see commit for exact counts (run immediately before
  push, this section updated with final numbers)

## Operator steps

1. Review `scripts/dataverse/create-document-requirement-lifecycle-fields.ps1` (dry-run by default).
2. Run dry-run first: `powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1`
   and confirm the plan (9 columns/relationships, all currently `planned` — none exist yet).
3. Run with `-Apply` in the target org (`org3a57b8d4.crm.dynamics.com`) once ready:
   `powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1 -Apply`
4. Regenerate the SDK (`pac code add-data-source -a dataverse -t cr664_documentchecklists`), confirm
   `_cr664_receivedby_value` and the other 8 fields land in the generated model, then retire the
   `documentRequirementFields.ts` bridge type.
5. This migration was **not** applied by Claude Code — it is a live schema change to a production
   Dataverse org, one of this arc's explicit stop conditions.

## Rollback considerations

The new column/relationship is additive only — rolling back means reverting this PR's code (the
column can be left in place harmlessly; there is no delete path in the script by design). No data
migration, no backfill.

## Remaining limitations

- **N-11** (three incompatible document taxonomies) is explicitly out of scope for this PR — deferred
  to the mission's own later document-taxonomy-normalization phase. This PR only ensures both
  existing write paths fail safely under the current schema gap; it does not unify them.
- The underlying N-01 schema gap is **not yet closed in the live org** — this PR ships the complete,
  reviewed, dry-run-safe migration package, but applying it is an operator action outside this PR.
- Error mapping (N-21) is scoped narrowly to this one write family (document requirement / document
  review), not a global sweep — the mission's own later error-handling-consolidation phase is the
  right place for that.
