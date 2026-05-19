# Stabilization Checklist — Commercial Lending Code App

> ⚠️ **STALE — last refreshed at Phase 55.** This checklist's counts
> (test suite size, governed-write count, bundle size, status table
> rows) are from Phase 55 and have NOT been kept current through
> Phases 56–102. The authoritative sources are now:
>
> - **Capability state per Vibe scope** —
>   [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md)
> - **Build/decide checkpoint at Phase 103** —
>   [docs/PHASE_103_PRODUCT_CHECKPOINT.md](PHASE_103_PRODUCT_CHECKPOINT.md)
>   (current counts: 2178 tests / 11 governed writes / 15
>   LOCAL_ONLY_FLOWS / 10 NOT_WIRED / 1 DELIBERATELY_BLOCKED)
> - **Per-flow governance metadata** —
>   [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts)
>
> The body below is preserved for historical context (architectural
> invariants, role-isolation pins, governance discipline). Read the
> three sources above for the current state. A dedicated checklist
> refresh is a candidate for a future docs-only phase.

**Phase: 55 (latest)**
**Test suite: 750 tests passing across 45 files**
**Bundle: ~651 kB minified / ~159 kB gzipped**

See [RELEASE_NOTES_PHASES_52_55.md](RELEASE_NOTES_PHASES_52_55.md) for
the per-phase narrative since Phase 51, including the closed
document lifecycle (request → mark received → mark reviewed),
the Phase 54 pending-review signal, and the Phase 55 eighth
governed write.

For earlier history see
[RELEASE_NOTES_PHASES_41_51.md](RELEASE_NOTES_PHASES_41_51.md)
(governance-hardening sequence + first operational expansion since
Phase 25) and
[RELEASE_NOTES_PHASES_1_40.md](RELEASE_NOTES_PHASES_1_40.md)
(initial build through stabilization milestone).

Status legend (matches the in-app Release Readiness Gate):

- **Ready** — verified by tests + repo structure
- **Needs Review** — observable but not green; review required before promotion
- **Blocked** — schema or governance gap; not safe to ship as-is
- **Not Wired** — capability is absent or cannot be observed from inside the app

> The Release Readiness Gate (Admin Workspace) computes the overall
> rollup from observable signals. Anything not observable in-app is
> reported as **Not Wired**, never assumed **Ready**.

---

## Architectural invariants

| Item | Status | Pin |
| --- | --- | --- |
| Workspace isolation (sealed role modules + WorkspaceGate) | **Ready** | `WORKSPACE_ISOLATION_VERIFIED` in `src/shared/governance/platformInventory.ts` |
| Permission-before-query (load*ForRole authorizes before child fetch) | **Ready** | `PERMISSION_BEFORE_QUERY_VERIFIED` in the same file |
| DealRoute single-role dispatch (no co-mount of two role surfaces) | **Ready** | `src/deals/DealRoute.test.tsx` parameterized loop |
| Pre-auth child-query guard (no `load*` before auth resolves) | **Ready** | `src/deals/preAuthChildQueryGuard.test.tsx` |
| Write surfaces gated by role (no banker writes in manager/team views) | **Ready** | `src/deals/dealWorkspaceWriteScoping.test.tsx` |

---

## DealRoute access matrix

| Route | Status | Auth function | Notes |
| --- | --- | --- | --- |
| Banker | **Ready** | `loadDealForBanker` | Full read/write deal workspace |
| Manager | **Ready** | `loadDealForManager` | Team-scoped read-only |
| Team | **Ready** | `loadDealForTeam` | Team-scoped read-only |
| Executive | **Not Wired (intentional)** | — | Snapshot-only by design |
| Admin | **Not Wired (intentional)** | — | Operational drill-through is a separate governance decision |
| Unknown / empty route | **Ready** | — | Falls through to explicit Access Denied |

---

## Governed write domains (8 entries)

