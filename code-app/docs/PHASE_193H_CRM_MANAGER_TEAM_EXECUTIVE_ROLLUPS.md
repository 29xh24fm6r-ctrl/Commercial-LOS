# Phase 193H — CRM Manager / Team / Executive Rollups

**Status:** Complete. Salesforce-like rollups for managers, teams, and
executives. Entitlement-before-render; no fake metrics; the executive view is
aggregate-only.

**Branch:** `phase193h-crm-manager-team-executive-rollups`. **Depends on:** 193A–G (stacked).

## Delivered

- `src/crm/crmRelationshipRollups.ts` — `deriveCrmManagerRollup`,
  `deriveCrmTeamRollup`, `deriveCrmExecutiveRollup` (pure aggregation).
- `src/crm/CrmRelationshipRollups.tsx` — manager/team/executive rollup cards.

## Features

- **Manager:** banker coverage view, relationship health by banker, overdue CRM
  tasks, stale-relationship counts (against a caller-provided reference time),
  coverage gaps.
- **Team:** team coverage, shared relationship accounts, open/overdue tasks,
  missing-source-facts count.
- **Executive:** aggregate health counts, coverage %, source-fact %, overdue
  tasks, operational readiness — **no account-level detail**.

## Safety

- Entitlement-before-render: every rollup returns `entitled: false` with no data
  when the viewer is not entitled.
- No fake metrics — all counts derive from supplied records; empty input yields
  zeros / `unknown`, never invented KPIs.
- No cross-workspace leakage (executive aggregate carries no account ids); no
  write/fetch/SDK; no approval language; no route change.

## Validation

- `npm test -- phase193H crm manager team executive rollups` — green.
- `npm run build` — green.
- `npm test -- crmGovernance noFakeProductionData releaseCandidateSnapshot` — green.
