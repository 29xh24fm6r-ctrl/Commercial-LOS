# Phase 191 — Banker V1 Release Candidate Hardening

## 0. Purpose & verdict

This phase audits, hardens, tests, and documents the **full banker V1 LOS path**
— from workspace entry through deal creation, deal review, tasks, documents,
checklist, CRM facts, and credit memo preview — and produces a **go/no-go
matrix** for launch.

**Release recommendation: CONDITIONAL GO.**

The banker can navigate the entire core LOS flow with **no fake/sample data, no
broken routes, no fail-open permissions, and no uncertified writes**. Every
release-critical surface is mounted, null-guarded, and fail-closed. The single
non-blocking (yellow) item is that **live New Deal creation is intentionally
gated OFF by default** behind the certified Phase 181C controlled rollout; it is
an operator flip, not a defect. There are **no P0 blockers**.

This phase enables nothing new: no checklist generation, no borrower comms, no
permission widening, no schema/migration, no fake data.

## 1. Banker V1 release path map

```
sign-in
  → AuthGate.runBootstrap()                       (src/bootstrap/AuthGate.tsx)
  → bootstrapFlow resolves cr664_platformuser     (src/bootstrap/bootstrapFlow.ts)
      → primary workspace name → resolveWorkspaceRoute()
      → unresolved ⇒ UnresolvedWorkspaceError ⇒ honest ErrorState
        (NO default workspace, NO fallback dashboard, NO silent demotion)
  → HomeRedirect → /workspaces/banker             (src/bootstrap/HomeRedirect.tsx)
  → WorkspaceGate(allowed=banker) — fail-closed    (src/bootstrap/WorkspaceGate.tsx)
  → BankerWorkspace → BankerProvider (identity gate) → BankerShell
        (src/workspaces/BankerWorkspace.tsx, src/banker/BankerShell.tsx)
  → "Active Deals" tab → <BankerNewDealCreate/> (mounted; rollout-gated) + <PersonalPipeline/>
  → open a deal → /deals/:dealId → DealRoute → BankerDealWorkspace
        (src/App.tsx, src/deals/DealRoute.tsx, src/deals/BankerDealWorkspace.tsx)
  → deal cockpit surfaces (overview, readiness, tasks, documents, checklist,
    CRM facts, credit memo)
```

Permission-before-render is enforced twice: `WorkspaceGate` bounces any route
the user is not entitled to (`<Navigate to={route} replace/>`), and
`BankerProvider` blocks all rendering until a `cr664_Banker` row resolves for the
signed-in UPN. Nothing opens by default.

## 2. Surface inventory & 3. Certification status

Legend — **green** = release-ready · **yellow** = demo-ready, needs follow-up ·
**red** = release blocker.

| # | Surface | Component(s) | Mounted | Status | Notes |
|---|---------|--------------|---------|--------|-------|
| 1 | **Workspace entry** | `BankerWorkspace` → `BankerProvider` → `BankerShell` | ✅ | 🟢 green | Fail-closed identity gate; no fallback dashboard. |
| 2 | **New Deal create** | `BankerNewDealCreate` (Active Deals tab) | ✅ | 🟡 yellow | Mounted + reachable; governed by certified Phase 181C `evaluateBankerCreateRollout`. **Live create disabled by default** (3 hard gates false ⇒ `disabled`); renders an honest "Create disabled" badge, performs no write. |
| 3 | **Deal detail / deal workspace** | `BankerDealWorkspace` via `/deals/:dealId` → `DealRoute` | ✅ | 🟢 green | Four explicit error states (loading/denied/not-found/failed) before any surface renders. |
| 4 | **Overview / relationship context** | `DealHeader`, `DealSummary`, `RelationshipContext` | ✅ | 🟢 green | Missing fields render "Not set" / "Not provided" (honest absence). |
| 5 | **Readiness / status** | `DealBlockers`, `DealStageProgressionCard`, `DealMetricDeck` | ✅ | 🟢 green | Derive signals only when data is ready; zero counts on empty. |
| 6 | **Tasks** | `DealTasks` | ✅ | 🟢 green | `canWrite = !readOnly && !!banker?.systemUserId`; null-guarded. |
| 7 | **Documents** | `DealDocuments` | ✅ | 🟢 green | Certified request/receive/review flow (Phase 104–110 lane already certified). |
| 8 | **Document checklist** | `DocumentChecklistPilotPanel` (inside `DealDocuments`) | ✅ | 🟢 green | Banker-only, read-only, `generateDisabled = true`; no comms, no row writes, no generated-service call. |
| 9 | **Credit memo preview** | `CreditMemo` | ✅ | 🟢 green | Null-guarded; preview/derive only. |
| 10 | **CRM relationship facts** | `DealCrmRelationshipPanel` → `CrmRelationshipPanel`, `CrmRelationshipDetailCards` | ✅ | 🟢 green | Read-only projection; **no write affordance, no Dataverse client, no fabricated spine**. |

## 4. P0 / P1 / P2 blocker list

