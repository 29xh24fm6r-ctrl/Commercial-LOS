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

## Phase 4 — seed + legacy stored values

**Seed (`scripts/seed-stage-references.mjs`) + `docs/STAGE_SCHEMA_SETUP.md`** already describe ONLY the
canonical seven (codes + seq 10–70) + the 5 status rows — confirmed; the BOARDED name was aligned to the
seed (`Boarded / Servicing`) so the display recognizer matches a seeded BOARDED deal by name. The seed-doc
caveat was updated from "industry-standard template, not OGB-ratified" to the founder-ratified canonical set.

**Stored stage values (no silent rewrite).** The read path resolves a deal's stored stage via
`recognizeCanonicalStage` (exact canonical CODE or ratified NAME, case-insensitive). Anything else reads
honestly as **"custom stage — not in canonical sequence"** (fail-closed; never crashes, never guessed). The
live env currently carries the placeholder `'TEST — Stage Phase 121'` (and deals are nominally at INTAKE,
which now resolves to seq 10). No existing stage value is rewritten by this pass.

**Legacy → canonical mapping (maker DATA-cleanup reference — apply in Dataverse, do NOT auto-rewrite).**
Clean equivalences:
| Legacy value | → Canonical |
|---|---|
| Underwriting / credit_memo | UNDERWRITING |
| Committee / credit_review / approval | CREDIT_APPROVAL |
| Documentation | DOCUMENTATION |
| Closing / closing | CLOSING_FUNDING |
| Booking / Funded | CLOSING_FUNDING → then BOARDED once boarded |
| opportunity_intake | INTAKE |
| post_close_monitoring | BOARDED |

Ambiguous — **surface for a human decision, do NOT fabricate a mapping:** the early-funnel legacy stages
**Origination / Screening / Application / Pricing** (9-stage) and **qualification / application /
document_collection** (11-stage) have no clean 1:1 canonical equivalent (canonical has a single INTAKE
before UNDERWRITING). A maker/credit decision is required to either collapse these to INTAKE or treat them
as pre-pipeline. Until decided, such values read as "custom stage — needs review".

### Follow-up (out of the cockpit-coherent scope, documented honestly)
Still on legacy vocabularies (not on the deal cockpit's stage map): `PersonalPipeline` lanes + `stageProgressionGuard`
name-gates (9-stage `stageCatalog`); `BorrowerPackagePrepPanel` + `loanWorkflowTemplates` (11-stage
`loanWorkflowStages`); the `STAGE_CATALOG` name collision; and the routing/annual-review catalog (vocabulary D).
These have dedicated tests built around their vocabularies; repointing/deleting them is a separate, larger pass.

## Phase 5 — governance truth-up + verification

- `platformInventory.REFERENCE_DATA_GOVERNED.stageCatalog.progressionBlockedReason` truthed-up: the
  canonical stage VOCABULARY is now `stageOrderingContract.CANONICAL_STAGES` (the 7, seeded via
  `cr664_sequence`); the legacy 9-stage catalog is noted as retired from the deal cockpit. `canonical`
  / `progressionEnabled:false` / phase kept (still accurate + test-pinned).
- `AUTO_STAGE_ADVANCE_ENABLED` unchanged (**false**) — this was an IA/coherence fix, not a behavior change.

| Gate | Result |
|---|---|
| `tsc -b` | ✅ |
| `vitest run` (FULL) | ✅ **10,583 passed**, 2 skipped |
| `eslint` (changed) | ✅ |
| `audit:reachability` | ✅ exit 0 (retired workflow-action chain allow-listed honestly) |
| `npm run build` | ✅ |
| `verify:launch-evidence` | exit 1 — **honest-red by design** (unchanged) |

## Definition of done
- [x] Inventory map of every stage vocabulary/renderer (this doc).
- [x] Exactly one canonical stage definition (`CANONICAL_STAGES`, the seven); the cockpit Stage Map +
      seed + doc import/mirror it.
- [x] Cockpit shows ONE canonical stage map: the 9-stage Stage Map repointed to canonical; the 11-stage
      Loan Workflow Command Center retired from the cockpit (anchor → `stage-map`).
- [x] "Intake (custom stage — not in canonical sequence)" resolves — INTAKE = canonical seq 10 via
      `recognizeCanonicalStage`.
- [x] Seed + doc describe only the canonical seven; legacy stored values documented for maker cleanup
      (clean mappings + flagged-ambiguous), never silently rewritten; unknown values read fail-closed.
- [x] Reachability/tests/routing updated honestly; suite + build green; branch not pushed; flag still off.

### Scope note (operator chose "cockpit-coherent")
The DEAL COCKPIT now speaks one canonical language. Two legacy vocabularies still exist for non-cockpit
surfaces (PersonalPipeline lanes + stageProgressionGuard on the 9-stage; BorrowerPackagePrep + templates
on the 11-stage) — repointing/deleting those is a documented follow-up, deliberately deferred to keep this
pass minimal-risk and the suite green.
