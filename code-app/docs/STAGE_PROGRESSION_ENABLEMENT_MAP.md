# Stage Progression Enablement Map — Phase 43

Status: **Blocked. Not in scope for any phase yet.**

This document converts the Phase 28 schema gap into a concrete
enablement checklist. It is the plan that a future phase will execute
to ship `advanceStage(...)`. Nothing in this file enables the write;
nothing in this file changes runtime behavior.

Related canonical sources:
- [src/shared/governance/stageProgressionAvailability.ts](../src/shared/governance/stageProgressionAvailability.ts) — runtime governance contract (banner, diagnostics, remediation steps)
- [src/shared/stages/stageCatalog.ts](../src/shared/stages/stageCatalog.ts) — in-app stage metadata
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `DELIBERATELY_BLOCKED.stage-progression-advance` and `REFERENCE_DATA_GOVERNED.stageCatalog`
- [docs/STAGE_GOVERNANCE.md](STAGE_GOVERNANCE.md) — non-goals and future enablement path (narrative)

---

## 1. Current blocked status

| Surface                                           | State                          |
| ------------------------------------------------- | ------------------------------ |
| `stageProgressionAvailability().available`        | `false`                        |
| `REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled` | `false`                 |
| `DELIBERATELY_BLOCKED.stage-progression-advance`  | present                        |
| `GOVERNED_WRITES.stage-progression-advance`       | **absent** (and must stay so)  |
| Advance Stage UI control                          | not rendered anywhere          |
| `advanceStage(...)` action                        | does not exist                 |

The Release Readiness Gate reports stage progression as Deliberately
Blocked. Every workspace (banker / manager / team / executive /
admin) honors this — no role has a write surface for stage
advancement.

## 2. Why progression remains blocked

Three independent gaps. All three must close before progression can
ship.

1. **No stage-reference data source.** `Cr664_stagereferences` is not
   registered as a Power Apps data source. The generated SDK
   (`src/generated/services/`) has no `Cr664_stagereferencesService`
   and the generated models have no corresponding type. The app
   cannot enumerate the authoritative list of stages.
2. **No deterministic ordering contract.** No sequence / order field
   is exposed on the loan-deal record, in `cr664_systemsettings`, or
   in `cr664_kpithresholdconfigurations`. "What stage comes next" is
   not resolvable without inventing an order — which the catalog
   approximates but cannot guarantee matches schema-managed state.
3. **No governed write surface.** Even if (1) and (2) were closed,
   `advanceStage(...)` does not exist. There is no audit-emitting
   coordinator, no timeline emission, no role gate, no
   discriminated-outcome contract.

---

## 3. Required Dataverse data sources

Before enablement, the Power Apps project must register:

| Logical name                   | Purpose                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `cr664_stagereferences`        | Authoritative stage list — the row set the catalog currently approximates.                  |
| `cr664_loandeal` *(existing)*  | Must expose the active stage column and (preferably) a sequence column. Schema change required if the sequence does not yet exist. |
| `cr664_auditevents` *(existing)*    | Used by every governed write. No change required.                                      |
| `cr664_dealtimelineevents` *(existing)* | Used by every deal-domain governed write. New `eventtype` enum value required (see §10). |

Registration is via `pac code add-data-source` (or the equivalent
Power Apps Studio action). After registration, the SDK must be
regenerated.

## 4. Required generated services

The post-regeneration `src/generated/services/` directory must
contain:

- `Cr664_stagereferencesService` — typed client over the
  stage-reference table. Read access at minimum;
  Phase-43-enablement does not require writes against this table.

The generated model must expose, at minimum:

- A primary key (`cr664_stagereferenceid` or equivalent).
- A stable human-readable name.
- A sequence / ordinal field (see §6).
- A terminal flag — either explicit or inferable from the absence of
  any forward edge in the reference data.

If the regenerated SDK is missing any of the above, enablement
**must not proceed**; the schema is not ready and the future phase
brief should pause and re-scope.

## 5. Required fields on loan / deal records

`cr664_loandeal` must expose:

