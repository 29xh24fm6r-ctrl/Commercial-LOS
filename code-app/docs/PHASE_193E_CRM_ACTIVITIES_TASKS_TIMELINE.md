# Phase 193E — CRM Activities / Tasks / Timeline

**Status:** Complete. Salesforce-like activity, task, and timeline capabilities.
Read-only timeline; activity creation is gated behind the persistence adapter;
no fabricated history.

**Branch:** `phase193e-crm-activities-tasks-timeline`. **Depends on:** 193A–D
(stacked) for the gates/persistence/audit modules and spine model.

## Delivered

- `src/crm/crmActivityTaskModel.ts` — `deriveCrmTimeline` (deterministic
  chronological merge of activities + tasks with source labels, overdue counts
  from a caller-provided reference time, empty handling) and
  `buildCrmActivityCreateRequest` (a gated persistence write-request with a
  required name + provenance).
- `src/crm/CrmActivityTimeline.tsx` — timeline + task summary surface with a
  gated "Log activity" action.

## Honesty / safety

- No fake history — entries come only from provided records; undated/unknown is
  shown as such; an empty timeline is labelled empty, not fabricated.
- Overdue is computed only against a caller-supplied reference time (no clock
  read, no invented dates).
- "Log activity" is disabled unless the persistence gate is satisfied and
  dispatches via a callback to the gated adapter; task creation is disabled (no
  allow-listed task table yet) rather than faked.
- No email/SMS/outreach send; no fake completion; no borrower communication; no
  route/App/Gate change.

## Validation

- `npm test -- phase193E crm activity task timeline` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
