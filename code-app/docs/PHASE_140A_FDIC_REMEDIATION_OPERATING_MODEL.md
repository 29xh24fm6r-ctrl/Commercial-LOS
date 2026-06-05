# Phase 140A — FDIC Remediation Lending OS Mega Foundation

> **What this is.** A platform-wide operating model that organizes every
> theme the 2025 FDIC Safety & Soundness Report of Examination raised about
> Credit Underwriting and Loan Administration into one honest control
> architecture across the entire Commercial Lending OS.
> **Domain model + docs + tests only.** No visible UI change. No Dataverse schema. No writes. No regulatory completion claim.

## Purpose

The FDIC report's weaknesses are platform-wide: repayment capacity,
underwriting quality, MIS/core-data accuracy, document enforceability, dual
controls, independent loan review, problem-credit monitoring, appraisal and
evaluation controls, ACL/CECL support, classified assets, special mention,
board oversight, and growth/concentration. Phase 140A turns that list into a
governed **evidence layer**: a finding-to-control-to-evidence catalog,
distributed across eight workspaces, with honest statuses and a sequenced
roadmap.

This phase deliberately builds the foundation as an **operating system**,
not a one-off patch. FDIC remediation becomes a permanent governance/evidence
layer of the Lending OS rather than a temporary response project.

## Why this is platform-wide, not just a portfolio dashboard

A portfolio dashboard can show classified assets and concentration trends,
but it cannot capture repayment-source evidence (that is the banker's deal
workspace), reconcile core data (Credit Administration), challenge risk
ratings (Independent Loan Review), or support the ACL (Finance). Treating
FDIC remediation as a portfolio-only problem would re-create the exact
single-owner gap the examination criticized. The model therefore distributes
ownership across eight workspaces and makes Portfolio the **control tower**,
not the sole owner.

## FDIC report finding themes

The thirteen normalized finding themes (`FDICFindingTheme`):

| Theme | Plain-language finding |
| --- | --- |
| `board_oversight` | Insufficient board/executive oversight and commitment tracking. |
| `repayment_source` | Repayment capacity and primary/secondary sources under-documented. |
| `underwriting_quality` | Credit memos not supported by guarantor / tax / cash-flow analysis. |
| `mis_data_accuracy` | Core loan data / MIS inaccurate, not reconciled to system of record. |
| `loan_documentation` | Incomplete files; documents that may not be legally enforceable. |
| `dual_control_data_entry` | Data entry without dual control / segregation of duties. |
| `appraisal_evaluation` | Missing appraisal determinations and appraisal reviews. |
| `independent_loan_review` | Independent review inadequate to challenge ratings. |
| `problem_credit_monitoring` | Stale watchlists; untracked deterioration. |
| `classified_assets` | Classified assets not consistently identified/tracked. |
| `special_mention` | Special-mention credits not consistently flagged. |
| `acl_cecl` | ACL/CECL support, qualitative factors, individual evaluations thin. |
| `portfolio_growth_concentration` | Growth/concentration without commensurate monitoring. |

## Lending OS control architecture

```
Banker / Deal Workspace      → source evidence layer
Credit Administration        → control execution layer
Portfolio Command Center     → command center / control tower
Independent Loan Review      → independent challenge layer
ACL / CECL Workbench         → finance reserve support layer
Appraisal / Evaluation Queue → collateral compliance layer
Executive / Board            → accountability layer
Governance Evidence Ledger   → proof / audit layer
```

Each of the thirteen controls (`FDIC-*-1`) maps to exactly **one** primary
workspace, lists the evidence it must produce, and defaults to an honest
not-yet-wired status.

## Workspace responsibility model

`src/shared/fdic/fdicWorkspaceResponsibilityMap.ts` declares, per workspace:
purpose, `controlsOwned`, `controlsSupported`, `evidenceProduced`,
`evidenceConsumed`, `futureUISurface`, and `currentLimitations`. A test pins
that each workspace's `controlsOwned` matches exactly the controls whose
`primaryWorkspace` is that workspace — the map can never drift from the model.

## Finding-to-control matrix

| Control id | Theme | Primary workspace |
| --- | --- | --- |
| `FDIC-BOARD-OVERSIGHT-1` | board_oversight | executive_board_oversight |
| `FDIC-REPAYMENT-SOURCE-1` | repayment_source | banker_deal_workspace |
| `FDIC-UNDERWRITING-QUALITY-1` | underwriting_quality | banker_deal_workspace |
| `FDIC-MIS-DATA-ACCURACY-1` | mis_data_accuracy | credit_administration_workspace |
| `FDIC-LOAN-DOC-COMPLETE-1` | loan_documentation | credit_administration_workspace |
| `FDIC-DUAL-CONTROL-DATA-ENTRY-1` | dual_control_data_entry | credit_administration_workspace |
| `FDIC-APPRAISAL-EVALUATION-1` | appraisal_evaluation | appraisal_review_queue |
| `FDIC-INDEPENDENT-LOAN-REVIEW-1` | independent_loan_review | independent_loan_review_workspace |
| `FDIC-PROBLEM-CREDIT-MONITORING-1` | problem_credit_monitoring | portfolio_command_center |
| `FDIC-CLASSIFIED-ASSETS-1` | classified_assets | portfolio_command_center |
| `FDIC-SPECIAL-MENTION-1` | special_mention | portfolio_command_center |
| `FDIC-ACL-CECL-SUPPORT-1` | acl_cecl | acl_cecl_workbench |
| `FDIC-GROWTH-CONCENTRATION-1` | portfolio_growth_concentration | portfolio_command_center |