| Field (logical)              | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Current stage reference (lookup or string) | The deal's active stage. The exact column name is whatever the schema chooses; the catalog and the action consume it through one named selector. |
| Optional: `cr664_stageentrydate` *(existing)* | Already consumed by Phase 26 staleness derivation. No change. |

Stage transitions write the new stage reference (and re-stamp
`cr664_stageentrydate`, matching Phase 26 expectations). They do not
write anything that the staleness pipeline doesn't already read.

## 6. Required stage reference fields

The `cr664_stagereferences` rows must expose:

| Field                | Type        | Purpose                                                                |
| -------------------- | ----------- | ---------------------------------------------------------------------- |
| `cr664_name`         | text        | Display label.                                                         |
| `cr664_sequence`     | integer     | Monotonic ordinal. Lower = earlier in lifecycle.                       |
| `cr664_lifecycle`    | choice      | Mirrors the in-app `LifecycleGroup` union.                             |
| `cr664_isterminal`   | bool        | Explicit terminal flag (preferred to inferring from missing edges).    |
| `cr664_allowednext`  | multi-lookup OR JSON | Allowed forward transitions. If the schema does not support a list field, store as a JSON array of stage reference ids. |

Naming above is illustrative — the schema owner picks final logical
names. The **contract** is what matters: every field listed has a
specific job, and the future phase's enablement code reads them by
name in exactly one place (the new
`src/shared/stages/stageReferenceLoader.ts`-equivalent).

## 7. Required ordering / sequence source

The ordering contract MUST be schema-managed, not catalog-managed.
Specifically:

- The `cr664_stagereferences.cr664_sequence` field is the canonical
  ordering source once data exists.
- The in-app [`STAGE_CATALOG`](../src/shared/stages/stageCatalog.ts)
  becomes a **fallback used during type-checking and tests only** —
  not a production data source — once the Dataverse table is
  populated.
- If `cr664_sequence` disagrees with the catalog's `ordinal` column,
  the schema wins. The catalog is updated to match. Reconciliation
  is a deliberate, reviewed edit — never a silent rewrite.
- `getNextStage(stageId)` will read the next stage by looking up
  the next-higher sequence value within the same allowed-transition
  set, OR by reading `cr664_allowednext` directly. Either is
  acceptable; whichever is chosen is documented in the future phase
  brief.

Inferring stage ordering from labels — e.g. "Underwriting" comes
after "Application" — is **prohibited** (see §13).

## 8. Required permission boundary

Stage advancement is a **banker-only** write surface, matching the
existing governed-write pattern:

| Role        | Surface for Advance Stage      | Source of truth                                         |
| ----------- | ------------------------------ | ------------------------------------------------------- |
| Banker      | renders an Advance Stage button on the deal workspace | `loadDealForBanker` in [`dealQueries.ts`](../src/deals/dealQueries.ts) |
| Manager     | renders the stage row in **read-only**; no button | `loadDealForManager`; existing card receives `readOnly=true` |
| Team        | renders the stage row in **read-only**; no button | `loadDealForTeam`; same pattern as Manager              |
| Executive   | does not see the deal at all   | `DealRoute` denies                                      |
| Admin       | does not see the deal at all   | `DealRoute` denies                                      |

This matches the [WORKSPACE_DEAL_ACCESS](../src/shared/governance/platformInventory.ts)
matrix. The enablement phase **must not** widen any role's access. A
manager / team workspace surfacing the new stage value is fine; a
manager / team workspace gaining a button is not.

## 9. Required write contract

`advanceStage(input)` follows the Phase 21 / 22 / 25 pattern
**exactly**. New patterns are not permitted.

```ts
// Required shape — illustrative, not authoritative.
export type AdvanceStageOutcome =
  | { kind: 'success'; newStageReferenceId: string }
  | { kind: 'stage-failed'; stageError: string }
  | {
      kind: 'governance-partial';
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface AdvanceStageInput {
  dealId: string;
  fromStageReferenceId: string;
  toStageReferenceId: string;   // resolved up-front from the catalog selector
  systemUserId: string;
  advanceNote: string;          // banker's reason for advancing
}
```

