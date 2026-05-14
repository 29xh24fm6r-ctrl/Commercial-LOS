# Release Notes — Phases 1 through 40

**Current state as of Phase 40**

- 347 tests passing across 33 test files
- `npm run build` clean
- Bundle ~620 kB minified / ~152 kB gzipped
- **Not production-ready.** The Release Readiness Gate currently rolls up to **"Not ready to promote — blockers open"**, with **Stage Governance** as the expected **Blocked** category and **Test/build verification** as the expected **Not Wired** category. See `STABILIZATION_CHECKLIST.md` for the full pre-promotion checklist.

---

## Phase summary

### Phases 1–4 — Auth, identity, deal routing
- AuthGate + Bootstrap context (UPN → LOS profile → workspace entitlement → resolved workspace route).
- Sealed role workspaces (banker / team / manager / executive / admin) with `WorkspaceGate` per-route guard.
- `DealRoute` dispatch with banker branch + `loadDealForBanker` authorization (assigned-banker FK match).
- `BankerDealWorkspace` mounts `DealDataProvider` only after authorization resolves; child queries never fire pre-auth.

### Phases 5–13 — Banker deal-workspace reads
- DealHeader, DealSummary, DealBlockers (Phase 7 rule-engine), DealTasks, DealDocuments, CreditMemo, ActivityTimeline, BorrowerCommunication.
- Pure derivations: `deriveBlockers`, `deriveCreditMemoFreshness`, calendar-day math, severity tiers.
- Vibe-style visual polish in Phase 13.

### Phases 14–17 — Other role workspaces (read-only)
- Phase 14 — Manager Command Center (team pipeline, banker workload, closing forecast, at-risk/blocked deals).
- Phase 15 — Executive Workspace **snapshot-only**. Two transitional operational-fallback queries (`PipelineByStage`, `MonthlyClosingForecast`) explicitly marked "transitional" because their snapshot entities don't exist yet.
- Phase 16 — Team Workspace (shared pipeline, bottlenecks, document needs, task load, closing calendar).
- Phase 17 — Admin Workspace (system health, data quality flags, audit anomalies, alert backlog, refresh status, configuration).

### Phases 18–25 — Governed write program
- Phase 18 — Data Quality Flag resolve.
- Phase 19 — Alert resolve + Alert dismiss.
- Phase 20 — Vitest infrastructure (separate `vitest.config.ts` due to Vite-rolldown / Vitest-Vite version skew). All write-related tests live here forward.
- Phase 21 — Deal task complete (governed: update + audit + DealTimelineEvent NoteLogged subtype).
- Phase 22 — Deal document request.
- Phase 23 — Borrower update draft. **Local-only Copy** — no email, no Outlook/Graph, no `BorrowerUpdateSent` ever emitted.
- Phase 24 — Credit memo local preview. Pure deterministic generator. **No AI used** — the preview banner says so explicitly.
- Phase 25 — Credit memo Save Draft governed write (creates `cr664_creditmemo1` as Draft + per-section `cr664_creditmemodraftsection` rows + audit + NoteLogged timeline event with `creditmemo:draft-saved` subtype).

Every governed write uses the same coordination shape: discriminated outcome union, single correlation id, best-effort Failed audit on the primary-failure branch, CRITICAL **governance-partial** copy on audit/timeline-failure-after-primary-success ("Do not retry — the X may already be saved").

### Phases 26–29 — Stage progression (derived → blocked → governed diagnostic)
- Phase 26 — Credit memo freshness signal (derived, conservative copy: "May be stale" / "Review recommended").
- Phase 27 — Stage Progression Guard read-only eligibility panel (Clear / At Risk / Blocked + Next-action guidance).
- Phase 28 — **Deliberately blocked implementation.** No `Cr664_stagereferences` Power Apps data source exists; no sequence/order field on the deal record. Per the brief guardrail, the Advance Stage write was NOT shipped; the gate function `stageProgressionAvailability()` returns `available: false` with the full schema audit and the future-extension contract.
- Phase 29 — Admin Stage Governance Diagnostics card surfacing the Phase-28 gap with remediation steps. Pure shared module in `src/shared/governance/stageProgressionAvailability.ts` so admin and deals views read from one source of truth.

