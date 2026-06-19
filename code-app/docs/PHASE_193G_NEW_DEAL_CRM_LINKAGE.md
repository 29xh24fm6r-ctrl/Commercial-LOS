# Phase 193G — Governed New Deal → CRM Linkage

**Status:** Complete. The gated step that links an already-created New Deal to a
CRM provisional Account + Deal relationship. Inert when gates are off; preserves
existing deal-create behavior.

**Branch:** `phase193g-new-deal-crm-linkage`. **Depends on:** 193A–F (stacked) —
uses the persistence adapter (193B), gates (193A), and audit (193B).

## Delivered

- `src/crm/crmSalesforceSpineNewDealLinkage.ts` — `linkNewDealToCrm`.

## Behavior

- Runs AFTER the governed deal create; it never creates a deal and never changes
  the existing create path.
- Gates off → `blocked_gate_not_satisfied`, `linkageAttempted: false` (honest skip).
- Gates on + transport → creates the provisional Account (from the borrower/
  client stub; rejected if no client name — never invented), then the Deal↔Account
  relationship.
- If the Account links but the relationship fails → `partial_success` (never a
  silent roll-forward; never a claimed sync without a real Dataverse response).
- Outcomes: `linked` · `partial_success` · `blocked_gate_not_satisfied` ·
  `skipped_missing_required_data` · `failed_dataverse` · `dry_run`. Correlation
  id + audit payloads on every path.

## Integration note

This module is the linkage step the New Deal create orchestration can invoke
behind the persistence gate. It is intentionally standalone this phase (no edit
to the existing create controller), so existing create behavior is fully
preserved when the gate is off. Wiring it into the create orchestration is a
follow-up that touches the governed create path explicitly.

## Validation

- `npm test -- phase193G newDeal crm linkage partial success` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
