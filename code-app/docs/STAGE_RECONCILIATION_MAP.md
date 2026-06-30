# Stage Vocabulary Reconciliation — Inventory Map (Phase 1)

Branch: `feature/stage-reconciliation` (from `integration/all-work-20260630c`).
Goal: collapse the app to ONE canonical stage vocabulary (the 7 ratified OGB stages) before seeding.

## The canonical 7 (the keeper)
`INTAKE/Intake/10 · UNDERWRITING/Underwriting/20 · CREDIT_APPROVAL/Credit Approval/30 ·
COMMITMENT/Commitment/40 · DOCUMENTATION/Documentation/50 · CLOSING_FUNDING/Closing & Funding/60 ·
BOARDED/Boarded · Servicing/70`. Status: OPEN/ON_HOLD/DECLINED/WITHDRAWN/BOARDED.

## Vocabularies found (FOUR, not three)

### A. CANONICAL 7 — the source of truth (codes in code, sequences in data)
| File | Role | Notes |
|---|---|---|
| `src/workflow/stageOrderingContract.ts` | **Definition** — `CANONICAL_STAGE_CODES` (codes only) | sequences come from Dataverse `cr664_sequence` via `resolveStageOrdering` (fail-closed if unseeded) |
| `src/workflow/stageGateContract.ts` | Definition — per-stage exit gates keyed by the 7 codes | |
| `src/workflow/canonicalStageTransition.ts` | Definition — governed transition engine (default-off) | |
| `scripts/seed-stage-references.mjs` + `docs/STAGE_SCHEMA_SETUP.md` | Data seed + doc — the 7 codes+names+seq 10–70 | the only place code+name+seq co-exist literally |
| `src/shared/governance/stageProgressionAvailability.ts` | Banner/diagnostics over the 7 | |
| `src/workflow/StageWorkflowControl.tsx` | **Renderer of the 7 — NOT MOUNTED** | `intentionallyUnrouted` (WIRED_DISABLED until seeded + armed) |

→ **No single TS module holds code+name+sequence together.** Codes: `stageOrderingContract`. Names+seq:
the seed/doc/data. The one on-screen canonical renderer is deferred to post-seed operator enablement.

### B. 9-STAGE LEGACY — "Stage Map" (Origination→Funded)
| File | Role | Mounted? |
|---|---|---|
| `src/shared/stages/stageCatalog.ts` | **Definition** — `STAGE_CATALOG` (Origination/Screening/Application/Pricing/Underwriting/Committee/Documentation/Closing/Funded + 3 terminal) | — |
| `src/deals/DealStageProgressionCard.tsx` | **Renderer** — the cockpit "Stage Map" + the **"custom stage — not in canonical sequence"** logic (matches against the 9-stage catalog) | **YES** — Banker/Manager/Team deal workspaces |
| `src/banker/PersonalPipeline.tsx` | **Renderer** — builds pipeline **lanes** from the 9 non-terminal stages | **YES** — banker shell |
| `src/deals/stageProgressionGuard.ts` | Consumer — `stageNameGatesMemo` (name→gate classification) | (logic) |

### C. OPPORTUNITY/QUALIFICATION LEGACY — "Loan Workflow Command Center" (11-stage)
| File | Role | Mounted? |
|---|---|---|
| `src/workflow/loanWorkflowStages.ts` | **Definition** — `LOAN_WORKFLOW_STAGES` (Opportunity/intake → Qualification → Application → Document collection → Underwriting → Credit memo → Credit review → Approval → Closing → Booking → Post-close monitoring) | — |
| `src/workflow/deriveLoanWorkflowState.ts` | Derive over the 11-stage spine | — |
| `src/workflow/LoanWorkflowCommandCenter.tsx` | **Renderer** ("Original OGB workflow spine") | **YES** — `BankerDealWorkspace` (directly below the 9-stage Stage Map) |
| `src/workflow/loanWorkflowTemplates.ts`, `src/workflow/BorrowerPackagePrepPanel.tsx` | Consumers | BorrowerPackagePrepPanel is **mounted** in `BankerDealWorkspace` |

### D. FOURTH — workflow-routing / annual-review catalog ("other", out of cockpit scope)
`src/workflow/deriveWorkflowStageSequence.ts` exports a **second `STAGE_CATALOG`** (name collision with B!)
— a 12-key credit-routing/annual-review spine (intake/spreading/covenant_testing/credit_committee_review/…).
Consumed by workflow **routing** panels, NOT the deal cockpit. Different concern; flagged but not in scope.

### E. Stored-stage readers (no own vocabulary — echo the record)
`src/deals/dealQueries.ts` reads `cr664_StageReference` (the single stored-stage read). Pipeline groupers
(`PipelineByStage`, `DealsByStage`, `BottlenecksAgingByStage`) render the raw stored string as-is. Live
operator data observed: `'TEST — Stage Phase 121'` → matches no vocabulary → triggers the custom-stage path.

## The incoherence (confirmed)
`BankerDealWorkspace` stacks **two legacy vocabularies on one screen**: `DealStageProgressionCard`
(9-stage) at the `stage-map` anchor, then `LoanWorkflowCommandCenter` (11-stage) immediately below. The
**canonical 7 reaches no screen** (its renderer is unmounted/disabled). The stored stage matches none →
"custom stage — not in canonical sequence". The "canonical" word is overloaded (the 9-stage catalog calls
itself "canonical" too), and `STAGE_CATALOG` is an ambiguous name shared by two unrelated vocabularies.

## Reconciliation decision (surfaced before mass edits — see run log / operator question)
Both legacy vocabularies feed MULTIPLE mounted surfaces with heavy test coupling, so "how far to retire"
is a real fork:
- **Option A (minimal-coherent):** add a canonical `{code,name,seq}` module; repoint the cockpit Stage Map
  (`DealStageProgressionCard`) to the canonical 7 (clears the custom-stage warning, INTAKE=seq 10); retire
  the redundant `LoanWorkflowCommandCenter` mount. Lower risk; cockpit speaks one language. Legacy
  definition modules remain for their non-cockpit consumers (PersonalPipeline lanes, BorrowerPackagePrep,
  templates), documented as follow-up.
- **Option B (full):** repoint EVERY consumer (PersonalPipeline, stageProgressionGuard, BorrowerPackagePrep,
  templates) to canonical and DELETE `stageCatalog` + `loanWorkflowStages` + the Command Center; rewrite the
  ~12 coupled test files. Matches "no second list may exist" fully; much larger + riskier.
