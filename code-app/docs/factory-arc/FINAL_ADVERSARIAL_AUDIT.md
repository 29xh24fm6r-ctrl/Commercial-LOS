# Factory Build Arc — Final Adversarial Audit

Date: 2026-07-24. Scope: PR #103 through #109 (this consolidated arc). This
audit deliberately looks for problems rather than restating what already
went well — see `E2E_CERTIFICATION_REPORT.md` for the lifecycle-coverage
summary.

Severity scale (matches the mission's Definition of Done): **S1** — data
corruption or a critical-governance bypass; **S2** — blocks a core
lifecycle step for all users; **S3** — a real, scoped gap, already tracked;
**S4** — minor/cosmetic, no functional impact.

## Findings

### S3 — Self-approval prevention covers exactly one call site

`creditApprovalAuthority.ts`'s self-approval check (PR 106) is real and
tested, but it only activates for callers that supply both
`advancingActorBankerId` and `originatingBankerId`. Verified by re-reading
the source (not assumed): the only production caller that supplies both is
`DealStageProgressionCard.tsx` → `stageAdvanceWriteDependency.ts`. This
audit did not find, and did not exhaustively search for, any OTHER path
that could reach a CREDIT_APPROVAL stage exit outside this one component.
If one exists (e.g., a future admin override or bulk-action surface), it
would need to independently supply both ids or the check silently has no
opinion (by design — it never fabricates a denial it can't verify, but
that also means it never fabricates a *guarantee* for a caller that hasn't
wired the ids). **Not a bypass of what was verified working — a scope
boundary on what was verified at all.**

### S3 — True two-person dual control for credit-committee approval does not exist

Self-approval prevention (one person can't approve their own deal) is
built. Genuine dual control (a SECOND, different approver required above
some dollar threshold) is not — `creditApprovalAuthority.ts` has no
threshold-based second-approval requirement. The pattern to build it
already exists and is proven (`funding/fundingAuthorizationPolicy.ts`'s
`evaluateFundingApproval`), but adapting it to credit-committee approval
would need its own persisted first-approver/second-approver state (no such
record exists for credit approval today) — real design + schema work,
correctly not attempted in this arc.

### S3 — Self-approval prevention was not audited across other governed writes

This arc only examined self-approval risk for credit-committee approval
(the mission's explicit scenario). It did not audit whether any OTHER
governed write in the app (admin entitlement grants, data-quality-flag
resolution, alert resolution) has an implicit requester/approver
relationship that could have the same self-approval risk. None of those
writes have an obvious "someone requests, someone else approves" shape
from a first read, but this was not exhaustively verified.

### S3 — Six capabilities' schema-migration scripts are syntax-checked only, never executed against a live environment

`node --check` confirms every `.mjs` migration script (PR 105/106/107,
12 files total) is syntactically valid JavaScript. **None have been run
against a real Dataverse Web API** — this sandbox has no credentials or
network path to do so. The Dataverse metadata API payload shapes
(`@odata.type` annotations, attribute property names, entity-creation
shape) follow documented conventions but have not been proven correct
against a live tenant. An operator's first real run of any
`create-columns.mjs` / `create-entity.mjs` is the actual test of these
scripts — they are not proven beyond "parses as valid JS."

### S3 — `ServicingLifecyclePanel` remains a genuine, unaddressed orphan

Already disclosed in PR 108's own doc — restated here because an
adversarial audit exists partly to confirm a self-reported gap wasn't
quietly walked back. Confirmed still true by re-reading
`intentionallyUnrouted.ts` and re-checking for any new caller of
`deriveServicingLifecycleSnapshot` — none exists.

### S3 — CRM duplicate detection has narrow signal coverage

`crmDuplicateDetection.ts` (PR 104) only compares candidate name/legal
name/website against already-loaded company options. It has no access to
an employer id, tax id, or address — a genuine duplicate with a
differently-spelled name and no shared website would not be flagged. This
mirrors the deal-level detector's own pre-existing limitation (same
signals), so it's a consistent, not novel, gap.

### S4 — Multiple `role="note"` elements now coexist on the full Deal Workspace page

`GlobalCashFlowPanel`, `DealRiskRatingPanel`, and `DealClosingDocumentsPanel`
(PRs 105-107) each render their own `role="note"` local-only disclaimer.
Each is unit-tested in isolation (`screen.getByRole('note')` correctly
finds exactly one element per isolated test). A FUTURE integration test
against the full `BankerDealWorkspace` that tries `getByRole('note')`
would throw "multiple elements found" and need `getAllByRole('note')`
instead. No current test hits this — confirmed by re-running
`BankerDealWorkspace.test.tsx`, which does not query by that role — so
this is a latent authoring trap, not a live failure.

### S4 — Two credit-readiness derivations remain divergent; five checklist-generation paths remain unreconciled

Both already flagged in the Phase 0 baseline (`FACTORY_ARC_BASELINE.md`
§4) and re-confirmed still true by this audit (no PR in this arc touched
either). Neither is a lifecycle blocker on its own — each individual path
works — but the duplication itself is a maintenance/consistency risk.

## What this audit explicitly checked and found NOT to be a problem

- **`bankerId`/`assignedBankerId` empty-string collision risk**: checked
  whether either could resolve to `''` instead of `undefined` in a way
  that would make two genuinely-different, both-unresolved bankers
  wrongly compare as a self-approval match. Traced `BankerProvider.tsx`:
  when no banker record resolves, the whole identity state is a distinct
  `not-banker` variant (never a "ready" state with an empty bankerId).
  Traced `dealQueries.ts`: `assignedBankerId` comes straight off a
  Dataverse lookup navigation property, which is `undefined` (never `''`)
  when unset. **No collision risk found.**
- **Override authority bypassing self-approval prevention**: confirmed by
  test (`creditApprovalAuthority.test.ts`) and by reading the check's
  placement in the source — self-approval is checked BEFORE the override
  bypass, so it cannot be circumvented that way.
- **GCF negative/zero debt-service fabricating a DSCR**: confirmed
  `findMissingInputs` requires `proposedNewDebtService > 0` strictly, so a
  zero or negative entry correctly produces `insufficient-data`, never a
  divide-by-near-zero or negative DSCR.
- **NOT_WIRED count-pin drift**: confirmed both pinning test files
  (`releaseCandidateSnapshot.test.ts`,
  `phase129AMicrosoftVibeScopeAudit.test.ts`) and their cited docs were
  updated in the SAME commit as each new entry across PRs 105-108 — no
  stale count left behind.

## Overall verdict

**No Severity 1 or Severity 2 findings.** Every finding above is a scoped,
already-largely-disclosed gap (S3) or a latent test-authoring
consideration with no live impact (S4). Nothing found in this audit
contradicts the E2E Certification Report's GO-for-incremental-rollout
recommendation; several findings sharpen exactly what the operator
checklist there needs to prove out for real before full production
cutover.
