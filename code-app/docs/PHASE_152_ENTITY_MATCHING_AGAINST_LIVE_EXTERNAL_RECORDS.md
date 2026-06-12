# Phase 152 — Entity Matching Against Live External Records

## What Was Added

- `src/integrations/externalPlatforms/externalEntityMatchAgainstLiveRecords.ts` — read-only entity matching that compares local entities against external records without auto-linking.
- `src/integrations/externalPlatforms/ExternalEntityMatchReviewPanel.tsx` — read-only UI panel showing match status, candidates, conflicts, and recommended step.

## Safety Posture

| Property | Value |
|----------|-------|
| autoLinked | `false` |
| externalSystemChanged | `false` |
| liveWritePerformed | `false` |

## Explicit Exclusions

- No auto-link or auto-merge of records.
- No write to external platform.
- No vendor/product names in user-facing strings.
- No link button, merge button, or confirm-match affordance.
- No fetch/XHR/axios in source.

## Acceptance

```bash
npm test -- externalEntityMatch externalPlatformActivationCertification
npm run build
```

Read-only match review. No external system mutation or auto-link.
