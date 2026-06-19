# Phase 193F — CRM Relationship Health + Next Actions

**Status:** Complete. Evidence-based, rules-driven relationship health and
deterministic next-action suggestions — no AI claims, no approval odds, no
fabricated score.

**Branch:** `phase193f-crm-relationship-health-and-next-actions`.
**Depends on:** 193A–E (stacked).

## Delivered

- `src/crm/crmRelationshipHealthModel.ts` — `deriveCrmRelationshipHealth` +
  `deriveCrmNextActions`.
- `src/crm/CrmRelationshipHealthCard.tsx` — banker/manager summary card.

## Behavior

- Health band (`healthy` / `watch` / `at-risk` / `unknown`) is derived from
  supplied signals: coverage presence, contact presence, activity recency
  (against a caller-provided reference time), open/overdue tasks, and provisional
  account identity. With insufficient evidence the band is `unknown` — never an
  invented number.
- Next actions are deterministic, source-linked suggestions (assign coverage,
  resolve overdue tasks, log activity, migrate provisional account, add contact).
  No ranking claims, no AI, no credit/approval decision.
- Missing inputs and source facts are surfaced explicitly.

## Safety

No fake score, no fake risk signal, no unsupported AI language, no approval/
credit decision language, no borrower comms, no write/fetch/SDK, no route change.

## Validation

- `npm test -- phase193F crm relationship health next actions` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
