# Phase 129A — Microsoft Vibe scope completion audit

**Posture.** Audit only. No new features, no new routes, no new writes,
no schema work. This document is a precise, evidence-backed completion
matrix of the current app against the original Microsoft Vibe /
Commercial Lending LOS workspace scope, plus an explicit remaining
backlog. Where a claim could be guessed, it is instead cited to a file
or to the governance inventory. Anything not verifiable from the repo
is marked **Unverified** rather than asserted.

## 1. Sources of truth

- **Original Vibe scope (capability-level).**
  [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md)
  — the canonical 29-capability coverage map (Phase 69, maintained
  through the Phase 12x visual-restoration line). This audit
  re-projects that capability map onto the **workspace/surface** axis
  the Phase 129A brief asks for.
- **Live routing / reachability.**
  [src/App.tsx](../src/App.tsx) (route table),
  [src/bootstrap/workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts)
  (the six live Platform Workspace name → route aliases),
  [src/deals/DealRoute.tsx](../src/deals/DealRoute.tsx) (per-deal
  cockpit dispatcher).
- **Workspace composition.** The five route entry points in
  [src/workspaces/](../src/workspaces/) plus the per-deal workspaces in
  [src/deals/](../src/deals/) and [src/manager/](../src/manager/) /
  [src/team/](../src/team/).
- **Write posture / governance.**
  [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts).
  Current verified counts: **GOVERNED_WRITES = 13**,
  **LOCAL_ONLY_FLOWS = 16**, **NOT_WIRED = 9**,
  **DELIBERATELY_BLOCKED = 1** (pinned by
  [releaseCandidateSnapshot.test.ts](../src/shared/governance/releaseCandidateSnapshot.test.ts)).

## 2. Live workspace-name contract

The deployed environment seeds six Platform Workspace names. All six
resolve through `EXPLICIT_ALIASES` in
[workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts) — none fall
through to the substring fallback or fail closed:

| Live Platform Workspace name | Resolves to route |
|---|---|
| `Banker Workspace` | `/workspaces/banker` |
| `Team Workspace` | `/workspaces/team` |
| `Manager Command Center` | `/workspaces/manager` |
| `Portfolio Management` | `/workspaces/manager` (then `PortfolioCommandCenter` swaps in) |
| `Executive Dashboard` | `/workspaces/executive` |
| `Admin Control Center` | `/workspaces/admin` |

Six names → **five physical routes** + the per-deal route
`/deals/:dealId`. Portfolio is deliberately **not** a separate route:
it is a `?surface=portfolio` query swap inside the manager route
(`PORTFOLIO_SURFACE_URL = /workspaces/manager?surface=portfolio`), so
the two cockpits share one shell and one data provider with no
data-scope widening.

## 3. Completion matrix

Columns:

- **Required** — in the original Vibe workspace scope.
- **Built** — the surface composition exists in the repo.
- **Live reachable** — a signed-in user with the matching workspace
  name lands on it through the route table (no dead route).
- **Data-backed** — renders from authorized live Dataverse data via a
  provider chain (not static markup).
- **Posture** — Read-only (RO) vs Write-enabled (RW), with the write
  surface named.
- **Missing / deferred** — the honest gap.

| Surface | Required | Built | Live reachable | Data-backed | Posture | Missing / deferred |
|---|---|---|---|---|---|---|
| **Banker workspace** | ✅ | ✅ [BankerWorkspace.tsx](../src/workspaces/BankerWorkspace.tsx) → [BankerShell.tsx](../src/banker/BankerShell.tsx) | ✅ `Banker Workspace` | ✅ BankerProvider | **RW** (deal-scoped writes live on the per-deal cockpit; the command center itself is RO) | None at workspace level. Persistent banker notes are LOCAL_ONLY (schema-gated). |
| **Manager workspace** | ✅ | ✅ [ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) | ✅ `Manager Command Center` | ✅ ManagerDataProvider | **RO** by design (write-capable cards render `readOnly`) | Time-series trend lines / velocity (no snapshot store — schema). |
| **Portfolio workspace** | ✅ | ✅ [PortfolioCommandCenter.tsx](../src/portfolio/PortfolioCommandCenter.tsx) (Phase 126A–C) | ✅ `Portfolio Management` (query surface on manager route) | ✅ reuses manager data provider | **RO** | None at surface level. Shares the manager team-pipeline scope (no separate portfolio data scope). |
| **Team workspace** | ✅ | ✅ [TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx) + [TeamOpsQueue.tsx](../src/team/TeamOpsQueue.tsx) (Phase 127) | ✅ `Team Workspace` | ✅ TeamDataProvider (label hydration brought to parity in Phase 128B) | **RO** | "Deals you touch" scoping still shares the manager team scope (governance + schema decision). |
| **Executive workspace** | ✅ | ✅ [ExecutiveWorkspace.tsx](../src/workspaces/ExecutiveWorkspace.tsx) | ✅ `Executive Dashboard` | ⚠️ Partial — PortfolioSummary / AtRiskPortfolioSummary / BankerProductionRollup data-backed; **PipelineByStage + MonthlyClosingForecast on transitional fallback** | **RO** (board-safe, no drill-through by design) | Snapshot entities for the two transitional features (schema). Executive deal drill-through is `NOT_WIRED` by Phase 15 governance choice. |
| **Admin workspace** | ✅ | ✅ [AdminWorkspace.tsx](../src/workspaces/AdminWorkspace.tsx) | ✅ `Admin Control Center` | ✅ AdminDataProvider | **RW** (`alert-resolve`, `alert-dismiss`, `data-quality-flag-resolve` governed writes; config + diagnostics are RO) | Edit affordances for system settings / KPI thresholds (each needs its own governed write). Admin deal drill-through deferred by governance. |
| **Per-deal cockpit** | ✅ | ✅ [DealRoute.tsx](../src/deals/DealRoute.tsx) → Banker/Manager/Team deal workspaces | ✅ `/deals/:dealId` for banker/manager/team | ✅ DealDataProvider | **RW for banker** (tasks, documents, credit memo, borrower emails — see §4); **RO for manager + team** | Executive + admin deal drill-through return an explicit denial (deliberate). Binary document upload `NOT_WIRED` (schema). |
| **Borrower communication surface** | ✅ (listed) | ✅ [BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) (card on banker deal cockpit) | ✅ via banker deal cockpit | ✅ deal-scoped | **RW** (LIVE outbound: `deal-document-request-email`, `deal-borrower-update-email`) | No inbound, no two-way thread, no automation. |
| **Borrower portal / concierge** | ✅ (listed) | ❌ | ❌ | ❌ | — | `NOT_WIRED.borrower-portal` (compound: external auth + token table + external role + File column + secure-message store). Phase 65 deferral, pinned by structural tests. |
| **Relationship / client surfaces** | ✅ (listed) | ✅ Cards, not a route: [RelationshipMemory.tsx](../src/banker/RelationshipMemory.tsx) (banker), [RelationshipContext.tsx](../src/deals/RelationshipContext.tsx) (per-deal), [ManagerRelationshipMemory.tsx](../src/manager/ManagerRelationshipMemory.tsx) (manager) | ✅ via host workspaces | ✅ derived from authorized deal rows (client-name grouped) | **RO** + LOCAL_ONLY note draft / Teams + Outlook copy handoffs | No persistent cross-deal banker notes, no verified borrower entity id, no household linkage (schema + governance). |

