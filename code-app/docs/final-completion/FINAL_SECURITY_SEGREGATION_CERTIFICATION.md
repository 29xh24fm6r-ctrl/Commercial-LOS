# Final Security / Segregation-of-Duties Certification — Workstream T

**Posture.** Investigation + honest disclosure, not a rebuild. This document consolidates the
security/segregation-of-duties posture that already exists across several independent docs and
code modules, extends the investigation to the six new durable-record tables this arc's
Workstreams C/D/E/F/H/J shipped, and states plainly what is and is not enforced today — including
where server-side plugin coverage would be needed but is deliberately not built in this arc. No
new business rule is invented anywhere in this document without a data model that actually
supports it; where a same-actor (maker/checker) check would require data this arc's tables don't
carry, that gap is disclosed, not silently worked around.

## 1. What the Dataverse governance plugin actually enforces today

The plugin — `dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs`,
tested by the sibling `.Tests` project (41 tests, builds clean) — registers on `cr664_loandeal`
`Update` messages and enforces exactly one domain: **stage/status transition governance for the
loan deal itself.** Specifically:

- Stage adjacency (a deal cannot skip stages out of the canonical order).
- The terminal-status lock (a closed/declined/withdrawn deal cannot be silently reopened by a
  direct field write).
- The CREDIT_APPROVAL → COMMITMENT approval-authority gate: self-approval prevention (the
  advancing actor's own banker record id cannot equal the deal's originating/assigned banker id),
  committee-membership and approval-limit checks.
- Reason-requirement scaffolding (present in the plugin, currently inert pending a UI that
  collects the reason).

The exact fields/entities/transitions covered are fully specified in
[`docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md`](../governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md),
with the threat model in
[`docs/governance/THREAT_BYPASS_MODEL.md`](../governance/THREAT_BYPASS_MODEL.md), the design
rationale in
[`docs/governance/ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md`](../governance/ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md),
and the original sign-off in
[`docs/governance/GOVERNANCE_INITIATIVE_CERTIFICATION_REPORT_2026-07-21.md`](../governance/GOVERNANCE_INITIATIVE_CERTIFICATION_REPORT_2026-07-21.md).
This certification does not re-derive any of that — it is the canonical source and remains
accurate for what it covers.

## 2. The six new tables: confirmed zero server-side plugin coverage — disclosed, not accidental

Workstreams C/D/E/F/H/J added six new Dataverse tables via
`scripts/schema-migrations/final-arc-*`: Credit Approval Decision, Commitment Record, Condition
Verification, Executed Document Attestation, Booking QC Check, Adverse Action Record. The plugin's
message filter registers on `cr664_loandeal` only — it has no registration, entity constant, or
logic touching any of these six tables' logical names. **This is not an oversight**:
`THREAT_BYPASS_MODEL.md` itself already named this exact class of gap before this arc began
("someone could still directly edit a related table to fabricate a status... closing that is a
separate, larger initiative... named explicitly out of scope"), and
`FINAL_REMAINING_GAP_LEDGER.md` §12 flagged it by name in advance: *"Workstream T's server-side
segregation control, if added in this arc, requires build + registration in the live environment,
which is an operator action this arc cannot perform."* This certification confirms that forecast
held: no plugin build or registration happened in this arc, for the reason stated there — building
and registering a new PreOperation step against a live Dataverse organization is an operator
action outside "code-safe work," not something this arc can do unilaterally.

## 3. Client-side segregation-of-duties per new table — what exists, and why the rest doesn't

| Table | Maker/checker split in the data model? | Client-side check today |
|---|---|---|
| Credit Approval Decision | **Yes** — the record separately carries the deal's originating/assigned banker id and the advancing (approving) actor's own banker id | **Real self-approval prevention.** `submitCreditApprovalDecision.ts` reuses `evaluateCreditApprovalAuthority()` (`src/workflow/creditApprovalAuthority.ts`) verbatim — the same check the plugin itself enforces for CREDIT_APPROVAL → COMMITMENT — comparing two genuine banker-record ids, not display names. Denies when `advancingActorBankerId === originatingBankerId`. |
| Commitment Record | No — ACCEPT/DECLINE/EXPIRE/WITHDRAW record an external party's (the borrower's) response, not a second internal approval; the acting banker is recording an outcome, not independently re-approving one | None, and none invented here. A "different banker must record the response" rule would add friction with no fraud-prevention benefit, since the actual approval authority (Credit Approval Decision, above) already gated issuance. |
| Condition Verification | No — `ConditionVerificationRecord` carries exactly one actor field (`verifiedByActorEmail`); there is no separate "condition owner"/requester actor in the schema to check against | None. Adding a same-actor rule here would require a data model change (a second tracked actor) this arc did not make — inventing a comparison against something the schema doesn't carry was rejected rather than faked. |
| Executed Document Attestation | No — `ExecutedDocumentAttestationRecord` carries exactly one actor field (`attestedByActorEmail`); no separate preparer/requester actor is tracked | Same as above — no invented check. |
| Booking QC Check | No — `BookingQcCheckRecord`'s input carries only the reviewer's own actor email; the deal's originating banker is not threaded into this action's input today | Same as above. A real post-closing QC control (reviewer ≠ originator) is a legitimate, industry-standard pattern, but implementing it correctly would require plumbing the deal's assigned-banker identity into this action (new input + call-site wiring) — a real, valuable, but non-trivial follow-up left for a dedicated future change rather than bolted on here without full verification. |
| Adverse Action Record | No — `AdverseActionRecord` carries exactly one actor field (`recordedByActorEmail`); this is compliance-completion recording, not a two-party approval | None, and none invented — there is no "approval" being second-guessed here, only a completion record. |

