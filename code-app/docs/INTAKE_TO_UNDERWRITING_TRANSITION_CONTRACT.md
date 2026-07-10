# Intake → Underwriting Transition Contract

Authoritative operator workflow for advancing a commercial loan deal from **Intake** to
**Underwriting**. Produced from the live smoke test of the designated test-only deal
(`[SMOKE TEST - PHASE 170K] TEST - New Deal Smoke 170K`), which failed because mandatory exit
criteria could not be completed through the normal UI. This document is the single source of truth
for the transition; the code references below are the implementation.

Every write named here goes through a governed adapter with the discipline
**authorize (fail-closed) → validate → write → readback (proof) → audit + timeline**. Nothing is
faked, no local-only state substitutes for persistence, and no hidden API or direct DB edit is used.

---

## 1. Stages

| | |
|---|---|
| **Authoritative current stage** | `INTAKE` (`cr664_StageReference` → `cr664_dealstagereferences`, resolved via `recognizeCanonicalStage`) |
| **Valid next stage** | `UNDERWRITING` only (`loanWorkflowStages.ts` → `allowedNextStages: ['UNDERWRITING']`) |
| **Canonical order** | `stageOrderingContract.ts` → `CANONICAL_STAGES` (Intake 10 → Underwriting 20 → … → Boarded 70) |

## 2. Mandatory exit criteria (HARD blockers — hold the transition)

The **one authoritative blocker model** is `deriveDealBlockerModel(stageCode, facts)`
(`src/deals/dealBlockerModel.ts`), which reads the stage-exit requirement engine
(`deriveStageExitReadiness` / `evaluateStageExitPolicy`). Every surface consumes it: the Stage Map,
the Metric Deck "Blockers" tile, and the advance guard. A **hard blocker** is a *tracked blocking*
requirement not met.

| Requirement | Backing (source of truth) | Resolved by (direct remediation route) |
|---|---|---|
| Loan amount | `cr664_amount` on `cr664_loandeals` | **Deal Profile** → governed `updateDealProfile` (now editable; §5) |
| Client name | `cr664_Client` lookup → `cr664_clientrelationships` | **Relationships** → governed `linkDealCrmEntity` |
| Product type | `cr664_ProductTypeReference` | Deal Profile reference lookup |
| Loan structure | `cr664_LoanStructureTypeReference` | Deal Profile reference lookup |
| Target close date | `cr664_targetclosedate` | Deal Profile |
| Industry | `cr664_industry` | Deal Profile (or Apply CRM/NAICS) |
| Customer type | `cr664_customertype` | Deal Profile |
| **Loan application** (document) | a `cr664_documentchecklists` row named "Loan application" in **received**/reviewed state (matched by name in `loanWorkflowRules.ts`) | **Documents** → governed `addRequiredDocument` (new; §6) |

Each hard blocker on the Stage Map renders a **direct remediation control** (`BlockerRemediation` in
`DealStageProgressionCard.tsx`) — edit profile, add document, link client, open tasks/credit memo —
so a banker never hunts across tabs. Read-only popovers are no longer the only destination.

## 3. Recommended (non-blocking) work

Intake recommended tasks — *initial borrower conversation*, *qualification review*, *application
completeness review* — are surfaced separately (`model.recommended`, severity `recommended`) and do
**not** hold the transition. Clearly distinguished from hard blockers everywhere.

## 4. Role authorization

The governed advance and all remediation writes require an **authorized banker with a resolved
Dataverse identity** (`useOptionalBanker` → `systemUserId` + `email`, no `writeDisabledReason`).
Manager/Team render the same cards read-only. The audit `cr664_ChangedBy` and timeline `cr664_EventBy`
bind a resolved `cr664_user` (fail-closed), never a `systemuser` id.

## 5. Loan amount edit (was: no UI path)

`updateDealProfile` (`src/deals/write/updateDealProfile.ts`) now governs `amount` as a `number`
field (`cr664_amount`): positive-value validation, numeric readback tolerance, and a numeric verified
patch projected into the cockpit via `applyVerifiedDealPatch` (no reload). `cr664_amount` was removed
from `DEAL_PROFILE_FORBIDDEN_COLUMNS`; **stage / status / banker / client remain forbidden** here (they
move only through their own governed flows). UI: a "Loan amount" input in `DealProfileEditModal`.

## 6. Required-document intake (was: no add/upload action)

`addRequiredDocument` (`src/deals/addRequiredDocumentAction.ts`) is the supported operator path:
governed **create** of a `cr664_documentchecklists` row → associated to the deal (`cr664_Deal`),
classified by name (`cr664_documentname`), stamped received (`cr664_receiveddate`) → **readback proof**
(name + received date + deal FK) → audit + timeline. It satisfies the document requirement and, being a
real Dataverse row, survives refresh. UI: "Add required document" in the Documents panel and the Stage
Map remediation (`AddRequiredDocumentModal`).