Required properties:

- **Correlation id** generated up front and stamped on every emitted
  event (see Phase 22's `newCorrelationId` for the canonical
  implementation).
- **Pre-flight catalog check** using `canTransitionStage(from, to)`
  from the catalog. If the transition is not legal under the
  catalog, the action fails fast (`kind: 'unknown'`) without writing
  anything.
- **Three-write coordination**: stage update → audit → timeline.
  The outcome union distinguishes a `stage-failed` (nothing changed)
  from a `governance-partial` (stage IS updated, audit and/or
  timeline failed to emit).
- **No optimistic write**: the UI does not advance the stage locally
  until the action's outcome is `success`.
- **No silent fallback**: if the typed service is missing at runtime
  (e.g. schema regression), the action returns `unknown` with a
  message — it does not invent a transition.

## 10. Required audit event

A single `cr664_AuditEvent` row, emitted by the action regardless of
the timeline outcome:

| Audit field                  | Value                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `cr664_auditeventname`       | `LoanDeal Stage Advanced`                              |
| `cr664_category` (choice)    | `Lifecycle` (existing enum value, see Phase 22)        |
| `cr664_eventtype` (choice)   | `StatusChange` (existing enum value, see Phase 22)     |
| `cr664_entitytype` (choice)  | `LoanDeal` (existing enum value)                       |
| `cr664_entityid`             | `dealId`                                               |
| `cr664_correlationid`        | the shared correlation id                              |
| `cr664_beforestate`          | `Stage: <fromStageName>`                               |
| `cr664_afterstate`           | `Stage: <toStageName>`                                 |
| `cr664_outcome`              | `Succeeded` or `Failed`                                |
| `cr664_actor` / system user  | `systemUserId`                                         |
| `cr664_note`                 | `advanceNote` (verbatim from banker)                   |

No new audit enum values are required.

## 11. Required timeline event

A single `cr664_DealTimelineEvent` row, emitted on success:

| Timeline field                    | Value                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `cr664_eventtype` (choice)        | **NEW** — `StageAdvanced`. Requires a new option-set value. Coordinate with schema before enablement; do not reuse an existing enum. |
| `cr664_dealid` (lookup)           | `dealId`                                               |
| `cr664_correlationid`             | the shared correlation id                              |
| `cr664_visibility`                | `BankerAndManager` (existing enum value)               |
| `cr664_summary`                   | `Stage advanced: <fromStageName> → <toStageName>`      |
| `cr664_detail`                    | `advanceNote` (verbatim from banker)                   |

The new `StageAdvanced` enum value is the only new schema artifact
introduced by enablement. It must land before the action ships.

## 12. Required tests before enablement

The enablement phase ships with:

- **Action contract tests** matching the depth of
  [`documentActions.test.ts`](../src/deals/documentActions.test.ts) and
  [`creditMemoActions.test.ts`](../src/deals/creditMemoActions.test.ts):
  success path; stage-failed path; audit-failed governance-partial;
  timeline-failed governance-partial; unknown / missing-service path.
- **Modal interaction tests** matching
  [`CreditMemoDraftModal.test.tsx`](../src/deals/CreditMemoDraftModal.test.tsx):
  button disabled until note entered; pre-flight catalog rejection;
  in-flight double-submit guard; governance-partial render; success
  close.
- **Permission regression tests** (Phase 39 lineage):
  - banker workspace renders the Advance Stage button;
  - manager / team workspaces render the stage row but no button;
  - executive / admin routes still deny.
- **Catalog reconciliation test**: the schema-managed sequence
  matches the in-app catalog ordinals exactly. Failing this test
  pins the schema as the winner and forces a catalog update.
- **Governance metadata test**: `progressionEnabled` flipped to
  `true` and `stage-progression-advance` moved from
  `DELIBERATELY_BLOCKED` to `GOVERNED_WRITES` in the same commit.
- **Release Readiness Gate test** updated: stage row moves from
  Blocked to Shipped.

## 13. Prohibited shortcuts

