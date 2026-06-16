# Phase 182D — Banker New Deal create pilot live proof

## Status: operator-run (one proof, after Matt approval)

The banker create surface is deployed and LIVE for the controlled pilot. The
single live proof must be run **by an approved banker in the deployed app** (it
cannot be driven from CI / the build pipeline). Run exactly ONE proof.

## Preconditions (verify before submitting)

- Matt approval for one live proof is recorded.
- `--inspect-new-deal-create-references` shows exactly one production-safe active
  Stage (Intake / INTAKE) and Status (Open / OPEN) row.
- Banker create gates are enabled via the pilot config
  (`BANKER_CREATE_PILOT_ENABLED = true`).
- The approved banker resolves to a Dataverse systemuser (no read-only banner).
- Public create remains disabled; downstream automations remain disabled.

## Proof steps

1. Open the Banker workspace as the approved banker.
2. Go to **Active Deals** → the **New Deal** panel.
3. Enter the deal name: `V1 Banker Create Proof - YYYY-MM-DD HHMM`.
4. Click **Create deal** once.
5. Confirm a Loan Deal record was created (the UI shows the real created deal id).
6. Confirm Stage = **Intake**.
7. Confirm Status = **Open**.
8. Confirm Assigned Banker / Owner / ChangedBy are correct.
9. Confirm an audit event was created with a correlation id.
10. Confirm NO downstream CRM / task / document / checklist / borrower /
    portfolio / stage / messaging automation ran (the orchestrator was invoked
    with downstream config empty; all modules return disabled/skipped).
11. Confirm the UI shows success only after create + audit success. If the audit
    failed, the UI shows the distinct **audit_failed_partial** warning (deal
    created, audit must be reattempted) — NOT a clean success.
12. Decide whether to retain / close / archive / correct the proof deal.

## Do NOT run the proof if

- references are missing / TEST / PHASE,
- the actor does not resolve to a systemuser,
- banker authorization fails,
- public create would be enabled,
- any downstream automation is enabled.

## Result (to be completed by the operator)

- Approval recorded by: ____
- Environment: ____
- Actor (banker / systemuser): ____
- Proof deal name: ____
- Created deal id: ____
- Stage / Status labels: Intake / Open (confirm)
- Audit event id (or audit_failed_partial): ____
- Downstream modules: disabled / skipped (confirm)
- Disposition (retain / close / archive / correct): ____
- Final proof result: ____
