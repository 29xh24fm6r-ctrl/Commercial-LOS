# Phase 143C — CRM Identity / Entity Matching Model (Read-Only)

> **Read-only.** Compares LOS deal/client data against Salesforce-shaped and
> nCino-shaped CANDIDATE records (labels only) and reports a match band for HUMAN
> review. No live lookup, no auto-linking, no CRM id stored, no sensitive
> identifiers.

## What was added
- `src/crm/matching/crmEntityMatchingModel.ts` — `deriveCrmEntityMatch`.

## Input / result
Input: LOS entity + Salesforce candidate (account/opportunity/owner labels) + nCino
candidate (relationship/loan/borrower/owner labels). Result: matchStatus
(`no_candidates`|`possible_match`|`strong_match`|`conflict`|`unknown`),
confidenceBand (`low`|`medium`|`high`|`unknown`), matchedProviderLabels, conflicts,
warnings, recommendedReviewStep, `readOnly: true`, `crmRecordLinked: false`,
`externalSystemChanged: false`.

## Rules / safety posture
No writes, no auto-linking, no fake CRM ids, no live lookup. No deterministic
result implies an authoritative match without human review. Sensitive identifiers
are rejected.
