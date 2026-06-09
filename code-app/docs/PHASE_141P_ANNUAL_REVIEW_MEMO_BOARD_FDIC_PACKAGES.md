# Phase 141P — Annual Review Memo, Board Package, and FDIC Package Automation

> **What this is.** Governed, **evidence-backed, draft-only** institutional
> packages for annual reviews — a credit memo, a board package, and an
> FDIC/examiner package — built from the Phase 141O financial/covenant outputs.
> It approves no credit, waives no covenant, exports nothing, sends nothing, and
> writes nothing live.

## 1. Purpose

Annual reviews should produce review-ready institutional packages: an annual
review credit memo draft, a board package draft, an FDIC/examiner package draft,
an evidence index, a missing-data / exception register, and covenant/financial
sections. Every package is evidence-backed, caveated, and **draft-only**. Missing
data stays missing; packages may be memo-ready but not approval-ready unless all
readiness gates pass.

## 2. Prerequisites

- **141A** annual portfolio review collection command center.
- **141B-H** CRM Relationship Master.
- **141J-K** CRM schema (created + verified).
- **141L** CRM live persistence adapter (disabled by default).
- **141M** borrower request workflow (human-approval preview).
- **141N** delivery adapter seams (disabled, approval-gated).
- **141O** financial spreading + covenant testing integration.

## 3. What this phase adds

| File | Role |
|---|---|
| `deriveAnnualReviewPackageReadiness.ts` | Memo / board / FDIC readiness gates |
| `buildAnnualReviewEvidenceIndex.ts` | Traceable evidence index (missing stays missing) |
| `buildAnnualReviewMemoPackage.ts` | 10-section draft credit memo |
| `buildAnnualReviewBoardPackage.ts` | 6-section draft board package |
| `buildAnnualReviewFdicPackage.ts` | 9-section draft FDIC/examiner package |
| `AnnualReviewPackagePreviewPanel.tsx` | Read-only package preview panel |
| `annualReviewPackageExportAdapter.ts` | Export adapter seam (disabled by default) |
| `deriveAnnualReviewPackageWorkflow.ts` | Package workflow (preview actions only) |

## 4. Draft-only posture

There is no approved / submitted / filed / sent / exported_final status and no
final credit recommendation. The package workflow exposes **read-only preview
actions** only; approve / submit / file / export / send / waive are explicit
**blocked actions**. The export adapter's `exportPackage` is always blocked — no
PDF/docx is generated and no file is written.

## 5. Evidence-backed package model

Every memo / board / FDIC claim is traceable to the evidence index. Superseded /
system-invalidated / rejected facts are excluded; ambiguous-period facts are
marked review_required; missing required evidence is listed, never invented.
Unknown metrics are explicitly labeled unknown, and covenant failures are
findings requiring review — not approvals or declines.

## 6. What remains disabled

- **Final approval** — no credit approval / decline recommendation.
- **Covenant waiver** — never applied; "waive covenant" is a blocked action.
- **Final export** — `exportPackage` is blocked; nothing is filed or submitted.
- **PDF / docx generation** — none.
- **SharePoint / OneDrive / Graph** — no external call.
- **Borrower outreach / upload links / email / SMS** — none.
- **Live writes** — no CRM or Dataverse writes; no route registered for the panel.

## 7. Next recommended phase

**Phase 141Q — Annual review operator workflow, review queue, and controlled
package approval workflow.**
