# Stabilization Checklist — Commercial Lending Code App

**Phase: 40 (stabilization)**
**Test suite: 347 tests passing across 33 files**
**Bundle: ~620 kB minified / ~152 kB gzipped**

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

## Governed write domains

| Domain | Phase | Audit | Timeline | Status |
| --- | --- | --- | --- | --- |
| Data Quality Flag resolve | 18 | ✓ | — | **Ready** |
| Alert resolve | 19 | ✓ | — | **Ready** |
| Alert dismiss | 19 | ✓ | — | **Ready** |
| Deal task complete | 21 | ✓ | ✓ | **Ready** |
| Deal document request | 22 | ✓ | ✓ | **Ready** |
| Credit memo draft save | 25 | ✓ | ✓ | **Ready** |

Each governed write uses the same coordination shape: discriminated outcome union (`success | <domain>-failed | governance-partial | unknown`), single correlation id per attempt, best-effort Failed audit when the primary update fails, CRITICAL `governance-partial` copy when audit or timeline fails after the primary update succeeded ("Do not retry — the X may already be saved").

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
| `Cr664_stagereferences` not registered as a Power Apps data source | Advance Stage write | 28 / 29 |
| No stage ordering / sequence field on loan deal or system settings | Advance Stage write | 28 / 29 |
| Executive transitional fallback queries (no snapshot entities for `PipelineByStage`, `MonthlyClosingForecast`) | Executive snapshot-only invariant | 15 |
| No borrower email / draft entity in the generated schema | Borrower update delivery | 23 |
| No document storage / upload pipeline | Document upload | 22 |

---

## Explicitly deferred capabilities (NOT built)

> Do NOT advertise these as working. They are intentionally out of scope as of Phase 40.

- **Email / Outlook / Graph delivery** — borrower update is local Copy-only (Phase 23).
- **Document upload** — Phase 22 stamps `cr664_requestdate` only; no upload pipeline.
- **AI / model-driven generation** — credit memo draft is a deterministic generator; the preview banner explicitly says "No AI was used to produce this draft." (Phase 24).
- **Memo finalize / export / PDF / Submit** — Phase 24 + 25 ship Generate / Save Draft only.
- **Stage progression write** — see "Blocked" above. Phase 28 ships a deliberate non-implementation with documented remediation.
- **Executive `/deals/:id` drill-through** — DealRoute denies. Snapshot-only is by design (Phase 15).
- **Admin `/deals/:id` drill-through** — DealRoute denies. Separate governance decision required.
- **Cross-team manager visibility** — Phase 14 / 33 / 36 scope manager to single team via `_cr664_team_value`.
- **External telemetry / analytics** — Phase 31 observability is local in-memory only; no beaconing, no off-platform send.

---

## Before promotion — required out-of-band steps

1. `npm run build` — must complete clean.
2. `npm test -- --run` — full suite green (currently 347/347).
3. Open the Admin Workspace and confirm the **Release Readiness Gate** overall badge reads either *"Cannot fully verify — signals not wired"* (acceptable when no blocker fires) or shows the expected **Blocked** state for Stage Governance and the **Not Wired** state for build/test (those are the current expected red flags).
4. Confirm no executive snapshot is stale (`staleDataFlag`).
5. Confirm no Critical alerts are open in the Alert Backlog.

If any of those steps surfaces an unexpected signal, **do not promote**.
