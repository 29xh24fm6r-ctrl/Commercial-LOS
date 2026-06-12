# Phase 169A -- Admin Operations Console (read-only shell)

Date: 2026-06-12
Baseline: faf26d6 (V1.0 controlled pilot, tag v1.0.0-controlled-pilot).

## Goal

Add a governed Admin Operations Console so the team can eventually add
people, grant app-level rights, and onboard deals / portfolio loans / CRM
records. Phase 169A delivers the READ-ONLY shell only: an admin-gated
status surface that honestly reports, per module, what is read-only, what
is blocked, and the next safe step. No writes are wired in this phase.

## Scope of Phase 169A

Delivered:

- An Admin Operations Console section mounted at the top of the existing
  admin workspace (`src/workspaces/AdminWorkspace.tsx`).
- Admin-only gating with defense-in-depth fail-closed behavior.
- Five read-only module status cards:
  1. User & Access Management
  2. New Deal Intake
  3. Portfolio Boarding
  4. CRM Onboarding
  5. Security / Dataverse Roles
- Each card shows current status, a status badge, the blocker, and the
  next safe step.
- One disabled placeholder action per card (no enabled write affordance).
- A persistent app-level-vs-platform-security disclaimer.

NOT in Phase 169A (deferred to separately-gated phases):

- 169B user/access live app-level entitlement writes.
- 169C new-deal admin intake (blocked until Phase 163 Stage/Status work).
- 169D portfolio boarding admin surface (adapter disabled by default).
- 169E CRM onboarding admin surface (adapter disabled by default).
- 169F certification + deploy.

## Admin Gating Method

Two layers:

1. Route gate (existing): the admin workspace route `/workspaces/admin`
   is protected by `WorkspaceGate`, which renders only for users whose
   bootstrap-resolved primary route is admin (or whose entitled routes
   include admin; today entitled routes only add the manager workspace).
2. Console gate (new, defense in depth): `isAdminConsoleAuthorized(route)`
   returns true only when `route === WORKSPACE_ROUTES.admin`. If the
   console were ever mounted outside the route gate, it fails closed and
   renders an "Admin access could not be verified" alert with no module
   data. This mirrors the Executive primary-name gating pattern.

Write attribution: the console reads `useAdmin().writeDisabledReason` and,
when set, surfaces it in the disclaimer so an admin sees why writes would
be unavailable. Phase 169A enables no writes regardless.

## Capability Status (read-only vs blocked)

| Module | Status | Why |
| --- | --- | --- |
| User & Access Management | read-only | Platform user / workspace entitlement / LOS profile tables are registered read data sources. No governed app-level entitlement write is wired into this console yet (Phase 169B). |
| New Deal Intake | blocked | cr664_loandeal create needs Stage/Status reference binds with no registered reference data source (Phase 163). |
| Portfolio Boarding | disabled | Phase 140 schema/derivations exist; `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` defaults to false. |
| CRM Onboarding | disabled | CRM schema plan + persistence adapter exist; `CRM_LIVE_PERSISTENCE_ENABLED` defaults to false. |
| Security / Dataverse Roles | preview | App-level entitlements only; Microsoft/Dataverse security roles cannot be granted in-app and must be assigned in the Power Platform admin center. |

## Existing vs Missing Write Paths (investigation result)

- App-level user / entitlement tables: registered read data sources exist
  (`cr664_platformusers`, `cr664_workspaceentitlementses`,
  `cr664_losuserprofiles`, `cr664_bankers`). A governed, audited write
  path for app-level entitlements is NOT yet wired -- Phase 169B will add
  one only where an existing Dataverse service safely supports it.
- New Deal create: write path exists in the generated SDK but is blocked
  by the missing Stage/Status reference data source (Phase 163). Not used.
- Portfolio boarding persistence adapter: present but disabled by default.
- CRM persistence adapter: present but disabled by default.
- Platform / Dataverse security-role assignment: NO in-app governed API.
  Out of scope; handled in the Power Platform admin center.

No live write path is enabled by this phase.

## Guardrails Honored

- No Dataverse security bypass; no platform security-role assignment.
- App-level entitlement management is explicitly distinguished from
  platform security-role assignment in the UI disclaimer.
- No fake users, deals, portfolio loans, or CRM records (the console is a
  static status model; it renders no fabricated records).
- + New Deal not enabled; the New Deal Intake card stays blocked.
- No hardcoded Dataverse GUIDs.
- No permission widening.
- No external HTTP / fetch / Graph calls (pinned by source tests).
- No CRM / Copilot live connector enabled.
- No bulk import.
- Every (future) write must be permission-gated, audited, fail-closed,
  typed-outcome, and tested -- none are enabled here.

## Route Delta

0. The console is a rendering surface inside the existing
`/workspaces/admin` route. No router file changed; no new route added.

## Files Changed

- `src/admin/adminOperationsConsoleModel.ts` -- status model + access
  helper (no side effects, no network).
- `src/admin/AdminOperationsConsole.tsx` -- read-only console component.
- `src/workspaces/AdminWorkspace.tsx` -- mounts the console at the top of
  the admin workspace.
- `src/admin/adminOperationsConsoleModel.test.ts` -- model + access tests.
- `src/admin/AdminOperationsConsole.test.tsx` -- component tests.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- doc pin.
- `docs/PHASE_169A_ADMIN_OPERATIONS_CONSOLE.md` -- this doc.

Note: the model file is named `adminOperationsConsoleModel.ts` (not
`adminOperationsConsole.ts`) to avoid a case-insensitive filename
collision with the `AdminOperationsConsole.tsx` component on Windows.

## Tests

Model (`adminOperationsConsoleModel.test.ts`):
- `isAdminConsoleAuthorized` authorizes only the admin route; denies
  banker/manager/team/executive, undefined, and empty.
- Exactly five modules, in order, all with `liveWriteEnabledHere: false`.
- Each module has a status line, blocker, and next step.
- New Deal pinned blocked by Stage/Status (Phase 163).
- Portfolio + CRM pinned adapter-disabled by default.
- Security pinned app-level-only with Power Platform admin center handoff.
- No fetch / XHR / Graph / Dataverse write primitives in the model.

Component (`AdminOperationsConsole.test.tsx`):
- Admin sees the console + all five cards + the heading.
- Disclaimer shows app-level-only + Power Platform admin center handoff.
- Honest blocker/next-step copy renders.
- Every button is disabled (aria-disabled); exactly five placeholders.
- Write-attribution reason surfaces when no systemuser is provisioned.
- No fabricated record copy.
- Non-admin (banker route) is denied; no cards; no actions.
- Missing route fails closed with the access alert.
- Source discipline: no fetch / XHR / Graph / Dataverse write; no
  cross-role imports.

## Validation

- `npm test -- Admin admin releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Release / Deploy

No deploy in this phase. The V1.0 controlled pilot tag remains
`v1.0.0-controlled-pilot` at `faf26d6`; it is not moved. Deploying the
console to the environment is a later step (Phase 169F) after the read-
only shell is reviewed.
