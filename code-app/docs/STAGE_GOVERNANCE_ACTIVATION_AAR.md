# Phase 5 — Stage Governance Activation (AAR)

## Objective
Clear the "Stage Governance Diagnostics: CRITICAL / NOT YET AVAILABLE" blocker and
make stage progression available through the governed, audited workflow.

## Root cause (audit)
The schema, contracts, and write path were **already in place**:
- `cr664_sequence` is on the generated `Cr664_dealstagereferencesModel` and the
  stage/status services are generated + registered.
- `src/workflow/stageOrderingContract.ts` resolves the ordering fail-closed from
  `cr664_sequence`; `canonicalStageTransition.ts` is a complete transition engine
  (ADVANCE/RETURN/DECLINE/WITHDRAW) with policy guard → update → **readback proof**
  → audit + timeline + correlation id, default-off and fail-closed.
- `scripts/seed-stage-references.mjs` + `docs/STAGE_SCHEMA_SETUP.md` seed the seven
  ordered stages and five statuses.

The blocker was that the **admin diagnostics card was hardwired** to the no-arg
`stageProgressionDiagnostics()` → a constant `ROWS_NOT_LOADED` → always `blocked`.
So it reported CRITICAL forever regardless of the real environment, never checked
status references, and never showed the actual rows/sequence/graph. It could
**never** move to READY even after a correct seed.

## What Phase 5 changed (code, minimal + governed)
- **Diagnostics is now LIVE and data-driven.** `StageGovernanceDiagnostics` loads
  the real stage + status reference rows (`src/admin/stageGovernanceDiagnosticsLoader.ts`),
  runs the deterministic contracts, and derives a rich 5-check diagnostic
  (`deriveStageGovernanceDiagnostics`): data source, ordering contract, ordering
  resolved, **status references seeded** (new), **transition graph valid** (new).
  It shows the **exact rows found** (code / sequence / active), the disposition
  status set, and the resolved transition path — and flips **CRITICAL → READY**
  automatically once the ordering resolves, the five statuses are active, and the
  graph validates. Fail-closed: any read failure (incl. the unprovisioned
  `cr664_sequence` column, 0x80060888) shows the honest "not loaded" blocked state.
- **New pure contracts/helpers:** `statusReferenceContract.ts`
  (`CANONICAL_STATUS_CODES` typed against the transition engine's `DealStatusCode`
  + `resolveStatusReferences`), and `describeStageTransitionGraph` / `isAdjacentAdvance`
  in `stageOrderingContract.ts` (validate the ready ordering is a single linear
  chain; only adjacent single-step advances are legal — skips rejected).
- **No schema/seed added** — both already exist; **no flag flipped**; **no live
  write path touched.** The transition engine + write adapter already satisfy the
  spec's write-side tests (authorization, readback, audit correlation id, illegal
  jumps) and were left as-is (35 existing tests pass).

## Verification
- `tsc -b` clean · lint clean (changed files) · `npm run build` clean.
- New/updated tests: status contract, transition graph, rich diagnostics loader
  (missing/duplicate/inactive sequence blocks, missing status blocks, valid →
  READY, fail-closed reads), live card (CRITICAL, READY-with-rows, read-only).
- Existing write-path/transition tests (`canonicalStageTransition`,
  `stageAdvanceWriteDependency`) still green.

## Exact remaining blockers (to actually turn on stage advancement in production)
The diagnostics card now tells the truth and will show READY once these are done.
Stage advancement itself stays gated by design:

1. **Seed data (maker).** Run `scripts/seed-stage-references.mjs --commit` (needs a
   bearer token) so the seven stage rows carry unique `cr664_sequence` and the five
   status rows are active; then `--verify`. If `cr664_sequence` is not yet a live
   column, add it first (`docs/STAGE_SCHEMA_SETUP.md`) and regenerate the SDK. Until
   this is done the card correctly shows CRITICAL with the exact missing reasons.
2. **SDK regen (maker).** Regenerate so `cr664_sequence` is typed on the generated
   model (the app reads it structurally today, so reads work post-seed regardless).
3. **Arm the advancement gate (operator).** Live transitions require BOTH
   `config.autoStageAdvanceEnabled === true` AND an injected live transport
   (`buildLiveStageAdvanceDeps` / `buildLiveCanonicalTransitionDeps`) with an
   authorized actor. Note: the `AUTO_STAGE_ADVANCE_ENABLED` hard constant is
   currently `true`, but the second safety layer (config + injected transport +
   authorization + exit-gate) still blocks any write until deliberately armed.
4. **Wire the Advance action to a surface (follow-up, out of Phase 5 scope).** The
   governed `executeCanonicalStageTransition` exists and is tested, but a
   banker-facing Advance/Return/Decline/Withdraw control that calls it with the live
   deps must be surfaced for humans to actually advance a deal. The diagnostics
   readiness signal is the prerequisite; the UI action is the next deliverable.
5. **Operator certification/evidence.** Per the activation discipline, arming step 3
   should be recorded with the standard evidence (verified schema state + transport
   smoke + named approver), same as the other live-write domains.

## Bottom line
Stage Governance is no longer a false-CRITICAL dead end: the dashboard now reflects
the real, live schema/seed/graph state and will read READY the moment the
references are seeded. Actual stage advancement remains correctly gated behind the
seed + operator arming + a wired UI action.