The enablement phase **must not**:

- **Hardcode stage advancement.** No literal `toStageReferenceId`
  baked into the modal or action. Targets are resolved through the
  catalog selector + the schema-managed reference data.
- **Ship a UI-only progression.** No modal that updates local
  component state and pretends a write happened. Every Advance
  Stage click results in a Dataverse write or an outcome other than
  `success`.
- **Ship optimistic local-only progression.** The deal record's
  active-stage field is the source of truth post-write. The UI
  re-reads it; it does not project the new value optimistically.
- **Infer stage ordering from labels.** No regex on stage names to
  decide what comes next. Ordering is `cr664_sequence` or
  equivalent — never derived from text.
- **Issue an ungoverned Dataverse PATCH.** Every write goes through
  the typed service from `src/generated/services/` and through the
  three-write coordinator. No bare `fetch(...)` against the OData
  endpoint.
- **Ship a write without an audit event.** The audit emission is
  not optional and not deferrable to a later phase.
- **Ship a write without a timeline event.** Deal-domain writes
  always emit a `DealTimelineEvent`. The new `StageAdvanced` enum
  value must land before the action ships — never after.
- **Bypass workspace permission checks.** The action does not
  trust the caller; the role check happens before the action is
  reachable, and the action itself defends with the same checks
  used by `loadDealForBanker`.
- **Fall back to the static catalog as a production data source
  once Dataverse reference data exists.** The catalog becomes
  type-check + test scaffolding only. Production stage metadata
  reads from `cr664_stagereferences`.

If any future brief asks for one of the above, it is rejected and
re-scoped — even if the schema is partially ready.

## 14. Future phase breakdown

Each step below is a discrete phase with its own brief, scope,
non-goals, and AAR. None of them ship `advanceStage(...)` until
every prior step is complete.

| Phase | Title (proposed)                                          | Deliverable                                                                                                  |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A** | **Schema: register stage-reference data source**          | `pac code add-data-source` for `cr664_stagereferences`. Regenerate SDK. No app code consumes it yet.         |
| **B** | **Schema: ordering + lifecycle + terminal + allowed-next**| Add the §6 fields to the stage-reference table. Populate rows mirroring `STAGE_CATALOG`. No app code change. |
| **C** | **Loader contract**                                       | Add `loadStageReferences()` reading the new table. Compare its output to `STAGE_CATALOG` in a test (reconciliation pin). No UI consumption. |
| **D** | **Catalog → loader migration**                            | Switch `getNextStage` / `canTransitionStage` to consume the loaded reference data. Catalog becomes the test-only fallback. Still no Advance Stage UI. |
| **E** | **Schema: new timeline enum value**                       | Add `StageAdvanced` to the `cr664_dealtimelineevents.cr664_eventtype` option set. No app code change.        |
| **F** | **`advanceStage(...)` action + tests**                    | Implement the §9 contract. Action is **not** wired to any UI yet. All §12 action tests pass.                 |
| **G** | **Banker UI: Advance Stage modal + button**               | Wire the action to the deal workspace. Manager / team workspaces remain read-only. Permission regression tests updated. |
| **H** | **Governance flip**                                       | Move `stage-progression-advance` from `DELIBERATELY_BLOCKED` to `GOVERNED_WRITES`. Flip `REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled` to `true`. Update Release Readiness Gate row, `STABILIZATION_CHECKLIST.md`, and release notes. |

Phases A–E require schema work upstream of the app and may land out
of order with each other (as long as their dependencies hold), but
**F must not start until A through E are done**, and **H must not
land until G is green in production**.

---

## 15. Re-confirmation

This document does **not** enable stage progression. It plans the
enablement. Confirmations as of Phase 43:

- `stageProgressionAvailability().available` remains `false`.
- `REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled` remains
  `false`.
- `DELIBERATELY_BLOCKED.stage-progression-advance` remains present.
- `GOVERNED_WRITES` does **not** contain `stage-progression-advance`.
- No Advance Stage UI control exists anywhere in the app.
- No new write surface, no new permission, no new behavior.
