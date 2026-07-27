# Final Controlled Production E2E — Workstream W

**Purpose:** the executable proof this arc's six new durable-record capabilities (Workstreams
C/D/E/F/H/J) work together as one governed loan lifecycle, run by an operator against a real
Dataverse environment after the operator migration steps in
`docs/final-completion/FINAL_ARC_SCHEMA_MIGRATIONS_INVENTORY.md` (Workstream S). **Nothing in this
document has been executed from the authoring sandbox — no live Dataverse connection exists here.**
Every step below produces a pass/fail an operator records; this document is a script, not a claim
of having run it.

**Companion:** `docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` already certifies the
Dataverse governance plugin's stage/status enforcement (Part A) and RETURN/DECLINE/WITHDRAW's live
UI behavior (Part B); this document does not repeat that — it certifies the six NEW durable-record
capabilities layered on top, end to end, in the order a real deal actually moves through them.

**Test deal setup:** create ONE disposable test deal (name prefixed `TEST -`, per
`src/shared/deals/testDealClassification.ts`'s convention, so it never pollutes operational
counts). Use the same deal for the entire forward path (§1–§8) so each stage's gate genuinely
depends on the prior stage's real record, not a fabricated shortcut. Use a SECOND disposable test
deal for the decline/adverse-action branch (§9), since DECLINE is terminal.

---

## 1. Underwriting — risk rating and recommendation (pre-arc, confirmed still gating)

1. Advance the test deal from INTAKE to UNDERWRITING through the normal banker Advance flow.
2. On the deal's Underwriting card, attempt to advance to CREDIT_APPROVAL with no risk rating and
   no underwriting recommendation recorded.
3. **Expect:** blocked, citing both missing facts (`UNDERWRITING:risk_rating`,
   `UNDERWRITING:uw_recommendation`).
4. Record a risk rating and an underwriting recommendation via the deal's Credit Memo / Risk
   Rating card. Retry the advance.
5. **Expect:** succeeds.

## 2. Credit Approval Decision — Workstream C

1. On the deal (now in CREDIT_APPROVAL), open **Credit Approval Decision** (`DealCreditApprovalDecisionPanelConnected`, mounted in the Banker deal cockpit).
2. Attempt to advance to COMMITMENT with no decision recorded.
3. **Expect:** blocked, citing `CREDIT_APPROVAL:approval_decision` / `:approval_authority` /
   `:approval_conditions`.
