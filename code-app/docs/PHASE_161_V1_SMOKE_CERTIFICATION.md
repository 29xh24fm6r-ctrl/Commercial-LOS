# Phase 161 - V1.0 Smoke Certification

Date: 2026-06-12

## Scope

This certification covers the V1.0 release-candidate smoke path after the
Phase 160 governed Log Activity write. Phase 159 New Deal remains blocked
because `cr664_loandeal` create requires `cr664_StageReference` and
`cr664_StatusReference`, and the app has no generated stage/status reference
data source or canonical default resolver.

## Smoke Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Login and workspace resolution | Pending operator smoke |
| 2 | Banker dashboard loads real data | Pending operator smoke |
| 3 | New Deal governed write works or fails honestly | Honest blocked state: disabled with required Stage/Status reference blocker |
| 4 | Log Activity governed write works or fails honestly | Implemented through `cr664_dealtimelineevents` plus audit event |
| 5 | Active Deals opens | Pending operator smoke |
| 6 | Tasks & Actions opens | Pending operator smoke |
| 7 | Due Diligence opens or is honestly disabled | Pending operator smoke |
| 8 | Activity opens | Pending operator smoke |
| 9 | Relationships opens | Pending operator smoke |
| 10 | My Alerts opens | Pending operator smoke |
| 11 | Signals opens | Pending operator smoke |
| 12 | CRM Command Center remains preview-only/read-only | Pending operator smoke |
| 13 | CRM drill-through details work | Pending operator smoke |
| 14 | Manager/Team/Portfolio/Executive workspace routing remains permission-gated | Pending operator smoke |
| 15 | No fake data appears | Static changed-production sweep clean |
| 16 | No external CRM/Copilot connector becomes live | Static changed-production sweep clean |
| 17 | Reload behavior works | Covered by `BankerShell.test.tsx` Log Activity refresh test |
| 18 | Route delta remains 0 | Verified: no changed route/router/workspaceRoutes files |
| 19 | Full test suite green | `npm test`: 448 files / 7625 tests passed |
| 20 | Build green | `npm run build`: passed with existing large-chunk warning |

## Governed Write Certification

### New Deal

Status: Not V1.0 ready.

Reason: the create payload cannot be made safely without required lookup
values for Stage Reference and Status Reference. The generated SDK exposes
required `cr664_StageReference@odata.bind` and
`cr664_StatusReference@odata.bind` fields on `Cr664_loandealsBase`, but no
generated service exists for the stage/status reference tables. The app must
not guess lookup ids or clone unrelated deal state.

### Log Activity

Status: Implemented and validated.

The banker header enables Log Activity only when the banker has a resolved
write identity. The modal requires selecting one of the already-loaded
banker-authorized active deals and entering a non-empty note. On success it
creates a real `cr664_dealtimelineevent`, emits an audit event, refreshes the
dashboard data, and shows a success state. On failure it shows an honest error
and creates no local activity substitute.

## Validation Results

- `npm test -- NewDeal LogActivity BankerWorkspace Activity CrmBankerWorkingSurface`: passed, 18 files / 357 tests.
- `npm test -- timelinePayloadDiscipline logActivityActions BankerShell phase125F platformInventory outcomeUnionDiscipline auditPayloadDiscipline correlationIdDiscipline releaseCandidateSnapshot phase129A ReleaseReadinessGate communicationLaneReleaseLock`: passed, 13 files / 1292 tests.
- `npm test`: passed, 448 files / 7625 tests.
- `npm run build`: passed; Vite reports the existing chunk-size warning.
- `npx eslint src/deals/logActivityActions.ts src/deals/logActivityActions.test.ts src/deals/LogActivityModal.tsx src/banker/GreetingHeader.tsx src/shared/governance/platformInventory.ts`: passed.
- `npm run lint`: failed repo-wide on pre-existing lint debt (109 errors / 2 warnings), including React refresh, set-state-in-effect, explicit-any, and test hygiene rules outside the Phase 160 delta.
- Static changed-production sweep for `fetch(`, `XMLHttpRequest`, `axios`, `microsoft graph`, `salesforce`, `ncino`, `hubspot`, `sync now`, `connect live`, `fake`, and `mock`: clean.
- Route delta check: 0 route/router/workspaceRoutes files changed.
