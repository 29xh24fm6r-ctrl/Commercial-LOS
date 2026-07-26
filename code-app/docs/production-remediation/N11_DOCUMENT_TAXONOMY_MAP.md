# N-11 — Document Taxonomy Map

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 3 (PR 134)
**Status:** Investigated and documented. Normalization-function duplication removed (safe, zero
behavior change). Full taxonomy unification is explicitly **not** attempted in this PR — see
"Why not unify now" below.

## The four independently-authored document-name vocabularies

There is no stable document-type key/enum anywhere in this codebase that all consumers share.
Every one of the following was authored independently, in different phases of this codebase's
history, and none was cross-checked against the others for vocabulary overlap.

### Taxonomy 1 — the rich derivation engine
`src/deals/documentRequirementDerivation.ts` (`RULES`, consumed via `deriveRequiredDocuments()`).
Feeds `documentRequirementReconciliation.ts` → `DocumentRequirementWorkspace.tsx` +
`documentRequirementBlockerMerge.ts`. Example `documentName` values: "Loan Application", "Signed
Term Sheet", "Business Financial Statements", "Business Tax Returns", "Personal Financial
Statement", "Personal Tax Returns", "Debt Schedule", "Borrowing Base Certificate", "Appraisal
Report", "Title Report", "Equipment List and Invoices", "Ownership Information".

Each rule also carries a separate stable `key` (e.g. `personal-financial-statement`) — unrelated to
the display string, and not shared with any other taxonomy.

### Taxonomy 2 — the static per-stage requirement registry (the legacy path)
`src/workflow/loanWorkflowStages.ts` (`LOAN_WORKFLOW_STAGES[i].requiredDocuments`), re-exposed via
`loanWorkflowRequirementRegistry.ts`. Evaluated by `loanWorkflowRequirementEngine.ts` /
`loanWorkflowRules.ts` against live documents by SUBSTRING match. Feeds `dealBlockerModel.ts` →
`DealDocuments.tsx`'s legacy `RequestDocumentModal`/`ReceiveDocumentModal`/`ReviewDocumentModal` /
`documentActions.ts` path. Example `label` values: "Loan application", "Business financial
statements", "Tax returns", "Ownership information", "Collateral support", "Approval evidence",
"Commitment letter", "Loan agreement", "Insurance evidence", "Booking package".

### Taxonomy 3 — the closing-document template registry
`src/closing/documents/closingDocumentTemplateRegistry.ts` (`CLOSING_DOCUMENT_TEMPLATES`). Powers
`DealClosingDocumentsPanel.tsx` via `closingDocumentGeneration.ts` / `closingDocumentStorage.ts`.
Example `title` values: "Closing Checklist", "Borrower Closing Instruction Letter", "Internal
Funding Checklist", "Conditions Precedent Certification", "Closing Package Cover Sheet".

This is a genuinely different document universe (internal/admin closing artifacts, not
borrower-supplied underwriting documents) and never reads/writes `cr664_documentchecklist` at all —
its persistence target (PR123's `cr664_closingdocumentmanifest`) is a schema proposal, not yet
applied live, so today this taxonomy's data is in-memory only and lost on reload.

### Taxonomy 0 — the retired pilot list (still present, not reconciled, not actively wired)
`src/deals/documentChecklistPilotConfig.ts` (`DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES`): `"2024
Business Tax Return"`, `"2025 Interim Financial Statements"`, `"Debt Schedule"`.
`documentRequirementDerivation.ts`'s own header says it replaces this list, but the constant is
still imported by `documentChecklistUiEnableReadiness.ts` (surfaced only in the disabled-preview
readiness copy — a string, not a live matching path). No live wired caller passes it into any
document-requirement action today.

## Concrete mismatches (evidence, not speculation)

| Taxonomy 1 | Taxonomy 2 | Reconciliation's exact-match | Workflow engine's substring-match |
|---|---|---|---|
| "Business Tax Returns" | "Tax returns" | Different documents (no match) | Same document (`"business tax returns".includes("tax returns")`) |
| "Business Financial Statements" | "Business financial statements" | Match (case-insensitive) | Match |
| "Ownership Information" | "Ownership information" | Match | Match |
| "Personal Financial Statement" / "Personal Tax Returns" | *(no equivalent)* | N/A | N/A |
| "Appraisal Report" / "Title Report" / "Equipment List and Invoices" | "Collateral support" (one generic bucket) | No overlap | No overlap |
| "Signed Term Sheet" | "Commitment letter" | No overlap | No overlap |
| *(no equivalent)* | "Approval evidence" / "Loan agreement" / "Insurance evidence" / "Booking package" | N/A | N/A |

The "Business Tax Returns" vs. "Tax returns" row is the important one: the **same two strings are
reconciled by one matching algorithm and NOT reconciled by the other**, for the exact same document.
That is not a hypothetical risk — it is live, current behavior on `master` today.

## What this PR fixes

The four independently copy-pasted, byte-identical `normalizeName`/`normalize` functions
(`documentRequirementReconciliation.ts`, `loanWorkflowRequirementEngine.ts`,
`documentRequirementBlockerMerge.ts`, `loanWorkflowRules.ts`) now import one shared
`normalizeDocumentName` from `src/shared/deals/documentNameNormalization.ts`. This is a **pure,
zero-behavior-change** deduplication — every call site keeps its own existing matching algorithm
(exact map key vs. substring `.includes()`) exactly as before. It removes the risk of the four
copies drifting apart from each other in the future; it does **not** unify Taxonomy 1 and Taxonomy
2's vocabularies, which remain genuinely different lists.

## Why not unify Taxonomy 1 and Taxonomy 2 now

A real unification would mean one of:

1. Introducing a stable document-type key/enum used by BOTH `documentRequirementDerivation.ts` and
   `loanWorkflowStages.ts`, replacing free-text name matching entirely. This is the durable fix, but
   it touches the stage-exit gate (`loanWorkflowRequirementEngine.ts`), the blocker model, the
   Document Requirement workspace, and every live `cr664_documentchecklist` row's identity — a
   schema-level and product-level decision (which of the two vocabularies is authoritative for each
   conceptual document?) that needs deliberate design, not a mechanical fix.
2. Switching one matching algorithm to match the other's outcome (e.g., making
   `loanWorkflowRequirementEngine.ts`'s substring match behave like reconciliation's exact match, or
   vice versa). Given substring matching is currently MORE lenient than exact matching for at least
   one real pair ("Business Tax Returns" / "Tax returns"), narrowing it to exact-match risks
   suddenly treating a previously-satisfied stage-exit requirement as unsatisfied in live deals —
   a real regression to production stage-gating that must not be made without validating against
   live data, which this session cannot do.

Both paths are legitimate future work, explicitly out of scope for this narrowly-scoped PR. This
document is the concrete map a future phase needs to execute either path deliberately, rather than
rediscovering the mismatches from scratch.
