# Phase 193D — CRM Account / Contact / Coverage UI

**Status:** Complete. Salesforce-like read surfaces for account, contact,
coverage team, relationship roles, related deals, relationship health, and
source facts. Read-only; missing data is shown as missing, never mocked.

**Branch:** `phase193d-crm-account-contact-coverage-ui`.
**Depends on:** PR 193A–C (stacked) for the live gates/orchestrator/persistence
modules co-located in `src/crm`. Uses the Phase 189J spine model types.

## Delivered

- `src/crm/crmAccountViewModel.ts` — pure assembly of available spine data into a
  render model with `present` / `missing` / `provisional` field states.
- `src/crm/CrmAccountSurfaces.tsx` — `CrmAccountSurface` rendering account
  identity, contacts, coverage team, relationship roles, relationship health,
  related deals, and source facts, each with explicit missing-data markers.

## Honesty

- A provisional Account (projected from the borrower/client stub) is badged
  `provisional`; full-account fields with no value render `Missing`.
- Decision influence, titles, emails, phones, effective dates, and company data
  are surfaced as missing when absent — never invented.
- No write controls on these surfaces (writes go through the gated persistence
  adapter elsewhere). No fetch/SDK; no route/App/WorkspaceGate change; not mounted
  this phase.

## Validation

- `npm test -- phase193D crm account contact coverage` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