**Principle applied throughout:** a segregation-of-duties check is only added where the data model
already carries two independently-tracked actors whose identities can be compared without
ambiguity (banker-record ids, not display names). Where that data doesn't exist, this arc discloses
the gap rather than fabricating a check against something fragile (e.g., comparing free-text
names) or inventing a business rule (e.g., "the borrower's response must be logged by a different
banker") with no evidentiary basis in how these actions are actually used.

## 4. Residual risk (disclosed, matches the existing threat model's own pattern)

For all six new tables, the ONLY enforcement layer today is client-side (the `submit*Action.ts`
functions and, for Credit Approval Decision, the reused authority check). A direct Dataverse Web
API write or Power Automate flow against any of these six tables bypasses every one of these
checks entirely — the same class of residual risk `THREAT_BYPASS_MODEL.md` already discloses for
direct writes to `cr664_loandeal` itself. This is not a new category of risk this arc introduces;
it is the same category, now confirmed to extend to six more tables, and disclosed rather than
left implicit.

## 5. What would close this, and why it isn't done here

Closing the server-side gap requires: (a) extending the plugin (or adding sibling plugin steps) to
register on each of the six new tables' `Create`/`Update` messages with the same fail-closed
enforcement discipline the loan-deal plugin already demonstrates, and (b) building + registering
that assembly against the live Dataverse organization — an operator action, not a code change this
arc can perform. Closing the one real client-side gap named above (Booking QC reviewer ≠
originating banker) requires threading the deal's assigned-banker identity into
`SubmitBookingQcCheckInput` and its live-deps wiring — a real, scoped, safe follow-up, but one that
was not attempted here without the space to verify it end-to-end (call site, live deps, tests)
against the live data shape, consistent with this arc's discipline of not shipping a half-verified
change.

## 6. Certification statement

- The loan-deal transition plugin's existing certification (§1 sources) remains accurate and
  unchanged by this arc.
- The six new durable-record tables have **no server-side enforcement** today; this is a known,
  disclosed limitation, not a fabricated "certified secure" claim.
- One of the six (Credit Approval Decision) has a genuine, robust client-side self-approval check
  reusing already-proven logic. The other five do not, because their data models don't carry a
  second actor to check against — not because a check was skipped.
- No new schema, plugin build, or live-environment registration was performed by this arc — all of
  that remains explicit operator-owned follow-up work, tracked here and in
  `FINAL_REMAINING_GAP_LEDGER.md` §12.
