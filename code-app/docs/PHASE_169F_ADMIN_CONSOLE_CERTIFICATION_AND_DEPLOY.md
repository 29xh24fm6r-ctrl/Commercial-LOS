# Phase 169F -- Admin Operations Console Certification & Deploy

Date: 2026-06-15
Certification baseline: 912982f.
V1.0 runtime tag: v1.0.0-controlled-pilot at faf26d6 (UNCHANGED by this phase).

## Commits Included In This Rollout

- 169A `c18b587` -- Admin Operations Console shell (read-only).
- 169B `6a3be00` -- User & Access Management (read-only / preview-only).
- 169C `5a3c8ab` -- New Deal Intake blocker surface.
- 169D `b279de5` -- Portfolio Boarding onboarding surface (disabled by default).
- 169E `4a7bed1` -- CRM Onboarding surface (disabled by default).
- BUGFIX `912982f` -- Manager drill-down date-flake (test-only).

## Certification Checklist

1. Admin Operations Console contains the five required modules:
   User & Access Management, New Deal Intake, Portfolio Boarding, CRM
   Onboarding, and the Security / Dataverse Roles notice. PASS (pinned by
   `AdminOperationsConsole.test.tsx` + `adminOperationsConsoleModel.test.ts`).
2. Status truth:
   - User/access: read-only / preview-only; no governed write adapter
     (`USER_ACCESS_LIVE_WRITE_ENABLED = false`; access is driven by
     `cr664_platformuser.cr664_PrimaryWorkspace`, not the entitlements
     table). PASS.
   - New Deal: blocked by missing registered Stage/Status reference
     sources (`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`; Phase 163).
     PASS.
   - Portfolio: Case B, `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`
     default false, resolver fails closed. PASS.
   - CRM: Case B, `CRM_LIVE_PERSISTENCE_ENABLED` default false, external
     connector `CRM_CONNECTOR_MODE = disabled_by_default`. PASS.
3. All write / import / sync / create / upload / admin-grant actions are
   disabled placeholders. PASS (pinned per-panel test).
4. Admin route gating / fail-closed: `isAdminConsoleAuthorized(route)` is
   true only for `WORKSPACE_ROUTES.admin`; a non-admin / unresolved route
   renders the denied alert with no module data. PASS.
5. Non-admin users cannot see the admin surface (route-gated by
   `WorkspaceGate` + the console defense-in-depth gate). PASS.
6. Route delta 0 -- every panel renders inside the existing
   `/workspaces/admin` route; no router file changed. PASS.
7. No external HTTP / fetch / Graph calls introduced (pinned by per-file
   source-discipline tests across all 169A-E modules). PASS.
8. + New Deal remains disabled (`NOT_WIRED` still carries
   `new-deal-create`). PASS.
9. V1.0 runtime tag unchanged at `faf26d6`. PASS.
10. Deploy target verified:
    - environmentId: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
    - appId: `63858e09-3d0b-47c9-b1d2-65cef742fda4`
    - app name: Commercial Lending LOS (Rebuild)

## Validation Command Results

- `npm test -- Admin admin crm portfolioBoarding NewDeal ManagerBloombergControlPanel releaseCandidateSnapshot`: passed.
- `npm test`: passed, 459 files / 7765 tests.
- `npm run build`: passed (existing Vite chunk-size warning only).
- `git status --short`: clean before deploy.

## Deployment Command

```
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
```

Run only after the certification commit is pushed and the working tree is
clean. `pac code push` rewrites `power.config.json` line endings only
(LF->CRLF); restore it after deploy to keep the tree clean (no semantic
change).

## Live Smoke Checklist (admin)

1. Open the app.
2. Navigate to the Admin workspace.
3. Confirm the Admin Operations Console renders.
4. Confirm User & Access data appears, or the honest "Not available"
   state on read failure.
5. Confirm the New Deal Intake blocker appears (Stage/Status reference).
6. Confirm Portfolio Boarding shows "Disabled by default".
7. Confirm CRM Onboarding shows "Disabled by default" + external
   connector "Not configured".
8. Confirm no create / import / sync / grant / upload actions are enabled
   (all are disabled placeholders).
9. Confirm the Banker workspace still renders.
10. Confirm the CRM Command Center still renders (read-only preview).

## Rollback

If the deployed admin surfaces must be withdrawn, redeploy the certified
V1.0 controlled-pilot baseline:

```
git checkout v1.0.0-controlled-pilot
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
git checkout master
```

This restores the `faf26d6` runtime (banker KPI fix; no admin console).
Because the admin surfaces are read-only and enable no writes, a rollback
has no data to reconcile.

## Safety Statement

No live admin writes. No CRM / portfolio live persistence. No New Deal
enablement. No schema, migration, or Dataverse record changes. No
permission widening. No external connector enabled. No tag created or
moved by this phase (`v1.0.0-controlled-pilot` stays at `faf26d6`).
Deployment publishes the read-only admin console build only; it is not
smoke certification on its own.
