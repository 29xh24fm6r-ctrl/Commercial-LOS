# Factory Arc — Phase 0 Baseline

Date: 2026-07-23
Baseline commit: `3f97770` (`origin/master`, PR #102 merged — "Fix D-01 (deal read-path
test-exclusion) and D-02 (credit-memo error swallowing)")
Repo: `29xh24fm6r-ctrl/Commercial-LOS` (`code-app/`)

This document is the required Phase 0 deliverable for the Factory Build Arc: a
snapshot of exactly what exists, what is wired, what is gated, and what is
duplicated, before any remediation PR (103+) touches it.

## 1. Engineering baseline (green)

| Check | Result |
|---|---|
| `npx tsc -b` | Clean, 0 errors |
| Targeted PR #102 regression tests (7 files) | 84/84 passed |
| `npx vitest run` (full suite) | 893 files, 13,107 tests passed, 2 skipped, 0 failed (299.00s) |
| `npm run build` | Succeeded (pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` advisories only, no errors) |
| `npm run audit:reachability` | 735 reachable / 315 orphaned (all allow-listed) / **0 UNEXPECTED orphans** |

## 2. Mounted write paths, by domain

Root confirmed via `src/App.tsx` (`BrowserRouter` → `AuthGate` → 5 workspace
routes + `/deals/:dealId` + `/surfaces/:surfaceKey`, default-off per-surface
flags), cross-checked against `src/navigation/intentionallyUnrouted.ts` (the
auto-generated orphan allow-list).

**Deals / deal-profile**
- `src/deals/newDealCreateAdapter.ts` — governed `Cr664_loandealsService.create` (the one real New Deal create adapter, used by both the banker pilot and the disabled public path)
- `src/deals/write/buildLiveUpdateDealProfileDeps.ts` — deal profile field updates + audit
- `src/deals/buildLiveStageAdvanceDeps.ts` — forward stage-Advance write + audit + timeline
- `src/deals/buildLiveCanonicalTransitionDeps.ts` — canonical Return/Decline/Withdraw transition write (now genuinely mounted via `BankerDealWorkspace.tsx → DealGovernedTransitionPanel.tsx → StageWorkflowControl.tsx`)

**CRM**
- `src/crm/write/crmWriteAdapter.ts` — central CRM writer (orgs/persons/relationships/timeline/contact-points/audit), reached via `BankerShell.tsx → CrmHubWorkspace.tsx → CrmWriteActions.tsx`
- `src/crm/write/createClientRelationship.ts` — gated off (`CREATE_CLIENT_RELATIONSHIP_ENABLED=false`)
- `src/crm/write/bridgeOrgToClientRelationship.ts` — the one CRM write flag that's actually on (`BRIDGE_ORG_LINK_ENABLED=true`)
- `src/crm/write/linkDealCrmEntity.ts` — deal↔CRM entity linking
- `src/crm/crmLiveDataverseTransport.ts` / `src/crm/crmWritebackAdapter.ts` — **not mounted** (still on the orphan allow-list)
- Note: `CRM_ROUTE_ENABLED` / `CRM_LIVE_PERSISTENCE_ENABLED` / `CRM_CONTACT_EDITING_ENABLED` are all `false` — the mounted CRM Hub write buttons currently fail closed at runtime even though the code path is reachable

**Credit memo**
- `src/deals/creditMemoActions.ts` — `Cr664_creditmemodraftsectionsService.create`, `Cr664_creditmemo1sService.create` + audit + timeline

**Documents / checklist**
- `src/deals/documentActions.ts`, `src/deals/addRequiredDocumentAction.ts`, `src/deals/documentRequirementLiveDeps.ts` — checklist row create/update
- `src/deals/documentUploadLiveDeps.ts` — metadata-only "upload" (update); no binary storage exists yet (`NOT_WIRED.document-upload`)
- `src/deals/checklistLiveWriteDeps.ts`, `src/deals/newDealChecklistGenerationLiveDeps.ts` — checklist-generation write dependencies (see §4 duplication)

**Tasks**
- `src/deals/createDealTaskAction.ts` / `src/deals/dealTaskActions.ts` — `Cr664_dealtask1sService.create/.update` + audit + timeline

**Activity logging**
- `src/deals/logActivityActions.ts` — logs to both `cr664_crmtimelineevents` and `cr664_dealtimelineevents` + audit

**Closing** — no mounted write path. `src/closing/documents/*` is a fully-built, fully-tested (49 tests) framework that is entirely inert/unmounted — no live Dataverse table exists yet to persist generated documents in.

**Funding** — no mounted write path. `src/funding/*` is fully built (61 tests) and entirely inert/unmounted; `FUNDING_AUTHORIZATION_ENABLED=false`; no Dataverse table for authorization records exists yet.

**Portfolio boarding**
- `src/portfolioBoarding/PortfolioLoanBoardingForm.tsx` — mounted at `/surfaces/portfolio-boarding`, gated by default-off `PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED=false`
- `src/portfolioBoarding/portfolioLoanBoardingDataverseWriteClient.ts` — multi-entity create/update client (loan + 10 child tables)
- `src/portfolioBoarding/existingLoanEntryAdapter.ts`, `portfolioImportRunner.ts` — bulk/existing-loan boarding creates, **not confirmed mounted**

**Admin** — 7 write files (`alertActions.ts`, `dataQualityActions.ts`, `dealReferenceValueWrite.ts`, `dealRemovalWrite.ts`, `portfolioLoanRemovalWrite.ts`, `workspaceEntitlementWrite.ts`/`adminAccessGrantWrite.ts`, `adminEntitlementActivation.ts`) — all confirmed referenced from `AdminWorkspace.tsx`.

## 3. Capability flags and rollout-state models

63 `..._ENABLED/_LIVE/_APPROVED` constants found. Currently **live**:
`AUTO_STAGE_ADVANCE_ENABLED`, `TASK_GENERATION_ENABLED`,
`DUPLICATE_DETECTION_ENABLED`, `BANKER_CREATE_PILOT_ENABLED`,
`BRIDGE_ORG_LINK_ENABLED`, `EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED`,
`PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED`, `PRODUCTION_REFERENCES_APPROVED`,
`ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED`, and the annual-review
delivery-approval/dry-run/borrower-request flags. The large majority of flags
(new deal public path, CRM live persistence/contact/vendor editing, document
checklist generation, checklist write, document upload, advance-stage write,
portfolio boarding live persistence/route, funding authorization, borrower
messaging, CRM automation, admin entitlement write/revoke) are `false`.

**Rollout-state machine**: `src/deals/bankerNewDealCreateRollout.ts` →
`evaluateBankerCreateRollout()` is the **only** capability in the codebase
with a formal rollout-state machine
(`live_controlled|disabled|unauthorized|resolver_not_ready|references_not_approved|environment_not_allowed`).

**Dual banker-pilot vs. public/global truth models**: `adminNewDealIntakeModel.ts`
(public path) and `adminNewDealCreateCapabilityTruth.ts` (banker pilot,
explicitly derived from the same `evaluateBankerCreateRollout` inputs the live
UI uses) are the only fully-worked-out pair. Simpler flag-pair near-misses
exist (`crmAllowlistedLiveWritePilot.ts`,
`externalAllowlistedWritePilot.ts`, `documentChecklistPilotConfig.ts`).

**`src/shared/governance/platformInventory.ts`** (master static registry, 1074
lines): `GOVERNED_WRITES` (13 entries — the forward stage-advance write is a
real live write not yet registered as its own entry, a tracked follow-up);
`DELIBERATELY_BLOCKED` (1 entry, `stage-progression-advance`, whose own note
flags it as **stale** now that Return/Decline/Withdraw is genuinely mounted —
worth reconciling); `NOT_WIRED` (9 entries); `LOCAL_ONLY_FLOWS` (13 entries,
confirmed no-Dataverse-write by design).

## 4. Duplicate / legacy activation systems

- **Document-checklist generation — 5 independent write paths**, none
  reconciled: `workflow/checklistWriteDependency.ts` (Phase 237E, gated off),
  `deals/documentChecklistUiGenerationAction.ts` +
  `documentChecklistPilotConfig.ts` (Phase 188J, gated off),
  `activation/checklistGenerationActivation.ts` (Phase 221/228B, gated off,
  also mojibake-damaged), `deals/newDealChecklistGenerationAdapter.ts` +
  `newDealChecklistGenerationLiveDeps.ts` (New-Deal-flow auto-checklist), and
  `deals/checklistLiveWriteDeps.ts` (used by `addRequiredDocumentAction.ts`).
- **Credit-memo readiness — 2 divergent derivations**:
  `workflow/creditReadiness.ts` → `deriveCreditReadiness()` (used only by
  `CreditApprovalReadinessPanel.tsx`) has **no** unverifiable-requirement
  carve-out, so it still treats bare "Credit memo present" as satisfying
  readiness — the same historical bug class that
  `workflow/loanWorkflowRules.ts` → `deriveCreditBlockers()` already fixed
  (three requirement ids with no backing schema field are now `at-risk`, not a
  hard block, there). These two computations have no shared source of truth.
- **Stage transition/progression — 2 separate engines** for what reads as one
  user-facing capability: `workflow/canonicalStageTransition.ts`
  (Return/Decline/Withdraw) vs. `deals/buildLiveStageAdvanceDeps.ts` /
  `workflow/stageAdvanceWriteDependency.ts` (forward Advance) — only Advance is
  registered in `GOVERNED_WRITES`.
- **Confirmed dead duplicates** (superseded, never re-wired, kept only as
  history): `workflow/deriveWorkflowRoute.ts` (superseded by
  `deriveConfigurableWorkflowRoute.ts`), `workflow/approvalAuthorityMatrix.ts`
  (superseded by `creditApprovalAuthority.ts`).
- **CRM write-gate inconsistency**: `BRIDGE_ORG_LINK_ENABLED=true` but sibling
  `CREATE_CLIENT_RELATIONSHIP_ENABLED=false` and `CRM_LIVE_PERSISTENCE_ENABLED=false`
  — three independent local gates for closely related CRM-linking writes.
- **Not a bug** (deliberate, reconciled): `activity/canonicalActivityLogging.ts`
  is shared by both `logActivityActions.ts` and `crmWriteAdapter.ts` so they
  use identical activity vocabulary. NAICS mapping
  (`naicsSectorMap.ts`/`naicsIndustryMap.ts`) is complementary layering, not
  duplication.

## 5. Dataverse tables (generated services)

54 generated services under `src/generated/services/`. Grouped by lifecycle
stage, with wiring status:

- **Deal core** — `Cr664_loandealsService` (wired), `dealstagereferences` /
  `dealstatusreferences` / `producttypereferences` (read-only reference,
  live), `dealreadinesssnapshots` (unclear/likely unwired),
  `dataqualityflags` (wired).
- **CRM** — `crmorganizations`/`crmpersons`/`crmrelationships`/`crmtimelineevents`/
  `crmcontactpoints`/`crmauditentries` (wired but gated off by default);
  `crmcommunicationpreferences`/`crmcontactauthorizations`/`crmroleassignments`/
  `crmvendorprofiles` (unwired); `clientrelationships` (wired); `naicscodes`/
  `naicsindustrymaps` (unwired — the app uses a local derivation instead);
  `borrowers` (grandfathered orphan).
- **Documents / checklist** — `documentchecklists` (wired heavily, 5 write
  paths — see §4).
- **Credit memo** — `creditmemo1s`, `creditmemodraftsections` (wired).
- **Tasks** — `dealtask1s` (wired).
- **Activity / timeline** — `dealtimelineevents`, `auditevents` (wired — the
  two universal audit/timeline sinks).
- **Portfolio boarding** — `portfolioboardedloans` + 10 child tables + audit
  (wired via the write client, but gated behind
  `PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED=false`).
- **Admin / reference** — `alertqueues`/`workspaceentitlementses`/
  `platformusers` (wired); remainder appear read-only/reference or unwired.
- **Other** — `Office365OutlookService` (wired — live email send),
  `SystemusersService` (wired — actor/systemuser resolution for audit binds).

Grandfathered orphans still on `intentionallyUnrouted.ts` for at least one of
their model/service pair: `borrowers`, `clientrelationships`,
`naicsindustrymaps`, `portfolioboardedloanevidences`, `teams`, `users` —
several are consumed transitively by mounted CRM/portfolio code even while
formally "orphaned," worth a dedicated reachability re-check before deep
schema work begins.

## 6. Mojibake / encoding damage

Confirmed genuine double/triple-encoded UTF-8 corruption (em-dashes / smart
quotes) in 13 files, concentrated in comments/doc-strings (not
user-visible string literals, based on spot-checking), but two are inside
actively-used governed write-path files:

- `src/deals/documentActions.ts` (14 occurrences) — **live write path**
- `src/deals/addRequiredDocumentAction.ts` (7 occurrences) — **live write path**
- `src/crm/naics/naicsSearch.ts`
- `src/admin/adminWorkspaceEntitlementQuery.ts`
- `src/admin/adminOperationsConsoleModel.ts` (+ `.test.ts`)
- `src/admin/AdminOperationsConsole.tsx` (+ `.test.tsx`)
- `src/crm/crmFeatureFlags.ts` (+ `.test.ts`)
- `src/banker/GreetingHeader.tsx`
- `src/banker/LendingOSLayout.tsx`
- `src/activation/checklistGenerationActivation.ts` (+ `.test.ts`) — also has a stray BOM on line 1

## 7. Regression anchor

Known production Underwriting test deal used as the canonical regression
fixture across this arc: `310da4b3-cb86-f111-ab10-70a8a59b1fe2`
(see `src/banker/newDealVisibility.test.ts`).

## 8. Immediate follow-ups this baseline surfaces (not yet actioned)

1. Reconcile the stale `DELIBERATELY_BLOCKED` entry in `platformInventory.ts`
   for `stage-progression-advance` now that Return/Decline/Withdraw is
   genuinely mounted.
2. Register the forward stage-advance write as its own `GOVERNED_WRITES` entry.
3. Reconcile `creditReadiness.ts` to carry the same unverifiable-requirement
   carve-out `loanWorkflowRules.ts` already has, or consolidate to one
   derivation.
4. Consolidate (or at minimum document as intentional) the 5 independent
   document-checklist generation write paths.
5. Clean the 13 mojibake-damaged files, prioritizing the 2 live write-path
   files.

These are tracked for later PRs in the arc, not fixed in this baseline pass.