**P0 (release blockers): NONE.**
- App builds (incl. from a no-`.power` clone — see §9). ✅
- Banker workspace loads (fail-closed identity gate). ✅
- New Deal create surface available + reachable. ✅
- Deal workspace available with all surfaces. ✅
- No fake/sample production data appears. ✅
- Permission-before-render fails **closed**. ✅
- No uncertified borrower comms. ✅
- Checklist generation not enabled. ✅
- No runtime throw on the core banker path (every surface null-guarded). ✅

**P1 (should-fix before broad GA, non-blocking for controlled launch):**
- **Live New Deal creation is OFF by default.** The create surface is mounted
  and certified, but `BANKER_NEW_DEAL_CREATE_ENABLED`,
  `NEW_DEAL_CREATE_ADAPTER_ENABLED`, and `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`
  are all `false`, so `evaluateBankerCreateRollout()` returns `disabled`. To let
  bankers create deals live, an operator must flip the certified Phase 181C
  pilot gates (plus production rollout approval). This is a deliberate gate, not
  a defect.

**P2 (nice-to-have / future polish):**
- Bundle size warning on `vite build` (main chunk > 500 kB) — cosmetic; suggest
  future code-splitting. Not a banker-flow blocker.
- Document checklist generation remains a future (188L+) controlled-enable
  phase; the preview panel stays read-only by design.

## 5. What was fixed in this phase

A full audit of the banker V1 path (routing, deal workspace, fake-data, and
borrower-comms surfaces) found **no visibly broken release-critical surface**:
every surface is already mounted, null-guarded, fail-closed, and free of fake
data. Accordingly this phase adds **enforcement and documentation** rather than
behavioral repairs:

- Added `docs/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING.md` (this go/no-go
  record).
- Added `src/shared/governance/phase191BankerV1ReleaseCandidateContract.test.ts`
  pinning the entire banker V1 flow as executable invariants (route exists +
  reachable, no fallback dashboard, no fake-data literals, New Deal create
  mounted + certified-gated, all deal surfaces mounted, checklist pilot
  safe/controlled, gates false, CRM read-only with no write affordance, no route
  count regression, Phase 190A build recovery wired).
- Extended `releaseCandidateSnapshot.test.ts` so the release snapshot formally
  tracks the Phase 191 doc + contract.

No production component behavior was changed; no surface was hidden behind green
docs. Where a surface is intentionally disabled (New Deal live create, checklist
generation) that state is recorded as the honest yellow/P1/P2 item above.

## 6. What remains disabled intentionally

- **Live New Deal create** — gated off behind certified Phase 181C rollout (P1).
- **Document checklist generation** — all three gates stay `false`:
  - `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false`
  - `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false`
  - `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`
- **Borrower comms in the checklist path** — none wired; the pilot panel imports
  only React + shared UI + its pure view-model/config.
- **Manager/team permission** — unchanged; no widening introduced here.

## 7. Explicit no-fake-data statement

The production banker path renders **no fake, sample, demo, mock, or fabricated
business data**, and has **no fallback/sample dashboard**. Every banker and deal
surface renders live Dataverse data or an honest empty/error state ("No deals
yet", "Not set", explicit `ErrorState`). This is pinned by the Phase 191
contract (no fake-data literals; no sample/demo/seed imports in the banker
workspace).

## 8. Explicit no-borrower-comms statement

This phase introduces **no borrower communication** of any kind — no borrower
email / SMS / Outlook / handoff / document-send. The document checklist pilot
path wires **no borrower comms** (verified against code with comments stripped).
The pre-existing, already-certified document-request and communication surfaces
(Phase 104–110 communication lane release lock) are unchanged and untouched.

## 9. Explicit build-from-no-`.power` verification

The Phase 190A recovery remains wired: `package.json`'s `build` script runs
`node scripts/phase190A-power-artifact-preflight.mjs --ensure && tsc -b && vite
build`. From a fresh clone with **no `.power/`** directory, the preflight writes
a build-only, secret-free native fallback manifest, then `tsc -b` and `vite
build` succeed. `pnpm build` therefore works deterministically from a
no-`.power` state with no manual step. Verified in this phase (see §11).

## 10. V1 go/no-go recommendation

**CONDITIONAL GO.**

- **GO conditions met:** banker can use the core LOS flow with no fake data, no
  broken routes, no fail-open permission, and no uncertified writes; the app
  builds from a no-`.power` clone.
- **Conditional (yellow / P1):** live New Deal creation is intentionally
  disabled by default behind the certified Phase 181C rollout — flip the pilot
  gates (with production rollout approval) to enable bankers to create deals
  live. No P0 remains.

## 11. Verification

```
pnpm test -- phase191 banker BankerWorkspace NewDeal DealDocuments documentChecklist CRM releaseCandidateSnapshot
pnpm test -- documentChecklistPilot documentChecklistUiGenerationAction phase188K phase190A releaseCandidateSnapshot
pnpm build
pnpm test
```

Build recovery (Phase 190A) ensures `pnpm build` works from a no-`.power` state.