### Phase 30 — Release Readiness Gate
- Eight categories: workspace isolation, permission-before-query, executive snapshot safety, admin diagnostics health, governed write coverage, stage progression readiness, data quality / alert backlog, test coverage / build verification.
- Status ladder: `blocked > needs-review > not-wired > ready`. Not-Wired sorts ABOVE Ready so the gate cannot report green when a signal is unobservable.
- `test-coverage-build-verification` is hardcoded **Not Wired** under every input — the app has no runtime hook into CI / build / test results.
- Current overall rollup: **"Not ready to promote — blockers open"** (Stage Governance is Blocked).

### Phase 31 — Observability instrumentation
- Local in-memory `perfRegistry` (`src/shared/observability/perfRegistry.ts`). Bounded ring buffer; aggregates query timings, refresh trigger counts, write-refresh fan-out, recent failures.
- `timed()` wrapper is a pure passthrough (reference identity preserved; original errors re-thrown unchanged).
- Disabled mode is a no-op — behavior unchanged.
- No external telemetry. No analytics. No beaconing.
- Admin Performance Diagnostics card with Refresh / Pause / Clear controls.

### Phases 32–34 — Role work queues
- Phase 32 — Banker `MyWorkQueue` (banker-scoped two-step fetch: deal ids → OR-chain over tasks/docs/memos).
- Phase 33 — Manager `TeamWorkQueue` (team-scoped via `ManagerDataProvider.teamPipeline`). Rows started **text-only**; lifted to links in Phase 36 once the manager DealRoute branch was wired.
- Phase 34 — Team `SharedWorkQueue` (team-scoped via existing `TeamDataProvider` + new `loadTeamMemos`). Same pattern as Phase 33; rows lifted to links in Phase 37.

Each queue has its own role-specific signal set (banker has none extra; manager surfaces `unassigned-banker`; team surfaces `unassigned-task`). All three rank items via the same severity ladder.

### Phase 35 — Shared work-queue primitives refactor
- Extracted **only** the stable primitives (severity ladder, tier ranks, calendar-day math, sort comparator, UI helpers, `MAX_WORK_QUEUE_ROWS`) into `src/shared/workQueue/primitives.ts`.
- **No generic `WorkQueue` component, no universal queue engine** — the three cards remain role-owned.
- Bundle dropped by ~3 kB. All 269 pre-existing tests passed unchanged.

### Phases 36–37 — Manager + Team read-only deal drill-through
- Phase 36 — `loadDealForManager` (team match) + `ManagerDealWorkspace` + manager branch in `DealRoute`. Four write-capable cards gained an explicit `readOnly` prop and a `useOptionalBanker` hook for safe mounting outside a `BankerProvider`.
- Phase 37 — `loadDealForTeam` + `TeamDealWorkspace` + team branch in `DealRoute`. Both auth functions share a private `loadDealByTeamMatch` helper to keep the schema predicate in lockstep.

### Phases 38–39 — Permission regression matrices (tests only)
- Phase 38 — `DealRoute.test.tsx` (dispatch matrix across all 5 routes + invalid URL + strict-isolation loop), `loadDealForBanker.test.ts`, `preAuthChildQueryGuard.test.tsx` (no child fetch fires before role auth resolves).
- Phase 39 — `bankerWriteSurfaceAvailable.test.tsx` (positive case: write buttons DO render in banker mode), `dealWorkspaceWriteScoping.test.tsx` (manager/team workspaces with auth-ready render ZERO write buttons; denied/failed/loading paths never call write/audit/timeline services). One pre-existing Phase-31 timing test stabilized via stubbed `performance.now`.

### Phase 40 — Stabilization (this commit)
- Static metadata in `src/shared/governance/platformInventory.ts` consolidating governed writes / deliberately-blocked / not-wired / local-only flows / workspace deal-access matrix.
- `ReleaseReadinessGate` refactored to consume the metadata (no behavior change).
- This release-notes document + the stabilization checklist.
- Pinned-blocker test in `platformInventory.test.ts`.

---

## Current workspace capabilities

| Workspace | Read | Write | Deal drill-through |
| --- | --- | --- | --- |
| Banker | Full deal workspace + pipeline + work queue | Task complete, Document request, Credit memo Save Draft (Phase 21, 22, 25) | Read-write |
| Manager | Team pipeline, banker workload, closing forecast, at-risk deals, team work queue | None | Read-only (Phase 36) |
| Team | Shared pipeline, bottlenecks, doc needs, task load, closing calendar, shared work queue | None | Read-only (Phase 37) |
| Executive | Snapshot-only command center + transitional operational fallback (PipelineByStage, MonthlyClosingForecast) | None | **Denied (intentional — snapshot-only)** |
| Admin | System health, DQ flags, audit anomalies, alert backlog, refresh status, configuration, stage governance diagnostics, release readiness gate, performance diagnostics | DQ flag resolve, Alert resolve/dismiss (Phase 18, 19) | **Denied (intentional)** |

