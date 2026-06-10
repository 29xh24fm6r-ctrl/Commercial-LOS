# Phase 143A — CRM Activation Inventory and Source-of-Truth Map

> **Docs / model / governance only.** Inventories the CRM/Salesforce/nCino
> relationship surfaces and defines source-of-truth ownership before activation.
> No live integration, no writes — every domain defaults to `disabled_by_default`
> with no CRM write target.

## What was added
- `src/crm/sourceOfTruth/crmSourceOfTruthMap.ts` — the source-of-truth map.

## Activation states
`not_configured`, `disabled_by_default`, `read_only_preview`, `dry_run_writeback`,
`allowlisted_writeback`, `live_controlled`. Everything ships as
`disabled_by_default`.

## Source-of-truth domains
Borrower/client identity, business legal name, DBA, contacts, relationship
managers/bankers, deal/opportunity, loan amount, stage/status, product type, loan
structure, pricing type, tasks, activities, emails/communications, documents,
credit memo, committee package, closing checklist, servicing handoff, deposit
opportunity, cross-sell/relationship intelligence. For each: LOS/Dataverse owner,
Salesforce owner, nCino owner, proposed read source, proposed write target (always
`none` in this arc), conflict rule, activation status, and notes/blockers.

LOS/Dataverse is authoritative for identity, amount, stage/status, and pricing.
Stage/status are lifecycle fields blocked from any CRM writeback. The only future
allowlisted candidate is a relationship-intelligence note.

## Safety posture
No writes, no live integration, no permission widening. Read-only/disabled until
the activation arc certifies a controlled writeback.
