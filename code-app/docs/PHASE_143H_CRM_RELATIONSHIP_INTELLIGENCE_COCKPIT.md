# Phase 143H — CRM Relationship Intelligence Cockpit (Read-Only)

> **Read-only.** Combines source-of-truth posture, Salesforce/nCino readiness,
> entity match, sync preview, writeback policy, dry-run proof, and activity timeline
> into one read-only cockpit. No live call, no write control, no "sync now"/"push
> now" button.

## What was added
- `src/crm/relationshipIntelligence/crmRelationshipIntelligenceViewModel.ts` — view model.
- `src/crm/relationshipIntelligence/CrmRelationshipIntelligenceCockpit.tsx` — read-only cockpit.

## Cockpit sections
CRM activation posture, Salesforce readiness, nCino readiness, entity match status,
sync preview summary, writeback policy status, dry-run writeback proof,
activity/relationship timeline, and a single next safe CRM activation step.
Result: `readOnly: true`, `liveCrmLookupPerformed: false`, `externalSystemChanged: false`.

## Rules / safety posture
Read-only, no live calls, no write controls, no "sync now"/"push now", no fake
success. The component is exported and tested; route mounting is deferred (no new
route, loader, or permission added).
