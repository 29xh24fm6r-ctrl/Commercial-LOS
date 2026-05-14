# Stage Governance — Phase 41

Status: **Canonical metadata only. Stage progression is NOT enabled.**

This document is the human-readable counterpart to
[src/shared/stages/stageCatalog.ts](../src/shared/stages/stageCatalog.ts)
and the `REFERENCE_DATA_GOVERNED.stageCatalog` entry in
[src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts).
It exists so future contributors understand why the stage catalog is
shaped the way it is, and what it deliberately does not do.

---

## 1. Purpose

The stage catalog gives the commercial-lending Code App a single,
authoritative description of every loan-deal lifecycle stage:

- the identity of each stage (StageId),
- a stable canonical ordering (ordinal),
- the lifecycle group each stage belongs to (preflight, pipeline,
  underwriting, closing, postClosing, terminal),
- whether the stage is terminal,
- the legal forward transitions per stage (governance-only metadata).

Before Phase 41, lifecycle assumptions were scattered across phases —
the Phase 27 memo-gating regex (`/underwrit/i`, `/committee/i`), the
inline stage classification used by the credit memo workflow, and
several admin / governance surfaces. Phase 41 consolidates those
assumptions into one frozen module.

The catalog is **metadata**. It is not a service, a workflow trigger,
or a write surface.

---

## 2. The canonical stage contract

Twelve stages. Ordinals are spaced so future inserts don't renumber
callers; non-terminal stages occupy 10–90 and terminals occupy 1000–1020.

| Ordinal | StageId       | Label             | Lifecycle group | Terminal |
| ------- | ------------- | ----------------- | --------------- | -------- |
| 10      | origination   | Origination       | preflight       | false    |
| 20      | screening     | Screening         | preflight       | false    |
| 30      | application   | Application       | pipeline        | false    |
| 40      | pricing       | Pricing           | pipeline        | false    |
| 50      | underwriting  | Underwriting      | underwriting    | false    |
| 60      | committee     | Committee         | underwriting    | false    |
| 70      | documentation | Documentation     | closing         | false    |
| 80      | closing       | Closing           | closing         | false    |
| 90      | funded        | Funded            | postClosing     | false    |
| 1000    | closed-won    | Closed — Won      | terminal        | true     |
| 1010    | closed-lost   | Closed — Lost     | terminal        | true     |
| 1020    | cancelled     | Cancelled         | terminal        | true     |

The catalog is wrapped in `Object.freeze` and exported as
`readonly StageDefinition[]`. Consumers may not mutate it at runtime.

---

## 3. Lifecycle groups

The lifecycle group is a coarse grouping used by Release Readiness
checks, the Phase 27 memo-gating predicate, and the Phase 30 governance
gate dashboard. It is not an enum that drives Dataverse writes — it is
purely for in-app classification.

- **preflight** — Origination, Screening. Pre-application discovery.
- **pipeline** — Application, Pricing. Deal is being shaped.
- **underwriting** — Underwriting, Committee. Memo-gated; forward
  progression assumes a credit memo exists.
- **closing** — Documentation, Closing. Pre-funding execution.
- **postClosing** — Funded. Booked; pending administrative close-out.
- **terminal** — Closed — Won, Closed — Lost, Cancelled. No further
  forward transitions; downstream surfaces should treat the deal as
  read-only for lifecycle purposes.

---

## 4. Transition philosophy

The catalog's `allowedForwardTransitions` field is **governance
metadata** that describes which transitions *would be legal* under the
canonical contract. The current catalog encodes a single linear
happy-path edge per non-terminal stage. The selectors
[`getNextStage`](../src/shared/stages/stageCatalog.ts) and
[`canTransitionStage`](../src/shared/stages/stageCatalog.ts) read this
metadata.

Invariants enforced by tests in
[stageCatalog.test.ts](../src/shared/stages/stageCatalog.test.ts):

- No self-transition is allowed.
- No edge targets a stage with a strictly lower ordinal (no backward
  transitions).
- The forward-transition graph is acyclic.
- Every transition target is a real catalog id.
- Terminal stages have an empty transition list.

These are properties of the metadata only. **No part of the catalog
performs a Dataverse write, calls a workflow, or causes a stage
change.** `canTransitionStage` is a predicate. `getNextStage` is a
lookup. Neither has a side effect.

---

## 5. Why progression remains blocked

`REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled === false`
across this and every prior phase. Phase 41 does not flip it. The
reason is in
[src/shared/governance/stageProgressionAvailability.ts](../src/shared/governance/stageProgressionAvailability.ts)
and is restated below.

Stage progression is **deliberately blocked** because the Dataverse
schema does not expose:

1. **A registered `Cr664_stagereferences` data source.** The Power Apps
   project does not list the table as a registered source, so the
   generated SDK in `src/generated/services/` has no typed
   `Cr664_stagereferencesService`. Without it, the app cannot enumerate
   the authoritative list of stages, cannot read sequence numbers, and
   cannot validate a target stage against schema-managed state.
2. **A deterministic next-stage ordering.** There is no
   sequence / order field on the loan-deal record, no setting under
   KPI thresholds, and no system-settings row that names the canonical
   ordering. The in-app catalog in this module is the BEST current
   approximation — but it is not the schema-managed source of truth.
