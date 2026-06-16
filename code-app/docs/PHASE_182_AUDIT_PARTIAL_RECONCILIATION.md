# Phase 182 — Banker create audit_failed_partial: diagnosis + reconciliation

## What happened (two live proofs, both partial)

Both live banker New Deal create proofs created the Loan Deal but returned
`audit_failed_partial`:

- First partial proof deal: `387a1ecd-c669-f111-ab0c-70a8a596e491`
- Second partial proof deal: `33829cbc-cd69-f111-ab0c-70a8a596e491`
- Second proof surfaced the raw audit error:
  `Entity 'cr664_User' With Id = e050f0e7-4a13-f111-8406-6045bd07ee56 Does Not Exist`

This confirmed the create path works and the audit failure was surfaced
honestly (not faked). Two distinct root causes were found and fixed in turn
(below).

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

**Root cause #1 (first proof):** the audit create payload set `ownerid` (a plain
GUID), `owneridtype` (a SOAP-era field), and `statecode: 0` on create. The
governed loan-deal create — which **succeeds** — omits all three and lets
Dataverse default owner→caller and state→Active. Setting them on the audit POST
is what made it fail while the loan-deal POST succeeded in the same app/runtime.

**Root cause #2 (second proof):** the audit payload bound the actor's systemuser
id into BOTH `cr664_ChangedBy@odata.bind` and `cr664_ActorUser@odata.bind`.
`cr664_ChangedBy` targets `systemuser` (so `/systemusers(<actor>)` resolves), but
`cr664_ActorUser` targets the custom **`cr664_user`** table — so the same id was
validated against `cr664_user` and rejected
("Entity 'cr664_User' … Does Not Exist"). `cr664_ActorUser` is optional and the
app has no systemuser→cr664_user resolver, so it is **omitted**; the actor is
recorded authoritatively via `cr664_ChangedBy` (systemuser) + the correlation id.

## Fix

Removed `ownerid` / `owneridtype` / `statecode` AND the `cr664_ActorUser@odata.bind`
field from the governed audit create payload
([newDealCreateAdapter.ts](../src/deals/newDealCreateAdapter.ts)
`liveEmitNewDealAuditEvent` and the shared
[dealOriginationAudit.ts](../src/deals/dealOriginationAudit.ts) builder). The
`audit_failed_partial` outcome and all other behavior are unchanged; success
still requires a real create AND a real audit success. The banker UI now also
surfaces the raw audit error text on `audit_failed_partial` so any future
failure can be captured precisely.

## Reconciling the existing partial proof deals

No automatic audit retry is wired (to avoid creating a duplicate audit without
strong idempotency/correlation protection). Two proof deals are missing an audit
row: `387a1ecd-c669-f111-ab0c-70a8a596e491` and
`33829cbc-cd69-f111-ab0c-70a8a596e491`. To reconcile EACH, an authorized operator
may, with Matt's approval, create exactly ONE `cr664_auditevents` row per deal
(maker portal or an authorized Web API POST), mirroring the fixed payload (note:
do NOT set `cr664_ActorUser`, `ownerid`, `owneridtype`, or `statecode`):

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

Do NOT create another proof deal immediately. After the ActorUser fix is
deployed, run **exactly one** final banker create proof only after Matt
approval, named `V1 Banker Create Proof - 2026-06-16 3`, and confirm a clean
`success` (create + audit). If it still returns `audit_failed_partial`, the UI
now shows the exact Dataverse error to capture. Public create and all downstream
automations remain disabled.
