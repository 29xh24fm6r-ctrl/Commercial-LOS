# Phase 182 — Banker create audit_failed_partial: diagnosis + reconciliation

## What happened (first live proof)

The first live banker New Deal create proof created the Loan Deal but returned
`audit_failed_partial`:

- Created deal id: `387a1ecd-c669-f111-ab0c-70a8a596e491`
- UI: "The deal was created … but its audit record failed. An operator must
  reattempt the audit. This is not a clean success."

This confirmed the create path works and the audit failure was surfaced
honestly (not faked).

## Diagnosis

Verified against Dataverse metadata:

- Audit table `cr664_auditevents` is a registered runtime data source.
- Every scalar field and lookup-bind navigation property used by the audit
  payload exists on the audit table (`cr664_auditeventname`,
  `cr664_eventcategory`, `cr664_eventtype`, `cr664_entitytype`, `cr664_entityid`,
  `cr664_LoanDeal@odata.bind`, `cr664_outcomestatus`, `cr664_changeddate`,
  `cr664_ChangedBy@odata.bind`, `cr664_ActorUser@odata.bind`,
  `cr664_correlationid`, …).
- Option-set values (Lifecycle / AssignmentChange / LoanDeal / Succeeded) are
  verified.

**Root cause:** the audit create payload set `ownerid` (a plain GUID),
`owneridtype` (a SOAP-era field), and `statecode: 0` on create. The governed
loan-deal create — which **succeeds** — omits all three and lets Dataverse
default the owner to the calling user and the state to Active. Setting them on
the audit POST is what made it fail while the loan-deal POST succeeded in the
same app/runtime. The actor is already recorded via `cr664_ChangedBy@odata.bind`.

## Fix

Removed `ownerid` / `owneridtype` / `statecode` from the governed audit create
payload ([newDealCreateAdapter.ts](../src/deals/newDealCreateAdapter.ts)
`liveEmitNewDealAuditEvent` and the shared
[dealOriginationAudit.ts](../src/deals/dealOriginationAudit.ts) builder). The
`audit_failed_partial` outcome and all other behavior are unchanged; success
still requires a real create AND a real audit success. The banker UI now also
surfaces the raw audit error text on `audit_failed_partial` so any future
failure can be captured precisely.

## Reconciling the existing partial proof deal

No automatic audit retry is wired (to avoid creating a duplicate audit without
strong idempotency/correlation protection). To reconcile the existing proof deal
`387a1ecd-c669-f111-ab0c-70a8a596e491`, an authorized operator may, with Matt's
approval, create exactly ONE `cr664_auditevents` row for it (maker portal or an
authorized Web API POST), mirroring the fixed payload:

- `cr664_auditeventname`: "New Deal Created"
- `cr664_eventcategory`: 788190002 (Lifecycle)
- `cr664_eventtype`: 788190002 (AssignmentChange)
- `cr664_entitytype`: 788190000 (LoanDeal)
- `cr664_entityid`: `387a1ecd-c669-f111-ab0c-70a8a596e491`
- `cr664_LoanDeal@odata.bind`: `/cr664_loandeals(387a1ecd-c669-f111-ab0c-70a8a596e491)`
- `cr664_outcomestatus`: 788190000 (Succeeded)
- `cr664_ChangedBy@odata.bind`: `/systemusers(<the proof banker's systemuserid>)`
- `cr664_correlationid`: a new correlation id (record it)
- Do NOT set `ownerid` / `owneridtype` / `statecode`.

Before creating it, query `cr664_auditevents` for any existing row with that
`cr664_entityid` to avoid a duplicate.

## Next proof

Do NOT create a second proof deal immediately. After this fix is deployed,
re-run **exactly one** new banker create proof (Phase 182D) only after Matt
approval, and confirm a clean `success` (create + audit). Public create and all
downstream automations remain disabled.