---

## Current write capabilities (six governed writes)

1. **Data Quality Flag resolve** (Phase 18) — admin
2. **Alert resolve** (Phase 19) — admin
3. **Alert dismiss** (Phase 19) — admin
4. **Deal task complete** (Phase 21) — banker
5. **Deal document request** (Phase 22) — banker
6. **Credit memo draft save** (Phase 25) — banker

Plus four **local-only flows** that never reach Dataverse:
- Borrower update draft (Phase 23)
- Credit memo local preview (Phase 24, separate from the Phase 25 save path)
- Plus the read-only generators / freshness signals / eligibility panels (Phase 24, 26, 27)

---

## Current read-only limitations

- Manager and Team workspaces never write to Dataverse — they exist for visibility only.
- Manager and Team deal drill-through is read-only — no Complete / Request / Generate / Save / Send / Promote buttons render.
- Stage progression is **derived eligibility only**. The Advance Stage write is intentionally not shipped (see Phase 28).
- Executive cards are snapshot-only. Two cards still use the transitional operational fallback adapter pending snapshot entities.
- Borrower update is **local Copy-to-clipboard only**. No email is ever sent. No `BorrowerUpdateSent` timeline event is ever emitted.
- Credit memo can be saved as a Draft. There is **no Finalize, no Submit, no Export, no PDF**.
- No AI / model calls anywhere in the app. Phase 24 + 25 use a deterministic generator.

---

## Current known blockers (do not promote without addressing)

1. **Stage progression schema gap** — `Cr664_stagereferences` is not a Power Apps data source; no ordering field exists. Surfaced in the Admin Stage Governance Diagnostics card and the Release Readiness Gate as **Blocked**.
2. **Test / build verification not wired in-app** — the gate reports **Not Wired**; verify out-of-band via `npm run build` + `npm test -- --run` before any promotion.
3. **Executive transitional fallback** — `PipelineByStage` and `MonthlyClosingForecast` still use the operational-fallback adapter; gate reports **Needs Review**.

Today's Release Readiness Gate overall: **"Not ready to promote — blockers open"** because of #1. Closing #1 + addressing #3 + out-of-band verification of #2 are the minimum gates for promotion.

---

## Safe next phases

These are conservative directions that respect the current blockers:

- **Phase 41 candidate — schema regeneration for stage references.** Add `Cr664_stagereferences` as a Power Apps data source, re-run `pac code add-data-source`, regenerate the typed SDK, then flip `stageProgressionAvailability()` to `available: true` and implement the Phase 28 governed Advance Stage write under the Phase 21/22/25 coordination pattern. The diagnostic card + release gate will flip automatically once the gate function returns true.
- **Phase 41 alt — snapshot entities for executive fallback features.** Replace `PipelineByStage` + `MonthlyClosingForecast` operational queries with snapshot reads, then remove their entries from `EXEC_TRANSITIONAL_FALLBACK_FEATURES`. The Executive snapshot row in the release gate will flip to **Ready**.
- **Phase 41 alt — credit memo finalize.** With Phase 25 (Save Draft) already governed, finalize is a state transition (`cr664_status: draft → final`) on the existing entity. Same coordination pattern. Lock with a "no finalize when prohibited language present" guard.
- **Phase 41 alt — document upload pipeline.** New domain. Schema-first: confirm the storage / SharePoint / Dataverse-file approach, then build the upload + a governed `received-date` write (mirrors Phase 22's request flow).
- **NOT safe yet — borrower email delivery.** Requires Outlook / Graph integration, delivery-failure handling, and borrower-safe send-time validation. Phase 23 left this explicitly deferred.

---

## Test count progression

| Phase | Total tests | Delta |
| --- | --- | --- |
| 20 (Vitest infrastructure) | ~25 | + |
| 25 (Save Credit Memo Draft) | 125 | |
| 30 (Release Readiness Gate) | 193 | +21 |
| 33 (Manager Work Queue) | 251 | |
| 36 (Manager drill-through) | 301 | |
| 38 (DealRoute regression matrix) | 331 | +24 |
| 39 (Write permission matrix) | 347 | +16 |
| 40 (this) | 347 | +pinned-blocker assertions (small) |

The 347 currently-passing tests include every governed-write success/failure outcome, every role's deal-access auth path, every dispatch matrix branch, every read-only / write-surface render assertion, and every pure-function regression.
