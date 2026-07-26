# Two-User Approval/Funding Test Requirements

## Why this must be a live, two-user exercise

Three governed actions in this app enforce **segregation of duties** or **dual control** — rules
that depend on comparing two distinct actor identities. Every one of these rules is already coded
and unit-tested with *simulated* actors (mocked identities in a test harness). No code change can
prove more than that. What can only be proven live is that **two genuinely different Dataverse
users**, acting through the real app against the real environment, produce the behavior the code
claims:

1. **Document review segregation of duties** — the same banker who received a document must be
   blocked from also reviewing it.
2. **Credit approval segregation of duties** — the deal's assigned banker must be blocked from
   also being the credit-committee member who approves it out of CREDIT_APPROVAL.
3. **Funding dual control** — a request must be approved by someone other than the requester, and
   (above the $250k default threshold) require a *second*, distinct approver.

## Prerequisites

- Two genuinely distinct Dataverse user accounts, each with their own login (not the same account
  used twice, and not a shared service account).
- Persona A: a banker with a deal assigned to them, NOT a credit-committee member, NOT a funding
  approver.
- Persona B: a credit-committee member within approval limit for the test deal's amount, who is
  NOT persona A, and is a distinct funding approver.
- A test deal, clearly classified as a test/smoke record (`cr664_istestrecord = true` once
  Migration 3 is applied and an operator sets it — see `01_MIGRATION_RUNBOOK.md`), so it never
  contaminates production KPI counts.

## Test 1 — Document review segregation of duties

| Step | Actor | Action | Expected result |
|---|---|---|---|
| 1 | Persona A | Open the test deal's Document Requirements. Mark a required document as **Received**. | Succeeds; `cr664_receivedby` is set to Persona A. |
| 2 | Persona A | Attempt to mark the SAME document as **Reviewed**. | **Must be blocked** with a plain-English reason (segregation of duties) — not a raw error. |
| 3 | Persona B | Mark the same document as **Reviewed**. | Succeeds. |

**Known gap** (see `04_SECURITY_PRIVILEGE_REQUIREMENTS.md`): this check is client-side only. This
test only proves the client UI blocks it — it does NOT prove a direct Dataverse Web API call from
Persona A would also be blocked, because it wouldn't be. Record this explicitly in the evidence
template (`05_EVIDENCE_TEMPLATES.md`) — do not claim more than what was actually tested.

## Test 2 — Credit approval segregation of duties

| Step | Actor | Action | Expected result |
|---|---|---|---|
| 1 | Persona A | As the deal's assigned banker, bring the deal to CREDIT_APPROVAL stage with the exit gate satisfied. Attempt to advance it to COMMITMENT. | **Must be blocked** — Advance button disabled with a plain-English reason ("a different credit-authority holder must act"), both before the click (UI) and if attempted directly (write-seam guard). |
| 2 | Persona B | As a credit-committee member within approval limit, attempt to advance the SAME deal to COMMITMENT. | Succeeds. Deal timeline/audit records Persona B as the approving actor. |

## Test 3 — Funding dual control

| Step | Actor | Action | Expected result |
|---|---|---|---|
| 1 | Persona A | Request funding for the test deal at an amount above the $250k default dual-control threshold. | Succeeds; record status = PENDING. |
| 2 | Persona A | Attempt to approve the SAME funding request. | **Must be blocked** — self-approval denied. |
| 3 | Persona B | Approve the funding request (first approval). | Succeeds; record status reflects first approval recorded. |
| 4 | Persona B | Attempt a SECOND approval of the same request (simulating a second click, or if the UI allows re-invoking approve). | **Must be blocked** — same approver cannot also be the second approver. |
| 5 | A third, distinct persona (Persona C, or Persona A if policy allows a requester to serve as second approver — confirm against `fundingAuthorizationPolicy.ts`'s actual rule before assuming) | Provide the second, distinct approval. | Succeeds; record status = APPROVED, ready for disbursement confirmation. |

## What to record for each test

For every step above, capture (see `05_EVIDENCE_TEMPLATES.md` for the exact template):
- Timestamp (UTC) and actor email/user id.
- Screenshot or exported record state before and after the action.
- The exact plain-English message shown for any blocked action (to confirm N-21's business-safe
  error mapping is working, not just that the action was blocked).
- The Dataverse record's `cr664_correlationid` (or equivalent) for that specific action, so the
  audit trail can be independently cross-checked later.

## What this cannot prove

This is a controlled, single-pair-of-users, single-test-deal exercise. It does not prove:
- Behavior under concurrent/simultaneous writes from both personas at the exact same instant
  (a genuine race condition test is a separate, more elaborate exercise, out of scope here).
- Behavior across every possible role/limit combination (only the two personas' specific
  configuration is exercised).
- Server-side (Dataverse plugin) enforcement of the document-review segregation-of-duties rule,
  since no such enforcement exists yet (documented gap, not tested because there's nothing to test).
