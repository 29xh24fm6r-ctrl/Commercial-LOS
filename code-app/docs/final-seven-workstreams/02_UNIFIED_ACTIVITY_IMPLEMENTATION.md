# Workstream 2 — Unified Banker/CRM Activity Logging

**Status: COMPLETE.**

## What changed

Two independently-shaped "log an activity" experiences existed: the deal-scoped
`LogActivityModal.tsx`/`logActivityActions.ts` (deal + a bare note, writing only to
`cr664_dealtimelineevents`) and the CRM-scoped `CrmWriteActions.tsx`/`crmWriteAdapter.ts`
(activityType/summary/outcome/follow-up/organization/person, writing to
`cr664_crmtimelineevents` with an existing one-directional cross-write to the deal timeline).

A new shared module, `src/activity/canonicalActivityLogging.ts`, is now the single source of truth
for the activity-type vocabulary (call/email/meeting/note), the deal-timeline eventtype mapping, and
the outcome/next-follow-up text-folding format — neither Dataverse table has dedicated columns for
outcome or next-follow-up, so folding them into free text consistently is the honest, schema-
respecting approach. `crmWriteAdapter.ts`'s CRM-scoped writer now imports this shared vocabulary
instead of its own private copy (zero behavior change — its existing 33 tests pass unchanged,
proving the extraction was byte-identical).

`logActivityActions.ts`'s deal-scoped writer now captures the same `activityType`/`outcome`/
`nextFollowUpDate` fields the CRM form does (closing D4's field-set inconsistency), and
`LogActivityModal.tsx` gained matching form fields (Type select, Outcome text, Next follow-up date).

**A genuinely new capability**: a best-effort reverse cross-write. `src/deals/
dealBridgedOrganizationLookup.ts` resolves `dealId → client relationship → CRM organization` (a
new two-hop resolver; the two existing single-hop resolvers in `dealCrmSiblingDeals.ts`/
`dealIndustryProjection.ts` were deliberately left untouched, not refactored, to avoid destabilizing
two already-tested, unrelated modules). When a deal's client is bridged to a CRM organization,
`logActivityActions.ts` now cross-writes a matching `cr664_crmtimelineevents` row — closing the
reverse-direction gap the D3 disposition table explicitly named as out of scope for that pass. Both
directions cross-write now.

## Deliberately NOT merged

- **Authorization surfaces stay separate.** Deal-write entitlement (`writeDisabledReason`/
  `systemUserId`/`bankerId`) and CRM-write entitlement (`authGate`/`CrmActor`) are different
  governance gates guarding different data domains. Merging them would touch access-control
  boundaries for no defect-fixing benefit — explicitly out of scope.
- **UI components stay separate.** `CrmWriteActions.tsx`'s multi-action popover bar and
  `GreetingHeader.tsx`'s modal-triggered header button are different mounting contexts (a CRM hub
  action bar vs. a banker workspace hero header). Unifying them into one component would be a larger
  UX redesign beyond what D4 actually reported (field-set inconsistency, not "two components exist").

## Tests

`canonicalActivityLogging.test.ts` (8), `dealBridgedOrganizationLookup.test.ts` (7), 10 new tests in
`logActivityActions.test.ts` (canonical type mapping, outcome/follow-up folding, reverse cross-write
happy path + 3 no-link branches + failure isolation), plus updated assertions in
`timelinePayloadDiscipline.test.ts` (a governance-contract pin whose "single hardcoded eventtype
constant" expectation was legitimately stale once the eventtype became a canonical-lookup
expression — corrected to assert the lookup, not weakened).

## Classification

**COMPLETE.**