| Domain | Phase | Audit | Timeline | Status |
| --- | --- | --- | --- | --- |
| Data Quality Flag resolve | 18 | ✓ | — | **Ready** |
| Alert resolve | 19 | ✓ | — | **Ready** |
| Alert dismiss | 19 | ✓ | — | **Ready** |
| Deal task complete | 21 | ✓ | ✓ | **Ready** |
| Deal document request | 22 | ✓ | ✓ | **Ready** |
| Credit memo draft save | 25 | ✓ | ✓ | **Ready** |
| Deal document mark received | 51 | ✓ | ✓ | **Ready** |
| Deal document mark reviewed | **55** | ✓ | ✓ | **Ready** |

Each governed write uses the same coordination shape: discriminated outcome union (`success | <domain>-failed | governance-partial | unknown`), single correlation id per attempt, best-effort Failed audit when the primary update fails, CRITICAL `governance-partial` copy when audit or timeline fails after the primary update succeeded ("Do not retry — the X may already be saved").

The discipline is regression-pinned end-to-end by the Phase 46–50 sweeps in `src/shared/governance/`: correlation-id ([correlationId.ts](../src/shared/governance/correlationId.ts)), outcome union, audit payload schema, timeline payload schema, plus the Phase 48 data-layer isolation guard.

---

## Local-only flows (no Dataverse write)

| Flow | Phase | Note |
| --- | --- | --- |
| Borrower update draft | 23 | Generate-and-copy only. No email sent. No `BorrowerUpdateSent` timeline event ever emitted. |
| Credit memo local preview | 24 | Pure deterministic generator (no AI). Phase 25 added the separate governed Save Draft path. |

---

## Executive snapshot boundary

| Item | Status | Notes |
| --- | --- | --- |
| Snapshot-only render (no operational reads in executive cards) | **Ready** | Phase 15 |
| Stale snapshot detection (refresh-status `staleDataFlag`) | **Ready** | Pinned by Release Readiness Gate (`exec snapshot safety`) |
| Transitional operational fallback (`PipelineByStage`, `MonthlyClosingForecast`) | **Needs Review** | Phase 15 — replace with snapshot entities before final promotion |
| Executive `/deals/:id` drill-through | **Not Wired (intentional)** | DealRoute denies — separate governance decision |

---

## Admin diagnostics

| Card | Status |
| --- | --- |
| System Health Summary | **Ready** |
| Data Quality Flags + resolve | **Ready** |
| Audit Anomalies | **Ready** |
| Alert Backlog + resolve/dismiss | **Ready** |
| Refresh Status | **Ready** |
| Configuration Overview (system settings + KPI thresholds) | **Ready** |
| Stage Governance Diagnostics | **Ready** — surfaces the Phase-28 schema gap with remediation steps |
| Release Readiness Gate | **Ready** — aggregates eight categories with honest Not-Wired reporting |
| Performance Diagnostics (Phase 31) | **Ready** — local in-memory only |

---

## Stage progression

| Item | Status | Notes |
| --- | --- | --- |
| Phase 27 read-only eligibility panel (Clear / At Risk / Blocked) | **Ready** | Pure derivation from authorized data |
| Phase 28 governed Advance Stage write | **Blocked** | Schema does not expose a deterministic next-stage ordering (`Cr664_stagereferences` not registered; no sequence/order field). See `src/shared/governance/stageProgressionAvailability.ts`. |
| Phase 29 Admin Stage Governance Diagnostics surfacing the gap | **Ready** | |

**Do NOT claim stage progression is complete.** The Advance Stage write is intentionally not shipped and the Release Readiness Gate reports the row as **Blocked**.

---

## Test / build verification

| Item | Status | Reason |
| --- | --- | --- |
| `npm run build` clean (out-of-band) | Verified in CI / by the developer | The app has no runtime hook into the build outcome. |
| `npm test` green (out-of-band) | Verified in CI / by the developer | Same — there is no in-process test-status feed. |
| In-app build/test status feed | **Not Wired (by design)** | Brief 30 guardrail: never claim Ready unless the signal is observable in-app. |

