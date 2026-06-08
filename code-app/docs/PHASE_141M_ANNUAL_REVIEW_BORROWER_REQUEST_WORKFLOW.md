# Phase 141M — Annual Review Borrower Request Workflow (Human-Approved, Non-Sending)

> **What this is.** The annual-review borrower document request workflow built on
> CRM Relationship Master recipients. It identifies the authorized borrower-side
> recipient, enforces authorization / do-not-contact / restricted-use, prepares a
> request package and a human-reviewable draft preview — and **sends nothing**.
> Every outbound action is human-approved and non-sending by default.

## 1. Purpose

Annual reviews require borrower-provided materials (financial statements, tax
returns, insurance evidence, covenant documents, rent rolls, AR/AP aging,
ownership updates, …). Buddy can now decide who the correct borrower-side request
recipient is, whether they are authorized for financial requests, whether
upload-link contact is authorized, whether contact is prohibited, whether a
request is blocked and needs banker/ops correction, what documents should be
requested, and what human-approved draft to show — **all preparation only.**

## 2. Prerequisites

- **Phase 141A** — annual portfolio review collection command center.
- **Phase 141B-H** — CRM Relationship Master.
- **Phase 141J-K** — CRM Dataverse schema created and verified.
- **Phase 141L** — CRM live persistence adapter (disabled by default).

## 3. What this phase adds

| File | Role |
|---|---|
| `resolveAnnualReviewBorrowerRequestRecipients.ts` | CRM recipient resolver (authorization + do-not-contact + restricted-use) |
| `buildAnnualReviewBorrowerRequestPackage.ts` | Request package from existing annual-review requirements |
| `buildAnnualReviewBorrowerRequestDraft.ts` | Human-reviewable draft **preview** builder |
| `deriveAnnualReviewBorrowerRequestWorkflow.ts` | Workflow state deriver + honest next best action |
| `AnnualReviewBorrowerRequestPanel.tsx` | Read-only / human-approval preview panel |
| `annualReviewRequestFeatureFlags.ts` | Flags (send + upload-link generation pinned off) |
| `annualReviewBorrowerRequestTypes.ts` | Workflow types (no `sent` state) |

## 4. What remains disabled

- **Sending** — there is no send path and no `sent` state. `safeForSend` is
  structurally always false.
- **SMS / Twilio / email** — no outreach primitives exist.
- **Upload-link generation** — pinned off; the flag cannot enable it in this phase.
- **Live CRM writes** — the workflow is pure derivation over provided CRM records;
  it never writes to CRM (Phase 141L stays disabled).
- **Live request creation** — the package and draft are previews; no live request
  is created and no document or task is mutated.
- **No route** is registered for the panel; no permission widening.

## 5. Authorization rules

- **Financial request authorization required** — financial statements / tax
  returns require `financial_disclosure` authorization (active, not expired).
- **Upload-link authorization required** — any future upload-link workflow
  requires `document_upload` authorization.
- **Do-not-contact blocks** — a do-not-contact recipient blocks draft readiness.
- **Restricted-use blocks** — a contact restricted for a different purpose blocks
  the request.
- **Missing / expired authorization blocks** — and surfaces a banker/ops blocker.
- Contact values are never invented and are only ever shown **masked**.

## 6. Human approval model

The workflow resolves a recipient decision (`ready_for_human_approval`,
`needs_human_selection`, or a `blocked_*` reason), builds the request package, and
— when draft preview is enabled — a draft whose body is preview text carrying an
explicit "human approval required" notice and a populated `sendDisabledReason`.
The panel shows the status, masked recipient, authorization state, requested
documents, the draft preview, and the next best action. There is **no Send,
Email, Text, Generate upload link, Create live request, or Approve-and-send**
affordance. Actual approval-and-send arrives only in a later, separately-gated
phase.

## 7. Next recommended phase

**Phase 141N — Borrower upload-link / email / SMS adapter seams**, still disabled
by default and approval-gated, with no auto-send.
