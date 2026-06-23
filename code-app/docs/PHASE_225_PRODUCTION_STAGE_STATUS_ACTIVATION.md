# Phase 225 — Production Stage/Status Activation Pass 1

## Scope

This phase activates and verifies only the production Stage/Status readiness path
for New Deal create readiness. It does not enable CRM writeback, portfolio
boarding, document upload, borrower communications, or any global GO claim, and it
enables no live write flag.

## Deployment Baseline

- Source branch deployed from: master
- Deployed master commit: 96446c9
- PAC push result: successful
- Environment: operator environment (friendly name, environment ID, and org URL are
  recorded in the operator release record outside the repository; redacted here)
- Operator: Super Admin operator (UPN recorded out-of-band; redacted here)

## Stage/Status Readiness Contract

Production create readiness (`src/activation/newDealCreateActivation.ts`) requires:

- exactly one active production-approved Stage reference
- exactly one active production-approved Status reference
- no duplicate active production-approved Stage rows
- no duplicate active production-approved Status rows
- inactive production references fail closed
- TEST-only references do not authorize production
- reference service errors fail closed
- Phase 211 smoke evidence is required before launch readiness

The contract derives `productionApproved` from a governed marker supplied per row;
it never infers production from a row's Code or Name.

## Live Environment Verification

### Stage Reference

- Table inspected: Deal Stage Reference
- Available columns: Active Flag, Code, Deal Stage Reference, Description, Effective
  Date, Name, Owner, Status, Created By, Created On, Modified By, Modified On,
  Retired Date, Sort Order, Status Reason, Version Number, and ownership/system
  columns.
- Visible active rows: `INTAKE` / Intake (Active) and `PHASE121_STAGE` /
  TEST - Stage Phase 121 (Active).
- Production-approved column/field: not present — no explicit production-approved
  marker column exists on this table.
- Active production-approved row count: not computable (no production-approved
  marker), so it cannot be confirmed to equal exactly one.
- Duplicate / inactive production checks: not computable without the marker.
- TEST-only exclusion: the `PHASE121_STAGE` TEST row is active and must never
  authorize production.
- Result: blocked.

### Status Reference

- Table inspected: Deal Status Reference
- Available columns: Active Flag, Code, Deal Status Reference, Description, Effective
  Date, Name, Owner, Status, Created By, Created On, Modified By, Modified On,
  Retired Date, Sort Order, Status Reason, Version Number, and ownership/system
  columns.
- Visible active rows: `OPEN` / Open (Active) and `PHASE121_STATUS` /
  TEST - Status Phase 121 (Active).
- Production-approved column/field: not present — no explicit production-approved
  marker column exists on this table.
- Active production-approved row count: not computable (no production-approved
  marker), so it cannot be confirmed to equal exactly one.
- Duplicate / inactive production checks: not computable without the marker.
- TEST-only exclusion: the `PHASE121_STATUS` TEST row is active and must never
  authorize production.
- Result: blocked.

## Apparent production candidates vs. production-approved

`INTAKE` (Stage) and `OPEN` (Status) appear to be production candidates by Code and
Name. They cannot be treated as production-approved, because:

- neither reference table exposes an explicit production-approved marker column; and
- the readiness contract must not infer production from Code or Name (that would let
  any well-named active row, including a future TEST row, authorize a production
  create).

Under the resolver, an active row with no production-approved marker resolves to
**ready-test**, never **ready-production**. With only ready-test (and TEST) rows
present, both tables resolve to blocked and `productionReferencesApproved` is
false.

## Smoke Evidence

- Phase 211 capability key: new-deal-create
- Smoke outcome: not-run
- No live create smoke was run. No `OperatorSmokeEvidence` was recorded. Phase 211
  remains the only source of smoke truth and currently records no passed New Deal
  create smoke.

## Phase 225 Decision

Result: **blocked**.

The live environment contains Deal Stage Reference and Deal Status Reference rows,
including apparent production candidates (`INTAKE` / `OPEN`) and TEST rows from
Phase 121. However, neither reference table exposes an explicit production-approved
marker. Because Phase 213/214 readiness requires exactly one active
production-approved Stage and exactly one active production-approved Status — and
the contract never infers production from Code or Name — production readiness cannot
be certified from the current schema.

- No New Deal create flag was enabled (`NEW_DEAL_CREATE_ADAPTER_ENABLED`,
  `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`, `BANKER_NEW_DEAL_CREATE_ENABLED` remain
  false).
- No live create smoke was run.
- All other Phase 212–224 capabilities remain gated.

Required remediation is defined in
[PHASE_226_PRODUCTION_REFERENCE_APPROVAL_MARKER.md](./PHASE_226_PRODUCTION_REFERENCE_APPROVAL_MARKER.md):
add or identify a governed production-approved marker for both Deal Stage Reference
and Deal Status Reference, seed exactly one active production-approved Stage and
Status, keep TEST rows not production-approved, then re-run Phase 225 verification
before any single-record smoke and Phase 211 evidence.
