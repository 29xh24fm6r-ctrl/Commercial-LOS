# OGB LOS — Full Commercial Loan Workflow Activation ARC

**Status:** Active. **PR 0 (this document + the truth matrix): documentation only — no runtime change.**
**Owner:** OGB LOS. **Companion:** [LOS_WORKFLOW_TRUTH_MATRIX.md](./LOS_WORKFLOW_TRUTH_MATRIX.md) (per-transition audited current state).

> This is the permanent source-of-truth record for the arc that brings the complete commercial
> loan workflow **alive** — governed, role-aware, evidence-backed, auditable, and intuitive.
> Every future PR in this arc is measured against the Definition of Done and the truth matrix here.

---

## 1. Mission

Build out the OGB LOS so the complete commercial loan workflow is **alive end-to-end** — not merely
displayed, mocked, inferred, previewed, or partially piloted.

The only acceptable end state:

> A banker, credit officer, closer, loan-operations user, and portfolio/servicing user can operate a
> real commercial loan through the complete lifecycle — **Intake → Underwriting → Credit Approval →
> Commitment → Documentation → Closing & Funding → Boarded / Servicing → Portfolio Monitoring** — with
> governed stage gates, accurate requirements, intuitive UI, real persistence, audit/timeline records,
> readback verification, and machine-proven smoke evidence.

This is **not** a claim of nCino equivalence. The goal is a commercial LOS workflow that resembles the
operating discipline of a mature nCino-style platform: governed, stage-based, role-aware,
evidence-backed, auditable, and intuitive.

This arc **must not weaken existing blockers.** It replaces shallow or orphaned logic with real tracked
facts, live write paths, and banker-visible resolution steps.

---

## 2. Canonical stage spine (preserved)

The canonical seven-stage lifecycle is directionally correct and remains the canonical vocabulary
(codes key `cr664_dealstagereferences.cr664_code`, see `src/workflow/stageOrderingContract.ts` and
`src/workflow/loanWorkflowStages.ts`):

1. **Intake** (`INTAKE`, seq 10)
2. **Underwriting** (`UNDERWRITING`, seq 20)
3. **Credit Approval** (`CREDIT_APPROVAL`, seq 30)
4. **Commitment** (`COMMITMENT`, seq 40)
5. **Documentation** (`DOCUMENTATION`, seq 50)
6. **Closing & Funding** (`CLOSING_FUNDING`, seq 60)
7. **Boarded / Servicing** (`BOARDED`, seq 70)

The stage model already defines entry criteria, exit criteria, required fields, documents, tasks,
allowed next stages, and blocker rules. **Preserve that architecture; deepen it** with a typed,
role-aware requirement registry backed by real records.

Non-forward lifecycle paths that must become real: **Return**, **Decline**, **Withdraw** (and, where
policy allows, **Reopen**).

---

## 3. Relationship to PR #68 (preserved, scoped — do not broaden)

PR #68 (merged, master `14d521f`) aligned the Stage Map advance control with the **real** transition
policy used by the write path. It is a **separate, four-file scoped fix** and establishes the product
principle this arc builds on:

- Stage advancement is a **governed banker action**.
- The UI must show the **exact governed exit criteria**.
- Blocking requirements must say **where they are resolved**.
- **Log Activity is not a substitute** for required documents, tasks, fields, credit artifacts,
  approval facts, or closing facts.

This arc **must not** mix into or re-open PR #68. It extends the same principle across the whole
lifecycle and all transition kinds.

---

## 4. Non-negotiable principles

1. **No fake readiness** — a stage is ready only when the actual governed gate is satisfied by real
   tracked facts.
2. **No shallow pass-throughs** — a requirement is not satisfied merely because a string contains a
   phrase (document-name substring, "memo exists", stage string contains "funded", an activity-log
   entry, an unreviewed upload, a draft memo, an approval note without authority validation).
3. **No evidence fabrication** — final-launch evidence is created only by a real operator smoke or a
   machine-proven test, and must include real affected record IDs where applicable.
