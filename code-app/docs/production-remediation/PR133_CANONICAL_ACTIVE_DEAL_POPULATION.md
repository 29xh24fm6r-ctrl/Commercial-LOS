# PR 133 — Canonical Active-Deal Population + Queue Reconciliation

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 2
**Findings addressed:** N-03, N-18, N-19, N-20, N-33 (confirmed defects). N-02 addressed in part;
remaining scope explained below.
**Branch:** `phase2-canonical-active-deal-population`

## Problem statement

The July 25 audit found the same "active deal" concept disagreeing across surfaces (Dashboard/
Manager/Team showing 15 vs. Active Deals/Loan Workflow showing 23), newly-created work disappearing
from operational queues, and several tiles contradicting either their own detail view or a sibling
tile on the same page.

## Investigation and root cause (N-02)

A dedicated read-only investigation (see the session's Explore-agent report) mapped every "active
deal" population query in the codebase. The findings:

- A canonical predicate/filter module already exists (`src/shared/deals/dealVisibilityScopes.ts`,
  from a prior P0-4 remediation) and every deal-list query correctly imports it — there is no second,
  independently-retyped copy of the active-deal rule anywhere.
- The Dashboard/Manager/Team/Tasks & Actions/Due Diligence/My Alerts/Activity surfaces default to
  **excluding** classified test/smoke deals (`includeTestDeals: false`), while Active Deals /
  Personal Pipeline / Loan Workflow deliberately **include** them (`includeTestDeals: true`) so a
  controlled test record stays findable and labeled — a documented, intentional design (`D-01`).
- For the SAME banker, this `includeTestDeals` flag is the entire explanation for the 15-vs-23 style
  gap between those two families of surface — both query families otherwise resolve to the identical
  banker-scoped population.
- This intentional split was never disclosed on the page itself, so a banker or auditor comparing two
  numbers had no way to tell "different by design" from "broken."

N-02's own two comparisons split into two different, independently-confirmed root causes, addressed
as N-19 (a literal same-page self-contradiction, not a cross-surface design difference) and N-03 (a
genuine data-loss bug independent of test-deal classification). See below for each.

## Root causes and fixes

### N-19 — Loan Workflow's own tile contradicted its own table

`loanWorkbenchModel.ts`'s `deriveLoanWorkbench` computed `counts.active` by skipping any row flagged
`isTestRecord`, while `rowsForSection` (what the table actually renders) never applied that skip — so
a page showing a controlled test deal in the table (by design, per D-01) simultaneously reported a
smaller "My Active Deals" tile count. This was pinned as *expected* behavior by an existing test using
exactly the audit's own scenario (a `SYSTEM TEST -` deal in `Underwriting` stage).

**Fix:** `counts` now always equals `rowsForSection(model, key).length` for every section — the tile
can never disagree with the table beneath it again. A new `testRecordCounts` field discloses how many
of each tally are test/smoke records, rendered as a small "incl. N test/smoke" sub-label on the queue
card, so the distinction stays visible instead of silently vanishing into one number.

### N-03 — newly-originated work invisible in Manager/Team Workspace

The Manager/Team **deal-list** loaders (`loadTeamPipeline`, `loadTeamDeals`) already had an
Owning-Team-OR-assigned-banker fallback (from a prior P0-4 fix), so a deal with an assigned banker
but no Owning Team (`cr664_Team` is optional at New Deal create) still appears in the team's deal
list. But the four **child-record** loaders per role
(`loadManagerTeamTasks/Documents/Memos/MemoSections`, `loadTeamTasks/Documents/Memos/MemoSections`)
filtered ONLY on the parent deal's team lookup, with no such fallback — so that same deal's tasks,
documents, and memos never appeared in Manager/Team Workspace even once the deal itself did.

**Fix:** a new shared helper, `buildTeamVisibilityFilterViaNavigation` (in
`dealVisibilityScopes.ts`), mirrors `buildTeamVisibilityFilter`'s OR-fallback shape through the
child's navigation property to its parent deal. All eight child loaders now accept an optional
`memberBankerIds` parameter and apply it; `ManagerDataProvider.tsx` / `TeamDataProvider.tsx` resolve
the team's member banker ids once (already done for the deal list) and thread them into all four
child-loader calls, falling back to team-only scope if that resolution fails.

### N-18 — "Documents: 0" read as "no documents" while 5 sat unreviewed

`DealMetricDeck.tsx`'s Documents tile showed `docOutstandingCount` as its headline value under the
bare label "Documents" — when outstanding was 0, nothing on the tile said the number meant
"outstanding," so "0" read as "no documents" despite the sub-line showing "5 received · 0 reviewed."

**Fix:** the tile label is now "Documents Outstanding," so the number always reads correctly.
Separately, `workQueueQueries.ts`'s `loadDocumentsAwaitingActionForDeals` was found hand-rolling its
own outstanding/received/reviewed rule instead of calling `classifyLegacyDocumentStatus` — the
shared rule its own module header already claimed every such surface used. It now calls the shared
function directly, and the existing 3-surface cross-view reconciliation test
(`documentStatusCrossViewReconciliation.test.ts`) was extended to a 4th surface (the cross-deal work
queue), closing the "one shared rollup" gap for real.

### N-20 — three disagreeing Due Diligence counts

`BankerDueDiligenceView.tsx` ran its own independent `loadBankerWorkQueueData(bankerId)` call with the
default `includeTestDeals: false` — so a controlled test deal's real unreviewed documents were
excluded from this page's total, producing exactly the reported "page says 0 pending review" despite
5 unreviewed records existing on that deal.

**Fix:** the page now requests `includeTestDeals: true`, matching the same "findable work list, not a
KPI tile" reasoning already applied to Active Deals / Loan Workflow (D-01) and now this list too — a
banker's real, actionable due-diligence items are never hidden by test-record classification.

### N-33 — duplicate CRM companies never detected after creation

`detectCrmOrganizationDuplicates` only ever checked one *new* candidate against existing organizations
at Add-Company create time. Nothing re-scanned organizations already in the CRM, so records that
slipped past (or predate) that check — e.g. "OmniCare 365" created twice plus "Omnicare 365" with
different capitalization — were never flagged, and every listing/total that counts distinct companies
silently double- or triple-counted them.

**Fix:** a new pure function, `findDuplicateOrganizationClusters`, groups an existing organization
list into duplicate clusters by normalized name, legal name, or website — read-only, never
merging/deleting, matching this codebase's "no deletion/merge without operator authorization" rule.
`CrmHubWorkspace.tsx`'s Companies view now shows a "N possible duplicate company groups found" banner
listing each cluster, computed from the already-loaded organization data (no new read). `CrmRecord`
gained `orgLegalName`/`orgWebsite` raw fields (mirroring the existing `orgNotes`/`orgNaicsCode`
pattern) so the banner has the same signals the create-time check uses.

## Files changed

- `src/banker/loanWorkbenchModel.ts`, `loanWorkbenchModel.test.ts` — N-19
- `src/banker/BankerLoanWorkflowWorkbench.tsx`, `BankerLoanWorkflowWorkbench.test.tsx` — N-19 disclosure
- `src/shared/deals/dealVisibilityScopes.ts`, `dealVisibilityScopes.test.ts` — N-03 shared helper
- `src/manager/managerQueries.ts` — N-03 (4 child loaders)
- `src/team/teamQueries.ts` — N-03 (4 child loaders)
- `src/manager/ManagerDataProvider.tsx`, `src/team/TeamDataProvider.tsx` — N-03 wiring
- `src/shared/deals/teamChildRecordOwningTeamFallback.test.ts` — new, N-03 regression coverage
- `src/deals/DealMetricDeck.tsx` — N-18 label fix
- `src/banker/workQueueQueries.ts` — N-18 shared-rollup fix
- `src/deals/documentStatusCrossViewReconciliation.test.ts` — extended to the 4th surface
- `src/banker/BankerDueDiligenceView.tsx`, `BankerDueDiligenceView.test.tsx` — N-20
- `src/crm/write/crmDuplicateDetection.ts`, `crmDuplicateDetection.test.ts` — N-33 detection
- `src/crm/workspace/crmWorkspaceData.ts`, `crmWorkspaceData.test.ts` — N-33 raw fields
- `src/crm/workspace/CrmHubWorkspace.tsx`, `CrmHubWorkspace.test.tsx` — N-33 banner

## Schema impact

None. No new tables, columns, or relationships. All fixes are client-side query/derivation/display
logic.

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| Loan Workflow "My Active Deals" tile vs. its own table | Could silently disagree (test records in table, not in tile) | Always equal; test/smoke split disclosed separately |
| A new deal's task, with no Owning Team set | Deal visible in Manager/Team deal list; its task invisible in Manager/Team Workspace | Task, document, and memo loaders apply the same fallback as the deal list — visible everywhere the deal is |
| Documents tile showing "0" | Ambiguous — could mean "no documents" or "0 outstanding" while 5 sat unreviewed | Labeled "Documents Outstanding" — unambiguous |
| Due Diligence page total | Could silently exclude a test deal's real unreviewed documents | Matches the deal's actual documents |
| Duplicate CRM companies (e.g. "OmniCare 365" x2 + "Omnicare 365") | Never detected after creation; inflated every company/deal total silently | Surfaced in a read-only "possible duplicates" banner on the Companies view; nothing auto-merged |

## Tests added / updated

- `loanWorkbenchModel.test.ts` — inverted the D-01 fixture to assert count/table equality plus the new `testRecordCounts` disclosure
- `BankerLoanWorkflowWorkbench.test.tsx` — same, at the UI layer
- `dealVisibilityScopes.test.ts` — new tests for `buildTeamVisibilityFilterViaNavigation`
- `teamChildRecordOwningTeamFallback.test.ts` (new file) — 11 tests pinning the exact OData filter each of the 8 child loaders sends, with and without member ids, plus an injection guard
- `documentStatusCrossViewReconciliation.test.ts` — extended to include the work-queue loader as a 4th reconciled surface
- `BankerDueDiligenceView.test.tsx` — pins the `includeTestDeals: true` call
- `crmDuplicateDetection.test.ts` — 8 new tests for `findDuplicateOrganizationClusters`, including the exact "OmniCare 365"/"Omnicare 365" scenario from the audit
- `crmWorkspaceData.test.ts` — pins `orgLegalName`/`orgWebsite` mapping
- `CrmHubWorkspace.test.tsx` — 3 new tests for the duplicate-company banner, including that duplicate records still render as separate, un-merged rows

## Validation results

- `npx tsc -b` — 0 errors
- `npx vitest run` — 911 test files, 13354 passed, 2 skipped, 0 failed
- `npm run build` — succeeded
- `npm run audit:reachability` — 0 unexpected orphans

## Operator steps

None. This PR requires no schema migration and no operator action to take effect.

## Rollback considerations

All changes are additive or presentation-layer; reverting is a plain code revert with no data
implications.

## Remaining limitations

- N-02's underlying design (Dashboard/Manager/Team excluding test deals by default, Active Deals/Loan
  Workflow/Due Diligence including them) is preserved, not removed — it is a deliberate, previously
  reviewed distinction (D-01). This PR's contribution is disclosure (N-19's queue-card sub-label) and
  closing the one place it was a genuine same-page contradiction rather than a cross-surface design
  choice. A fuller reconciliation — e.g. a single governed test/production classification field
  replacing name-substring matching — is N-17's scope, not this phase's.
- N-33's duplicate detection is read-only and does not create a persisted, governed remediation-queue
  record (e.g. a `cr664_DataQualityFlag` row) — it recomputes from already-loaded data on each page
  view. Wiring duplicate clusters into the existing Dataverse-backed Data Quality Flags admin panel
  (`DataQualityFlags.tsx`) would require a governed write path and is left to a future phase.
- The reachability-audit orphan count is unchanged from the prior baseline; no new orphans were
  introduced.