4. As the SAME banker who owns the deal (self-approval), attempt to record an APPROVED decision.
5. **Expect:** denied — self-approval prevention (`evaluateCreditApprovalAuthority`, reused
   verbatim from the plugin's own logic).
6. As a DIFFERENT banker with committee membership / sufficient approval limit, record an APPROVED
   decision with an authority tier and at least one condition.
7. **Expect:** succeeds; the deal's timeline shows the decision event; retry the advance from step
   2 now succeeds.

## 3. Commitment issuance and acceptance — Workstream D

1. On the deal (now in COMMITMENT), open **Commitment** (`DealCommitmentPanelConnected`).
2. Attempt to advance to DOCUMENTATION with no commitment recorded.
3. **Expect:** blocked, citing `COMMITMENT:commitment_issued` / `:borrower_acceptance`.
4. Attempt to record ACCEPT before any ISSUE exists.
5. **Expect:** denied — "No commitment is currently pending a response for this deal."
6. Issue a commitment (key terms summary required). **Expect:** succeeds; advance is still
   blocked (issued but not yet accepted).
7. Record ACCEPT. **Expect:** succeeds; retry the advance from step 2 now succeeds.

## 4. Condition Verification — Workstream E

1. On the deal (now in DOCUMENTATION), open **Condition Verification**
   (`DealConditionVerificationPanelConnected`).
2. Attempt to advance to CLOSING_FUNDING with none of the three condition types recorded.
3. **Expect:** blocked, citing `DOCUMENTATION:conditions_precedent` / `:collateral_verified` /
   `:insurance_verified`.
4. Record CONDITIONS_PRECEDENT as FAILED (with notes). **Expect:** that one condition still shows
   unmet — a FAILED verification does not clear its requirement.
5. Re-verify CONDITIONS_PRECEDENT as CLEARED, superseding the FAILED record. Record COLLATERAL as
   WAIVED and INSURANCE as CLEARED.
6. **Expect:** all three met; the FAILED record remains on file (append-only, not deleted) but the
   CLEARED re-verification is the one the gate reads. Advance now succeeds.

## 5. Executed Document Attestation — Workstream F

1. On the deal (now in CLOSING_FUNDING), open **Executed Document Attestation**
   (`DealExecutedDocumentAttestationPanelConnected`).
2. Attempt to advance to BOARDED with no attestation recorded.
3. **Expect:** blocked, citing `CLOSING_FUNDING:executed_docs` (independently of the pre-existing
   `cr664_closingdocumentmanifest` GENERATION record — generating a document is not the same fact
   as it being executed/signed).
4. Record an ATTESTED attestation with the executed date and notes.
5. **Expect:** succeeds.

## 6. Funding authorization and disbursement (pre-arc, confirmed still gating)

1. On the same deal, open **Funding Authorization**. Request, approve, and confirm disbursement per
   its existing dual-control flow.
2. **Expect:** `CLOSING_FUNDING:funds_disbursed` becomes met only once the record's status is
   FUNDED — confirm the advance stays blocked until then.

## 7. Booking QC — Workstream H

1. Open **Booking QC** (`DealBookingQcPanelConnected`).
2. Attempt to advance to BOARDED with no check recorded.
3. **Expect:** blocked, citing `CLOSING_FUNDING:booking_qc`.
4. Record a FAILED check (notes citing a mismatch). **Expect:** advance still blocked.
5. Record a PASSED check, superseding the FAILED one. **Expect:** advance to BOARDED now succeeds
   (assuming §1–§6 are all also satisfied).

## 8. Boarding handoff and servicing owner — Workstream H/I

1. Confirm the deal's stage reads BOARDED.
2. Confirm a real, active `cr664_portfolioboardedloans` record now exists referencing this exact
   deal (`BOARDED:boarded_loan_record`) — not merely the stage string.
3. Confirm `BOARDED:servicing_owner` is unmet until a servicing owner is assigned on that record,
   then assign one and confirm it flips met.

## 9. Decline branch — Adverse Action — Workstream J

Using the SECOND disposable test deal (DECLINE is terminal):

1. Advance the deal to any stage prior to a terminal one, then click **Decline**, enter a decline
   reason, and confirm.
2. **Expect:** succeeds live (per `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`'s Part B); the deal's
   stage/status reflects DECLINED.
3. On the declined deal, open **Adverse Action** (`DealAdverseActionPanelConnected`) — confirm it
   renders (per `recognizeCanonicalStatus(dealStatus) === 'DECLINED'`) and that
   `DECLINE:adverse_action` shows unmet.
4. Record a SENT (or WAIVED) adverse-action entry with notes.
5. **Expect:** succeeds; `DECLINE:adverse_action` flips met. Confirm `RETURN:authorization` is
   NOT enforced anywhere in this flow — it remains a deliberately untracked, ratified non-gate
   (see `FINAL_WORKFLOW_REQUIREMENT_MATRIX.md` §3).

## 10. Cross-cutting checks (run once, against whichever test deal is convenient)

1. **Timeline cross-writes (Workstream K):** confirm each of the writes above (§2–§9) produced a
   corresponding `cr664_dealtimelineevents` row on the deal, visible in the Activity Timeline card,
   with its `eventSubType` rendering as a banker-friendly label (Workstream L) rather than a raw
   `correlation:<uuid>` string.
2. **Admin capability truth (Workstream M):** in Admin → Durable Record Capabilities, confirm all
   six new capabilities list as "Live governed write" with their real status vocabularies.
3. **Data quality detection sweep (Workstream O):** in Admin → Data Quality Detection Sweep, click
   Scan; confirm it runs without error against live data (results will vary; the point is the scan
   completes and, if it finds a candidate, "Create flag" succeeds).
4. **Workspace navigation labels (Workstream Q):** confirm the ⌘K command palette's workspace
   labels match the live Platform Workspace names exactly (e.g. "Manager Command Center", not
   "Manager command center").

---

## Certification statement

- This script, if fully executed by an operator against a live environment with all Workstream S
  migrations applied and the SDK regenerated, would constitute genuine end-to-end proof that the
  six new durable-record capabilities gate the loan lifecycle together, not merely in isolation.
- **No step in this document has been executed.** This arc has no live Dataverse connection; every
  fact above is derived from direct source reads (the same evaluators, stores, and panels cited by
  file name throughout), not from running the app.
- Passing this script is a prerequisite for calling the six-table durable-record layer
  production-verified; until an operator runs it, that verification remains outstanding and must
  not be claimed as done.
