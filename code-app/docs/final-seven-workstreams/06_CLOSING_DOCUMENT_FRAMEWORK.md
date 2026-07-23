# Workstream 6 — Closing-Document Generation Framework

**Status: COMPLETE — AWAITING DEPLOYMENT (schema + integration).**

## Confirmed genuinely missing

Before this pass, only readiness/gate tracking existed (`src/workflow/closingReadiness.ts`) — no
generator, no e-sign send, no document framework of any kind. This is a new build under
`src/closing/documents/`, not a rewiring of existing functionality.

## Scope boundary (deliberate)

A safe pilot set of 5 administrative/internal templates:

1. Closing Checklist
2. Borrower Closing Instruction Letter
3. Internal Funding Checklist
4. Conditions Precedent Certification
5. Closing Package Cover Sheet

**Never** a promissory note, mortgage, deed of trust, guaranty, security agreement, or any other
enforceable legal instrument — those require approved legal templates and counsel signoff this
framework cannot provide on its own. "Approved" in the template registry means "included in this
framework's reviewed pilot set," **not** "reviewed and signed off by legal counsel for this specific
organization" — an operator must still confirm real legal/compliance review before relying on
generated output in a live closing.

## Architecture

| Module | Responsibility |
|---|---|
| `closingDocumentTypes.ts` | Shared types (template, fact model, eligibility, manifest, outcome) |
| `closingDocumentTemplateRegistry.ts` | The 5-template pilot registry, versioned |
| `closingDocumentEligibility.ts` | Fact-completeness + product/jurisdiction applicability — never silently allows a template with missing facts |
| `closingDocumentContentRenderer.ts` | Pure, deterministic text rendering + content hashing (FNV-1a) |
| `closingDocumentGeneration.ts` | Preview (no auth/write) and final generation (authorized, re-validates eligibility itself, immutable manifest, supersession on regenerate) |
| `closingDocumentAudit.ts` | Governed audit recording, reusing this app's `cr664_user`-bind-only discipline |
| `closingDocumentPackage.ts` | Supersession-aware package-completeness summary |
| `ClosingDocumentsPanel.tsx` | Read-plus-governed-action UI |

Regeneration creates a **new** manifest with `supersedesManifestId` set — the prior manifest is
never mutated or deleted, preserving an honest, immutable history.

## Storage — the one deliberate gap

`closingDocumentStorage.ts` has **no live Dataverse factory**. No table for generated documents
exists in this environment's schema. Building a live factory against a table that doesn't exist
would be exactly the fabrication this initiative exists to prevent. Only
`createInMemoryClosingDocumentStore()` exists — real, tested, but explicitly NOT persistence (lost
on reload). A future phase that wants real persistence needs an operator-authorized additive schema
(a `cr664_closingdocument`-style table: manifest fields + a content/blob reference), following the
same authorization discipline as Workstream 5.

## Tests

49 tests across 7 files (`closingDocumentEligibility.test.ts` 13, `closingDocumentGeneration.test.ts`
8, `closingDocumentPackage.test.ts` 6, `closingDocumentAudit.test.ts` 5,
`closingDocumentContentRenderer.test.ts` 6, `closingDocumentStorage.test.ts` 3,
`ClosingDocumentsPanel.test.tsx` 8).

## Not mounted

Allow-listed in `src/navigation/intentionallyUnrouted.ts` (9 entries) pending the schema addition
above and a real integration point (which workspace/stage the panel should appear in — a product
decision, not made here).

## Classification

**COMPLETE — AWAITING DEPLOYMENT** (schema authorization + integration point decision + legal/
compliance review of the pilot templates for this organization specifically).
