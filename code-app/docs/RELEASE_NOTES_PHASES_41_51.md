# Release Notes — Phases 41 through 51

> **Historical record.** This document captures the platform state at
> the Phase 51 milestone. Current state — including the Phase 53–55
> document-lifecycle expansion — lives in
> [RELEASE_NOTES_PHASES_52_55.md](RELEASE_NOTES_PHASES_52_55.md). The
> [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) is always
> current.

**State as of Phase 51 (the snapshot this document covers)**

- 675 tests passing across 43 test files
- `npm run build` clean
- Bundle ~634 kB minified / ~154 kB gzipped
- **Not production-ready.** The Release Readiness Gate rolled up to **"Not ready to promote — blockers open"** for the same reason as the Phase 40 baseline (Stage Governance schema gap, see [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md)). What changed during Phases 41–51: the platform's governance discipline was test-pinned end-to-end, and the first new operational workflow since Phase 25 shipped (mark-document-received). The document lifecycle was closed end-to-end in Phase 55 — see the Phase 52–55 release notes for that work.

Companion docs:
- [RELEASE_NOTES_PHASES_1_40.md](RELEASE_NOTES_PHASES_1_40.md) — historical record up to Phase 40
- [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) — current pre-promotion checklist
- [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — ownership table for every cross-cutting concern
- [ENGINEERING_OPERATING_RULES.md](ENGINEERING_OPERATING_RULES.md) — standing rules
- [PHASE_EXECUTION_TEMPLATE.md](PHASE_EXECUTION_TEMPLATE.md) — phase brief + AAR format

---

## Phases 41–50 — Governance hardening sequence

Each phase pinned a class of invariant the codebase had been honoring informally. After Phase 50, every governed write inherits the full contract by construction and any drift fails CI.

### Phase 41 — Stage Progression Contract + Reference Data Foundation
- New canonical [stageCatalog.ts](../src/shared/stages/stageCatalog.ts): 12 frozen stage definitions, lifecycle groups, governance predicates (`canTransitionStage`, `getNextStage`, `isTerminalStage`).
- `getLifecycleGroupByName` preserves the Phase-27 memo-gating regex (`/underwrit/i`, `/committee/i`) exactly. "Approval Pending" still does NOT classify as underwriting.
- Stage progression remains DELIBERATELY_BLOCKED. The catalog is metadata only; no write enabled.
- Refactor: `stageProgressionGuard.ts` delegates `stageRequiresMemo` to the shared `stageNameGatesMemo` helper.

### Phase 42 — Execution Discipline Docs
- Three small operational docs that future phase briefs inherit by reference:
  - [ENGINEERING_OPERATING_RULES.md](ENGINEERING_OPERATING_RULES.md) — stability, governance, writes, refactors, tests, architecture, decision defaults, refactor permissions
  - [PHASE_EXECUTION_TEMPLATE.md](PHASE_EXECUTION_TEMPLATE.md) — reusable brief shape, standing defaults, current AAR contract
  - [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — ownership table pointing at canonical code modules
- No production code change.

### Phase 43 — Stage Progression Enablement Map
- [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md): concrete unblock checklist breaking the Phase 28 schema gap into 8 sequenced future phases (A through H).
- Added optional `enablementMapPath` field to `DeliberatelyBlockedEntry` in [platformInventory.ts](../src/shared/governance/platformInventory.ts); `stage-progression-advance` now points at the new doc.
- Stage progression remains blocked.

### Phase 44 — Read-Only Workspace Governance Sweep
- New [readOnlySurfaceGuard.test.ts](../src/shared/governance/readOnlySurfaceGuard.test.ts): 18 static-source regression tests.
- No file in `src/executive/`, `src/manager/`, `src/team/`, or admin-diagnostic surfaces can import an action module or write-triggering modal. Documented exceptions: `ManagerDealWorkspace` and `TeamDealWorkspace` consume shared deal cards with `readOnly={true}`.
- Pinned `GOVERNED_WRITES ⊥ (NOT_WIRED ∪ DELIBERATELY_BLOCKED ∪ LOCAL_ONLY_FLOWS)` disjointness.

### Phase 45 — Conservative Banker-Facing Copy Regression Sweep
- New [conservativeCopyGuard.test.ts](../src/shared/governance/conservativeCopyGuard.test.ts): 8 phrase-pattern rules forbidding `is stale`, `production-ready`, `check failed`, `Buddy approved/cleared/denied/rejected/decided`, `\bAI\b` outside disclaimers, `email sent/delivered`, upload-action phrasing, and `advance stage` outside governance docs. Allowlists each have a stated reason.
- Two copy fixes shipped (the only banker-visible changes in the Phases 41–50 governance work): "Borrower-safe language check failed" → "Borrower-safe language check flagged issues" in both the credit-memo and borrower-update modals.

### Phase 46 — Correlation-ID Discipline Regression
- Extracted [correlationId.ts](../src/shared/governance/correlationId.ts) — single `newCorrelationId(prefix)` helper. Five inline duplicates collapsed.
- New [correlationIdDiscipline.test.ts](../src/shared/governance/correlationIdDiscipline.test.ts): inventory-driven sweep verifies every governed write generates the id once, stamps it on audit + (where applicable) timeline, uses the variable name `correlationId`, and never declares the constant locally.

### Phase 47 — Outcome Union Discipline Regression
- New [outcomeUnionDiscipline.test.ts](../src/shared/governance/outcomeUnionDiscipline.test.ts): 53 tests.
- Every governed write returns `Promise<<Outcome>>` where the union has exactly four branches: `success`, `<domain>-failed`, `governance-partial` (deal-domain) or `audit-failed` (admin-domain), `unknown`.
- Discriminant is `kind`, not `status`/`result`. `correlationId` is intentionally NOT surfaced in any outcome branch (current-state pin; a future phase that surfaces it must update this test deliberately).
- Modal callers wrap action calls in `try/catch` and convert thrown errors to `{ kind: 'unknown', message }`. Pinned end-to-end.

### Phase 48 — DataProvider Isolation Regression
- New [dataProviderIsolation.test.ts](../src/shared/governance/dataProviderIsolation.test.ts): 11 static-source regression tests.
- Pinned: no file in any role directory imports from another role directory; `src/shared/` reaches into NO role directory. `src/deals/` cross-role imports are limited to the documented dispatcher + the `useOptionalBanker` hook.
- One import leak fixed: `BankerProvider` was reaching into `../admin/currentUserLookup`. Moved [currentUserLookup.ts](../src/shared/governance/currentUserLookup.ts) to shared governance.

### Phase 49 — Audit Payload Schema Discipline
- Extracted [auditEnums.ts](../src/shared/governance/auditEnums.ts) — `AUDIT_OUTCOME_SUCCEEDED = 788190000` and `AUDIT_OUTCOME_FAILED = 788190001`. Five inline duplicates collapsed.
- New [auditPayloadDiscipline.test.ts](../src/shared/governance/auditPayloadDiscipline.test.ts): 50 tests pinning the 10 required audit fields (`cr664_auditeventname`, `cr664_eventcategory`, `cr664_eventtype`, `cr664_entitytype`, `cr664_entityid`, `cr664_outcomestatus`, `cr664_correlationid`, `cr664_beforestate`, `cr664_afterstate`, `cr664_ChangedBy@odata.bind`), the deal-domain `cr664_LoanDeal@odata.bind` split, and event-name specificity (no generic "Updated" / "Record Updated" / "Changed").
- Note: the brief's field names differed from the schema (`cr664_category`/`cr664_recordid`/`cr664_outcome`); the test pins the actual schema names (`cr664_eventcategory`/`cr664_entityid`/`cr664_outcomestatus`).

### Phase 50 — Timeline Payload Schema Discipline
- Extracted [timelineEnums.ts](../src/shared/governance/timelineEnums.ts) — `TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000`. Three inline duplicates collapsed.
- New [timelinePayloadDiscipline.test.ts](../src/shared/governance/timelinePayloadDiscipline.test.ts): 47 tests pinning the 11 required timeline fields, per-write `cr664_eventtype` constants and values (TASK_COMPLETED=788190005, DOCUMENT_REQUESTED=788190009, NOTE_LOGGED=788190002), `correlation:${...}` embedding in `cr664_eventsubtype`, and the admin/deal distinction (admin action modules cannot import the timeline service or reference timeline-only fields).

### Governance architecture summary after Phase 50

| Layer | Phase | What's enforced |
| --- | --- | --- |
| Platform inventory | 40 | Shipped writes, blocked capabilities, not-wired, local-only, exec transitional, deal-access matrix, architectural invariants |
| Lifecycle catalog | 41 | Frozen stage catalog, soft classifier, governance predicates (no progression enabled) |
| Execution docs | 42 | Operating rules, phase template, canonical sources |
| Stage enablement plan | 43 | Concrete schema → write → governance unblock checklist |
| Read-only UI boundary | 44 | Static-source: role files import no actions / write modals |
| Conservative copy | 45 | Banker-facing wording: no "is stale" / "production-ready" / overclaim verbs |
| Correlation id | 46 | One generation point per write; same id on audit + timeline; shared helper |
| Outcome union | 47 | Discriminated `kind`; four canonical branches; `correlationId` deliberately NOT surfaced |
| Data layer isolation | 48 | Static-source: no cross-role data imports; documented dispatch exceptions |
| Audit payload schema | 49 | 10 required fields; shared outcome enum; deal-vs-admin domain split |
| Timeline payload schema | 50 | 11 required fields; shared visibility enum; correlation embedding; admin-free |

---

## Phase 51 — First operational expansion since Phase 25

**deal-document-receive** — the first new governed write since Phase 25 (credit memo draft save). The smallest production-useful slice of the document workflow.

### What shipped

- New action `markDocumentReceived(...)` in [documentActions.ts](../src/deals/documentActions.ts) — coordinated three-write following the Phase 22 pattern exactly (document update + audit + timeline). Sets `cr664_receiveddate = nowIso`. New `MarkDocumentReceivedOutcome` union with `success | receive-failed | governance-partial | unknown`.
- New [ReceiveDocumentModal.tsx](../src/deals/ReceiveDocumentModal.tsx) — banker-only modal with required Receipt note. No file picker. No filename field.
- [DealDocuments.tsx](../src/deals/DealDocuments.tsx) outstanding rows now show TWO action buttons (banker-only): **Request** (Phase 22) and **Mark received** (Phase 51).
- [DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) gained `'after-document-receive'` refresh key; documents + activity reload after the write so the row flips Outstanding → Received in-place.
- `GOVERNED_WRITES` gained `deal-document-receive` (introducedInPhase: 51, emitsAudit: true, emitsTimeline: true). Total shipped governed writes: **6 → 7**.
- `NOT_WIRED.document-upload` remains. Its reason now cites the exact schema-column gap.

### What's still NOT wired (honest)

The Phase 51 feasibility audit confirmed binary file upload is blocked at the schema layer. The `@microsoft/power-apps` SDK supports `client.uploadFileToRecord(...)`, but `cr664_DocumentChecklist` has no File column to target. Phase 51 ships the metadata half of the workflow; the binary half requires upstream schema work. Full schema blocker and unblock path: [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md).

### Discipline carried by Phase 51 from Phases 46–50

The new governed write inherited the full contract by construction. Specifically:
- Uses the shared `newCorrelationId('rd')` helper.
- Uses the shared `AUDIT_OUTCOME_SUCCEEDED` / `AUDIT_OUTCOME_FAILED` constants.
- Uses the shared `TIMELINE_VISIBILITY_BANKER_AND_MANAGER` constant.
- Outcome union has the four canonical branches; modal uses the standard try/catch + `kind: 'unknown'` recovery.
- Audit payload carries all 10 required fields plus `cr664_LoanDeal@odata.bind` (deal-domain).
- Timeline payload carries all 11 required fields plus the correlation embedding in `cr664_eventsubtype`.
- All five governance-inventory regression tests were extended with the new mapping in the same commit (covered by their existing completeness checks).

---

## Current operational state

### What bankers can do today

**Read** (full deal workspace):
- DealHeader / Summary / Blockers / Tasks / Documents / Credit Memo / Activity Timeline / Borrower Communication
- Banker Command Center: My Work Queue, pipeline cards

**Write** (banker-only governed surfaces):
1. **Complete task** (Phase 21) — Deal Workspace → Tasks
2. **Request document** (Phase 22) — Deal Workspace → Documents
3. **Mark document received** (Phase 51) — Deal Workspace → Documents *(new)*
4. **Save credit memo draft** (Phase 25) — Deal Workspace → Credit Memo

**Local-only flows** (no Dataverse write):
- Borrower update draft → Copy to clipboard (Phase 23)
- Credit memo preview (Phase 24, separate from the Phase 25 governed save)

### What managers and team users can do today

**Read** (role-scoped):
- Manager (Phase 14, 33, 36): team pipeline, banker workload, closing forecast, at-risk deals, team work queue, deal drill-through **read-only**
- Team (Phase 16, 34, 37): shared pipeline, bottlenecks, document needs, task load, closing calendar, shared work queue, deal drill-through **read-only**

**Write**: **none**. Manager and team workspaces render the same deal cards as banker but with `readOnly={true}` — no Complete / Request / Mark received / Generate / Save / Send buttons render. Pinned by Phase 44.

### What executives can do today

**Read** (snapshot-only):
- Portfolio Summary, At-Risk Portfolio Summary, Banker Production Rollup, Pipeline by Stage *(transitional)*, Monthly Closing Forecast *(transitional)*

**Write**: **none**. Deal drill-through: **denied** (DealRoute). Snapshot-only is by design (Phase 15).

### What admins can do today

**Read** (operational diagnostics):
- System Health Summary, Data Quality Flags, Audit Anomalies, Alert Backlog, Refresh Status, Configuration Overview, Stage Governance Diagnostics, Release Readiness Gate, Performance Diagnostics

**Write** (admin-domain governed):
1. **Data Quality Flag resolve** (Phase 18)
2. **Alert resolve** (Phase 19)
3. **Alert dismiss** (Phase 19)

Deal drill-through: **denied**. Separate governance decision required to unblock.

### What remains blocked / not wired

| Capability | Status | Why |
| --- | --- | --- |
| Stage progression (Advance Stage write) | **DELIBERATELY_BLOCKED** | `Cr664_stagereferences` schema gap. See [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md). |
| Binary document upload | **NOT_WIRED** | `cr664_DocumentChecklist` has no File column. See [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md). |
| Borrower email delivery | **NOT_WIRED** | No Outlook/Graph integration. Phase 23 is local Copy-to-clipboard only. |
| AI / model-driven generation | **NOT_WIRED** | No model calls anywhere in the app. Credit memo is a deterministic generator (Phase 24). |
| Test / build verification in-app | **NOT_WIRED (by design)** | The app has no runtime hook into CI. Verify out-of-band before any promotion. |
| Stage reference data source | **NOT_WIRED** | Same schema gap as stage progression. |
| Stage ordering / sequence contract | **NOT_WIRED** | Same schema gap. |
| Executive `/deals/:id` drill-through | **NOT_WIRED (intentional)** | Snapshot-only by design (Phase 15). |
| Admin `/deals/:id` drill-through | **NOT_WIRED (intentional)** | Separate governance decision. |

---

## Current governed-write inventory (7 entries)

| # | Id | Phase | Domain | Audit | Timeline |
| --- | --- | --- | --- | --- | --- |
| 1 | `data-quality-flag-resolve` | 18 | admin | ✓ | — |
| 2 | `alert-resolve` | 19 | admin | ✓ | — |
| 3 | `alert-dismiss` | 19 | admin | ✓ | — |
| 4 | `deal-task-complete` | 21 | banker (deal-domain) | ✓ | ✓ |
| 5 | `deal-document-request` | 22 | banker (deal-domain) | ✓ | ✓ |
| 6 | `credit-memo-draft-save` | 25 | banker (deal-domain) | ✓ | ✓ |
| 7 | `deal-document-receive` | **51** | banker (deal-domain) | ✓ | ✓ |

---

## Current `NOT_WIRED` inventory (8 entries)

Per [platformInventory.ts](../src/shared/governance/platformInventory.ts):
1. `email-delivery` (borrower email)
2. `document-upload` (binary file upload — reason updated in Phase 51 to cite schema column gap)
3. `ai-generation`
4. `test-coverage-build-verification`
5. `stage-reference-data-source`
6. `stage-ordering-contract`
7. `executive-deal-drillthrough`
8. `admin-deal-drillthrough`

---

## Current `DELIBERATELY_BLOCKED` inventory (1 entry)

| Id | Phase | Reason | Enablement map |
| --- | --- | --- | --- |
| `stage-progression-advance` | 28 | Schema does not expose a deterministic next-stage ordering. | [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) |

---

## Current schema blockers

These are upstream Power Apps / Dataverse changes required to unblock further app-side work. They are not solvable inside this repo.

1. **`Cr664_stagereferences` not registered as a Power Apps data source.** Blocks Phase 28 Advance Stage write. The Phase 43 enablement map sequences the unblock as future Phases A through H.
2. **No sequence/ordering field** on the loan deal record, `cr664_systemsettings`, or `cr664_kpithresholdconfigurations`. Same blocker as (1).
3. **No File column on `cr664_DocumentChecklist`.** Blocks true binary document upload. Phase 51 ships the metadata-only "Mark received" path; the binary path is sequenced for a future phase once the column lands.
4. **No `StageAdvanced` enum value on `cr664_DealTimelineEvent.cr664_eventtype`.** Required for the future Advance Stage timeline emission.
5. **No borrower email entity / draft entity** in the generated schema. Blocks borrower email delivery (Phase 23 stays local-only).
6. **No snapshot entities for `PipelineByStage` and `MonthlyClosingForecast`.** Keeps two executive cards on the transitional operational-fallback adapter. The release-readiness category for executive snapshots remains **Needs Review** until snapshot entities ship.

---

## Test count progression

| Milestone | Total tests | Delta from prior |
| --- | --- | --- |
| Phase 40 (Phase 1–40 release notes baseline) | 347 | — |
| Phase 41 (stage catalog) | 400 | +53 |
| Phase 42 (execution discipline docs) | 400 | 0 (docs-only) |
| Phase 43 (enablement map) | 406 | +6 |
| Phase 44 (read-only governance) | 424 | +18 |
| Phase 45 (conservative copy guard) | 436 | +12 |
| Phase 46 (correlation-id discipline) | 479 | +43 |
| Phase 47 (outcome union discipline) | 532 | +53 |
| Phase 48 (data-layer isolation) | 543 | +11 |
| Phase 49 (audit payload discipline) | 591 | +48 |
| Phase 50 (timeline payload discipline) | 638 | +47 |
| Phase 51 (deal-document-receive) | **675** | +37 |

675 passing tests across 43 test files. `npm run build` clean. Bundle 634.38 kB minified / 153.76 kB gzipped — up from the Phase 40 baseline (~620 / ~152) primarily because of the Phase 51 modal + extended UI; the Phases 41–50 governance work was net-neutral or slightly bundle-shrinking (collapsing duplicated constants into shared helpers).

---

## Safe next phases

These are conservative directions consistent with the current schema-blocker landscape:

- **Document binary upload — when the schema lands.** Once a File column exists on `cr664_DocumentChecklist`, the SDK's `client.uploadFileToRecord(...)` is ready; the Phase 51 modal grows a file picker; a new `deal-document-upload` governed write joins `GOVERNED_WRITES`; the `NOT_WIRED.document-upload` entry retires. Sequenced in Phase 51's scope doc.
- **Banker Command Center receive integration.** Surface receive prompts and counts in My Work Queue. Read-only data layer extension; no new write.
- **Stage progression — schema-side work.** Phase 43's enablement map (Phase A: register `cr664_stagereferences` as a Power Apps data source) is the productive next move. App-side, the catalog and predicates are ready.
- **Executive snapshot entities.** Replace the transitional `PipelineByStage` + `MonthlyClosingForecast` operational queries with snapshot reads. The Executive snapshot row in the release gate flips from Needs Review to Ready once snapshot entities exist.
- **NOT safe yet — borrower email delivery.** Requires Outlook/Graph integration, delivery-failure handling, and send-time validation. Phase 23 left this explicitly deferred.

---

## Production-readiness posture

**Honest summary:** the platform is **NOT production-ready** for any workflow that depends on:
- Stage progression (deliberately blocked)
- Binary document upload (schema-blocked)
- Borrower email delivery (not wired)
- AI-driven anything (not wired)
- Cross-team manager visibility (out of scope by design)

The platform **IS** ready in the operational-discipline sense for the seven shipped governed writes: every write is correlation-id-traced, audit-pinned, outcome-discriminated, and (for deal-domain) timeline-emitted, with regression coverage that catches drift in any of those layers. Each new governed write inherits the discipline automatically.

The Release Readiness Gate continues to report the overall rollup as **"Not ready to promote — blockers open"** because of the stage-progression schema gap. The Phase 51 operational expansion did not change that posture; it added a new shipped capability under the existing blocker.

See [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) for the current pre-promotion checklist.
