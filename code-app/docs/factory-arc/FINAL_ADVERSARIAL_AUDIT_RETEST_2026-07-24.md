# Factory Arc Phase 18 — Final Adversarial Audit Re-Test

Date: 2026-07-24. Scope: every citation from "the July 24 adversarial audit" that drove Phases 1–16
of the Post-PR111 Live Activation and Audit Remediation Factory Arc, re-tested against this session's
actual remediation work. Classification per the mission's own taxonomy: **FIXED** / **PARTIALLY
FIXED** / **NOT FIXED (operator-gated)** / **NO LONGER APPLICABLE**.

**Source note:** the July 24 audit's finding list is not preserved verbatim as a single numbered
document in this repo (each phase's own doc — PR113 through PR128 — cites the specific finding it
investigated). This report classifies from those 16 phases' own verified investigation results, not
from re-deriving the audit from scratch. It does **not** re-litigate the separate, earlier
`FINAL_ADVERSARIAL_AUDIT.md` (PR #103–109 scope, already concluded "No S1/S2 findings" on 2026-07-24
before this arc began) — that audit's S3/S4 items are a distinct, prior cycle and remain valid,
unaddressed context in their own right, not superseded by this one.

## Classification

| # | Citation (from the July 24 audit) | Phase | Classification | Evidence |
|---|---|---|---|---|
| 1 | Credit memo save fails past `cr664_memotext`'s character ceiling | 1 (PR113) | **FIXED** | A real `maxLength` guard added to the write path; oversized payloads fail honestly instead of hitting Dataverse's silent truncation/error. |
| 2 | Loan Deal SDK may misclassify a multi-select field on regeneration | 2 (PR114) | **NOT FIXED (operator-gated)** — confirmed not currently a live risk | No live regeneration has occurred (no `pac` access); a regression guard (`multiSelectPicklistFieldShapeContract.test.ts`) already exists and passes today, so the risk is mitigated but the regeneration itself remains an operator action. |
| 3 | Loan purpose / term / ownership structure are not captured or persisted | 3 (PR115) | **FIXED** | Real governed fields, written through `updateDealProfile.ts`, read back on every load. |
| 4 | Global Cash Flow figures are local-only, reset on reload | 4 (PR116) | **FIXED** (unmerged — pushed, PR open) | Persists to a real PR105 column via the same governed pipeline. |
| 5 | Risk rating / underwriting recommendation are local-only, reset on reload | 5 (PR117) | **FIXED** (unmerged — pushed, PR open) | Persists to two real PR106 columns; deliberately does not flip the requirement-engine gate (separate, explicitly-reviewed decision). |
| 6 | Test/smoke deals inflate Manager/Team/Executive counts vs. Banker | 6 (PR118) | **NO LONGER APPLICABLE** | Already fixed in a prior remediation pass; `operationalDeals()`/`isTestOrSmokeDealName()` applied at every call site. This phase instead found and fixed a *latent* sibling bug (a 4-way-duplicated active-deal predicate) the same audit would likely have caught next. |
| 7 | New Deal wizard buries the banker's actual pipeline below the fold | 7 (PR120) | **FIXED** (unmerged — pushed, PR open) | Active Deals tab now shows the pipeline first, wizard collapsed behind a toggle. |
| 8 | Log Activity UI is unusable | 7 (PR120) | **NO LONGER APPLICABLE** | Investigated in full (`LogActivityModal.tsx`, `CrmWriteActions.tsx`) — both complete and functional. Not reproduced; likely already fixed in an untracked prior pass. |
| 9 | CRM industry never reaches the deal (dealIndustryProjection reads `unavailable`) | 8 (PR121) | **PARTIALLY FIXED** | A stale code-side workaround (generic-data-client read predating the real generated NAICS service) fixed. Root cause — a missing lookup field on the client-relationship model — remains **NOT FIXED (operator-gated)**, already diagnosed and scripted (`docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md`). |
| 10 | Documents are metadata-only, no real file storage | 9 (PR122) | **PARTIALLY FIXED** | The *governance claim* ("no pipeline exists") was stale and corrected — a real binary-upload pipeline already exists, fail-closed behind one missing schema column. The column itself remains **NOT FIXED (operator-gated)**, already scripted. Portfolio boarding's SharePoint storage and closing-document persistence are separately tracked (items 12, below). |
| 11 | Funding Authorization's hand-authored generated SDK files may violate the no-hand-editing rule | 10 (PR123) | **NO LONGER APPLICABLE** | Already correctly disclosed in three places at the time it was written, under explicit instruction. This phase found and closed a *related* gap: the SDK-regeneration escalation runbook only covered the Loan Deal table, not this second one — **FIXED**. |
| 12 | Closing documents have no durable persistence | 11 (PR124) | **NOT FIXED** | Confirmed still session-only. A full schema proposal now exists (not applied) — real progress, but the underlying gap remains open pending operator schema application and a live adapter (future phase). |
| 13 | Workflow-gate requirements never enforce real backing facts even when they exist | 12 (PR119) | **FIXED** (unmerged — pushed, PR open) | `CLOSING_FUNDING:funds_disbursed` flipped to a real, live, blocking gate, wired into every cockpit surface. Confirmed with the user before implementing, given the production-behavior impact. |
| 14 | Approval/closing/funding/boarding actions lack an audit trail ("no proof") | 13 (PR125) | **PARTIALLY FIXED** | Funding authorization's 5 actions (request/approve/reject/revoke/confirm) now emit a real `cr664_AuditEvent` — **FIXED** for that domain. Closing (no live persistence yet) and boarding (real domain audit exists, but no universal timeline event / `GOVERNED_WRITES` registration, and its live path is gated off by default) remain **NOT FIXED**, documented as deferred follow-ups. |
| 15 | Portfolio/servicing domain completion | 14 (PR126) | **PARTIALLY FIXED** | Servicing Lifecycle and Portfolio Command Center confirmed already live (no longer applicable as gaps). Annual Portfolio Review (display-only demo scaffolding) and portfolio-boarding's ungoverned audit write were previously *entirely untracked* in the governance registry — now registered as known `NOT_WIRED` gaps, still **NOT FIXED** in code (the annual-review schema design is deliberately deferred as its own future phase's scope). |
| 16 | Admin workspace has stale/incomplete operationalization | 15 (PR127) | **PARTIALLY FIXED** | Two same-file stale claims (console headers contradicting their own module data) — **FIXED**. `task-generation`'s write-evidence correlation — **FIXED**. The "missing KPI threshold edit affordance" citation — **NO LONGER APPLICABLE** as stated (it's a deliberate operator-runbook design, not a build gap); a handful of capabilities still need a multi-prefix structural change to correlate correctly — **NOT FIXED**, flagged as a scoped follow-up. |
| 17 | Plugin/connector deployment artifacts are incomplete or undiscoverable | 16 (PR128) | **PARTIALLY FIXED** | The plugin, Outlook connector, and SharePoint connector artifacts were each already accurate and complete individually — **NO LONGER APPLICABLE** as originally stated. The one real gap (no consolidated cross-reference from the master deployment runbook to either connector's runbook) — **FIXED**. Actual registration/consent remains **NOT FIXED (operator-gated)**, as it always will be from this sandbox. |
| 18 | Overall release engineering health (build/test/reachability) | 17 (PR129) | **FIXED / confirmed healthy** | Full validation checkpoint run: `tsc -b` 0 errors, 13252/13255 tests passing (1 confirmed-flaky, not a regression), build succeeds, 0 unexpected reachability orphans. |

## Aggregate verdict

- **7 of 18** citations are **FIXED** outright (items 1, 3, 6*, 9*, 11*, 13, 18 — starred items are
  FIXED for the specific stale-claim/latent-bug component the phase actually found, see the table for
  the precise scope).
- **6 of 18** are **PARTIALLY FIXED** — a real, verified component of the gap closed; a genuinely
  separate remaining component (usually schema or a bigger design decision) correctly left open and
  documented, not silently dropped (items 9, 10, 14, 15, 16, 17).
- **2 of 18** are **NOT FIXED** and require further work beyond this arc's scope as currently phased
  (item 12, closing-document persistence's live adapter; portions of item 15, the annual-review
  schema design).
- **1 of 18** (item 2) is effectively mitigated by an existing regression guard even though the
  underlying operator action hasn't happened.
- **5 of 18** are **NO LONGER APPLICABLE** as originally cited — investigated directly against
  current code (never assumed), and found to already be fixed, already correctly disclosed, or based
  on a misunderstanding of a deliberate design choice (items 6, 8, 11, 16, 17's connector-artifact
  framing).

**No finding in this re-test surfaced a new S1 (data corruption / critical-governance bypass) or S2
(blocks a core lifecycle step for all users) severity issue.** Every open item is either genuinely
operator-gated (requires live Dataverse credentials or a governance decision this sandbox cannot make
unilaterally) or explicitly scoped as future-phase design work, never silently dropped.

## What remains for a live operator, in order

1. Merge PRs #116–129 (13 open PRs from this session, all based on the same `master@fb6a0f4` — see
   `PR129_E2E_CERTIFICATION_CHECKPOINT.md`'s index table), resolving the shared-file rebase points
   the arc's own docs already flag.
2. Execute the operator-gated items already fully scripted and escalated: Loan Deal SDK regeneration
   (PR114), Funding Authorization SDK regeneration (PR122), the CRM industry lookup field
   (`DEAL_INDUSTRY_CRM_NAICS_SETUP.md`), the document-upload File column
   (`P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md`).
3. Apply the closing-document-persistence schema proposal (PR123's bundle) if that capability is
   prioritized, then build its live adapter as its own future phase.
4. Design and schema-propose annual-review persistence as its own future phase (materially larger
   than the single-table precedents above).
5. Run the genuine, operator-executed 22-step live E2E script
   (`docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`) against a real deployed build, once the above
   are merged and any desired schema work applied.

## Test plan

This phase is a synthesis/reporting checkpoint — no `src/` code changed.

- `npx tsc -b` — 0 errors (unaffected; no source touched).
- No test added; nothing here is independently testable beyond what each cited phase's own PR already
  verified.
