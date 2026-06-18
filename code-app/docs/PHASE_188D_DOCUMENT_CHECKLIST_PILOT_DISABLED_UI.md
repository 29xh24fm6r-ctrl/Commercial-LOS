# Phase 188D — Document checklist pilot-disabled banker UI surface

- **Date:** 2026-06-17
- **Branch:** `phase188-document-checklist-pilot` (on top of 188C `1bf41b2`).
- **Builds on:** [188A audit](./PHASE_188A_DOCUMENT_CHECKLIST_WRITE_PATH_AUDIT.md),
  [188B inspector](./PHASE_188B_DOCUMENT_CHECKLIST_READINESS_INSPECTOR.md),
  [188C adapter](./PHASE_188C_DOCUMENT_CHECKLIST_GENERATOR_ADAPTER.md).

## Purpose

Add a banker-visible, **pilot-disabled** document checklist preview surface that
proves the UI path can present generation readiness and planned document names
**without** creating checklist rows, contacting borrowers, sending requests, or
enabling automation. This phase touches runtime UI but is **non-operative**: the
generate control is permanently disabled in 188D.

## Placement

- New component [DocumentChecklistPilotPanel.tsx](../src/deals/DocumentChecklistPilotPanel.tsx),
  mounted in [DealDocuments.tsx](../src/deals/DealDocuments.tsx) **only when**
  `!readOnly && banker` — i.e. an authorized banker editing their own deal's
  documents. A manager/portfolio/team/executive/admin read-only view has no
  `BankerContext` (so `useOptionalBanker()` is null) **and** renders `readOnly`,
  so the panel never appears there.
- No new route, no route-count change, no auto-run on New Deal create.

## Disabled UX behavior

- Title **"Document Checklist Pilot"**, status pill **"Pilot disabled"**.
- States the pilot is controlled and currently disabled; read-only preview.
- A read-only `<details>` expander shows approved checklist names, those
  **already present** on the deal, and those that **would create (preview only)**
  — derived by the pure
  [documentChecklistPilotViewModel](../src/deals/documentChecklistPilotViewModel.ts)
  using the same trim + case-insensitive normalization as 188B/188C
  (de-duped, blanks ignored).
- A **"Pilot requires operator certification"** note.
- One control: a **disabled** button "Generate checklist — disabled"
  (`disabled` + `aria-disabled`). No enabled button, no send/request/borrower/
  approve/commit/apply action, no link/mailto, no optimistic success state.

The view-model's `canGenerate` is **always `false`** in 188D — even if the pilot
flag (`DOCUMENT_CHECKLIST_PILOT_UI_ENABLED`, also `false`) were flipped, the UI
still cannot trigger generation. Flipping `canGenerate` is a future phase's
explicit decision.

## Safety boundary

### No borrower communication

The panel, view-model, and config import **no** `sendDocumentRequestEmail`,
`prepareDocumentRequestHandoff`, or any Outlook / email / SMS / handoff / mailto
module, and the panel contains no borrower-send language. (Static governance test
pins this.)

### No Dataverse write

The UI imports **no** generated Dataverse service and the generator adapter / its
live deps (`generateAuditedDocumentChecklist`,
`newDealChecklistGenerationLiveDeps`). It performs no create/update/delete and
emits no audit. All displayed data comes from already-authorized deal/document
props or static pilot config.

### Gate unchanged

`DOCUMENT_CHECKLIST_GENERATION_ENABLED` remains **`false`**;
`DOCUMENT_CHECKLIST_PILOT_UI_ENABLED` is a new **`false`** constant. Nothing
flips a gate to true. No deploy.

## What 188E is allowed to do next

After 188A–188D are reviewed and deployed (if runtime changed) and the identity
graph is `READY`: enable the pilot flag for exactly **one** controlled proof
against deal `1a10a165-756a-f111-ab0c-70a8a59be491` — checklist rows created (or
`ALREADY_GENERATED`), audit succeeds, **no** borrower message, **no** stage
movement, **no** CRM/portfolio side effect, **no** duplicate rows.

## What remains prohibited

No borrower messaging / email / SMS / Outlook / handoff. No enabled
generate/send/request action in 188D. No auto-run on New Deal create. No new New
Deal. No CRM / portfolio / stage automation. No document-upload path change.