The Release Readiness Gate reports `test-coverage-build-verification` as **Not Wired** with the exact reason: *"The app has no in-process signal for `npm run build` or `npm test` results."*

---

## Remaining schema / data-source gaps

| Gap | Affected feature | Phase that documented it |
| --- | --- | --- |
| `Cr664_stagereferences` not registered as a Power Apps data source | Advance Stage write | 28 / 29 / 43 |
| No stage ordering / sequence field on loan deal or system settings | Advance Stage write | 28 / 29 / 43 |
| No `StageAdvanced` enum value on `cr664_DealTimelineEvent.cr664_eventtype` | Advance Stage timeline emission | 43 |
| Executive transitional fallback queries (no snapshot entities for `PipelineByStage`, `MonthlyClosingForecast`) | Executive snapshot-only invariant | 15 |
| No borrower email / draft entity in the generated schema | Borrower update delivery | 23 |
| No File column on `cr664_DocumentChecklist` | Binary document upload | 51 (was 22) |
| No `cr664_revieweddate` column on `cr664_DocumentChecklist` *(not blocking)* | Phase 54 pending-review signal anchors on receipt time, not review time; "reviewed N days ago" cadence | 55 |

---

## Explicitly deferred capabilities (NOT built)

> Do NOT advertise these as working. They remain intentionally out of scope as of Phase 55.

- **Email / Outlook / Graph delivery** — borrower update is local Copy-only (Phase 23).
- **Binary document upload** — Phase 22 stamps `cr664_requestdate`; Phase 51 stamps `cr664_receiveddate`; Phase 55 stamps `cr664_reviewer`. All three are metadata-only. No file column on the schema, so no binary travels. See [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md).
- **Borrower upload portal** — no external client surface exists. Borrowers continue to deliver out of band (email, file share, hand-delivery).
- **OCR / AI extraction / document intelligence** — no content analysis of any received document.
- **SharePoint / Teams / Outlook attachment sync** — no external system integration.
- **AI / model-driven generation** — credit memo draft is a deterministic generator; the preview banner explicitly says "No AI was used to produce this draft." (Phase 24).
- **Memo finalize / export / PDF / Submit** — Phase 24 + 25 ship Generate / Save Draft only.
- **Stage progression write** — see "Blocked" above. Phase 28 ships a deliberate non-implementation; Phase 43 documents the concrete unblock checklist.
- **Executive `/deals/:id` drill-through** — DealRoute denies. Snapshot-only is by design (Phase 15).
- **Admin `/deals/:id` drill-through** — DealRoute denies. Separate governance decision required.
- **Cross-team manager visibility** — Phase 14 / 33 / 36 scope manager to single team via `_cr664_team_value`.
- **External telemetry / analytics** — Phase 31 observability is local in-memory only; no beaconing, no off-platform send.

---

## Before promotion — required out-of-band steps

1. `npm run build` — must complete clean.
2. `npm test -- --run` — full suite green (currently 750/750).
3. Open the Admin Workspace and confirm the **Release Readiness Gate** overall badge reads either *"Cannot fully verify — signals not wired"* (acceptable when no blocker fires) or shows the expected **Blocked** state for Stage Governance and the **Not Wired** state for build/test (those are the current expected red flags).
4. Confirm no executive snapshot reports a stale-data flag (`staleDataFlag`).
5. Confirm no Critical alerts are open in the Alert Backlog.
6. Confirm the eight governed writes still pass their inventory-completeness regression tests in `src/shared/governance/` — Phase 46/47/49/50 sweeps. Adding a new governed write without extending the inventory mappings is a deliberate test failure.

If any of those steps surfaces an unexpected signal, **do not promote**.