3. **A governed write contract for stage advancement.** Even if the two
   gaps above were closed, the Advance Stage write would still need a
   discriminated-outcome contract, audit + timeline emission, role
   gating, and a banker-readable failure surface — matching the
   Phase 21 / 22 / 25 pattern. None of that is built.

Because all three gaps remain open, this catalog is intentionally a
read-only governance artifact. The Release Readiness Gate continues to
report stage progression as Deliberately Blocked.

---

## 6. Relationship to the Phase 28 schema gap

Phase 28 was the brief that originally encountered the schema gap and
made the call to NOT ship an Advance Stage write. The Phase 41 work
**does not change** that decision. It is strictly an in-app
consolidation:

- Phase 28 produced [`stageProgressionAvailability.ts`](../src/shared/governance/stageProgressionAvailability.ts),
  the future-extension contract that any eventual progression write
  must consume.
- Phase 41 produces [`stageCatalog.ts`](../src/shared/stages/stageCatalog.ts),
  the canonical lifecycle metadata that the future progression write
  would also consume.

The two modules are complementary. Neither activates progression.

The Phase 28 `DELIBERATELY_BLOCKED` entry in
[`platformInventory.ts`](../src/shared/governance/platformInventory.ts)
still names this as the blocker:

> Dataverse schema does not expose a deterministic next-stage ordering.
> No Cr664_stagereferences service in the generated SDK; no
> sequence/order field on the loan deal record or in system settings.

That entry is the authoritative status. The Release Readiness Gate
reads from there. This document does not contradict it.

---

## 7. Governance invariants

These invariants are pinned by the tests in
[stageCatalog.test.ts](../src/shared/stages/stageCatalog.test.ts) and
[platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts):

- **`STAGE_CATALOG` is frozen** and remains the only source of canonical
  ordering. No inline stage-order array is allowed in any governed
  module — a sweep test scans `platformInventory.ts`,
  `stageProgressionAvailability.ts`, `releaseReadiness.ts`,
  `stageProgressionGuard.ts`, and `ReleaseReadinessGate.tsx` for known
  duplicate patterns.
- **`stageCatalog.ts` performs no I/O.** A static-source assertion
  enforces that the module does not import from
  `src/generated/services/` or `@microsoft/power-apps`.
- **`stageCatalog.ts` performs no orchestration.** Same assertion
  enforces no `power automate`, no `workflow`, and no cross-role
  imports (`banker/`, `manager/`, `team/`, `executive/`, `admin/`,
  `deals/`).
- **The Phase 27 memo-gating regex is preserved exactly.** The
  `LIFECYCLE_NAME_PATTERNS.underwriting` entry remains
  `/underwrit/i` and `/committee/i` only. A dedicated test asserts
  that `"Approval Pending"` does **NOT** classify as the underwriting
  group — regressions to a broader pattern would change Phase 27
  behavior.
- **`REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled === false`**
  is pinned. Flipping it requires a code change paired with the
  schema work AND the Phase 21/22/25-style governed write.

---

## 8. Non-goals (explicit)

Phase 41 does **not** introduce, enable, or imply any of the following.
If a future phase wants to add one, it requires its own brief and
acceptance criteria.

- **No production workflow automation.** The catalog does not call
  Power Automate. It does not trigger flows. It does not subscribe to
  Dataverse events.
- **No Dataverse progression writes.** No method on this module writes
  to Dataverse. `getNextStage` does not advance a deal. There is no
  Advance Stage button anywhere in the app.
- **No borrower notifications.** No email, no SMS, no in-app
  notification is emitted when a deal's stage changes (because stage
  changes are not driven by this module in the first place).
- **No SLA engine.** The catalog does not encode time-in-stage
  expectations, SLA thresholds, escalation policies, or stuck-deal
  detection beyond what Phase 26's stale-stage indicator already
  derives.
- **No AI orchestration.** No model call is involved in stage
  classification, transition validation, or lifecycle inference.
- **No automatic stage movement.** Nothing in the app advances a
  deal's stage on its own — not on a timer, not on document upload,
  not on memo save.
- **No Power Automate activation.** The Phase 41 module specifically
  does not register a connector, register a flow, or expose a
  callable surface that Power Automate could subscribe to. The
  generated SDK in `src/generated/services/` is unchanged.

---

## 9. Future enablement path

When the schema gap closes, enabling stage progression requires (in
order, each gated by its own deliberate edit):

1. **Schema:** Register `Cr664_stagereferences` as a Power Apps data
   source. Regenerate `src/generated/services/`. Confirm the typed
   `Cr664_stagereferencesService` exists.
2. **Ordering contract:** Expose a sequence/order field on the loan
   deal record (or on the stage reference rows themselves) and
   reconcile it with the catalog's ordinal column. If the schema
   ordering disagrees with this catalog, the schema wins; the catalog
   is updated to match.
3. **Governed write:** Implement Advance Stage as a Phase 21/22/25-style
   governed write — discriminated outcome union, correlation id, audit
   create, timeline event create, role-gated to bankers, with a
   read-only render path for manager/team workspaces.
4. **Flip the flag:** Update
   `REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled` to `true`
   and update the corresponding `DELIBERATELY_BLOCKED` entry. Both
   changes land in the same commit as the governed write — never
   ahead of it.
5. **Release Readiness:** Update the gate dashboard so the stage row
   moves from Deliberately Blocked to Shipped. Update
   [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) and the
   release notes.

Until every step above lands, the Phase 41 catalog remains in its
current frozen, metadata-only form.
