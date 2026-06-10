# Phase 143I — CRM Allowlisted Live-Write Pilot Scaffold (Disabled by Default)

> **Disabled by default.** Defines the FUTURE control envelope for an allowlisted
> live-write pilot WITHOUT enabling it. Even `eligible_for_future_pilot` performs no
> write, calls no provider, and uses no transport.

## What was added
- `src/crm/writeback/crmAllowlistedLiveWritePilot.ts` — `evaluateCrmAllowlistedLiveWritePilot`.

## Allowlisted / blocked fields
Allowed candidates: relationship_intelligence_note, crm_external_reference_label,
non_authoritative_task_note, preview_only_status_label. Blocked: credit decision,
stage, status, lifecycle, amount, pricing, borrower legal identity, SSN/TIN/DOB/
account fields, approval/denial/recommendation, committee vote.

## Result / rules
Status (`disabled`|`rejected`|`eligible_for_future_pilot`), `liveWritePilotEnabled: false`,
`liveWritePerformed: false`, `externalSystemChanged: false`, allowedFieldCount,
blockedFieldCount, deterministic `pilotProofId`. Even `eligible_for_future_pilot`
does not write. No provider call, no endpoint/secret/env var, no write transport —
this is just the future control envelope.
