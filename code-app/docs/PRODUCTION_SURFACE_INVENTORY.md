# Production-Surface Inventory

**Factory Arc Phase 1.** Read this alongside `src/shared/governance/productionSurfaceInventory.ts` —
that file is the machine-readable version this document narrates; the guard test
(`src/shared/governance/bankerFacingLaunchLanguageGuard.test.ts`) enforces it.

## Why this exists

The Commercial LOS has real, working banker functionality — New Deal creation, document
requirements, CRM manual writes, stage advancement — but several banker- and manager-facing
surfaces still narrate the product as an unfinished internal launch program: pills that say
"gated," tooltips that print raw constant names like `DRY_RUN`, provenance notes that cite
internal phase codes ("gated by the 189E readiness audit"), and dashboards whose entire data
model is `'operational' | 'review' | 'gated'` sourced from global feature-flag constants rather
than the banker's own deals.

This phase makes **no behavior change**. It catalogs every instance so later phases have a
concrete, reviewable worklist instead of an unbounded "clean up the launch language" ask.

## Scope searched

`src/banker`, `src/deals`, `src/workspaces`, `src/crm`, `src/portfolioBoarding`, `src/shared`,
`src/admin`, plus `src/manager` and `src/access` (both explicitly in scope per the factory
brief). Non-test `.ts`/`.tsx` source only — `.test.ts(x)` files, `docs/`, and `scripts/` were not
scanned (those are legitimately allowed to use this vocabulary; see Phase 13 for a separate
mojibake/copy pass that also touches docs).

## Method

1. Grepped for: `gated`, `disabled`, `pilot`, `certification`/`certified`, `launch`, `rollout`,
   `smoke`, `dry run`/`DRY_RUN`, `pending enablement`, `pending operator approval`,
   `feature flag`, `safe default`, and global-feature-posture read-only language.