4. **No silent bypasses** — if a fact is not tracked, the gate **fails closed** and states exactly what
   schema or workflow capability is missing.
5. **Same policy for UI and write path** — button state, tooltip, displayed blockers, and write-path
   policy all use one source of truth.
6. **Every blocker is actionable** — it names what is missing, why it blocks, where to resolve it,
   which role resolves it, whether it is required or recommended, and its backing type.
7. **Every stage movement is auditable** — a successful move writes stage update, stage entry date,
   audit event, timeline event, actor, correlation ID, prior stage, new stage, and readback
   verification; partial success is explicit.
8. **Every non-forward path is real** — Return, Decline, and Withdraw are operational, not
   preview-only.

---

## 5. External workflow benchmark

The system is not complete until this lifecycle is real, role-aware, and operationally usable:

1. Prospect / borrower intake · 2. Loan request & application package · 3. Document checklist &
collection · 4. Borrower / guarantor / ownership verification · 5. Financial spreading & repayment
analysis · 6. Collateral analysis · 7. Underwriting review & recommendation · 8. Risk-rating
assignment · 9. Credit memo generation/completion/review · 10. Approval routing & authority check ·
11. Approval decision & conditions · 12. Commitment / term-sheet issuance · 13. Borrower acceptance ·
14. Documentation preparation · 15. Conditions-precedent clearing · 16. Insurance / collateral / lien /
title verification · 17. Executed loan documents · 18. Funding authorization & disbursement · 19.
Booking quality control · 20. Boarding / servicing handoff · 21. Covenant setup · 22. Ticklers &
monitoring cadence · 23. Exceptions & post-close exceptions · 24. Annual review / loan review · 25.
Watchlist / criticized / classified monitoring · 26. Early-warning signals · 27. Return / rework · 28.
Decline / adverse action · 29. Withdraw / borrower-abandoned.

---

## 6. PR sequence

The arc is a sequence of **small, reviewable PRs** — each with tests, an AAR, and explicit safety
confirmations. **No single giant PR. No production gate flip until the underlying work is implemented,
tested, and smoke-proven.**

| PR | Title | Objective (condensed) |
|----|-------|------------------------|
| **0** | Baseline truth audit & workflow matrix | This document + `LOS_WORKFLOW_TRUTH_MATRIX.md` (+ optional `src/workflow/losWorkflowTruthMatrix.ts`). No runtime change. |
| **1** | Preserve & merge Stage Map clarity | Preserve PR #68 as the four-file Stage Map clarity fix. |
| **2** | Canonical requirement registry | Typed, role-aware, resolver-aware requirement registry as first-class workflow objects. |
| **3** | Requirement evaluation engine | Replace shallow readiness with `evaluateLoanWorkflowRequirements` / `deriveStageExitReadiness` / `deriveTransitionReadiness`. |
| **4** | Typed document requirement status | Typed document states (requested…accepted/rejected/waived); stop name-substring gating. |
| **5** | Task blocking policy | Stage-configurable blocking vs recommended tasks; UI + write path share severity. |
| **6** | Risk rating system | Real tracked risk-rating fact + panel; gate Underwriting→Credit Approval on it. |
| **7** | Underwriting recommendation & analysis completion | Fact-backed underwriting completion (spreading, repayment, collateral, recommendation). |
| **8** | Credit memo status model | Real memo lifecycle + section states; presence no longer satisfies approval readiness. |
| **9** | Approval routing, authority, decision, conditions | Schema-backed approval records + authority computation; route decline/return correctly. |
| **10** | Governed Return path | Live, audited, persisted, readback-verified Return with reasons + remediation. |
| **11** | Governed Decline path & adverse action | Live, governed Decline with reason codes + adverse-action tracking. |
| **12** | Governed Withdraw path | Live, governed Withdraw with reasons; reopen if authorized. |
| **13** | Commitment / term-sheet workflow | Issuance + borrower-acceptance facts; expiry/supersede handling. |
| **14** | Documentation & conditions precedent | Condition records (open/satisfied/waived/expired/deferred) + documentation prep facts. |
| **15** | Closing, executed docs, funding, booking QC | Real closing/funding/booking-QC facts; stage string cannot mark ready. |
| **16** | Real boarded-loan / servicing handoff | Replace stage-string boarding with a real boarded-loan record + servicing owner. |
| **17** | Covenant, tickler, monitoring setup | Connect portfolio monitoring to the boarded-loan lifecycle. |
| **18** | Exceptions & post-close exceptions | Exceptions as real workflow objects affecting gates by category/severity. |
| **19** | Annual review, loan review, watchlist, early warning | Complete the portfolio monitoring loop from real facts. |
| **20** | Role-aware work queues & banker UX | Queues per role; every workspace answers "where/what/why/who/where-to-fix". |
| **21** | Unified live transition engine | One engine for advance/return/decline/withdraw/reopen with consistent outcomes. |
| **22** | Activation gates & certification model update | Certification passes only when every domain is fact-backed, live, audited, smoke-proven. |
| **23** | Full operator smoke scripts | Repeatable operator smokes for every transition + monitoring paths. |
| **24** | End-to-end commercial loan workflow smoke | One complete real end-to-end smoke deal with machine-proven evidence. |

