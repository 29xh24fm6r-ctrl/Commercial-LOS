# Phase 182 — Banker create audit_failed_partial: diagnosis + reconciliation

## What happened (three live proofs, all partial)

All three live banker New Deal create proofs created the Loan Deal but returned
`audit_failed_partial`:

- First partial proof deal: `387a1ecd-c669-f111-ab0c-70a8a596e491`
- Second partial proof deal: `33829cbc-cd69-f111-ab0c-70a8a596e491`
- Third partial proof deal: created by `V1 Banker Create Proof - 2026-06-16 3`
- Second + third proofs surfaced the raw audit error:
  `Entity 'cr664_User' With Id = e050f0e7-4a13-f111-8406-6045bd07ee56 Does Not Exist`

This confirmed the create path works and the audit failure was surfaced
honestly (not faked).

## CONFIRMED root cause: `cr664_ChangedBy` targets `cr664_user` (required)

The diagnostic banner from the post-third-fix proof was conclusive. The audit
payload shape showed:

```
binds=[cr664_ChangedBy@odata.bind->systemusers, cr664_LoanDeal@odata.bind->cr664_loandeals]
```

i.e. `cr664_ActorUser` was ABSENT (a fresh, not stale, bundle) and the ONLY
actor bind was `cr664_ChangedBy -> /systemusers(<actor>)` — yet Dataverse still
rejected the POST with `Entity 'cr664_User' With Id = <actor systemuser id>
Does Not Exist`. That conclusively proves **`cr664_ChangedBy` is a REQUIRED
lookup that targets the custom `cr664_user` table, not `systemuser`.** A
systemuser id can never be bound there.

### Metadata facts established

- `cr664_auditevents.cr664_ChangedBy@odata.bind` is REQUIRED (non-nullable in
  the generated model) and targets `cr664_user`. It cannot be omitted (rules out
  omission) and cannot take a `/systemusers(...)` id.
- `cr664_users` is NOT a registered runtime data source, so it cannot be read
  directly by the app. BUT an `@odata.bind` only needs a valid id + entity-set
  path (validated Dataverse-side), so the app does not need to read `cr664_users`
  to bind it — it only needs a valid `cr664_user` row id.
- The REGISTERED `cr664_platformusers` bridge table carries the actor's email
  (`cr664_email` / `cr664_normalizedemail`) AND a `cr664_CoreUser` lookup whose
  value (`_cr664_coreuser_value`) is a `cr664_user` row id.

## Fix: resolve the actor to a `cr664_user` id via the platform-user bridge

`cr664_ChangedBy@odata.bind` now carries a caller-resolved
`/cr664_users(<cr664_userid>)` value. A new fail-closed resolver
([newDealAuditActorResolver.ts](../src/deals/newDealAuditActorResolver.ts))
maps the acting banker's email to exactly one ACTIVE `cr664_platformusers` row
and returns `/cr664_users(<its _cr664_coreuser_value>)`. It fails closed on:
no actor email, no matched row, an inactive row, a missing `CoreUser` link,
multiple distinct `cr664_user` matches, or a read error — returning a clear,
id-free reason.

The governed audit emit
([newDealCreateAdapter.ts](../src/deals/newDealCreateAdapter.ts)
`emitNewDealAuditEvent`) resolves the bind BEFORE building any payload. If it
cannot resolve, it returns `audit_failed_partial` with the reason and writes NO
audit row — it never binds `/systemusers` into the `cr664_user` lookup and never
fakes an audit success. The canonical builder still routes through
`buildNewDealAuditPayload`, and the sanitized payload-shape diagnostic
(`summarizeAuditPayloadShape`) + correlation id remain surfaced in the UI; a
successful proof's shape now reads
`binds=[cr664_ChangedBy@odata.bind->cr664_users, cr664_LoanDeal@odata.bind->cr664_loandeals]`.

> Note: the same `cr664_ChangedBy -> /systemusers` binding is used by the other
> governed writes (dealTaskActions, documentActions, …). Those have never been
> exercised live; if/when they are, they will need the same resolver treatment.
> That is OUT OF SCOPE here — this fix touches only the New Deal create audit.

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
- `cr664_ChangedBy@odata.bind`: `/cr664_users(<the proof banker's cr664_user id>)`
  — the `cr664_user` row id (e.g. the `cr664_CoreUser` of the banker's
  `cr664_platformusers` row), NEVER a systemuser id.
- `cr664_correlationid`: a new correlation id (record it)
- Do NOT set `ownerid` / `owneridtype` / `statecode` / `cr664_ActorUser`.

Before creating it, query `cr664_auditevents` for any existing row with that
`cr664_entityid` to avoid a duplicate.

## Next proof

> **Update:** the actor → `cr664_user` resolution is now owned end-to-end by the
> canonical
> [identity / audit graph provisioning](./PHASE_186_IDENTITY_AUDIT_GRAPH_CANONICAL_PROVISIONING.md).
> Run it to `GRAPH STATUS: READY` before any further proof — the steps below
> remain valid but the bridge prerequisite is provisioned there.

Do NOT create another proof deal immediately. After this fix is deployed:

1. **Hard-refresh / close the old tab and reopen the app URL** so the new bundle
   loads.
2. Confirm the payload shape FIRST: the next proof's banner (or a dry check)
   must show `cr664_ChangedBy@odata.bind->cr664_users` — NOT `->systemusers`.
   Only proceed once ChangedBy is no longer bound to systemusers.
3. Run **exactly one** final banker create proof only after Matt approval, named
   `V1 Banker Create Proof - 2026-06-16 4`.
4. Read the `audit_failed_partial` banner if it recurs: it now shows the
   correlation id, the raw Dataverse error, AND the sanitized payload shape
   (`binds=[…]`). If it reads `audit blocked: cr664_ChangedBy … could not be
   resolved`, the acting banker has no active `cr664_platformusers` row with a
   `CoreUser` link — an operator must provision/repair that bridge row (the
   resolver is correct and fail-closed; it is not faking success).
5. Confirm a clean `success` (create + audit). Public create and all downstream
   automations remain disabled.

Three proof deals (`387a1ecd-…`, `33829cbc-…`, and the third) are missing audit
rows; reconcile each per the section above.