2. For every hit, determined whether it is potentially user-visible copy (a JSX string, a
   template literal feeding a label/summary/detail prop, a Badge/pill child, a `title`
   attribute) versus a purely internal identifier (a variable name, a comment, a type name, an
   import path). Internal-only hits are not inventoried as violations, but files that are
   **entirely** launch/certification modeling are still cataloged (they're not violations
   themselves — they're the source of the violations bankers/managers eventually see, and/or
   they're exactly the kind of file Phase 4/5 needs to relocate/rename).
3. Classified each file's current and correct-future audience and named which arc phase resolves
   it.

## Findings by audience

### Banker-operational (Phase 3 dashboard rewrite, Phase 6 capability availability, Phase 10/11)

| File | What a banker sees today | Fix |
|---|---|---|
| `src/banker/bankerOperatingCommandCenterModel.ts` | `state: 'operational' \| 'review' \| 'gated'` per domain; `"Generation gated"`, `"Boarding persistence armed — pending certification"`, `"Create gated"` | Phase 3: replace with per-capability `CapabilityAvailability` derived from the banker's own deals |
| `src/banker/BankerOperatingCommandCenter.tsx` (§4 "System status") | `"What's live vs. gated for you — hover a pill for detail."`; a pill whose value is the raw string `DRY_RUN` | Phase 3: remove the pill strip entirely, replace with Portfolio & Workflow Health metrics |
| `src/banker/BankerNewDealCreate.tsx` | `"Create disabled"`, `"New Deal creation is not enabled in this environment."` | Phase 11: hide/disable with a specific, non-global reason |
| `src/deals/DraftBorrowerUpdateModal.tsx` | `"Mode: DRY_RUN."`, `"DRY_RUN: borrower update prepared for ..."` | Phase 10: real communication state, not the transport-mode token |
| `src/deals/RequestDocumentModal.tsx` | `"Mode is DRY_RUN: nothing leaves the client."`, `"Send recorded (DRY_RUN)"` | Phase 10: same fix |

### Portfolio-operational (Phase 9)

| File | What a user sees today | Fix |
|---|---|---|
| `src/portfolioBoarding/PortfolioLoanBoardingForm.tsx` | `"Live boarding persistence is not enabled in this environment... nothing is saved until an operator enables it after a recorded smoke test."` | Deal-specific boarding state, never a smoke-test reference |
| `src/portfolioBoarding/PortfolioLoanBoardingDocumentUploadPanel.tsx` | `"DRY RUN — no SharePoint connector is wired yet."` | "Document not yet stored — connector unavailable," phrased locally |

### CRM — shared across banker/manager/team/admin (Phase 8)

`src/crm/commandCenter/crmCommandCenterViewModel.ts` and its four mounting components
(`CrmCommandCenterShell.tsx`, `CrmWorkspaceEntryCard.tsx`, `CrmCommandCenterRoute.tsx`) present an
entire "dry-run only" posture (`dryRunOnly: true`, `"Live CRM and lending workflow writes are
disabled..."`) to every workspace that mounts the CRM Command Center — confirmed via
`src/navigation/featureSurfaces.tsx` to include **banker, team, manager, and admin**. This
contradicts the fact that manual CRM writes (`CrmHubWorkspace.tsx`) are actually live and
governed — only *automated* writeback is the dormant domain. `CrmRelationshipDetailCards.tsx`
additionally leaks internal phase codes into banker-visible provenance text ("gated by the 189E
readiness audit"). Two entirely-dormant consoles (`CrmDryRunWritebackCommandCenter.tsx`,
`CrmSpineRecoveryConsole.tsx`) are already correctly unrouted
(`src/navigation/intentionallyUnrouted.ts`) — no current audience; if ever mounted they belong
under Admin Platform Operations only.

### Manager-operational (Phase 3, same pass as banker)

`src/manager/managerOperatingCommandCenterModel.ts` is structurally identical to the banker
model. `src/manager/ManagerOperatingCommandCenter.tsx` is actually **worse**: it renders the raw
internal state token (`"gated"`, `"operational"`, `"review"`) as the visible Badge *label*, not
just using it for tint the way the banker version does. `src/workspaces/ManagerWorkspace.tsx`
mounts a panel literally titled **"Launch Readiness"** (`ManagerWorkflowLaunchReadinessPanel`,
under `src/workflow/` — outside this scan's 7 directories, flagged for a dedicated read before
Phase 3 lands).

### Admin-platform-operations — already the correct audience

The following are entire files whose sole purpose is launch/certification/activation modeling,
and all are confirmed mounted only in `src/workspaces/AdminWorkspace.tsx`:
`releaseGovernanceSnapshot.ts` (renamed from `fullSystemLaunchReadinessModel.ts` in Phase 5; + console, 55 occurrences),
`fullActivationLaunchCertificationModel.ts` (+ panel, 69), `v1GoLiveReleaseCertificationModel.ts`
(+ panel, 42), `eliteCrmLosActivationReadinessModel.ts` (+ panel, 23),
`ogbCrmWorkflowActivationModel.ts` (+ panel, 26), `controlledLiveCutoverReadiness.ts` (23),
`fullProductionLaunchEvidence.ts` (34), `emailLiveSmokeTest.ts` (+ diagnostics UI, 58),
`finalV1ReleaseDecisionModel.ts` (11), `shared/readiness/v1ActivationReadinessModel.ts` (9),
`productionEnvironmentVerification.ts` (74, not yet fully triaged render-vs-internal).

These don't need an audience change — they're already admin-only. What they need is
**consolidation**: Phase 4 folds their live-relevant content into the new Platform Operations
workspace (Runtime Capabilities / Feature Activation / Smoke Evidence), and Phase 5 retires the
static, offline `deriveFullSystemLaunchReadiness()` from being importable by any runtime path
outside admin/build-time.

`src/access/OperatorLaunchConsole.tsx` is worth calling out specifically: it is *already*
essentially the Phase 4 "Platform Operations > Runtime Capabilities" spec (per-capability gate
state, latest smoke, rollback, observe-only). It isn't currently mounted under any of the 7
scanned workspace/admin files — Phase 4 should consolidate into it rather than build a duplicate.

## What Phase 1 does NOT do

- Does not remove, hide, or reword a single string.
- Does not flip any flag.
- Does not touch `deriveBankerOperatingCommandCenterModel`, `BankerOperatingCommandCenter.tsx`,
  or any other file listed above.
- Does not build the Platform Operations workspace, the `OperationalCapabilityState` /
  `ReleaseGovernanceState` split, or the capability-availability adapter — those are Phases 2, 4,
  and 6.

## Next step

Phase 2 (state separation) and Phase 3 (remove the banker "System status" strip) are the two the
factory brief calls out as removing "the most visible development-era behavior... without
weakening any production safeguards." Both are scoped, reviewable follow-on phases from this
inventory, not started in this PR.