Detailed per-PR objectives and acceptance criteria are carried in the arc brief; each PR restates them
in its own description and AAR.

---

## 7. Definition of Done (entire arc)

**Workflow:** Intake, Underwriting, Credit Approval, Commitment, Documentation, Closing & Funding,
Boarded/Servicing, Portfolio monitoring, Return, Decline, Withdraw — **all live.**

**Governance:** every stage gate explicit and backed by real tracked facts or fails closed; UI and
write path share one policy; required vs recommended explicit; role ownership explicit; no hidden or
phantom gates; no Log Activity bypass.

**Data:** required documents/tasks typed & status-backed; risk rating, underwriting recommendation,
credit memo status, approval decision, approval authority, conditions, closing/funding facts, boarded
loan handoff, covenants/ticklers/monitoring obligations, and exceptions are all **real**.

**Persistence:** every live action writes the proper records and performs readback.

**Audit:** every material action writes audit event + timeline event + actor + timestamp + correlation
ID.

**UX:** every user can answer — Where is this deal? What blocks it? Why? Who owns the next action?
Where do I fix it? What happens if I click this? What evidence was written?

**Evidence:** full end-to-end smoke evidence exists, machine-proven, with affected record IDs;
certification rejects missing or weak evidence; no fabricated evidence exists.

**Safety:** no activation gate flipped before its domain is implemented and smoke-proven; no blocker
weakened to create a pass; no fake data; no final-launch evidence without real smoke; no broad PR hides
risky changes.

---

## 8. Required AAR format for every PR in this arc

Every PR ends with an AAR containing:

- **Summary** — PR number, branch, commit hash, files changed, scope.
- **What changed** — concise implementation summary.
- **Workflow impact** — which stage/transition improved; what is now live / read-only / preview-only /
  still blocked.
- **Tests** — exact commands and results.
- **Safety confirmations** — explicitly answer: activation gates flipped? evidence files created?
  Dataverse writes performed? write path changed? audit/timeline affected? readback added/changed?
  blockers weakened? fake data introduced?
- **Remaining gaps** — what is still not complete.
- **Next recommended PR** — the next PR in the arc.

---

## 9. Current honest status (as of PR 0)

**The system is not yet a complete, team-operable commercial loan workflow.** Only forward Advance has
a live write path; Return/Decline/Withdraw are not live; the live transition policy is shallow relative
to the rigorous gate concept; several commercial-lending facts (risk rating, approval decision/authority,
credit memo lifecycle, closing/funding, boarded-loan handoff, covenants/monitoring, exceptions) are
untracked, presence-based, or projected from stage strings; required tasks are soft; document matching
is name-based; and machine-proven smoke evidence is incomplete. The precise, file-grounded per-transition
state — and the recommended PR to fix each gap — is in
[LOS_WORKFLOW_TRUTH_MATRIX.md](./LOS_WORKFLOW_TRUTH_MATRIX.md).
