# Phase 170H -- Admin New Deal Resolver Readiness Surface

Date: 2026-06-15
Baseline: 68a2276 (Phase 170G). Read-only admin readiness UI + tests/docs
(+ deploy). No Dataverse write, no records, + New Deal stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Purpose

Give an admin a READ-ONLY way to smoke-test, from inside the deployed app,
whether the typed Stage/Status data sources (registered in 170F2, bound on
the 170G push) resolve to a single active Stage + Status by code/name. This
proves runtime binding without a Dataverse bearer token and without
enabling create.

Implemented as `NewDealResolverReadinessCard`, mounted inside the
admin-gated `NewDealIntakePanel`. It calls the existing
`resolveConfiguredNewDealReferences()` (which reads via
`newDealReferenceReader` over the typed generated services) and renders the
fail-closed result. It NEVER writes, NEVER enables create, and NEVER
displays a record GUID (it shows the configured code/name only).

## Readiness UI States

- `loading` -- "Checking Stage/Status resolver readiness…".
- `ready` (badge "Ready (TEST)") -- shows Stage `PHASE121_STAGE`
  (TEST - Stage Phase 121) and Status `PHASE121_STATUS`
  (TEST — Status Phase 121), each "one active match", plus:
  - "TEST reference rows — not production-approved (production approval
    pending)." and
  - "Create remains disabled."
- `notConfigured` -- blocked/fail-closed (data sources not resolvable yet).
- `missingStage` / `missingStatus` -- blocked: no active match.
- `duplicateStage` / `duplicateStatus` -- blocked: multiple active matches.
- `inactiveStage` / `inactiveStatus` -- blocked: matched row inactive.
- `serviceError` (incl. any thrown error) -- blocked: could not read the
  reference data sources.

Every non-ready state renders "Blocked (fail-closed)" and no create
control. No GUID is shown in any state (pinned by tests).

## Runtime Smoke Checklist (operator, in the deployed app)

1. Open the app (env `5f2d77a5-de50-edeb-9d74-5b2400a2320d`); hard refresh.
2. Go to the Admin workspace -> Operations Console -> New Deal Intake.
3. Read the "Resolver readiness (read-only smoke)" card:
   - EXPECTED if typed binding works: "Ready (TEST)" with Stage
     `PHASE121_STAGE` and Status `PHASE121_STATUS`, the TEST/not-production
     warning, and "Create remains disabled".
   - If the data sources are not bound or unreadable: a "Blocked
     (fail-closed)" state (notConfigured / serviceError / missing / etc.).
4. Confirm the "+ New Deal" / "Create deal" controls remain disabled.
5. No record is created or modified by viewing this card (read-only).

## Expected Ready State If Typed Binding Works

Given the single active TEST rows confirmed by prior operator inspection
(Stage `PHASE121_STAGE`, Status `PHASE121_STATUS`, unique + active), the
card is EXPECTED to show "Ready (TEST)". This confirms the 170F2 typed
data sources are bound and queryable at runtime.

## Expected Fail-Closed States

If the deployed app has not bound the data sources, or a read fails, the
card shows `notConfigured` or `serviceError`; mismatched/duplicate/
inactive rows show the corresponding blocked state. In all cases the
resolver returns a non-ready result and create stays disabled.

## TEST Reference Row Warning

`PHASE121_STAGE` / `PHASE121_STATUS` are TEST-environment labels
(`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`). The `ready` state
explicitly warns they are not production-approved. Production Stage/Status
reference rows must be seeded/approved before any create is considered.

## Why + New Deal Remains Disabled

- The readiness card is read-only; it adds no create control.
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`; `NOT_WIRED` still carries
  `new-deal-create`; the panel's "Create deal" stays a disabled
  placeholder.
- TEST reference rows are not production-approved.
- A `ready` result proves resolution only; it does not wire any create.

## Files Changed

- `src/admin/NewDealResolverReadinessCard.tsx` -- read-only readiness card.
- `src/admin/NewDealResolverReadinessCard.test.tsx` -- state tests.
- `src/admin/NewDealIntakePanel.tsx` -- mounts the card.
- `src/admin/NewDealIntakePanel.test.tsx`,
  `src/admin/AdminOperationsConsole.test.tsx` -- mock the reader for
  deterministic, read-free tests.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- 170H doc pin.
- `docs/PHASE_170H_ADMIN_NEW_DEAL_RESOLVER_READINESS.md` -- this doc.

## Validation Results

- `npm test -- NewDeal Admin admin releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).
- `git status --short`: clean.

## Deploy Result

`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d` run
after commit + clean tree + green tests/build (see report). The
line-ending-only `power.config.json` change from push was verified
content-identical and restored.

## No Record / Write / Schema / Tag Statement

No schema or migration. No Dataverse record created, patched, or deleted.
No Stage/Status record created. No production approval of TEST rows. No tag
created or moved. No permission widening. No CRM/portfolio/admin write
enablement change. The readiness card performs read-only Dataverse reads
only (via the typed generated services).