## Evidence architecture

`src/shared/fdic/fdicEvidenceArchitecture.ts` catalogs each evidence
artifact: what it is, which workspace produces it, who consumes it, the
controls it backs, its minimum fields, the claims it must never carry, and
its current availability. In Phase 140A **every artifact is `not_wired`** —
the platform captures none of this evidence in a governed, persisted form
yet.

## No fake compliance rule

This is the central discipline of the whole foundation:

- **Evidence is not automatically compliance.** An evidence artifact is an
  input that must be independently reviewed and approved before any
  regulatory claim. Evidence artifact presence does not equal remediation.
- The platform never asserts a credit, the portfolio, or the institution is `compliant`, `remediated`, `FDIC approved`, or `examiner ready`. Those are regulatory conclusions the platform must not make, and no status value or artifact may carry them.
- The only honest statuses are `mapped_not_wired`, `evidence_gap`,
  `partially_wired`, and `wired_with_evidence`. Nothing is marked
  `wired_with_evidence` unless current code truly produces the evidence.
- No sample or demo data is presented as regulatory evidence; no invented
  production evidence exists.

## Portfolio as command center, not sole remediation owner

The Portfolio Command Center is the **control tower**: it sees and trends
classified assets, special mention, watchlist, and concentration, and it
consumes evidence produced by other workspaces. It owns four monitoring
controls — but it does not own document completeness, repayment capacity,
independent review, reserve support, or appraisal compliance. Ownership is
distributed by design.

## Credit Administration as control execution layer

Credit Administration owns document completeness, core-data reconciliation,
dual-control data entry, and appraisal/evaluation routing — the
highest-frequency execution controls. It is the most-loaded owner because the
examination's most frequent findings live here.

## Banker / Deal workspace as source evidence layer

The banker's deal workspace is where repayment-source and underwriting
support is first captured against a deal. It owns the repayment-source and
underwriting-quality controls and produces the source evidence the rest of
the layers review.

## Independent Loan Review as challenge layer

Independent Loan Review owns the review universe, sampling/review plan,
policy-compliance review, risk-rating challenge, and review conclusions. It
is the independent challenge that the examination found inadequate.

## ACL / CECL as finance reserve support layer

The ACL/CECL Workbench owns reserve support, qualitative-factor evidence, and
individually-evaluated-loan analysis — the finance support behind the
allowance.

## Appraisal Review as collateral compliance layer

The Appraisal/Evaluation Review Queue owns required-appraisal determinations,
report tracking, and independent appraisal review with exception handling.

## Executive / Board as accountability layer

Executive/Board Oversight owns management commitments, board-attention items,
remediation aging, and board packet status — the accountability the
examination expects of the board.

## Governance Evidence Ledger as proof / audit layer

The Governance Evidence Ledger owns the finding-to-control-to-evidence map,
evidence artifact indexing, audit trail/history, and the examiner evidence
packet model. It is the proof layer that indexes everything the other
workspaces produce.

## What is wired now vs not wired

**Wired now (Phase 140A):**
- The static operating model, workspace responsibility map, evidence catalog,
  pure architecture snapshot deriver, and roadmap.
- Tests pinning the model's integrity and the no-fake-compliance discipline.

**Not wired (deferred to 140B+):**
- Every evidence artifact (`not_wired`).
- Every control (`mapped_not_wired` or `evidence_gap`); **nothing** is
  `wired_with_evidence`.
- All visible UI (the read-only Control Tower is deferred to 140B).
- All persistence, queues, workflows, and packets.

## Future roadmap 140B–140K

| Id | Title | Primary workspace |
| --- | --- | --- |
| 140B | Portfolio FDIC Control Tower (visible UI) | portfolio_command_center |
| 140C | Credit Admin document / core-data exception queues | credit_administration_workspace |
| 140D | Independent Loan Review workspace | independent_loan_review_workspace |
| 140E | Problem Credit / Watchlist workflow | portfolio_command_center |
| 140F | ACL / CECL support workbench | acl_cecl_workbench |
| 140G | Appraisal / Evaluation review queue | appraisal_review_queue |
| 140H | Board remediation packet | executive_board_oversight |
| 140I | Governance evidence ledger | governance_evidence_ledger |
| 140J | Data-entry dual-control workflow | credit_administration_workspace |
| 140K | Examiner evidence packet export / readiness | governance_evidence_ledger |

The snapshot deriver recommends **140C (Credit Admin exception queues)** as
the first build lane after the 140B control tower, because document
completeness and core-data accuracy are the highest-frequency findings.

## Explicit non-goals

- **No Dataverse schema** changes or migration files.
- **No Dataverse writes** and no write affordances.
- **No regulatory completion claim** — the platform never states it is `compliant`, `remediated`, `FDIC approved`, or `examiner ready`.
- **No fake production evidence** — no sample/demo data presented as
  regulatory evidence.
- **No route / access / entitlement changes.**
- **No live Copilot changes** — Copilot remains `not_configured`.
- **No visible UI change** in 140A.
