# LOAN WORKFLOW — FULL TEAM READINESS AUDIT

**Date:** 2026-07-07
**Branch / baseline:** `master` (post WF-1A: `AUTO_STAGE_ADVANCE_ENABLED` armed at `f3bf6e9`, SDK `cr664_sequence` refresh at `2fd4101`, timeline actor-binding sweep at `0e00d2d`, flag-aware cert tests at `cedd51c`)
**Mode:** READ-ONLY audit. No runtime code modified.
**Method:** Four parallel read-only sub-audits (stage model / transition engine / readiness gates / flags-cert-evidence-tests), cross-validated, with the verdict-critical claims re-verified directly against source.

---

## Executive summary

The loan workflow is **architecturally strong and honestly gated, but only ONE of four transition kinds is live-wired, and even that one is not team-ready** — it is a WF-1A "walk one deal" pilot that is (a) blocked at runtime on a maker data-seed, (b) certified `not enabled` because its launch-smoke evidence is attributable-but-not-machine-proven, and (c) has no in-code persistence readback. The rigorous exit-gate model that would make advancement trustworthy for real loans (risk rating, approval authority, funds disbursed, boarding handoff) exists but is an **orphaned placeholder** — not wired to any live UI or write path, and its underwriting/approval/closing/funding/boarding facts have **no backing schema**.

The system does not fabricate data anywhere: every gap is failed-closed, honestly labelled (`WIRED_DISABLED`, `pending-maker-seed`, `evidence insufficient`), and pinned by tests. The distance to team-ready is **maker data + authentic machine-proven smokes + wiring the three missing transition kinds + a readback + connecting the rigorous gate facts** — not a rewrite.

---

## Current workflow readiness verdict

**NOT team-ready.** Do not represent the loan workflow as team-operable for real loans. Justification (each is a hard requirement from the mission that is currently unmet):

| Team-ready requirement | Status |
|---|---|
| All required transitions live-wired | ❌ Only **ADVANCE**. Return / Decline / Withdraw are preview + pure-policy; **no live write path exists** for them. |
| Persisted | ⚠️ ADVANCE persists (`cr664_StageReference` + `cr664_stageentrydate`); the other three persist nothing. |
| Audited + timeline-recorded | ⚠️ ADVANCE attempts both (honest partial-success); the other three emit neither. |
| Read back after refresh | ❌ **No in-code readback** after the stage update; the transport trusts `res.success`. |
| Attributable machine-proven smoke evidence | ❌ `stageAdvancement` smoke is attributable (`mpaller@oldglorybank.com`) but **carries no `affectedRecordIds`** → integrity-insufficient → certification `enabled = false` (`enabledCount 1/6`). |
| Reachable + operable for the team | ⚠️ Reachable to *view* (Stage Map mounts in the banker deal cockpit); the **Advance control stays hidden** until the maker seeds `cr664_dealstagereferences.cr664_sequence` (fail-closed availability). |

**ADVANCE-for-one-deal (WF-1A) is nearly operable** given the maker seed + a resolvable actor; **team-ready for real loans across all transitions is not.**

---

## Built assets (what genuinely exists and works)

- **Canonical stage vocabulary** — one authoritative set of seven (`stageOrderingContract.ts`): `INTAKE(10) · UNDERWRITING(20) · CREDIT_APPROVAL(30) · COMMITMENT(40) · DOCUMENTATION(50) · CLOSING_FUNDING(60) · BOARDED(70)`. Legacy 9/11-stage vocab retired. `recognizeCanonicalStage` is exact-match, never fabricates.
- **Data-driven ordering** — `resolveStageOrdering(rows)` sorts strictly by live `cr664_sequence`; fails closed on missing/duplicate/absent/non-numeric sequence or non-canonical code. Structural `StageReferenceRow` compiles pre- and post-SDK-regen.
- **Two transition engines** — `executeCanonicalStageTransition` (4-kind, pure/governed) and `advanceWorkflowStage` (ADVANCE-only, live-wired). Both fail-closed, gate on `AUTO_STAGE_ADVANCE_ENABLED`, order transport→audit→timeline, no auto-advance.
- **Live ADVANCE seam** — `buildLiveStageAdvanceDeps.ts`: transport (`cr664_StageReference@odata.bind` + `cr664_stageentrydate` on `cr664_loandeals`), audit (`cr664_AuditEvent`, `cr664_ChangedBy → cr664_user`), timeline (`cr664_dealtimelineevent`, `cr664_EventBy → cr664_user`, omit-on-unresolved).
- **Deal-workspace Stage Map** — `DealStageProgressionCard` (read-only eligibility + armed Advance control) mounted in `BankerDealWorkspace`.
- **Governed task + document writes** (shipped, audit+timeline): task complete, task create (WF-1A), document request/receive/review.
- **Seed tooling + docs** — `scripts/seed-stage-references.mjs` (dry-run/commit/verify, idempotent, TEST-safe), `docs/STAGE_SCHEMA_SETUP.md`.
- **Honest certification/inventory layer** — `productionEnvironmentVerification`, `fullActivationLaunchCertificationModel`, `v1GoLiveReleaseCertificationModel`, `controlledLiveCutoverReadiness`, `platformInventory` (`stage-progression-advance` = `DELIBERATELY_BLOCKED / WIRED_DISABLED`), `finalLaunchSmokeEvidence` integrity authority.
- **Green test suite** — full `vitest` passes with the flag armed; 0 skipped workflow/governance tests; no-fake-data guards present.

