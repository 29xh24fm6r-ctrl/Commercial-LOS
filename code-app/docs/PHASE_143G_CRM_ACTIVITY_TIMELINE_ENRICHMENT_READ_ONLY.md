# Phase 143G — CRM Activity / Task / Email Timeline Enrichment (Read-Only)

> **Read-only.** Builds a deterministic relationship timeline from EXPLICIT local
> input only. No email send, no Outlook/Graph, no Salesforce/nCino lookup, no fake
> activity. External references are labels only.

## What was added
- `src/crm/activityTimeline/crmActivityTimelineModel.ts` — `deriveCrmActivityTimeline`.
- `src/crm/activityTimeline/CrmActivityTimelinePanel.tsx` — read-only panel.

## Input event types / result
Event types: los_task, los_document, borrower_message, credit_memo,
committee_package, salesforce_activity_reference, ncino_milestone_reference.
Result: timelineRows (deterministically sorted), sourceCounts, warnings,
`readOnly: true`, `liveCrmLookupPerformed: false`, `externalSystemChanged: false`.

## Rules / safety posture
No email sending, no Outlook/Graph, no Salesforce/nCino lookup, no fake activity.
External references are labels only.