> **Honest limitation:** `cr664_documentchecklists` has **no File column**, so binary file bytes are
> not stored — this records the *governed receipt* of the document as metadata (the copy says "record
> received", never "upload"). Real byte upload requires a maker to add a File column + regenerate the
> SDK (tracked in `activation/documentUploadActivation.ts`). This is the maximal production-backed path
> under the current schema; it does not fake an upload.

## 7. Transition confirmation, persistence, history, audit

`advanceWorkflowStage` (`stageAdvanceWriteDependency.ts`) — gated by both the write-seam
`evaluateStageTransitionPolicy` and the engine `evaluateStageExitPolicy` (agree by construction):
1. **Update** `cr664_StageReference@odata.bind` + `cr664_stageentrydate`.
2. **Readback proof** the stage + entry date persisted (else `readback_failed`, not reported advanced).
3. **Audit** `cr664_auditevents` (old→new stage, outcome, correlation id, `cr664_ChangedBy`).
4. **Timeline** `cr664_dealtimelineevents` (StageChanged, banker+manager visibility).

The advance button enables **only when all hard requirements are satisfied**
(`hardBlockerCount === 0`).

## 8. Destination-stage work generation (was: none)

On a verified advance, `generateDestinationStageWork` (`src/deals/generateDestinationStageWork.ts`)
seeds the destination stage's standard tasks (Underwriting → *Document intake review*, *Underwriting
analysis*) as real governed `cr664_dealtask1` rows via `createDealTask`, assigned to the acting banker.
**Idempotent by title** (re-entry never duplicates), then `refresh` reloads tasks + activity.

## 9. CRM synchronization / refresh / re-login

Linking a CRM client/team persists via `linkDealCrmEntity` (readback-verified) and now calls
`applyVerifiedDealPatch` so the header, Missing Fields tile, completeness, and the blocker model
refresh **immediately without navigation or reload**. All cockpit surfaces read one
`DealDataProvider` context; a governed write patches the deal row or calls a bundled `refresh(...)`,
so state never goes stale. After re-login, the deal is re-read from Dataverse, so every persisted
value (amount, client, documents, stage) is durable.

## 10. Date-only fields

Date-only business fields (target close, due dates, stage entry) are rendered as **calendar dates**
via `parseCalendarDate` / `formatCalendarDate` (`src/shared/formatters.ts`) — a value like
`2026-09-08` is parsed at *local* midnight, so the displayed day never shifts across timezones (the
smoke defect: "Sep 7" for a stored `2026-09-08`). Applied to the shared formatter, the Metric Deck,
Deal Summary, Tasks, Documents, and blocker rules.

## 11. Booking-readiness semantics

`ClosingBookingReadinessPanel` is **stage-aware**: below Closing & Funding (sequence 60) it reports
**"not yet evaluated" / pending upstream completion** instead of a misleading green "BOOKING READY".
It evaluates for real only from Closing & Funding onward.

---

## Tested vs. requires live operator smoke test

### Verified by automated tests (green in CI)
- **Date-only, no timezone drift** — `src/shared/formatters.test.ts` (parse + format at local midnight; timestamps unaffected).
- **Loan amount edit + persistence** — `updateDealProfile.test.ts` (numeric write to `cr664_amount`, formatted-input parse, invalid rejected, readback-mismatch fail-closed, numeric verified patch) + `DealProfileEditModal.test.tsx` (amount field renders; stage/status/client/banker still excluded).
- **Required-document intake + requirement satisfaction** — `addRequiredDocument.test.ts` (governed create → readback proof → audit/timeline; readback-mismatch and create-failure never fake success; no `cr664_uploadstatus`).
- **Authoritative blocker model + aggregation consistency + remediation routes** — `dealBlockerModel.test.ts` (hard vs recommended, exact counts, every hard blocker has a route: amount→edit-profile, client→link-client, loan application→add-document) + `DealMetricDeck.test.tsx` (tile counts hard blockers, not just overdue work; drops to 0 when satisfied).
- **Destination-stage work generation** — `generateDestinationStageWork.test.ts` (Underwriting tasks created, assigned to banker, idempotent by title, failures captured).
- **Stage-aware booking readiness** — `ClosingBookingReadinessPanel.test.tsx` (Intake → "not yet evaluated"; Closing & Funding → evaluated).
- **CRM-link state invalidation** — `CrmRelationshipPanel.link.test.tsx` (link calls `applyVerifiedDealPatch` with the verified client so header/Missing-Fields refresh without reload).
- **Disabled/enabled advancement + governed advance + audit/history** — existing `DealStageProgressionCard.test.tsx`, `buildLiveStageAdvanceDeps.test.ts`, `stageProgressionGuard.test.ts` remain green; the engine caller-guard keeps button and write in agreement.
- Full suite: **11,322 tests pass, 0 fail**; `tsc -b` clean; `npm run build` clean; reachability audit **0 unexpected orphans**.

### Requires live operator smoke test (cannot be proven in unit tests — real Dataverse + identity)
1. **End-to-end walk** on the 170K test deal: open in Intake → edit loan amount → link CRM client → complete each profile field → add the Loan Application → watch each blocker clear individually → advance button enables → confirm → advance to Underwriting.
2. **Real persistence + readback** against the live `cr664_loandeals` / `cr664_documentchecklists` / `cr664_dealtask1` / `cr664_auditevents` / `cr664_dealtimelineevents` tables (unit tests use injected deps / mocked services).
3. **Stage-advance arming** — `AUTO_STAGE_ADVANCE_ENABLED` gates the live write; an operator must arm it and the `cr664_dealstagereferences` table must be seeded for the advance to persist.
4. **Reference lookups** — Product Type / Loan Structure become resolvable only when their reference lists are provisioned in the environment (the modal is honest when they are not).
5. **Refresh/re-login durability** — reload the browser and re-login to confirm amount, client, document, generated Underwriting tasks, and the new stage all persist.
6. **Cross-surface consistency in the live app** — confirm the Blockers tile, Stage Map, and advance guard show the same hard-blocker count on a real deal.