---

## Hard blockers (must clear before team-ready)

1. **Live stage-reference seed is unproven / likely incomplete.** The seven `cr664_dealstagereferences` rows must carry a unique `cr664_sequence` (10–70) in the live org, and the SDK regenerated to expose it. Source cannot prove this; the last recorded live inspection (`PHASE_225_…`) and the master runbook (AE-4) mark it a **pending maker action** — only `INTAKE` (+ a Phase-121 TEST row) with no `cr664_sequence` column was observed. Until seeded, `loadStageProgressionAvailability` fails closed → **the Advance control never renders**.
2. **Return / Decline / Withdraw have no live write path.** Only the pure `executeCanonicalStageTransition` engine + the unrouted `StageWorkflowControl` preview handle them. There is **no live `CanonicalStageTransport` / audit / timeline sink** anywhere → they persist nothing, audit nothing, record no timeline.
3. **No in-code readback after the stage write.** `buildLiveStageAdvanceDeps` trusts `res.success`; it does not re-read the deal to confirm `cr664_StageReference` persisted. (The evidence note *claims* readback, but the code doesn't do it — see Drift.)
4. **Stage-advance smoke evidence is not machine-proven.** `stageAdvancement.json` has **empty `affectedRecordIds`** → `finalLaunchSmokeEvidence` verdict `accepted=false, confidence=NONE` → certification `stageAdvancement.enabled=false`, `enabledCount 1/6`. Team-ready requires an attributable **and** machine-proven (create/readback/update/cleanup record ids) smoke.
5. **The rigorous exit gate is not on the live path.** The write-time gate (`stageTransitionPolicy`) only checks "requested is an approved next stage" + "readiness ≠ blocked". The detailed `stageGateContract` (`evaluateExitGate`) — risk rating, approval authority, funds disbursed, boarding — is **wired to nothing live** and its facts are unpopulated placeholders (`riskRatingAssigned: () => false`).
6. **Underwriting / approval / closing / funding / boarding facts have no schema.** No `cr664_riskrating`, approval-decision, funds-disbursed, or boarded-loan-handoff columns/records back these gates. Advancement past Underwriting is governed only by fuzzy document/task/memo-presence proxies.

---

## Soft blockers (team-ready-adjacent, not launch-blocking for a pilot)

- **Task-completeness is a soft gate.** Incomplete required tasks emit `at-risk`, and `stageTransitionPolicy` blocks only on `blocked` → a deal can advance with open required tasks. Intentional for the WF-1A walk; **must become blocking for real loans.**
- **Shallow fact matching.** Documents/tasks/credit-memo checks are substring/presence matches (`hasReviewedOrReceivedDocument`, `hasCompletedTask`, memo `.length`), not typed/approved-status checks. Credit-memo readiness never checks a "finalized/approved" status.
- **Boarding is stage-string-derived.** `portfolioBoardingStatus.ts` infers boarding eligibility from `deal.stage` alone with no boarded-loan link.
- **Two competing readiness models** create drift risk (see Drift findings): the honest rigorous one is orphaned; the shallow one is live.
- **Manager/Team deal workspaces** mount the card without an actor → read-only (correct, but means advancement is banker-only by construction).

---

## Flags / gates table

| Flag | Value | Gates | Classification |
|---|---|---|---|
| `AUTO_STAGE_ADVANCE_ENABLED` | **true** | Governed **explicit** ADVANCE seam (`advanceWorkflowStage`) + arms the Stage Map advance control. Not auto-advance (banker supplies next stage). | **WF-1A armed** (domain still `not enabled` — evidence insufficient) |
| `TASK_GENERATION_ENABLED` | **true** | WF-1A "Add Task" create path. | **WF-1A armed** |
| `ADVANCE_STAGE_WRITE_ENABLED` | false | Legacy Phase-216 optimistic-concurrency `advanceStage` adapter (separate path). | safe-off (legacy) |
| `DOCUMENT_CHECKLIST_GENERATION_ENABLED` | false | Live document-checklist write transport. | safe-off |
| `BORROWER_MESSAGING_ENABLED` | false | Borrower live email/SMS send. | safe-off |
| `BORROWER_EMAIL_TRANSPORT_ENABLED` / `_SMS_` / `_TWILIO_` | false | External send transports. | safe-off |
| `PORTFOLIO_SIDE_EFFECTS_ENABLED` | false | Origination portfolio side effects. | safe-off |
| `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` | false | Live boarding persistence. | safe-off |
| `PORTFOLIO_BOARDING_ROUTE_ENABLED` | false | Operator boarding route. | safe-off |
| `PORTFOLIO_BOOK_DATA_ENABLED` | true | Portfolio Command Center → boarded-book feed (**read-only**). | team-ready (read-only route) |
| `CRM_LIVE_PERSISTENCE_ENABLED` | false | Live CRM writeback (evidence is HIGH but flag off → not enabled). | safe-off |
| `CRM_COMMAND_CENTER_ROUTE_ENABLED` | true | Standalone CRM read surface (**read-only**). | team-ready (read-only route) |
| `DUPLICATE_DETECTION_ENABLED` | true | Warn-only duplicate detection. | on (read/warn) |
| `DUPLICATE_MERGE_APPLY_ENABLED` | false | Auto-merge apply. | safe-off |
| `BANKER_NEW_DEAL_CREATE_ENABLED` | false | Global banker-create constant (kept off by design). | safe-off |
| `NEW_DEAL_CREATE_ADAPTER_ENABLED` | false | Global create-adapter constant (kept off by design). | safe-off |
| `BANKER_CREATE_PILOT_ENABLED` | **true** | THE live banker New-Deal-create switch (supplies `{banker,adapter,intake:true}` to the rollout; one-line rollback). | **team-ready (live-controlled pilot)** |

---

## Routes / mounts table

| Surface | Mounted at | Reachable by team | Live-write? |
|---|---|---|---|
| `DealStageProgressionCard` (Stage Map + Advance control) | `BankerDealWorkspace.tsx` (anchor `#stage-map`), with `stageAdvanceActor={{systemUserId,email}}` | Yes — open any active deal as banker | ADVANCE only, gated on `AUTO_STAGE_ADVANCE_ENABLED` + availability |
| `DealStageProgressionCard` (read-only) | `ManagerDealWorkspace.tsx`, `TeamDealWorkspace.tsx` — **no actor** | Yes | No (no advance control) |
| "Loan Workflow" tab | `BankerShell.tsx` (`loan-workflow` nav) | Yes | Workbench/existing-loans view (not the stage card) |
| `StageWorkflowControl` (4-kind preview) | **Unrouted** — `intentionallyUnrouted.ts` (`WIRED_DISABLED`); only in its own test | No | No (preview message; no `onTransition` mount) |
| `AdvanceWorkflowStageButton`, `LoanWorkflowCommandCenter` | **Retired/unrouted** (`intentionallyUnrouted.ts`) | No | No |

---

## Stage / reference-data table

| Item | Finding |
|---|---|
| Canonical stages | 7, single vocabulary, sequences 10–70 (`stageOrderingContract.ts`) |
| Ordering source | Live `cr664_sequence` only; fail-closed on ambiguity; nominal sequences used for display/recognition only |
| `cr664_sequence` on generated **stage** model | **Present** (`Cr664_dealstagereferencesModel.ts:24`, commit `2fd4101`) |
| `cr664_sequence` on generated **status** model | Absent (by design — statuses unordered) |
| `new_productionapproved` on generated **status** model | **Absent** — but the reader `$select`s it (latent mismatch; see Drift) |
| Data sources registered (`power.config.json`) | `cr664_dealstagereferences`, `cr664_dealstatusreferences` both registered |
| Production stage/status selection | `INTAKE`/`Intake`, `OPEN`/`Open` (`newDealReferenceTargets.ts`) |
| Production-safe gate | active + unique + clean-label (`isProductionUnsafeReferenceLabel`: test/demo/sample/fake/temp/…/`phase\d+`/`PHASE*`). `new_productionapproved` required by the **activation readiness** contract, not the reference resolver. |
| Live seeding of 7 sequenced rows | **Unproven from source; evidence says pending.** Phase-225 inspection saw only `INTAKE` (+ TEST), no `cr664_sequence` column. |

---

## Transition-kind table (Advance / Return / Decline / Withdraw)

| Kind | Rendered | Governed | Live-wired | Audited | Timeline | Persisted | Tested | Smoke-proven |
|---|---|---|---|---|---|---|---|---|
| **Advance** | ✅ banker card (also preview) | ✅ | ✅ `advanceWorkflowStage` | ✅ `cr664_AuditEvent` | ✅ `StageChanged` | ✅ `cr664_StageReference` + `cr664_stageentrydate` | ✅ engine + live-deps + policy tests | ⚠️ artifact exists but **rejected** (no machine proof) |
| **Return** | ⚠️ preview-only (unrouted) | ✅ (pure policy) | ❌ | ❌ | ❌ | ❌ | ⚠️ engine-only | ❌ |
| **Decline** | ⚠️ preview-only (unrouted) | ✅ (sets DECLINED + adverseActionPending) | ❌ | ❌ | ❌ | ❌ | ⚠️ engine-only | ❌ |
| **Withdraw** | ⚠️ preview-only (unrouted) | ✅ (sets WITHDRAWN) | ❌ | ❌ | ❌ | ❌ | ⚠️ engine-only | ❌ |

**No live `CanonicalStageTransport`/audit/timeline sink exists for the 4-kind engine.** Only ADVANCE has a production write path.

---

## Readiness / exit-gate fact table

| Fact | Live model (`loanWorkflowRules` → `stageTransitionPolicy`) | Rigorous model (`stageGateContract`, orphaned) | Real data? |
|---|---|---|---|
| Deal identity fields | required-field check via `hasDealValue` | — | ✅ real `DealDetail` |
| Task completion | `hasCompletedTask` (substring) → **at-risk** (soft) | `intakeChecklistGenerated` etc. undefined | ✅ real `cr664_dealtask1` |
| Document received/reviewed | `hasReviewedOrReceivedDocument` (substring) → blocked | facts undefined | ✅ real `cr664_documentchecklist` |
| Credit-memo readiness | memo/section **presence** (`deriveCreditBlockers`) | `creditMemoFinalized` undefined | ⚠️ real `cr664_creditmemo1` but presence-only (no finalized/approved status) |
| Risk rating / underwriting | none (fuzzy doc/task/memo proxies) | `riskRatingAssigned: () => false` ("not yet implemented"); `underwritingReviewCompleted` undefined | ❌ **no schema** |
| Approval (decision/authority/conditions) | fuzzy "Approval evidence" doc + tasks | `approvalDecisionRecorded/AuthoritySufficient/ConditionsDocumented` undefined | ❌ **no schema** |
| Commitment | fields/tasks | `commitmentIssued`, `borrowerAcceptance` undefined | ❌ **no schema** |
| Closing / funding | `deriveClosingBlockers` (derivative of other blockers) | `loanDocumentsExecuted`, `fundsDisbursed` undefined | ❌ **no schema** |
| Boarding | not in live rules | `boardingCompleted` undefined; `portfolioBoardingStatus` derives from `deal.stage` string | ❌ **no handoff record** |

---

## Persistence / writeback table

| Write | Path | Entity / bind | Live? |
|---|---|---|---|
| Stage advance | `advanceWorkflowStage` transport | `cr664_loandeals` update: `cr664_StageReference@odata.bind = /cr664_dealstagereferences(<id>)`, `cr664_stageentrydate` | ✅ (flag on; needs seed) |
| Readback after advance | — | none | ❌ **no readback** |
| New Deal create references | `newDealCreateAdapter` (via pilot) | `cr664_StageReference` + `cr664_StatusReference` binds + `cr664_stageentrydate` | ✅ via `BANKER_CREATE_PILOT_ENABLED` |
| Return/Decline/Withdraw | — | none | ❌ |
| Task create / complete | `createDealTask` / `completeTask` | `cr664_dealtask1` (`cr664_AssignedTo`, `cr664_completed`) | ✅ (armed) |
| Document request/receive/review | `documentActions` | `cr664_documentchecklist` | ✅ shipped |
| Document checklist generation | gated | `cr664_documentchecklist` | ❌ `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` |
| Boarding handoff | — | none (stage-string derived) | ❌ |

---

## Audit / timeline table

| Transition/action | Audit (`cr664_AuditEvent`, `cr664_ChangedBy → cr664_user`) | Timeline (`cr664_dealtimelineevent`, `cr664_EventBy → cr664_user`) | Fail-closed / honest-partial |
|---|---|---|---|
| Advance | ✅ (`buildNewDealAuditPayload`) | ✅ (`StageChanged`; `EventBy` omitted if actor unresolved) | ✅ `audit_failed_partial_success` / `timeline_failed_partial_success` surfaced honestly |
| Return/Decline/Withdraw | ❌ none | ❌ none | n/a |
| Task create/complete | ✅ | ✅ (`EventBy → cr664_user`, post-sweep) | ✅ governance-partial |
| Document request/receive/review | ✅ | ✅ (`EventBy → cr664_user`, post-sweep) | ✅ |

`cr664_EventBy`/`cr664_ChangedBy` bind to the resolved **`cr664_user`** (never `/systemusers`) across every deal timeline/audit write (post `0e00d2d` sweep). No systemuser id is ever bound into a `cr664_user` lookup.

---

## UI surface readiness table

| Surface | State |
|---|---|
| Stage Map (read-only eligibility) | ✅ live, real deal/task/doc/memo data |
| Advance control | ⚠️ armed but hidden until seed availability resolves |
| Add Task / Complete Task | ✅ live, governed, assignee displays |
| Document request/receive/review | ✅ live, governed |
| Credit Memo readiness | ⚠️ presence-only signal |
| Borrower messaging | ❌ safe-off |
| Portfolio boarding handoff | ❌ stage-string only, no record |
| 4-kind transition control (`StageWorkflowControl`) | ❌ preview-only, unrouted |

---

## Security / entitlement readiness table

| Control | Finding |
|---|---|
| Actor requirement | Advance control renders only when `stageAdvanceActor.systemUserId` present — passed **only** by `BankerDealWorkspace` (manager/team are read-only). |
| Write authorization | `advanceWorkflowStage` returns `unauthorized` unless `authorized === true`; audit is **fail-closed** on resolving the actor email → `cr664_user` (`cr664_ChangedBy`). No systemuser id bound into `cr664_user`. |
| Reference-data safety | TEST/PHASE rows filtered before production resolution; no hardcoded GUIDs; binds built from verified active rows only. |
| Least privilege | Reference reads use minimal `$select`; the seam performs no IO until an authorized, gated, actor-bearing invocation. |
| Gaps | No role check beyond "banker workspace passes an actor"; entitlement to *advance* is workspace-mount-based, not an explicit stage-transition permission. |

---

## Evidence / smoke table

| Capability | Operator UPN | Machine proof (`affectedRecordIds`) | Integrity verdict |
|---|---|---|---|
| `crmLivePersistence` | `mpaller@oldglorybank.com` ✅ | populated (`12d8dfda-…`) ✅ | **ACCEPTED / HIGH** |
| `stageAdvancement` | `mpaller@oldglorybank.com` ✅ | **empty** ❌ | **INSUFFICIENT / NONE** (no machine proof) |
| `documentChecklist` | `mpaller@oldglorybank.com` ✅ | empty ❌ | INSUFFICIENT / NONE |
| `borrowerSend` | `mpaller@oldglorybank.com` ✅ | no receipt/recipient/approver ❌ | INSUFFICIENT / NONE |
| `portfolioBoarding` | **`unknown-operator`** ❌ | has id | INSUFFICIENT / NONE (non-attributable) |

Only **crmLivePersistence** is attributable AND machine-proven. `stageAdvancement` is attributable but not machine-proven → certification withholds it (`enabledCount 1/6`, `fullLaunchReady=false`). `platformInventory` lists `stage-progression-advance` as `DELIBERATELY_BLOCKED / WIRED_DISABLED`; it is deliberately **not** in `GOVERNED_WRITES` until armed-live with authentic evidence.

---

## Test / certification gaps

- **No skipped/todo workflow or governance tests.** Full suite green with the flag armed.
- **Coverage present:** stage ordering/vocabulary, transition engine (all 4 kinds at the pure-policy level), `advanceWorkflowStage` + live deps (incl. fail-closed no-update-when-unseeded, and `cr664_EventBy` omitted-not-faked), stage transition policy, certification models (flag-aware for WF-1A), no-fake-data guards, evidence-integrity rejection of non-attributable/non-machine-proven smokes.
- **Gaps:**
  - No live-transport tests for Return/Decline/Withdraw (there is nothing to test — the paths don't exist).
  - No readback test (no readback in code).
  - `stageGateContract`/`evaluateExitGate` is tested in isolation but has **no integration test proving it gates a live transition** (because it doesn't).
  - Credit-memo readiness has no "finalized/approved status" test (the code doesn't check it).

---

## Drift / stale-doc findings

1. **Run-log narrative vs. armed flag.** `STAGE_ADVANCEMENT_RUN_LOG.md` and parts of the master runbook describe `AUTO_STAGE_ADVANCE_ENABLED` as "default-off / stays off," but it is **`true`** (armed at `f3bf6e9` for WF-1A). Docs lag the flag.
2. **Evidence note claims a readback the code doesn't do.** `stageAdvancement.json` note says "transition, audit sink, timeline sink, **readback**, and rollback verified" — but `buildLiveStageAdvanceDeps` performs **no readback**, and the artifact carries **no `affectedRecordIds`**. The prose asserts more than the code or the machine proof supports.
3. **Status-reference model/reader mismatch.** `newDealReferenceReader` `$select`s `new_productionapproved` on the status table, but `Cr664_dealstatusreferencesModel` has no such field. Latent; harmless to ordering, but a schema/reader drift.
4. **Master runbook AE-4 "BLOCKED on schema seed"** vs. the SDK now exposing `cr664_sequence` (`2fd4101`). The column metadata exists; the **row seeding** is the still-open fact — the runbook conflates the two in places.
5. **Two readiness models** (`stageGateContract` rigorous-but-orphaned vs. `loanWorkflowRules` shallow-but-live) — the codebase's own comments acknowledge the split; it is real drift risk if a future dev assumes the rigorous gate runs.

---

## Exact acceptance criteria for "Workflow team-ready"

A banker must be able to move a **real** deal Intake → Underwriting → Credit Approval → Commitment → Documentation → Closing/Funding → Boarded with **no manual database intervention**, and the following must ALL hold:

1. **Seed proven live:** seven `cr664_dealstagereferences` rows, canonical codes, unique `cr664_sequence` 10–70, active; `--verify` green; SDK exposes `cr664_sequence`; `loadStageProgressionAvailability` resolves `available` in production.
2. **ADVANCE:** persists `cr664_StageReference` + `cr664_stageentrydate`, **reads back** the deal to confirm persistence in-code, emits `cr664_AuditEvent` + `cr664_dealtimelineevent` (both `→ cr664_user`), and surfaces honest partial-success.
3. **RETURN / DECLINE / WITHDRAW:** live-wired to a real `CanonicalStageTransport` (or extended advance seam), each persisting the correct stage/status field, audited, timeline-recorded, and tested.
4. **Exit gates on real facts:** the transition enforces the rigorous `stageGateContract` (or equivalent) with **real** risk-rating, approval-decision/authority, closing/funding, and boarding-handoff facts — not placeholders — and **required tasks block (not at-risk)** for real loans.
5. **Attributable + machine-proven smokes** for each transition kind (real operator UPN + non-empty `affectedRecordIds` for create/readback/update/cleanup) → certification `stageAdvancement.enabled = true` and `platformInventory` promotes `stage-progression-advance` into `GOVERNED_WRITES`.
6. **Entitlement:** an explicit stage-transition permission (not just "banker workspace passes an actor").
7. **Docs reconciled** to the armed-flag + seeded-data reality; no evidence note claims a step the code doesn't perform.

---

## Ordered implementation plan

**Ops / maker (unblocks the pilot first):**
1. Seed the seven stage rows with `cr664_sequence` (10–70), production-safe labels; run `scripts/seed-stage-references.mjs --verify`; confirm the Advance control renders in the banker deal cockpit.
2. Capture a **machine-proven** stage-advance smoke (real operator UPN + `affectedRecordIds`) so certification flips `stageAdvancement.enabled`.

**Engineering (in order):**
3. **Add readback** to `buildLiveStageAdvanceDeps` transport: re-read the deal's `cr664_StageReference` after update and surface a mismatch as `update_failed` (not silent success).
4. **Wire RETURN / DECLINE / WITHDRAW** to a live transport + audit + timeline (a `buildLiveCanonicalTransitionDeps` mirroring `buildLiveStageAdvanceDeps`, or extend the advance seam), persisting stage/status (and adverse-action-pending for DECLINE); mount the 4-kind control in the deal workspace behind the actor gate; add live-deps tests + no-fake-data guards.
5. **Connect the rigorous exit gate:** provision real underwriting/risk-rating, approval-decision/authority, closing/funding, and boarding-handoff schema; build live `StageGateFacts` from queries; make `executeCanonicalStageTransition` (or the advance policy) enforce them; **flip required-task incompleteness from at-risk to blocked** for real loans.
6. **Boarding handoff record:** replace stage-string inference with a real boarded-loan link at the BOARDED transition (respecting `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`).
7. **Certification + inventory:** once smokes are authentic, promote `stage-progression-advance` to `GOVERNED_WRITES`; update the launch models; reconcile run-log/runbook docs; fix the status-reference reader/model `new_productionapproved` mismatch.
8. **Entitlement:** add an explicit stage-transition permission check.

---

## Answers to the 20 audit questions

1. **Whole workflow routed/reachable?** Reachable to **view** (Stage Map in the banker deal cockpit; Loan Workflow tab). Not yet operable to advance (seed-gated, hidden control).
2. **Seven stages seeded + sequence-backed live?** **Cannot prove from source; evidence says pending.** Column metadata exists; row seeding is the open maker fact.
3. **Ordering from live data, not hardcoded?** **Yes** — sorted strictly by live `cr664_sequence`, fail-closed.
4. **Stage/status references bound on create + transition?** **Yes**, shape-correct + fail-closed; both paths flag-gated.
5. **StageWorkflowControl previewing or live?** **Preview-only, unrouted** (`WIRED_DISABLED`); writes nothing.
6. **Governed dependency injected in production UI?** **Yes, ADVANCE only** (`BankerDealWorkspace → card → StageAdvanceControl → live deps`). Manager/Team read-only.
7. **Advance persists + reads back?** **Persists yes; readback no** (code trusts `res.success`).
8. **Return/Decline/Withdraw persisted?** **No** — preview + pure policy; no live write/audit/timeline.
9. **Audit + timeline guaranteed for every transition?** **No.** ADVANCE attempts both (honest partial); the other three emit neither.
10. **Partial-success honest + visible?** **Yes** (`describeStageAdvanceOutcome`, `data-stage-advance-outcome`; no fake success).
11. **Task create/complete governed + live?** **Yes** — governed writes shipped; `TASK_GENERATION_ENABLED` armed; assignee displays.
12. **Document request/receive/review governed + live?** **Yes** for request/receive/review (shipped audit+timeline). Checklist **generation** is safe-off + evidence-insufficient; binary upload not wired.
13. **Credit-memo readiness on real memo data?** **Partially** — reads real `cr664_creditmemo1`/sections but only presence/fuzzy; no finalized/approved status.
14. **Underwriting/risk-rating/approval on real schema?** **No** — placeholders (`riskRatingAssigned: () => false`), fuzzy proxies only.
15. **Closing/funding/boarding on real schema?** **No** — placeholder facts; boarding derived from `deal.stage` string, no handoff record.
16. **Gates block on real facts or placeholders?** Live gate blocks on **real** deal/task/doc/memo data (shallow, `blocked`-only). The **rigorous placeholder gate** is not on the live path.
17. **Which blockers "not yet tracked"?** risk rating, underwriting review/recommendation, approval decision/authority/conditions, commitment issued/acceptance, closing docs/collateral/insurance, loan docs executed, funds disbursed, boarding completed.
18. **Smokes attributable vs unknown?** Attributable: crm/stage/documentChecklist/borrowerSend (all `mpaller@oldglorybank.com`). Unknown-operator: **portfolioBoarding**. Only **crmLivePersistence** is also machine-proven/HIGH.
19. **Flags WF-1A-armed vs team-ready?** WF-1A-armed: `AUTO_STAGE_ADVANCE_ENABLED`, `TASK_GENERATION_ENABLED`. Team-ready: `BANKER_CREATE_PILOT_ENABLED`, read-only routes (`CRM_COMMAND_CENTER_ROUTE_ENABLED`, `PORTFOLIO_BOOK_DATA_ENABLED`). Everything else safe-off.
20. **Can a banker move Intake→…→Boarded without manual DB intervention?** **Not for a real team-ready run.** For the WF-1A pilot: **ADVANCE can**, once the maker seeds `cr664_sequence` and the actor resolves — but with no readback, evidence rejected, and Return/Decline/Withdraw non-functional. So a full governed lifecycle across all transition kinds is **not** achievable today without manual intervention / missing paths.

---

## Files inspected

**Stage model / references:** `src/workflow/stageOrderingContract.ts`, `loanWorkflowStages.ts`, `loanWorkflowTypes.ts`, `canonicalStageVocabulary.test.ts`; `src/deals/newDealReferenceReader.ts`, `newDealReferenceTargets.ts`, `newDealReferenceResolver.ts`, `newDealCreateAdapter.ts`, `dealOriginationAudit.ts`; `src/generated/models/Cr664_dealstagereferencesModel.ts`, `Cr664_dealstatusreferencesModel.ts`; `power.config.json`; `scripts/seed-stage-references.mjs`.
**Transition engine / writes:** `src/workflow/canonicalStageTransition.ts`, `stageAdvanceWriteDependency.ts`, `stageTransitionPolicy.ts`, `StageWorkflowControl.tsx`, `AdvanceWorkflowStageButton.tsx`, `LoanWorkflowCommandCenter.tsx`, `portfolioBoardingStatus.ts`, `deriveLoanWorkflowState.ts`; `src/deals/buildLiveStageAdvanceDeps.ts` (+ `.test.ts`), `DealStageProgressionCard.tsx`, `stageProgressionAvailabilityLoader.ts`, `stageProgressionGuard.ts`, `BankerDealWorkspace.tsx`; `src/manager/ManagerDealWorkspace.tsx`; `src/team/TeamDealWorkspace.tsx`; `src/shared/governance/stageProgressionAvailability.ts`; `src/navigation/intentionallyUnrouted.ts`.
**Readiness / facts:** `src/workflow/loanWorkflowRules.ts`, `stageGateContract.ts`; `src/deals/creditMemoQueries.ts`, `dealTaskQueries.ts`, `dealDocumentQueries.ts`, `dealQueries.ts`.
**Flags / certification / evidence / routes / tests:** `src/deals/dealOriginationFeatureFlags.ts`, `newDealCreateFeatureFlags.ts`, `bankerCreatePilotConfig.ts`; `src/activation/stageProgressionActivation.ts`; `src/crm/crmFeatureFlags.ts`; `src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts`; `src/navigation/featureSurfaceFlags.ts`, `featureSurfaces.tsx`; `src/admin/productionEnvironmentVerification.ts` (+ `.test.ts`), `fullActivationLaunchCertificationModel.ts`, `v1GoLiveReleaseCertificationModel.ts`, `controlledLiveCutoverReadiness.ts`; `src/access/committedFinalLaunchEvidence.ts`, `finalLaunchSmokeEvidence.ts`; `src/banker/BankerShell.tsx`; `src/shared/governance/platformInventory.ts`; `docs/operator-evidence/final-launch/{stageAdvancement,crmLivePersistence,documentChecklist,borrowerSend,portfolioBoarding}.json`.
**Docs:** `docs/STAGE_SCHEMA_SETUP.md`, `STAGE_ADVANCEMENT_RUN_LOG.md`, `STAGE_PROGRESSION_ENABLEMENT_MAP.md`, `PHASE_225_PRODUCTION_STAGE_STATUS_ACTIVATION.md`, `MASTER_ACTIVATION_STATUS_AND_OPERATOR_RUNBOOK.md`.

*Read-only audit. No runtime code modified.*

---

# PART 2 — REMEDIATION STATUS (branch `feature/workflow-team-ready`)

> **SUPERSEDED (2026-07-14):** The claim below that "All four transition kinds are
> live-wired, persisted, audited, timelined, and readback-proven" is **false** —
> RETURN/DECLINE/WITHDRAW have a backend engine but no mounted UI in the live banker
> workspace (`StageWorkflowControl.tsx` is listed `WIRED_DISABLED`/unmounted in
> [platformInventory.ts](../src/shared/governance/platformInventory.ts)); only ADVANCE
> is reachable. Part 1 above (the original, more conservative audit) is closer to
> reality. For current, verified status see
> [LOS_WORKFLOW_TRUTH_MATRIX.md](LOS_WORKFLOW_TRUTH_MATRIX.md) and
> [LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md](LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md)
> (finding C5). The remainder of Part 2 is kept for history only.

**Date:** 2026-07-07
**Mode:** Remediation. One branch, one commit per phase (WFLOW-B … WFLOW-J).
**What changed since Part 1:** the six hard blockers are remediated **in code, fail-closed, and under test.** The two items that only a human operator can close (an authentic machine-proven live smoke, and a risk-rating system) are now *explicitly surfaced as blockers* instead of silently passing — the code can no longer overclaim them.

## Blocker → remediation map

| # | Part 1 hard blocker | Remediation | Phase |
|---|---|---|---|
| 1 | No in-code readback after the stage update (transport trusts `res.success`) | ADVANCE re-reads `cr664_StageReference` + `cr664_stageentrydate` and only reports `advanced` when persistence is confirmed; a miss/unavailable read is the new `readback_failed` outcome (honest failure, best-effort failed audit, no timeline). Live readback impl + UI case + tests. | **WFLOW-B** |
| 2 | Only ADVANCE is live-wired; Return/Decline/Withdraw have no live write path | Built `buildLiveCanonicalTransitionDeps` (transport + audit + timeline + readback) wiring the canonical 4-kind engine to Dataverse. RETURN persists the earlier stage ref + entry date; DECLINE persists `DECLINED` status ref + structured reason + adverse-action-pending marker and sends **no** borrower notice (import-scan guarantee); WITHDRAW persists `WITHDRAWN` status ref + reason. Each proves persistence with a readback; each fully tested. | **WFLOW-C / D / E** |
| 3 | Stage seed never deterministically proven | `evaluateStageSeedReadiness` + live `loadStageSeedReadiness` prove exactly the seven canonical rows, active, at the ratified sequences (10…70), fail-closed on missing/duplicate/inactive/misordered/unsequenced/non-canonical seeds, with a stable fingerprint. | **WFLOW-F** |
| 4 | Rigorous exit-gate model orphaned; its facts (risk rating, approval authority, funding, boarding) untracked and invisible to the live gate | Added a per-requirement `tracked` signal and `reconcileStageExitGate` / `certifyStageExitGatesReconciled`: a stage is `certifiable` only when the live path allows **and** the rigorous gate is satisfied **and** every fact is tracked. Untracked facts (risk rating, closing/funding, boarding) and over-permissive divergences now **block certification** instead of silently passing. | **WFLOW-G** |
| 5 | Boarding handoff trusted the `deal.stage` string alone | `evaluateBoardingHandoff` makes the BOARDED fact require **both** the stage **and** an active `cr664_portfolioboardedloans` record linked via `cr664_OriginatedLoanDeal`; adds a `missing-handoff` blocker (stage says boarded, no servicing record) and a `premature-handoff` anomaly. Live `loadBoardingHandoffForDeal` is fail-closed. | **WFLOW-H** |
| 6 | `stageAdvancement` smoke attributable but not machine-proven; committed artifact overclaimed a verified readback with empty `affectedRecordIds` | `deriveStageAdvancementSmokeProof` captures the full provenance (operator UPN + systemuser id, org url/env id, deal id, from/to stage, affectedRecordIds, audit id, timeline id, readback proof, timestamp, correlation id, note) and treats a readback claim without `readbackProof` (or empty ids) as **fabrication, not proof**. The overclaiming `stageAdvancement.json` was corrected to honest `failed` / pending-proof. | **WFLOW-I** |

## What is now team-ready

- **All four transition kinds are live-wired, persisted, audited, timelined, and readback-proven** — fail-closed, default-off (`AUTO_STAGE_ADVANCE_ENABLED`), injected transports (SDK kept out of the static/`src/workflow` graph; live loaders live in `src/deals`).
- **The seed, the exit gates, and the boarding handoff are all deterministically proven** and refuse to pass on missing/ambiguous/untracked data.
- **The evidence layer cannot overclaim** — machine proof requires real record ids + a backed readback; unbacked claims are flagged.

## What still gates FULL production certification (honestly, not team-ready to hide)

1. **An authentic machine-proven live smoke** — an operator must run a real governed transition against the org and capture `affectedRecordIds` + audit id + timeline id + a concrete `readbackProof` (the harness/schema now exists — WFLOW-I; the committed artifact is honestly `failed` until then).
2. **Risk-rating (and the other rigorous facts) tracked in schema** — until risk rating is implemented, `UNDERWRITING` can never be `certifiable`; WFLOW-G surfaces this as a hard blocker rather than passing it.

These two are **operator/schema work, not code gaps.** The workflow is team-operable with honest governance today; it is not yet *fully production-certified*, and the code now refuses to claim otherwise.

*Remediation complete for the code-side blockers. See `LOAN_WORKFLOW_TEAM_READY_AAR.md`.*