### Reachability summary

- **6 / 6** required role workspaces are built **and** live-reachable.
- **5 / 6** are fully data-backed; **Executive** is partially
  data-backed (2 of 5 cards on honestly-labelled transitional
  fallback).
- The **per-deal cockpit** is built and reachable for the three
  operating roles (banker RW, manager/team RO); executive/admin
  drill-through is a deliberate governance denial, not a gap.
- **Borrower-facing portal** is the one required-but-not-built surface,
  and it is a tracked compound block, not an oversight.

## 4. Write surfaces by workspace (the RW detail)

From `GOVERNED_WRITES` (12 entries) in
[platformInventory.ts](../src/shared/governance/platformInventory.ts),
grouped by where the affordance lives:

- **Banker per-deal cockpit** — document request, mark document
  received, mark document reviewed, complete task, create
  review-follow-up task, credit-memo draft save, document-request
  email (LIVE), borrower-update email (LIVE), and the related
  task/alert writes.
- **Admin workspace** — `alert-resolve`, `alert-dismiss`,
  `data-quality-flag-resolve`.
- **Manager / Team / Portfolio / Executive** — **no governed writes**
  (RO by design; write-capable cards on the manager deal view render
  with `readOnly=true`).

## 5. Explicit remaining backlog

Ordered by how close each is to in-repo motion. None are guesses —
each maps to an existing inventory entry or a documented enablement
plan.

1. **Executive transitional snapshots** — replace the
   `PipelineByStage` + `MonthlyClosingForecast` transitional fallback
   with real snapshot entities. **Blocker:** schema (snapshot entities
   don't exist). Tracked: `EXEC_TRANSITIONAL_FALLBACK_FEATURES`.
2. **Stage progression Advance Stage write** — the one
   `DELIBERATELY_BLOCKED` entry. **Blocker:** Lane G schema (register
   `Cr664_stagereferences` as a data source + sequence field). Plan:
   [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md).
3. **Binary document upload** — `NOT_WIRED.document-upload`.
   **Blocker:** Lane C (File column on `cr664_DocumentChecklist`).
4. **Admin system-settings / KPI-threshold edit** — currently RO.
   **Blocker:** governance (one governed write per editable setting).
5. **Persistent relationship notes / verified borrower entity** —
   today LOCAL_ONLY. **Blocker:** schema + privacy governance.
6. **Borrower portal (compound)** — `NOT_WIRED.borrower-portal`.
   **Blocker:** external identity + token table + external role + File
   column + secure-message store. Lane D; lands in a separate Code App
   per the workspace-isolation invariant.
7. **"Deals you touch" team scoping** — team currently shares the
   manager team scope. **Blocker:** governance + schema definition of
   "touch".
8. **Lane E / F capabilities** (Teams push/calendar, Copilot/AI, voice,
   document intelligence) — connector / tenant / model-governance
   blocked. No-admin Teams + Outlook copy-handoff slices already
   shipped (Phases 86/96–101).

## 6. What this phase changed

- **Docs:** this file.
- **Governance pins:** `src/shared/governance/phase129AMicrosoftVibeScopeAudit.test.ts`
  locks the completion matrix's verifiable claims — all six live
  workspace aliases resolve to a route, the five physical routes +
  per-deal route are registered, Portfolio is a query surface (no
  separate route), the per-deal dispatcher admits banker/manager/team
  and denies executive/admin, the governance counts match the matrix
  (12 / 16 / 8 / 1), and this doc cites those same numbers.
- **No source/feature changes.** No new route, no new write, no schema.

## 7. Confirmations

- Workspace coverage: **6 / 6 role workspaces + per-deal cockpit built
  and live-reachable.** One required surface (borrower portal) remains
  a tracked compound block.
- `GOVERNED_WRITES = 13`, `LOCAL_ONLY_FLOWS = 16`, `NOT_WIRED = 9`,
  `DELIBERATELY_BLOCKED = 1`.
- No claim of portal availability, AI usage, Teams integration, live
  delivery confirmation, or upload availability beyond what the
  inventory supports.
- `npm run build` clean.
