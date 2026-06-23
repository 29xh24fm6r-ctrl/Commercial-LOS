# Phase 226 — Production Reference Approval Marker (planning)

## Why this phase exists

Phase 225 ended **blocked**: the live Deal Stage Reference and Deal Status
Reference tables expose no explicit production-approved marker, and the New Deal
create readiness contract (`src/activation/newDealCreateActivation.ts`) requires
exactly one active production-approved Stage and one active production-approved
Status. The contract must never infer production from a row's Code or Name, so an
apparent candidate (`INTAKE` / `OPEN`) resolves only to ready-test until a governed
marker exists.

Phase 226 defines the remediation path that unblocks Phase 225. It is a
**planning** phase: it enables no live write flag and certifies nothing until the
schema and evidence gates below are satisfied.

## Remediation path

### 1. Add or identify a governed production-approved marker

For **both** Deal Stage Reference and Deal Status Reference, add or identify a
single governed marker that distinguishes operator-approved production references
from TEST/other rows. Recommended logical meaning:

- a **boolean** ("Production approved", default false), or
- a **controlled choice** (e.g. Environment Designation = `Production` vs `Test`),

true/`Production` **only** for rows an operator has explicitly approved for
production. The marker must be a governed column, not derived from Code/Name.

The resolver already consumes a per-row `productionApproved` boolean, so the
mapping is: marker column value → `ReferenceRow.productionApproved`. No GUID is
hardcoded; the row id is supplied by the caller from the live read.

### 2. Seed exactly one active production-approved Stage and Status

- Mark exactly **one** active Stage row (e.g. `INTAKE`) as production-approved.
- Mark exactly **one** active Status row (e.g. `OPEN`) as production-approved.
- Do not approve more than one per table — duplicate active production-approved
  rows fail closed by contract.

### 3. Keep TEST rows not production-approved

`PHASE121_STAGE` and `PHASE121_STATUS` (and any other TEST rows) must remain **not**
production-approved, so they can never authorize a production create.

### 4. Re-run Phase 225 verification

With the marker present and seeded:

- `resolveReferenceReadiness('Stage', …)` returns `ready-production` with exactly
  one resolved id; same for Status.
- `deriveNewDealReferenceReadiness(…)` returns `productionReferencesApproved = true`.
- Duplicate / inactive / TEST-only / service-error cases still fail closed.

Record the re-verification result in
[PHASE_225_PRODUCTION_STAGE_STATUS_ACTIVATION.md](./PHASE_225_PRODUCTION_STAGE_STATUS_ACTIVATION.md).

### 5. Only then proceed to single-record smoke and Phase 211 evidence

Once production references are approved **and** the New Deal create gates are
intentionally enabled, run exactly one controlled single-record create smoke and
record an `OperatorSmokeEvidence` (capability `new-deal-create`) with
`rollbackVerified`. Phase 211 remains the only source of smoke truth.

## Gating rules for Phase 226

- No live write flag is enabled in Phase 226 unless **both** the schema gate
  (governed production-approved marker present and correctly seeded) **and** the
  evidence gate (passed New Deal create smoke with rollback verified) are satisfied.
- Production is never inferred from Code or Name.
- TEST rows remain not production-approved.
- No real Dataverse writes and no `pac code push` are performed as part of writing
  or reviewing this plan.
- All other Phase 212–224 capabilities remain gated and out of scope here.

## Definition of done (Phase 226)

- A governed production-approved marker exists on both reference tables.
- Exactly one active production-approved Stage and one active production-approved
  Status are seeded; TEST rows are not production-approved.
- Phase 225 verification re-runs to `ready-production` / `productionReferencesApproved = true`.
- A single-record New Deal create smoke has passed with rollback verified and is
  recorded in the Phase 211 evidence registry.
